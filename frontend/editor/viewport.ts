import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import {
  AmbientLight, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Fog, GridHelper, Group, LineBasicMaterial,
  LineSegments, MathUtils, Mesh, MeshStandardMaterial, PerspectiveCamera, PointLight, Raycaster,
  Scene, SphereGeometry, Vector2, Vector3, WebGPURenderer,
} from 'three/webgpu'
import type { SceneObject, Transform } from './document'

export type TransformMode = 'translate' | 'rotate' | 'scale'

function lineGeometry(segments: number[][]) {
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(segments.flat(), 3))
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
  const marker = object.kind === 'sphere' ? null : new LineSegments(
    object.kind === 'camera' ? cameraMark(object.fov, 1.65) : lightMark(object.kind === 'directional'),
    new LineBasicMaterial({ color: markColor, depthTest: false, toneMapped: false }),
  )
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
    root, marker, camera, mesh,
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
      marker?.geometry.dispose()
      marker?.material.dispose()
      mesh?.geometry.dispose()
      mesh?.material.dispose()
      light?.dispose()
      root.removeFromParent()
    },
  }
}

interface ViewportEvents {
  select: (id: string | null) => void
  transform: (id: string, transform: Transform) => void
  error: (error: unknown) => void
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
  grid.add(new GridHelper(200, 200, 0xffffff, 0xffffff))
  const major = new GridHelper(200, 40, 0xb6c2cd, 0xcbd3db)
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
  const compassAxes = Array.from(compass.querySelectorAll('g')).map((group, index) => {
    const direction = new Vector3().setComponent(index, 1)
    return { direction, line: group.querySelector('line')!, label: group.querySelector('text')! }
  })
  const direction = new Vector3()

  function invalidate() {
    if (closed || !initialized || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      try {
        const camera = preview ? actors.get(preview)?.camera : null
        renderer.render(scene, camera ?? view)
      } catch (error) {
        events.error(error)
      }
    })
  }

  function sync() {
    const live = new Set(model.map(object => object.id))
    for (const [id, actor] of actors) {
      if (live.has(id)) continue
      if (transform.object === actor.root) transform.detach()
      actor.dispose()
      actors.delete(id)
    }

    for (const object of model) {
      let actor = actors.get(object.id)
      if (!actor) {
        actor = createActor(object)
        actors.set(object.id, actor)
        scene.add(actor.root)
      }
      actor.sync(object, selected === object.id, aspect)
      if (actor.marker) actor.marker.visible = preview === null
    }
    grid.visible = preview === null
    orbit.enabled = preview === null && !transform.dragging
    const active = selected && !preview ? actors.get(selected)?.root : null
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
    orbit.enabled = preview === null && !transform.dragging
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
    if (event.button === 0 && !transform.dragging && !preview) pressed = new Vector2(event.clientX, event.clientY)
  })
  canvas.addEventListener('pointercancel', () => { pressed = null })
  canvas.addEventListener('pointerup', event => {
    const start = pressed
    pressed = null
    if (!start || event.button !== 0 || preview || start.distanceTo(new Vector2(event.clientX, event.clientY)) > 5) return
    const bounds = canvas.getBoundingClientRect()
    raycaster.setFromCamera(new Vector2(
      (event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1,
    ), view)
    const pickable = Array.from(actors.values()).flatMap(actor => actor.mesh ?? actor.marker ?? [])
    const hit = raycaster.intersectObjects(pickable, false)[0]
    events.select(hit?.object.parent?.userData.editorId ?? null)
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
      selected = selection
      preview = cameraPreview
      transform.setMode(mode)
      sync()
    },
    resetView,
    frameSelection() {
      const target = selected ? actors.get(selected)?.root.position : undefined
      if (!target) return
      const direction = view.position.clone().sub(orbit.target).setLength(6)
      orbit.target.copy(target)
      view.position.copy(target).add(direction)
      orbit.update()
      invalidate()
    },
    dispose() {
      closed = true
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
