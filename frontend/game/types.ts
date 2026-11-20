import type { NeonHack } from './combat/modifiers'

export type GameStatus = 'menu' | 'playing' | 'paused' | 'over'
export type Mood = 'menu' | 'combat'
export type DroneType = 'swarm' | 'brawler' | 'gunner' | 'enforcer' | 'marksman' | 'aegis' | 'boss'
export type WeaponId = 'rifle' | 'deagle' | 'prism' | 'sniper'
export type PickupKind = 'heal' | 'gem' | 'stash' | 'overcharge'
export type PopupKind = 'score' | 'crit' | 'heal' | 'gem'

export interface BossHudState {
  name: string
  hp: number
  maxHp: number
  phase: 1 | 2 | 3
}

export interface WaveProtocolState {
  id: string
  label: string
  detail: string
  accent: string
}

export interface VehicleHudState {
  active: boolean
  speedKmh: number
  nitrous: number
  drifting: boolean
  boosting: boolean
}

export interface ShopItemData {
  id: string
  name: string
  description: string
  effect: string
  cost: number
  kind: 'heal' | 'attack_speed' | 'ammo'
}

export interface AbilityState {
  cooldown: number
  remaining: number
  fill: number
  ready: boolean
  active: boolean
}

export interface AbilityStates {
  phaseDash: AbilityState
  pulseParry: AbilityState
  kineticSlam: AbilityState
}

export interface Popup {
  id: number
  text: string
  kind: PopupKind
  x: number // 0..1 horizontal screen fraction
  y: number // 0..1 vertical screen fraction
}

export interface SniperWarning {
  id: string
  bearing: number // radians: front 0, right PI/2, rear PI
  progress: number
  urgent: boolean
  redirected: boolean
}

export interface SniperHackState {
  warnings: SniperWarning[]
  status: 'none' | 'aim' | 'blocked' | 'ready' | 'redirected' | 'cooldown'
  cooldown: number
}

export interface HudState {
  sniperHack?: SniperHackState
  status: GameStatus
  health: number
  maxHealth?: number
  ammo: number
  mag: number
  reloading: boolean
  reloadFrac: number
  score: number
  kills: number
  wave: number
  alive: number
  remaining: number
  combo: number
  mult: number
  comboFrac: number
  bestCombo: number
  hitMarkerId: number
  hitMarkerCrit: boolean
  banner: string
  bannerId: number
  popups: Popup[]
  muted: boolean
  musicTrackName?: string
  musicTrackBpm?: number
  district?: string
  weapon: WeaponId
  overchargeFrac: number
  slideFrac: number
  abilities: AbilityStates
  draftOpen: boolean
  draftHacks: NeonHack[]
  activeHacks: NeonHack[]
  chronoTimeScale?: number
  interactPrompt?: string | null
  stageName?: string
  chapter?: number
  roomName?: string
  isAiming?: boolean
  unlockedWeapons?: WeaponId[]
  pointerLocked?: boolean
  bossHud?: BossHudState | null
  waveProtocol?: WaveProtocolState | null
  vehicle?: VehicleHudState | null
  storyModal?: {
    open: boolean
    entityId: string
    title: string
    badge: string
    lines: Array<{
      speaker: string
      roleBadge?: string
      text?: string
      textEn?: string
      textZh?: string
    }>
    promptLabel: string
    isShopOpen?: boolean
    shopItems?: ShopItemData[]
  }
}
