import * as THREE from 'three'
import type { DialogueLine, LevelManifest, StoryEntityDefinition } from './types'
import type { ShopItemData } from '../types'
import { DEFAULT_STAGES } from './registry'
import { circleLine, edgeBox, makeGlowSprite } from '../effects'
import type { Sfx } from '../audio'

export interface ActiveStoryModalState {
  open: boolean
  entityId: string
  title: string
  badge: string
  lines: DialogueLine[]
  promptLabel: string
  isShopOpen?: boolean
  shopItems?: ShopItemData[]
}

export class LevelManager {
  private stages: LevelManifest[]
  private currentStageIndex = 0
  private currentRoomIndex = 0
  private roomClearedMap = new Map<string, boolean>()
  private roomSpawnedMap = new Map<string, boolean>()
  private scene: THREE.Scene | null = null
  private sfx: Sfx | null = null
  private entityGroups = new Map<string, THREE.Group>()
  private pulsePhase = 0

  activeInteractable: StoryEntityDefinition | null = null
  storyModal: ActiveStoryModalState = {
    open: false,
    entityId: '',
    title: '',
    badge: '',
    lines: [],
    promptLabel: '',
  }

  constructor(stages: LevelManifest[] = [...DEFAULT_STAGES]) {
    this.stages = stages.length > 0 ? stages : [...DEFAULT_STAGES]
  }

  bindScene(scene: THREE.Scene, sfx?: Sfx) {
    this.scene = scene
    this.sfx = sfx ?? null
    this.rebuildEntityVisuals()
  }

  get currentStage(): LevelManifest {
    return this.stages[this.currentStageIndex] ?? this.stages[0]!
  }

  get currentRoom() {
    return this.currentStage.rooms[this.currentRoomIndex] ?? null
  }

  get stageIndex(): number {
    return this.currentStageIndex
  }

  get roomIndex(): number {
    return this.currentRoomIndex
  }

  get totalRooms(): number {
    return this.currentStage.rooms.length
  }

  loadStage(index: number) {
    this.currentStageIndex = Math.max(0, Math.min(index, this.stages.length - 1))
    this.currentRoomIndex = 0
    this.roomClearedMap.clear()
    this.roomSpawnedMap.clear()
    this.activeInteractable = null
    this.closeDialogue()
    this.rebuildEntityVisuals()
  }

  restartStage() {
    this.currentRoomIndex = 0
    this.roomClearedMap.clear()
    this.roomSpawnedMap.clear()
    this.activeInteractable = null
    this.closeDialogue()
  }

  nextStage(): boolean {
    if (this.currentStageIndex < this.stages.length - 1) {
      this.loadStage(this.currentStageIndex + 1)
      return true
    }
    return false
  }

