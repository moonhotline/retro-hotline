import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { cameraPosition, positionWorld, smoothstep } from 'three/tsl'
import {
  AmbientLight, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Fog, GridHelper, Group,
  LineBasicMaterial, LineBasicNodeMaterial,
  LineSegments, MathUtils, Mesh, MeshStandardMaterial, PerspectiveCamera, PointLight, Raycaster,
  Scene, SphereGeometry, Vector2, Vector3, WebGPURenderer, type Object3D, type Texture,
} from 'three/webgpu'
import type { SceneObject, Sky, Transform } from './document'
import type { ModelAsset, ModelStats } from './modelAsset'
import { createPlaySession, type PlayEvent } from './playSession'
import { loadSkyTexture } from './skybox'

export type TransformMode = 'translate' | 'rotate' | 'scale'

function lineGeometry(segments: number[][]) {
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(segments.flat(), 3))
}

function gridLines(divisions: number, center: number, line: number, near: number, far: number) {
  const helper = new GridHelper(200, divisions, center, line)
  helper.material.dispose()
  const material = new LineBasicNodeMaterial({
    vertexColors: true, toneMapped: false, transparent: true, depthWrite: false,
  })
  material.opacityNode = smoothstep(near, far, positionWorld.sub(cameraPosition).length()).oneMinus()
  helper.material = material
  return helper
}

function cameraMark(fov: number, aspect: number) {
  const depth = 1.48
  const h = depth * Math.tan(MathUtils.degToRad(fov / 2))
  const w = h * Math.min(2.5, Math.max(0.6, aspect))
  const corners = [[-w, -h, -depth], [w, -h, -depth], [w, h, -depth], [-w, h, -depth]]
  const segments = corners.flatMap((corner, i) => [[0, 0, 0, ...corner], [...corner, ...corners[(i + 1) % 4]!]])
  segments.push([-w * 0.3, h, -depth, 0, h * 1.38, -depth], [0, h * 1.38, -depth, w * 0.3, h, -depth])
  return lineGeometry(segments)
}

function lightMark(directional: boolean) {
  const segments = [[-0.28, 0, 0, 0, 0.28, 0], [0, 0.28, 0, 0.28, 0, 0],
    [0.28, 0, 0, 0, -0.28, 0], [0, -0.28, 0, -0.28, 0, 0]]
  for (let i = 0; i < 8; i++) {
    const x = Math.cos(i * Math.PI / 4)
    const y = Math.sin(i * Math.PI / 4)
    segments.push([0.36 * x, 0.36 * y, 0, 0.52 * x, 0.52 * y, 0])
  }
  if (directional) segments.push([0, 0, 0, 0, 0, -1.35], [0, 0, -1.35, 0, 0.16, -1.02], [0, 0, -1.35, 0, -0.16, -1.02])
  return lineGeometry(segments)
}

function createActor(object: SceneObject) {
  const root = new Group()
  const markColor = object.kind === 'camera' ? 0x34618a : 0xa06524
  const marker = object.kind === 'camera' || object.kind === 'directional' || object.kind === 'point' ? new LineSegments(
    object.kind === 'camera' ? cameraMark(object.fov, 1.65) : lightMark(object.kind === 'directional'),
    new LineBasicMaterial({ color: markColor, depthTest: false, toneMapped: false }),
  ) : null
  const camera = object.kind === 'camera' ? new PerspectiveCamera(object.fov, 1, 0.1, 220) : null
  const light = object.kind === 'directional' ? new DirectionalLight() : object.kind === 'point' ? new PointLight() : null
  const mesh = object.kind === 'sphere' ? new Mesh(
    new SphereGeometry(0.8, 96, 64), new MeshStandardMaterial({ color: 0x9caab6, roughness: 0.43 }),
  ) : null
  root.name = object.name
  root.userData.editorId = object.id
  if (marker) {
    marker.renderOrder = 2
    root.add(marker)
  }
  if (light) root.add(light)
  if (light instanceof DirectionalLight) {
    light.target.position.set(0, 0, -1)
    root.add(light.target)
  }
  if (mesh) root.add(mesh)

  return {
    root, marker, camera, mesh, asset: undefined as ModelAsset | undefined,
    loading: new AbortController(),
    sync(data: SceneObject, selected: boolean, aspect: number) {
      root.name = data.name
      root.position.fromArray(data.position)
      root.rotation.set(...data.rotation.map(MathUtils.degToRad) as [number, number, number])
      root.scale.fromArray(data.scale)
      if (camera && data.kind === 'camera') {
        camera.position.copy(root.position)
        camera.quaternion.copy(root.quaternion)
        if (camera.fov !== data.fov || camera.aspect !== aspect) {
          camera.fov = data.fov
          camera.aspect = aspect
          camera.updateProjectionMatrix()
          marker?.geometry.dispose()
          if (marker) marker.geometry = cameraMark(data.fov, aspect)
        }
      }
      if (light && (data.kind === 'point' || data.kind === 'directional')) {
        light.color.set(data.color)
        light.intensity = data.intensity
      }
      marker?.material.color.set(selected ? 0x2566aa : markColor)
      mesh?.material.emissive.set(selected ? 0x143250 : 0x000000)
    },
    dispose() {
      this.loading.abort()
      this.asset?.dispose()
      marker?.geometry.dispose()
      marker?.material.dispose()
      mesh?.geometry.dispose()
      mesh?.material.dispose()
      light?.dispose()
      root.removeFromParent()
    },
  }
}

