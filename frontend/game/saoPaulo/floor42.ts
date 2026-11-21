import * as THREE from 'three'
import type { BoostStrip, HazardSpot, Wall, WalkRect, Zones } from '../map'
import type { Environment } from '../environment'
import { BatchCollector } from './batchCollector'
import { createSaoPauloMaterials, type SaoPauloMaterials } from './materials'
import { buildSaoPauloSkyline, type SkylineController } from './skyline'
import {
  buildElevatorBank,
  buildReceptionArea,
  buildMarbleColumns,
  buildWorkstations,
  buildFilingCabinets,
  buildExecutiveBoardroom,
  buildRodrigoOffice,
  buildCurtainWallsAndBlinds,
  buildTropicalPlanters,
  type PropContext,
} from './props'

/**
 * São Paulo Fabricas Branco HQ — Floor 42 Executive Complex.
 * Industry-standard photorealistic corporate environment reconstructed
 * from the Max Payne 3 São Paulo reference.
 *
 * Replaces the old synthwave highway/bridge aesthetic with:
 * - 58m x 38m executive floor with elevator lobby, open bullpen, and elevated penthouse.
 * - Italian Calacatta white marble, Nero Marquina dark marble, Roman travertine, and dark walnut wood.
 * - Golden-hour sunset lighting with realistic PBR materials, soft directional sunlight, and warm downlights.
 * - 3D São Paulo skyscraper skyline visible through floor-to-ceiling glass curtain walls.
 */

export interface Floor42Environment extends Environment {
  skyline: SkylineController
  materials: SaoPauloMaterials
  sunLight: THREE.DirectionalLight
  dispose: () => void
}

