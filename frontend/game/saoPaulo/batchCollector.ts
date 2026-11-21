import * as THREE from 'three'

/**
 * High-performance batched geometry collector and UV-tiling system.
 * Based on the Max Payne 3 São Paulo Floor 42 architecture pipeline.
 *
 * Merges thousands of individual architectural elements (slabs, columns, mullions,
 * furniture pieces, step nosings, trim inlays) into batched meshes keyed by material
 * and shadow configuration. Keeps draw calls under 30 and FPS at 60-120.
 */

export interface BoxOptions {
  tile?: number
  rx?: number
  ry?: number
  rz?: number
  order?: THREE.EulerOrder
  castShadow?: boolean
  receiveShadow?: boolean
  vertexColors?: boolean
}

export interface CylOptions {
  rx?: number
  ry?: number
  rz?: number
  order?: THREE.EulerOrder
  castShadow?: boolean
  receiveShadow?: boolean
}

/**
 * Creates a BoxGeometry with tri-planar metric UV tiling.
 * Prevents stretching on architectural surfaces (marble slabs, walnut grain, carpet).
 */
export function tiledBox(
  width: number,
  height: number,
  depth: number,
  tileSize = 2
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(width, height, depth)
  if (!tileSize || tileSize <= 0) return geo

  const pos = geo.attributes.position
  const norm = geo.attributes.normal
  const uv = geo.attributes.uv
  if (!pos || !norm || !uv) return geo

  const inv = 1 / tileSize

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const nx = Math.abs(norm.getX(i))
    const ny = Math.abs(norm.getY(i))

    let u = 0
    let v = 0

    if (nx > 0.5) {
      // Side faces (YZ plane)
      u = (z + depth * 0.5) * inv
      v = (y + height * 0.5) * inv
    } else if (ny > 0.5) {
      // Top / bottom faces (XZ plane)
      u = (x + width * 0.5) * inv
      v = (z + depth * 0.5) * inv
    } else {
      // Front / back faces (XY plane)
      u = (x + width * 0.5) * inv
      v = (y + height * 0.5) * inv
    }

    uv.setXY(i, u, v)
  }

  uv.needsUpdate = true
  return geo
}

/**
 * Fast-path Three.js BufferGeometry merger without external dependencies.
 * Combines positions, normals, UVs, optional vertex colors, and generates compact indices.
 */
