import { describe, expect, it } from 'vitest'
import { Color, Mesh } from 'three/webgpu'
import { concepts } from '../catalog'
import { createWhiteSpace } from '../spaces'
import { createConceptStage, loadModel } from './conceptStage'

describe('rebuild spaces', () => {
  it('starts with two independent white scenes', () => {
    const main = createWhiteSpace()
    const dev = createWhiteSpace()
    expect(main.scene).not.toBe(dev.scene)
    expect(main.camera).not.toBe(dev.camera)
    for (const space of [main, dev]) {
      expect(space.scene.background).toEqual(new Color(0xffffff))
      expect(space.scene.children).toHaveLength(0)
    }
  })

  it.each(concepts)('ships density-checked geometry for $name', async concept => {
    const { scene, triangles, dispose } = createConceptStage(concept, await loadModel(concept.id))
    try {
      expect(triangles).toBeGreaterThanOrEqual(100_000)
      expect(triangles).toBeLessThanOrEqual(1_000_000)
      scene.traverse(object => {
        if (!(object instanceof Mesh)) return
        const { index, attributes } = object.geometry
        const faces = (index?.count ?? attributes.position!.count) / 3
        expect(faces, object.name).toBeGreaterThanOrEqual(10_000)
      })
    } finally {
      dispose()
    }
  })
})
