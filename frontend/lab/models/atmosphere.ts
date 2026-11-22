import { BackSide, Group, MeshBasicNodeMaterial, SphereGeometry } from 'three/webgpu'
import { color, mix, positionLocal, smoothstep, texture, vec2, vec3 } from 'three/tsl'
import type { ConceptId } from '../catalog'
import { batch } from './geometry'
import { weatherField } from './surfaces'

export function skyDome(id: ConceptId) {
  const root = new Group()
  const studio = id === 'craw' || id === 'bug'
  const dusk = id === 'bay-view'
  const violet = id === 'sphere'
  const gate = id === 'gate'
  const rain = id === 'square'
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false })
  const p = positionLocal.normalize()
  const elevation = smoothstep(-0.045, 0.62, p.y)
  const low = color(studio ? '#11181a' : violet ? '#363045' : dusk ? '#545377' : gate ? '#3e4d5d' : '#203846')
  const high = color(studio ? '#151b1e' : violet ? '#191124' : dusk ? '#203261' : gate ? '#1a2430' : rain ? '#0d2e56' : '#080f18')
  material.colorNode = mix(low, high, elevation)

  if (!studio) {
    const field = weatherField(5239)
    material.map = field
    // Project through a shallow cloud layer. Its progressively compressed
    // pattern near the horizon keeps the sky in perspective when orbiting.
    const plane = vec2(p.x, p.z).div(p.y.max(.075).add(.145)).mul(.364)
    const warp = texture(field, plane.mul(.42).add(.23)).r.sub(.38)
    const coverage = texture(field, plane.add(vec2(warp.mul(.23), warp.mul(.15)))).r
    const fringe = texture(field, plane.mul(2.35).sub(.19)).r
    const cloud = smoothstep(.25, .61, coverage.mul(.78).add(fringe.mul(.22)))
      .mul(smoothstep(-.028, .14, p.y))
    const backlight = p.dot(vec3(id === 'orchard' ? -.24 : -.45, .34, -.83))
      .max(0).pow(id === 'orchard' ? 10 : 3)
    const litCloud = mix(color(violet ? '#29223a' : dusk ? '#383657' : '#182530'),
      color(dusk ? '#a4798d' : rain ? '#44698f' : gate ? '#465767' : '#496375'), backlight)
    material.colorNode = mix(material.colorNode, litCloud, cloud.mul(.83))
      .add(color(dusk ? '#e88d72' : '#7dabc8').mul(backlight).mul(dusk ? .071 : .035))
  }

  batch(root, [new SphereGeometry(157, 128, 72)], material, 'Cloud layers and horizon')
  return root
}
