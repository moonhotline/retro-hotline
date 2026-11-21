import * as THREE from 'three'

type Reflectance = number | readonly [red: number, green: number, blue: number]
type Surface = {
  color: number
  size: number
  textureName: string
  sample: (u: number, v: number) => Reflectance
}

function hash(x: number, y: number, seed: number): number {
  let value = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ seed
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period
}

// Periodic value noise keeps both edges continuous when UVs repeat.
function noise(u: number, v: number, columns: number, rows: number, seed: number): number {
  const x = u * columns
  const y = v * rows
  const cellX = Math.floor(x)
  const cellY = Math.floor(y)
  const left = wrap(cellX, columns)
  const top = wrap(cellY, rows)
  const right = (left + 1) % columns
  const bottom = (top + 1) % rows
  const dx = x - cellX
  const dy = y - cellY
  const sx = dx * dx * (3 - 2 * dx)
  const sy = dy * dy * (3 - 2 * dy)
  const topRow = THREE.MathUtils.lerp(hash(left, top, seed), hash(right, top, seed), sx)
  const bottomRow = THREE.MathUtils.lerp(hash(left, bottom, seed), hash(right, bottom, seed), sx)
  return THREE.MathUtils.lerp(topRow, bottomRow, sy)
}

function band(distance: number, width: number): number {
  const falloff = Math.max(0, 1 - Math.abs(distance) / width)
  return falloff * falloff
}

function sampleMarble(u: number, v: number, dark: boolean): Reflectance {
  const seed = dark ? 381 : 147
  const cloud = noise(u, v, 6, 7, seed + 1)
  const grain = noise(u, v, 82, 91, seed + 2)
  const warp = 0.62 * noise(u, v, 3, 4, seed) + 0.09 * noise(u, v, 12, 14, seed + 3)
  const phase = u + v + warp + 0.013 * noise(u, v, 39, 43, seed + 4)
  const distance = phase - Math.round(phase)
  const core = band(distance, dark ? 0.015 : 0.020)
  const split = 0.068 * (noise(u, v, 5, 7, seed + 5) - 0.45)
  const branch = band(distance + split, 0.009) * noise(u, v, 13, 17, seed + 6)
  const halo = band(distance, dark ? 0.05 : 0.10)
  const vein = Math.max(core, 0.74 * branch)
  const warm = vein * noise(u, v, 11, 9, seed + 7)

  if (dark) {
    const stone = 0.64 + 0.18 * cloud + 0.035 * grain + 0.06 * halo
    const shade = THREE.MathUtils.lerp(stone, 1, vein)
    return [shade, shade - 0.20 * warm, shade - 0.60 * warm]
  }

  const shade = 1 - 0.055 * cloud - 0.018 * grain - 0.08 * halo - 0.21 * vein
  return [shade, shade - 0.035 * warm, shade - 0.16 * warm]
}

const surfaces = {
  marble_white: {
    color: 0xedf0e2, size: 512, textureName: 'marble_white_tex',
    sample: (u, v) => sampleMarble(u, v, false),
  },
  marble_dark: {
    color: 0x181a1f, size: 512, textureName: 'marble_dark_tex',
    sample: (u, v) => sampleMarble(u, v, true),
  },
  travertine: {
    color: 0xd6c7ae,
    size: 512,
    textureName: 'travertine_tex',
    sample(u, v) {
      const bed = noise(u, v, 6, 53, 431)
      const grain = noise(u, v, 25, 171, 432)
      const pore = Math.max(0, (noise(u, v, 89, 211, 433) - 0.69) / 0.31)
      const shade = 0.99 - 0.09 * bed - 0.07 * grain - 0.30 * pore * pore
      return [shade, shade - 0.025 * pore, shade - 0.07 * pore]
    },
  },
  walnut_wood: {
    color: 0x4b2e1e,
    size: 512,
    textureName: 'walnut_tex',
    sample(u, v) {
      const grainU = u + 0.085 * noise(u, v, 4, 3, 281) + 0.015 * noise(u, v, 14, 7, 282)
      const growth = noise(grainU, v, 47, 5, 283)
      const fiber = noise(grainU, v, 223, 17, 284)
      const vessel = Math.max(0, (noise(grainU, v, 159, 54, 285) - 0.67) / 0.33)
      const shade = 0.99 - 0.22 * growth - 0.10 * fiber - 0.26 * vessel * vessel
      return [shade, shade - 0.045 * growth, shade - 0.075 * growth]
    },
  },
  carpet_tile: {
    color: 0x2a2e35,
    size: 256,
    textureName: 'carpet_tex',
    sample(u, v) {
      const warp = u * 32
      const weft = v * 32
      const column = Math.floor(warp)
      const row = Math.floor(weft)
      const warpThread = Math.sin(Math.PI * (warp - column))
      const weftThread = Math.sin(Math.PI * (weft - row))
      const warpOnTop = (column + row) % 2 === 0
      const top = warpOnTop ? warpThread : weftThread
      const underneath = warpOnTop ? weftThread : warpThread
      const lint = hash(Math.floor(u * 256), Math.floor(v * 256), 773)
      return 0.61 + 0.21 * top + 0.09 * underneath * (1 - top) + 0.08 * lint
    },
  },
  concrete_raw: {
    color: 0x6c6e72,
    size: 512,
    textureName: 'concrete_tex',
    sample(u, v) {
      const cement = noise(u, v, 13, 11, 711)
      const aggregate = noise(u, v, 145, 163, 712)
      const grit = hash(Math.floor(u * 512), Math.floor(v * 512), 713)
      const pit = Math.max(0, (aggregate - 0.63) / 0.37)
      return 0.85 + 0.085 * cement + 0.065 * grit - 0.32 * pit * pit
    },
  },
  brushed_steel: {
    color: 0xbabec9,
    size: 256,
    textureName: 'steel_tex',
    sample(u, v) {
      const brush = noise(u, v, 5, 201, 914)
      const fineBrush = noise(u, v, 29, 239, 915)
      return 1 - 0.12 * brush - 0.055 * fineBrush
    },
  },
} satisfies Record<string, Surface>

