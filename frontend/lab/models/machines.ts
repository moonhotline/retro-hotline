import { Float32BufferAttribute, Group, Vector3 } from 'three/webgpu'
import { ring } from './cutaway.js'
import { batch, capsule as makeCapsule, finish, patch as makePatch, plating as makePlating,
  ribbon as makeRibbon, strut as makeStrut, type Point } from './geometry'
import { armorSurface, textured } from './surfaces'

const spiderShell = [
  [[-0.66,.61,-0.92],[0.58,.66,-.91],[0.86,.57,-.39],[.68,.66,.44],[-.68,.64,.52],[-.92,.52,-.30]],
  [[-.69,.62,.56],[.67,.65,.47],[.88,.47,.82],[.65,.32,1.16],[-.65,.33,1.17],[-.86,.51,.84]],
  [[.68,.62,.43],[.89,.56,-.39],[1.18,.28,-.56],[1.37,.15,.49],[.88,.39,.92]],
  [[-.69,.60,.49],[-.93,.48,-.30],[-1.31,.22,-.50],[-1.34,.13,.49],[-.89,.42,.95]],
  [[-1.18,.25,-.58],[-.62,.60,-.95],[.57,.65,-.94],[1.17,.22,-.57],[.69,.23,-1.39],[-.66,.18,-1.38]],
] as const satisfies readonly (readonly Point[])[]

const bugShell = [
  [[-.07,.98,-1.04],[-1.10,.56,-.56],[-.99,.39,.39],[-.56,.28,1.08],[.028,.085,1.66]],
  [[-.04,.98,-1.04],[.064,.085,1.66],[.78,.32,.87],[1.08,.51,-.27]],
  [[-1.06,.52,-.63],[-1.70,.30,-.42],[-1.91,.00,.34],[-1.41,-.08,1.04],[-.63,.26,1.04],[-1.11,.40,.30]],
  [[1.14,.49,-.36],[1.73,.32,-.40],[1.85,-.02,.27],[1.44,-.05,1.08],[.78,.33,.82]],
  [[-.08,.95,-1.06],[1.15,.61,-.51],[1.46,.28,-.85],[.94,.38,-1.60],[-.78,.40,-1.64],[-1.42,.26,-.94]],
] as const satisfies readonly (readonly Point[])[]

