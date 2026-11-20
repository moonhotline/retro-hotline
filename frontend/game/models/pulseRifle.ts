import * as THREE from 'three'
import {
  buildLoftedSurface,
  makeBrushedMetalTexture,
  makeIndustrialDecalTexture,
  superellipseRing,
} from './geometry'

export interface IndustrialRifleRig {
  group: THREE.Group
  boltGroup: THREE.Group
  coreMesh: THREE.Mesh
  coreMaterial: THREE.MeshStandardMaterial
  muzzlePoint: THREE.Vector3
}

/**
 * Route B Procedural Sci-Fi Industrial Pulse Rifle (MK-IV).
 * Target budget: ~24,000 - 32,000 triangles focused on continuous curved shrouds,
 * multi-step bevels, recessed smoked-glass energy bay, fluted barrel, flush top optics,
 * and near-camera fasteners/cooling louvers.
 */
export function buildIndustrialPulseRifle(): IndustrialRifleRig {
  const group = new THREE.Group()
  group.name = 'industrial-pulse-rifle'

  const brushedTex = makeBrushedMetalTexture('#9aa7b8', 0.16)
  const graphiteTex = makeBrushedMetalTexture('#262d3a', 0.1)
  const decalTex = makeIndustrialDecalTexture('RH-89 // MK-IV', 'PULSE COIL · 04.8kV')

  // Calibrated industrial PBR materials (readable even with Bloom OFF)
  const titaniumMat = new THREE.MeshStandardMaterial({
    color: 0x8e9aa8,
    map: brushedTex,
    metalness: 0.78,
    roughness: 0.27,
  })
  const darkGunmetalMat = new THREE.MeshStandardMaterial({
    color: 0x262e3d,
    map: graphiteTex,
    metalness: 0.84,
    roughness: 0.32,
  })
  const graphiteMat = new THREE.MeshStandardMaterial({
    color: 0x161b24,
    metalness: 0.35,
    roughness: 0.62,
  })
  const chromeAccentMat = new THREE.MeshStandardMaterial({
    color: 0xc5d3e3,
    metalness: 0.94,
    roughness: 0.16,
  })
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0x1bdcff,
    emissive: 0x18d8ff,
    emissiveIntensity: 1.45,
    metalness: 0.2,
    roughness: 0.15,
  })
  const smokedGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1624,
    metalness: 0.12,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: 0.56,
  })
  const decalMat = new THREE.MeshStandardMaterial({
    map: decalTex,
    metalness: 0.45,
    roughness: 0.38,
  })

  // =========================================================================
  // LAYER 1: Continuous Curved Titanium-Grey Main Shroud (Lofted multi-station)
  // Tapers smoothly toward muzzle with clean longitudinal specular highlight band
  // =========================================================================
  const shroudStations = [
    { z: -0.58, points: superellipseRing(0.036, 0.044, 0.014, 48, 3.0, 0, 0.24) },
    { z: -0.50, points: superellipseRing(0.046, 0.056, 0.015, 48, 3.2, 0, 0.20) },
    { z: -0.34, points: superellipseRing(0.058, 0.068, 0.018, 48, 3.5, 0, 0.16) },
    { z: -0.14, points: superellipseRing(0.066, 0.076, 0.020, 48, 3.6, 0, 0.14) },
    { z:  0.08, points: superellipseRing(0.068, 0.078, 0.018, 48, 3.5, 0, 0.12) },
    { z:  0.24, points: superellipseRing(0.062, 0.070, 0.012, 48, 3.2, 0, 0.15) },
    { z:  0.38, points: superellipseRing(0.048, 0.062, -0.002, 48, 2.8, 0, 0.18) },
    { z:  0.48, points: superellipseRing(0.042, 0.066, -0.010, 48, 2.6, 0, 0.16) },
  ]
  // Subdivide stations smoothly with Catmull-Rom interpolation for buttery highlight continuity
  const denseShroudStations = []
  const subSteps = 26
  for (let i = 0; i <= subSteps; i++) {
    const t = i / subSteps
    const scaled = t * (shroudStations.length - 1)
    const idx = Math.min(shroudStations.length - 2, Math.floor(scaled))
    const frac = scaled - idx
    const s0 = shroudStations[Math.max(0, idx - 1)]!
    const s1 = shroudStations[idx]!
    const s2 = shroudStations[idx + 1]!
    const s3 = shroudStations[Math.min(shroudStations.length - 1, idx + 2)]!
    const smooth = frac * frac * (3 - 2 * frac)
    const z = THREE.MathUtils.lerp(s1.z, s2.z, frac)
    const pts: Array<[number, number]> = []
    for (let k = 0; k < s1.points.length; k++) {
      const p0 = s0.points[k]!
      const p1 = s1.points[k]!
      const p2 = s2.points[k]!
      const p3 = s3.points[k]!
      const catmull = (a: number, b: number, c: number, d: number, u: number) =>
        0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u)
      const x = catmull(p0[0], p1[0], p2[0], p3[0], smooth)
      const y = catmull(p0[1], p1[1], p2[1], p3[1], smooth)
      pts.push([x, y])
    }
    denseShroudStations.push({ z, points: pts })
  }
  const mainShroud = new THREE.Mesh(buildLoftedSurface(denseShroudStations, true, true), titaniumMat)
  mainShroud.name = 'titanium-main-shroud'
  group.add(mainShroud)

  // Sculpted upper-side highlight ribs (left & right swept fairings that create continuous specular band)
  for (const side of [-1, 1] as const) {
    const fairingStations = []
    for (let i = 0; i <= 24; i++) {
      const u = i / 24
      const z = THREE.MathUtils.lerp(-0.52, 0.28, u)
      const arch = Math.sin(u * Math.PI)
      const xBase = side * (0.044 + arch * 0.025)
      const yBase = 0.022 + arch * 0.012
      const rx = 0.011 + arch * 0.008
      const ry = 0.018 + arch * 0.010
      fairingStations.push({ z, points: superellipseRing(rx, ry, yBase, 24, 2.4, xBase, 0.1) })
    }
    const fairing = new THREE.Mesh(buildLoftedSurface(fairingStations, true, true), titaniumMat)
    fairing.name = side < 0 ? 'shroud-fairing-left' : 'shroud-fairing-right'
    group.add(fairing)
  }

  // =========================================================================
  // LAYER 2: Upper Receiver, Deep Graphite Lower Chassis & Recessed Energy Cell Bay
  // =========================================================================

  // Machined dark gunmetal upper receiver spine (continuous beveled contour)
  const upperStations = []
  for (let i = 0; i <= 22; i++) {
    const u = i / 22
    const z = THREE.MathUtils.lerp(-0.46, 0.30, u)
    const width = 0.042 - Math.abs(u - 0.5) * 0.010
    const height = 0.024 + Math.sin(u * Math.PI) * 0.006
    upperStations.push({ z, points: superellipseRing(width, height, 0.088, 28, 3.8, 0, 0.25) })
  }
  const upperReceiver = new THREE.Mesh(buildLoftedSurface(upperStations, true, true), darkGunmetalMat)
  upperReceiver.name = 'upper-receiver'
  group.add(upperReceiver)

  // Deep graphite lower chassis & trigger well
  const lowerStations = []
  for (let i = 0; i <= 20; i++) {
    const u = i / 20
    const z = THREE.MathUtils.lerp(-0.48, 0.32, u)
    const w = 0.042 + Math.sin(u * Math.PI) * 0.014
    const h = 0.030 + (u > 0.55 ? 0.012 : 0)
    lowerStations.push({ z, points: superellipseRing(w, h, -0.048, 28, 3.2, 0, -0.15) })
  }
  const lowerChassis = new THREE.Mesh(buildLoftedSurface(lowerStations, true, true), graphiteMat)
  lowerChassis.name = 'graphite-lower-chassis'
  group.add(lowerChassis)

  // Ergonomic contoured pistol grip (smooth multi-station swept profile)
  const gripStations = []
  for (let i = 0; i <= 16; i++) {
    const u = i / 16
    const y = THREE.MathUtils.lerp(-0.06, -0.25, u)
    const z = THREE.MathUtils.lerp(0.17, 0.245, u) + Math.sin(u * Math.PI) * 0.012
    const rx = 0.024 - u * 0.003
    const rz = 0.036 - Math.sin(u * Math.PI) * 0.004
    const ring: Array<[number, number]> = []
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      ring.push([
        Math.sign(ca) * Math.pow(Math.abs(ca), 0.72) * rx,
        y + Math.sign(sa) * Math.pow(Math.abs(sa), 0.72) * 0.002,
      ])
    }
    gripStations.push({ z: z + (i === 0 ? 0 : 0), points: superellipseRing(rx, rz * 0.7, y, 24, 2.8) })
  }
  // Build sculpted grip along curved tube path for clean angled ergonomics
  const gripCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.055, 0.165),
    new THREE.Vector3(0, -0.115, 0.192),
    new THREE.Vector3(0, -0.185, 0.215),
    new THREE.Vector3(0, -0.255, 0.242),
  ])
  const gripGeo = new THREE.TubeGeometry(gripCurve, 22, 0.028, 24, false)
  gripGeo.scale(0.84, 1.0, 1.28)
  const gripMesh = new THREE.Mesh(gripGeo, graphiteMat)
  gripMesh.name = 'ergonomic-grip'
  group.add(gripMesh)

  // Swept trigger guard loop + curved trigger
  const guardCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.06, 0.065),
    new THREE.Vector3(0, -0.112, 0.088),
    new THREE.Vector3(0, -0.115, 0.148),
    new THREE.Vector3(0, -0.072, 0.165),
  ])
  const triggerGuard = new THREE.Mesh(new THREE.TubeGeometry(guardCurve, 20, 0.007, 14, false), darkGunmetalMat)
  group.add(triggerGuard)

  // Recessed Energy Cell Bay (left & right inset cavities with machined frame, cooling fins, cyan core, smoked glass cover)
  const energyBay = new THREE.Group()
  energyBay.name = 'energy-cell-bay'

  // Central cyan optical energy cylinder
  const coreGeo = new THREE.CylinderGeometry(0.019, 0.019, 0.26, 36, 1)
  coreGeo.rotateX(Math.PI / 2)
  const coreMesh = new THREE.Mesh(coreGeo, coreMaterial)
  coreMesh.position.set(0, 0.016, -0.16)
  energyBay.add(coreMesh)

  // 14 Precision machined cooling rings wrapping the cyan energy core
  const finGeo = new THREE.TorusGeometry(0.0235, 0.0032, 8, 24)
  for (let i = 0; i < 14; i++) {
    const fin = new THREE.Mesh(finGeo, darkGunmetalMat)
    fin.position.set(0, 0.016, -0.28 + i * 0.0185)
    energyBay.add(fin)
  }

  // Independent smoked-glass window & dark machined bezel frame on both sides
  const windowShape = new THREE.Shape()
  windowShape.absarc(-0.10, 0, 0.018, Math.PI * 0.5, Math.PI * 1.5, false)
  windowShape.absarc(0.10, 0, 0.018, -Math.PI * 0.5, Math.PI * 0.5, false)
  windowShape.closePath()
  const glassGeo = new THREE.ExtrudeGeometry(windowShape, {
    depth: 0.005,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.003,
    bevelThickness: 0.003,
    curveSegments: 14,
  })
  glassGeo.rotateY(Math.PI / 2)

  // Outer machined bezel ring around each energy window
  const bezelOuter = new THREE.Shape()
  bezelOuter.absarc(-0.105, 0, 0.025, Math.PI * 0.5, Math.PI * 1.5, false)
  bezelOuter.absarc(0.105, 0, 0.025, -Math.PI * 0.5, Math.PI * 0.5, false)
  bezelOuter.closePath()
  const bezelHole = new THREE.Path()
  bezelHole.absarc(-0.10, 0, 0.017, Math.PI * 0.5, Math.PI * 1.5, false)
  bezelHole.absarc(0.10, 0, 0.017, -Math.PI * 0.5, Math.PI * 0.5, false)
  bezelHole.closePath()
  bezelOuter.holes.push(bezelHole)
  const bezelGeo = new THREE.ExtrudeGeometry(bezelOuter, {
    depth: 0.009,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.0025,
    bevelThickness: 0.0025,
    curveSegments: 14,
  })
  bezelGeo.rotateY(Math.PI / 2)

  for (const side of [-1, 1] as const) {
    const bezel = new THREE.Mesh(bezelGeo, darkGunmetalMat)
    bezel.position.set(side * 0.062, 0.018, -0.16)
    energyBay.add(bezel)

    const glass = new THREE.Mesh(glassGeo, smokedGlassMat)
    glass.position.set(side * 0.064, 0.018, -0.16)
    energyBay.add(glass)

    // Thin crisp recessed cyan status slit inside cavity
    const glowBar = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.19, 16), coreMaterial)
    glowBar.rotation.x = Math.PI / 2
    glowBar.position.set(side * 0.056, 0.018, -0.16)
    energyBay.add(glowBar)
  }
  group.add(energyBay)

  // Precision Fluted Multi-Stage Barrel & Muzzle Compensator (LatheGeometry, 48 radial segments)
  const barrelProfile = [
    new THREE.Vector2(0.010, 0.00),
    new THREE.Vector2(0.024, 0.00),
    new THREE.Vector2(0.024, 0.05),
    new THREE.Vector2(0.018, 0.065),
    new THREE.Vector2(0.018, 0.19),
    new THREE.Vector2(0.022, 0.20),
    new THREE.Vector2(0.022, 0.24),
    new THREE.Vector2(0.017, 0.25),
    new THREE.Vector2(0.017, 0.34),
    new THREE.Vector2(0.025, 0.355),
    new THREE.Vector2(0.025, 0.43),
    new THREE.Vector2(0.019, 0.45),
    new THREE.Vector2(0.011, 0.45),
    new THREE.Vector2(0.011, 0.41),
  ]
  const barrelGeo = new THREE.LatheGeometry(barrelProfile, 48)
  barrelGeo.rotateX(-Math.PI / 2)
  const barrelMesh = new THREE.Mesh(barrelGeo, darkGunmetalMat)
  barrelMesh.position.set(0, 0.022, -0.54)
  barrelMesh.name = 'fluted-barrel'
  group.add(barrelMesh)

  // Machined barrel collar rings (adds sharp metallic highlights near front)
  for (let i = 0; i < 4; i++) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0032, 12, 32), chromeAccentMat)
    collar.position.set(0, 0.022, -0.62 - i * 0.07)
    group.add(collar)
  }

  // Forward magnetic rail stabilizer under barrel
  const underRailStations = []
  for (let i = 0; i <= 14; i++) {
    const u = i / 14
    const z = THREE.MathUtils.lerp(-0.92, -0.42, u)
    const rx = 0.012 + u * 0.010
    const ry = 0.011 + u * 0.007
    underRailStations.push({ z, points: superellipseRing(rx, ry, -0.020, 20, 3.0) })
  }
  group.add(new THREE.Mesh(buildLoftedSurface(underRailStations, true, true), darkGunmetalMat))

  // =========================================================================
  // LAYER 3: Near-Camera Details — Flush Top Optics, Fasteners, Cooling Louvers, Bolt & Decals
  // =========================================================================

  // Flush Low-Profile Holographic Reflex Optic (never occludes screen center crosshair)
  const opticGroup = new THREE.Group()
  opticGroup.name = 'flush-reflex-optic'
  opticGroup.position.set(0, 0.114, 0.02)

  const opticBaseShape = new THREE.Shape()
  opticBaseShape.moveTo(-0.028, -0.09)
  opticBaseShape.lineTo(0.028, -0.09)
  opticBaseShape.lineTo(0.024, 0.09)
  opticBaseShape.lineTo(-0.024, 0.09)
  opticBaseShape.closePath()
  const opticBaseGeo = new THREE.ExtrudeGeometry(opticBaseShape, {
    depth: 0.016,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.004,
    bevelThickness: 0.004,
  })
  opticBaseGeo.rotateX(Math.PI / 2)
  opticGroup.add(new THREE.Mesh(opticBaseGeo, darkGunmetalMat))

  // Sculpted open U-hood protecting the reflex glass
  const hoodCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.024, 0.002, 0.02),
    new THREE.Vector3(-0.026, 0.036, 0.01),
    new THREE.Vector3(0, 0.044, -0.005),
    new THREE.Vector3(0.026, 0.036, 0.01),
    new THREE.Vector3(0.024, 0.002, 0.02),
  ])
  const opticHood = new THREE.Mesh(new THREE.TubeGeometry(hoodCurve, 28, 0.0055, 16, false), titaniumMat)
  opticGroup.add(opticHood)

  // Tinted sapphire optic lens + crisp miniature cyan reticle dot
  const opticLens = new THREE.Mesh(new THREE.CircleGeometry(0.021, 32), smokedGlassMat)
  opticLens.position.set(0, 0.024, -0.005)
  opticGroup.add(opticLens)

  const reticleDot = new THREE.Mesh(new THREE.RingGeometry(0.003, 0.0046, 24), coreMaterial)
  reticleDot.position.set(0, 0.024, -0.004)
  opticGroup.add(reticleDot)
  group.add(opticGroup)

  // Rhythmic Milled Cooling Louver Vents on upper-forward shroud (both sides)
  const louverGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.028, 12)
  louverGeo.rotateX(Math.PI / 2)
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 8; i++) {
      const vent = new THREE.Mesh(louverGeo, graphiteMat)
      vent.position.set(side * 0.056, 0.054 - i * 0.001, -0.44 + i * 0.026)
      vent.rotation.z = side * 0.45
      group.add(vent)
    }
  }

  // Precision Hex-Socket Fasteners along near-camera side & top rail
  const boltHeadGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.005, 16)
  const boltSocketGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 0.006, 6)
  const fastenerCoords: Array<[number, number, number]> = [
    [-0.068, 0.056, 0.16],
    [-0.068, 0.056, 0.04],
    [-0.066, 0.050, -0.08],
    [-0.060, 0.044, -0.32],
    [-0.056, -0.024, 0.14],
    [-0.056, -0.024, 0.02],
    [0.068, 0.056, 0.16],
    [0.068, 0.056, 0.04],
    [0.066, 0.050, -0.08],
    [0.060, 0.044, -0.32],
  ]
  for (const [fx, fy, fz] of fastenerCoords) {
    const head = new THREE.Mesh(boltHeadGeo, chromeAccentMat)
    head.position.set(fx, fy, fz)
    head.rotation.z = Math.PI / 2
    const socket = new THREE.Mesh(boltSocketGeo, graphiteMat)
    socket.position.set(fx + Math.sign(fx) * 0.001, fy, fz)
    socket.rotation.z = Math.PI / 2
    group.add(head, socket)
  }

  // Procedural industrial marking plate on near-camera left flank
  const decalPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.04), decalMat)
  decalPlate.position.set(-0.0705, 0.020, 0.12)
  decalPlate.rotation.y = -Math.PI / 2
  group.add(decalPlate)

  // Reciprocating Bolt Carrier Group (animates smoothly back/forward on test-fire & shots)
  const boltGroup = new THREE.Group()
  boltGroup.name = 'bolt-carrier'
  const boltStations = [
    { z: -0.02, points: superellipseRing(0.015, 0.015, 0.064, 24, 3.0) },
    { z:  0.14, points: superellipseRing(0.016, 0.016, 0.064, 24, 3.0) },
  ]
  const boltBody = new THREE.Mesh(buildLoftedSurface(boltStations, true, true), chromeAccentMat)
  boltGroup.add(boltBody)
  // Charging handle nub on near-camera left side
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.032, 16), darkGunmetalMat)
  handle.rotation.z = Math.PI / 2
  handle.position.set(-0.032, 0.064, 0.04)
  boltGroup.add(handle)
  group.add(boltGroup)

  return {
    group,
    boltGroup,
    coreMesh,
    coreMaterial,
    muzzlePoint: new THREE.Vector3(0, 0.022, -1.0),
  }
}
