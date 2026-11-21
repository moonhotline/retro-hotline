export const concepts = [
  { id: 'gate', name: '金门大桥', reference: 1, camera: [0, 2.7, 19], target: [0, 8, -9] },
  { id: 'orchard', name: 'Apple Park', reference: 2, camera: [2, 3.2, 19], target: [0, 5, -2] },
  { id: 'square', name: '纽约时代广场', reference: 3, camera: [0, 2.6, 14], target: [0, 8, -15] },
  { id: 'bay-view', name: 'Google Bay View', reference: 4, camera: [8, 3.2, 21], target: [0, 5, -3] },
  { id: 'voyager', name: 'NVIDIA Voyager', reference: 5, camera: [8, 3.9, 23], target: [0, 6.4, -2] },
  { id: 'craw', name: 'CRAW 蜘蛛', reference: 6, camera: [3.9, 2.65, 10.6], target: [0, 1.55, 0] },
  { id: 'bug', name: 'BUG 臭虫', reference: 7, camera: [3.65, 3.6, 8.8], target: [0, 0.95, 0] },
  { id: 'docks', name: '断电港区', reference: 8, camera: [2, 2.7, 15], target: [0, 5.5, -9] },
  { id: 'sphere', name: '拉斯维加斯巨球', reference: 9, camera: [3, 3, 29], target: [0, 7, 0] },
] as const

export type Concept = typeof concepts[number]
export type ConceptId = Concept['id']
