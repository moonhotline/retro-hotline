import * as THREE from 'three'
import { buildLoftedSurface, makeBrushedMetalTexture, type LoftStation } from './geometry'

export interface IndustrialCarRig {
  group: THREE.Group
  bodyGroup: THREE.Group
  headlights: THREE.Object3D[]
  taillightMaterial: THREE.MeshStandardMaterial
  drlMaterial: THREE.MeshStandardMaterial
  nitrousFlames: THREE.Mesh[]
  frontWheelPivots: THREE.Group[]
  wheelSpinGroups: THREE.Group[]
  muzzleLeft: THREE.Vector3
  muzzleRight: THREE.Vector3
  setHeadlightsOn: (on: boolean) => void
  setBrakeIntensity: (amount: number) => void
  setNitrousIntensity: (amount: number) => void
}

function makeContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 512
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = c.getContext('2d')
  } catch {
    ctx = null
  }
  if (ctx) {
    ctx.clearRect(0, 0, 256, 512)
    // Soft grounded elliptical underbody contact shadow
    const grad = ctx.createRadialGradient(128, 256, 36, 128, 256, 124)
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.88)')
    grad.addColorStop(0.58, 'rgba(0, 0, 0, 0.56)')
    grad.addColorStop(0.84, 'rgba(0, 0, 0, 0.18)')
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.save()
    ctx.scale(1, 1.92)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 256, 268)
    ctx.restore()
  }
  const tex = new THREE.CanvasTexture(c)
  return tex
}

function catmull(a: number, b: number, c: number, d: number, u: number): number {
  return (
    0.5 *
    (2 * b +
      (-a + c) * u +
      (2 * a - 5 * b + 4 * c - d) * u * u +
      (-a + 3 * b - 3 * c + d) * u * u * u)
  )
}

/**
 * Generates an automotive body cross-section ring at longitudinal station z.
 * Coordinates: +Z is front nose, -Z is rear tail (so front 3/4 at (+3.8, 1.35, +4.4) shows nose & right flank).
 */
function buildCarBodyRing(
  halfWidth: number,
  sillY: number,
  beltY: number,
  deckY: number,
  shoulderPinch: number,
  tumblehome: number,
  crown: number,
  segments = 72
): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  const midY = (sillY + deckY) * 0.5
  const ry = Math.max(0.05, (deckY - sillY) * 0.5)

  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    const ca = Math.cos(theta)
    const sa = Math.sin(theta)
    const signX = Math.sign(ca)
    const ax = Math.abs(ca)

    // Smooth superellipse base with sculpted automotive shoulder crease & tucked lower rocker
    let x = signX * Math.pow(ax, 0.62) * halfWidth
    let y = midY + Math.sign(sa) * Math.pow(Math.abs(sa), 0.72) * ry

    if (sa > 0) {
      // Upper fender / hood / deck crown with smooth tumblehome taper
      const upperT = sa
      const pinch = 1 - tumblehome * Math.pow(upperT, 1.35)
      x *= pinch
      // Subtle center hood/deck arch
      y += Math.pow(1 - ax, 1.5) * crown * upperT
      // Sculpted shoulder crease around beltline
      const beltFactor = Math.exp(-Math.pow((y - beltY) * 5.2, 2))
      x += signX * beltFactor * shoulderPinch
    } else {
      // Tucked aerodynamic lower sill rocker
      const lowerT = -sa
      x *= 1 - 0.08 * Math.pow(lowerT, 1.8)
      y = Math.max(sillY, y)
    }

    pts.push([x, y])
  }
  return pts
}

