import { AdditiveBlending, DoubleSide, Group, MeshBasicNodeMaterial } from 'three/webgpu'
import { color, positionWorld, smoothstep, texture, uv, vec2 } from 'three/tsl'
import { batch, facade, type Point } from './geometry'
import { weatherField } from './surfaces'

export function lightHalos(root: Group, anchors: readonly Point[], size: number, tint: string, strength: number) {
  const material = new MeshBasicNodeMaterial({
    side: DoubleSide, blending: AdditiveBlending, transparent: true, depthWrite: false, fog: true,
  })
  material.colorNode = color(tint)
  const radius = uv().sub(vec2(.5,.5)).length()
  material.opacityNode = radius.mul(radius).mul(-23).exp()
    .mul(smoothstep(.22,.5,radius).oneMinus()).mul(strength)
  const cards = anchors.map(([x,y,z]) => facade([x-size,y-size,z],[x+size,y-size,z],[x-size,y+size,z],88,60))
  batch(root,cards,material,'Soft local air scattering around light sources')
}

export function driftingHaze(root: Group, anchors: readonly Point[], tint: string, width: number, height: number) {
  const material = new MeshBasicNodeMaterial({side:DoubleSide,transparent:true,depthWrite:false,fog:true})
  const noise = weatherField(385)
  // Keep the generated texture associated with the material's lifetime.
  material.map = noise
  const p = positionWorld
  const field=texture(noise,vec2(p.x.add(p.z.mul(.4)),p.y.mul(2.65)).mul(.37)).r
  const fade=uv().sub(vec2(.5,.5)).mul(vec2(1.04,1.23)).length()
  material.colorNode=color(tint)
  material.opacityNode=field.mul(.75).add(.12).mul(smoothstep(.09,.57,fade).oneMinus()).mul(.34)
  const layers=anchors.map(([x,y,z])=>facade([x-width,y-height,z],[x+width,y-height,z],
    [x-width,y+height,z],88,60))
  batch(root,layers,material,'Layered atmospheric wisps')
}
