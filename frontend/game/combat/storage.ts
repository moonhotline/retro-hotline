import { NEON_HACKS, type HackId } from './modifiers'

export interface PlayerProfile {
  highScore: number
  maxWave: number
  maxCombo: number
  totalKills: number
  totalGloryKills: number
  unlockedHacks: HackId[]
  sfxVolume: number // 0..1
  musicVolume: number // 0..1
  musicTrackIndex: number // 0..2
}

export const PROFILE_STORAGE_KEY = 'retro-hotline.profile.v1'
export const DEFAULT_PROFILE: Readonly<PlayerProfile> = Object.freeze({
  highScore: 0, maxWave: 0, maxCombo: 0, totalKills: 0, totalGloryKills: 0,
  unlockedHacks: [], sfxVolume: 0.7, musicVolume: 0.6, musicTrackIndex: 0,
})
Object.freeze(DEFAULT_PROFILE.unlockedHacks)

const counters = ['highScore', 'maxWave', 'maxCombo', 'totalKills', 'totalGloryKills'] as const
const hackIds = new Set<string>(NEON_HACKS.map((hack) => hack.id))
const count = (n: unknown, fallback = 0): number => typeof n === 'number' && Number.isFinite(n)
  ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(n))) : fallback

function normalize(value: unknown, base: Readonly<PlayerProfile> = DEFAULT_PROFILE): PlayerProfile {
  const profile = { ...base, unlockedHacks: [...base.unlockedHacks] }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return profile
  const fields = value as Record<string, unknown>
  for (const key of counters) profile[key] = count(fields[key], base[key])
  for (const key of ['sfxVolume', 'musicVolume'] as const) {
    const volume = fields[key]
    if (typeof volume === 'number' && Number.isFinite(volume)) profile[key] = Math.max(0, Math.min(1, volume))
  }
  const track = fields.musicTrackIndex
  if (typeof track === 'number' && Number.isInteger(track) && track >= 0 && track < 3) {
    profile.musicTrackIndex = track
  }
  if (Array.isArray(fields.unlockedHacks)) {
    profile.unlockedHacks = [...new Set(fields.unlockedHacks.filter(
      (id): id is HackId => typeof id === 'string' && hackIds.has(id)
    ))]
  }
  return profile
}

/** Storage may be absent during SSR, denied by the browser, or contain older/corrupt data. */
export function loadProfile(): PlayerProfile {
  try {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY)
      if (raw) return normalize(JSON.parse(raw))
    }
  } catch { /* Keep the game playable without persistence. */ }
  return normalize(null)
}

export function saveProfile(p: Partial<PlayerProfile>): PlayerProfile {
  const profile = normalize(p, loadProfile())
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  } catch { /* Quota and security failures must not interrupt a run. */ }
  return profile
}

/** Call once when a run ends; maxima persist, lifetime kills accumulate, hacks form a union. */
export function recordGameRun(run: {
  score: number; wave: number; combo: number; kills: number; gloryKills: number; activeHacks: HackId[]
}): PlayerProfile {
  const profile = loadProfile()
  return saveProfile({
    highScore: Math.max(profile.highScore, count(run.score)),
    maxWave: Math.max(profile.maxWave, count(run.wave)),
    maxCombo: Math.max(profile.maxCombo, count(run.combo)),
    totalKills: count(profile.totalKills + count(run.kills)),
    totalGloryKills: count(profile.totalGloryKills + count(run.gloryKills)),
    unlockedHacks: [...profile.unlockedHacks, ...run.activeHacks],
  })
}
