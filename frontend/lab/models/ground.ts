import { MeshStandardNodeMaterial, Object3D, type Camera } from 'three/webgpu'
import { bumpMap, cameraPosition, color, mix, positionWorld, reflector, screenUV, smoothstep, texture, vec2 } from 'three/tsl'
import type { ConceptId } from '../catalog'
import { dockWindow } from '../volume'
import { tileSeam, weatherField } from './surfaces'

export function ground(id: ConceptId, camera: Camera) {
  const machine = id === 'craw' || id === 'bug'
  const garden = id === 'orchard' || id === 'bay-view'
  const floor = new MeshStandardNodeMaterial({ roughness: .55, metalness: .07 })
  const relief = weatherField(661)
  floor.roughnessMap = relief
  const anchor = new Object3D()
  anchor.rotation.x = -Math.PI / 2
  anchor.position.y = -0.045
  const reflection = reflector({ target: anchor, resolution: .64, generateMipmaps: true, bounces: false })
  const { x, z } = positionWorld
  const coordinates = vec2(x, z)
  const broad = texture(relief, coordinates.mul(.093)).r
  const pebble = texture(relief, coordinates.mul(1.82).add(.17)).r
  const wetness = smoothstep(.29,.57,broad.mul(.83).add(pebble.mul(.17)))

  const pondEdge = id === 'orchard' ? vec2(x.add(5.9).div(7.65), z.sub(8.2).div(5.55)).length() :
    vec2(x.sub(7.1).div(3.8), z.sub(13.5).div(6.8)).length()
  const pond = garden ? smoothstep(.969, 1, pondEdge).oneMinus() : color('#000').r
  const walk = id === 'orchard' ?
    smoothstep(1.42, 1.58, x.sub(z.mul(.075).sin().mul(3.4).add(3.35)).abs()).oneMinus() :
    smoothstep(2.3, 2.45, x.sub(z.mul(.127).sin().mul(2.3)).abs()).oneMinus()
  const patio = garden ?
    mix(color('#243122'), color(id === 'bay-view' ? '#634d3c' : '#494746'), walk) :
    color(id === 'gate' ? '#252525' : machine ? '#333332' : '#3b3c40')
  const seam = id === 'gate' || machine ? tileSeam(7.3, 5.4).mul(.065) :
    tileSeam(id === 'bay-view' ? 3.45 : 1.73, id === 'bay-view' ? .27 : 2.18)
      .mul(garden ? walk : 1).mul(.27)
  const grain = broad.mul(.23).add(pebble.mul(.21)).add(.82)
  const surface = mix(patio.mul(grain).mul(seam.oneMinus()), color('#13252a'), pond)
  const contact = x.mul(x).mul(.46).add(z.mul(z).mul(.83)).negate().exp()
  floor.colorNode = machine ? surface.mul(contact.mul(.75).oneMinus()) : surface
  floor.roughnessNode = mix(mix(machine ? .68 : .62, machine ? .37 : .23, wetness), .12, pond)
  floor.normalNode = bumpMap(pebble.mul(.8).sub(seam.mul(.43)).mul(pond.mul(.9).oneMinus()), .033)

  const ripplesX = texture(relief, coordinates.mul(vec2(.21,1.25)).add(.41)).r
  const ripplesY = texture(relief, coordinates.mul(vec2(.45,1.7)).add(.71)).r
  const displacement = mix(.0036,.012,pond)
  const distortion = vec2(ripplesX.sub(.37), ripplesY.sub(.37)).mul(displacement)
  reflection.uvNode = screenUV.flipX().add(distortion)
  // Use a mip level varying with wetness so dry tarmac does not reflect
  // buildings as sharply as open water. Fresnel lifts grazing highlights.
  reflection.levelNode = mix(mix(machine ? 5.4 : 4.7, machine ? 3.2 : 1.8, wetness), 1.15, pond)
  const grazing = cameraPosition.sub(positionWorld).normalize().y.abs().oneMinus().pow(5)
  const damp = mix(wetness.mul(machine ? .17 : .32).add(machine ? .045 : .075), .63, pond)
    .mul(garden ? mix(.06, 1, walk.max(pond)) : 1)
  const reflected = reflection.rgb.mul(damp).mul(grazing.mul(.55).add(.62))
  floor.emissiveNode = machine ? reflected.mul(contact.mul(.78).oneMinus()) : reflected

  if (id === 'docks') {
    const { panes, size, grid } = dockWindow
    const footprint = panes.reduce((mask, center, i) => {
      if (i % 2) return mask
      const width = smoothstep(0, .23, x.sub(center).abs().negate().add(size[0]))
      const length = smoothstep(0, .32, z.sub(panes[i + 1]!).abs().negate().add(size[1]))
      return mask.add(width.mul(length))
    }, color('#000').r)
    const projectedX = x.add(dockWindow.ceiling * dockWindow.slope[0])
    const projectedZ = z.add(dockWindow.ceiling * dockWindow.slope[1])
    const grateX = projectedX.sub(grid[0]).div(grid[2]).add(.5).fract().sub(.5).abs()
    const grateZ = projectedZ.sub(grid[1]).div(grid[3]).add(.5).fract().sub(.5).abs()
    const transmission = smoothstep(.065,.24,grateX).mul(smoothstep(.11,.34,grateZ)).mul(.63).add(.37)
    const projection = color('#ff922f').mul(footprint).mul(transmission).mul(wetness.mul(.22).add(.28))
    floor.emissiveNode = reflected.add(projection)
  }
  return { floor, anchor, dispose: () => reflection.reflector.renderTargets.get(camera)?.dispose() }
}
