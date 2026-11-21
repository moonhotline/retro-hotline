export const concepts = [
  { id: 'gate', name: '金门大桥', reference: 1, camera: [-0.95, 1.96, 33.5], target: [-0.16, 8.45, -10], fov: 39 },
  { id: 'orchard', name: 'Apple Park', reference: 2, camera: [-1.15, 1.76, 18.9], target: [3.15, 3.48, 0], fov: 46 },
  { id: 'square', name: '纽约时代广场', reference: 3, camera: [-2.35, 1.52, 20.2], target: [-0.48, 5.35, -17], fov: 45 },
  { id: 'bay-view', name: 'Google Bay View', reference: 4, camera: [-2.65, 1.72, 23.5], target: [1.1, 4.38, -0.4], fov: 42 },
  { id: 'voyager', name: 'NVIDIA Voyager', reference: 5, camera: [-2.15, 1.72, 25.9], target: [0.35, 5.48, 1], fov: 43 },
  { id: 'craw', name: 'CRAW 蜘蛛', reference: 6, camera: [-2.4, 2.33, 9.45], target: [0, 1.26, .18], fov: 35 },
  { id: 'bug', name: 'BUG 臭虫', reference: 7, camera: [-1.9, 2.87, 6.85], target: [0, .92, .23], fov: 34 },
  { id: 'docks', name: '断电港区', reference: 8, camera: [1.45, 2.35, 17.6], target: [0.25, 4.55, -9], fov: 43 },
  { id: 'sphere', name: '拉斯维加斯巨球', reference: 9, camera: [0.4, 1.46, 31.6], target: [0, 6.10, -0.4], fov: 35 },
] as const

export type Concept = typeof concepts[number]
export type ConceptId = Concept['id']
