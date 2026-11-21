import { MeshStandardNodeMaterial, Object3D, type Camera } from 'three/webgpu'
import { color, mix, positionWorld, reflector, screenUV, smoothstep, texture, vec2 } from 'three/tsl'
import type { ConceptId } from '../catalog'
import { dockWindow } from '../volume'
import { tileSeam, weatherField } from './surfaces'

export function ground(id: ConceptId, camera: Camera) {
  const machine = id === 'craw' || id === 'bug'
  const garden = id === 'orchard' || id === 'bay-view'
  const floor = new MeshStandardNodeMaterial({ roughness: 0.46, metalness: 0.14 })
  const surfaceMap = weatherField(661)
  floor.roughnessMap = surfaceMap
  const anchor = new Object3D()
  anchor.rotation.x = -Math.PI / 2
  anchor.position.y = -0.045
  const reflection = reflector({ target: anchor, resolution: 0.57, generateMipmaps: true, bounces: false })
  const { x, z } = positionWorld
  const coordinates = vec2(x, z)
  const broad = texture(surfaceMap, coordinates.mul(.124)).r
  const pebble = texture(surfaceMap, coordinates.mul(.78).add(.17)).r
  const ripple = broad.mul(.75).add(pebble.mul(.25))
  const wetness = smoothstep(.24,.56,ripple)
  const dist = vec2(x.add(5.9).div(7.65), z.sub(8.2).div(5.55)).length()
  const pond = id === 'orchard' ? smoothstep(0.973, 1.0, dist).oneMinus() : color('#000').r
  const walk = id === 'orchard' ?
    smoothstep(1.45, 1.57, x.sub(z.mul(0.075).sin().mul(3.4).add(3.35)).abs()).oneMinus() :
    smoothstep(2.4, 3.15, x.sub(z.mul(0.127).sin().mul(2.3)).abs()).oneMinus()
  const patio = garden ? mix(color('#263423'), color(id === 'bay-view' ? '#504034' : '#474745'), walk) :
    color(id === 'gate' ? '#26292a' : '#39383b')
  const seam = id === 'gate' || machine ? tileSeam(7.3, 5.4).mul(0.1) :
    tileSeam(id === 'bay-view' ? 3.3 : 1.27, id === 'bay-view' ? 0.23 : 1.4)
      .mul(garden ? walk : 1).mul(0.29)
  const surface = mix(patio.mul(ripple.mul(0.63).add(0.65)).mul(seam.oneMinus()), color('#122631'), pond)
  floor.colorNode = surface
  floor.roughnessNode = mix(mix(0.56, 0.23, wetness), 0.09, pond)
  if (machine) {
    const contact = x.mul(x).mul(0.39).add(z.mul(z).mul(0.65)).negate().exp()
    floor.colorNode = surface.mul(contact.mul(0.68).oneMinus())
  }
  const noiseX = texture(surfaceMap, coordinates.mul(vec2(.83,.42)).add(.47)).r.sub(.4).mul(.0055)
  const noiseY = texture(surfaceMap, coordinates.mul(vec2(.27,.73)).add(.71)).r.sub(.4).mul(.005)
  reflection.uvNode = screenUV.flipX().add(vec2(noiseX, noiseY))
  const mirror = reflection.rgb
  const reflectivity = mix(wetness.mul(machine ? .20 : .35).add(machine ? 0.034 : 0.1), 0.74, pond)
    .mul(garden ? mix(0.074, 1, walk.max(pond)) : 1)
  floor.emissiveNode = mirror.mul(reflectivity)
  if (id === 'docks') {
    const footprint = dockWindow.panes.filter((_, i) => i % 2 === 0).map(center =>
      smoothstep(0, 0.18, x.sub(center).abs().negate().add(dockWindow.size[0]))
        .mul(smoothstep(0, 0.22, z.sub(dockWindow.panes[1]!).abs().negate().add(dockWindow.size[1]))),
    ).reduce((mask, pane) => mask.add(pane))
    floor.emissiveNode = mirror.mul(reflectivity).add(color('#fa9d37').mul(footprint).mul(0.39))
  }
  return { floor, anchor, dispose: () => reflection.reflector.renderTargets.get(camera)?.dispose() }
}