  private rebuildEntityVisuals() {
    if (!this.scene) return
    // Clean up previous entity meshes
    for (const group of this.entityGroups.values()) {
      this.scene.remove(group)
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const m of list) m.dispose()
        }
      })
    }
    this.entityGroups.clear()

    const manifest = this.currentStage
    const primary = manifest.environment.neonPrimary
    const secondary = manifest.environment.neonSecondary

    for (const entity of manifest.storyEntities) {
      const group = new THREE.Group()
      group.position.set(...entity.position)

      if (entity.kind === 'terminal') {
        this.buildTerminalVisuals(group, primary, secondary)
      } else if (entity.kind === 'hacker_merchant') {
        this.buildMerchantVisuals(group, primary, secondary)
      } else {
        this.buildInformantVisuals(group, primary, secondary)
      }

      // Reconstructed Multi-Layer Tactical Breathing Aura
      this.buildBreathingAura(group, entity.interactionRadius, primary, secondary, entity.kind)

      this.scene.add(group)
      this.entityGroups.set(entity.id, group)
    }
  }

  /**
   * Reconstructed Futuristic Cyberpunk Holographic Terminal Pillar
   */
  private buildTerminalVisuals(group: THREE.Group, primary: number, secondary: number) {
    // 1. Solid Architectural Tri-Tier Vector Base Plinth
    const baseOctA = circleLine(0.95, primary, 8, 0.95)
    baseOctA.rotation.x = Math.PI / 2
    baseOctA.position.y = 0.05
    group.add(baseOctA)

    const baseOctB = circleLine(0.72, secondary, 8, 0.85)
    baseOctB.rotation.x = Math.PI / 2
    baseOctB.position.y = 0.16
    group.add(baseOctB)

    const baseOctC = circleLine(0.52, primary, 8, 0.9)
    baseOctC.rotation.x = Math.PI / 2
    baseOctC.position.y = 0.3
    group.add(baseOctC)

    // Base diagonal corner reinforcements
    const baseBevelPts: THREE.Vector3[] = []
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      baseBevelPts.push(
        new THREE.Vector3(cos * 0.95, 0.05, sin * 0.95),
        new THREE.Vector3(cos * 0.52, 0.3, sin * 0.52)
      )
    }
    const baseBevel = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(baseBevelPts),
      new THREE.LineBasicMaterial({ color: secondary, transparent: true, opacity: 0.7 })
    )
    group.add(baseBevel)

    // 2. High-Tech Conduit Struts (Vertical tapered pillar cage)
    const strutPts: THREE.Vector3[] = []
    const baseR = 0.38
    const topR = 0.24
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const bx = Math.cos(a) * baseR
      const bz = Math.sin(a) * baseR
      const tx = Math.cos(a) * topR
      const tz = Math.sin(a) * topR
      strutPts.push(new THREE.Vector3(bx, 0.3, bz), new THREE.Vector3(tx, 1.35, tz))
    }
    const strutGeo = new THREE.BufferGeometry().setFromPoints(strutPts)
    const strutMat = new THREE.LineBasicMaterial({ color: primary, transparent: true, opacity: 0.85 })
    group.add(new THREE.LineSegments(strutGeo, strutMat))

    // Conduit Horizontal Rings at intervals
    for (const y of [0.55, 0.85, 1.15]) {
      const band = circleLine(0.32 - (y - 0.55) * 0.08, secondary, 16, 0.75)
      band.rotation.x = Math.PI / 2
      band.position.y = y
      group.add(band)
    }

    // 3. Floating Quantum Energy Core (Rotating Diamond)
    const diamondGroup = new THREE.Group()
    diamondGroup.position.set(0, 0.85, 0)
    diamondGroup.name = 'energyCore'

    const dRingA = circleLine(0.24, primary, 4, 1.0)
    const dRingB = circleLine(0.24, secondary, 4, 1.0)
    dRingB.rotation.y = Math.PI / 2
    diamondGroup.add(dRingA, dRingB)

    const coreGlow = makeGlowSprite(primary, 1.5, 0.95)
    diamondGroup.add(coreGlow)
    group.add(diamondGroup)

    // 4. Floating Tilted Console Interface Desk
    const deskEdge = edgeBox(0.92, 0.08, 0.62, primary, 0.95)
    deskEdge.position.set(0, 1.32, 0)
    deskEdge.rotation.x = -0.22
    group.add(deskEdge)

    // 5. Holographic Projection Display
    const holoFrame = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.48, -0.3, 0),
        new THREE.Vector3(0.48, -0.3, 0),
        new THREE.Vector3(0.48, 0.3, 0),
        new THREE.Vector3(-0.48, 0.3, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x9ffcff, transparent: true, opacity: 0.9 })
    )
    holoFrame.position.set(0, 1.68, 0.12)
    holoFrame.rotation.x = -0.25
    group.add(holoFrame)

    // Holographic Display Ambient Glow
    const holoGlow = makeGlowSprite(secondary, 1.6, 0.7)
    holoGlow.position.set(0, 1.68, 0.12)
    group.add(holoGlow)

    // Sweeping Scanline inside Hologram
    const scanlineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.44, 0, 0),
      new THREE.Vector3(0.44, 0, 0),
    ])
    const scanline = new THREE.Line(scanlineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }))
    scanline.name = 'scanline'
    scanline.position.set(0, 1.68, 0.13)
    scanline.rotation.x = -0.25
    group.add(scanline)

    // 6. Floating PlayStation Prompt Glyph (◻︎ HACK GLYPH)
    const promptGlyph = new THREE.Group()
    promptGlyph.name = 'promptGlyph'
    promptGlyph.position.set(0, 2.15, 0)
    const squareOutline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.16, -0.16, 0),
        new THREE.Vector3(0.16, -0.16, 0),
        new THREE.Vector3(0.16, 0.16, 0),
        new THREE.Vector3(-0.16, 0.16, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffd319, transparent: true, opacity: 0.95 })
    )
    const promptGlow = makeGlowSprite(0xffd319, 0.9, 0.85)
    promptGlyph.add(squareOutline, promptGlow)
    group.add(promptGlyph)
  }

  /**
   * Cyberpunk Black Market Hacker Merchant (GHOST)
   */
  private buildMerchantVisuals(group: THREE.Group, _primary: number, _secondary: number) {
    // 1. Operative Body & Trenchcoat Silhouette
    const trenchPts = [
      new THREE.Vector3(-0.4, 1.45, 0),
      new THREE.Vector3(0.4, 1.45, 0),
      new THREE.Vector3(0.55, 0.15, 0),
      new THREE.Vector3(-0.55, 0.15, 0),
    ]
    const trench = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(trenchPts),
      new THREE.LineBasicMaterial({ color: 0x8a2be2, transparent: true, opacity: 0.9 })
    )
    group.add(trench)

    // Inner operative vest
    const vest = edgeBox(0.44, 0.7, 0.25, 0x00f0ff, 0.8)
    vest.position.set(0, 1.05, 0)
    group.add(vest)

    // Operative Hood & Amber Cyber Visor
    const head = circleLine(0.22, 0x8a2be2, 24, 0.95)
    head.position.set(0, 1.68, 0)
    const visorGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.18, 1.66, 0.06),
      new THREE.Vector3(0.18, 1.66, 0.06),
    ])
    const visor = new THREE.Line(visorGeo, new THREE.LineBasicMaterial({ color: 0xffd319, transparent: true, opacity: 1.0 }))
    group.add(head, visor)

    // 2. Weapon Display Pedestal on the right
    const pedestal = edgeBox(0.65, 0.85, 0.55, 0x8a2be2, 0.75)
    pedestal.position.set(1.15, 0.42, 0)
    group.add(pedestal)

    const pedestalRing = circleLine(0.35, 0x00f0ff, 16, 0.85)
    pedestalRing.rotation.x = Math.PI / 2
    pedestalRing.position.set(1.15, 0.86, 0)
    group.add(pedestalRing)

    // 3. Floating Holographic Sniper Rifle on Display
    const floatingSniper = new THREE.Group()
    floatingSniper.name = 'floatingSniper'
    floatingSniper.position.set(1.15, 1.15, 0)

    const miniBody = edgeBox(0.08, 0.1, 0.55, 0xff0055, 0.9)
    const miniBarrel = edgeBox(0.04, 0.04, 0.65, 0x00f0ff, 0.95)
    miniBarrel.position.set(0, 0.03, -0.55)
    const miniScope = edgeBox(0.05, 0.07, 0.22, 0xffd319, 0.9)
    miniScope.position.set(0, 0.1, -0.1)
    floatingSniper.add(miniBody, miniBarrel, miniScope)

    const sniperGlow = makeGlowSprite(0xff0055, 1.1, 0.8)
    floatingSniper.add(sniperGlow)
    group.add(floatingSniper)

    // 4. Ground Contraband Tech Crate on the left
    const crate = edgeBox(0.55, 0.4, 0.5, 0x00f0ff, 0.8)
    crate.position.set(-1.05, 0.2, 0)
    group.add(crate)

    // 5. Floating PlayStation Prompt Glyph (◻︎ BLACK MARKET GLYPH)
    const promptGlyph = new THREE.Group()
    promptGlyph.name = 'promptGlyph'
    promptGlyph.position.set(0, 2.15, 0)
    const squareOutline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.16, -0.16, 0),
        new THREE.Vector3(0.16, -0.16, 0),
        new THREE.Vector3(0.16, 0.16, 0),
        new THREE.Vector3(-0.16, 0.16, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffd319, transparent: true, opacity: 0.95 })
    )
    const promptGlow = makeGlowSprite(0xffd319, 0.9, 0.85)
    promptGlyph.add(squareOutline, promptGlow)
    group.add(promptGlyph)
  }

  /**
   * Reconstructed Informant NPC Operative Wireframe Silhouette
   */
  private buildInformantVisuals(group: THREE.Group, primary: number, secondary: number) {
    // Operative Torso & Coat Silhouette
    const torsoPts = [
      new THREE.Vector3(-0.35, 1.4, 0),
      new THREE.Vector3(0.35, 1.4, 0),
      new THREE.Vector3(0.45, 0.3, 0),
      new THREE.Vector3(-0.45, 0.3, 0),
    ]
    const torso = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(torsoPts),
      new THREE.LineBasicMaterial({ color: secondary, transparent: true, opacity: 0.85 })
    )
    group.add(torso)

    // Head / Visor Ring
    const head = circleLine(0.2, primary, 24, 0.9)
    head.position.set(0, 1.65, 0)
    const visorGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.16, 1.63, 0.05),
      new THREE.Vector3(0.16, 1.63, 0.05),
    ])
    const visor = new THREE.Line(visorGeo, new THREE.LineBasicMaterial({ color: 0xffd319, transparent: true, opacity: 1.0 }))
    group.add(head, visor)

    // Floating PlayStation ✕ Glyph
    const crossGroup = new THREE.Group()
    crossGroup.name = 'promptGlyph'
    crossGroup.position.set(0, 2.1, 0)
    const crossGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.15, -0.15, 0), new THREE.Vector3(0.15, 0.15, 0),
      new THREE.Vector3(-0.15, 0.15, 0), new THREE.Vector3(0.15, -0.15, 0),
    ])
    const crossLines = new THREE.LineSegments(crossGeo, new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.95 }))
    const crossGlow = makeGlowSprite(0x00f0ff, 0.9, 0.85)
    crossGroup.add(crossLines, crossGlow)
    group.add(crossGroup)
  }

  /**
   * Reconstructed High-Fidelity Tactical Breathing Aura
   */
  private buildBreathingAura(group: THREE.Group, radius: number, primary: number, secondary: number, kind: string) {
    const auraGroup = new THREE.Group()
    auraGroup.name = 'auraGroup'
    auraGroup.position.set(0, 0.05, 0)

    // Layer 1: Ground Ambient Glow Disc (Smooth radial gradient light pool)
    const groundGlow = makeGlowSprite(primary, radius * 2.4, 0.45)
    groundGlow.name = 'groundGlow'
    groundGlow.position.set(0, 0.02, 0)
    auraGroup.add(groundGlow)

    // Layer 2: Outer Precision Reticle Ring
    const outerRing = circleLine(radius, primary, 64, 0.85)
    outerRing.rotation.x = Math.PI / 2
    outerRing.name = 'outerRing'
    auraGroup.add(outerRing)

    // 4 Outer Crosshair Reticle Brackets
    const tickLen = 0.35
    const tickPts: THREE.Vector3[] = []
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      tickPts.push(
        new THREE.Vector3(cos * (radius - 0.1), 0, sin * (radius - 0.1)),
        new THREE.Vector3(cos * (radius + tickLen), 0, sin * (radius + tickLen))
      )
    }
    const ticksGeo = new THREE.BufferGeometry().setFromPoints(tickPts)
    const ticks = new THREE.LineSegments(ticksGeo, new THREE.LineBasicMaterial({ color: primary, transparent: true, opacity: 0.9 }))
    ticks.name = 'outerTicks'
    auraGroup.add(ticks)

    // Layer 3: Concentric Gyroscopic Inner Ring (Counter-rotating data circle)
    const innerRing = circleLine(radius * 0.68, secondary, 48, 0.65)
    innerRing.rotation.x = Math.PI / 2
    innerRing.name = 'innerRing'
    auraGroup.add(innerRing)

    // Layer 4: Center PlayStation Target Rune on Ground
    let runeMesh: THREE.Object3D
    if (kind === 'terminal') {
      // Rotating Square Rune
      const s = 0.45
      runeMesh = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-s, 0, -s),
          new THREE.Vector3(s, 0, -s),
          new THREE.Vector3(s, 0, s),
          new THREE.Vector3(-s, 0, s),
        ]),
        new THREE.LineBasicMaterial({ color: 0xffd319, transparent: true, opacity: 0.8 })
      )
    } else {
      // Rotating Cross Rune
      const s = 0.4
      runeMesh = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-s, 0, -s), new THREE.Vector3(s, 0, s),
          new THREE.Vector3(-s, 0, s), new THREE.Vector3(s, 0, -s),
        ]),
        new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.8 })
      )
    }
    runeMesh.name = 'targetRune'
    auraGroup.add(runeMesh)

    group.add(auraGroup)
  }

  update(playerPos: THREE.Vector3, dt: number): {
    canInteract: StoryEntityDefinition | null
    roomAdvance: boolean
    shouldSpawnRoomWave: boolean
  } {
    this.pulsePhase += dt * 2.8
    const breatheSin = Math.sin(this.pulsePhase)
    const breatheScale = 1.0 + breatheSin * 0.06

    // Animate all entity holograms and tactical breathing auras
    for (const group of this.entityGroups.values()) {
      const aura = group.getObjectByName('auraGroup')
      if (aura) {
        const outerRing = aura.getObjectByName('outerRing')
        const outerTicks = aura.getObjectByName('outerTicks')
        const innerRing = aura.getObjectByName('innerRing')
        const targetRune = aura.getObjectByName('targetRune')
        const groundGlow = aura.getObjectByName('groundGlow') as THREE.Sprite | undefined

        // Smooth breathing scale
        if (outerRing) outerRing.scale.set(breatheScale, breatheScale, 1)
        if (outerTicks) outerTicks.scale.set(breatheScale, 1, breatheScale)
        // Counter-rotating inner ring and rune
        if (innerRing) innerRing.rotation.z -= dt * 0.6
        if (targetRune) targetRune.rotation.y += dt * 0.8
        // Breathing ambient pool glow
        if (groundGlow && groundGlow.material) {
          groundGlow.material.opacity = 0.35 + breatheSin * 0.15
        }
      }

      // Animate Terminal Core & Hologram Scanline
      const energyCore = group.getObjectByName('energyCore')
      if (energyCore) {
        energyCore.rotation.y += dt * 1.8
        energyCore.rotation.x += dt * 1.2
      }

      const scanline = group.getObjectByName('scanline')
      if (scanline) {
        scanline.position.y = 1.58 + Math.sin(this.pulsePhase * 1.6) * 0.22
      }

      const promptGlyph = group.getObjectByName('promptGlyph')
      if (promptGlyph) {
        promptGlyph.position.y = 2.05 + Math.sin(this.pulsePhase * 1.5) * 0.08
        promptGlyph.rotation.y += dt * 1.4
      }

      const floatingSniper = group.getObjectByName('floatingSniper')
      if (floatingSniper) {
        floatingSniper.rotation.y += dt * 1.5
        floatingSniper.position.y = 1.15 + Math.sin(this.pulsePhase * 2.2) * 0.05
      }
    }

    // Check interaction distance
    let nearest: StoryEntityDefinition | null = null
    let minDist = Infinity

    for (const entity of this.currentStage.storyEntities) {
      const pos = new THREE.Vector3(...entity.position)
      const dist = pos.distanceTo(playerPos)
      if (dist <= entity.interactionRadius && dist < minDist) {
        minDist = dist
        nearest = entity
      }
    }
    this.activeInteractable = nearest

    // Check room bounds trigger (STRICTLY ONCE per room)
    let shouldSpawnRoomWave = false
    const room = this.currentRoom
    if (room && !this.roomClearedMap.get(room.roomId) && !this.roomSpawnedMap.get(room.roomId)) {
      if (
        playerPos.x >= room.bounds.minX &&
        playerPos.x <= room.bounds.maxX &&
        playerPos.z >= room.bounds.minZ &&
        playerPos.z <= room.bounds.maxZ
      ) {
        if (room.spawnTrigger === 'on_enter' || room.spawnTrigger === 'immediate') {
          shouldSpawnRoomWave = true
          this.roomSpawnedMap.set(room.roomId, true)
        }
      }
    }

    return {
      canInteract: this.activeInteractable,
      roomAdvance: false,
      shouldSpawnRoomWave,
    }
  }

  markRoomSpawned(roomId: string) {
    this.roomSpawnedMap.set(roomId, true)
  }

  isRoomSpawned(roomId: string): boolean {
    return this.roomSpawnedMap.get(roomId) ?? false
  }

  interact(): boolean {
    if (!this.activeInteractable) return false
    const ent = this.activeInteractable
    this.storyModal = {
      open: true,
      entityId: ent.id,
      title: ent.dialogue.title,
      badge: ent.dialogue.badge,
      lines: ent.dialogue.lines,
      promptLabel: ent.promptLabel,
      isShopOpen: ent.kind === 'hacker_merchant' || Boolean(ent.shopItems && ent.shopItems.length > 0),
      shopItems: ent.shopItems,
    }
    this.sfx?.gloryPing()
    return true
  }

  closeDialogue(): { action?: 'unlock_door' | 'trigger_wave' | 'complete_stage' | 'gift_sniper' | 'open_shop' } {
    if (!this.storyModal.open) return {}
    const ent = this.activeInteractable
    const action = ent?.onCompleteAction

    if (ent && ent.kind === 'hacker_merchant' && action === 'gift_sniper') {
      ent.onCompleteAction = 'open_shop'
      ent.dialogue.title = 'BLACK MARKET // GHOST'
      ent.dialogue.badge = 'BLACK MARKET'
      ent.dialogue.lines = [
        {
          speaker: 'GHOST // 黑客黑市商人',
          roleBadge: 'BLACK MARKET OPERATIVE',
          textEn: 'Back again, runner? The black market remembers its regulars.',
          textZh: '又回来了，跑者？幽灵黑市记得自己的熟客。',
        },
      ]
    }

    this.storyModal = {
      open: false,
      entityId: '',
      title: '',
      badge: '',
      lines: [],
      promptLabel: '',
    }
    if (action === 'complete_stage') {
      this.nextStage()
    }
    return { action }
  }

  onRoomClear(roomId: string) {
    this.roomClearedMap.set(roomId, true)
    if (this.currentRoomIndex < this.currentStage.rooms.length - 1) {
      this.currentRoomIndex++
    }
  }

  isCurrentRoomCleared(): boolean {
    const r = this.currentRoom
    return r ? (this.roomClearedMap.get(r.roomId) ?? false) : true
  }

  dispose() {
    if (this.scene) {
      for (const group of this.entityGroups.values()) {
        this.scene.remove(group)
        group.traverse((obj) => {
          const mesh = obj as THREE.Mesh & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }
          if (mesh.geometry) mesh.geometry.dispose()
          if (mesh.material) {
            const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            for (const m of list) m.dispose()
          }
        })
      }
    }
    this.entityGroups.clear()
  }
}
