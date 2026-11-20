import * as THREE from 'three'
import type { BoostStrip, HazardSpot, Wall, WalkRect } from '../map'
import { makeGlowSprite } from '../effects'
import {
  makeIridescentGlassMaterial,
  makeTimesSquareScreenMaterial,
  makeVegasSphereMaterial,
  makeWetBoulevardMaterial,
} from './shaders'

export interface VehicleSpawnPoint {
  sectorId: string
  x: number
  y: number
  z: number
  heading: number
}

export interface WorldSector {
  id: string
  code: string
  name: string
  zMin: number
  zMax: number
  centerZ: number
  group: THREE.Group
  landmark: THREE.Group
}

export interface InterconnectedWorld {
  sectors: WorldSector[]
  walkRects: WalkRect[]
  walls: Wall[]
  boostStrips: BoostStrip[]
  hazardSpots: HazardSpot[]
  vehicleSpawns: VehicleSpawnPoint[]
  update: (elapsed: number, playerZ: number, comboIntensity?: number) => void
  sectorForZ: (z: number) => WorldSector
}

const STREAM_RADIUS = 1050

/**
 * Builds the seamlessly interconnected 5-Landmark Open World Corridor (3,600m total span):
 *   01 Golden Gate Bridge  (z: -380..680 — hosted by environment.ts + map.ts)
 *   02 Times Square        (z: 680..1380)
 *   03 Las Vegas Sphere    (z: 1380..2080)
 *   04 Googleplex Mtn View (z: 2080..2760)
 *   05 Apple Park Cupertino(z: 2760..3560)
 */
