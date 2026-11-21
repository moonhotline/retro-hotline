import {
  DataTexture, EquirectangularReflectionMapping, FloatType, LinearFilter, LinearMipmapLinearFilter,
  MeshStandardNodeMaterial, RedFormat, RepeatWrapping, RGBAFormat, type MeshStandardMaterial,
} from 'three/webgpu'
import { bumpMap, color, mix, positionWorld, smoothstep, texture, uv, vec2 } from 'three/tsl'

export function seeded(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

export function grit(seed: number, kind: 'metal' | 'stone' | 'wood') {
  const random = seeded(seed)
  const size = 256
  const pixels = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const broad = Math.sin(x / 7 + Math.cos(y / 12)) * Math.sin(y / 8 + x / 17)
      const fleck = random()
      const grain = kind === 'wood' ? Math.sin(x * 0.8 + Math.sin(y / 63) * 1.1) * 22 : broad * 10
      const cut = kind === 'metal' && Math.sin(y * 0.42 + x * 0.055) > 0.994 && broad > 0.25 ? -28 : 0
      const pore = kind === 'stone' && fleck > 0.94 ? -38 : 0
      pixels[y * size + x] = 129 + cut + pore + grain + (fleck - 0.5) * 22
    }
  }
  const texture = new DataTexture(pixels, size, size, RedFormat)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

export function textured<T extends Pick<MeshStandardMaterial, 'bumpMap' | 'bumpScale'>>(material: T, seed: number, kind: 'metal' | 'stone' | 'wood', scale: number) {
  material.bumpMap = grit(seed, kind)
  material.bumpScale = scale
  return material
}

export function industrialSurface(base: string, stain: string, seed: number, metalness = 0.36) {
  const material = new MeshStandardNodeMaterial({ roughness: 0.59, metalness, side: 2 })
  const albedo = weatherField(seed)
  material.roughnessMap = albedo
  const p = positionWorld
  const worldUV = vec2(p.x.add(p.z.mul(1.132)).mul(0.121), p.y.mul(.084).add(p.z.mul(.173)))
  const wash = texture(albedo, worldUV).r
  const drip = texture(albedo, worldUV.mul(vec2(3.7, .56)).add(.31)).r
  const field = wash.mul(.69).add(drip.mul(.31))
  const grain = texture(albedo, worldUV.mul(17.4).add(.531)).r
  const chips = smoothstep(.47, .67, texture(albedo, worldUV.mul(4.35)).r).mul(grain)
  material.colorNode = mix(color(base), color(stain), smoothstep(.16,.72,field))
    .mul(grain.mul(.29).add(.86)).mul(chips.mul(.35).oneMinus())
  material.roughnessNode = field.mul(.28).add(grain.mul(.18)).add(.33)
  material.normalNode = bumpMap(grain.add(chips.mul(.4)), .042)
  return material
}

// The atlas has short directional gouges and clustered point abrasion. Point
// abrasion breaks up wear around plate seams without drawing uninterrupted lines.
function abrasionMap(seed: number) {
  const random = seeded(seed)
  const size = 512
  const pixels = new Uint8Array(size * size)
  const write = (x: number, y: number, value: number) => {
    const index = ((y + size) % size) * size + (x + size) % size
    pixels[index] = Math.max(value, pixels[index]!)
  }
  for (let i = 0; i < 920; i++) {
    const x = Math.floor(random() * size)
    const y = Math.floor(random() * size)
    const length = 2 + Math.floor(random() ** 3 * 45)
    const angle = i % 3 === 0 ? random() * Math.PI : .25 + (random() - .5) * .9
    const strength = 39 + Math.floor(random() * 200)
    for (let j = 0; j < length; j++) {
      const px = x + Math.round(Math.cos(angle) * j)
      const py = y + Math.round(Math.sin(angle) * j)
      write(px, py, Math.floor(strength * Math.sin((j + .7) / (length + .4) * Math.PI)))
    }
  }
  for (let i = 0; i < 10000; i++) {
    write(Math.floor(random() * size), Math.floor(random() * size), Math.floor(random() * 125))
  }
  const atlas = new DataTexture(pixels, size, size, RedFormat)
  atlas.wrapS = atlas.wrapT = RepeatWrapping
  atlas.magFilter = LinearFilter
  atlas.minFilter = LinearMipmapLinearFilter
  atlas.generateMipmaps = true
  atlas.needsUpdate = true
  return atlas
}