export function mergeBufferGeometries(
  geometries: THREE.BufferGeometry[],
  useVertexColors = false
): THREE.BufferGeometry | null {
  if (!geometries || geometries.length === 0) return null

  let totalVertices = 0
  let totalIndices = 0
  const validGeos: THREE.BufferGeometry[] = []

  for (let i = 0; i < geometries.length; i++) {
    const g = geometries[i]
    if (!g || !g.attributes.position) continue
    const count = g.attributes.position.count
    if (count === 0) continue

    if (!g.attributes.normal) {
      g.computeVertexNormals()
    }
    const idxCount = g.index ? g.index.count : count
    totalVertices += count
    totalIndices += idxCount
    validGeos.push(g)
  }

  if (validGeos.length === 0) return null

  const positions = new Float32Array(totalVertices * 3)
  const normals = new Float32Array(totalVertices * 3)
  const uvs = new Float32Array(totalVertices * 2)
  const colors = useVertexColors ? new Float32Array(totalVertices * 3) : null
  const indices =
    totalVertices > 65535
      ? new Uint32Array(totalIndices)
      : new Uint16Array(totalIndices)

  let vertexOffset = 0
  let indexOffset = 0

  for (let i = 0; i < validGeos.length; i++) {
    const g = validGeos[i]!
    const pos = g.attributes.position
    const norm = g.attributes.normal
    const uv = g.attributes.uv
    const col = useVertexColors ? g.attributes.color : null
    if (!pos || !norm) continue

    const count = pos.count

    for (let j = 0; j < count; j++) {
      const idx3 = (vertexOffset + j) * 3
      positions[idx3] = pos.getX(j)
      positions[idx3 + 1] = pos.getY(j)
      positions[idx3 + 2] = pos.getZ(j)

      normals[idx3] = norm.getX(j)
      normals[idx3 + 1] = norm.getY(j)
      normals[idx3 + 2] = norm.getZ(j)

      const idx2 = (vertexOffset + j) * 2
      if (uv) {
        uvs[idx2] = uv.getX(j)
        uvs[idx2 + 1] = uv.getY(j)
      }

      if (colors) {
        if (col) {
          colors[idx3] = col.getX(j)
          colors[idx3 + 1] = col.getY(j)
          colors[idx3 + 2] = col.getZ(j)
        } else {
          colors[idx3] = 1
          colors[idx3 + 1] = 1
          colors[idx3 + 2] = 1
        }
      }
    }

    if (g.index) {
      const arr = g.index.array
      const iCount = g.index.count
      for (let j = 0; j < iCount; j++) {
        indices[indexOffset + j] = (arr[j] ?? 0) + vertexOffset
      }
      indexOffset += iCount
    } else {
      for (let j = 0; j < count; j++) {
        indices[indexOffset + j] = j + vertexOffset
      }
      indexOffset += count
    }

    vertexOffset += count
    g.dispose()
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  if (colors) {
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  }
  merged.setIndex(new THREE.BufferAttribute(indices, 1))
  merged.computeBoundingBox()
  merged.computeBoundingSphere()

  return merged
}

interface BatchBucket {
  material: THREE.Material
  castShadow: boolean
  receiveShadow: boolean
  vertexColors: boolean
  geometries: THREE.BufferGeometry[]
}

export class BatchCollector {
  private buckets = new Map<string, BatchBucket>()
  private mat4 = new THREE.Matrix4()
  private quat = new THREE.Quaternion()
  private euler = new THREE.Euler()
  private pos = new THREE.Vector3()
  private scale = new THREE.Vector3(1, 1, 1)

  constructor(private resolveMaterial: (idOrMat: string | THREE.Material) => THREE.Material) {}

  addGeometry(
    geometry: THREE.BufferGeometry,
    material: string | THREE.Material,
    matrix?: THREE.Matrix4,
    options: BoxOptions = {}
  ): void {
    const mat = this.resolveMaterial(material)
    const isTransparentNoDepth = Boolean((mat as THREE.MeshStandardMaterial).transparent && !(mat as THREE.MeshStandardMaterial).depthWrite)
    const cast = isTransparentNoDepth ? false : (options.castShadow ?? true)
    const receive = isTransparentNoDepth ? false : (options.receiveShadow ?? true)
    const vc = Boolean(options.vertexColors)

    const key = `${mat.uuid}_${cast ? 1 : 0}_${receive ? 1 : 0}_${vc ? 1 : 0}`
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = {
        material: mat,
        castShadow: cast,
        receiveShadow: receive,
        vertexColors: vc,
        geometries: [],
      }
      this.buckets.set(key, bucket)
    }

    const cloned = geometry.clone()
    if (matrix) {
      cloned.applyMatrix4(matrix)
    }
    bucket.geometries.push(cloned)
  }

  addBox(
    w: number,
    h: number,
    d: number,
    material: string | THREE.Material,
    x: number,
    y: number,
    z: number,
    options: BoxOptions = {}
  ): void {
    const tile = options.tile !== undefined ? options.tile : 2
    const geo = tiledBox(w, h, d, tile)

    this.euler.set(options.rx || 0, options.ry || 0, options.rz || 0, options.order || 'YXZ')
    this.quat.setFromEuler(this.euler)
    this.pos.set(x, y, z)
    this.mat4.compose(this.pos, this.quat, this.scale)

    this.addGeometry(geo, material, this.mat4, options)
    geo.dispose()
  }

  addCylinder(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    radialSegments: number,
    material: string | THREE.Material,
    x: number,
    y: number,
    z: number,
    options: CylOptions = {}
  ): void {
    const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)

    this.euler.set(options.rx || 0, options.ry || 0, options.rz || 0, options.order || 'YXZ')
    this.quat.setFromEuler(this.euler)
    this.pos.set(x, y, z)
    this.mat4.compose(this.pos, this.quat, this.scale)

    this.addGeometry(geo, material, this.mat4, options)
    geo.dispose()
  }

  build(parentGroup: THREE.Group): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = []

    for (const bucket of this.buckets.values()) {
      const mergedGeo = mergeBufferGeometries(bucket.geometries, bucket.vertexColors)
      if (!mergedGeo) continue

      const mesh = new THREE.Mesh(mergedGeo, bucket.material)
      mesh.castShadow = bucket.castShadow
      mesh.receiveShadow = bucket.receiveShadow
      mesh.name = `batched_${bucket.material.name || 'mat'}`

      parentGroup.add(mesh)
      meshes.push(mesh)
    }

    this.buckets.clear()
    return meshes
  }
}
