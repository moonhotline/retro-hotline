import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { buildEnvironment } from './environment'
import { resolveWalls } from './map'
import {
  buildGun,
  DRONE_STATS,
  makePickup,
  makeShockwave,
  Particles,
  WEAPONS,
  type PickupParts,
  type Shockwave,
} from './effects'
import { WaveDirector, type CombatHost, type Enemy, type Projectile } from './waves'
import { GLORY_KILL_BANNER, GloryKillSystem } from './combat/gloryKill'
import { AbilitySystem } from './combat/abilities'
import { Sfx } from './audio'
import { SynthMusic } from './music'
import type { DroneType, GameStatus, HudState, Popup, PopupKind, WeaponId } from './types'

const EYE_OFFSET = 1.8
const WALK = 8
const SPRINT = 13.5
const WATER_Y = -14
const CENTER = new THREE.Vector2(0, 0)
const SPARK_COLOR = new THREE.Color(0x9ffcff)
const CASING_COLOR = new THREE.Color(0xffe191)
const DUST_COLOR = new THREE.Color(0x6a7078)
const PICKUP_CHANCE = 0.22
const SLIDE_TIME = 0.55
const SLIDE_CD = 1.7
const SLIDE_SPEED = 22
const PUNCH_CD = 0.55
const PUNCH_RANGE = 4.2
const OVERCHARGE_TIME = 6
const STASH_VALUE = 800

const CACHE_SPOTS: ReadonlyArray<readonly [number, number, number]> = [
  [-21, 1.8, -338], // arcade hall interior
  [16, 8.8, 330], // warehouse rooftop
  [22, 1.8, -370], // plaza far corner
  [-14, 1.8, 315], // poolside lounge
]

interface ActivePickup {
  parts: PickupParts
  born: number
  baseY: number
  cacheIndex: number
  healAmount: number
}

interface TracerPopup extends Popup {
  born: number
}

const MULT_TIERS: Array<[number, number, string]> = [
  [15, 5, '×5 CARNAGE!'],
  [10, 4, '×4 FRENZY!'],
  [6, 3, '×3 RAMPAGE!'],
  [3, 2, '×2 DOUBLE UP!'],
]

/** High-speed FPS engine: dual weapons, slide, punch, combos, zone map. */
export class GameEngine implements CombatHost {
  private container: HTMLElement
  private onHud: (s: HudState) => void
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  private clock = new THREE.Clock()
  private rafId = 0
  private env: ReturnType<typeof buildEnvironment>
  particles: Particles
  sfx = new Sfx()
  private music = new SynthMusic()
  private gunRig: ReturnType<typeof buildGun>
  private director: WaveDirector
  private gloryKills: GloryKillSystem
  private abilities: AbilitySystem
  private raycaster = new THREE.Raycaster()
  private tmpA = new THREE.Vector3()
  private tmpB = new THREE.Vector3()
  private tmpC = new THREE.Vector3()

  private status: GameStatus = 'menu'
  private started = false
  private lockFailed = false
  private muted = false
  private lastIntensity = -1

  // Player
  private pos = new THREE.Vector3(0, 2.4, 180)
  private lastSafe = new THREE.Vector3(0, 2.4, 180)
  private yaw = 0
  private pitch = 0
  private vy = 0
  private grounded = true
  private invulnerable = false
  private bobT = 0
  private recoil = 0
  private gunKick = 0
  private keys = new Set<string>()

  // Weapons
  private weapon: WeaponId = 'rifle'
  private ammo: Record<WeaponId, number> = { rifle: WEAPONS.rifle.mag, deagle: WEAPONS.deagle.mag }
  private firing = false
  private triggerQueued = false
  private fireCd = 0
  private reloading = false
  private reloadT = 0
  private magDropped = false
  private muzzleTimer = 0
  private swapT = 0
  private overchargeT = 0

  // Melee / mobility
  private punchCd = 0
  private punchAnim = 0
  private slideT = 0
  private slideCd = 0
  private slideDir = new THREE.Vector3(0, 0, -1)
  private slideHits = new Set<Enemy>()

  // Combat state
  private health = 100
  private lastHitAt = -99
  private tracers: { mesh: THREE.Mesh; life: number }[] = []
  private shockwaves: Shockwave[] = []
  private pickups: ActivePickup[] = []
  private cacheAlive: boolean[] = CACHE_SPOTS.map(() => false)
  private waveDamaged = false

  // Score / combo juice
  private score = 0
  private kills = 0
  private combo = 0
  private comboTimer = 0
  private bestCombo = 0
  private lastMult = 1

  // Feel
  private shakeAmt = 0
  private timescale = 1
  private hitstopScale = 1
  private hitstopT = 0

  // HUD
  private banner = ''
  private bannerId = 0
  private bannerTimer = 0
  private hitMarkerId = 0
  private hitMarkerCrit = false
  private popups: TracerPopup[] = []
  private nextPopupId = 1
  private lastEmit = ''

  // Debug / telemetry (used by tools/playtest.mjs for evidence-based checks)
  private frameTimes: number[] = []
  private godMode = false

