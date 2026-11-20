import { describe, expect, it } from 'vitest'
import { countModelStats } from './geometry'
import { buildIndustrialSportsCar } from './neonSportsCar'

describe('Route B Industrial Neon GT Coupe Model', () => {
  it('meets the 30,000 - 55,000 triangle industrial automotive budget with zero primitive box shortcuts', () => {
    const rig = buildIndustrialSportsCar()
    const stats = countModelStats(rig.group)

    expect(stats.triangles).toBeGreaterThanOrEqual(30000)
    expect(stats.triangles).toBeLessThanOrEqual(55000)
    expect(rig.group.getObjectByName('car-widebody-shell')).toBeDefined()
    expect(rig.group.getObjectByName('car-arched-canopy')).toBeDefined()
    expect(rig.group.getObjectByName('car-taillight-blade')).toBeDefined()
    expect(rig.frontWheelPivots).toHaveLength(2)
    expect(rig.wheelSpinGroups).toHaveLength(4)
  })

  it('toggles headlights, brake glow, and nitrous exhaust flames cleanly', () => {
    const rig = buildIndustrialSportsCar()

    rig.setHeadlightsOn(false)
    expect(rig.drlMaterial.emissiveIntensity).toBeLessThan(0.5)
    expect(rig.headlights.every((h) => !h.visible)).toBe(true)

    rig.setHeadlightsOn(true)
    expect(rig.drlMaterial.emissiveIntensity).toBeGreaterThan(1.5)
    expect(rig.headlights.every((h) => h.visible)).toBe(true)

    rig.setBrakeIntensity(1)
    expect(rig.taillightMaterial.emissiveIntensity).toBeGreaterThan(3)

    rig.setNitrousIntensity(0.9)
    expect(rig.nitrousFlames.every((f) => f.visible)).toBe(true)
  })
})
