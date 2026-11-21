import { Color, PerspectiveCamera, Scene } from 'three/webgpu'

export const baseFov = 39

export function createWhiteSpace() {
  const scene = new Scene()
  scene.background = new Color(0xffffff)
  const camera = new PerspectiveCamera(baseFov, 1, 0.1, 240)
  camera.position.set(7.4, 4.8, 11.6)
  camera.lookAt(0, 1, 0)
  return { scene, camera }
}
