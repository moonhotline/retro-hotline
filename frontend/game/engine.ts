import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { createSynthwaveGradePass } from './postprocess'
import { buildEnvironment } from './environment'
import { resolveWalls } from './map'
import {
  buildGun,
  DRONE_STATS,
  makeHazardCanister,
  makePickup,
  makeShockwave,
  Particles,
  WEAPONS,
  type HazardParts,
  type PickupParts,
  type Shockwave,
} from './effects'
import { WaveDirector, type CombatHost, type Enemy, type Projectile } from './waves'
import { GLORY_KILL_BANNER, GloryKillSystem } from './combat/gloryKill'
import { AbilitySystem } from './combat/abilities'
import { HackManager, type HackId, type NeonHack } from './combat/modifiers'
import { loadProfile, recordGameRun, saveProfile } from './combat/storage'
import { LevelManager } from './levels/manager'
import { Sfx } from './audio'
import { SynthMusic } from './music'
import type { DroneType, GameStatus, HudState, Popup, PopupKind, WeaponId } from './types'

const EYE_OFFSET = 1.8
const WALK = 8
const SPRINT = 13.5
const WATER_Y = -14
const CENTER = new THREE.Vector2(0, 0)
const SPARK_COLOR = new THREE.Color(0x9ffcff)
const WALL_SPARK_COLOR = new THREE.Color(0x00f0ff)
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

interface ActiveHazard {
  parts: HazardParts
  baseY: number
  spotIndex: number
}

