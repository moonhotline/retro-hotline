export type GameStatus = 'menu' | 'playing' | 'paused' | 'over'
export type Mood = 'menu' | 'combat'
export type DroneType = 'swarm' | 'brawler' | 'gunner' | 'enforcer' | 'marksman' | 'boss'
export type WeaponId = 'rifle' | 'deagle'
export type PickupKind = 'heal' | 'gem' | 'stash' | 'overcharge'
export type PopupKind = 'score' | 'crit' | 'heal' | 'gem'

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

export interface HudState {
  status: GameStatus
  health: number
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
  weapon: WeaponId
  overchargeFrac: number
  slideFrac: number
  abilities: AbilityStates
}