export function buildInterconnectedWorld(
  scene: THREE.Scene,
  collidables: THREE.Object3D[]
): InterconnectedWorld {
  const walkRects: WalkRect[] = []
  const walls: Wall[] = []
  const boostStrips: BoostStrip[] = []
  const hazardSpots: HazardSpot[] = []
  const animatedMaterials: THREE.ShaderMaterial[] = []
  let sphereMat: THREE.ShaderMaterial | null = null

  const vehicleSpawns: VehicleSpawnPoint[] = [
    { sectorId: 'golden-gate', x: -3.2, y: 0.62, z: 162, heading: Math.PI },
    { sectorId: 'times-square', x: -5.5, y: 0.62, z: 860, heading: Math.PI },
    { sectorId: 'vegas-sphere', x: -6.0, y: 0.62, z: 1520, heading: Math.PI },
    { sectorId: 'googleplex', x: -5.0, y: 0.62, z: 2220, heading: Math.PI },
    { sectorId: 'apple-park', x: -5.0, y: 0.62, z: 2920, heading: Math.PI },
  ]

  const addRoadSegment = (
    parent: THREE.Group,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    primaryHex: number,
    secondaryHex: number
  ) => {
    walkRects.push({ x0, x1, z0, z1, top: 0.6 })
    const w = x1 - x0
    const d = z1 - z0
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2

    const mat = makeWetBoulevardMaterial(primaryHex, secondaryHex)
    animatedMaterials.push(mat)
    const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
    road.rotation.x = -Math.PI / 2
    road.position.set(cx, 0.6, cz)
    parent.add(road)

    // Collision deck proxy
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.6, d),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    )
    ghost.position.set(cx, 0.3, cz)
    scene.add(ghost)
    collidables.push(ghost)

    // Sleek low curved curb strips on highway edges
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x162238, metalness: 0.78, roughness: 0.34 })
    const ledMat = new THREE.MeshBasicMaterial({ color: primaryHex })
    for (const edgeX of [x0 + 0.3, x1 - 0.3]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.42, d), curbMat)
      curb.position.set(edgeX, 0.81, cz)
      parent.add(curb)
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, d), ledMat)
      led.position.set(edgeX + (edgeX < cx ? 0.25 : -0.25), 0.92, cz)
      parent.add(led)
    }
  }

  const addArchPortal = (parent: THREE.Group, z: number, width: number, color: number) => {
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x18253c,
      metalness: 0.85,
      roughness: 0.25,
      emissive: color,
      emissiveIntensity: 0.38,
    })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(width * 0.56, 0.48, 16, 48, Math.PI), archMat)
    ring.position.set(0, 0.6, z)
    parent.add(ring)
    const glow = makeGlowSprite(color, 18, 0.34)
    glow.position.set(0, width * 0.56, z)
    parent.add(glow)
  }

  // =========================================================================
  // SECTOR 01: Golden Gate Bridge (metadata anchor — geometry built in environment.ts)
  // =========================================================================
  const s1Group = new THREE.Group()
  const s1Landmark = new THREE.Group()
  scene.add(s1Group, s1Landmark)

  // =========================================================================
  // SECTOR 02: New York Times Square (z: 680 -> 1380)
  // =========================================================================
  const s2Group = new THREE.Group()
  const s2Landmark = new THREE.Group()
  // Connecting optical express corridor (680 -> 820) + wide Times Square intersection plaza (820 -> 1380)
  addRoadSegment(s2Group, -18, 18, 678, 840, 0x28e8ff, 0xff2e88)
  addRoadSegment(s2Group, -48, 48, 838, 1380, 0xff2e88, 0x28e8ff)
  addArchPortal(s2Group, 710, 26, 0xff2e88)
  addArchPortal(s2Group, 780, 26, 0x28e8ff)

  // Curved glowing Times Square holographic megawall facades flanking the plaza
  const towerGlassMat = new THREE.MeshStandardMaterial({ color: 0x0d1628, metalness: 0.84, roughness: 0.24 })
  for (let i = 0; i < 6; i++) {
    const z = 880 + i * 86
    for (const side of [-1, 1] as const) {
      const h = 44 + (i % 3) * 18
      const x = side * 44
      // Curved architectural tower backing
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(11, 12.5, h, 24), towerGlassMat)
      tower.position.set(x + side * 6, h / 2, z)
      s2Landmark.add(tower)

      // Curved dynamic GLSL holographic billboard wrapping the street-facing arc
      const screenMat = makeTimesSquareScreenMaterial(i * 1.3 + (side > 0 ? 0.5 : 0))
      animatedMaterials.push(screenMat)
      const screenGeo = new THREE.CylinderGeometry(13.2, 13.2, h * 0.68, 28, 1, true, side > 0 ? Math.PI * 0.65 : -Math.PI * 0.35, Math.PI * 0.7)
      const screen = new THREE.Mesh(screenGeo, screenMat)
      screen.position.set(x + side * 6, h * 0.52, z)
      s2Landmark.add(screen)

      // Ambient neon light halo spilling down onto wet boulevard
      const halo = makeGlowSprite(i % 2 === 0 ? 0xff2e88 : 0x28e8ff, 26, 0.35)
      halo.position.set(x - side * 4, 18, z)
      s2Group.add(halo)
    }
  }
  boostStrips.push({ x: 0, z: 750, hw: 4, hd: 10, dirX: 0, dirZ: 1 })
  hazardSpots.push(
    { x: -16, y: 1.45, z: 1020, kind: 'plasma' },
    { x: 16, y: 1.45, z: 1180, kind: 'cryo' }
  )
  scene.add(s2Group, s2Landmark)

  // =========================================================================
  // SECTOR 03: Las Vegas Sphere (z: 1380 -> 2080)
  // =========================================================================
  const s3Group = new THREE.Group()
  const s3Landmark = new THREE.Group()
  addRoadSegment(s3Group, -20, 20, 1378, 1520, 0xff9a3c, 0xff2e88)
  addRoadSegment(s3Group, -62, 62, 1518, 2080, 0xb95cff, 0x28e8ff)
  addArchPortal(s3Group, 1445, 30, 0xff9a3c)

  // Iconic 110m Las Vegas Exosphere (smooth high-subdivision sphere + dynamic shader)
  sphereMat = makeVegasSphereMaterial()
  animatedMaterials.push(sphereMat)
  const sphereMesh = new THREE.Mesh(new THREE.SphereGeometry(55, 64, 44), sphereMat)
  sphereMesh.name = 'las-vegas-sphere'
  sphereMesh.position.set(78, 52, 1790)
  s3Landmark.add(sphereMesh)

  // Illuminated architectural halo collar & reflection pool circling the Sphere base
  const sphereRing = new THREE.Mesh(
    new THREE.TorusGeometry(62, 0.65, 16, 84).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x28e8ff })
  )
  sphereRing.position.set(78, 1.2, 1790)
  s3Landmark.add(sphereRing)

  const sphereAura = makeGlowSprite(0xb95cff, 165, 0.36)
  sphereAura.position.set(78, 56, 1790)
  s3Landmark.add(sphereAura)

  // Sculpted glowing Strip boulevard pylons along west side
  for (let z = 1560; z <= 2020; z += 76) {
    const pylon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.55, 16, 18),
      new THREE.MeshStandardMaterial({ color: 0x1a263e, metalness: 0.85, roughness: 0.25 })
    )
    pylon.position.set(-48, 8.6, z)
    s3Group.add(pylon)
    const tip = makeGlowSprite(z % 152 === 0 ? 0xff2e88 : 0xffb84d, 10, 0.58)
    tip.position.set(-48, 17, z)
    s3Group.add(tip)
  }
  boostStrips.push({ x: 0, z: 1460, hw: 4, hd: 10, dirX: 0, dirZ: 1 })
  hazardSpots.push(
    { x: -18, y: 1.45, z: 1720, kind: 'cryo' },
    { x: 14, y: 1.45, z: 1890, kind: 'plasma' }
  )
  scene.add(s3Group, s3Landmark)

  // =========================================================================
  // SECTOR 04: Googleplex Mountain View (z: 2080 -> 2760)
  // =========================================================================
  const s4Group = new THREE.Group()
  const s4Landmark = new THREE.Group()
  addRoadSegment(s4Group, -20, 20, 2078, 2220, 0x38e8ff, 0x4dffbe)
  addRoadSegment(s4Group, -56, 56, 2218, 2760, 0x38e8ff, 0x4dffbe)
  addArchPortal(s4Group, 2145, 30, 0x4dffbe)

  // Bay View Curved Dragonscale Glass Sail Canopies (smooth undulating geometry + iridescent glass shader)
  const canopyGlassMat = makeIridescentGlassMaterial(0x123048, 0x4dffbe)
  animatedMaterials.push(canopyGlassMat)
  for (const [cx, cz] of [
    [-46, 2380],
    [46, 2420],
    [-46, 2600],
    [46, 2620],
  ] as const) {
    const sailGeo = new THREE.PlaneGeometry(54, 72, 24, 28)
    sailGeo.rotateX(-Math.PI / 2)
    const pos = sailGeo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i)
      const lz = pos.getZ(i)
      // Smooth curved tent-like dragonscale canopy dome
      const dome = Math.cos((lx / 27) * Math.PI * 0.5) * Math.cos((lz / 36) * Math.PI * 0.5) * 14
      const scaleWave = Math.sin(lx * 0.35) * Math.cos(lz * 0.25) * 1.1
      pos.setY(i, 12 + dome + scaleWave)
    }
    sailGeo.computeVertexNormals()
    const canopy = new THREE.Mesh(sailGeo, canopyGlassMat)
    canopy.name = 'googleplex-canopy'
    canopy.position.set(cx, 0, cz)
    s4Landmark.add(canopy)

    // Smooth curved glass atrium wall under canopy
    const atrium = new THREE.Mesh(new THREE.CylinderGeometry(20, 22, 12, 36, 1, true), canopyGlassMat)
    atrium.position.set(cx, 6.6, cz)
    s4Group.add(atrium)
  }

  // Calm tech reflection water mirror beside the avenue
  const lagoon = new THREE.Mesh(
    new THREE.CircleGeometry(28, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x092438, metalness: 0.94, roughness: 0.08 })
  )
  lagoon.position.set(0, 0.63, 2500)
  s4Group.add(lagoon)
  boostStrips.push({ x: 0, z: 2150, hw: 4, hd: 10, dirX: 0, dirZ: 1 })
  hazardSpots.push(
    { x: -16, y: 1.45, z: 2380, kind: 'cryo' },
    { x: 16, y: 1.45, z: 2600, kind: 'plasma' }
  )
  scene.add(s4Group, s4Landmark)

  // =========================================================================
  // SECTOR 05: Apple Park Cupertino — Giant Smooth Curved Glass Ring Spaceship (z: 2760 -> 3560)
  // =========================================================================
  const s5Group = new THREE.Group()
  const s5Landmark = new THREE.Group()
  addRoadSegment(s5Group, -20, 20, 2758, 2940, 0x9ef4ff, 0xff5a8a)
  addRoadSegment(s5Group, -110, 110, 2938, 3480, 0x9ef4ff, 0xff8c66)
  addArchPortal(s5Group, 2850, 32, 0xc8f4ff)

  const ringCenterZ = 3210
  const appleGlassMat = makeIridescentGlassMaterial(0x162436, 0xd4f4ff)
  animatedMaterials.push(appleGlassMat)
  const whiteSlabMat = new THREE.MeshStandardMaterial({ color: 0xdbe6f2, metalness: 0.35, roughness: 0.28 })

  // Outer & Inner giant smooth curved glass curtain rings (96 radial segments, clean south tunnel gateway into courtyard)
  const portalGap = 0.28
  const outerRingWall = new THREE.Mesh(
    new THREE.CylinderGeometry(102, 102, 24, 96, 1, true, Math.PI + portalGap * 0.5, Math.PI * 2 - portalGap),
    appleGlassMat
  )
  outerRingWall.name = 'apple-park-ring'
  outerRingWall.position.set(0, 12.6, ringCenterZ)
  s5Landmark.add(outerRingWall)

  const innerRingWall = new THREE.Mesh(
    new THREE.CylinderGeometry(74, 74, 24, 96, 1, true, Math.PI + portalGap * 0.65, Math.PI * 2 - portalGap * 1.3),
    appleGlassMat
  )
  innerRingWall.position.set(0, 12.6, ringCenterZ)
  s5Landmark.add(innerRingWall)
  addArchPortal(s5Group, ringCenterZ - 102, 28, 0x7ee8ff)
  addArchPortal(s5Group, ringCenterZ - 74, 26, 0xff8c66)

  // Signature floating white architectural eaves / solar roof ring slabs (4 crisp curved tiers)
  for (const y of [6.5, 13.0, 19.5, 25.0]) {
    const eave = new THREE.Mesh(new THREE.RingGeometry(71, 106, 96).rotateX(-Math.PI / 2), whiteSlabMat)
    eave.position.set(0, y, ringCenterZ)
    s5Landmark.add(eave)
  }

  // Luminous upper halo ring hovering above Apple Park courtyard
  const crownRing = new THREE.Mesh(
    new THREE.TorusGeometry(88, 0.55, 16, 96).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x7ee8ff })
  )
  crownRing.position.set(0, 26.2, ringCenterZ)
  s5Landmark.add(crownRing)

  // Central courtyard quantum prism monument (final Boss Arena focal point)
  const monumentBase = new THREE.Mesh(
    new THREE.CylinderGeometry(12, 14, 1.2, 64),
    new THREE.MeshStandardMaterial({ color: 0x101c2e, metalness: 0.85, roughness: 0.2 })
  )
  monumentBase.position.set(0, 1.2, ringCenterZ)
  s5Group.add(monumentBase)

  const monumentHalo = makeGlowSprite(0x38e8ff, 44, 0.42)
  monumentHalo.position.set(0, 14, ringCenterZ)
  s5Landmark.add(monumentHalo)

  boostStrips.push({ x: 0, z: 2860, hw: 4, hd: 10, dirX: 0, dirZ: 1 })
  hazardSpots.push(
    { x: -24, y: 1.45, z: ringCenterZ - 26, kind: 'plasma' },
    { x: 24, y: 1.45, z: ringCenterZ - 26, kind: 'cryo' },
    { x: 0, y: 1.45, z: ringCenterZ + 32, kind: 'plasma' }
  )
  scene.add(s5Group, s5Landmark)

  const sectors: WorldSector[] = [
    { id: 'golden-gate', code: '01', name: 'GOLDEN GATE BRIDGE', zMin: -380, zMax: 680, centerZ: 150, group: s1Group, landmark: s1Landmark },
    { id: 'times-square', code: '02', name: 'NEW YORK TIMES SQUARE', zMin: 680, zMax: 1380, centerZ: 1030, group: s2Group, landmark: s2Landmark },
    { id: 'vegas-sphere', code: '03', name: 'LAS VEGAS SPHERE', zMin: 1380, zMax: 2080, centerZ: 1730, group: s3Group, landmark: s3Landmark },
    { id: 'googleplex', code: '04', name: 'GOOGLEPLEX MOUNTAIN VIEW', zMin: 2080, zMax: 2760, centerZ: 2420, group: s4Group, landmark: s4Landmark },
    { id: 'apple-park', code: '05', name: 'APPLE PARK SPACESHIP', zMin: 2760, zMax: 3560, centerZ: 3160, group: s5Group, landmark: s5Landmark },
  ]

  const sectorForZ = (z: number): WorldSector => {
    for (const s of sectors) {
      if (z >= s.zMin && z <= s.zMax) return s
    }
    return z < sectors[0]!.zMin ? sectors[0]! : sectors[sectors.length - 1]!
  }

  return {
    sectors,
    walkRects,
    walls,
    boostStrips,
    hazardSpots,
    vehicleSpawns,
    sectorForZ,
    update(elapsed: number, playerZ: number, comboIntensity = 0) {
      for (const mat of animatedMaterials) {
        if (mat.uniforms['uTime']) mat.uniforms['uTime'].value = elapsed
      }
      if (sphereMat?.uniforms['uCombo']) {
        sphereMat.uniforms['uCombo'].value = comboIntensity
      }
      // Chunk stream detail groups within STREAM_RADIUS while keeping hero landmarks visible as horizon compasses
      for (const s of sectors) {
        const dist = Math.abs(playerZ - s.centerZ)
        s.group.visible = dist <= STREAM_RADIUS
        s.landmark.visible = dist <= STREAM_RADIUS * 2.1
      }
    },
  }
}
