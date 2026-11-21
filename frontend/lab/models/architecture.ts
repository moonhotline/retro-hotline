import { DoubleSide, Group, MeshBasicNodeMaterial, SphereGeometry } from 'three/webgpu'
import { color, mix, positionLocal, smoothstep, uv, vec2 } from 'three/tsl'
import { batch, facade, finish, patch, ribbon, strut, type Point } from './geometry'

export function gate() {
  const root = new Group()
  const steel = finish(0xae3e22, 0.53, 0.36)
  const cable = finish(0x652918, 0.62, 0.38)
  const road = finish(0x34383b, 0.22, 0.55)
  batch(root, [facade([-7, 0.015, 26], [7, 0.015, 26], [-7, 0.015, -94])], road, 'Bridge deck')
  const trusses = []
  for (const z of [-7, -56]) {
    for (const x of [-6.75, 6.75]) {
      trusses.push(strut([x * 1.08, -0.5, z], [x, 21, z], 0.69, 0.96))
    }
    for (const y of [9.7, 15.8, 20.7]) {
      trusses.push(strut([-6.8, y, z], [6.8, y, z], 0.54, 0.7))
      for (let x = -5.8; x < 6.8; x += 1.15) {
        trusses.push(strut([x, y + 0.72, z], [x + 1.0, y - 0.67, z], 0.13, 0.44, 8, 12))
      }
    }
  }
  batch(root, trusses, steel, 'Riveted orange towers')
  const lines = []
  const cableHeight = (z: number) => z > -7 ? 20.8 - (z + 7) * 0.38
    : 7.5 + 13.3 * Math.pow((z + 31.5) / 24.5, 2)
  for (const x of [-6.85, 6.85]) {
    const points: Point[] = Array.from({ length: 22 }, (_, i) => {
      const z = -56 + i * 3.5
      return [x, cableHeight(z), z]
    })
    lines.push(ribbon(points, 0.19, 210, 26))
    lines.push(strut([x, 1.2, 22], [x, 1.2, -91], 0.085, 0.12, 128, 44))
    for (let z = -55; z < 22; z += 2.5) {
      lines.push(strut([x, 0, z], [x, cableHeight(z), z], 0.048, 0.048, 13, 12))
    }
  }
  batch(root, lines, cable, 'Suspension cables and rails')
  batch(root, Array.from({ length: 23 }, (_, i) => {
    const z = 23 - i * 4
    return facade([-0.09, 0.023, z], [0.09, 0.023, z], [-0.09, 0.023, z - 1.7], 12, 20)
  }), finish(0xc4b6a1, 0.64), 'Road markings')
  const lamps = []
  const glass = []
  for (const z of [13, -2, -19, -36, -53]) {
    for (const x of [-6.2, 6.2]) {
      const end = x * 0.8
      lamps.push(ribbon([[x, 0, z], [x, 4.7, z], [x * 0.9, 5.4, z], [end, 5.42, z]], 0.085, 64, 20))
      glass.push(strut([end - 0.16, 5.32, z], [end + 0.16, 5.32, z], 0.15, 0.075, 42, 28))
    }
  }
  batch(root, lamps, steel, 'Curved lamp standards')
  batch(root, glass, finish(0xe79544, 0.25, 0.2, 0xff8b25, 3.4), 'Amber bridge lamps')
  return root
}

function ringBand(radius: number, top: number, height: number, trim = 0) {
  return patch((u, v) => {
    const a = (u - 0.5) * Math.PI * 1.48
    const y = top + v * height
    const r = radius + trim * Math.sin(v * Math.PI)
    return [Math.sin(a) * r, y, -2 - (1 - Math.cos(a)) * r]
  }, 304, 24)
}