function interpolateStations(control: readonly LoftStation[], totalSteps: number): LoftStation[] {
  const result: LoftStation[] = []
  const ringLen = control[0]!.points.length
  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps
    const scaled = t * (control.length - 1)
    const idx = Math.min(control.length - 2, Math.floor(scaled))
    const frac = scaled - idx
    const s0 = control[Math.max(0, idx - 1)]!
    const s1 = control[idx]!
    const s2 = control[idx + 1]!
    const s3 = control[Math.min(control.length - 1, idx + 2)]!
    const z = catmull(s0.z, s1.z, s2.z, s3.z, frac)
    const pts: Array<[number, number]> = []
    for (let k = 0; k < ringLen; k++) {
      const p0 = s0.points[k]!
      const p1 = s1.points[k]!
      const p2 = s2.points[k]!
      const p3 = s3.points[k]!
      pts.push([catmull(p0[0], p1[0], p2[0], p3[0], frac), catmull(p0[1], p1[1], p2[1], p3[1], frac)])
    }
    result.push({ z, points: pts })
  }
  return result
}

/**
 * Route B Procedural Automotive Model — NEON GT COUPE.
 * Target budget: 30,000 – 55,000 triangles focused on continuous curved widebody surfacing,
 * low arched smoked-glass canopy, deep-dish sculpted multi-spoke wheels & brake rotors,
 * recessed dark headlight bays with crisp white DRL strips, full-width magenta taillight blade,
 * and low sill cyan underglow + soft ground contact shadow.
 */
