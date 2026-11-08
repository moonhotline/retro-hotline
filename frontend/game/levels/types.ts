import type { DroneType } from '../types'

export type AudioScale = 'phrygian' | 'aeolian' | 'cyberpunk_minor' | 'synthwave'
export type BassType = 'reese' | 'acid' | 'sub_pulse'

export interface EnvironmentTheme {
  districtId: string
  districtName: string
  skyColor: number
  groundColor: number
  fogColor: number
  fogDensity: number
  neonPrimary: number
  neonSecondary: number
  neonAmbient: number
  trafficLanes: boolean
  rainIntensity: number
}

export interface AudioTheme {
  trackName: string
  baseBpm: number
  rootNote: string
  scale: AudioScale
  bassType: BassType
  trackIndex: number
}

export interface DialogueLine {
  speaker: string
  roleBadge: string
  text?: string
  textEn?: string
  textZh?: string
}

export interface StoryEntityDefinition {
  id: string
  kind: 'terminal' | 'informant_npc' | 'data_cache' | 'extraction_door' | 'hacker_merchant'
  position: [x: number, y: number, z: number]
  interactionRadius: number
  promptLabel: string // PS5 prompt: "◻︎ HACK CONSOLE" / "◻︎ INTERROGATE"
  dialogue: {
    title: string
    badge: string
    lines: DialogueLine[]
  }
  onCompleteAction?: 'unlock_door' | 'trigger_wave' | 'complete_stage' | 'gift_sniper' | 'open_shop'
  shopItems?: Array<{
    id: string
    name: string
    description: string
    effect: string
    cost: number
    kind: 'heal' | 'attack_speed' | 'ammo'
  }>
}

export interface WaveGroup {
  delayMs: number
  spawnOrigin?: [number, number, number]
  drones: Array<{
    type: DroneType
    count: number
  }>
}

export interface LevelRoomEncounter {
  roomId: string
  roomName: string
  bounds: {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
  }
  spawnTrigger: 'on_enter' | 'on_hack_terminal' | 'immediate'
  waves: WaveGroup[]
  parTimeSeconds: number
}

export interface LevelManifest {
  id: string
  code: string
  chapter: number
  name: string
  subtitle: string
  briefing: string
  environment: EnvironmentTheme
  audio: AudioTheme
  storyEntities: StoryEntityDefinition[]
  rooms: LevelRoomEncounter[]
}