export function orchard() {
  const root = new Group()
  const glass = new MeshBasicNodeMaterial()
  const windowGrid = uv().x.mul(78).fract().lessThan(0.025)
    .or(uv().y.mul(6).fract().lessThan(0.035))
  const occupancy = uv().x.mul(78).floor().mul(7.123).add(uv().y.mul(6).floor().mul(2.19)).sin()
  glass.colorNode = mix(mix(color('#142e3a'), color('#a97d49'), smoothstep(0.5, 0.92, occupancy)),
    color('#132026'), windowGrid)
  batch(root, [ringBand(19, 0.8, 7.1)], glass, 'Curved glass envelope')
  batch(root, [0.68, 2.86, 5.1, 7.62].map(y => ringBand(19, y, 0.28, 0.38)),
    finish(0xc4d2db, 0.27, 0.7), 'Anodized floor bands')
  batch(root, [ringBand(19.1, 7.84, 0.16, 0.19)], finish(0xd8edff, 0.25, 0.3, 0x7eb8f5, 1.6), 'Roof light line')
  batch(root, [patch((u, v) => {
    const t = u * Math.PI * 2
    const r = 0.001 + v
    return [-5 + 8.2 * r * Math.cos(t), 0.032 + Math.sin(t * 17 + v * 49) * 0.011, 6 + 4.2 * r * Math.sin(t)]
  }, 156, 144)], finish(0x27434e, 0.16, 0.65), 'Reflecting pond')
  batch(root, [patch((u, v) => [
    4.5 + v * 2.7 + 1.7 * Math.sin(u * 4), 0.04, 22 - 27 * u,
  ])], finish(0x788185, 0.23, 0.48), 'Courtyard path')
  const trunks = []
  const crowns = []
  for (let i = 0; i < 13; i++) {
    const a = i * 2.39996
    const x = (i / 12 - 0.5) * 30
    const z = -0.2 - 0.018 * x * x + Math.sin(a) * 1.3
    const h = 1.7 + 0.8 * Math.sin(i + 1)
    trunks.push(strut([x, 0, z], [x + 0.16, h, z], 0.09, 0.12, 32, 24))
    crowns.push(patch((u, v) => {
      const theta = u * Math.PI * 2
      const phi = v * Math.PI
      const radius = 0.86 + 0.12 * Math.sin(theta * 9) * Math.sin(phi * 13)
      return [x + radius * Math.sin(phi) * Math.cos(theta), h + radius * Math.cos(phi),
        z + radius * Math.sin(phi) * Math.sin(theta)]
    }, 44, 34))
  }
  batch(root, trunks, finish(0x28251a, 0.96), 'Tree trunks')
  batch(root, crowns, finish(0x223c28, 0.89), 'Courtyard trees')
  batch(root, [new SphereGeometry(1.02, 128, 72).translate(-20, 18, -42)],
    finish(0xe9efff, 0.98, 0, 0xb5d0ff, 2.8), 'Moon')
  return root
}

export function square() {
  const root = new Group()
  const towers = []
  const signs = []
  const glass = new MeshBasicNodeMaterial()
  const frames = uv().x.mul(18).fract().lessThan(0.14).or(uv().y.mul(34).fract().lessThan(0.13))
  const lit = uv().x.mul(18).floor().mul(1.523).add(uv().y.mul(34).floor().mul(39.15)).sin()
  glass.colorNode = mix(mix(color('#142337'), color('#7b6753'), smoothstep(0.74, 0.98, lit)),
    color('#0c1421'), frames)
  const screen = new MeshBasicNodeMaterial()
  const stripe = uv().y.sub(uv().x.mul(0.72)).add(positionLocal.z.mul(0.04)).mul(3).fract()
  screen.colorNode = mix(color('#d01731'), color('#fff0e6').mul(2), smoothstep(0.62, 0.67, stripe)
    .mul(smoothstep(0.95, 0.99, stripe).oneMinus()))
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const inner = side * (7 + Math.sin(i * 1.6) * 1.3)
      const outer = inner + side * (5.2 + (i % 3))
      const z = 9 - i * 8
      const h = 17 + (i * 11 % 19)
      towers.push(facade([inner, 0, z], [inner, 0, z - 7.6], [inner, h, z], 68, 56))
      towers.push(facade([Math.min(inner, outer), 0, z], [Math.max(inner, outer), 0, z],
        [Math.min(inner, outer), h, z], 52, 56))
      if (i < 5) {
        const x = inner - side * 0.025
        signs.push(facade([x, 4.4, z - 1], [x, 4.4, z - 6.7], [x, 10.7 + i % 2, z - 1], 90, 70))
      }
    }
  }
  towers.push(facade([-2.3, 0, -26], [2.3, 0, -26], [-2.3, 26, -26]))
  signs.push(facade([-1.55, 5, -25.97], [1.55, 5, -25.97], [-1.55, 24, -25.97]))
  // Façades on both sides of the street share materials.
  glass.side = screen.side = DoubleSide
  batch(root, towers, glass, 'Window-grid towers')
  batch(root, signs, screen, 'LED billboards')
  batch(root, Array.from({ length: 10 }, (_, i) => strut(
    [-6.6, i * 0.16 + 0.08, 6.2 - i * 0.54], [-6.6, i * 0.16 + 0.08, -7],
    0.064, 0.58, 48, 36,
  )), finish(0xba1430, 0.24, 0.4, 0xe81435, 2.4), 'Red illuminated steps')
  return root
}

