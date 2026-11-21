import {
  AmbientLight, Color, DirectionalLight, Mesh, MeshBasicNodeMaterial,
  MeshStandardNodeMaterial, PointLight, PlaneGeometry, TorusGeometry,
} from 'three/webgpu'
import { color, mix, positionLocal, positionWorld, sin, smoothstep, time, uniform } from 'three/tsl'
import { createWhiteSpace } from './spaces'

// Four panes. The same offsets define the world-space apertures in the GLSL volume.
export const windowPanes = [
  [0.82, -2.5], [2.28, -2.5], [0.82, -1.33], [2.28, -1.33],
] as const
export const paneSize = [0.67, 0.52] as const
export const lightSlope = [0.58, 0.8] as const

export function createMaterialStudy() {
  const { scene, camera } = createWhiteSpace()
  camera.position.set(5.8, 4.1, 10.8)
  camera.lookAt(0.45, 1, 0)

  // A floor gobo gives the solid surface its own direct-light pass.
  const floorMaterial = new MeshBasicNodeMaterial()
  const panes = windowPanes.map(([x, z]) =>
    smoothstep(0, 0.09, positionWorld.x.sub(x).abs().negate().add(paneSize[0]))
      .mul(smoothstep(0, 0.09, positionWorld.z.sub(z).abs().negate().add(paneSize[1]))),
  )
  const projection = panes.slice(1).reduce((mask, pane) => mask.add(pane), panes[0]!)
  const contact = positionWorld.x.add(0.85).mul(0.65).pow(2)
    .add(positionWorld.z.sub(0.25).mul(2.3).pow(2)).negate().exp().mul(0.16)
  floorMaterial.colorNode = mix(color('#fdfdfd'), color('#edd4a5'), projection.mul(0.64))
    .mul(contact.oneMinus())
  const floor = new Mesh(new PlaneGeometry(240, 240, 80, 80), floorMaterial)
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  const roughness = uniform(0.24)
  const scan = uniform(1)
  const material = new MeshStandardNodeMaterial({
    color: 0x849099, roughness: 0.24, metalness: 0.79,
  })
  material.roughnessNode = roughness
  const stripe = smoothstep(0.82, 0.99, sin(positionLocal.y.mul(53).sub(time.mul(4))))
  material.emissiveNode = color('#62b9d6').mul(stripe).mul(scan).mul(0.42)
  const ring = new Mesh(new TorusGeometry(1.27, 0.24, 112, 448), material)
  ring.position.set(-0.85, 1.52, 0.25)
  ring.rotation.set(0.09, -0.22, -0.12)
  scene.add(ring)

  const key = new PointLight(0xffecd5, 110, 0, 2)
  key.position.set(-3, 5, 3)
  const rim = new DirectionalLight(0xd4eaff, 3.4)
  rim.position.set(1, 4, -4)
  const fill = new DirectionalLight(0xffffff, 1.4)
  fill.position.set(4, 2, 6)
  scene.add(key, rim, fill, new AmbientLight(new Color(0xf3f8ff), 0.95))

  return { scene, camera, roughness, scan }
}