const PRISM_TRACERS = [0xff2e7e, 0xffb84d, 0x4dffd2, 0x29e3ff, 0x528bff, 0xb95cff] as const

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
  private bloomPass: UnrealBloomPass
  private gradePass: ShaderPass
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  private clock = new THREE.Clock()
  private rafId = 0
  private env: ReturnType<typeof buildEnvironment>
  particles: Particles
  sfx = new Sfx()
  private music = new SynthMusic({ studioCombat: true })
  private gunRig: ReturnType<typeof buildGun>
  private director: WaveDirector
  private gloryKills: GloryKillSystem
  private abilities: AbilitySystem
  readonly hackManager = new HackManager()
  readonly levelManager = new LevelManager()
  chronoTimeScale = 1.0
  chronoMode = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test' ? false : true
  private draftHacks: NeonHack[] = []
  private gameplayTime = 0
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
  private launchVelocity = new THREE.Vector3()
  private grounded = true
  private invulnerable = false
  private bobT = 0
  private recoil = 0
  private gunKick = 0
  private keys = new Set<string>()

  // Weapons
  private weapon: WeaponId = 'rifle'
  private ammo: Record<WeaponId, number> = {
    rifle: WEAPONS.rifle.mag,
    deagle: WEAPONS.deagle.mag,
    prism: WEAPONS.prism.mag,
    sniper: WEAPONS.sniper.mag,
  }
  unlockedWeapons: WeaponId[] = ['rifle', 'deagle', 'prism']
  isAiming = false
  attackSpeedMult = 1.0
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
  private wallJumpsRemaining = 2
  private wallJumpCooldown = 0

  get maxHealth(): number {
    return 100 + this.hackManager.maxHpBonus
  }
  private tracers: { mesh: THREE.Mesh; life: number }[] = []
  private shockwaves: Shockwave[] = []
  private pickups: ActivePickup[] = []
  private hazards: ActiveHazard[] = []
  private boostTimer = 0
  private boostDir = new THREE.Vector3()
  private cacheAlive: boolean[] = CACHE_SPOTS.map(() => false)
  private waveDamaged = false

  // Score / combo juice
  private score = 0
  private kills = 0
  private gloryKillCount = 0
  private runRecorded = true
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
    const profile = loadProfile()
    this.music.setTrack(profile.musicTrackIndex)
    this.music.setVolume(profile.musicVolume)
    this.sfx.setVolume(profile.sfxVolume)

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
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.30, 0.45, 0.62)
    this.composer.addPass(this.bloomPass)
    this.gradePass = createSynthwaveGradePass()
    this.composer.addPass(this.gradePass)
    this.composer.addPass(new OutputPass())

    this.env = buildEnvironment(this.scene)
    this.env.applyStageTheme?.(this.levelManager.currentStage.environment)
    this.particles = new Particles(this.scene)
    this.gunRig = buildGun(this.camera)
    this.director = new WaveDirector(this)
    this.gloryKills = new GloryKillSystem(this.director, this)
    this.abilities = new AbilitySystem(this.director, this)
    this.levelManager.bindScene(this.scene, this.sfx)

    window.addEventListener('resize', this.onResize)
    document.addEventListener('pointerlockchange', this.onLockChange)
    document.addEventListener('pointerlockerror', this.onLockError)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('mousedown', this.onMouseDown)
    document.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.clearInput)
    this.container.addEventListener('click', this.onContainerClick)
    this.container.addEventListener('contextmenu', this.onContextMenu)

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
      district: this.currentDistrict(),
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
      maxHealth: this.maxHealth,
      score: this.score,
      kills: this.kills,
      gloryKills: this.gloryKillCount,
      combo: this.combo,
      weapon: this.weapon,
      ammo: { ...this.ammo },
      chronoTimeScale: this.chronoTimeScale,
      stage: this.levelManager.currentStage.name,
      room: this.levelManager.currentRoom?.roomName,
      reloading: this.reloading,
      slideT: this.slideT,
      punchCd: this.punchCd,
      staggered: this.director.enemies.filter((enemy) => enemy.staggerTimer > 0).length,
      gloryDashing: this.gloryKills.isDashing,
      abilities: this.abilities.stats(),
      draftOpen: this.draftHacks.length > 0,
      draftHacks: [...this.draftHacks],
      activeHacks: this.hackManager.list(),
      speedBoostRemaining: this.hackManager.speedBoostRemaining,
      ammoEfficiency: this.hackManager.ammoEfficiency,
      invulnerable: this.invulnerable,
      hitstopT: this.hitstopT,
      sniperHack: this.director.sniperHackState(),
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
      profile: () => loadProfile(),
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
    this.finishRun()
    this.sfx.resume()
    this.music.start()
    this.started = true
    this.resetRun()
    this.setStatus('playing')
    this.requestLock()
    this.emit(true)
  }

  resume() {
    if (this.draftHacks.length > 0 || this.status !== 'paused') return
    if (this.started) this.setStatus('playing')
    this.requestLock()
  }

  applyDraftHack(id: HackId): void {
    if (this.status !== 'paused' || !this.draftHacks.some((hack) => hack.id === id) || this.hackManager.has(id)) return
    this.hackManager.apply(id)
    if (id === 'max_hp') {
      this.health = Math.min(this.maxHealth, this.health + 50)
    }
    this.draftHacks = []
    this.director.resumeAfterDraft()
    this.keys.clear()
    this.firing = this.triggerQueued = false
    this.sfx.gloryPing()
    this.setStatus('playing')
    this.requestLock()
  }

  restart() {
    this.start()
  }

  closeStoryDialogue() {
    const res = this.levelManager.closeDialogue()
    if (res.action === 'gift_sniper') {
      if (!this.unlockedWeapons.includes('sniper')) {
        this.unlockedWeapons.push('sniper')
      }
      this.weapon = 'sniper'
      this.ammo.sniper = WEAPONS.sniper.mag
      this.isAiming = false
      this.setBanner('PROTOTYPE ACQUIRED // GAUSS SNIPER (HOLD RMB TO ZOOM)')
      this.sfx.streak()
    } else if (res.action === 'trigger_wave') {
      const room = this.levelManager.currentRoom
      if (room && room.waves.length > 0 && !this.levelManager.isRoomSpawned(room.roomId)) {
        this.levelManager.markRoomSpawned(room.roomId)
        const dronesToQueue: DroneType[] = []
        for (const w of room.waves) {
          for (const drone of w.drones) {
            for (let i = 0; i < drone.count; i++) {
              dronesToQueue.push(drone.type)
            }
          }
        }
        this.director.queueRoomWave(dronesToQueue)
      }
    }
    this.requestLock()
    this.emit(true)
  }

  buyShopItem(item: import('./types').ShopItemData): boolean {
    if (this.score < item.cost) {
      this.pushPopup('INSUFFICIENT SCORE', 'crit', this.pos)
      return false
    }
    this.score -= item.cost

    if (item.kind === 'heal') {
      this.health = Math.min(this.maxHealth, this.health + 50)
      this.pushPopup('+50 HP', 'heal', this.pos)
      this.setBanner('NANO REPAIR INJECTED // +50 HP')
      this.sfx.pickup()
    } else if (item.kind === 'attack_speed') {
      this.attackSpeedMult *= 1.25
      this.pushPopup('+25% FIRERATE', 'gem', this.pos)
      this.setBanner('OVERCLOCK TRIGGER INSTALLED // +25% SPEED')
      this.sfx.pickup()
    } else if (item.kind === 'ammo') {
      this.ammo.sniper = Math.min(WEAPONS.sniper.mag * 2, (this.ammo.sniper || 0) + 5)
      this.pushPopup('+5 SNIPER SLUGS', 'gem', this.pos)
      this.setBanner('GAUSS SLUGS REFILLED // +5 SLUGS')
      this.sfx.reload()
    }
    this.emit(true)
    return true
  }

  toggleMute() {
    this.muted = !this.muted
    this.sfx.setMuted(this.muted)
    this.music.setMuted(this.muted)
    this.emit(true)
  }

  /** Resume the continuous synth from a menu gesture without starting a run. */
  previewAudio() {
    this.sfx.resume()
    this.music.start()
  }

  nextTrack() {
    const next = this.music.nextTrack()
    saveProfile({ musicTrackIndex: this.music.getCurrentTrackIndex() })
    this.setBanner(`TRACK // ${next.name} [${next.bpm} BPM]`)
    this.emit(true)
  }

  dispose() {
    this.finishRun()
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
    window.removeEventListener('blur', this.clearInput)
    this.container.removeEventListener('click', this.onContainerClick)
    this.container.removeEventListener('contextmenu', this.onContextMenu)
    this.music.dispose()
    this.levelManager.dispose()
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

  groundHeight() { return this.groundAt(this.pos.x, this.pos.z, this.pos.y - EYE_OFFSET) }

  setVerticalVelocity(velocity: number) { this.vy = velocity }

  setInvulnerable(active: boolean) { this.invulnerable = active }

  deflectProjectile(projectile: Projectile, dt: number) {
    const reflected = this.abilities.deflectProjectile(projectile, dt)
    if (reflected) {
      this.hackManager.onParry({
        refillMagazine: () => {
          this.ammo[this.weapon] = WEAPONS[this.weapon].mag
          this.reloading = false
          this.reloadT = 0
          this.magDropped = false
        },
        grantOvercharge: (seconds: number) => {
          this.overchargeT = Math.max(this.overchargeT, seconds)
          this.setBanner('PARRY OVERCLOCK')
        },
      })
    }
    return reflected
  }

  now(): number {
    return this.gameplayTime
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
    this.lastHitAt = this.gameplayTime
    this.waveDamaged = true
    this.combo = 0
    this.music.setComboRank(this.combo)
    this.env.setComboIntensity?.(1)
    this.bloomPass.strength = 0.26
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
    this.music.setComboRank(this.combo)
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
    this.env.setComboIntensity?.(mult)
    this.bloomPass.strength = 0.26 + (mult - 1) * 0.045
    const siphonHeal = this.hackManager.killHealAmount(mult)
    if (siphonHeal > 0) {
      this.health = Math.min(this.maxHealth, this.health + siphonHeal)
      this.pushPopup(`+${siphonHeal} HP`, 'heal', position)
    }
    const pts = DRONE_STATS[type].points * mult
    this.score += pts
    this.kills++
    this.pushPopup(`+${pts}`, mult >= 2 ? 'crit' : 'score', position)

    if (Math.random() < PICKUP_CHANCE) this.spawnPickup(position)

    if (this.director.wave > 0 && this.director.remaining === 0 && this.director.enemies.length <= 1 && this.levelManager.currentRoom && !this.levelManager.isCurrentRoomCleared()) {
      const room = this.levelManager.currentRoom
      this.levelManager.onRoomClear(room.roomId)
      this.setBanner(`ROOM CLEAR // ${room.roomName}`)
      this.sfx.streak()
      this.hitstop(0.1, 0.2)
    }
  }

  onGloryKill(position: THREE.Vector3) {
    this.gloryKillCount++
    this.music.triggerFilterDrop()
    this.hackManager.onGloryKill(position, {
      enemies: this.director.enemies,
      maxHp: (enemy) => DRONE_STATS[enemy.type].hp,
      damageEnemy: (enemy, damage, ignoreShield) => this.director.damageEnemy(enemy, damage, ignoreShield),
      resetDashCooldown: () => this.abilities.resetDashCooldown(),
      arc: (from, to) => this.electricArc(from, to),
    })
    this.spawnPickup(position, -1, 'heal', 35)
    this.spawnPickup(position, -1, 'overcharge')
    if (this.hackManager.bonusOverchargeSeconds > 0) {
      this.overchargeT = Math.max(this.overchargeT, OVERCHARGE_TIME + this.hackManager.bonusOverchargeSeconds)
    }
    this.score += 350
    this.pushPopup('+350 GLORY KILL', 'crit', position)
    this.setBanner(GLORY_KILL_BANNER)
    this.hitMarkerId++
    this.hitMarkerCrit = true
    if (this.draftHacks.length > 0) this.emit(true)
  }

  onSlam() {
    this.music.triggerFilterDrop()
  }

  onFrozenKill(position: THREE.Vector3) {
    const shattered = this.hackManager.onFrozenKill(position, {
      enemies: this.director.enemies,
      damageEnemy: (target, amount, bypass) => this.director.damageEnemy(target, amount, bypass),
      canHit: (a, b) => this.clearShot(a, b),
      arc: (a, b) => this.electricArc(a, b),
    })
    if (shattered > 0) {
      this.shockwave(position, 0x00f0ff, 9)
      this.pushPopup('CRYO SHATTER', 'crit', position)
    }
  }

  onBossPhaseChange(phase: 2 | 3) {
    this.setBanner(phase === 2 ? 'BOSS PHASE II // SPIRAL BARRAGE' : 'BOSS PHASE III // CRITICAL OVERDRIVE')
    this.hitstop(0.15, 0.16)
  }

  onWaveStart(_wave: number) {
    this.waveDamaged = false
    this.respawnCaches()
    this.respawnHazards()
    this.sfx.waveStart()
  }

  onWaveClear() {
    const clearedWave = this.director.wave
    if (clearedWave > 0 && clearedWave % 4 === 0 && this.levelManager.nextStage()) {
      const next = this.levelManager.currentStage
      this.env.applyStageTheme?.(next.environment)
      this.setBanner(`CHAPTER 0${next.chapter} // ${next.name}`)
      this.sfx.fanfare()
      this.timescale = 0.35
      return
    }
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

  onWaveDraft(draftHacks: NeonHack[]) {
    if (this.status !== 'playing' || draftHacks.length === 0) {
      this.director.resumeAfterDraft()
      return
    }
    this.draftHacks = [...draftHacks]
    this.firing = this.triggerQueued = false
    this.keys.clear()
    this.setStatus('paused')
    if (this.isLocked()) document.exitPointerLock()
    this.sfx.gloryPing()
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
    if (this.draftHacks.length > 0) {
      if (this.isLocked()) document.exitPointerLock()
      this.emit(true)
      return
    }
    if (this.isLocked()) {
      this.lockFailed = false
      if (this.started && this.status === 'paused') this.setStatus('playing')
    } else {
      this.clearInput()
      if (this.status === 'playing' && !this.lockFailed) this.setStatus('paused')
    }
    this.emit(true)
  }

  private onLockError = () => {
    this.lockFailed = true
    if (this.draftHacks.length > 0) return
    if (this.started && this.status !== 'playing' && this.status !== 'over') {
      this.setStatus('playing')
    }
    this.emit(true)
  }

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
  }

  private onMouseMove = (e: MouseEvent) => {
    if (this.status !== 'playing') return
    if (!this.isLocked() && !this.lockFailed) return
    const sensX = this.isAiming && this.weapon === 'sniper' ? 0.00085 : 0.0021
    const sensY = sensX * 1.15
    this.yaw -= e.movementX * sensX
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * sensY, -1.45, 1.45)
  }

  private onMouseDown = (e: MouseEvent) => {
    if (this.status !== 'playing') return
    if (e.target instanceof Element && e.target.closest('button, dialog, input, select, textarea')) return
    if (!this.isLocked() && this.draftHacks.length === 0 && !this.levelManager.storyModal.open) {
      this.lockFailed = false
      this.requestLock()
    }
    if (e.button === 0) {
      this.firing = true
      this.triggerQueued = true
    } else if (e.button === 2) {
      if (this.weapon === 'sniper') {
        this.isAiming = true
        this.emit()
      } else {
        this.tryPunch()
      }
    }
  }

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.firing = false
    if (e.button === 2) {
      if (this.isAiming) {
        this.isAiming = false
        this.emit()
      }
    }
  }

  private clearInput = () => {
    this.firing = false
    this.triggerQueued = false
    this.isAiming = false
    this.keys.clear()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.draftHacks.length > 0 || this.levelManager.storyModal.open) return
    if (e.isComposing || (e.target instanceof Element &&
      e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))) return
    if (e.code === 'KeyN') {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      e.preventDefault()
      this.nextTrack()
      return
    }
    if (e.code === 'Space') e.preventDefault()
    if (e.code === 'KeyM') {
      this.toggleMute()
      return
    }
    if (e.code === 'Escape' && this.lockFailed && this.status === 'playing') {
      e.preventDefault()
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
    }
    if (e.code === 'KeyQ') this.switchWeapon()
    if (!e.repeat && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4')) {
      const idx = Number(e.code.slice(5)) - 1
      const chosen = this.unlockedWeapons[idx]
      if (chosen && chosen !== this.weapon) this.selectWeapon(chosen)
    }
    if (e.code === 'KeyE' && !e.repeat) {
      if (this.levelManager.activeInteractable) {
        if (this.levelManager.interact()) {
          this.firing = false
          this.triggerQueued = false
          this.isAiming = false
          if (document.pointerLockElement) {
            document.exitPointerLock()
          }
          this.emit(true)
          return
        }
      }
      this.tryGloryKill()
    }
    if (e.code === 'KeyF' && !e.repeat) {
      if (this.director.hackSniperShot()) this.emit(true)
      else this.tryPunch()
    }
    // V, C, ControlLeft and G are permanently disabled per AGENTS.md.
    if (e.code === 'KeyR') this.tryReload()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  private onContainerClick = () => {
    if (this.draftHacks.length > 0 || this.levelManager.storyModal.open) return
    if (!this.isLocked()) {
      this.lockFailed = false
      this.requestLock()
    }
  }

  // ---------- weapons / abilities ----------

  private switchWeapon() {
    if (this.swapT > 0) return
    const idx = this.unlockedWeapons.indexOf(this.weapon)
    const nextIdx = (idx + 1) % this.unlockedWeapons.length
    this.selectWeapon(this.unlockedWeapons[nextIdx] ?? 'rifle')
  }

  private selectWeapon(next: WeaponId) {
    if (this.swapT > 0) return
    this.weapon = next
    this.isAiming = false
    this.reloading = false
    this.triggerQueued = false
    this.swapT = 0.25
    this.sfx.swap()
    this.emit()
  }

  private tryReload() {
    if (this.reloading || this.ammo[this.weapon] === WEAPONS[this.weapon].mag) return
    this.reloading = true
    this.magDropped = false
    this.reloadT = WEAPONS[this.weapon].reloadTime * this.hackManager.reloadTimeMultiplier
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
    this.ammo[this.weapon] -= this.hackManager.ammoCost(this.weapon)
    const baseCd = (w.fireCd / this.attackSpeedMult) * (this.overchargeT > 0 ? 0.55 : 1) * this.hackManager.fireCooldownMultiplier
    // Carry the partial frame forward, so held fire keeps its authored cadence.
    this.fireCd = Math.min(baseCd, this.fireCd < 0 ? this.fireCd + baseCd : baseCd)
    this.gunKick = w.kick
    this.recoil = Math.min(0.045, this.recoil + w.recoil)
    this.muzzleTimer = 0.045
    this.gunRig.flash.visible = true
    this.addShake(w.shake)
    const flashScale = w.flash * (this.overchargeT > 0 ? 1.4 : 1) * (0.8 + Math.random() * 0.4)
    this.gunRig.flash.scale.set(flashScale, flashScale, 1)
    if (this.weapon === 'deagle' || this.weapon === 'prism') this.sfx.deagle()
    else if (this.weapon === 'sniper') this.sfx.sniper()
    else this.sfx.shoot()

    // ejected shell casing sparks
    const casingPos = this.camera.localToWorld(new THREE.Vector3(0.62, -0.5, -1.1))
    this.particles.burst(casingPos, CASING_COLOR, 2, 2.2, 0.5)

    this.scene.updateMatrixWorld(true)
    this.camera.updateMatrixWorld()
    const from = this.camera.localToWorld(new THREE.Vector3(0.52, -0.28, -1.6))
    const chronoMult = this.hackManager.chronoDamageMultiplier(this.chronoTimeScale)
    const hazardProxies = this.hazards.map((h) => h.parts.proxy)
    const hitCtx = {
      enemies: this.director.enemies,
      damageEnemy: (target: Enemy, amount: number, bypass: boolean) => this.director.damageEnemy(target, amount, bypass),
      canHit: (a: THREE.Vector3, b: THREE.Vector3) => this.clearShot(a, b),
      arc: (_a: THREE.Vector3, b: THREE.Vector3) => this.particles.burst(b, SPARK_COLOR, 10, 6, 0.35),
    }

    if (this.weapon === 'prism') {
      // Prism Scattergun: 6-pellet close-range spread with clean impact sparks (no cluttered beam sticks).
      const pellets = PRISM_TRACERS.length
      const targets = [...this.director.raycastTargets(), ...hazardProxies, ...this.env.collidables]
      for (let i = 0; i < pellets; i++) {
        const angle = ((i / (pellets - 1)) - 0.5) * 0.14
        const lift = (i % 2 === 0 ? 1 : -1) * 0.022
        this.raycaster.setFromCamera(new THREE.Vector2(angle, lift), this.camera)
        this.raycaster.far = 48
        const hit = this.raycaster.intersectObjects(targets, false)[0]
        if (hit) {
          const end = hit.point
          const hazard = hit.object.userData['hazard'] as ActiveHazard | undefined
          const enemy = hit.object.userData['enemy'] as Enemy | undefined
          if (hazard) {
            this.detonateHazard(hazard)
          } else if (enemy) {
            const crit = Math.random() < w.critChance
            const dmg = w.dmg * chronoMult * (crit ? 1.8 : 1)
            const killed = this.director.damageEnemy(enemy, dmg, true)
            this.hitMarkerId++
            this.hitMarkerCrit = crit
            if (crit) this.sfx.crit()
            else this.sfx.hit()
            if (!killed) this.particles.burst(end, new THREE.Color(PRISM_TRACERS[i]!), 6, 6, 0.35)
            const origin = end.clone().addScaledVector(this.raycaster.ray.direction, -0.02)
            this.hackManager.onHit(enemy, dmg, { position: origin, kind: 'bullet', ignoreShield: true }, hitCtx)
          } else {
            this.particles.burst(end, new THREE.Color(PRISM_TRACERS[i]!), 4, 4, 0.3)
          }
        }
      }
      if (this.ammo[this.weapon] === 0) this.tryReload()
      return
    }

    this.raycaster.setFromCamera(CENTER, this.camera)
    this.raycaster.far = 200
    const targets = [...this.director.raycastTargets(), ...hazardProxies, ...this.env.collidables]
    const hits = this.raycaster.intersectObjects(targets, false)

    if (this.weapon === 'sniper') {
      // Gauss Sniper: true piercing railgun passes through every enemy until solid cover.
      let end = this.raycaster.ray.at(190, new THREE.Vector3())
      let pierceCount = 0
      const hitEnemies = new Set<Enemy>()
      for (const hit of hits) {
        const hazard = hit.object.userData['hazard'] as ActiveHazard | undefined
        if (hazard) {
          this.detonateHazard(hazard)
          continue
        }
        const enemy = hit.object.userData['enemy'] as Enemy | undefined
        if (!enemy) {
          end = hit.point
          this.particles.burst(end, SPARK_COLOR, 10, 6, 0.4)
          break
        }
        if (hitEnemies.has(enemy)) continue
        hitEnemies.add(enemy)
        pierceCount++
        const crit = Math.random() < w.critChance
        const dmg = w.dmg * chronoMult * (crit ? 2 : 1)
        const killed = this.director.damageEnemy(enemy, dmg, true)
        this.hitMarkerId++
        this.hitMarkerCrit = crit || pierceCount >= 2
        if (crit) this.sfx.crit()
        else this.sfx.hit()
        if (!killed) this.particles.burst(hit.point, SPARK_COLOR, 16, 8, 0.45)
        else this.timescale = Math.min(this.timescale, 0.45)
        const origin = hit.point.clone().addScaledVector(this.raycaster.ray.direction, -0.02)
        this.hackManager.onHit(enemy, dmg, { position: origin, kind: 'bullet', ignoreShield: true }, hitCtx)
      }
      if (pierceCount >= 2) this.setBanner(`RAIL PIERCE ×${pierceCount}`)
      this.addTracer(from, end, w.tracer, 0.015)
      if (this.ammo[this.weapon] === 0) this.tryReload()
      return
    }

    const hit = hits[0]
    if (hit) {
      const end = hit.point
      const hazard = hit.object.userData['hazard'] as ActiveHazard | undefined
      const enemy = hit.object.userData['enemy'] as Enemy | undefined
      let damage = w.dmg * chronoMult
      let ignoreShield = this.weapon === 'deagle'
      if (hazard) {
        this.detonateHazard(hazard)
      } else if (enemy) {
        const crit = Math.random() < w.critChance
        const dmg = w.dmg * chronoMult * (crit ? 2 : 1)
        damage = dmg
        ignoreShield ||= crit
        // The Eagle punches through armor; the rifle does not unless crit
        const killed = this.director.damageEnemy(enemy, dmg, ignoreShield)
        this.hitMarkerId++
        this.hitMarkerCrit = crit
        if (crit) this.sfx.crit()
        else this.sfx.hit()
        if (!killed) this.particles.burst(end, SPARK_COLOR, crit ? 16 : 9, 7, 0.4)
        if (killed && this.weapon === 'deagle') {
          this.timescale = Math.min(this.timescale, 0.45) // heavy caliber hit-stop
          if (crit) {
            this.ammo.deagle = Math.min(WEAPONS.deagle.mag, this.ammo.deagle + 2)
            this.pushPopup('+2 AMMO', 'gem', end)
          }
        }
      } else {
        this.particles.burst(end, SPARK_COLOR, 8, 5, 0.35)
      }
      const origin = end.clone().addScaledVector(this.raycaster.ray.direction, -0.02)
      this.hackManager.onHit(enemy ?? null, damage, { position: origin, kind: 'bullet', ignoreShield }, hitCtx)
    }
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

  private clearShot(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const direction = to.clone().sub(from)
    const distance = direction.length()
    if (distance < 0.001) return true
    for (const object of this.env.collidables) object.updateWorldMatrix(true, false)
    const ray = new THREE.Raycaster(from, direction.divideScalar(distance), 0, distance)
    return ray.intersectObjects(this.env.collidables, false).length === 0
  }

  private electricArc(_from: THREE.Vector3, to: THREE.Vector3) {
    this.particles.burst(to, SPARK_COLOR, 14, 7, 0.38)
  }

  // ---------- terrain helpers ----------

  /** Walkable surface height at (x, z) given the body's current height. */
  private groundAt(x: number, z: number, y: number): number {
    let top = WATER_Y
    for (const r of this.env.walkRects) {
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue
      if (r.top <= y + 0.05 && r.top > top) top = r.top
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
      born: this.gameplayTime,
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

  /** Volatile plasma/cryo canisters spawned across bridge & courtyard choke points. */
  private respawnHazards() {
    const spots = this.env.hazardSpots ?? []
    spots.forEach((spot, i) => {
      if (this.hazards.some((h) => h.spotIndex === i)) return
      const parts = makeHazardCanister(spot.kind)
      parts.group.position.set(spot.x, spot.y, spot.z)
      const active: ActiveHazard = { parts, baseY: spot.y, spotIndex: i }
      parts.proxy.userData['hazard'] = active
      this.scene.add(parts.group)
      this.hazards.push(active)
    })
  }

  private detonateHazard(hazard: ActiveHazard) {
    const idx = this.hazards.indexOf(hazard)
    if (idx < 0) return
    this.hazards.splice(idx, 1)
    delete hazard.parts.proxy.userData['hazard']
    const pos = hazard.parts.group.position.clone()
    this.scene.remove(hazard.parts.group)
    this.disposeGroup(hazard.parts.group)

    const isCryo = hazard.parts.kind === 'cryo'
    const radius = 11
    this.shockwave(pos, isCryo ? 0x00f0ff : 0xff4d2e, radius)
    this.particles.burst(pos, new THREE.Color(isCryo ? 0x00f0ff : 0xff7b29), 42, 13, 0.75)
    this.sfx.explode(true, this.sfxPan(pos))
    this.addShake(0.7)
    this.hitstop(0.08, 0.08)
    this.pushPopup(isCryo ? 'CRYO BLAST' : 'PLASMA BLAST', 'crit', pos)

    for (const enemy of [...this.director.enemies]) {
      if (enemy.parts.group.position.distanceTo(pos) > radius) continue
      if (isCryo) {
        enemy.frozenTimer = Math.max(enemy.frozenTimer ?? 0, 4.0)
        const killed = this.director.damageEnemy(enemy, 6, true)
        if (!killed) this.director.staggerEnemy(enemy)
      } else {
        this.director.damageEnemy(enemy, 18, true)
      }
    }
    // Chain-detonate adjacent canisters within blast radius
    for (const other of [...this.hazards]) {
      if (other.parts.group.position.distanceTo(pos) <= radius) {
        this.detonateHazard(other)
      }
    }
  }

  // ---------- helpers ----------

  private setStatus(s: GameStatus) {
    if (s === 'over') this.finishRun()
    this.status = s
    this.emit(true)
  }

  private finishRun() {
    if (!this.started || this.runRecorded) return
    this.runRecorded = true
    recordGameRun({
      score: this.score, wave: this.director.wave, combo: this.bestCombo,
      kills: this.kills, gloryKills: this.gloryKillCount,
      activeHacks: [...this.hackManager.activeHacks],
    })
  }

  private requestLock() {
    if (this.draftHacks.length > 0) return
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
      born: this.gameplayTime,
    })
  }

  private emit(force = false) {
    const t = this.gameplayTime
    const alivePopups = this.popups.filter((p) => t - p.born < 1.4)
    this.popups = alivePopups
    const snap: HudState = {
      sniperHack: this.director.sniperHackState(),
      status: this.status,
      health: Math.max(0, Math.round(this.health)),
      maxHealth: this.maxHealth,
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
      musicTrackName: this.music.getCurrentTrack().name,
      musicTrackBpm: this.music.getCurrentTrack().bpm,
      district: this.currentDistrict(),
      weapon: this.weapon,
      overchargeFrac: Math.max(0, Math.min(1, this.overchargeT / OVERCHARGE_TIME)),
      slideFrac: this.slideCd <= 0 ? 1 : 1 - this.slideCd / SLIDE_CD,
      abilities: this.abilities.stats(),
      draftOpen: this.draftHacks.length > 0,
      draftHacks: [...this.draftHacks],
      activeHacks: this.hackManager.list(),
      chronoTimeScale: this.chronoTimeScale,
      interactPrompt: this.levelManager.activeInteractable?.promptLabel ?? null,
      stageName: this.levelManager.currentStage.name,
      chapter: this.levelManager.currentStage.chapter,
      roomName: this.levelManager.currentRoom?.roomName,
      storyModal: { ...this.levelManager.storyModal },
      isAiming: this.isAiming,
      unlockedWeapons: [...this.unlockedWeapons],
      pointerLocked: this.isLocked(),
      bossHud: this.director.activeBossHud(),
      waveProtocol: this.director.activeProtocol(),
    }
    const key = JSON.stringify(snap)
    if (force || key !== this.lastEmit) {
      this.lastEmit = key
      this.onHud(snap)
    }
  }

  private currentDistrict(): string {
    const z = this.camera.position.z
    if (z < -284) return 'SOUTH PLAZA // NEON ARCADE'
    if (z <= 284) return 'BAY BRIDGE // TRANSIT SPAN'
    if (z <= 400) return 'NORTH GATE // LOGISTICS HUB'
    return 'SILICON VALLEY // QUANTUM CAMPUS'
  }

  private currentMult(): number {
    for (const [need, m] of MULT_TIERS) {
      if (this.combo >= need) return m
    }
    return 1
  }

  private resetRun() {
    this.runRecorded = false
    this.hackManager.reset()
    this.draftHacks = []
    this.gameplayTime = 0
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
    for (const h of this.hazards) {
      delete h.parts.proxy.userData['hazard']
      this.scene.remove(h.parts.group)
      this.disposeGroup(h.parts.group)
    }
    this.hazards = []
    this.boostTimer = 0
    this.boostDir.set(0, 0, 0)
    this.cacheAlive = CACHE_SPOTS.map(() => false)
    this.levelManager.loadStage(0)
    this.env.applyStageTheme?.(this.levelManager.currentStage.environment)
    this.env.setComboIntensity?.(1)
    this.bloomPass.strength = 0.26
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
    this.gloryKillCount = 0
    this.combo = 0
    this.music.setComboRank(this.combo)
    this.env.setComboIntensity?.(1)
    this.bloomPass.strength = 0.26
    this.comboTimer = 0
    this.bestCombo = 0
    this.lastMult = 1
    this.health = this.maxHealth
    this.lastHitAt = -99
    this.popups = []
    this.weapon = 'rifle'
    this.unlockedWeapons = ['rifle', 'deagle', 'prism']
    this.isAiming = false
    this.attackSpeedMult = 1.0
    this.ammo = {
      rifle: WEAPONS.rifle.mag,
      deagle: WEAPONS.deagle.mag,
      prism: WEAPONS.prism.mag,
      sniper: WEAPONS.sniper.mag,
    }
    this.reloading = false
    this.firing = false
    this.triggerQueued = false
    this.overchargeT = 0
    this.fireCd = 0
    this.muzzleTimer = 0
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
    this.launchVelocity.set(0, 0, 0)
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
    if (this.status !== 'playing') return
    if (this.levelManager.storyModal.open) {
      this.levelManager.update(this.pos, dtRaw)
      this.emit()
      return
    }
    this.gameplayTime += elapsed
    const t = this.gameplayTime
    this.hackManager.update(elapsed)

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
        this.music.setComboRank(this.combo)
        this.lastMult = 1
      }
    }

    // cooldowns
    this.punchCd = Math.max(0, this.punchCd - dtRaw)
    this.slideCd = Math.max(0, this.slideCd - dtRaw)
    if (this.overchargeT > 0) this.overchargeT -= dtRaw

    // Chrono-Miami: Tactical time-dilation
    const moving = (this.keys.has('KeyW') || this.keys.has('KeyS') || this.keys.has('KeyA') || this.keys.has('KeyD'))
    const isPlayerActive = !this.chronoMode || moving || this.gloryKills.isDashing || this.abilities.isDashing || this.firing || this.triggerQueued || this.reloading || this.slideT > 0 || this.punchAnim > 0 || this.abilities.isSlamming || !this.grounded || this.levelManager.storyModal.open
    const targetChrono = isPlayerActive ? 1.0 : 0.05
    this.chronoTimeScale = THREE.MathUtils.damp(this.chronoTimeScale, targetChrono, 12, dtRaw)
    this.music.setTimeDilation(this.chronoTimeScale)
    const worldDt = dt * this.chronoTimeScale

    // ---- movement ----
    const wasPhaseDashing = this.abilities.isDashing
    const dashing = this.gloryKills.isDashing || this.abilities.isDashing
    this.camera.rotation.set(this.pitch + this.recoil, this.yaw, 0)
    this.gloryKills.update(elapsed, t)
    this.abilities.update(dtRaw, t)
    if (wasPhaseDashing && !this.abilities.isDashing && this.hackManager.hasDashNova) {
      const origin = this.pos.clone()
      this.shockwave(origin, 0x29e3ff, 11)
      this.addShake(0.45)
      for (const e of [...this.director.enemies]) {
        if (e.parts.group.position.distanceTo(origin) > 11) continue
        const killed = this.director.damageEnemy(e, 6, true)
        if (!killed) this.director.staggerEnemy(e)
      }
    }
    if (this.draftHacks.length > 0) return
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
      const speed = (sprintKey ? SPRINT : WALK) * this.hackManager.speedMultiplier
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
    if (this.draftHacks.length > 0) return
    // Directional campus pads carry the player to the vault. Air steering still works.
    if (dashing || this.abilities.isSlamming) this.launchVelocity.set(0, 0, 0)
    if (!this.grounded && !dashing) this.pos.addScaledVector(this.launchVelocity, dt)
    // Soft world bounds
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -60, 60)
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -400, 700)

    // Wall collision (only against walls taller than the player)
    resolveWalls(this.env.walls, this.pos, 0.55, this.pos.y - EYE_OFFSET)

    // Jump / gravity with heightmap ground
    if (!dashing && this.keys.has('Space') && this.grounded) {
      if (this.slideT > 0) this.slideT = 0
      this.vy = 8
      this.grounded = false
    } else if (!dashing && !this.grounded) {
      // Wall run / climb mechanics
      let touchingWall = false
      let wallNx = 0
      let wallNz = 0
      for (const wall of this.env.walls) {
        if (wall.bottom !== undefined && this.pos.y + 0.55 < wall.bottom) continue
        if (this.pos.y > wall.h - 0.2 && (this.pos.y - EYE_OFFSET) > wall.h - 0.2) continue
        const cx = THREE.MathUtils.clamp(this.pos.x, wall.x - wall.hw, wall.x + wall.hw)
        const cz = THREE.MathUtils.clamp(this.pos.z, wall.z - wall.hd, wall.z + wall.hd)
        const dx = this.pos.x - cx
        const dz = this.pos.z - cz
        const distSq = dx * dx + dz * dz
        if (distSq <= (0.55 + 0.35) ** 2) {
          touchingWall = true
          const dist = Math.hypot(dx, dz)
          if (dist > 1e-4) {
            wallNx = dx / dist
            wallNz = dz / dist
          }
          break
        }
      }
      if (touchingWall) {
        this.wallJumpCooldown = Math.max(0, this.wallJumpCooldown - dt)
        if (this.vy < -4) {
          this.vy = Math.max(this.vy, -4.5)
        }
        if (this.keys.has('Space') && this.wallJumpCooldown <= 0 && this.wallJumpsRemaining > 0) {
          this.vy = 8.5
          this.wallJumpsRemaining--
          this.wallJumpCooldown = 0.35
          this.launchVelocity.set(wallNx * 4, 0, wallNz * 4)
          this.sfx.whoosh()
          this.particles.burst(this.pos, WALL_SPARK_COLOR, 6, 2.5, 0.4)
          this.banner = 'WALL CLIMB'
          this.bannerTimer = 0.65
          this.bannerId++
        }
      }
    }
    if (!dashing) this.vy -= 24 * dt
    let y = this.pos.y + (dashing ? 0 : this.vy * dt)
    // Catch upward crossings of suspended slabs, including fast pad launches.
    if (this.vy > 0) {
      for (const wall of this.env.walls) {
        if (wall.bottom === undefined || this.pos.y + 0.15 > wall.bottom) continue
        if (Math.abs(this.pos.x - wall.x) > wall.hw + 0.55 || Math.abs(this.pos.z - wall.z) > wall.hd + 0.55) continue
        if (y + 0.15 >= wall.bottom) {
          y = wall.bottom - 0.15
          this.vy = 0
        }
      }
    }
    // Only surfaces already below the feet can catch a falling player.
    const gy = this.groundAt(this.pos.x, this.pos.z, this.pos.y - EYE_OFFSET)
    const groundEye = gy + EYE_OFFSET
    if (this.vy <= 0 && y <= groundEye) {
      y = groundEye
      this.vy = 0
      this.grounded = true
      this.wallJumpsRemaining = 2
      this.wallJumpCooldown = 0
      this.launchVelocity.set(0, 0, 0)
      this.lastSafe.copy(this.pos)
      this.lastSafe.y = groundEye
    } else {
      this.grounded = false
    }
    this.pos.y = y
    if (this.grounded) this.abilities.onLanding()
    if (this.draftHacks.length > 0) return

    // Kinetic Boost Strips along the bridge & campus
    if (this.boostTimer > 0) {
      this.boostTimer = Math.max(0, this.boostTimer - dtRaw)
      if (!dashing) {
        this.pos.x += this.boostDir.x * 16 * dt
        this.pos.z += this.boostDir.z * 16 * dt
      }
    }
    if (this.grounded) {
      for (const strip of this.env.boostStrips ?? []) {
        if (Math.abs(this.pos.x - strip.x) <= strip.hw && Math.abs(this.pos.z - strip.z) <= strip.hd) {
          if (this.boostTimer <= 0.4) this.sfx.whoosh()
          this.boostTimer = 1.4
          this.boostDir.set(strip.dirX, 0, strip.dirZ)
          break
        }
      }
    }

    // Jump pads
    if (this.grounded) {
      for (const pad of this.env.pads) {
        const dx = this.pos.x - pad.x
        const dz = this.pos.z - pad.z
        if (dx * dx + dz * dz < 1.8 * 1.8 && Math.abs(this.pos.y - EYE_OFFSET - pad.y) < 0.2) {
          this.vy = pad.boost.y
          this.launchVelocity.set(pad.boost.x, 0, pad.boost.z)
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
      this.wallJumpsRemaining = 2
      this.wallJumpCooldown = 0
      this.abilities.cancelMotion()
      this.launchVelocity.set(0, 0, 0)
      this.damagePlayer(8)
      this.setBanner('WATCH YOUR STEP')
      this.addShake(0.6)
    }

    const bob = this.grounded && this.slideT <= 0 ? Math.sin(this.bobT) * 0.06 : 0
    const slideK = this.slideT > 0 ? Math.sin((1 - this.slideT / SLIDE_TIME) * Math.PI) : 0
    const slideDip = slideK * 0.9
    let baseFov = (sprintKey ? 82 : 75) + slideK * 8 + (this.boostTimer > 0 ? 7 : 0)
    if (this.isAiming && this.weapon === 'sniper') {
      baseFov = 24
    }
    const targetFov = Math.max(baseFov, this.gloryKills.fovFloor)
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dtRaw * 12)
    this.camera.updateProjectionMatrix()

    // Camera transform + shake + punch lunge
    this.recoil = Math.max(0, this.recoil - dt * 1.8)
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
    const gun = this.weapon === 'rifle'
      ? this.gunRig.rifle
      : this.weapon === 'deagle'
        ? this.gunRig.deagle
        : this.weapon === 'prism'
          ? this.gunRig.prism
          : this.gunRig.sniper
    this.gunKick = Math.max(0, this.gunKick - dt * 4.5)
    const isRifle = this.weapon === 'rifle'
    const baseX = isRifle ? 0.36 : 0.42
    const baseY = isRifle ? -0.31 : -0.34
    const baseZ = isRifle ? -0.68 : -0.82
    let gy2 = baseY
    let rotX = 0
    let rotZ = 0
    const reloadDuration = Math.max(0.1, w.reloadTime * this.hackManager.reloadTimeMultiplier)
    if (this.reloading) {
      this.reloadT -= dt
      const k = 1 - Math.max(this.reloadT, 0) / reloadDuration
      gy2 -= 0.24 * Math.sin(k * Math.PI)
      rotX = -0.58 * Math.sin(k * Math.PI)
      rotZ = k * Math.PI * 2
      if (!this.magDropped && k > 0.4) {
        this.magDropped = true
        const drop = this.camera.localToWorld(new THREE.Vector3(baseX, -0.7, -0.9))
        this.particles.burst(drop, CASING_COLOR, 7, 3, 0.6)
      }
      if (this.reloadT <= 0) {
        this.reloading = false
        this.ammo[this.weapon] = w.mag
      }
    }
    if (this.swapT > 0) {
      this.swapT -= dtRaw
      gy2 -= 0.4 * Math.max(this.swapT / 0.25, 0)
    }
    gun.position.set(baseX, gy2, baseZ + this.gunKick * 0.65)
    gun.rotation.set(rotX + this.gunKick * 0.28, 0.04, rotZ)
    if (this.gunRig.rifleBolt) {
      this.gunRig.rifleBolt.position.z = isRifle ? this.gunKick * 0.9 : 0
    }

    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt
      this.gunRig.flash.visible = this.muzzleTimer > 0
    } else {
      this.gunRig.flash.visible = false
    }

    // Firing
    const wantFire = w.auto ? this.firing || this.triggerQueued : this.triggerQueued
    // Idle/reload time is not shot debt. Only active fire can carry an overshoot.
    this.fireCd = !dashing && !this.reloading && wantFire
      ? this.fireCd - dt : Math.max(0, this.fireCd - dt)
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
    if (this.draftHacks.length > 0) return
    this.director.update(worldDt, t)
    if (this.draftHacks.length > 0) return

    const levelUpdate = this.levelManager.update(this.pos, dtRaw)
    if (levelUpdate.shouldSpawnRoomWave) {
      const room = this.levelManager.currentRoom
      if (room && room.waves.length > 0) {
        const dronesToQueue: DroneType[] = []
        for (const w of room.waves) {
          for (const drone of w.drones) {
            for (let i = 0; i < drone.count; i++) {
              dronesToQueue.push(drone.type)
            }
          }
        }
        this.director.queueRoomWave(dronesToQueue)
      }
    }

    // Animate volatile canisters
    for (let i = 0; i < this.hazards.length; i++) {
      const h = this.hazards[i]!
      h.parts.group.rotation.y += dt * 1.4
      h.parts.group.position.y = h.baseY + Math.sin(t * 2.2 + i) * 0.14
    }

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

    this.particles.update(worldDt)

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
    const t = this.status === 'menu' ? this.clock.elapsedTime : this.gameplayTime
    if (this.draftHacks.length === 0) this.env.update(t)

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
    this.gunRig.rifle.visible = showGun && this.weapon === 'rifle' && !this.isAiming
    this.gunRig.deagle.visible = showGun && this.weapon === 'deagle'
    this.gunRig.prism.visible = showGun && this.weapon === 'prism'
    this.gunRig.sniper.visible = showGun && this.weapon === 'sniper' && !this.isAiming
    if (this.status === 'playing') {
      this.update(dt, rawDelta)
    } else if (this.status === 'menu') {
      this.updateCinematic(t)
    }
    if (this.gradePass?.uniforms?.['uTime']) {
      this.gradePass.uniforms['uTime'].value = t
    }
    this.composer.render(dt)
  }
}