function towerGlass(root: Group, name: string, y: (u: number) => number) {
  const material = new MeshBasicNodeMaterial()
  const grid = uv().x.mul(18).fract().lessThan(0.038).or(uv().y.mul(5).fract().lessThan(0.032))
  const room = uv().x.mul(18).floor().mul(37.13).sin()
  material.colorNode = mix(mix(color('#473e31'), color('#d79f56'), smoothstep(-0.94, 0.9, room)),
    color('#202a31'), grid)
  material.side = DoubleSide
  batch(root, [patch((u, v) => [-13 + u * 26, v * y(u), 2 + (1 - Math.abs(u * 2 - 1)) * 0.6],
    160, 72)], material, name)
}

export function bayView() {
  const root = new Group()
  const roofHeight = (u: number, v: number) => {
    const rise = Math.max(0, 1 - Math.abs((u * 2.2 + 0.4) % 1 * 2 - 1))
    const seam = Math.max(0, Math.cos(u * Math.PI * 152) * Math.cos(v * Math.PI * 69))
    return 4.6 + Math.pow(rise, 2.4) * (4.8 + Math.sin(Math.PI * v) * 2) + seam * 0.073
  }
  const shingle = new MeshBasicNodeMaterial()
  const band = uv().y.mul(38)
  const tileX = uv().x.mul(81).add(band.floor().mod(2).mul(0.5)).fract()
  const tileShade = tileX.mul(6.283).sin().mul(band.fract().mul(3.14).sin()).mul(0.24).add(0.53)
  const seam = band.fract().lessThan(0.075).or(tileX.lessThan(0.031))
  shingle.colorNode = mix(mix(color('#263347'), color('#94a9d1'), tileShade), color('#253044'), seam)
  shingle.side = DoubleSide
  batch(root, [patch((u, v) => [-15 + 30 * u, roofHeight(u, v), 3.6 - 16 * v], 400, 160)],
    shingle, 'Dragon-scale canopy')
  batch(root, [ribbon(Array.from({ length: 80 }, (_, i) => {
    const u = i / 79
    return [-15 + 30 * u, roofHeight(u, 0) - 0.07, 3.61]
  }), 0.115, 210, 40)], finish(0xb8c2cd, 0.28, 0.75), 'Waved roof hem')
  towerGlass(root, 'Warm concourse glazing', u => roofHeight(0.067 + u * 0.866, 0.1) - 0.14)
  batch(root, Array.from({ length: 8 }, (_, i) => {
    const x = -12.2 + i * 3.5
    return strut([x, 0, 2.4], [x + 1.05, roofHeight((x + 15) / 30, 0.12), 1.9], 0.085, 0.11, 52, 32)
  }), finish(0xb7a991, 0.37, 0.61), 'Raked support columns')
  return root
}

function triangle(a: Point, b: Point, c: Point) {
  return patch((u, v) => [
    a[0] + (b[0] - a[0]) * u * (1 - v) + (c[0] - a[0]) * v,
    a[1] + (b[1] - a[1]) * u * (1 - v) + (c[1] - a[1]) * v,
    a[2] + (b[2] - a[2]) * u * (1 - v) + (c[2] - a[2]) * v,
  ], 108, 58)
}

export function voyager() {
  const root = new Group()
  const left: Point = [-15, 10, 4]
  const point: Point = [3, 5, 5.5]
  const right: Point = [14, 11.5, 3]
  const ridge: Point = [0.3, 11.6, -7.5]
  const end: Point = [7, 12, -15]
  batch(root, [triangle(left, point, ridge), triangle(ridge, point, right), triangle(right, ridge, end)],
    finish(0x576479, 0.33, 0.73), 'Folded triangular roof')
  batch(root, [strut(left, point, 0.053, 0.069), strut(point, [3, 0, 5.5], 0.045, 0.055)],
    finish(0xb8ee53, 0.34, 0.22, 0xc0ff16, 3), 'Lime entry seam')
  towerGlass(root, 'Atrium glazing', u => 9 - 4.3 * (1 - Math.abs(u * 2 - 1)))
  const supports = []
  for (let i = 0; i < 7; i++) {
    const x = -12.8 + i * 4.1
    const h = 9 - 4.3 * (1 - Math.abs(x / 13))
    supports.push(strut([x, 0, 3.05], [x + 3.8, h, 3.05], 0.105, 0.16, 54, 32),
      strut([x, 0, 3.11], [x - 3.6, h, 3.11], 0.105, 0.16, 54, 32))
  }
  batch(root, supports, finish(0x42504e, 0.32, 0.72), 'Exposed roof trusses')
  return root
}

