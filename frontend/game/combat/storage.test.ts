import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE, PROFILE_STORAGE_KEY, loadProfile, recordGameRun, saveProfile } from './storage'
import type { PlayerProfile } from './storage'
import { installTestStorage } from '../testStorage'

beforeEach(installTestStorage)
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const run = { score: 1200, wave: 3, combo: 8, kills: 15, gloryKills: 4, activeHacks: ['freeze'] as const }
const record = (patch = {}) => recordGameRun({ ...run, activeHacks: [...run.activeHacks], ...patch })

describe('player profiles', () => {
  it('returns independent default profiles without writing storage', () => {
    const first = loadProfile()
    expect(first).toEqual({ highScore: 0, maxWave: 0, maxCombo: 0, totalKills: 0, totalGloryKills: 0,
      unlockedHacks: [], sfxVolume: 0.7, musicVolume: 0.6, musicTrackIndex: 0 })
    first.unlockedHacks.push('freeze')
    first.highScore = 9
    expect(loadProfile()).toEqual(DEFAULT_PROFILE)
    expect(window.localStorage.length).toBe(0)
  })

  it('round trips all fields and merges partial updates without mutating inputs', () => {
    const profile: PlayerProfile = { highScore: 500, maxWave: 2, maxCombo: 5, totalKills: 10,
      totalGloryKills: 3, unlockedHacks: ['burn'], sfxVolume: 0.2, musicVolume: 0.9, musicTrackIndex: 2 }
    expect(saveProfile(profile)).toEqual(profile)
    expect(loadProfile()).toEqual(profile)
    const saved = saveProfile({ musicVolume: 0.1 })
    expect(saved).toEqual({ ...profile, musicVolume: 0.1 })
    saved.unlockedHacks.push('freeze')
    expect(loadProfile().unlockedHacks).toEqual(['burn'])
    expect(profile.musicVolume).toBe(0.9)
  })

  it.each(['{broken', 'null', '42', '"hello"', '[]', 'true'])('recovers from invalid data %s', (raw) => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, raw)
    expect(loadProfile()).toEqual(DEFAULT_PROFILE)
    expect(saveProfile({ highScore: 7 }).highScore).toBe(7)
  })

  it.each([0, 1, 2])('persists track %s across partial updates and recorded runs', (musicTrackIndex) => {
    saveProfile({ musicTrackIndex })
    saveProfile({ musicVolume: 0.25 })
    record()
    expect(loadProfile()).toMatchObject({ musicTrackIndex, musicVolume: 0.25, highScore: 1200 })
    expect(JSON.parse(window.localStorage.getItem(PROFILE_STORAGE_KEY)!)).toHaveProperty('musicTrackIndex', musicTrackIndex)
  })

  it.each([-1, 3, 999, 1.5, NaN, Infinity, '2', null, undefined])('ignores invalid track index %s', (value) => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ musicTrackIndex: value }))
    expect(loadProfile().musicTrackIndex).toBe(0)
    saveProfile({ musicTrackIndex: 2 })
    expect(saveProfile({ musicTrackIndex: value } as Partial<PlayerProfile>).musicTrackIndex).toBe(2)
  })

  it('migrates older profiles to the original track', () => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ highScore: 50, musicVolume: 0.4 }))
    expect(loadProfile()).toMatchObject({ highScore: 50, musicVolume: 0.4, musicTrackIndex: 0 })
  })

  it('fills missing fields, clamps numbers, filters hacks, and ignores unknown fields', () => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ highScore: 32.8, maxWave: -5,
      maxCombo: '999', totalKills: 1e25, totalGloryKills: null,
      sfxVolume: -1, musicVolume: 9, unlockedHacks: ['freeze', 'invalid', null, 'freeze', 'burn'], other: true }))
    expect(loadProfile()).toEqual({ ...DEFAULT_PROFILE, highScore: 32, totalKills: Number.MAX_SAFE_INTEGER,
      sfxVolume: 0, musicVolume: 1, unlockedHacks: ['freeze', 'burn'] })
  })

  it('ignores invalid patch values and preserves legitimate zero values', () => {
    saveProfile({ highScore: 100, musicVolume: 0.8, unlockedHacks: ['attack_speed'] })
    expect(saveProfile({ highScore: NaN, musicVolume: Infinity, maxCombo: undefined,
      unlockedHacks: null } as unknown as Partial<PlayerProfile>)).toEqual({
      ...DEFAULT_PROFILE, highScore: 100, musicVolume: 0.8, unlockedHacks: ['attack_speed'],
    })
    expect(saveProfile({ highScore: 0, musicVolume: 0, unlockedHacks: [] })).toEqual({ ...DEFAULT_PROFILE, musicVolume: 0 })
  })

  it('works without window during SSR', () => {
    vi.stubGlobal('window', undefined)
    expect(loadProfile()).toEqual(DEFAULT_PROFILE)
    expect(saveProfile({ highScore: 10 }).highScore).toBe(10)
    expect(record().totalKills).toBe(15)
  })

  it('handles a blocked localStorage getter', () => {
    vi.stubGlobal('window', { get localStorage() { throw new DOMException('Blocked', 'SecurityError') } })
    expect(loadProfile()).toEqual(DEFAULT_PROFILE)
    expect(record().highScore).toBe(1200)
  })

  it('handles read failures and quota/write failures', () => {
    const read = vi.spyOn(Object.getPrototypeOf(window.localStorage), 'getItem').mockImplementation(() => { throw Error('read failed') })
    expect(loadProfile()).toEqual(DEFAULT_PROFILE)
    read.mockRestore()
    saveProfile({ highScore: 10 })
    vi.spyOn(Object.getPrototypeOf(window.localStorage), 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    expect(record().highScore).toBe(1200)
    expect(loadProfile().highScore).toBe(10)
  })

  it('records maxima, adds lifetime kills, and unions hacks while preserving volumes', () => {
    saveProfile({ musicVolume: 0.25, sfxVolume: 0 })
    expect(record()).toMatchObject({ highScore: 1200, maxWave: 3, maxCombo: 8, totalKills: 15, totalGloryKills: 4 })
    const next = record({ score: 50, wave: 5, combo: 2, kills: 3, gloryKills: 1, activeHacks: ['freeze', 'burn'] })
    expect(next).toEqual({ highScore: 1200, maxWave: 5, maxCombo: 8, totalKills: 18, totalGloryKills: 5,
      unlockedHacks: ['freeze', 'burn'], sfxVolume: 0, musicVolume: 0.25, musicTrackIndex: 0 })
    expect(loadProfile()).toEqual(next)
    expect(record({ score: 5000, combo: 12 }).highScore).toBe(5000)
    expect(loadProfile().maxCombo).toBe(12)
  })

  it('does not corrupt records with non-finite, negative, or overflowing run counts', () => {
    record()
    expect(record({ score: NaN, wave: Infinity, combo: -9, kills: -2, gloryKills: NaN })).toMatchObject({
      highScore: 1200, maxWave: 3, maxCombo: 8, totalKills: 15, totalGloryKills: 4,
    })
    saveProfile({ totalKills: Number.MAX_SAFE_INTEGER })
    expect(record().totalKills).toBe(Number.MAX_SAFE_INTEGER)
  })
})
