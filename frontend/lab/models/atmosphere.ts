import { BackSide, Group, MeshBasicNodeMaterial, SphereGeometry } from 'three/webgpu'
import { color, mix, positionWorld, sin, smoothstep } from 'three/tsl'
import type { ConceptId } from '../catalog'
import { batch } from './geometry'

export function skyDome(id: ConceptId) {
  const root = new Group()
  const studio = id === 'craw' || id === 'bug'
  const dusk = id === 'bay-view'
  const violet = id === 'sphere'
  const gate = id === 'gate'
  const rain = id === 'square'
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false })
  const p = positionWorld.normalize()
  const fade = smoothstep(-0.025, 0.84, p.y)
  const low = color(studio ? '#1a2328' : violet ? '#38304c' : dusk ? '#5a4669' : gate ? '#546173' : '#254768')
  const high = color(studio ? '#070b0d' : violet ? '#100b21' : dusk ? '#182d61' : gate ? '#202a36' : '#070d18')
  const field = sin(p.x.mul(7.8).add(p.z.mul(6.9)).add(sin(p.y.mul(21.6)).mul(2.1)))
    .mul(0.43).add(sin(p.x.mul(16).add(p.y.mul(29).sub(p.z.mul(23)))).mul(0.17))
    .add(sin(p.z.mul(40).add(p.y.mul(43)).sub(p.x.mul(21))).mul(0.14))
  const clouds = smoothstep(-0.30, 0.45, field).mul(smoothstep(0, 0.12, p.y))
  material.colorNode = mix(low, high, fade)
    .mul(studio ? 0.88 : clouds.mul(rain ? 0.33 : 0.47).oneMinus())
    .add(color(dusk ? '#ff9e63' : '#7f9fbf').mul(studio ? 0 :
      smoothstep(0.015, 0.12, p.y).mul(smoothstep(0.10, 0.40, p.y).oneMinus()).mul(clouds).mul(dusk ? 0.22 : 0.11)))
  batch(root, [new SphereGeometry(157, 128, 72)], material, 'Atmospheric sky')
  return root
}
