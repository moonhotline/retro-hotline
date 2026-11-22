import {
  ACESFilmicToneMapping, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh,
  MeshBasicMaterial, PerspectiveCamera, PMREMGenerator, PointLight, Scene, Vector3, WebGPURenderer, type RenderTarget, type Texture,
} from 'three/webgpu'
import { skyDome } from '../../lab/models/atmosphere'
import { loadModel } from '../../lab/models/conceptStage'
import { capsule, disposeMeshes, finish } from '../../lab/models/geometry'
import { machine } from '../../lab/models/machines'
import { environment } from '../../lab/models/surfaces'
import { distance, sectors, terminal, zoneDistance } from './map'
import { enemyIds, type EnemyId, type WorldSession } from './session'
import { buildWorldSurfaces, contactShadow, farLandmarks } from './scenery'

type Sector = typeof sectors[number]
type EnvironmentGenerator = PMREMGenerator & { fromEquirectangular(texture: Texture): RenderTarget }

class WorldModels {
  private loaded = new Map<Sector, Group>()
  private queued: Sector | null = null
  private closed = false
  private location = 0
  private delay = 0
  private staticLights: PointLight[] = []
  private lightsBySector = new Map<Sector, PointLight[]>()

  constructor(private scene: Scene, private failure: (message: string) => void) {}

  get lights() { return this.staticLights }
  has(sector: Sector) { return this.loaded.has(sector) }

  allows(z: number) {
    const sector = sectors.find(region => z < region.north - .1 && z > region.south + .1)
    return !sector || this.loaded.has(sector)
  }

  update(z: number, heading: number) {
    if (this.closed) return
    this.location = z
    for (const [sector, root] of this.loaded) {
      if (zoneDistance(z, sector) > 79) {
        this.scene.remove(root)
        disposeMeshes(root)
        this.loaded.delete(sector)
        this.lightsBySector.delete(sector)
        this.refreshLights()
      }
    }
    if (this.queued || performance.now() < this.delay) return
    const candidates = sectors.filter(sector => {
      if (this.loaded.has(sector)) return false
      const ahead = (sector.z - z) * heading > 0
      return zoneDistance(z, sector) <= (ahead ? 51 : 33)
    })
    candidates.sort((a, b) => zoneDistance(z, a) - zoneDistance(z, b))
    const next = candidates[0]
    if (next) void this.load(next)
  }

  private async load(sector: Sector) {
    this.queued = sector
    try {
      const factory = await loadModel(sector.id)
      await new Promise<void>(resolve => {
        if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 220 })
        else setTimeout(resolve, 0)
      })
      if (this.closed || zoneDistance(this.location, sector) > 72) return
      const { root } = factory()
      root.position.set(sector.x, 0, sector.z)
      root.updateMatrixWorld(true)
      const lights: PointLight[] = []
      root.traverse(object => {
        if (object instanceof PointLight) lights.push(object)
      })
      for (const light of lights) {
        light.position.setFromMatrixPosition(light.matrixWorld)
        light.removeFromParent()
      }
      this.scene.add(root)
      this.loaded.set(sector, root)
      this.lightsBySector.set(sector, lights)
      this.refreshLights()
    } catch (error) {
      if (!this.closed) this.failure(error instanceof Error ? error.message : String(error))
    } finally {
      this.queued = null
      this.delay = performance.now() + 140
    }
  }

  private refreshLights() {
    this.staticLights = [...this.lightsBySector.values()].flat()
  }

  dispose() {
    this.closed = true
    for (const root of this.loaded.values()) {
      this.scene.remove(root)
      disposeMeshes(root)
    }
    this.loaded.clear()
    this.lightsBySector.clear()
    this.staticLights = []
  }
}

const fogTones = [
  { z: 0, color: new Color('#2a3b4b') },
  { z: -130, color: new Color('#435363') },
  { z: -238, color: new Color('#223a57') },
  { z: -309, color: new Color('#392842') },
  { z: -396, color: new Color('#394462') },
  { z: -483, color: new Color('#263849') },
  { z: -545, color: new Color('#1e3144') },
]