export function machine(wide: boolean, detail = 1) {
  const segments = (count: number) => Math.max(6, Math.round(count * detail))
  const capsule = (a: Point, b: Point, radius: number, radial: number, length: number) =>
    makeCapsule(a, b, radius, segments(radial), segments(length))
  const strut = (a: Point, b: Point, width: number, depth: number, steps = 88, sides = 64) =>
    makeStrut(a, b, width, depth, segments(steps), segments(sides))
  const ribbon = (points: readonly Point[], radius: number, steps: number, sides: number) =>
    makeRibbon(points, radius, segments(steps), segments(sides))
  const plating = (outline: readonly Point[], thickness: number, count: number) =>
    makePlating(outline, thickness, segments(count))
  const root = new Group()
  const armor = armorSurface(wide)
  const housing = textured(finish(0x292a28, 0.53, 0.55), 562, 'metal', 0.015)
  const joint = textured(finish(0x797670, 0.37, 0.80), 43, 'metal', 0.012)
  const fastener = finish(0x6d6a5f, 0.47, 0.72)
  const black = finish(0x14171a, 0.67)
  const accent = wide ? 0xff8a18 : 0x0f9fc0
  const sensor = finish(accent, 0.26, 0.25, accent, 2.9)
  const level = wide ? 0.88 : 2.0

  batch(root, [plating([
    [-1.02,level + .24,-.82],[1.02,level + .24,-.82],[1.13,level + .19,.61],
    [.70,level + .18,1.13],[-.68,level + .18,1.13],[-1.13,level + .2,.58],
  ], wide ? 0.58 : 0.72, 25)], black, 'Armored drive chassis')

  const design = wide ? bugShell : spiderShell
  const count = design.length
  const plates = design.map((outline, i) => {
    const mount = new Group()
    mount.name = `Armor panel ${i + 1}`
    root.add(mount)
    const boundary = outline.map(([x, y, z]) => new Vector3(x * (wide ? 1.07 : 1.02), y * (wide ? .94 : 1.43) + level, z))
    const center = boundary.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(boundary.length)
    batch(mount, [plating(boundary.map(vertex => vertex.toArray()), wide ? .20 : .23, 26)],
      armor, 'Faceted wear and bevels')
    const screws = boundary.flatMap((vertex, j) => {
      const next = boundary[(j + 1) % boundary.length]!
      return [.15,.84].map(offset => {
        const a = vertex.clone().lerp(next, offset).lerp(center, .14)
        const b = a.clone().add(new Vector3(0, .017, 0))
        return capsule(a.toArray(), b.toArray(), wide ? .039 : .029, 30, 22)
      })
    })
    batch(mount, screws, fastener, 'Recessed perimeter fastener heads')
    return mount
  })
  const debris = new Group()
  debris.name = 'Core rupture'
  const hot = finish(accent, 0.28, 0.48, accent, 3.2)
  const core = batch(debris, [makePatch((u, v) => {
    const longitude = u * Math.PI * 2
    const latitude = v * Math.PI
    return [0.44 * Math.sin(latitude) * Math.cos(longitude), 0.33 * Math.cos(latitude),
      0.38 * Math.sin(latitude) * Math.sin(longitude)]
  }, segments(112), segments(48))], hot, 'Exposed core')
  core.position.y = level + 0.18
  const fragments = Array.from({ length: 7 }, (_, i) => {
    const length = 0.14 + 0.027 * (i % 4)
    return batch(debris, [strut([-length, 0, 0], [length, 0.035, 0.04], 0.032, 0.057)],
      i % 3 === 0 ? hot : armor, `Core fragment ${i + 1}`)
  })
  debris.visible = false
  root.add(debris)
  const edge = wide ? 0.99 : 0.81
  const chin = level - (wide ? 0.25 : 0.15)
  const bezelZ = wide ? 1.35 : 1.19
  batch(root, [plating([[-edge,chin + .31,bezelZ - .10],[edge,chin + .31,bezelZ - .10],
    [edge * .88,chin + .26,bezelZ + .18],[-edge * .88,chin + .26,bezelZ + .18]], .23, 28)], housing, 'Recessed optics housing')
  const driveParts = [-1,1].flatMap(side => [
    strut([side * .38,chin - .03,1.22],[side * 1.05,chin + .14,.84],.123,.097,48,32),
    strut([side * .62,chin - .10,.66],[side * .85,chin - .09,-.64],.12,.102,46,30),
    ribbon([[side*.59,chin+.14,1.06],[side*.78,chin-.14,.85],
      [side*.9,chin-.19,.28],[side*.87,chin+.06,-.41]],.056,51,32),
  ])
  batch(root, driveParts, housing, 'Secondary cheek armor, drive rails and recessed cabling')
  const cells = wide ? [-0.65,-0.49,0.49,0.65] : [0]
  batch(root, cells.map(x => capsule(
    [x - (wide ? .033 : .37), chin + .14, bezelZ + .195],
    [x + (wide ? .033 : .37), chin + .14, bezelZ + .195], wide ? .044 : .040, 58, 90,
  )), sensor, 'Front sensor optics')
  if (!wide) {
    batch(root, [capsule([.36,level + .29,1.157],[.73,level + .32,1.12],.024,58,90)],
      finish(0xff9b34,.31,.24,0xff821a,3.6), 'Amber identification strip')
  } else {
    batch(root, [-1,1].map(side => ribbon([[side*.45,.70,1.1],[side*.54,.46,1.56],[side*.68,.33,1.92]],
      .048, 68, 40)), joint, 'Pair of forward antennae')
  }

  const pairs = wide ? 3 : 4
  const legs: { pivot: Vector3; group: Group; phase: number }[] = []
  for (const side of [-1, 1]) {
    for (let leg = 0; leg < pairs; leg++) {
      const offset = leg - (pairs - 1) / 2
      const near = leg === pairs - 1
      const hip: Point = [side * (wide ? 1.13 : 0.94), level - 0.16, offset * 0.56]
      const knee: Point = [side * ((wide ? 1.86 : 2.04) + (near ? .02 : .18)),
        wide ? .78 : near ? 2.79 : 2.32 - Math.abs(offset) * .05, offset * (wide ? .92 : 1.15)]
      const ankle: Point = [side * ((wide ? 2.24 : 2.66) + (near ? -.12 : .11)),
        wide ? .31 : 1.17, offset * (wide ? 1.16 : 1.45)]
      const toe: Point = [side * ((wide ? 2.54 : 3.32) + (near ? -.28 : .06)), 0.12,
        offset * (wide ? 1.36 : 1.80)]
      const legGroup = new Group()
      legGroup.name = `Leg ${side === -1 ? 'L' : 'R'}${leg + 1}`
      root.add(legGroup)
      legs.push({ pivot: new Vector3(...hip), group: legGroup, phase: leg * Math.PI + (side === 1 ? Math.PI : 0) })
      const thick = wide ? .175 : .125
      batch(legGroup, [
        strut(hip, knee, thick, thick * 1.54, 62, 36),
        strut(knee, ankle, thick * .83, thick * 1.31, 58, 40),
        strut(ankle, toe, thick * .62, thick * .90, 56, 40),
      ], armor, 'Three armor links')
      const bearingAngle = -side * Math.PI * (.37 + offset * .06)
      const bearings = [hip, knee, ankle].map((node, i) => {
        const collar = ring(-0.16, 0.16, .054, (i === 1 ? .206 : .168) * (wide ? 1.11 : 1), .034,
          { segs: segments(108), smooth: segments(30) })
        const vertices = collar.getAttribute('position')
        const coordinates = new Float32Array(vertices.count * 2)
        for (let vertex = 0; vertex < vertices.count; vertex++) {
          coordinates[vertex * 2] = Math.atan2(vertices.getZ(vertex), vertices.getY(vertex)) / (Math.PI * 2) + .5
          coordinates[vertex * 2 + 1] = vertices.getX(vertex) / .32 + .5
        }
        collar.setAttribute('uv', new Float32BufferAttribute(coordinates, 2))
        return collar.rotateY(bearingAngle).translate(...node)
      })
      batch(legGroup, bearings, joint, 'Flanged bearings at hip, knee and ankle')
      const hubAxis = new Vector3(Math.cos(bearingAngle), 0, -Math.sin(bearingAngle)).multiplyScalar(side)
      const caps = [hip,knee,ankle].flatMap((node, i) => {
        const start = new Vector3(...node).addScaledVector(hubAxis,.145)
        const end = start.clone().addScaledVector(hubAxis,.043)
        return [capsule(start.toArray(),end.toArray(),i === 1 ? .138 : .112,48,10)]
      })
      const fasteners = [hip,knee,ankle].flatMap((node, i) => {
        const r = i === 1 ? .151 : .119
        const center = new Vector3(...node).addScaledVector(hubAxis,.187)
        return Array.from({length: 7},(_, fastener) => {
          const angle = fastener * Math.PI * 2 / 7
          const start = center.clone().add(new Vector3(hubAxis.z * Math.cos(angle) * r,
            Math.sin(angle) * r, -hubAxis.x * Math.cos(angle) * r))
          return capsule(start.toArray(),start.clone().addScaledVector(hubAxis,.017).toArray(),.017,25,10)
        })
      })
      batch(legGroup,fasteners,fastener,'Axle-cap fasteners')

      const linkPairs = [[hip, knee], [knee, ankle]] as const
      const pistons = linkPairs.map(([from, to]) => {
        const start = new Vector3(...from).lerp(new Vector3(...to), .14)
        const end = new Vector3(...from).lerp(new Vector3(...to), .90)
        const setback = new Vector3(-side * .10, -0.11, .14)
        start.add(setback)
        end.add(setback)
        return { start, end, middle: start.clone().lerp(end, .56) }
      })
      batch(legGroup, [...caps, ...pistons.map(piston =>
        capsule(piston.start.toArray(), piston.middle.toArray(), .086, 62, 42))],
      housing, 'Inset axle caps and dark hydraulic sleeves')
      batch(legGroup, pistons.map(piston => capsule(piston.middle.toArray(), piston.end.toArray(), .049, 62, 42)),
        joint, 'Exposed chrome piston rods')
      batch(legGroup, [ribbon([
        hip, [hip[0] + side * .15,hip[1] - .23,hip[2] + .13],
        [knee[0] - side * .42,knee[1] - .27,knee[2] + .11], knee,
      ], .032, 100, 54)], black, 'Exposed hydraulic hose')
      const [x,y,z] = toe
      const w = wide ? .21 : .18
      batch(legGroup, [plating([[x-w,y,z-.25],[x+w,y,z-.25],[x+w*1.2,y,z+.20],
        [x+w*.78,y,z+.30],[x-w*.78,y,z+.30],[x-w*1.2,y,z+.20]], .15, 22)], housing, 'Chamfered foot pad')
    }
  }
  function poseRupture(elapsed: number) {
    const duration = 1.18
    const playing = elapsed < duration
    debris.visible = playing
    const time = Math.min(elapsed, 0.52) * 0.34 + Math.max(0, elapsed - 0.52)
    const progress = playing ? Math.min(1, time * 1.9) : 0
    const recoil = playing ? Math.sin(Math.PI * Math.pow(elapsed / duration, 0.66)) : 0
    plates.forEach((plate, i) => {
      const angle = (i + 0.5) * Math.PI * 2 / count + Math.PI / 2
      plate.position.set(Math.cos(angle) * recoil * 0.88, recoil * 0.51, Math.sin(angle) * recoil * 0.88)
    })
    core.scale.setScalar(Math.max(0.1, 1 - progress))
    fragments.forEach((fragment, i) => {
      const a = i * Math.PI * 2 / fragments.length
      const distance = progress * (1.5 + i * 0.11)
      fragment.position.set(Math.cos(a) * distance, level + 0.18 + progress * (2.9 - 2.3 * progress),
        Math.sin(a) * distance)
      fragment.rotation.set(progress * (i + 2), a + time * 4, progress * 7)
      fragment.scale.setScalar(1 - progress * 0.74)
    })
    return playing
  }

  const pivotOffset = new Vector3()
  function poseWalk(phase: number, stride: number, warning: number) {
    for (const { pivot, group, phase: offset } of legs) {
      const step = phase + offset
      group.rotation.y = Math.sin(step) * stride * .20
      group.position.copy(pivot).sub(pivotOffset.copy(pivot).applyQuaternion(group.quaternion))
      group.position.y += Math.max(0, Math.cos(step)) * stride * .18
    }
    sensor.emissiveIntensity = 2.9 + warning * 6
  }

  return { root, poseRupture, poseWalk }
}