export function docks() {
  const root = new Group()
  const wall = finish(0x383932, 0.91, 0.1)
  const metal = finish(0x5f513e, 0.51, 0.61)
  const safety = finish(0x9b6c30, 0.47, 0.36)
  batch(root, [
    facade([-8, 0, 22], [-8, 0, -15], [-8, 12, 22]),
    facade([8, 0, -15], [8, 0, 22], [8, 12, -15]),
    facade([-8, 7.4, -10], [8, 7.4, -10], [-8, 12, -10]),
    facade([-8, 11.85, 15], [8, 11.85, 15], [-8, 11.85, -4]),
  ], wall, 'Loading-hall walls')
  const ceiling = []
  const grating = []
  for (let i = 0; i < 7; i++) {
    const x = -7.4 + i * 2.45
    ceiling.push(strut([x, 11.3, 17], [x, 11.3, -12], 0.13, 0.27, 48, 28))
  }
  for (let i = 0; i < 23; i++) {
    const z = -8 + i * 0.19
    grating.push(strut([-7.75, 11.55, z], [7.75, 11.55, z], 0.049, 0.075, 14, 16))
  }
  for (let i = 0; i < 33; i++) {
    const x = -7.7 + i * 0.48
    grating.push(strut([x, 11.55, -8], [x, 11.55, -3.78], 0.037, 0.075, 14, 16))
  }
  batch(root, ceiling, metal, 'Ceiling beams')
  batch(root, grating, safety, 'Open ceiling grating')
  batch(root, [facade([-7.8, 11.85, -8], [7.8, 11.85, -8], [-7.8, 11.85, -3.75])],
    finish(0xffd399, 0.81, 0, 0xffa739, 4.2), 'Amber overhead light')
  const rails = []
  for (const z of [11, 8, 5, 2, -1, -4, -7]) {
    rails.push(strut([-5.6, 0.48, z], [-5.6, 1.55, z], 0.057, 0.067, 32, 32))
  }
  for (const y of [1.07, 1.55]) {
    rails.push(strut([-5.64, y, 14], [-5.64, y, -7.4], 0.06, 0.065, 90, 64))
  }
  batch(root, rails, safety, 'Catwalk guardrail')
  batch(root, [strut([-7.9, 0.22, 14], [-7.9, 0.22, -8], 1.13, 0.29),
    strut([7.84, 3.35, -4.6], [7.84, 3.35, -3.34], 0.19, 0.16)], metal, 'Catwalk and terminal')
  batch(root, [strut([7.63, 3.38, -4.37], [7.63, 3.38, -3.53], 0.035, 0.075)],
    finish(0x47eded, 0.22, 0.4, 0x22dcff, 3.3), 'Cyan terminal light')
  return root
}

export function sphere() {
  const root = new Group()
  const material = new MeshBasicNodeMaterial()
  const face = positionLocal.xy.sub(vec2(0.35, 0.58)).length().sub(5.65).abs()
  const front = smoothstep(5.2, 5.9, positionLocal.z)
  const flare = positionLocal.xy.sub(vec2(4.04, 4.5)).length()
  const eclipse = face.mul(5).negate().exp().mul(2.4).add(flare.mul(2.4).negate().exp().mul(5.6)).mul(front)
  const pixels = uv().x.mul(418).fract().sub(0.5).abs().max(uv().y.mul(210).fract().sub(0.5).abs())
  material.colorNode = color('#14112a').add(color('#ff6a15').mul(eclipse))
    .mul(smoothstep(0.24, 0.52, pixels).oneMinus().mul(0.52).add(0.48))
  const globe = batch(root, [new SphereGeometry(8.2, 436, 244)], material, 'LED exosphere')
  globe.position.y = 8.83
  batch(root, [ringBand(12, 0.4, 0.31, 0.14).translate(0, 0, 2)],
    finish(0xe2923d, 0.38, 0.57, 0xd5731e, 2), 'Amber plaza fascia')
  batch(root, [ringBand(12.01, 0.05, 0.32, 0.1).translate(0, 0, 2)],
    finish(0x363040, 0.4, 0.63), 'Plaza podium')
  return root
}
