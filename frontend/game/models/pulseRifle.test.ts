import { describe, expect, it } from 'vitest'
import { buildIndustrialPulseRifle } from './pulseRifle'
import { countModelStats } from './geometry'

describe('Route B industrial procedural Pulse Rifle', () => {
  it('stays within the 20,000-35,000 triangle industrial prototype budget with full 3-layer anatomy', () => {
    const rig = buildIndustrialPulseRifle()
    const stats = countModelStats(rig.group)
    expect(stats.triangles).toBeGreaterThanOrEqual(20000)
    expect(stats.triangles).toBeLessThanOrEqual(35000)
    expect(rig.group.getObjectByName('titanium-main-shroud')).toBeTruthy()
    expect(rig.group.getObjectByName('upper-receiver')).toBeTruthy()
    expect(rig.group.getObjectByName('graphite-lower-chassis')).toBeTruthy()
    expect(rig.group.getObjectByName('energy-cell-bay')).toBeTruthy()
    expect(rig.group.getObjectByName('fluted-barrel')).toBeTruthy()
    expect(rig.group.getObjectByName('flush-reflex-optic')).toBeTruthy()
    expect(rig.group.getObjectByName('bolt-carrier')).toBeTruthy()
  })
})
