import {
  AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, Mesh, PlaneGeometry, PointLight, Vector3, type Group,
} from 'three/webgpu'
import type { Concept, ConceptId } from '../catalog'
import { createWhiteSpace } from '../spaces'
import { disposeMeshes, triangleCount } from './geometry'
import { skyDome } from './atmosphere'
import { environment } from './surfaces'
import { ground } from './ground'

interface Model {
  root: Group
  poseRupture?: (elapsed: number) => boolean
}

type ModelFactory = () => Model

const modelFactories: Record<ConceptId, () => Promise<ModelFactory>> = {
  gate: () => import('./gate').then(({ gate }) => () => ({ root: gate() })),
  orchard: () => import('./orchard').then(({ orchard }) => () => ({ root: orchard() })),
  square: () => import('./square').then(({ square }) => () => ({ root: square() })),
  'bay-view': () => import('./bayView').then(({ bayView }) => () => ({ root: bayView() })),
  voyager: () => import('./voyager').then(({ voyager }) => () => ({ root: voyager() })),
  docks: () => import('./docks').then(({ docks }) => () => ({ root: docks() })),
  sphere: () => import('./sphere').then(({ sphere }) => () => ({ root: sphere() })),
  craw: () => import('./machines').then(({ machine }) => () => machine(false)),
  bug: () => import('./machines').then(({ machine }) => () => machine(true)),
}

export function loadModel(id: ConceptId) {
  return modelFactories[id]()
}

export function createConceptStage(concept: Concept, buildModel: ModelFactory) {
  const { scene, camera } = createWhiteSpace()
  const machineStage = concept.id === 'craw' || concept.id === 'bug'
  const isSphere = concept.id === 'sphere'
  const isDocks = concept.id === 'docks'
  const isSquare = concept.id === 'square'
  const isGate = concept.id === 'gate'
  const sky = machineStage ? 0x131a1d : isSphere ? 0x292239 : isGate ? 0x414953 : 0x253647
  scene.background = new Color(sky)
  scene.fog = machineStage ? new Fog(0x131a1d, 10, 26) : new Fog(sky, isGate ? 17 : isSquare ? 24 : 34, isGate ? 92 : isSquare ? 104 : 127)
  const probe = environment(machineStage || isDocks, isSphere)
  scene.environmentIntensity = machineStage ? .50 : isDocks ? .27 : .45
  scene.add(skyDome(concept.id))
  camera.position.fromArray(concept.camera)
  camera.lookAt(concept.target[0], concept.target[1], concept.target[2])
  const { root: model, poseRupture } = buildModel()
  scene.add(model)

  const groundPass = ground(concept.id, camera)
  const floor = new Mesh(new PlaneGeometry(190, 190, 80, 80), groundPass.floor)
  floor.name = 'Preview ground'
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.045
  floor.receiveShadow = machineStage
  scene.add(floor, groundPass.anchor,
    new HemisphereLight(0xabc3da, 0x4c3427, machineStage ? .64 : isDocks ? .22 : .53),
    new AmbientLight(0x9caabc, machineStage ? .16 : .085))
  const key = new DirectionalLight(machineStage ? (concept.id === 'bug' ? 0xffd6a7 : 0xffe7cf) :
    isDocks ? 0xffd2a1 : isGate ? 0xc5d3e1 : 0xdce8ff,
  machineStage ? (concept.id === 'bug' ? 2.75 : 2.6) : isDocks ? .33 : isGate ? .81 : 1.10)
  key.position.set(machineStage ? -4.8 : -6, machineStage ? 7.2 : 8, machineStage ? 4.3 : 8)
  if (machineStage) {
    key.castShadow = true
    key.shadow.mapSize.set(1536, 1536)
    key.shadow.normalBias = 0.011
    key.shadow.bias = -0.0002
    key.shadow.radius = 2
    Object.assign(key.shadow.camera, { left: -6, right: 6, bottom: -5, top: 5, near: 0.4, far: 22 })
    model.traverse(object => {
      if (object instanceof Mesh) object.castShadow = object.receiveShadow = true
    })
  }
  const rim = new DirectionalLight(machineStage ? 0x54ceea : 0x8eb1ef, machineStage ? .94 : isDocks ? .38 : 1.05)
  rim.position.set(3, 5, -7)
  scene.add(key, rim)
  if (machineStage) {
    const fill = new DirectionalLight(0xffdfbd, .86)
    fill.position.set(-2.3, 4.9, 7.5)
    scene.add(fill)
  }
  if (isDocks || isGate || isSquare || machineStage || isSphere) {
    const accent = new PointLight(isSquare ? 0xff2048 : concept.id === 'craw' ? 0x3fdae9 : 0xffad54,
      machineStage ? 3.6 : isDocks ? 26 : isGate ? 110 : 175, 0, 2)
    accent.position.copy(machineStage ? new Vector3(3, 2.3, 3) : new Vector3(-4, 5.5, -4))
    scene.add(accent)
  }
  return {
    scene, camera, probe, triangles: triangleCount(model), poseRupture,
    fov: concept.fov,
    dispose() {
      groundPass.dispose()
      key.dispose()
      probe.dispose()
      disposeMeshes(scene)
    },
  }
}