export function createWorldView(host: HTMLElement, forceWebGL: boolean, onError: (message: string) => void) {
  const renderer = new WebGPURenderer({ antialias: true, forceWebGL })
  renderer.domElement.className = 'world-canvas'
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12

  const scene = new Scene()
  const camera = new PerspectiveCamera(66, 1, .075, 163)
  camera.rotation.order = 'YXZ'
  const fog = new Fog(fogTones[0]!.color, 16, 122)
  const sky = skyDome('gate')
  scene.background = new Color('#172430')
  scene.fog = fog
  const soft = new HemisphereLight(0xb3cbe3, 0x6a4a30, .82)
  const moon = new DirectionalLight(0xabc8fa, .91)
  moon.position.set(-9, 18, 8)
  const rim = new DirectionalLight(0xd0d9f6, .35)
  rim.position.set(5, 4, -10)
  scene.add(sky, soft, moon, rim)

  const surfaces = buildWorldSurfaces(camera)
  const distant = farLandmarks()
  scene.add(surfaces.root, ...distant.map(({ root }) => root))
  const zones = new WorldModels(scene, onError)
  const lights = Array.from({ length: 5 }, () => new PointLight(0xffffff, 0, 0, 2))
  const vaultTask = new PointLight(0xffdc9c, 12, 6, 2)
  vaultTask.position.set(terminal.x, 2.67, terminal.z + .5)
  const vaultCold = new PointLight(0xb7e5ff, 0, 8, 2)
  vaultCold.position.set(terminal.x, 2.51, terminal.z - 3.2)
  scene.add(...lights, vaultTask, vaultCold)
  const machines = new Map<EnemyId, ReturnType<typeof makeRobot>>()
  const tracer = new Mesh(capsule([0, -.5, 0], [0, .5, 0], 1, 10, 12),
    new MeshBasicMaterial({ color: '#ffd795', depthWrite: false }))
  tracer.visible = false
  scene.add(tracer)
  const direction = new Vector3()
  const vertical = new Vector3(0, 1, 0)
  const end = new Vector3()
  const from = new Vector3()
  const right = new Vector3()
  const probe = environment(false, false)
  let filtered: RenderTarget | undefined
  let generator: EnvironmentGenerator | undefined
  let disposed = false
  let initialized = false

  function resize() {
    const { clientWidth: width, clientHeight: height } = host
    if (!width || !height || !initialized || disposed) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.fov = camera.aspect < 1 ? 75 : 66
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  const ready = renderer.init().then(() => {
    initialized = true
    if (disposed) {
      renderer.dispose()
      return null
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
    host.prepend(renderer.domElement)
    observer.observe(host)
    resize()
    generator = new PMREMGenerator(renderer) as EnvironmentGenerator
    filtered = generator.fromEquirectangular(probe)
    scene.environment = filtered.texture
    scene.environmentIntensity = .32
    return 'isWebGPUBackend' in renderer.backend ? 'WebGPU' : 'WebGL2'
  })

  function makeRobot(id: EnemyId) {
    const visual = machine(id === 'bug', id === 'bug' ? .415 : .38)
    visual.root.scale.setScalar(id === 'bug' ? .68 : .65)
    const shadow = contactShadow()
    scene.add(visual.root, shadow)
    return { ...visual, shadow, walk: 0, time: 0 }
  }

  function updateRobots(session: WorldSession) {
    for (const id of enemyIds) {
      const enemy = session.enemies[id]
      const elapsed = session.time - (session.destroyedAt[id] ?? -100)
      const visible = !session.opening && distance(enemy, session.player) < 33
      let model = machines.get(id)
      if (!visible) {
        if (model) {
          scene.remove(model.root, model.shadow)
          disposeMeshes(model.root)
          disposeMeshes(model.shadow)
          machines.delete(id)
        }
        continue
      }
      if (!model) {
        model = makeRobot(id)
        model.time = session.time
        machines.set(id, model)
      }
      const delta = Math.min(.08, session.time - model.time)
      model.time = session.time
      model.walk += delta * (enemy.motion === 'pursuit' ? 13 : 7)
      model.root.position.set(enemy.x, 0, enemy.z)
      model.root.rotation.y = enemy.yaw
      model.shadow.position.set(enemy.x, 0, enemy.z)
      model.shadow.rotation.y = enemy.yaw
      if (enemy.hp <= 0) {
        model.poseRupture(elapsed)
        const collapsed = Math.min(1, elapsed / 1.18)
        model.root.scale.y = (id === 'bug' ? .68 : .65) * (1 - collapsed * .68)
        model.root.rotation.z = collapsed * .13
      } else {
        const warning = enemy.motion === 'windup' ? .58 + Math.sin(session.time * 38) * .41 : 0
        model.poseWalk(model.walk, enemy.moving ? 1 : 0, warning)
      }
    }
  }

  function updateLight(z: number) {
    const tone = fogTones.findIndex(entry => z > entry.z)
    if (tone > 0) {
      const a = fogTones[tone - 1]!, b = fogTones[tone]!
      fog.color.copy(a.color).lerp(b.color, (a.z - z) / (a.z - b.z))
    } else fog.color.copy(fogTones[z >= 0 ? 0 : fogTones.length - 1]!.color)
    const inside = z > -12 && z < 24
    soft.intensity = inside ? .43 : .75
    moon.intensity = inside ? .27 : 1.08
    const candidates = zones.lights.map(light => ({
      light, score: light.intensity / (1 + light.position.distanceToSquared(camera.position)),
    })).sort((a, b) => b.score - a.score)
    for (const [i, light] of lights.entries()) {
      const next = candidates[i]?.light
      light.intensity = next?.intensity ?? 0
      if (!next) continue
      light.position.copy(next.position)
      light.distance = next.distance
      light.color.copy(next.color)
    }
  }

  function draw(session: WorldSession, volume: boolean) {
    const { player } = session
    zones.update(player.z, -Math.cos(player.yaw))
    for (const { root, sector } of distant) {
      root.visible = zoneDistance(player.z, sector) < 116 && !zones.has(sector)
    }
    if (session.opening) {
      camera.position.set(terminal.x - .68 + Math.min(1, session.openingTime / 4) * .29, 1.56, terminal.z + 2.81)
      camera.lookAt(terminal.x, 1.32, terminal.z - 1.37)
    } else {
      camera.position.set(player.x, 1.63, player.z)
      camera.rotation.set(player.pitch, player.yaw, 0)
    }
    sky.position.copy(camera.position)
    const powered = session.stage === 'powered' || session.stage === 'finished'
    vaultCold.intensity = powered ? 33 : 0
    surfaces.pack.visible = session.stage === 'collect'
    surfaces.vault.show(session.opening, powered)
    surfaces.beams.visible = volume && player.z > -11 && player.z < 25 && !session.opening
    updateLight(camera.position.z)
    updateRobots(session)

    const shot = session.shot
    tracer.visible = Boolean(shot)
    if (shot) {
      right.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(.19)
      from.set(shot.x, shot.y - .13, shot.z).add(right)
      end.set(shot.endX, shot.endY, shot.endZ)
      direction.subVectors(end, from)
      tracer.scale.set(.013, direction.length(), .013)
      tracer.position.copy(from).lerp(end, .5)
      tracer.quaternion.setFromUnitVectors(vertical, direction.normalize())
    }
    renderer.render(scene, camera)
  }

  return {
    ready, draw, allows: (z: number) => zones.allows(z),
    dispose() {
      disposed = true
      observer.disconnect()
      zones.dispose()
      surfaces.dispose()
      disposeMeshes(scene)
      filtered?.dispose()
      generator?.dispose()
      probe.dispose()
      if (initialized) renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
