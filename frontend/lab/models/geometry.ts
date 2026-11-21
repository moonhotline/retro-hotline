import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, DoubleSide, Mesh,
  MeshStandardMaterial, TubeGeometry, Vector3, type Material,
  type Object3D,
} from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type Point = readonly [number, number, number]
type Surface = (u: number, v: number) => Point

export function patch(sample: Surface, columns = 88, rows = 64) {
  const positions: number[] = []
  const uv: number[] = []
  const index: number[] = []
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const u = i / columns
      const v = j / rows
      positions.push(...sample(u, v))
      uv.push(u, v)
      if (i === columns || j === rows) continue
      const a = j * (columns + 1) + i
      const b = a + columns + 1
      index.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

export function ribbon(points: readonly Point[], radius: number, steps = 88, sides = 60) {
  return new TubeGeometry(new CatmullRomCurve3(points.map(p => new Vector3(...p))), steps, radius, sides)
}

export function facade(a: Point, b: Point, c: Point, columns = 88, rows = 64) {
  return patch((u, v) => [
    a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v,
    a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v,
    a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v,
  ], columns, rows)
}

export function batch(parent: Object3D, shapes: BufferGeometry[], material: Material, name: string) {
  const geometry = shapes.length === 1 ? shapes[0]! : mergeGeometries(shapes)
  if (shapes.length > 1) shapes.forEach(shape => shape.dispose())
  const mesh = new Mesh(geometry, material)
  mesh.name = name
  parent.add(mesh)
  return mesh
}

export function finish(color: number, roughness = 0.45, metalness = 0.26, emissive = 0, strength = 1) {
  return new MeshStandardMaterial({
    color, roughness, metalness, emissive, emissiveIntensity: strength, side: DoubleSide,
  })
}

// Rounded, tapered rectangular sections along a straight centerline.
export function strut(a: Point, b: Point, width: number, depth: number, steps = 88, sides = 64) {
  const start = new Vector3(...a)
  const axis = new Vector3(...b).sub(start)
  const right = new Vector3(...(Math.abs(axis.clone().normalize().y) > 0.9 ? [1, 0, 0] : [0, 1, 0]))
    .cross(axis).normalize()
  const up = axis.clone().cross(right).normalize()
  const point = new Vector3()
  const geometry = patch((u, v) => {
    const angle = u * Math.PI * 2
    const rect = (n: number) => Math.sign(n) * Math.pow(Math.abs(n), 0.37)
    const shoulder = 0.86 + 0.14 * Math.sin(v * Math.PI)
    const end = Math.min(1, 0.015 + v * 240, 0.015 + (1 - v) * 240)
    point.copy(start).addScaledVector(axis, v)
      .addScaledVector(right, rect(Math.cos(angle)) * width * shoulder * end)
      .addScaledVector(up, rect(Math.sin(angle)) * depth * shoulder * end)
    return [point.x, point.y, point.z]
  }, sides, steps)
  return geometry
}

export function triangleCount(root: Object3D) {
  let total = 0
  root.traverse(object => {
    if (object instanceof Mesh) {
      total += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3
    }
  })
  return total
}

export function disposeMeshes(root: Object3D) {
  const materials = new Set<Material>()
  const geometries = new Set<BufferGeometry>()
  root.traverse(object => {
    if (!(object instanceof Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
    }
  })
  geometries.forEach(geometry => geometry.dispose())
  materials.forEach(material => {
    if (material instanceof MeshStandardMaterial) material.bumpMap?.dispose()
    material.dispose()
  })
}
