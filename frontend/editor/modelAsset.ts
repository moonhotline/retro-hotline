import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  AnimationMixer, Box3, LoadingManager, LoopOnce, LoopRepeat, Mesh, SkinnedMesh,
  Texture, Vector3, type AnimationAction, type Object3D, type Skeleton,
} from 'three/webgpu'
import { readAsset } from './assetStore'
import type { XYZ } from './document'

export interface ModelStats {
  triangles: number
  meshes: number
  materials: number
  bones: number
  size: XYZ
  clips: { name: string; duration: number }[]
}

function meshNodes(root: Object3D) {
  const meshes: Mesh[] = []
  root.traverse(node => {
    if (node instanceof Mesh) meshes.push(node)
  })
  return meshes
}

function skeletons(meshes: Mesh[]) {
  return new Set<Skeleton>(meshes.flatMap(mesh => mesh instanceof SkinnedMesh ? [mesh.skeleton] : []))
}

function inspectModel(root: Object3D, scenes: Object3D[], clips: ModelStats['clips']) {
  const meshes = meshNodes(root)
  const allMeshes = scenes.flatMap(meshNodes)
  const geometries = new Set(allMeshes.map(mesh => mesh.geometry))
  const materials = new Set(allMeshes.flatMap(mesh => mesh.material))
  const rigs = skeletons(allMeshes)
  const textures = new Set<Texture>()
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) textures.add(value)
    }
  }
  const images = new Set(Array.from(textures).flatMap(texture => {
    const image: unknown = texture.source.data
    return typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap ? [image] : []
  }))
  const size = new Box3().setFromObject(root).getSize(new Vector3()).toArray()
  const stats: ModelStats = {
    meshes: meshes.length, materials: new Set(meshes.flatMap(mesh => mesh.material)).size,
    bones: new Set(Array.from(skeletons(meshes)).flatMap(skeleton => skeleton.bones)).size, size, clips,
    triangles: meshes.reduce((total, mesh) => total + Math.floor(
      (mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0) / 3), 0),
  }
  return {
    stats,
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const rig of rigs) rig.dispose()
      for (const material of materials) material.dispose()
      for (const texture of textures) texture.dispose()
      for (const image of images) image.close()
    },
  }
}

export async function loadModelAsset(id: string, mannequin: boolean, signal: AbortSignal) {
  // The loader may read object URLs it creates for embedded texture data.
  const manager = new LoadingManager().setURLModifier(url => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url
    throw new Error('请导入内嵌贴图和缓冲数据的 GLB 或 glTF。')
  })
  const file = mannequin ? await fetch('/editor/mannequin.glb', { signal }).then(response => {
    if (!response.ok) throw new Error('试玩角色资源加载失败。')
    return response.arrayBuffer()
  }) : await readAsset(id).then(asset => asset.arrayBuffer())
  signal.throwIfAborted()
  const model = await new GLTFLoader(manager).parseAsync(file, '')
  const asset = inspectModel(model.scene, model.scenes, model.animations.map(clip => ({ name: clip.name, duration: clip.duration })))
  const mixer = new AnimationMixer(model.scene)
  let active: AnimationAction | null = null
  function stop() {
    mixer.stopAllAction()
    active = null
  }

  return {
    root: model.scene,
    stats: asset.stats,
    pose(time: number) { mixer.update(time) },
    play(name: string, once = false, fade = 0.12) {
      const clip = model.animations.find(item => item.name === name)
      if (!clip) return
      const next = mixer.clipAction(clip)
      if (active === next && next.isRunning()) return
      next.reset().setEffectiveWeight(1)
      next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity)
      next.clampWhenFinished = once
      next.play()
      if (active && active !== next) {
        if (fade > 0) next.crossFadeFrom(active, fade, false)
        else active.stop()
      }
      active = next
    },
    stop,
    dispose() {
      stop()
      mixer.uncacheRoot(model.scene)
      asset.dispose()
      model.scene.removeFromParent()
    },
  }
}

export type ModelAsset = Awaited<ReturnType<typeof loadModelAsset>>
