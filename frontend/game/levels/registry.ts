import type { LevelManifest } from './types'
import { STAGE_01_BAY_BRIDGE } from './manifests/stage01_bay_bridge'
import { STAGE_02_NEON_DOCKS } from './manifests/stage02_neon_docks'
import { STAGE_03_SKYLINE_PENTHOUSE } from './manifests/stage03_skyline_penthouse'

export const DEFAULT_STAGES: readonly LevelManifest[] = [
  STAGE_01_BAY_BRIDGE,
  STAGE_02_NEON_DOCKS,
  STAGE_03_SKYLINE_PENTHOUSE,
]

export function getStageManifest(idOrIndex: string | number): LevelManifest {
  if (typeof idOrIndex === 'number') {
    const idx = Math.max(0, Math.min(idOrIndex, DEFAULT_STAGES.length - 1))
    return DEFAULT_STAGES[idx]!
  }
  const found = DEFAULT_STAGES.find((s) => s.id === idOrIndex || s.code === idOrIndex)
  return found ?? DEFAULT_STAGES[0]!
}
