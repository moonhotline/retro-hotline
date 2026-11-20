import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { buildIndustrialPulseRifle, type IndustrialRifleRig } from '../game/models/pulseRifle'
import { countModelStats } from '../game/models/geometry'
import { createSynthwaveGradePass } from '../game/postprocess'
import './NightGarage.css'

export type GarageModelId = 'rifle' | 'car'
export type GarageCameraPreset = 'fp_idle' | 'three_quarter' | 'car_front' | 'car_rear' | 'car_side'
export type GarageLightingMode = 'neutral' | 'neon'

interface NightGarageProps {
  onBack: () => void
  initialModel?: GarageModelId
  buildCarModel?: () => {
    group: THREE.Group
    headlights: THREE.Object3D[]
    setHeadlightsOn: (on: boolean) => void
  }
}

interface GarageStats {
  triangles: number
  drawCalls: number
  p95Ms: number
  webgl2: boolean
}

const RIFLE_BASELINE_TRIS = 60

export function NightGarage({ onBack, initialModel = 'rifle', buildCarModel }: NightGarageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [model, setModel] = useState<GarageModelId>(initialModel)
  const [preset, setPreset] = useState<GarageCameraPreset>(initialModel === 'car' ? 'car_front' : 'three_quarter')
  const [lighting, setLighting] = useState<GarageLightingMode>('neon')
  const [bloomOn, setBloomOn] = useState(true)
  const [headlightsOn, setHeadlightsOn] = useState(true)
  const [stats, setStats] = useState<GarageStats>({ triangles: 0, drawCalls: 0, p95Ms: 0, webgl2: true })

  const stateRef = useRef({
    model,
    preset,
    lighting,
    bloomOn,
    headlightsOn,
    fireKick: 0,
    presetDirty: true,
  })
  stateRef.current.model = model
  stateRef.current.lighting = lighting
  stateRef.current.bloomOn = bloomOn
  stateRef.current.headlightsOn = headlightsOn

  const selectPreset = (next: GarageCameraPreset) => {
    setPreset(next)
    stateRef.current.preset = next
    stateRef.current.presetDirty = true
  }

  const selectModel = (next: GarageModelId) => {
    setModel(next)
    const nextPreset: GarageCameraPreset = next === 'car' ? 'car_front' : 'three_quarter'
    setPreset(nextPreset)
    stateRef.current.model = next
    stateRef.current.preset = nextPreset
    stateRef.current.presetDirty = true
  }

  const triggerTestFire = () => {
    stateRef.current.fireKick = 1
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const w = host.clientWidth || 1280
    const h = host.clientHeight || 720
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.setSize(w, h)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    host.appendChild(renderer.domElement)

    const webgl2 = renderer.capabilities.isWebGL2
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x070b15)
    scene.fog = new THREE.FogExp2(0x070b15, 0.045)

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.04, 120)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 0.35
    controls.maxDistance = 14

    // Post-processing composer (identical Bloom ON / OFF toggle under same camera & lights)
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.45, 0.72)
    composer.addPass(bloomPass)
    const gradePass = createSynthwaveGradePass()
    composer.addPass(gradePass)
    composer.addPass(new OutputPass())

    // Sleek reflective studio floor with subtle circular turntable grid
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b1120,
      roughness: 0.24,
      metalness: 0.72,
    })
    const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 64).rotateX(-Math.PI / 2), floorMat)
    floor.position.y = -0.35
    scene.add(floor)

    const ringGeo = new THREE.RingGeometry(1.15, 1.18, 72).rotateX(-Math.PI / 2)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x29e3ff, transparent: true, opacity: 0.28 })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.y = -0.345
    scene.add(ring)

    // Dual Lighting Rigs: Neutral Calibration Studio vs Neon Street
    const hemi = new THREE.HemisphereLight(0xdce8ff, 0x182032, 1.15)
    scene.add(hemi)

    const keyLight = new THREE.DirectionalLight(0xf2f7ff, 2.6)
    keyLight.position.set(2.8, 4.2, 3.4)
    scene.add(keyLight)

    const rimLight = new THREE.DirectionalLight(0xff2e88, 1.8)
    rimLight.position.set(-3.4, 2.4, -3.2)
    scene.add(rimLight)

    const fillLight = new THREE.DirectionalLight(0x2ae4ff, 0.9)
    fillLight.position.set(-2.5, 1.4, 2.8)
    scene.add(fillLight)

    // Build industrial models
    const rifleRig: IndustrialRifleRig = buildIndustrialPulseRifle()
    scene.add(rifleRig.group)

    // Short optical muzzle flash for test-fire verification
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0x62f4ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.065, 18, 14), flashMat)
    muzzleFlash.scale.set(0.7, 0.7, 2.2)
    muzzleFlash.position.copy(rifleRig.muzzlePoint)
    rifleRig.group.add(muzzleFlash)

    const carRig = buildCarModel ? buildCarModel() : null
    if (carRig) {
      carRig.group.position.y = -0.35
      carRig.group.visible = false
      scene.add(carRig.group)
    }

    const rifleStats = countModelStats(rifleRig.group)
    const carStats = carRig ? countModelStats(carRig.group) : null

    const applyPresetCamera = (p: GarageCameraPreset) => {
      if (p === 'fp_idle') {
        camera.fov = 62
        camera.position.set(-0.34, 0.25, 0.62)
        controls.target.set(0.02, 0.04, -0.32)
      } else if (p === 'three_quarter') {
        camera.fov = 38
        camera.position.set(-0.88, 0.34, 0.72)
        controls.target.set(0, 0.01, -0.14)
      } else if (p === 'car_front') {
        camera.fov = 40
        camera.position.set(3.8, 1.35, 4.4)
        controls.target.set(0, 0.25, 0)
      } else if (p === 'car_rear') {
        camera.fov = 40
        camera.position.set(-3.8, 1.35, -4.4)
        controls.target.set(0, 0.25, 0)
      } else {
        camera.fov = 34
        camera.position.set(5.8, 0.65, 0)
        controls.target.set(0, 0.22, 0)
      }
      camera.updateProjectionMatrix()
      controls.update()
    }

    applyPresetCamera(stateRef.current.preset)

    const frameTimes: number[] = []
    let lastTime = performance.now()
    let lastTelemetry = 0
    let raf = 0

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      frameTimes.push(now - lastTime)
      if (frameTimes.length > 90) frameTimes.shift()
      lastTime = now

      const st = stateRef.current
      if (st.presetDirty) {
        st.presetDirty = false
        applyPresetCamera(st.preset)
      }

      const showCar = st.model === 'car' && Boolean(carRig)
      rifleRig.group.visible = !showCar
      if (carRig) {
        carRig.group.visible = showCar
        carRig.setHeadlightsOn(st.headlightsOn)
      }

      // Lighting mode calibration
      if (st.lighting === 'neutral') {
        scene.background = new THREE.Color(0x161a22)
        hemi.color.setHex(0xffffff)
        hemi.groundColor.setHex(0x2c323e)
        hemi.intensity = 1.45
        keyLight.color.setHex(0xffffff)
        keyLight.intensity = 2.6
        rimLight.color.setHex(0xd8e2f2)
        rimLight.intensity = 1.15
        fillLight.color.setHex(0xe8eef8)
        fillLight.intensity = 0.85
        gradePass.uniforms['uIntensity']!.value = 0.0
      } else {
        scene.background = new THREE.Color(0x070b15)
        hemi.color.setHex(0x9ec8ff)
        hemi.groundColor.setHex(0x140c24)
        hemi.intensity = 1.15
        keyLight.color.setHex(0xeaf6ff)
        keyLight.intensity = 2.65
        rimLight.color.setHex(0xff2e88)
        rimLight.intensity = 2.1
        fillLight.color.setHex(0x24e4ff)
        fillLight.intensity = 1.05
        gradePass.uniforms['uIntensity']!.value = 1.0
      }

      bloomPass.enabled = st.bloomOn
      bloomPass.strength = st.bloomOn ? 0.34 : 0
      gradePass.uniforms['uTime']!.value = now * 0.001

      // First-person test-fire bolt displacement & crisp optical muzzle pulse
      if (st.fireKick > 0) {
        st.fireKick = Math.max(0, st.fireKick - dt * 5.8)
        const k = Math.sin(st.fireKick * Math.PI)
        rifleRig.group.position.z = k * 0.048
        rifleRig.group.rotation.x = k * 0.055
        rifleRig.boltGroup.position.z = k * 0.075
        flashMat.opacity = st.fireKick > 0.65 ? (st.fireKick - 0.65) * 2.8 : 0
        rifleRig.coreMaterial.emissiveIntensity = 1.45 + k * 1.4
      } else {
        rifleRig.group.position.z = 0
        rifleRig.group.rotation.x = 0
        rifleRig.boltGroup.position.z = 0
        flashMat.opacity = 0
        rifleRig.coreMaterial.emissiveIntensity = 1.45
      }

      controls.update()
      composer.render()

      if (now - lastTelemetry > 250) {
        lastTelemetry = now
        const sorted = [...frameTimes].sort((a, b) => a - b)
        const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]! : 0
        setStats({
          triangles: showCar && carStats ? carStats.triangles : rifleStats.triangles,
          drawCalls: renderer.info.render.calls,
          p95Ms: Math.round(p95 * 10) / 10,
          webgl2,
        })
      }

      raf = requestAnimationFrame(render)
    }

    const onResize = () => {
      const nw = host.clientWidth || 1280
      const nh = host.clientHeight || 720
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
      renderer.setSize(nw, nh)
      composer.setSize(nw, nh)
    }
    window.addEventListener('resize', onResize)
    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      composer.dispose()
      renderer.dispose()
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement)
    }
  }, [buildCarModel])

  return (
    <section className="night-garage" aria-label="Night Garage Model Showcase">
      <div ref={hostRef} className="night-garage-canvas" />

      <header className="night-garage-header">
        <div>
          <span className="garage-kicker">RETRO HOTLINE · NIGHT GARAGE</span>
          <h1 className="font-orbitron">ROUTE B INDUSTRIAL LAB</h1>
        </div>
        <button type="button" className="console-secondary" onClick={onBack}>
          <span aria-hidden="true">○</span> BACK TO HUB
        </button>
      </header>

      <aside className="night-garage-telemetry" aria-label="Model Telemetry">
        <div><dt>TRIANGLES</dt><dd>{stats.triangles.toLocaleString()}</dd></div>
        <div><dt>BEFORE</dt><dd>{RIFLE_BASELINE_TRIS} TRIS</dd></div>
        <div><dt>DRAW CALLS</dt><dd>{stats.drawCalls}</dd></div>
        <div><dt>P95 FRAME</dt><dd>{stats.p95Ms.toFixed(1)} ms</dd></div>
        <div><dt>RENDERER</dt><dd>{stats.webgl2 ? 'WEBGL 2' : 'WEBGL 1'}</dd></div>
      </aside>

      <footer className="night-garage-controls">
        <div className="garage-group">
          <button
            type="button"
            className={model === 'rifle' ? 'garage-pill is-active' : 'garage-pill'}
            onClick={() => selectModel('rifle')}
          >
            PULSE RIFLE MK-IV
          </button>
          {buildCarModel && (
            <button
              type="button"
              className={model === 'car' ? 'garage-pill is-active' : 'garage-pill'}
              onClick={() => selectModel('car')}
            >
              NEON GT COUPE
            </button>
          )}
        </div>

        <div className="garage-group">
          {model === 'rifle' ? (
            <>
              <button type="button" className={preset === 'fp_idle' ? 'garage-pill is-active' : 'garage-pill'} onClick={() => selectPreset('fp_idle')}>
                1ST PERSON IDLE
              </button>
              <button type="button" className={preset === 'three_quarter' ? 'garage-pill is-active' : 'garage-pill'} onClick={() => selectPreset('three_quarter')}>
                3/4 STUDIO
              </button>
              <button type="button" className="garage-pill garage-action" onClick={triggerTestFire}>
                TEST FIRE
              </button>
            </>
          ) : (
            <>
              <button type="button" className={preset === 'car_front' ? 'garage-pill is-active' : 'garage-pill'} onClick={() => selectPreset('car_front')}>
                FRONT 3/4
              </button>
              <button type="button" className={preset === 'car_rear' ? 'garage-pill is-active' : 'garage-pill'} onClick={() => selectPreset('car_rear')}>
                REAR 3/4
              </button>
              <button type="button" className={preset === 'car_side' ? 'garage-pill is-active' : 'garage-pill'} onClick={() => selectPreset('car_side')}>
                SIDE PROFILE
              </button>
              <button type="button" className={headlightsOn ? 'garage-pill is-active' : 'garage-pill'} onClick={() => setHeadlightsOn((v) => !v)}>
                LIGHTS: {headlightsOn ? 'ON' : 'OFF'}
              </button>
            </>
          )}
        </div>

        <div className="garage-group">
          <button
            type="button"
            className={lighting === 'neutral' ? 'garage-pill is-active' : 'garage-pill'}
            onClick={() => setLighting((v) => (v === 'neutral' ? 'neon' : 'neutral'))}
          >
            LIGHT: {lighting === 'neutral' ? 'NEUTRAL STUDIO' : 'NEON STREET'}
          </button>
          <button
            type="button"
            className={bloomOn ? 'garage-pill is-active' : 'garage-pill'}
            onClick={() => setBloomOn((v) => !v)}
          >
            BLOOM: {bloomOn ? 'ON' : 'OFF'}
          </button>
        </div>
      </footer>
    </section>
  )
}