export function buildIndustrialSportsCar(): IndustrialCarRig {
  const group = new THREE.Group()
  group.name = 'neon-gt-coupe'

  const bodyGroup = new THREE.Group()
  bodyGroup.name = 'car-body-sprung'
  group.add(bodyGroup)

  const paintGrain = makeBrushedMetalTexture('#53688a', 0.06)

  // Calibrated luxury satin-clearcoat metallic gunmetal-steel paint (reads crisp in Neutral & Bloom OFF)
  const bodyPaintMat = new THREE.MeshPhysicalMaterial({
    color: 0x425678,
    map: paintGrain,
    metalness: 0.66,
    roughness: 0.24,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  })
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x111620,
    metalness: 0.42,
    roughness: 0.44,
  })
  const darkRecessMat = new THREE.MeshStandardMaterial({
    color: 0x070a10,
    metalness: 0.28,
    roughness: 0.65,
  })
  const trimBlackMat = new THREE.MeshStandardMaterial({
    color: 0x0d121b,
    metalness: 0.72,
    roughness: 0.2,
  })
  const canopyGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x081322,
    metalness: 0.14,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.88,
  })
  const titaniumRimMat = new THREE.MeshStandardMaterial({
    color: 0xbac7d8,
    metalness: 0.92,
    roughness: 0.19,
  })
  const tireRubberMat = new THREE.MeshStandardMaterial({
    color: 0x12151c,
    metalness: 0.08,
    roughness: 0.78,
  })
  const brakeDiscMat = new THREE.MeshStandardMaterial({
    color: 0x8994a3,
    metalness: 0.86,
    roughness: 0.3,
  })
  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0xff2e76,
    metalness: 0.55,
    roughness: 0.28,
  })
  const drlMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4fbff,
    emissive: 0xeaf8ff,
    emissiveIntensity: 2.2,
    roughness: 0.1,
    metalness: 0.1,
  })
  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0xff2e88,
    emissive: 0xff2478,
    emissiveIntensity: 1.95,
    roughness: 0.12,
    metalness: 0.1,
  })
  const underglowMat = new THREE.MeshStandardMaterial({
    color: 0x26e6ff,
    emissive: 0x1ee0ff,
    emissiveIntensity: 1.45,
    roughness: 0.15,
    metalness: 0.1,
  })

  // =========================================================================
  // 1. CONTINUOUS WIDEBODY LOFTED SHELL (Nose +2.26m -> Rear -2.26m)
  // Smooth Catmull-Rom longitudinal stations for uninterrupted specular highlights
  // =========================================================================
  const bodyControl: LoftStation[] = [
    { z: 2.26, points: buildCarBodyRing(0.58, 0.20, 0.34, 0.42, 0.01, 0.18, 0.03) },
    { z: 2.16, points: buildCarBodyRing(0.84, 0.19, 0.44, 0.55, 0.02, 0.14, 0.04) },
    { z: 1.92, points: buildCarBodyRing(0.97, 0.18, 0.58, 0.69, 0.04, 0.11, 0.05) },
    { z: 1.44, points: buildCarBodyRing(1.01, 0.18, 0.68, 0.77, 0.05, 0.10, 0.04) },
    { z: 0.92, points: buildCarBodyRing(0.98, 0.18, 0.72, 0.80, 0.04, 0.11, 0.03) },
    { z: 0.18, points: buildCarBodyRing(0.96, 0.18, 0.74, 0.82, 0.04, 0.12, 0.02) },
    { z: -0.58, points: buildCarBodyRing(1.01, 0.19, 0.77, 0.85, 0.06, 0.11, 0.03) },
    { z: -1.32, points: buildCarBodyRing(1.05, 0.20, 0.81, 0.90, 0.07, 0.10, 0.04) },
    { z: -1.86, points: buildCarBodyRing(1.00, 0.23, 0.82, 0.91, 0.05, 0.12, 0.03) },
    { z: -2.16, points: buildCarBodyRing(0.90, 0.28, 0.80, 0.89, 0.02, 0.13, 0.02) },
    { z: -2.26, points: buildCarBodyRing(0.76, 0.34, 0.77, 0.85, 0.01, 0.14, 0.01) },
  ]
  const denseBody = interpolateStations(bodyControl, 48)
  const bodyShell = new THREE.Mesh(buildLoftedSurface(denseBody, true, true), bodyPaintMat)
  bodyShell.name = 'car-widebody-shell'
  bodyGroup.add(bodyShell)

  // =========================================================================
  // 2. DEPRESSED ARCHED SMOKED-GLASS CANOPY & ROOF FASTBACK
  // Elongated raked windshield transitioning seamlessly into a low coupe roof
  // =========================================================================
  const canopyRing = (hw: number, baseY: number, topY: number, segments = 56): Array<[number, number]> => {
    const pts: Array<[number, number]> = []
    const cy = (baseY + topY) * 0.5
    const ry = Math.max(0.02, (topY - baseY) * 0.5)
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), 0.72) * hw * (sa > 0 ? 1 - 0.16 * sa : 1)
      const y = cy + Math.sign(sa) * Math.pow(Math.abs(sa), 0.78) * ry
      pts.push([x, Math.max(baseY, y)])
    }
    return pts
  }
  const canopyControl: LoftStation[] = [
    { z: 0.96, points: canopyRing(0.68, 0.74, 0.79) },
    { z: 0.62, points: canopyRing(0.76, 0.76, 1.00) },
    { z: 0.22, points: canopyRing(0.77, 0.77, 1.15) },
    { z: -0.26, points: canopyRing(0.76, 0.78, 1.18) },
    { z: -0.82, points: canopyRing(0.73, 0.80, 1.11) },
    { z: -1.42, points: canopyRing(0.68, 0.83, 0.98) },
    { z: -1.88, points: canopyRing(0.58, 0.85, 0.90) },
  ]
  const denseCanopy = interpolateStations(canopyControl, 28)
  const canopyMesh = new THREE.Mesh(buildLoftedSurface(denseCanopy, true, true), canopyGlassMat)
  canopyMesh.name = 'car-arched-canopy'
  bodyGroup.add(canopyMesh)

  // Painted structural roof spine & C-pillar buttresses framing the fastback glass
  const roofControl: LoftStation[] = [
    { z: 0.28, points: canopyRing(0.56, 1.11, 1.17, 32) },
    { z: -0.22, points: canopyRing(0.58, 1.14, 1.20, 32) },
    { z: -0.78, points: canopyRing(0.54, 1.08, 1.13, 32) },
    { z: -1.36, points: canopyRing(0.46, 0.95, 1.00, 32) },
  ]
  const roofPanel = new THREE.Mesh(buildLoftedSurface(interpolateStations(roofControl, 14), true, true), bodyPaintMat)
  roofPanel.name = 'car-roof-panel'
  bodyGroup.add(roofPanel)

  // Gloss-black greenhouse window trim rails (left & right swept arches)
  for (const side of [-1, 1] as const) {
    const windowRail = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.70, 0.78, 0.92),
      new THREE.Vector3(side * 0.76, 0.98, 0.45),
      new THREE.Vector3(side * 0.73, 1.14, -0.22),
      new THREE.Vector3(side * 0.68, 1.06, -0.95),
      new THREE.Vector3(side * 0.60, 0.89, -1.68),
    ])
    const trimMesh = new THREE.Mesh(new THREE.TubeGeometry(windowRail, 28, 0.017, 10, false), trimBlackMat)
    bodyGroup.add(trimMesh)

    // Subtle functional door seam curve (minimal, crisp, zero clutter)
    const doorSeam = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.97, 0.73, 0.74),
      new THREE.Vector3(side * 0.97, 0.48, 0.72),
      new THREE.Vector3(side * 0.93, 0.24, 0.64),
      new THREE.Vector3(side * 0.95, 0.24, -0.62),
      new THREE.Vector3(side * 1.01, 0.56, -0.72),
      new THREE.Vector3(side * 0.98, 0.77, -0.68),
    ])
    const seamMesh = new THREE.Mesh(new THREE.TubeGeometry(doorSeam, 24, 0.006, 6, false), darkRecessMat)
    bodyGroup.add(seamMesh)
  }

  // =========================================================================
  // 3. SCULPTED WIDEBODY WHEEL ARCH FLARES & DARK WHEEL WELL LINERS
  // =========================================================================
  const wheelZFront = 1.38
  const wheelZRear = -1.36
  const wheelX = 0.99
  const wheelRadius = 0.36

  for (const [wz, flareOut] of [
    [wheelZFront, 0.04],
    [wheelZRear, 0.06],
  ] as const) {
    for (const side of [-1, 1] as const) {
      // Sculpted curved fender arch lip flush with widebody quarter panel (no non-origin scale!)
      const archCurvePts: THREE.Vector3[] = []
      for (let i = 0; i <= 18; i++) {
        const ang = (i / 18) * Math.PI
        const az = wz + Math.cos(ang) * (wheelRadius + 0.065)
        const ay = wheelRadius + Math.sin(ang) * (wheelRadius + 0.06)
        const ax = side * (1.01 + Math.sin(ang) * flareOut)
        archCurvePts.push(new THREE.Vector3(ax, ay, az))
      }
      const archCurve = new THREE.CatmullRomCurve3(archCurvePts)
      const flareMesh = new THREE.Mesh(new THREE.TubeGeometry(archCurve, 26, 0.036, 14, false), bodyPaintMat)
      bodyGroup.add(flareMesh)

      // Dark inner wheel well backing drum positioned inboard behind the brake assembly
      const liner = new THREE.Mesh(
        new THREE.CylinderGeometry(wheelRadius + 0.05, wheelRadius + 0.05, 0.14, 24),
        darkRecessMat
      )
      liner.rotation.z = Math.PI / 2
      liner.position.set(side * (wheelX - 0.22), wheelRadius + 0.01, wz)
      bodyGroup.add(liner)
    }
  }

  // =========================================================================
  // 4. FRONT AERO SPLITTER, RECESSED HEADLIGHT BAYS & SLIM WHITE DRL STRIPS
  // =========================================================================
  // Sculpted extruded front carbon splitter lip
  const splitterShape = new THREE.Shape()
  splitterShape.moveTo(-0.92, 0)
  splitterShape.quadraticCurveTo(-0.98, 0.16, -0.78, 0.28)
  splitterShape.quadraticCurveTo(0, 0.42, 0.78, 0.28)
  splitterShape.quadraticCurveTo(0.98, 0.16, 0.92, 0)
  splitterShape.closePath()
  const splitterGeo = new THREE.ExtrudeGeometry(splitterShape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.014,
    bevelSegments: 3,
    curveSegments: 20,
  })
  splitterGeo.rotateX(Math.PI / 2)
  const splitter = new THREE.Mesh(splitterGeo, carbonMat)
  splitter.position.set(0, 0.21, 1.88)
  bodyGroup.add(splitter)

  // Recessed central front intake grille cove + horizontal aero louvre
  const grilleRecess = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.04, 16), darkRecessMat)
  grilleRecess.rotation.z = Math.PI / 2
  grilleRecess.scale.set(0.65, 1, 0.5)
  grilleRecess.position.set(0, 0.29, 2.20)
  bodyGroup.add(grilleRecess)

  const headlights: THREE.Object3D[] = []
  for (const side of [-1, 1] as const) {
    // Deep dark recessed headlight bay sculpted into nose fender
    const bayCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.48, 0.46, 2.18),
      new THREE.Vector3(side * 0.69, 0.50, 2.09),
      new THREE.Vector3(side * 0.86, 0.55, 1.94),
    ])
    const bayMesh = new THREE.Mesh(new THREE.TubeGeometry(bayCurve, 18, 0.042, 12, false), darkRecessMat)
    bodyGroup.add(bayMesh)

    // Slim white razor DRL LED strip nestled inside the dark recessed bay
    const drlCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.49, 0.47, 2.21),
      new THREE.Vector3(side * 0.70, 0.51, 2.12),
      new THREE.Vector3(side * 0.86, 0.56, 1.97),
    ])
    const drlStrip = new THREE.Mesh(new THREE.TubeGeometry(drlCurve, 20, 0.014, 10, false), drlMaterial)
    drlStrip.name = side < 0 ? 'headlight-drl-left' : 'headlight-drl-right'
    bodyGroup.add(drlStrip)

    // Dual optical projector domes inside bay
    for (const [px, pz] of [
      [0.58, 2.16],
      [0.72, 2.09],
    ] as const) {
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 12), drlMaterial)
      lens.position.set(side * px, 0.48, pz)
      bodyGroup.add(lens)
    }

    // Soft feathered optical headlight lens flare + subtle ground illumination pool (no hard grey cone wedges)
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {},
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          // Smooth radial & longitudinal feathering: bright near headlamp, zero at edges & far tip
          float along = smoothstep(1.0, 0.0, vUv.y);
          float across = exp(-pow((vUv.x - 0.5) * 3.8, 2.0));
          float alpha = along * along * across * 0.22;
          gl_FragColor = vec4(0.84, 0.96, 1.0, alpha);
        }`,
    })
    const beamGeo = new THREE.PlaneGeometry(1.15, 3.8)
    beamGeo.translate(0, 1.9, 0)
    beamGeo.rotateX(Math.PI / 2)
    const beam = new THREE.Mesh(beamGeo, beamMat)
    beam.position.set(side * 0.64, 0.06, 2.18)
    bodyGroup.add(beam)
    headlights.push(beam)

    // Sculpted teardrop aerodynamic side mirror on door shoulder
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.16, 12), trimBlackMat)
    stalk.rotation.z = -side * 0.85
    stalk.position.set(side * 0.94, 0.82, 0.46)
    bodyGroup.add(stalk)

    const mirrorCap = new THREE.Mesh(new THREE.SphereGeometry(0.068, 18, 14), bodyPaintMat)
    mirrorCap.scale.set(1.25, 0.55, 1.55)
    mirrorCap.position.set(side * 1.04, 0.87, 0.42)
    bodyGroup.add(mirrorCap)

    // Recessed forward pulse cannon muzzle pod nestled inside front intake corner
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.24, 14), titaniumRimMat)
    cannon.rotation.x = Math.PI / 2
    cannon.position.set(side * 0.62, 0.28, 2.15)
    bodyGroup.add(cannon)
  }

  // =========================================================================
  // 5. FULL-WIDTH MAGENTA TAILLIGHT BLADE, REAR DIFFUSER & DUAL EXHAUSTS
  // =========================================================================
  // Recessed dark rear light cove spanning full tail width
  const rearCoveCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.84, 0.72, -2.18),
    new THREE.Vector3(-0.46, 0.74, -2.25),
    new THREE.Vector3(0, 0.75, -2.27),
    new THREE.Vector3(0.46, 0.74, -2.25),
    new THREE.Vector3(0.84, 0.72, -2.18),
  ])
  const rearCove = new THREE.Mesh(new THREE.TubeGeometry(rearCoveCurve, 28, 0.040, 12, false), darkRecessMat)
  bodyGroup.add(rearCove)

  // Continuous razor-sharp full-width magenta LED taillight blade
  const tailBladeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.84, 0.72, -2.21),
    new THREE.Vector3(-0.46, 0.74, -2.28),
    new THREE.Vector3(0, 0.75, -2.30),
    new THREE.Vector3(0.46, 0.74, -2.28),
    new THREE.Vector3(0.84, 0.72, -2.21),
  ])
  const tailBlade = new THREE.Mesh(new THREE.TubeGeometry(tailBladeCurve, 32, 0.018, 12, false), taillightMaterial)
  tailBlade.name = 'car-taillight-blade'
  bodyGroup.add(tailBlade)

  // Subtle integrated rear ducktail aero spoiler lip seated flush on rear decklid (no non-origin scale!)
  const spoilerCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.78, 0.88, -1.98),
    new THREE.Vector3(-0.42, 0.90, -2.07),
    new THREE.Vector3(0, 0.91, -2.10),
    new THREE.Vector3(0.42, 0.90, -2.07),
    new THREE.Vector3(0.78, 0.88, -1.98),
  ])
  const spoilerMesh = new THREE.Mesh(new THREE.TubeGeometry(spoilerCurve, 26, 0.024, 12, false), carbonMat)
  bodyGroup.add(spoilerMesh)

  // Sculpted carbon rear diffuser + 5 vertical aerodynamic strakes tucked cleanly inside rear valence
  const diffShape = new THREE.Shape()
  diffShape.moveTo(-0.70, 0)
  diffShape.lineTo(0.70, 0)
  diffShape.lineTo(0.62, 0.19)
  diffShape.lineTo(-0.62, 0.19)
  diffShape.closePath()
  const diffGeo = new THREE.ExtrudeGeometry(diffShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
  })
  const diffuser = new THREE.Mesh(diffGeo, carbonMat)
  diffuser.position.set(0, 0.20, -2.18)
  bodyGroup.add(diffuser)

  for (const fx of [-0.46, -0.23, 0, 0.23, 0.46]) {
    const finShape = new THREE.Shape()
    finShape.moveTo(0, 0)
    finShape.lineTo(0.22, 0.02)
    finShape.lineTo(0.22, 0.17)
    finShape.lineTo(0.04, 0.15)
    finShape.closePath()
    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.016, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 })
    finGeo.rotateY(Math.PI / 2)
    const fin = new THREE.Mesh(finGeo, trimBlackMat)
    fin.position.set(fx - 0.008, 0.20, -1.94)
    bodyGroup.add(fin)
  }

  // Dual machined titanium exhaust tips + nitrous plasma flames tucked inside rear valence
  const nitrousFlames: THREE.Mesh[] = []
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x3cf0ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  for (const side of [-1, 1] as const) {
    const tipProfile = [
      new THREE.Vector2(0.042, 0),
      new THREE.Vector2(0.054, 0.01),
      new THREE.Vector2(0.054, 0.16),
      new THREE.Vector2(0.044, 0.16),
      new THREE.Vector2(0.042, 0.02),
    ]
    const tipGeo = new THREE.LatheGeometry(tipProfile, 24)
    tipGeo.rotateX(Math.PI / 2)
    const tip = new THREE.Mesh(tipGeo, titaniumRimMat)
    tip.position.set(side * 0.36, 0.29, -2.19)
    bodyGroup.add(tip)

    const flameGeo = new THREE.ConeGeometry(0.065, 0.85, 16)
    flameGeo.translate(0, -0.42, 0)
    flameGeo.rotateX(Math.PI / 2)
    const flame = new THREE.Mesh(flameGeo, flameMat)
    flame.position.set(side * 0.36, 0.29, -2.21)
    flame.visible = false
    bodyGroup.add(flame)
    nitrousFlames.push(flame)
  }

  // =========================================================================
  // 6. SIDE ROCKER SKIRTS, CLOSE-TO-SILL CYAN UNDERGLOW & CONTACT SHADOW
  // =========================================================================
  for (const side of [-1, 1] as const) {
    // Aerodynamic carbon side skirt flush with lower rocker sill (no non-origin scale!)
    const skirtCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.93, 0.19, 0.88),
      new THREE.Vector3(side * 0.92, 0.185, 0.0),
      new THREE.Vector3(side * 0.94, 0.19, -0.88),
    ])
    const skirt = new THREE.Mesh(new THREE.TubeGeometry(skirtCurve, 20, 0.032, 10, false), carbonMat)
    bodyGroup.add(skirt)

    // Low close-to-sill cyan underglow strip tucked directly beneath skirt edge
    const glowStrip = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 1.66, 10), underglowMat)
    glowStrip.rotation.x = Math.PI / 2
    glowStrip.position.set(side * 0.84, 0.16, 0)
    bodyGroup.add(glowStrip)
  }

  // Soft ground contact shadow anchoring tires to road
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.55, 5.15),
    new THREE.MeshBasicMaterial({
      map: makeContactShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.92,
    })
  )
  contactShadow.rotation.x = -Math.PI / 2
  contactShadow.position.set(0, 0.008, 0)
  group.add(contactShadow)

  // =========================================================================
  // 7. FOUR SCULPTED DEEP-DISH MULTI-SPOKE WHEELS, TIRES & VENTILATED BRAKES
  // High-detail automotive wheel assemblies (major driver of 30k–55k craftsmanship)
  // =========================================================================
  const tireWidth = 0.29
  const tireProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.245, -tireWidth * 0.46),
    new THREE.Vector2(0.325, -tireWidth * 0.50),
    new THREE.Vector2(0.352, -tireWidth * 0.44),
    new THREE.Vector2(0.360, -tireWidth * 0.30),
    new THREE.Vector2(0.362, -tireWidth * 0.12),
    new THREE.Vector2(0.362, tireWidth * 0.12),
    new THREE.Vector2(0.360, tireWidth * 0.30),
    new THREE.Vector2(0.352, tireWidth * 0.44),
    new THREE.Vector2(0.325, tireWidth * 0.50),
    new THREE.Vector2(0.245, tireWidth * 0.46),
  ]
  const sharedTireGeo = new THREE.LatheGeometry(tireProfile, 48)
  sharedTireGeo.rotateZ(Math.PI / 2)

  const rimBarrelProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.245, -tireWidth * 0.43),
    new THREE.Vector2(0.248, tireWidth * 0.43),
    new THREE.Vector2(0.232, tireWidth * 0.44),
    new THREE.Vector2(0.220, tireWidth * 0.24),
    new THREE.Vector2(0.205, -tireWidth * 0.12),
    new THREE.Vector2(0.225, -tireWidth * 0.42),
  ]
  const sharedRimGeo = new THREE.LatheGeometry(rimBarrelProfile, 48)
  sharedRimGeo.rotateZ(Math.PI / 2)

  // Sculpted beveled spoke geometry (10 radial split-Y spokes per wheel)
  const spokeShape = new THREE.Shape()
  spokeShape.moveTo(-0.011, 0.045)
  spokeShape.lineTo(0.011, 0.045)
  spokeShape.lineTo(0.017, 0.222)
  spokeShape.lineTo(-0.017, 0.222)
  spokeShape.closePath()
  const sharedSpokeGeo = new THREE.ExtrudeGeometry(spokeShape, {
    depth: 0.024,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 2,
  })
  sharedSpokeGeo.rotateY(Math.PI / 2)

  const sharedDiscGeo = new THREE.CylinderGeometry(0.185, 0.185, 0.026, 36)
  sharedDiscGeo.rotateZ(Math.PI / 2)

  const sharedHubGeo = new THREE.CylinderGeometry(0.058, 0.064, 0.075, 24)
  sharedHubGeo.rotateZ(Math.PI / 2)

  const sharedLugGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.024, 8)
  sharedLugGeo.rotateZ(Math.PI / 2)

  const caliperShape = new THREE.Shape()
  caliperShape.absarc(0, 0, 0.195, -0.45, 0.45, false)
  caliperShape.absarc(0, 0, 0.140, 0.45, -0.45, true)
  const sharedCaliperGeo = new THREE.ExtrudeGeometry(caliperShape, {
    depth: 0.065,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 16,
  })
  sharedCaliperGeo.rotateY(Math.PI / 2)

  const frontWheelPivots: THREE.Group[] = []
  const wheelSpinGroups: THREE.Group[] = []

  const wheelSpecs: ReadonlyArray<readonly [number, number, boolean, number]> = [
    [-wheelX, wheelZFront, true, -1],
    [wheelX, wheelZFront, true, 1],
    [-wheelX - 0.02, wheelZRear, false, -1],
    [wheelX + 0.02, wheelZRear, false, 1],
  ]

  for (const [wx, wz, isFront, side] of wheelSpecs) {
    const pivot = new THREE.Group()
    pivot.position.set(wx, wheelRadius, wz)
    group.add(pivot)
    if (isFront) frontWheelPivots.push(pivot)

    // Non-spinning brake caliper mounted to knuckle
    const caliper = new THREE.Mesh(sharedCaliperGeo, caliperMat)
    caliper.position.set(-side * 0.03, 0, 0)
    caliper.rotation.x = side > 0 ? Math.PI : 0
    pivot.add(caliper)

    const spinGroup = new THREE.Group()
    pivot.add(spinGroup)
    wheelSpinGroups.push(spinGroup)

    const tire = new THREE.Mesh(sharedTireGeo, tireRubberMat)
    spinGroup.add(tire)

    const rim = new THREE.Mesh(sharedRimGeo, titaniumRimMat)
    spinGroup.add(rim)

    const disc = new THREE.Mesh(sharedDiscGeo, brakeDiscMat)
    disc.position.x = -side * 0.03
    spinGroup.add(disc)

    const hub = new THREE.Mesh(sharedHubGeo, trimBlackMat)
    hub.position.x = side * 0.03
    spinGroup.add(hub)

    // 10 Sculpted forged Y-spokes
    for (let s = 0; s < 10; s++) {
      const angle = (s / 10) * Math.PI * 2
      const spoke = new THREE.Mesh(sharedSpokeGeo, titaniumRimMat)
      spoke.rotation.x = angle
      spoke.position.x = side * 0.055
      spinGroup.add(spoke)
    }

    // 5 Precision lug nuts around center hub
    for (let l = 0; l < 5; l++) {
      const la = (l / 5) * Math.PI * 2
      const lug = new THREE.Mesh(sharedLugGeo, titaniumRimMat)
      lug.position.set(side * 0.068, Math.cos(la) * 0.034, Math.sin(la) * 0.034)
      spinGroup.add(lug)
    }
  }

  return {
    group,
    bodyGroup,
    headlights,
    taillightMaterial,
    drlMaterial,
    nitrousFlames,
    frontWheelPivots,
    wheelSpinGroups,
    muzzleLeft: new THREE.Vector3(-0.62, 0.28, 2.30),
    muzzleRight: new THREE.Vector3(0.62, 0.28, 2.30),
    setHeadlightsOn(on: boolean) {
      drlMaterial.emissiveIntensity = on ? 2.2 : 0.15
      for (const beam of headlights) beam.visible = on
    },
    setBrakeIntensity(amount: number) {
      taillightMaterial.emissiveIntensity = 1.85 + THREE.MathUtils.clamp(amount, 0, 1) * 1.9
    },
    setNitrousIntensity(amount: number) {
      const a = THREE.MathUtils.clamp(amount, 0, 1)
      flameMat.opacity = a * 0.85
      for (const flame of nitrousFlames) {
        flame.visible = a > 0.05
        flame.scale.set(0.8 + a * 0.4, 0.8 + a * 0.4, 0.65 + a * 0.9)
      }
    },
  }
}
