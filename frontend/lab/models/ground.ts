import { MeshStandardNodeMaterial } from 'three/webgpu'
import { color, mix, positionWorld, sin, smoothstep } from 'three/tsl'
import type { ConceptId } from '../catalog'
import { dockWindow } from '../volume'

export function ground(id: ConceptId) {
  const machine = id === 'craw' || id === 'bug'
  const floor = new MeshStandardNodeMaterial({
    roughness: 0.31, metalness: 0.42,
  })
  const { x, z } = positionWorld
  const variation = sin(x.mul(1.15).add(z.mul(0.49))).mul(0.09)
    .add(sin(x.mul(19.2).add(z.mul(31.7))).mul(0.023)).add(0.53)
  const ripple = sin(x.mul(0.92).add(z.mul(0.41)).add(sin(z.mul(0.65)).mul(1.7)))
    .mul(0.36).add(sin(z.mul(1.19).add(x.mul(0.39))).mul(0.33))
    .add(sin(x.mul(7.1).sub(z.mul(5.3))).mul(0.08))
  const wetness = smoothstep(-0.47, 0.65, ripple)
  floor.roughnessNode = mix(0.32, 0.51, wetness)
  const surface = mix(color('#263136'), color(id === 'orchard' ? '#48503e' : '#536068'), variation)
  floor.colorNode = surface
  if (machine) {
    const scale = id === 'bug' ? 0.41 : 0.24
    const contact = x.mul(x).mul(scale).add(z.mul(z).mul(scale * 1.9)).negate().exp()
    floor.colorNode = surface.mul(contact.mul(0.72).oneMinus())
  }
  if (id === 'docks') {
    const footprint = dockWindow.panes.filter((_, i) => i % 2 === 0).map(center =>
      smoothstep(0, 0.1, x.sub(center).abs().negate().add(0.57))
        .mul(smoothstep(0, 0.14, z.sub(2).abs().negate().add(0.75))),
    ).reduce((mask, pane) => mask.add(pane))
    floor.emissiveNode = color('#ba6f23').mul(footprint).mul(0.28)
  }
  return floor
}