export type AssetEvent =
  | { type: 'loading' | 'disposed'; id: string }
  | { type: 'ready'; id: string; stats: ModelStats }
  | { type: 'error'; id: string; message: string }

interface ViewportEvents {
  select: (id: string | null) => void
  transform: (id: string, transform: Transform) => void
  error: (error: unknown) => void
  asset: (event: AssetEvent) => void
  play: (event: PlayEvent) => void
  skyError: (message: string) => void
}

export function createViewport(host: HTMLDivElement, compass: SVGSVGElement, forceWebGL: boolean, events: ViewportEvents) {
  const canvas = document.createElement('canvas')
  canvas.className = 'world'
  canvas.setAttribute('aria-label', '三维场景视口')
  canvas.tabIndex = 0
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL })
  const scene = new Scene()
  scene.background = new Color(0xeef1f4)
  scene.fog = new Fog(0xeef1f4, 40, 102)
  scene.add(new AmbientLight(0xe8edf5, 0.75))

  const grid = new Group()
  grid.add(gridLines(200, 0xffffff, 0xffffff, 10, 36))
  const major = gridLines(40, 0xb6c2cd, 0xcbd3db, 18, 68)
  major.position.y = 0.004
  grid.add(major)
  const axes = [
    new LineSegments(lineGeometry([[-100, 0.009, 0, 100, 0.009, 0]]), new LineBasicMaterial({ color: 0xe19891 })),
    new LineSegments(lineGeometry([[0, 0.009, -100, 0, 0.009, 100]]), new LineBasicMaterial({ color: 0x92aee8 })),
    new LineSegments(lineGeometry([[0, 0, 0, 0, 2, 0]]), new LineBasicMaterial({ color: 0x83b098 })),
  ]
  grid.add(...axes)
  scene.add(grid)

  const view = new PerspectiveCamera(44, 1, 0.1, 250)
  const follow = new PerspectiveCamera(47, 1, 0.1, 250)
  const orbit = new OrbitControls(view, canvas)
  orbit.maxPolarAngle = Math.PI * 0.51
  orbit.minDistance = 0.8
  orbit.maxDistance = 125
  const transform = new TransformControls(view, canvas)
  transform.setSize(0.86)
  scene.add(transform.getHelper())
  const actors = new Map<string, ReturnType<typeof createActor>>()
  const raycaster = new Raycaster()
  raycaster.params.Line = { threshold: 0.24 }
  let model: SceneObject[] = []
  let selected: string | null = null
  let preview: string | null = null
  let pressed: Vector2 | null = null
  let initialized = false
  let closed = false
  let frame = 0
  let aspect = 1
  let skyAbort: AbortController | undefined
  let skyTexture: Texture | null = null
  let play: ReturnType<typeof createPlaySession> | null = null
  let playId: string | null = null
  let clipPreview: ModelAsset | null = null
  let lastFrame: number | null = null
  const compassAxes = Array.from(compass.querySelectorAll('g')).map((group, index) => {
    const direction = new Vector3().setComponent(index, 1)
    return { direction, line: group.querySelector('line')!, label: group.querySelector('text')! }
  })
  const direction = new Vector3()

  function invalidate() {
    if (closed || !initialized || frame) return
    frame = requestAnimationFrame(now => {
      frame = 0
      try {
        const dt = lastFrame === null ? 0 : Math.min(0.05, (now - lastFrame) / 1000)
        const running = play?.advance(dt) ?? false
        clipPreview?.pose(dt)
        const camera = preview ? actors.get(preview)?.camera : null
        renderer.render(scene, play ? follow : camera ?? view)
        lastFrame = running || clipPreview ? now : null
        if (lastFrame !== null) invalidate()
      } catch (error) {
        events.error(error)
      }
    })
  }

  function loadActor(object: SceneObject, actor: ReturnType<typeof createActor>) {
    events.asset({ type: 'loading', id: object.id })
    void import('./modelAsset').then(({ loadModelAsset }) => loadModelAsset(
      object.id, object.kind === 'npc', actor.loading.signal,
    )).then(asset => {
      if (actor.loading.signal.aborted) {
        asset.dispose()
        return
      }
      actor.asset = asset
      actor.root.add(asset.root)
      if (object.kind === 'npc') {
        asset.play('Idle_Loop', false, 0)
        asset.pose(0.001)
      }
      events.asset({ type: 'ready', id: object.id, stats: asset.stats })
      invalidate()
    }).catch(error => {
      if (!actor.loading.signal.aborted) events.asset({ type: 'error', id: object.id, message: error instanceof Error ? error.message : String(error) })
    })
  }

  function stopClip() {
    if (!clipPreview) return
    const actor = Array.from(actors.values()).find(item => item.asset === clipPreview)
    clipPreview.stop()
    if (actor?.root.userData.kind === 'npc') {
      clipPreview.play('Idle_Loop', false, 0)
      clipPreview.pose(0.001)
    }
    clipPreview = null
    lastFrame = null
    invalidate()
  }

  function sync() {
    const live = new Set(model.map(object => object.id))
    for (const [id, actor] of actors) {
      if (live.has(id)) continue
      if (transform.object === actor.root) transform.detach()
      if (clipPreview && clipPreview === actor.asset) stopClip()
      actor.dispose()
      actors.delete(id)
      if (actor.root.userData.kind === 'model' || actor.root.userData.kind === 'npc') events.asset({ type: 'disposed', id })
    }

    for (const object of model) {
      let actor = actors.get(object.id)
      if (!actor) {
        actor = createActor(object)
        actors.set(object.id, actor)
        scene.add(actor.root)
        actor.root.userData.kind = object.kind
        if (object.kind === 'model' || object.kind === 'npc') loadActor(object, actor)
      }
      if (object.id !== playId) actor.sync(object, selected === object.id, aspect)
      if (actor.marker) actor.marker.visible = preview === null && !play
    }
    grid.visible = preview === null
    for (const axis of axes) axis.visible = !play
    orbit.enabled = preview === null && !play && !transform.dragging
    const active = selected && !preview && !play ? actors.get(selected)?.root : null
    if (active && transform.object !== active) transform.attach(active)
    if (!active && transform.object) transform.detach()
    invalidate()
  }

  function resize() {
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    aspect = width / height
    view.aspect = aspect
    view.updateProjectionMatrix()
    follow.aspect = aspect
    follow.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    sync()
  }

  function resetView() {
    orbit.target.set(0, 1.4, 0)
    view.position.set(10.6, 8.6, 13.2)
    orbit.update()
    invalidate()
  }

  orbit.addEventListener('change', () => {
    view.updateMatrixWorld()
    for (const axis of compassAxes) {
      direction.copy(axis.direction).transformDirection(view.matrixWorldInverse)
      axis.line.setAttribute('x2', String(44 + direction.x * 25))
      axis.line.setAttribute('y2', String(44 - direction.y * 25))
      axis.label.setAttribute('x', String(44 + direction.x * 34))
      axis.label.setAttribute('y', String(44 - direction.y * 34))
    }
    invalidate()
  })
  resetView()
  transform.addEventListener('change', invalidate)
  transform.addEventListener('dragging-changed', () => {
    orbit.enabled = preview === null && !play && !transform.dragging
  })
  transform.addEventListener('objectChange', () => {
    const actor = transform.object
    if (!actor || !selected) return
    actor.scale.max(new Vector3(0.01, 0.01, 0.01))
    events.transform(selected, {
      position: actor.position.toArray(),
      rotation: [actor.rotation.x, actor.rotation.y, actor.rotation.z].map(MathUtils.radToDeg) as Transform['rotation'],
      scale: actor.scale.toArray(),
    })
  })

  canvas.addEventListener('pointerdown', event => {
    if (event.button === 0 && !transform.dragging && !preview && !play) pressed = new Vector2(event.clientX, event.clientY)
  })
  canvas.addEventListener('pointercancel', () => { pressed = null })
  canvas.addEventListener('pointerup', event => {
    const start = pressed
    pressed = null
    if (!start || event.button !== 0 || preview || play || start.distanceTo(new Vector2(event.clientX, event.clientY)) > 5) return
    const bounds = canvas.getBoundingClientRect()
    raycaster.setFromCamera(new Vector2(
      (event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1,
    ), view)
    const pickable = Array.from(actors.values()).flatMap<Object3D>(actor => actor.mesh ?? actor.marker ?? actor.asset?.root ?? [])
    let hit = raycaster.intersectObjects(pickable, true)[0]?.object
    while (hit && !hit.userData.editorId) hit = hit.parent ?? undefined
    events.select(hit?.userData.editorId ?? null)
  })

  const observer = new ResizeObserver(resize)
  const ready = renderer.init().then(() => {
    initialized = true
    if (closed) {
      renderer.dispose()
      return null
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
    host.append(canvas)
    observer.observe(host)
    resize()
    return 'isWebGPUBackend' in renderer.backend ? 'WebGPU' : 'WebGL2'
  })

  return {
    ready,
    update(objects: SceneObject[], selection: string | null, mode: TransformMode, cameraPreview: string | null) {
      model = objects
      if (selection !== selected) stopClip()
      selected = selection
      preview = cameraPreview
      transform.setMode(mode)
      sync()
    },
    setSky(sky: Sky) {
      skyAbort?.abort()
      const request = new AbortController()
      skyAbort = request
      events.skyError('')
      void loadSkyTexture(sky, request.signal).then(texture => {
        if (request.signal.aborted) {
          texture?.dispose()
          return
        }
        const background = new Color(sky.kind === 'night' ? 0x3b526c : sky.kind === 'day' ? 0xc9dfe9 : 0xeef1f4)
        const previous = skyTexture
        skyTexture = texture
        scene.background = texture ?? background
        scene.fog = new Fog(background, 40, 102)
        previous?.dispose()
        invalidate()
      }).catch(error => {
        if (!request.signal.aborted) events.skyError(error instanceof Error ? error.message : String(error))
      })
    },
    previewClip(id: string, clip: string) {
      stopClip()
      const asset = actors.get(id)?.asset
      if (play || !clip || !asset) return
      clipPreview = asset
      asset.play(clip, false, 0)
      invalidate()
    },
    playtest(id: string) {
      const object = model.find(item => item.id === id)
      const actor = actors.get(id)
      if (play || !actor?.asset || object?.kind !== 'npc') return
      stopClip()
      playId = id
      play = createPlaySession(id, actor.root, actor.asset, follow, object.speed, event => {
        if (event.type === 'exit') {
          play = null
          playId = null
          if (!closed) sync()
        }
        if (!closed) {
          if (event.type !== 'action') lastFrame = null
          events.play(event)
          invalidate()
        }
      })
      sync()
      canvas.focus()
      play.enter()
    },
    pausePlay() { play?.pause() },
    resumePlay() { canvas.focus(); play?.resume() },
    exitPlay() { play?.exit() },
    resetView,
    frameSelection() {
      const actor = selected ? actors.get(selected) : undefined
      if (!actor) return
      const target = actor.root.position.clone()
      const size = actor.asset?.stats.size
      if (size) target.y += size[1] * actor.root.scale.y * 0.5
      const distance = size ? Math.max(2.5, Math.hypot(...size) * actor.root.scale.length()) : 6
      const direction = view.position.clone().sub(orbit.target).setLength(distance)
      orbit.target.copy(target)
      view.position.copy(target).add(direction)
      orbit.update()
      invalidate()
    },
    dispose() {
      closed = true
      play?.exit()
      stopClip()
      skyAbort?.abort()
      skyTexture?.dispose()
      observer.disconnect()
      cancelAnimationFrame(frame)
      transform.detach()
      transform.dispose()
      orbit.dispose()
      actors.forEach(actor => actor.dispose())
      grid.children.forEach(object => {
        if (object instanceof LineSegments) {
          object.geometry.dispose()
          object.material.dispose()
        }
      })
      if (initialized) renderer.dispose()
      canvas.remove()
    },
  }
}
