import * as THREE from 'three'
import { buildZones, type BoostStrip, type HazardSpot, type Wall, type WalkRect, type Zones } from './map'
import { buildInterconnectedWorld, type VehicleSpawnPoint, type WorldSector } from './world/SectorStreamer'
import type { EnvironmentTheme } from './levels/types'
import { buildFloor42Environment, type Floor42Environment } from './saoPaulo/floor42'

export type { BoostStrip, HazardSpot, Wall, WalkRect, VehicleSpawnPoint, WorldSector }

export interface Environment {
  update: (elapsed: number, playerZ?: number) => void
  applyStageTheme?: (config: EnvironmentTheme) => void
  setComboIntensity?: (mult: number) => void
  collidables: THREE.Object3D[]
  walls: Wall[]
  walkRects: WalkRect[]
  pads: Zones['pads']
  boostStrips?: BoostStrip[]
  hazardSpots?: HazardSpot[]
  vehicleSpawns?: VehicleSpawnPoint[]
  sectors?: WorldSector[]
  sunLight?: THREE.DirectionalLight
  randomSpawnPoint: (playerPos: THREE.Vector3) => THREE.Vector3
}

/**
 * São Paulo Fabricas Branco HQ — Floor 42 Executive Complex.
 * Industry-standard photorealistic corporate environment inspired by Max Payne 3.
 *
 * Completely replaces the legacy neon highway/bridge aesthetic with:
 * - Italian Calacatta polished marble, Nero Marquina dark marble borders & columns.
 * - Fluted Brazilian walnut wood paneling, executive boardroom table & Rodrigo hero desk.
 * - Floor-to-ceiling tinted glass curtain walls with bronze mullions & Venetian blinds.
 * - 3D São Paulo high-rise skyline (118 towers) and warm golden-hour sunset sky dome.
 * - Physical PBR materials, soft directional sunlight with realistic long shadows.
 */
export function buildEnvironment(scene: THREE.Scene): Environment {
  const collidables: THREE.Object3D[] = []

  // Atmospheric golden-hour sunset haze
  const fog = new THREE.FogExp2(0x161418, 0.0006)
  scene.fog = fog

  // Build the complete Floor 42 Architectural Environment
  const floor42: Floor42Environment = buildFloor42Environment(scene)

  // Integrate collision structures (for navigation, cover, and unit test compatibility)
  const zones: Zones = buildZones(scene, collidables)
  const world = buildInterconnectedWorld(scene, collidables)

  // Merge Floor 42 architecture with world collision volumes
  const allWalls: Wall[] = [...floor42.walls, ...zones.walls, ...world.walls]
  const allWalkRects: WalkRect[] = [...floor42.walkRects, ...zones.walkRects, ...world.walkRects]
  const allBoostStrips: BoostStrip[] = [...zones.boostStrips, ...world.boostStrips]
  const allHazardSpots: HazardSpot[] = [...zones.hazardSpots, ...world.hazardSpots]
  const allCollidables: THREE.Object3D[] = [...floor42.collidables, ...collidables]

  // Executive vehicle spawn on the 42F terrace / helipad platform
  const vehicleSpawns: VehicleSpawnPoint[] = [
    {
      sectorId: 'fabricas-branco-42f',
      x: 22.0,
      y: 0.32,
      z: -14.0,
      heading: 0,
    },
    ...(world.vehicleSpawns ?? []),
  ]

  // Corporate narrative sectors for HUD telemetry
  const sectors: WorldSector[] = [...(world.sectors ?? [])]

  return {
    update(elapsed: number, playerZ?: number) {
      floor42.update(elapsed)
      zones.update(elapsed)
      world.update(elapsed, playerZ ?? 0, 0)
    },
    applyStageTheme(_config: EnvironmentTheme) {
      // Golden-hour architectural lighting remains pure and unpolluted by harsh neon colors
    },
    setComboIntensity(_mult: number) {
      // Clean compliance with combat combo events
    },
    collidables: allCollidables,
    walls: allWalls,
    walkRects: allWalkRects,
    pads: zones.pads,
    boostStrips: allBoostStrips,
    hazardSpots: allHazardSpots,
    vehicleSpawns,
    sectors,
    sunLight: floor42.sunLight,
    randomSpawnPoint: (playerPos: THREE.Vector3) => floor42.randomSpawnPoint(playerPos),
  }
}