export function buildFloor42Environment(scene: THREE.Scene): Floor42Environment {
  const collidables: THREE.Object3D[] = []
  const walls: Wall[] = []
  const walkRects: WalkRect[] = []
  const pads: Zones['pads'] = []
  const boostStrips: BoostStrip[] = []
  const hazardSpots: HazardSpot[] = []

  const materials = createSaoPauloMaterials()
  const batch = new BatchCollector((idOrMat) => {
    if (typeof idOrMat === 'string') {
      const mat = (materials as unknown as Record<string, THREE.Material>)[idOrMat]
      if (mat) return mat
      return materials.concrete_raw
    }
    return idOrMat
  })

  const staticGroup = new THREE.Group()
  staticGroup.name = 'FabricasBranco_Floor42_Static'
  scene.add(staticGroup)

  const ctx: PropContext = { batch, collidables, walls }

  // 1. Concrete Structural Slab (foundation foundation: 60m x 40m)
  batch.addBox(60.0, 0.42, 40.0, 'concrete_raw', 0, -0.22, 0, {
    tile: 4.0,
    castShadow: true,
    receiveShadow: true,
  })

  // 2. Elevator Lobby Floor (x = -28.6 to -13.2)
  // White marble main slab
  batch.addBox(15.8, 0.04, 38.0, 'marble_white', -21.1, -0.015, 0, {
    tile: 2.6,
    castShadow: false,
    receiveShadow: true,
  })
  // Dark marble carpet border inlays & brass divider strips
  batch.addBox(9.6, 0.006, 0.24, 'marble_dark', -21.8, 0.003, -3.55, { tile: 1.8, castShadow: false })
  batch.addBox(9.6, 0.006, 0.24, 'marble_dark', -21.8, 0.003, 3.55, { tile: 1.8, castShadow: false })
  batch.addBox(0.24, 0.006, 7.34, 'marble_dark', -26.5, 0.003, 0, { tile: 1.8, castShadow: false })
  batch.addBox(9.4, 0.007, 0.035, 'brass', -21.8, 0.004, -3.4, { castShadow: false })
  batch.addBox(9.4, 0.007, 0.035, 'brass', -21.8, 0.004, 3.4, { castShadow: false })

  for (const k of [-1, 1]) {
    batch.addBox(6.8, 0.005, 6.2, 'marble_dark', -21.6, 0.0025, k * 12.4, { tile: 2.0, castShadow: false })
    batch.addBox(6.2, 0.006, 5.6, 'marble_white', -21.6, 0.0035, k * 12.4, { tile: 2.2, castShadow: false })
  }

  // 3. Open Bullpen Floor (x = -13.2 to 11.0)
  // Acoustic charcoal carpet tile
  batch.addBox(24.2, 0.04, 38.0, 'carpet_tile', -1.1, -0.015, 0, {
    tile: 1.6,
    castShadow: false,
    receiveShadow: true,
  })
  // White marble perimeter circulation corridor
  batch.addBox(24.2, 0.006, 2.2, 'marble_white', -1.1, 0.003, 17.5, { tile: 2.4, receiveShadow: true })
  batch.addBox(24.2, 0.006, 2.2, 'marble_white', -1.1, 0.003, -17.5, { tile: 2.4, receiveShadow: true })

  // 4. Travertine Steps to Executive Penthouse (+0.32m elevation)
  // Step 1: y = +0.11m
  batch.addBox(0.46, 0.11, 37.2, 'travertine', 11.08, 0.055, 0, { tile: 2.2, castShadow: true, receiveShadow: true })
  batch.addBox(0.025, 0.018, 37.0, 'brass', 10.86, 0.105, 0, { castShadow: false })
  // Step 2: y = +0.21m
  batch.addBox(0.46, 0.21, 37.2, 'travertine', 11.53, 0.105, 0, { tile: 2.2, castShadow: true, receiveShadow: true })
  batch.addBox(0.025, 0.018, 37.0, 'brass', 11.31, 0.205, 0, { castShadow: false })

  // Step riser hidden warm LED illumination
  batch.addBox(0.018, 0.025, 36.6, 'led_warm', 10.84, 0.03, 0, { castShadow: false })
  batch.addBox(0.018, 0.025, 36.6, 'led_warm', 11.29, 0.13, 0, { castShadow: false })

  // 5. Executive Penthouse Platform (x = 11.8 to 28.5)
  // Roman travertine limestone floor
  batch.addBox(17.1, 0.32, 37.4, 'travertine', 20.3, 0.16, 0, {
    tile: 2.6,
    castShadow: true,
    receiveShadow: true,
  })
  batch.addBox(0.028, 0.02, 37.0, 'brass', 11.76, 0.315, 0, { castShadow: false })

  // 6. Architectural Ceiling (y = 5.0m)
  // Matte painted drywall ceiling
  batch.addBox(59.0, 0.36, 39.0, 'drywall_painted', 0, 5.18, 0, { castShadow: true, receiveShadow: true })
  // Acoustic travertine cross-beams
  for (let bz = -16.0; bz <= 16.0; bz += 4.0) {
    batch.addBox(58.0, 0.24, 0.36, 'travertine', 0, 4.96, bz, { tile: 2.0, castShadow: true })
  }

  // 7. Interior Perimeter Drywall Partitions (North wall at z = -18.6)
  batch.addBox(58.0, 5.0, 0.45, 'drywall_painted', 0, 2.5, -18.6, { tile: 2.0 })
  walls.push({ x: 0, z: -18.6, hw: 29.0, hd: 0.25, h: 5.2 })

  // 8. Build All Architectural Props
  buildElevatorBank(ctx)
  buildReceptionArea(ctx)
  buildMarbleColumns(ctx)
  buildWorkstations(ctx)
  buildFilingCabinets(ctx)
  buildExecutiveBoardroom(ctx)
  buildRodrigoOffice(ctx)
  buildCurtainWallsAndBlinds(ctx)
  buildTropicalPlanters(ctx)

  // 9. Batch all static geometries into low-draw-call meshes
  batch.build(staticGroup)

  // 10. Exterior 3D São Paulo Sunset Skyline & Sky Dome
  const skyline = buildSaoPauloSkyline()
  scene.add(skyline.group)

  // 11. Cinematic Lighting Rig
  // Golden-Hour Sun (17:48 sunset, direction 0.86, 0.34, 0.38)
  const sunLight = new THREE.DirectionalLight(0xffeedc, 2.8)
  sunLight.position.set(43.0, 17.0, 19.0)
  sunLight.target.position.set(0, 1.2, 0)
  sunLight.castShadow = true
  sunLight.shadow.mapSize.width = 2048
  sunLight.shadow.mapSize.height = 2048
  sunLight.shadow.camera.near = 1.0
  sunLight.shadow.camera.far = 120.0
  sunLight.shadow.camera.left = -32.0
  sunLight.shadow.camera.right = 32.0
  sunLight.shadow.camera.top = 24.0
  sunLight.shadow.camera.bottom = -24.0
  sunLight.shadow.bias = -0.0004
  scene.add(sunLight)
  scene.add(sunLight.target)

  // Sky dome ambient bounce
  const ambientLight = new THREE.AmbientLight(0x48526a, 0.55)
  scene.add(ambientLight)

  // Warm interior architectural spot / recessed lights (3200K halogen / warm LED)
  const interiorLightDefs = [
    { pos: [-20.5, 4.2, 0], color: 0xffeedc, intensity: 3.5, dist: 18 },  // Elevator Lobby
    { pos: [-18.2, 3.8, 0], color: 0xffd073, intensity: 2.8, dist: 14 },  // Reception Desk
    { pos: [-2.2, 4.4, 0], color: 0xffeedc, intensity: 2.4, dist: 16 },   // Bullpen Center
    { pos: [16.5, 4.2, -8.5], color: 0xffe8c6, intensity: 3.2, dist: 16 },// Executive Boardroom
    { pos: [22.8, 4.2, 6.2], color: 0xffd073, intensity: 3.0, dist: 15 }, // Rodrigo Hero Desk
  ]

  const pointLights: THREE.PointLight[] = []
  for (const def of interiorLightDefs) {
    const pl = new THREE.PointLight(def.color, def.intensity, def.dist, 1.8)
    pl.position.set(def.pos[0]!, def.pos[1]!, def.pos[2]!)
    pl.castShadow = false
    scene.add(pl)
    pointLights.push(pl)
  }

  // 12. Walkable Surfaces (Heightmap rects)
  walkRects.push(
    // Elevator lobby
    { x0: -28.5, x1: -13.2, z0: -18.5, z1: 18.5, top: 0.0 },
    // Bullpen carpet
    { x0: -13.2, x1: 10.9, z0: -18.5, z1: 18.5, top: 0.0 },
    // Step 1
    { x0: 10.9, x1: 11.4, z0: -18.5, z1: 18.5, top: 0.11 },
    // Step 2
    { x0: 11.4, x1: 11.8, z0: -18.5, z1: 18.5, top: 0.21 },
    // Executive penthouse platform
    { x0: 11.8, x1: 28.3, z0: -18.5, z1: 18.5, top: 0.32 }
  )

  // Tactical enemy spawn vectors (elevator doors, boardroom entrances, executive wing)
  const spawnLocations = [
    new THREE.Vector3(-27.2, 0.0, -9.8), // Elevator 1
    new THREE.Vector3(-27.2, 0.0, -3.6), // Elevator 2
    new THREE.Vector3(-27.2, 0.0, 3.6),  // Elevator 3
    new THREE.Vector3(-27.2, 0.0, 9.8),  // Elevator 4
    new THREE.Vector3(14.0, 0.32, -14.0),// Boardroom corner
    new THREE.Vector3(22.0, 0.32, -14.0),// Boardroom executive door
    new THREE.Vector3(24.0, 0.32, 14.0), // Rodrigo office private exit
    new THREE.Vector3(-2.0, 0.0, -14.0), // Bullpen north corridor
    new THREE.Vector3(-2.0, 0.0, 14.0),  // Bullpen south corridor
  ]

  let spawnIndex = 0
  const randomSpawnPoint = (playerPos: THREE.Vector3): THREE.Vector3 => {
    // Pick the spawn point furthest from the player or cycle tactically
    for (let attempts = 0; attempts < spawnLocations.length; attempts++) {
      const candidate = spawnLocations[spawnIndex % spawnLocations.length]!
      spawnIndex++
      if (candidate.distanceTo(playerPos) > 12.0) {
        return candidate.clone()
      }
    }
    return spawnLocations[0]!.clone()
  }

  return {
    collidables,
    walls,
    walkRects,
    pads,
    boostStrips,
    hazardSpots,
    skyline,
    materials,
    sunLight,
    randomSpawnPoint,
    update: (elapsed: number) => {
      skyline.update(elapsed)
    },
    applyStageTheme: () => {
      // São Paulo Executive theme remains pure and cinematic
    },
    setComboIntensity: () => {
      // Preserved for engine compatibility
    },
    dispose: () => {
      skyline.dispose()
      materials.dispose()
      scene.remove(staticGroup)
      scene.remove(skyline.group)
      scene.remove(sunLight)
      scene.remove(ambientLight)
      for (const pl of pointLights) scene.remove(pl)
    },
  }
}