export type TexturedMaterialId = keyof typeof surfaces

function srgbByte(linear: number): number {
  return 255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055)
}

function createTexture(id: TexturedMaterialId, color: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null

  const { size, textureName, sample } = surfaces[id]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  let context: CanvasRenderingContext2D | null
  try {
    context = canvas.getContext('2d')
  } catch {
    return null
  }
  if (!context) return null

  const { r, g, b } = new THREE.Color(color)
  const image = context.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const reflectance = sample((x + 0.5) / size, (y + 0.5) / size)
      const [red, green, blue] = typeof reflectance === 'number'
        ? [reflectance, reflectance, reflectance]
        : reflectance
      const offset = (y * size + x) * 4
      image.data[offset] = srgbByte(r * red)
      image.data[offset + 1] = srgbByte(g * green)
      image.data[offset + 2] = srgbByte(b * blue)
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.name = textureName
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}

/** Builds a full-color canvas texture. The caller owns the texture. */
export function createArchitecturalTexture(id: TexturedMaterialId): THREE.CanvasTexture | null {
  return createTexture(id, surfaces[id].color)
}

function standard(color: number, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

function textured(id: TexturedMaterialId, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  const material = standard(surfaces[id].color, roughness, metalness)
  // Three.js multiplies the map by material.color, so the map carries only the variation.
  material.map = createTexture(id, 0xffffff)
  return material
}

function led(color: number, emissive: number, emissiveIntensity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, roughness: 0.2 })
}

function buildMaterials() {
  return {
    marble_white: textured('marble_white', 0.14, 0.04),
    marble_dark: textured('marble_dark', 0.12, 0.08),
    travertine: textured('travertine', 0.42, 0.02),
    walnut_wood: textured('walnut_wood', 0.30, 0.04),
    carpet_tile: textured('carpet_tile', 0.88, 0),
    concrete_raw: textured('concrete_raw', 0.78, 0.02),
    drywall_painted: standard(0xf1efea, 0.74, 0),
    brushed_steel: textured('brushed_steel', 0.22, 0.88),
    anodized_dark: standard(0x1d1f24, 0.34, 0.76),
    leather_black: standard(0x17181c, 0.38, 0.06),
    brass: standard(0xc99b49, 0.24, 0.90),
    glass_facade: new THREE.MeshPhysicalMaterial({
      color: 0x9bc2d4, roughness: 0.06, metalness: 0.08, reflectivity: 0.9,
      transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
    }),
    glass_frosted: new THREE.MeshPhysicalMaterial({
      color: 0xdcdfe4, roughness: 0.45, metalness: 0.05,
      transparent: true, opacity: 0.46, depthWrite: false, side: THREE.DoubleSide,
    }),
    led_warm: led(0xffeedc, 0xffb870, 3.2),
    led_amber: led(0xffd073, 0xf5a623, 3.8),
    led_red: led(0xff4d4d, 0xd91e2a, 3.4),
    led_cyan: led(0x9be8ff, 0x20b4ff, 2.2),
    foliage_green: new THREE.MeshStandardMaterial({
      color: 0x264d29, roughness: 0.46, metalness: 0.02, side: THREE.DoubleSide,
    }),
  }
}

export type ArchitecturalMaterialId = keyof ReturnType<typeof buildMaterials>
export type SaoPauloMaterials = Readonly<ReturnType<typeof buildMaterials>> & { dispose(): void }

/** Creates a registry with independent ownership of its materials and maps. */
export function createSaoPauloMaterials(): SaoPauloMaterials {
  const materials = buildMaterials()
  const ownedMaterials = Object.values(materials)
  const ownedTextures = new Set(ownedMaterials.flatMap(({ map }) => map ? [map] : []))
  let disposed = false

  return Object.defineProperty(materials, 'dispose', {
    value() {
      if (disposed) return
      disposed = true
      for (const material of ownedMaterials) material.dispose()
      for (const texture of ownedTextures) texture.dispose()
    },
  }) as SaoPauloMaterials
}