  constructor(container: HTMLElement, onHud: (s: HudState) => void) {
    this.container = container
    this.onHud = onHud

    const w = container.clientWidth || 1280
    const h = container.clientHeight || 720
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.setSize(w, h)
    // Restrained post-processing: readable scene, glow only on bright accents
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 2600)
    this.camera.rotation.order = 'YXZ'
    this.camera.position.copy(this.pos)
    this.scene.add(this.camera)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.4, 0.4))
    this.composer.addPass(new OutputPass())

    this.env = buildEnvironment(this.scene)
    this.particles = new Particles(this.scene)
    this.gunRig = buildGun(this.camera)
    this.director = new WaveDirector(this)
    this.gloryKills = new GloryKillSystem(this.director, this)
    this.abilities = new AbilitySystem(this.director, this)

    window.addEventListener('resize', this.onResize)
    document.addEventListener('pointerlockchange', this.onLockChange)
    document.addEventListener('pointerlockerror', this.onLockError)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('mousedown', this.onMouseDown)
    document.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.container.addEventListener('click', this.onContainerClick)

    this.animate()
    this.emit(true)
    ;(window as unknown as { __neon?: unknown }).__neon = this.debugApi()
  }

  // ---------- debug / telemetry ----------

  /** Snapshot of runtime health: frame pacing, GPU resources, live entities, audio. */
  stats() {
    const ft = [...this.frameTimes].sort((a, b) => a - b)
    const avg = ft.length ? ft.reduce((s, v) => s + v, 0) / ft.length : 0
    const p95 = ft.length ? ft[Math.min(ft.length - 1, Math.floor(ft.length * 0.95))]! : 0
    const info = this.renderer.info
    return {
      status: this.status,
      fps: avg > 0 ? 1000 / avg : 0,
      frameMsAvg: avg,
      frameMsP95: p95,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      lines: info.render.lines,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      sceneObjects: this.countSceneObjects(),
      sceneChildren: this.scene.children.length,
      enemies: this.director.enemies.length,
      remaining: this.director.remaining,
      wave: this.director.wave,
      tracers: this.tracers.length,
      shockwaves: this.shockwaves.length,
      pickups: this.pickups.length,
      health: this.health,
      score: this.score,
      kills: this.kills,
      combo: this.combo,
      weapon: this.weapon,
      ammo: { ...this.ammo },
      reloading: this.reloading,
      slideT: this.slideT,
      punchCd: this.punchCd,
      staggered: this.director.enemies.filter((enemy) => enemy.staggerTimer > 0).length,
      gloryDashing: this.gloryKills.isDashing,
      abilities: this.abilities.stats(),
      invulnerable: this.invulnerable,
      hitstopT: this.hitstopT,
      fov: this.camera.fov,
      overchargeT: this.overchargeT,
      pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z },
      yaw: this.yaw,
      music: this.music.debugState(),
      sfx: this.sfx.debugState(),
    }
  }

  private countSceneObjects(): number {
    let n = 0
    this.scene.traverse(() => n++)
    return n
  }

  private debugApi() {
    return {
      stats: () => this.stats(),
      start: () => this.start(),
      setGod: (on: boolean) => {
        this.godMode = on
      },
      setPos: (x: number, y: number, z: number) => {
        this.pos.set(x, y, z)
        this.lastSafe.copy(this.pos)
        this.vy = 0
      },
      look: (yaw: number, pitch = 0) => {
        this.yaw = yaw
        this.pitch = pitch
      },
      /** Aim at the nearest enemy (for automated firing tests). */
      aimNearest: () => {
        let best: Enemy | null = null
        let bd = Infinity
        for (const e of this.director.enemies) {
          const d = e.parts.group.position.distanceTo(this.pos)
          if (d < bd) {
            bd = d
            best = e
          }
        }
        if (!best) return -1
        const to = this.tmpA.subVectors(best.parts.group.position, this.pos)
        this.yaw = Math.atan2(-to.x, -to.z)
        this.pitch = Math.atan2(to.y, Math.hypot(to.x, to.z))
        return bd
      },
      damageAll: (n: number) => {
        for (const e of [...this.director.enemies]) this.director.damageEnemy(e, n, true)
      },
      clearEnemies: () => this.director.clearEnemies(),
      skipIntermission: () => {
        this.director.intermission = Math.min(this.director.intermission, 0.01)
      },
      setTimescale: (s: number) => {
        this.timescale = s
      },
      hurt: (n: number) => this.damagePlayer(n),
    }
  }

  // ---------- public API ----------

  start() {
    this.sfx.resume()
    this.music.start()
    this.started = true
    this.setStatus('playing')
    this.resetRun()
    this.requestLock()
    this.emit(true)
  }

  resume() {
    if (this.started) this.setStatus('playing')
    this.requestLock()
  }

  restart() {
    this.sfx.resume()
    this.music.start()
    this.started = true
    this.setStatus('playing')
    this.resetRun()
    this.requestLock()
    this.emit(true)
  }

  toggleMute() {
    this.muted = !this.muted
    this.sfx.setMuted(this.muted)
    this.music.setMuted(this.muted)
    this.emit(true)
  }

  dispose() {
    cancelAnimationFrame(this.rafId)
    delete (window as unknown as { __neon?: unknown }).__neon
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    document.removeEventListener('pointerlockerror', this.onLockError)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('mousedown', this.onMouseDown)
    document.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.container.removeEventListener('click', this.onContainerClick)
    this.music.dispose()
    this.abilities.reset()
    this.gloryKills.reset()
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh & { material?: THREE.Material | THREE.Material[] }
      if (mesh.geometry && !(obj instanceof THREE.Sprite)) mesh.geometry.dispose()
      const mat = mesh.material
      if (mat) {
        const list = Array.isArray(mat) ? mat : [mat]
        for (const m of list) m.dispose()
      }
    })
    this.composer.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  // ---------- CombatHost interface ----------

  playerPos(): THREE.Vector3 {
    return this.pos
  }

  isGrounded() { return this.grounded }

  groundHeight() { return this.groundAt(this.pos.x, this.pos.z, this.pos.y) }

  setVerticalVelocity(velocity: number) { this.vy = velocity }

  setInvulnerable(active: boolean) { this.invulnerable = active }

  deflectProjectile(projectile: Projectile, dt: number) {
    return this.abilities.deflectProjectile(projectile, dt)
  }

  now(): number {
    return this.clock.elapsedTime
  }

  addShake(amount: number) {
    this.shakeAmt = Math.min(1.3, this.shakeAmt + amount)
  }

  hitstop(scale: number, duration: number) {
    const clamped = THREE.MathUtils.clamp(scale, 0, 1)
    this.hitstopScale = this.hitstopT > 0 ? Math.min(this.hitstopScale, clamped) : clamped
    this.hitstopT = Math.max(this.hitstopT, duration)
  }

  shockwave(position: THREE.Vector3, color: number, scale: number) {
    this.shockwaves.push(makeShockwave(this.scene, position, color, scale, 0.5))
  }

  collidables(): THREE.Object3D[] {
    return this.env.collidables
  }

  walls() {
    return this.env.walls
  }

  spawnPoint(): THREE.Vector3 {
    return this.env.randomSpawnPoint(this.pos)
  }

  /** Stereo pan for a world position, relative to the player's facing. */
  sfxPan(position: THREE.Vector3): number {
    const right = this.tmpC.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    const to = this.tmpA.subVectors(position, this.pos)
    const d = to.length()
    if (d < 0.001) return 0
    to.normalize()
    return THREE.MathUtils.clamp(to.dot(right) * 0.7, -1, 1)
  }

  damagePlayer(n: number) {
    if (this.status !== 'playing' || this.godMode || this.invulnerable) return
    this.health -= n
    this.lastHitAt = this.clock.elapsedTime
    this.waveDamaged = true
    this.combo = 0
    this.comboTimer = 0
    this.lastMult = 1
    this.addShake(0.75)
    this.sfx.hurt()
    if (this.health <= 0) {
      this.health = 0
      this.setStatus('over')
      this.sfx.gameover()
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }

  onKill(type: DroneType, position: THREE.Vector3, byPlayer: boolean) {
    if (!byPlayer) return
    this.combo++
    this.comboTimer = 6
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    let mult = 1
    for (const [need, m] of MULT_TIERS) {
      if (this.combo >= need) {
        mult = m
        break
      }
    }
    if (mult > this.lastMult) {
      const label = MULT_TIERS.find(([, m]) => m === mult)?.[2] ?? ''
      this.setBanner(label)
      this.sfx.streak()
      if (mult >= 4) this.timescale = Math.min(this.timescale, 0.45)
    }
    this.lastMult = mult
    const pts = DRONE_STATS[type].points * mult
    this.score += pts
    this.kills++
    this.pushPopup(`+${pts}`, mult >= 2 ? 'crit' : 'score', position)

    if (Math.random() < PICKUP_CHANCE) this.spawnPickup(position)
  }

  onGloryKill(position: THREE.Vector3) {
    this.spawnPickup(position, -1, 'heal', 35)
    this.spawnPickup(position, -1, 'overcharge')
    this.score += 350
    this.pushPopup('+350 GLORY KILL', 'crit', position)
    this.setBanner(GLORY_KILL_BANNER)
    this.hitMarkerId++
    this.hitMarkerCrit = true
  }

  onWaveStart(_wave: number) {
    this.waveDamaged = false
    this.respawnCaches()
    this.sfx.waveStart()
  }

  onWaveClear() {
    if (!this.waveDamaged) {
      const bonus = 500 * Math.max(1, this.director.wave)
      this.score += bonus
      this.setBanner(`NO MERCY +${bonus}`)
      this.sfx.fanfare()
    } else {
      this.setBanner('AREA CLEARED')
      this.sfx.streak()
    }
    this.timescale = 0.35
  }

  // ---------- input ----------

  private onResize = () => {
    const w = this.container.clientWidth || 1280
    const h = this.container.clientHeight || 720
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  private isLocked() {
    return document.pointerLockElement === this.renderer.domElement
  }

  private onLockChange = () => {
    if (this.isLocked()) {
      if (this.started) this.setStatus('playing')
    } else {
      this.firing = false
      this.keys.clear()
      if (this.status === 'playing' && !this.lockFailed) this.setStatus('paused')
    }
  }

  private onLockError = () => {
    this.lockFailed = true
    if (this.started && this.status !== 'playing' && this.status !== 'over') {
      this.setStatus('playing')
    }
  }

  private onMouseMove = (e: MouseEvent) => {
    if (this.status !== 'playing') return
    if (!this.isLocked() && !this.lockFailed) return
    this.yaw -= e.movementX * 0.0021
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0021, -1.45, 1.45)
  }

  private onMouseDown = (e: MouseEvent) => {
    if (this.status !== 'playing') return
    if (e.button === 0) {
      this.firing = true
      this.triggerQueued = true
    } else if (e.button === 2) {
      this.tryPunch()
    }
  }

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.firing = false
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space') e.preventDefault()
    if (e.code === 'KeyM') {
      this.toggleMute()
      return
    }
    if (e.code === 'Escape' && this.lockFailed && this.status === 'playing') {
      this.setStatus('paused')
      return
    }
    this.keys.add(e.code)
    if (this.status !== 'playing') return
    if (!e.repeat) {
      this.camera.rotation.set(this.pitch + this.recoil, this.yaw, 0)
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !this.gloryKills.isDashing) {
        const direction = new THREE.Vector3(
          (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0), 0,
          (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0)
        ).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw)
        if (this.abilities.tryPhaseDash(direction)) this.slideT = 0
      }
      if (e.code === 'KeyV') this.abilities.tryPulseParry()
      if ((e.code === 'KeyG' || e.code === 'KeyC') && !this.gloryKills.isDashing) {
        if (this.abilities.tryKineticSlam()) this.slideT = 0
      }
    }
    if (e.code === 'KeyQ') this.switchWeapon()
    if (e.code === 'KeyE' && !e.repeat) this.tryGloryKill()
    if (e.code === 'KeyF') this.tryPunch()
    if (e.code === 'KeyC' || e.code === 'ControlLeft') this.trySlide()
    if (e.code === 'KeyR') this.tryReload()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  private onContainerClick = () => {
    if (this.status === 'paused') this.requestLock()
  }

  // ---------- weapons / abilities ----------

  private switchWeapon() {
    if (this.swapT > 0) return
    this.weapon = this.weapon === 'rifle' ? 'deagle' : 'rifle'
    this.reloading = false
    this.triggerQueued = false
    this.swapT = 0.25
    this.sfx.swap()
  }

  private tryReload() {
    if (this.reloading || this.ammo[this.weapon] === WEAPONS[this.weapon].mag) return
    this.reloading = true
    this.magDropped = false
    this.reloadT = WEAPONS[this.weapon].reloadTime
    this.sfx.reload()
  }

  private tryGloryKill(): boolean {
    if (this.punchCd > 0 || this.gloryKills.isDashing || this.abilities.isDashing || this.abilities.isSlamming) return false
    // Input may arrive between frames, before the latest mouse aim is rendered.
    this.camera.rotation.set(this.pitch + this.recoil, this.yaw, 0)
    if (!this.gloryKills.tryGloryKill(this.pos, this.camera, this.director.enemies, this)) return false
    this.punchCd = PUNCH_CD
    this.punchAnim = 0
    this.slideT = 0
    this.vy = 0
    return true
  }

  private tryPunch() {
    if (this.punchCd > 0) return
    if (this.tryGloryKill()) return
    this.punchCd = PUNCH_CD
    this.punchAnim = 0.18
    this.addShake(0.25)
    this.sfx.punch()

    const fwd = this.tmpC.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    let hitAny = false
    for (const e of [...this.director.enemies]) {
      const to = this.tmpA.subVectors(e.parts.group.position, this.pos)
      const dist = to.length()
      if (dist > PUNCH_RANGE) continue
      to.normalize()
      if (to.dot(fwd) < 0.4) continue
      hitAny = true
      const killed = this.director.damageEnemy(e, 6, true) // melee breaks shields
      if (!killed) this.director.knockback(e, fwd, 5)
      this.particles.burst(e.parts.group.position, SPARK_COLOR, 16, 8, 0.5)
    }
    if (hitAny) {
      this.hitMarkerId++
      this.hitMarkerCrit = false
    }
  }

  private trySlide() {
    if (this.gloryKills.isDashing || this.abilities.isDashing || this.abilities.isSlamming || this.slideT > 0 || this.slideCd > 0 || !this.grounded) return
    let ix = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0)
    let iz = (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0)
    if (ix === 0 && iz === 0) {
      ix = 0
      iz = -1
    }
    const len = Math.hypot(ix, iz)
    ix /= len
    iz /= len
    const cos = Math.cos(this.yaw)
    const sin = Math.sin(this.yaw)
    this.slideDir.set(ix * cos + iz * sin, 0, -ix * sin + iz * cos)
    this.slideT = SLIDE_TIME
    this.slideCd = SLIDE_CD
    this.slideHits.clear()
    this.addShake(0.15)
    this.sfx.whoosh()
  }

  private fire() {
    const w = WEAPONS[this.weapon]
    this.ammo[this.weapon]--
    this.fireCd = w.fireCd * (this.overchargeT > 0 ? 0.55 : 1)
    this.gunKick = w.kick
    this.recoil += w.recoil
    this.muzzleTimer = 0.06
    this.addShake(w.shake)
    const flashScale = w.flash * (this.overchargeT > 0 ? 1.4 : 1) * (0.8 + Math.random() * 0.4)
    this.gunRig.flash.scale.set(flashScale, flashScale, 1)
    if (this.weapon === 'deagle') this.sfx.deagle()
    else this.sfx.shoot()

    // ejected shell casing sparks
    const casingPos = this.camera.localToWorld(new THREE.Vector3(0.62, -0.5, -1.1))
    this.particles.burst(casingPos, CASING_COLOR, 2, 2.2, 0.5)

    this.camera.updateMatrixWorld()
    const from = this.camera.localToWorld(new THREE.Vector3(0.52, -0.28, -1.6))
    this.raycaster.setFromCamera(CENTER, this.camera)
    this.raycaster.far = 200

    const targets = [...this.director.raycastTargets(), ...this.env.collidables]
    const hits = this.raycaster.intersectObjects(targets, false)
    const hit = hits[0]

    let end: THREE.Vector3
    if (hit) {
      end = hit.point
      const enemy = hit.object.userData['enemy'] as Enemy | undefined
      if (enemy) {
        const crit = Math.random() < w.critChance
        const dmg = w.dmg * (crit ? 2 : 1)
        // The Eagle punches through armor; the rifle does not
        const killed = this.director.damageEnemy(enemy, dmg, this.weapon === 'deagle' || crit)
        this.hitMarkerId++
        this.hitMarkerCrit = crit
        if (crit) this.sfx.crit()
        else this.sfx.hit()
        if (!killed) this.particles.burst(end, SPARK_COLOR, crit ? 16 : 9, 7, 0.4)
        if (killed && this.weapon === 'deagle') {
          this.timescale = Math.min(this.timescale, 0.55) // magnum hit-stop
        }
      } else {
        this.particles.burst(end, SPARK_COLOR, 8, 5, 0.35)
      }
    } else {
      end = this.raycaster.ray.at(160, new THREE.Vector3())
    }
    this.addTracer(from, end, w.tracer, w.tracerWidth)
    if (this.ammo[this.weapon] === 0) this.tryReload()
  }

  private addTracer(from: THREE.Vector3, to: THREE.Vector3, color: number, width: number) {
    const dir = this.tmpB.subVectors(to, from)
    const len = Math.max(dir.length(), 0.01)
    const geo = new THREE.CylinderGeometry(width, width, len, 4, 1, true)
    geo.translate(0, len / 2, 0)
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(from)
    mesh.quaternion.setFromUnitVectors(this.tmpA.set(0, 1, 0), dir.normalize())
    this.scene.add(mesh)
    this.tracers.push({ mesh, life: 0.07 })
  }

  // ---------- terrain helpers ----------

  /** Walkable surface height at (x, z) given the body's current height. */
  private groundAt(x: number, z: number, y: number): number {
    let top = WATER_Y
    for (const r of this.env.walkRects) {
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue
      if (r.top <= y + 0.7 && r.top > top) top = r.top
    }
    return top
  }

  // ---------- pickups ----------

  private spawnPickup(at: THREE.Vector3, cacheIndex = -1, kind?: 'heal' | 'gem' | 'overcharge', healAmount = 30) {
    let actualKind = kind ?? 'gem'
    if (cacheIndex === -1 && kind === undefined) {
      if (this.health < 70 && Math.random() < 0.5) actualKind = 'heal'
      else if (Math.random() < 0.35) actualKind = 'overcharge'
      else actualKind = 'gem'
    }
    const parts = makePickup(cacheIndex >= 0 ? 'stash' : actualKind)
    if (actualKind === 'heal' && healAmount > 30) parts.group.scale.setScalar(1.35)
    if (cacheIndex >= 0) {
      parts.group.position.set(
        THREE.MathUtils.clamp(at.x, -26, 26),
        THREE.MathUtils.clamp(at.y, 1.8, 13),
        THREE.MathUtils.clamp(at.z, -378, 378)
      )
    } else {
      const xLimit = Math.abs(at.z) < 284 ? 5.8 : 24
      const px = THREE.MathUtils.clamp(at.x, -xLimit, xLimit)
      const pz = THREE.MathUtils.clamp(at.z, -378, 378)
      const gy = Math.max(0.6, this.groundAt(px, pz, at.y))
      parts.group.position.set(px, gy + 1.2, pz)
    }
    this.scene.add(parts.group)
    this.pickups.push({
      parts,
      born: this.clock.elapsedTime,
      baseY: parts.group.position.y,
      cacheIndex,
      healAmount,
    })
  }

  /** Hidden stash crates placed at exploration spots. */
  private respawnCaches() {
    CACHE_SPOTS.forEach((spot, i) => {
      if (this.cacheAlive[i]) return
      this.cacheAlive[i] = true
      this.spawnPickup(new THREE.Vector3(spot[0]!, spot[1]!, spot[2]!), i)
    })
  }

  // ---------- helpers ----------

  private setStatus(s: GameStatus) {
    this.status = s
    this.emit(true)
  }

  private requestLock() {
    const el = this.renderer.domElement
    const result = el.requestPointerLock() as unknown
    if (result && typeof (result as Promise<void>).catch === 'function') {
      ;(result as Promise<void>).catch(() => this.onLockError())
    }
  }

  private setBanner(text: string) {
    this.banner = text
    this.bannerId++
    this.bannerTimer = 2.4
  }

  private pushPopup(text: string, kind: PopupKind, worldPos: THREE.Vector3) {
    const v = this.tmpA.copy(worldPos)
    v.project(this.camera)
    if (v.z > 1 || v.z < -1) return
    this.popups.push({
      id: this.nextPopupId++,
      text,
      kind,
      x: (v.x + 1) / 2,
      y: (-v.y + 1) / 2,
      born: this.clock.elapsedTime,
    })
  }

  private emit(force = false) {
    const t = this.clock.elapsedTime
    const alivePopups = this.popups.filter((p) => t - p.born < 1.4)
    this.popups = alivePopups
    const snap: HudState = {
      status: this.status,
      health: Math.max(0, Math.round(this.health)),
      ammo: this.ammo[this.weapon],
      mag: WEAPONS[this.weapon].mag,
      reloading: this.reloading,
      reloadFrac: this.reloading ? 1 - this.reloadT / WEAPONS[this.weapon].reloadTime : 0,
      score: this.score,
      kills: this.kills,
      wave: this.director.wave,
      alive: this.director.enemies.length,
      remaining: this.director.remaining,
      combo: this.combo,
      mult: this.currentMult(),
      comboFrac: Math.max(0, Math.min(1, this.comboTimer / 6)),
      bestCombo: this.bestCombo,
      hitMarkerId: this.hitMarkerId,
      hitMarkerCrit: this.hitMarkerCrit,
      banner: this.banner,
      bannerId: this.bannerId,
      popups: alivePopups.map((p) => ({ id: p.id, text: p.text, kind: p.kind, x: p.x, y: p.y })),
      muted: this.muted,
      weapon: this.weapon,
      overchargeFrac: Math.max(0, Math.min(1, this.overchargeT / OVERCHARGE_TIME)),
      slideFrac: this.slideCd <= 0 ? 1 : 1 - this.slideCd / SLIDE_CD,
      abilities: this.abilities.stats(),
    }
    const key = JSON.stringify(snap)
    if (force || key !== this.lastEmit) {
      this.lastEmit = key
      this.onHud(snap)
    }
  }

  private currentMult(): number {
    for (const [need, m] of MULT_TIERS) {
      if (this.combo >= need) return m
    }
    return 1
  }

  private resetRun() {
    this.abilities.reset()
    this.gloryKills.reset()
    this.director.reset()
    this.particles.clear()
    this.slideHits.clear()
    for (const p of this.pickups) {
      this.scene.remove(p.parts.group)
      this.disposeGroup(p.parts.group)
    }
    this.pickups = []
    this.cacheAlive = CACHE_SPOTS.map(() => false)
    for (const s of this.shockwaves) {
      this.scene.remove(s.line)
      this.disposeGroup(s.line)
    }
    this.shockwaves = []
    for (const tr of this.tracers) {
      this.scene.remove(tr.mesh)
      tr.mesh.geometry.dispose()
      ;(tr.mesh.material as THREE.Material).dispose()
    }
    this.tracers = []
    this.score = 0
    this.kills = 0
    this.combo = 0
    this.comboTimer = 0
    this.bestCombo = 0
    this.lastMult = 1
    this.health = 100
    this.weapon = 'rifle'
    this.ammo = { rifle: WEAPONS.rifle.mag, deagle: WEAPONS.deagle.mag }
    this.reloading = false
    this.firing = false
    this.triggerQueued = false
    this.overchargeT = 0
    this.punchCd = 0
    this.punchAnim = 0
    this.slideT = 0
    this.slideCd = 0
    this.timescale = 1
    this.hitstopScale = 1
    this.hitstopT = 0
    this.shakeAmt = 0
    this.recoil = 0
    this.gunKick = 0
    this.swapT = 0
    this.waveDamaged = false
    this.yaw = 0
    this.pitch = 0
    this.vy = 0
    this.grounded = true
    this.keys.clear()
    this.pos.set(0, 2.4, 180)
    this.lastSafe.copy(this.pos)
    this.camera.fov = 75
    this.camera.updateProjectionMatrix()
    this.setBanner('STAY SHARP')
  }

  private disposeGroup(g: THREE.Object3D) {
    g.traverse((o) => {
      const obj = o as THREE.Line & THREE.Mesh & THREE.Sprite
      if (obj.geometry && !(o instanceof THREE.Sprite)) obj.geometry.dispose()
      const mat = (obj as THREE.Line).material
      if (mat) {
        const list = Array.isArray(mat) ? mat : [mat]
        for (const m of list) m.dispose()
      }
    })
    g.clear()
  }

  // ---------- per-frame ----------

  private update(dtRaw: number, elapsed = dtRaw) {
    const t = this.clock.elapsedTime

    // slow-mo recovery (raw time)
    this.timescale += (1 - this.timescale) * Math.min(1, dtRaw * 1.6)
    // Movement stays capped after a slow frame; hitstop still expires in real time.
    const stoppedTime = dtRaw * Math.min(1, this.hitstopT / Math.max(elapsed, Number.EPSILON))
    const dt = stoppedTime * Math.min(this.timescale, this.hitstopScale) + (dtRaw - stoppedTime) * this.timescale
    this.hitstopT = Math.max(0, this.hitstopT - elapsed)

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dtRaw
      if (this.bannerTimer <= 0) this.banner = ''
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dtRaw
      if (this.comboTimer <= 0) {
        this.combo = 0
        this.lastMult = 1
      }
    }

    // cooldowns
    this.punchCd = Math.max(0, this.punchCd - dtRaw)
    this.slideCd = Math.max(0, this.slideCd - dtRaw)
    if (this.overchargeT > 0) this.overchargeT -= dtRaw

    // ---- movement ----
    const dashing = this.gloryKills.isDashing || this.abilities.isDashing
    this.camera.rotation.set(this.pitch + this.recoil, this.yaw, 0)
    this.gloryKills.update(elapsed, t)
    this.abilities.update(dtRaw, t)
    const sprintKey = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    if (!dashing && this.slideT > 0) {
      this.slideT -= dtRaw
      const k = Math.max(this.slideT / SLIDE_TIME, 0.2)
      this.pos.x += this.slideDir.x * SLIDE_SPEED * k * dt
      this.pos.z += this.slideDir.z * SLIDE_SPEED * k * dt
      const dust = this.tmpA.copy(this.pos).addScaledVector(this.slideDir, -0.6)
      dust.y = Math.max(this.groundAt(dust.x, dust.z, dust.y), 0.6) + 0.4
      this.particles.burst(dust, DUST_COLOR, 2, 1.5, 0.35)
      for (const e of [...this.director.enemies]) {
        if (this.slideHits.has(e)) continue
        if (e.parts.group.position.distanceTo(this.pos) < 2.2) {
          this.slideHits.add(e)
          const killed = this.director.damageEnemy(e, 3, true)
          if (!killed) this.director.knockback(e, this.slideDir, 6)
          this.addShake(0.3)
          this.hitMarkerId++
          this.hitMarkerCrit = false
          this.sfx.hit()
        }
      }
    } else if (!dashing) {
      let ix = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0)
      let iz = (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0)
      const moving = ix !== 0 || iz !== 0
      const speed = sprintKey ? SPRINT : WALK
      if (moving) {
        const len = Math.hypot(ix, iz)
        ix /= len
        iz /= len
        const cos = Math.cos(this.yaw)
        const sin = Math.sin(this.yaw)
        this.pos.x += (ix * cos + iz * sin) * speed * dt
        this.pos.z += (-ix * sin + iz * cos) * speed * dt
        this.bobT += dt * (sprintKey ? 13 : 9)
      }
    }
    // Soft world bounds
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -60, 60)
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -400, 400)

    // Wall collision (only against walls taller than the player)
    resolveWalls(this.env.walls, this.pos, 0.55, this.pos.y)

    // Jump / gravity with heightmap ground
    if (!dashing && this.keys.has('Space') && this.grounded) {
      if (this.slideT > 0) this.slideT = 0
      this.vy = 8
      this.grounded = false
    }
    if (!dashing) this.vy -= 24 * dt
    let y = this.pos.y + (dashing ? 0 : this.vy * dt)
    const gy = this.groundAt(this.pos.x, this.pos.z, Math.max(y, this.pos.y))
    const groundEye = gy + EYE_OFFSET
    if (y <= groundEye) {
      y = groundEye
      this.vy = 0
      this.grounded = true
      this.lastSafe.copy(this.pos)
      this.lastSafe.y = groundEye
    } else {
      this.grounded = false
    }
    this.pos.y = y
    if (this.grounded) this.abilities.onLanding()

    // Jump pads
    if (this.grounded) {
      for (const pad of this.env.pads) {
        const dx = this.pos.x - pad.x
        const dz = this.pos.z - pad.z
        if (dx * dx + dz * dz < 1.8 * 1.8) {
          this.vy = 16.5
          this.grounded = false
          this.sfx.whoosh()
          this.particles.burst(pad, SPARK_COLOR, 14, 5, 0.6)
          break
        }
      }
    }

    // Fell off the map into the bay
    if (this.pos.y < 0.4 && gy <= WATER_Y + 0.7) {
      this.pos.copy(this.lastSafe)
      this.vy = 0
      this.grounded = true
      this.abilities.cancelMotion()
      this.damagePlayer(8)
      this.setBanner('WATCH YOUR STEP')
      this.addShake(0.6)
    }

    const bob = this.grounded && this.slideT <= 0 ? Math.sin(this.bobT) * 0.06 : 0
    const slideK = this.slideT > 0 ? Math.sin((1 - this.slideT / SLIDE_TIME) * Math.PI) : 0
    const slideDip = slideK * 0.9
    const targetFov = Math.max((sprintKey ? 82 : 75) + slideK * 8, this.gloryKills.fovFloor)
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dtRaw * 8)
    this.camera.updateProjectionMatrix()

    // Camera transform + shake + punch lunge
    this.recoil *= Math.exp(-dtRaw * 5)
    this.shakeAmt *= Math.exp(-dtRaw * 6)
    const sh = this.shakeAmt
    let cx = this.pos.x + (Math.random() - 0.5) * sh * 0.35
    let cy = this.pos.y + bob - slideDip + (Math.random() - 0.5) * sh * 0.35
    let cz = this.pos.z
    if (this.punchAnim > 0) {
      this.punchAnim -= dtRaw
      const k = Math.sin((1 - Math.max(this.punchAnim, 0) / 0.18) * Math.PI) * 0.45
      cx += -Math.sin(this.yaw) * k
      cy += 0.05 * k
      cz += -Math.cos(this.yaw) * k
    }
    this.camera.position.set(cx, cy, cz)
    this.camera.rotation.set(this.pitch + this.recoil, this.yaw, (Math.random() - 0.5) * sh * 0.06)

    // ---- weapon pose ----
    const w = WEAPONS[this.weapon]
    const gun = this.weapon === 'rifle' ? this.gunRig.rifle : this.gunRig.deagle
    this.gunKick = Math.max(0, this.gunKick - dt * 1.2)
    let gy2 = -0.42
    let rotX = 0
    let rotZ = 0
    if (this.reloading) {
      this.reloadT -= dt
      const k = 1 - Math.max(this.reloadT, 0) / w.reloadTime
      gy2 -= 0.3 * Math.sin(k * Math.PI)
      rotX = -0.7 * Math.sin(k * Math.PI)
      rotZ = k * Math.PI * 2
      if (!this.magDropped && k > 0.4) {
        this.magDropped = true
        const drop = this.camera.localToWorld(new THREE.Vector3(0.52, -0.8, -1.0))
        this.particles.burst(drop, CASING_COLOR, 7, 3, 0.6)
      }
      if (this.reloadT <= 0) {
        this.reloading = false
        this.ammo[this.weapon] = w.mag
      }
    }
    if (this.swapT > 0) {
      this.swapT -= dtRaw
      gy2 -= 0.45 * Math.max(this.swapT / 0.25, 0)
    }
    gun.position.set(0.52, gy2, -0.95 + this.gunKick)
    gun.rotation.set(rotX, 0.05, rotZ)

    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt
      this.gunRig.flash.visible = this.muzzleTimer > 0
    } else {
      this.gunRig.flash.visible = false
    }

    // Firing
    this.fireCd -= dt
    const wantFire = w.auto ? this.firing : this.triggerQueued
    if (!dashing && !this.reloading && wantFire) {
      if (this.ammo[this.weapon] > 0) {
        if (this.fireCd <= 0) {
          this.fire()
          this.triggerQueued = false
        }
      } else {
        this.tryReload()
        this.triggerQueued = false
      }
    }

    // Waves / enemies
    this.director.update(dt, t)

    // Pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]!
      const g = p.parts.group
      const age = t - p.born
      g.rotation.y += dt * 2.5
      g.position.y = p.baseY + Math.sin(t * 2.5 + i) * 0.3
      // stash glows blink as an expiry warning
      p.parts.glow.visible =
        p.cacheIndex >= 0 && age > 11 ? Math.sin(t * 12) > 0 : true
      const d = g.position.distanceTo(this.pos)
      if (d < 3.2 && p.cacheIndex < 0) {
        g.position.lerp(this.pos, Math.min(1, dt * 6))
      }
      if (d < 1.7) {
        if (p.parts.kind === 'heal') {
          this.health = Math.min(100, this.health + p.healAmount)
          this.pushPopup(`+${p.healAmount} HP`, 'heal', g.position)
        } else if (p.parts.kind === 'overcharge') {
          this.overchargeT = OVERCHARGE_TIME
          if (this.banner !== GLORY_KILL_BANNER) this.setBanner('OVERDRIVE ACTIVE')
          this.pushPopup('OVERDRIVE', 'gem', g.position)
        } else if (p.parts.kind === 'stash') {
          this.score += STASH_VALUE
          this.pushPopup(`+${STASH_VALUE} STASH`, 'gem', g.position)
          this.cacheAlive[p.cacheIndex] = false
        } else {
          this.score += 500
          this.pushPopup('+500', 'gem', g.position)
        }
        this.sfx.pickup()
        this.particles.burst(g.position, SPARK_COLOR, 20, 6, 0.6)
        this.scene.remove(g)
        this.disposeGroup(g)
        this.pickups.splice(i, 1)
        continue
      }
      if (age > 14 && p.cacheIndex < 0) {
        this.scene.remove(g)
        this.disposeGroup(g)
        this.pickups.splice(i, 1)
      }
    }

    // Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i]!
      s.life -= dt
      if (s.life <= 0) {
        this.scene.remove(s.line)
        this.disposeGroup(s.line)
        this.shockwaves.splice(i, 1)
        continue
      }
      const k = 1 - s.life / s.total
      s.line.scale.setScalar(0.4 + k * s.maxScale)
      s.line.quaternion.copy(this.camera.quaternion)
      const mat = s.line.material as THREE.LineBasicMaterial
      mat.opacity = s.life / s.total
    }

    this.particles.update(dt)

    // Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]!
      tr.life -= dt
      if (tr.life <= 0) {
        this.scene.remove(tr.mesh)
        tr.mesh.geometry.dispose()
        ;(tr.mesh.material as THREE.Material).dispose()
        this.tracers.splice(i, 1)
      } else {
        ;(tr.mesh.material as THREE.MeshBasicMaterial).opacity = (tr.life / 0.07) * 0.9
      }
    }

    // Health regen
    if (this.health > 0 && this.health < 100 && t - this.lastHitAt > 5) {
      this.health = Math.min(100, this.health + 3.5 * dtRaw)
    }

    this.emit()
  }

  private updateCinematic(t: number) {
    this.camera.position.set(22 + Math.sin(t * 0.08) * 6, 11, 150 + Math.sin(t * 0.05) * 45)
    this.camera.lookAt(0, 32, -100)
  }

  private animate = () => {
    this.rafId = requestAnimationFrame(this.animate)
    const rawDelta = this.clock.getDelta()
    this.frameTimes.push(rawDelta * 1000)
    if (this.frameTimes.length > 120) this.frameTimes.shift()
    const dt = Math.min(rawDelta, 0.05)
    const t = this.clock.elapsedTime
    this.env.update(t)

    // Continuous music: intensity follows game state (muffled ↔ full lead)
    const desired =
      this.status === 'playing'
        ? this.director.intermission > 0
          ? 1
          : this.combo >= 3 || this.overchargeT > 0
            ? 3
            : 2
        : 0
    if (desired !== this.lastIntensity) {
      this.lastIntensity = desired
      this.music.setIntensity(desired)
    }

    const showGun = this.status !== 'menu'
    this.gunRig.rifle.visible = showGun && this.weapon === 'rifle'
    this.gunRig.deagle.visible = showGun && this.weapon === 'deagle'
    if (this.status === 'playing') {
      this.update(dt, rawDelta)
    } else if (this.status === 'menu') {
      this.updateCinematic(t)
    }
    this.composer.render(dt)
  }
}