export function armorSurface(wide: boolean) {
  const material = new MeshStandardNodeMaterial({ roughness: .52, metalness: .60, side: 2 })
  const age = weatherField(wide ? 1337 : 2348)
  const atlas = abrasionMap(wide ? 419 : 297)
  material.roughnessMap = age
  material.bumpMap = atlas
  const p = positionWorld
  const patchUV = vec2(p.x.add(p.y.mul(.53)), p.z.sub(p.y.mul(.31)))
  const dust = texture(age, patchUV.mul(.44)).r
  const steelGrain = texture(age, patchUV.mul(8.4)).r
  const scratches = texture(atlas, patchUV.mul(1.6)).r
  const edgeChips = smoothstep(.34,.61, texture(age,uv().mul(vec2(4.2,1.68))).r)
    .mul(smoothstep(.018,.085,uv().y).oneMinus())
  const wear = edgeChips.mul(.74).add(scratches.mul(.62)).clamp()
  const paint = mix(color(wide ? '#444633' : '#313a3e'), color(wide ? '#65634b' : '#505859'), dust)
  material.colorNode = mix(paint, color(wide ? '#9b9681' : '#939d9f'), wear)
    .mul(steelGrain.mul(.31).add(.83))
  material.metalnessNode = mix(.45, .86, wear)
  material.roughnessNode = mix(dust.mul(.27).add(.41), .33, wear)
  material.normalNode = bumpMap(steelGrain.mul(.54).sub(scratches.mul(.65)), .025)
  return material
}

export function environment(indoors: boolean, purple: boolean) {
  const w = 256
  const h = 128
  const data = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w
      const altitude = y / h
      const upper = Math.max(0, Math.sin(altitude * Math.PI * 2))
      const softbox = Math.exp(-((u - 0.22) ** 2) / 0.008 - ((altitude - 0.34) ** 2) / 0.006)
      const rim = Math.exp(-((u - 0.75) ** 2) / 0.005 - ((altitude - 0.28) ** 2) / 0.012)
      const horizon = Math.exp(-((altitude - 0.45) ** 2) * 75)
      const i = 4 * (y * w + x)
      const sky = indoors ? 0.026 : 0.052 + horizon * 0.068
      data[i] = sky * (purple ? 1.1 : 0.53) + softbox * 2.25 + rim * 0.36
      data[i + 1] = sky * 0.91 + softbox * 1.62 + rim * 1.16 + upper * 0.018
      data[i + 2] = sky * 1.42 + softbox * 1.15 + rim * 1.85 + upper * 0.043
      data[i + 3] = 1
    }
  }
  const texture = new DataTexture(data, w, h, RGBAFormat, FloatType)
  texture.mapping = EquirectangularReflectionMapping
  texture.minFilter = texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

export const tileSeam = (width: number, depth: number) => {
  const cell = vec2(positionWorld.x.div(width), positionWorld.z.div(depth)).fract().sub(0.5).abs()
  return smoothstep(0.470, 0.495, cell.x.max(cell.y))
}

// Deterministic periodic value noise for surface albedo and roughness variation.
export function weatherField(seed: number) {
  const rng = seeded(seed)
  const size = 256
  const octaves = [4, 9, 18, 37, 75, 128].map(grid => ({
    grid, values: new Float32Array(grid * grid).map(() => rng()),
  }))
  const data = new Uint8Array(size * size)
  const fade = (t: number) => t * t * (3 - 2 * t)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0
      let amplitude = 0.56
      for (const { grid, values } of octaves) {
        const px = x * grid / size
        const py = y * grid / size
        const ix = Math.floor(px)
        const iy = Math.floor(py)
        const tx = fade(px - ix)
        const ty = fade(py - iy)
        const x1 = (ix + 1) % grid
        const y1 = (iy + 1) % grid
        const lo = values[iy * grid + ix]! * (1 - tx) + values[iy * grid + x1]! * tx
        const hi = values[y1 * grid + ix]! * (1 - tx) + values[y1 * grid + x1]! * tx
        sum += (lo * (1 - ty) + hi * ty) * amplitude
        amplitude *= 0.62
      }
      data[y * size + x] = Math.round(Math.min(255, Math.max(0, (sum - 0.17) * 220)))
    }
  }
  const map = new DataTexture(data, size, size, RedFormat)
  map.wrapS = map.wrapT = RepeatWrapping
  map.magFilter = LinearFilter
  map.minFilter = LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.needsUpdate = true
  return map
}
