import { DoubleSide, Group, MeshStandardNodeMaterial, PointLight } from 'three/webgpu'
import { color, mix, positionWorld, sin, smoothstep, uv } from 'three/tsl'
import type { Point } from './geometry'

export function point(root: Group, rgb: number, strength: number, radius: number, position: Point) {
  const light = new PointLight(rgb,strength,radius,2)
  light.position.set(...position)
  root.add(light)
}

export function glassTower() {
  const material = new MeshStandardNodeMaterial({ metalness:.41, roughness:.43, side:DoubleSide })
  const u=uv().x.mul(15)
  const v=uv().y.mul(29)
  const border = u.fract().sub(.5).abs().max(v.fract().sub(.5).abs())
  const lit = smoothstep(.72,.98,sin(u.floor().mul(1.523).add(v.floor().mul(39.15)).add(positionWorld.z.mul(.27))))
  const focus = smoothstep(.11,.26,v.fract()).mul(smoothstep(.73,.91,v.fract()).oneMinus())
  material.colorNode = mix(mix(color('#142334'),color('#6c665a'),lit.mul(.72)),color('#162024'),
    smoothstep(.41,.499,border))
  material.emissiveNode = color('#ffc07c').mul(lit).mul(focus).mul(smoothstep(.31,.45,border).oneMinus()).mul(.76)
  return material
}
