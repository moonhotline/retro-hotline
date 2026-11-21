import {
  AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, Mesh, PlaneGeometry, PointLight,
} from 'three/webgpu'
import type { Concept } from '../catalog'
import { createWhiteSpace } from '../spaces'
import { bayView, docks, gate, orchard, sphere, square, voyager } from './architecture'
import { machine } from './machines'
import { triangleCount } from './geometry'

import { ground } from './ground'

const landmarks = { gate, orchard, square, 'bay-view': bayView, voyager, docks, sphere }

export function createConceptStage(concept: Concept) {
  const { scene, camera } = createWhiteSpace()
  const machineStage = concept.id === 'craw' || concept.id === 'bug'
  const isSphere = concept.id === 'sphere'
  const isDocks = concept.id === 'docks'
  const isSquare = concept.id === 'square'
  const isGate = concept.id === 'gate'
  const sky = machineStage ? 0x151f23 : isSphere ? 0x241b38 : isGate ? 0x465462 : 0x182536
  scene.background = new Color(sky)
  scene.fog = isGate ? new Fog(sky, 17, 92) : new Fog(sky, 31, 115)
  camera.position.fromArray(concept.camera)
  camera.lookAt(concept.target[0], concept.target[1], concept.target[2])
  const mechanical = machineStage ? machine(concept.id === 'bug') : null
  const model = machineStage ? mechanical!.root : landmarks[concept.id]()
  scene.add(model)

  const floor = new Mesh(new PlaneGeometry(190, 190, 80, 80), ground(concept.id))
  floor.name = 'Preview ground'
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.045
  scene.add(floor, new HemisphereLight(0x9cb6e8, 0x3a2b25, machineStage ? 1.75 : 1.18),
    new AmbientLight(0x9aaabe, 0.45))
  const key = new DirectionalLight(isDocks || isGate ? 0xffc182 : 0xe7e8fc, isDocks ? 1.3 : 2.85)
  key.position.set(-6, 8, 11)
  const rim = new DirectionalLight(machineStage ? 0x5ee5f6 : 0x779ada, 3.6)
  rim.position.set(3, 6, -7)
  scene.add(key, rim)
  if (isDocks || isGate || isSquare || machineStage || isSphere) {
    const accent = new PointLight(isSquare ? 0xff2048 : concept.id === 'craw' ? 0x3fdae9 : 0xffad54,
      machineStage ? 29 : 380, 0, 2)
    accent.position.set(machineStage ? -2 : -4, machineStage ? 2.2 : 5.5, machineStage ? 3 : -4)
    scene.add(accent)
  }
  return { scene, camera, triangles: triangleCount(model), poseRupture: mechanical?.poseRupture }
}
