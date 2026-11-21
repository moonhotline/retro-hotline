import { BufferGeometry, DoubleSide, Group, MeshStandardNodeMaterial, PointLight, SphereGeometry } from 'three/webgpu'
import { color, mix, positionWorld, sin } from 'three/tsl'
import { batch, capsule, finish, patch, ribbon, strut, type Point } from './geometry'
import { seeded, textured } from './surfaces'

type Tree = readonly [x: number, z: number, height: number]

export function landscape(root: Group, trees: readonly Tree[], beds: readonly Point[], luminaires: readonly Point[], seed: number) {
  const rng = seeded(seed)
  const branches: BufferGeometry[] = []
  const foliage = Array.from({ length: 3 }, () => [] as BufferGeometry[])
  trees.forEach(([x, z, h], i) => {
    const sway = (rng() - 0.5) * h * 0.45
    const tip: Point = [x + sway, h, z - h * 0.06]
    branches.push(ribbon([[x, 0, z], [x + sway * 0.26, h * 0.42, z], tip],
      h * 0.041, 46, 18))
    for (let j = 0; j < 8; j++) {
      const a = j * 2.39996 + i
      const extent = h * (0.20 + rng() * 0.35)
      const cx = x + sway + Math.cos(a) * extent
      const cz = z + Math.sin(a) * extent
      const cy = h * (0.53 + rng() * 0.43)
      branches.push(capsule([x + sway * 0.56, h * 0.59, z], [cx, cy, cz], h * 0.015, 16, 13))
      for (let k = 0; k < 5; k++) {
        const px = cx + (rng() - 0.5) * h * 0.35
        const pz = cz + (rng() - 0.5) * h * 0.33
        const py = cy + (rng() - 0.46) * h * 0.3
        const size = h * (0.084 + rng() * 0.128)
        const batch = foliage[(i + j + k) % 3]!
        for (let leaf = 0; leaf < 38; leaf++) {
          const lx = px + (rng() - .5) * size * 2.1
          const ly = py + (rng() - .5) * size * 1.18
          const lz = pz + (rng() - .5) * size * 2.1
          const heading = rng() * Math.PI * 2
          const tilt = (rng() - .54) * 1.2
          const length = size * (.24 + rng() * .38)
          const wide = length * (.27 + rng() * .24)
          batch.push(patch((u,v) => {
            const off = (u-.5) * wide * Math.sin(v * Math.PI)
            const along = (v-.51) * length
            const bent = Math.abs(u-.5) * -.37 * wide + tilt*along - v*v * length * .20
            return [lx + Math.cos(heading)*along - Math.sin(heading)*off, ly + bent,
              lz + Math.sin(heading)*along + Math.cos(heading)*off]
          },2,5))
        }
      }
    }
  })
  if (branches.length) {
    batch(root, branches, textured(finish(0x413027, 0.92, 0.06), seed, 'wood', 0.04), 'Tapered trunks and branching canopy')
    foliage.forEach((shapes, i) => {
      batch(root, shapes, finish([0x344a22, 0x505938, 0x263e2e][i]!, 0.87, .05), 'Layered leaf clusters')
    })
  }

  const blades: BufferGeometry[] = []
  const rocks: BufferGeometry[] = []
  const seedHeads: BufferGeometry[] = []
  for (const [x, size, z] of beds) {
    for (let i = 0; i < 208; i++) {
      const tuft = Math.floor(i / 26)
      const cx = Math.sin(tuft * 4.6) * size * 1.02
      const cz = Math.cos(tuft * 5.4) * size * .82
      const px = x + cx + (rng() - 0.5) * size * .68
      const pz = z + cz + (rng() - 0.5) * size * .57
      const a = rng() * 6.283
      const w = 0.009 + rng() * 0.023
      const h = 0.21 + rng() * 0.55
      blades.push(patch((u, v) => {
        const width = (u - 0.5) * w * (1.03 - v)
        return [px + Math.cos(a) * v * v * h * 0.64 + width * Math.sin(a), v * h,
          pz + Math.sin(a) * v * v * h * 0.64 - width * Math.cos(a)]
      }, 2, 5))
      if (i % 16 === 0) {
        const tip: Point = [px + Math.cos(a) * h * .64, h, pz + Math.sin(a) * h * .64]
        seedHeads.push(capsule([tip[0]-.025, tip[1]-.05, tip[2]], [tip[0]+.025, tip[1]+.09, tip[2]],
          .018, 12, 10))
      }
    }
    const stone = new SphereGeometry(size * 0.32, 42, 30)
    const positions = stone.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      const grow = 0.83 + 0.17 * Math.cos(positions.getX(i) * 20 + positions.getY(i) * 17)
      positions.setXYZ(i, positions.getX(i) * grow * 1.18, positions.getY(i) * grow * 0.57,
        positions.getZ(i) * grow)
    }
    stone.translate(x, size * .06, z)
    stone.computeVertexNormals()
    rocks.push(stone)
  }
  if (blades.length >= 280) {
    const grass = new MeshStandardNodeMaterial({ roughness:.8, side:DoubleSide })
    const p = positionWorld
    grass.colorNode = mix(color('#1b2716'), color('#716740'),
      p.y.mul(1.35).add(sin(p.x.mul(13).add(p.z.mul(6.7))).mul(.11)).clamp())
    batch(root, blades, grass, 'Dense varied tufts of curved ornamental grasses')
    batch(root, seedHeads, finish(0x9b7756,.78,.03), 'Grass inflorescences')
    batch(root, rocks, textured(finish(0x626660, 0.87, 0.06), seed + 1, 'stone', 0.06), 'Shaped stone borders')
  }

  if (luminaires.length) {
    const poles: BufferGeometry[] = []
    const lamps: BufferGeometry[] = []
    luminaires.forEach(([x, height, z], i) => {
      poles.push(strut([x, .01, z], [x, height + .03, z], .117, .102, 40, 30))
      lamps.push(strut([x, height * .67, z + .09], [x, height * .92, z + .09], .074, .043, 40, 32))
      if (i < 5) {
        const light = new PointLight(0xffbb72, 4.8, 4.0, 2)
        light.position.set(x, height, z + .14)
        root.add(light)
      }
    })
    batch(root, poles, finish(0x262525, 0.51, .54), 'Walkway bollards')
    batch(root, lamps, finish(0xffca8a, 0.35, .2, 0xffae55, 3.8), 'Bollard light windows')
  }
}
