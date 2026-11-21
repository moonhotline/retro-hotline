import type { BufferGeometry } from 'three/webgpu'

export function ring(
  x0: number, x1: number, r0: number, r1: number, round: number,
  options?: { segs?: number; smooth?: number; a0?: number; a1?: number },
): BufferGeometry
