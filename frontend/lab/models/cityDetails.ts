import { DoubleSide, Group, MeshStandardNodeMaterial, PointLight } from 'three/webgpu'
import { color, dot, fwidth, mix, positionWorld, sin, smoothstep, uv, vec2 } from 'three/tsl'
import type { Point } from './geometry'

export function point(root: Group, rgb: number, strength: number, radius: number, position: Point) {
  const light = new PointLight(rgb,strength,radius,2)
  light.position.set(...position)
  root.add(light)
}

export function glassTower() {
  const material = new MeshStandardNodeMaterial({ metalness:.41, roughness:.43, side:DoubleSide })
  const coords = uv().mul(vec2(20,32))
  const cell = coords.floor()
  const local = coords.fract()
  const hash = sin(dot(cell, vec2(127.1,311.7)).add(positionWorld.z.floor().mul(.067))).mul(43758.5453).fract()
  const lit = smoothstep(.72,.94,hash)
  const mullion = smoothstep(.43,.49,local.x.sub(.5).abs())
  const slab = smoothstep(.37,.49,local.y.sub(.5).abs())
  const blurred = smoothstep(.11,.49,fwidth(coords).length())
  const frame = mullion.max(slab).mul(blurred.mul(.81).oneMinus())
  const shade = local.y.mul(.19).add(.68).mul(hash.mul(.2).add(.86))
  const glass = mix(color('#111d2b'),color('#263348'),shade)
  const room = mix(color('#675345'),color('#b39768'),local.y.pow(.45))
  material.colorNode = mix(mix(glass,room,lit.mul(.63)),color('#20262b'),frame.mul(.91))
  const band = smoothstep(.66,.81,local.y).mul(smoothstep(.86,.98,local.y).oneMinus())
  material.emissiveNode = mix(color('#ffd195'), color('#aed0dd'), smoothstep(.957,.985,hash))
    .mul(lit.mul(slab.oneMinus())).mul(band.mul(.89).add(.14)).mul(mullion.oneMinus())
  return material
}
