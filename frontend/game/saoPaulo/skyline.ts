import * as THREE from 'three'
import { mergeBufferGeometries } from './batchCollector'

/**
 * Photorealistic São Paulo Sunset Skyline & Twilight Atmospheric Sky Dome.
 * Direct architectural port of Max Payne 3: Fabricas Branco Floor 42 exterior panorama.
 *
 * Features:
 * - 430m radius hemisphere sky dome with smooth spherical golden-hour sunset gradient.
 * - Directional sun highlight at normalized vector (0.86, 0.34, 0.38).
 * - Valley floor at y = -148 with glowing arterial night traffic ribbons.
 * - 118 procedural high-rise skyscrapers with vertical gradient facades, stepped crowns,
 *   rooftop helipads, and blinking red obstruction beacon lights.
 */

export interface SkylineController {
  group: THREE.Group
  update: (elapsed: number) => void
  dispose: () => void
}

export function buildSaoPauloSkyline(): SkylineController {
  const root = new THREE.Group()
  root.name = 'SaoPauloSkyline'

  // 1. Twilight Sunset Sky Dome (SphereGeometry 430m, 40x24 segments)
  const skyGeo = new THREE.SphereGeometry(430, 40, 24)
  const skyPos = skyGeo.attributes.position
  if (!skyPos) {
    return {
      group: root,
      update: () => {},
      dispose: () => {
        skyGeo.dispose()
      },
    }
  }
  const skyColors = new Float32Array(skyPos.count * 3)

  const sunDir = new THREE.Vector3(0.86, 0.34, 0.38).normalize()
  const zenithCol = new THREE.Color(0x162038) // Deep twilight blue
  const midCol = new THREE.Color(0x6e447f)    // Sunset violet
  const horizonCol = new THREE.Color(0xf58e42)// Warm sunset gold
  const sunHighlightCol = new THREE.Color(0xffeedc) // Sun glare highlight
  const groundHazeCol = new THREE.Color(0x161418)   // Low altitude valley haze

  const normVec = new THREE.Vector3()
  const tempCol = new THREE.Color()

  for (let i = 0; i < skyPos.count; i++) {
    normVec.set(skyPos.getX(i), skyPos.getY(i), skyPos.getZ(i)).normalize()
    const y = normVec.y

    if (y >= 0) {
      const tMid = Math.min(1, y / 0.26)
      const tZenith = Math.min(1, Math.max(0, (y - 0.22) / 0.65))
      tempCol.copy(horizonCol).lerp(midCol, tMid).lerp(zenithCol, tZenith)
    } else {
      const tGround = Math.min(1, -y / 0.32)
      tempCol.copy(horizonCol).lerp(groundHazeCol, tGround)
    }

    const sunDot = Math.max(0, normVec.dot(sunDir))
    const sunGlow = Math.pow(sunDot, 7) * 0.65 + Math.pow(sunDot, 48) * 0.95
    tempCol.lerp(sunHighlightCol, Math.min(1, sunGlow))

    skyColors[i * 3] = tempCol.r
    skyColors[i * 3 + 1] = tempCol.g
    skyColors[i * 3 + 2] = tempCol.b
  }

  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3))
  const skyMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  })
  const skyMesh = new THREE.Mesh(skyGeo, skyMat)
  skyMesh.renderOrder = -10
  root.add(skyMesh)

  // 2. Ground Valley Floor (y = -148)
  const valleyGeo = new THREE.PlaneGeometry(820, 820)
  valleyGeo.rotateX(-Math.PI * 0.5)
  const valleyMat = new THREE.MeshBasicMaterial({
    color: 0x191419,
    fog: true,
  })
  const valleyMesh = new THREE.Mesh(valleyGeo, valleyMat)
  valleyMesh.position.y = -148
  root.add(valleyMesh)

  // 3. Glowing Highway Traffic Ribbons (São Paulo expressway arteries)
  const roadGeos: THREE.BufferGeometry[] = []
  const mat4 = new THREE.Matrix4()

  for (const z of [-85, -25, 48, 118, 195]) {
    const road = new THREE.BoxGeometry(720, 0.4, 3.2)
    mat4.makeTranslation(40, -147.6, z)
    road.applyMatrix4(mat4)
    roadGeos.push(road)
  }
  for (const x of [52, 115, 185, 260]) {
    const road = new THREE.BoxGeometry(3.2, 0.4, 720)
    mat4.makeTranslation(x, -147.6, 20)
    road.applyMatrix4(mat4)
    roadGeos.push(road)
  }

  const mergedRoads = mergeBufferGeometries(roadGeos)
  if (mergedRoads) {
    const roadMat = new THREE.MeshBasicMaterial({ color: 0xffa040 }) // Warm amber traffic glow
    const roadMesh = new THREE.Mesh(mergedRoads, roadMat)
    root.add(roadMesh)
  }

  // 4. Procedural Skyscrapers (118 towers)
  const towerGeos: THREE.BufferGeometry[] = []
  const helipadMarkings: THREE.BufferGeometry[] = []
  const beaconPoints: THREE.Vector3[] = []

  let seed = 19120515
  const rng = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  const towerPos = new THREE.Vector3()
  const towerQuat = new THREE.Quaternion()
  const towerEuler = new THREE.Euler()
  const towerScale = new THREE.Vector3(1, 1, 1)
  const groundY = -148

  function applyVerticalGradient(
    geo: THREE.BufferGeometry,
    baseR: number,
    baseG: number,
    baseB: number,
    sunLift = 0.25
  ): void {
    const pos = geo.attributes.position
    if (!pos) return
    const colors = new Float32Array(pos.count * 3)
    let minY = Infinity
    let maxY = -Infinity

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const heightSpan = Math.max(1, maxY - minY)

    for (let i = 0; i < pos.count; i++) {
      const normalizedY = (pos.getY(i) - minY) / heightSpan
      const groundShadow = (1 - normalizedY) * 0.22
      const r = Math.min(1, baseR + groundShadow * 0.75 + normalizedY * sunLift * 0.35)
      const g = Math.min(1, baseG + groundShadow * 0.38 + normalizedY * sunLift * 0.18)
      const b = Math.min(1, baseB + groundShadow * 0.18)

      colors[i * 3] = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  }

  for (let i = 0; i < 118; i++) {
    const angle = -Math.PI * 0.42 + rng() * Math.PI * 1.28
    const dist = 48 + Math.pow(rng(), 0.78) * 265
    const x = Math.cos(angle) * dist + 14
    const z = Math.sin(angle) * dist + 6

    // Avoid blocking executive windows directly
    if (x > -38 && x < 38 && z > -28 && z < 28) continue

    const width = 11 + rng() * 18
    const depth = 11 + rng() * 18
    const topY =
      x > 35 && z > -10 && z < 38 && dist < 130
        ? -8 + rng() * 12
        : -52 + rng() * 92

    const towerHeight = Math.max(40, topY - groundY)
    const rotY = Math.floor(rng() * 4) * Math.PI * 0.25 * 0.12
    const baseTone = 0.11 + rng() * 0.1
    const warmShift = rng() * 0.06

    const bodyGeo = new THREE.BoxGeometry(width, towerHeight, depth)
    applyVerticalGradient(bodyGeo, baseTone + warmShift + 0.03, baseTone + warmShift * 0.5, baseTone + 0.04, 0.28)

    towerEuler.set(0, rotY, 0)
    towerQuat.setFromEuler(towerEuler)
    towerPos.set(x, groundY + towerHeight * 0.5, z)
    mat4.compose(towerPos, towerQuat, towerScale)
    bodyGeo.applyMatrix4(mat4)
    towerGeos.push(bodyGeo)

    const roofY = groundY + towerHeight

    // Stepped mechanical crown or spire antenna
    if (rng() > 0.28) {
      const crownW = width * (0.55 + rng() * 0.25)
      const crownD = depth * (0.55 + rng() * 0.25)
      const crownH = 4 + rng() * 9
      const crownGeo = new THREE.BoxGeometry(crownW, crownH, crownD)
      applyVerticalGradient(crownGeo, baseTone + 0.06, baseTone + 0.04, baseTone + 0.05, 0.2)

      towerPos.set(x, roofY + crownH * 0.5, z)
      mat4.compose(towerPos, towerQuat, towerScale)
      crownGeo.applyMatrix4(mat4)
      towerGeos.push(crownGeo)

      if (rng() > 0.62) {
        const spireH = 12 + rng() * 22
        const spireGeo = new THREE.CylinderGeometry(0.18, 0.55, spireH, 5)
        applyVerticalGradient(spireGeo, 0.32, 0.26, 0.24, 0.3)

        towerPos.set(x, roofY + crownH + spireH * 0.5, z)
        mat4.compose(towerPos, towerQuat, towerScale)
        spireGeo.applyMatrix4(mat4)
        towerGeos.push(spireGeo)

        beaconPoints.push(new THREE.Vector3(x, roofY + crownH + spireH + 0.4, z))
      }
    } else if (dist < 125 && roofY < -4 && roofY > -38) {
      // Rooftop helipad
      const padR = Math.min(width, depth) * 0.42
      const padGeo = new THREE.CylinderGeometry(padR, padR * 1.04, 0.8, 16)
      applyVerticalGradient(padGeo, 0.2, 0.21, 0.24, 0.1)

      towerPos.set(x, roofY + 0.4, z)
      mat4.compose(towerPos, new THREE.Quaternion(), towerScale)
      padGeo.applyMatrix4(mat4)
      towerGeos.push(padGeo)

      const ringGeo = new THREE.RingGeometry(padR * 0.68, padR * 0.78, 20)
      ringGeo.rotateX(-Math.PI * 0.5)
      towerPos.set(x, roofY + 0.84, z)
      mat4.compose(towerPos, new THREE.Quaternion(), towerScale)
      ringGeo.applyMatrix4(mat4)
      helipadMarkings.push(ringGeo)

      for (const offset of [-padR * 0.22, padR * 0.22]) {
        const barGeo = new THREE.BoxGeometry(padR * 0.1, 0.08, padR * 0.62)
        towerPos.set(x + offset, roofY + 0.84, z)
        mat4.compose(towerPos, new THREE.Quaternion(), towerScale)
        barGeo.applyMatrix4(mat4)
        helipadMarkings.push(barGeo)
      }
    }
  }

  // Merge towers into batched mesh
  const mergedTowers = mergeBufferGeometries(towerGeos, true)
  if (mergedTowers) {
    const towerMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      reflectivity: 0.25,
    })
    const towerMesh = new THREE.Mesh(mergedTowers, towerMat)
    towerMesh.name = 'batched_skyscrapers'
    root.add(towerMesh)
  }

  // Merge helipad markings
  const mergedHelipads = mergeBufferGeometries(helipadMarkings)
  if (mergedHelipads) {
    const helipadMat = new THREE.MeshBasicMaterial({ color: 0xffd073 })
    const helipadMesh = new THREE.Mesh(mergedHelipads, helipadMat)
    root.add(helipadMesh)
  }

  // 5. Red Obstruction Beacon Lights (Aviation warning lights on antenna tips)
  const beaconGeo = new THREE.BufferGeometry().setFromPoints(beaconPoints)
  const beaconMat = new THREE.PointsMaterial({
    color: 0xff3030,
    size: 2.8,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.95,
  })
  const beaconPointsMesh = new THREE.Points(beaconGeo, beaconMat)
  beaconPointsMesh.name = 'skyline_beacons'
  root.add(beaconPointsMesh)

  return {
    group: root,
    update: (elapsed: number) => {
      // Pulsing aviation warning blink (1.2 Hz flash)
      const flash = Math.sin(elapsed * 7.5) > 0.2 ? 0.95 : 0.08
      beaconMat.opacity = flash
    },
    dispose: () => {
      skyGeo.dispose()
      skyMat.dispose()
      valleyGeo.dispose()
      valleyMat.dispose()
      mergedRoads?.dispose()
      mergedTowers?.dispose()
      mergedHelipads?.dispose()
      beaconGeo.dispose()
      beaconMat.dispose()
    },
  }
}
