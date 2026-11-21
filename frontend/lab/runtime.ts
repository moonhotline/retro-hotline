import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ACESFilmicToneMapping, Mesh, NoToneMapping, PMREMGenerator, WebGPURenderer, type RenderTarget, type Texture } from 'three/webgpu'
import { concepts, type ConceptId } from './catalog'
import { createMaterialStudy } from './materialStudy'
import { baseFov, createWhiteSpace } from './spaces'
import { createVolumePass, dockWindow, labWindow } from './volume'

export type Display = 'blank' | 'materials' | ConceptId
export interface LabOptions {
  dev: boolean
  display: Display
  volume: boolean
  scan: boolean
  roughness: number
}

type Stage = ReturnType<typeof createWhiteSpace>

// This method exists in Three r170's WebGPU generator, but its r170 type package omits it.
type EnvironmentGenerator = PMREMGenerator & {
  fromEquirectangular(texture: Texture): RenderTarget
}

export function createRuntime(
  host: HTMLElement,
  forceWebGL: boolean,
  reportTriangles: (amount: number | null) => void,
  reportError: (message: string) => void,
) {
  const canvas = document.createElement('canvas')
  canvas.className = 'world'
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL })
  renderer.shadowMap.enabled = true
  const main = createWhiteSpace()
  const dev = createWhiteSpace()
  let active: Stage = main
  let generator: EnvironmentGenerator | undefined
  let study: ReturnType<typeof createMaterialStudy> | undefined
  let volume: ReturnType<typeof createVolumePass> | undefined
  let orbit: OrbitControls | undefined
  let disposePreview: (() => void) | undefined
  let settings: LabOptions = { dev: false, display: 'blank', volume: true, scan: true, roughness: 0.24 }
  let initialized = false
  let closed = false
  let frame = 0
  let poseRupture: ((elapsed: number) => boolean) | undefined
  let ruptureStart: number | null = null
  let selection = 0
  let lens = baseFov
  let hasVolume = false
  let pendingVolume = false
  let width = 1
  let height = 1

  function paint(now: number) {
    frame = 0
    if (!initialized || closed) return
    try {
      if (ruptureStart !== null && !poseRupture?.((now - ruptureStart) / 1000)) ruptureStart = null
      renderer.toneMapping = disposePreview ? ACESFilmicToneMapping : NoToneMapping
      renderer.render(active.scene, active.camera)
      if (pendingVolume && hasVolume && volume) {
        volume.render(active.camera, active === study ? labWindow : dockWindow)
        pendingVolume = false
      }
      if (ruptureStart !== null || (active === study && settings.scan)) invalidate()
    } catch (error) {
      reportError(error instanceof Error ? error.message : String(error))
    }
  }

  function invalidate() {
    if (initialized && !closed && !frame) frame = requestAnimationFrame(paint)
  }

  function resize() {
    width = Math.max(1, host.clientWidth)
    height = Math.max(1, host.clientHeight)
    const aspect = width / height
    const fit = Math.tan(lens * Math.PI / 360) * Math.max(1, (disposePreview ? 1.48 : 1.28) / aspect)
    active.camera.aspect = aspect
    active.camera.fov = Math.min(115, Math.atan(fit) * 360 / Math.PI)
    active.camera.updateProjectionMatrix()
    if (initialized) renderer.setSize(width, height, false)
    volume?.setSize(width, height)
    pendingVolume = true
    invalidate()
  }

  function syncStudy() {
    if (study) {
      study.scan.value = Number(settings.scan)
      study.roughness.value = settings.roughness
    }
    hasVolume = active === study ? settings.volume :
      active !== main && active !== dev && settings.display === 'docks' && settings.volume
    if (hasVolume && !volume) {
      try {
        volume = createVolumePass()
        host.append(volume.canvas)
        volume.setSize(width, height)
      } catch (error) {
        reportError(error instanceof Error ? error.message : String(error))
      }
    }
    if (volume) {
      if (hasVolume && volume.canvas.hidden) pendingVolume = true
      volume.canvas.hidden = !hasVolume
    }
    invalidate()
  }

  async function setOptions(next: LabOptions) {
    const display = next.dev ? next.display : null
    const previous = settings.dev ? settings.display : null
    settings = next

    if (display !== previous) {
      const revision = ++selection
      ruptureStart = null
      poseRupture = undefined
      orbit?.dispose()
      orbit = undefined
      disposePreview?.()
      disposePreview = undefined
      reportTriangles(null)
      lens = baseFov
      active = next.dev ? dev : main
      if (display === 'materials') {
        study ??= createMaterialStudy()
        active = study
      }
      syncStudy()
      resize()

      const concept = concepts.find(candidate => candidate.id === display)
      if (concept) {
        try {
          const { createConceptStage, loadModel } = await import('./models/conceptStage')
          const factory = await loadModel(concept.id)
          await ready
          if (closed || revision !== selection) return
          const preview = createConceptStage(concept, factory)
          disposePreview = preview.dispose
          generator ??= new PMREMGenerator(renderer) as EnvironmentGenerator
          const filtered = generator.fromEquirectangular(preview.probe)
          preview.scene.environment = filtered.texture
          disposePreview = () => {
            filtered.dispose()
            preview.dispose()
          }
          lens = preview.fov
          active = preview
          poseRupture = preview.poseRupture
          orbit = new OrbitControls(preview.camera, canvas)
          orbit.target.fromArray(concept.target)
          orbit.minDistance = 2
          orbit.maxDistance = 95
          // Concept cameras sit near the ground and look up at the subject.
          // OrbitControls clamps the authored pose on its first update.
          orbit.maxPolarAngle = Math.PI * 0.60
          orbit.enablePan = false
          orbit.addEventListener('change', () => {
            pendingVolume = true
            invalidate()
          })
          orbit.update()
          orbit.saveState()
          reportTriangles(preview.triangles)
          syncStudy()
          resize()
        } catch (error) {
          if (closed || revision !== selection) return
          disposePreview?.()
          disposePreview = undefined
          active = dev
          reportError(error instanceof Error ? error.message : String(error))
        }
      }
      return
    }
    syncStudy()
  }

  const observer = new ResizeObserver(resize)
  const ready = renderer.init().then(() => {
    initialized = true
    if (closed) {
      renderer.dispose()
      return null
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
    host.prepend(canvas)
    observer.observe(host)
    resize()
    return 'isWebGPUBackend' in renderer.backend ? 'WebGPU' : 'WebGL2'
  })

  return {
    ready,
    setOptions,
    resetCamera() { orbit?.reset() },
    playRupture() {
      if (!poseRupture) return
      ruptureStart = performance.now()
      invalidate()
    },
    dispose() {
      closed = true
      observer.disconnect()
      cancelAnimationFrame(frame)
      orbit?.dispose()
      volume?.dispose()
      disposePreview?.()
      if (study) {
        study.scene.traverse(object => {
          if (object instanceof Mesh) {
            object.geometry.dispose()
            if (!Array.isArray(object.material)) object.material.dispose()
          }
        })
      }
      generator?.dispose()
      if (initialized) renderer.dispose()
      canvas.remove()
    },
  }
}
