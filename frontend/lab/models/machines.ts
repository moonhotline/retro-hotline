import {
  DataTexture, Group, LinearFilter, LinearMipmapLinearFilter, RedFormat, RepeatWrapping,
  Vector3,
} from 'three/webgpu'
import { ring } from './cutaway.js'
import { batch, finish, patch, ribbon, strut, type Point } from './geometry'

function toolmarks() {
  const size = 256
  const data = new Uint8Array(size * size)
  let state = 378915
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      const scratch = 1.4 * y + 0.16 * x + 4.5 * Math.sin(x / 26)
      data[y * size + x] = 128 + (state >>> 26) / 3 + (Math.sin(scratch) > 0.987 ? 22 : 0)
    }
  }
  const map = new DataTexture(data, size, size, RedFormat)
  map.magFilter = LinearFilter
  map.minFilter = LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.wrapS = map.wrapT = RepeatWrapping
  map.needsUpdate = true
  return map
}

export function machine(wide: boolean) {
  const root = new Group()
  const armor = finish(wide ? 0x787756 : 0x465458, 0.34, 0.69)
  armor.bumpMap = toolmarks()
  armor.bumpScale = 0.022
  const housing = finish(wide ? 0x414940 : 0x252e33, 0.44, 0.62)
  const joint = finish(0x889192, 0.29, 0.8)
  const black = finish(0x202826, 0.61)
  const accent = wide ? 0xff921e : 0x32e9f8
  const sensor = finish(accent, 0.21, 0.25, accent, 2.4)
  const level = wide ? 1.19 : 2.14

  batch(root, [patch((u, v) => {
    const a = u * Math.PI * 2
    const r = Math.sin(Math.PI * v)
    return [Math.cos(a) * r * (wide ? 1.48 : 1.0), level + 0.49 * Math.cos(v * Math.PI),
      Math.sin(a) * r * (wide ? 1.49 : 1.15)]
  }, 192, 82)], black, 'Core')

  const count = wide ? 6 : 5
  const shells = Array.from({ length: count }, (_, segment) => patch((u, v) => {
    const angle = (segment + 0.018 + 0.964 * u) * Math.PI * 2 / count + Math.PI / 2
    const nose = wide ? 0.12 * Math.sin(angle) : 0.06 * Math.sin(angle)
    const roll = Math.sin(Math.PI * v * 0.52)
    const bevel = 0.047 * Math.pow(Math.sin(Math.PI * u), 0.35)
    const ridge = Math.abs(Math.sin(angle * (wide ? 3 : 2.5))) * 0.12 * v
    return [
      Math.cos(angle) * roll * (wide ? 1.76 : 1.16),
      level + (wide ? 0.85 : 0.67) * (1 - Math.pow(v, 1.65)) + nose + bevel - ridge,
      Math.sin(angle) * roll * (wide ? 1.68 : 1.26),
    ]
  }, 88, 70))
  const plates = shells.map((shell, i) => batch(root, [shell], armor, `Backplate ${i + 1}`))
  const debris = new Group()
  debris.name = 'Core rupture'
  const hot = finish(accent, 0.28, 0.48, accent, 3.2)
  const core = batch(debris, [patch((u, v) => {
    const longitude = u * Math.PI * 2
    const latitude = v * Math.PI
    return [0.44 * Math.sin(latitude) * Math.cos(longitude), 0.33 * Math.cos(latitude),
      0.38 * Math.sin(latitude) * Math.sin(longitude)]
  }, 112, 48)], hot, 'Exposed core')
  core.position.y = level + 0.18
  const fragments = Array.from({ length: 7 }, (_, i) => {
    const length = 0.14 + 0.027 * (i % 4)
    return batch(debris, [strut([-length, 0, 0], [length, 0.035, 0.04], 0.032, 0.057)],
      i % 3 === 0 ? hot : armor, `Core fragment ${i + 1}`)
  })
  debris.visible = false
  root.add(debris)
  const edge = (wide ? 1.38 : 0.96)
  batch(root, [strut([-edge, level + 0.01, 0.72], [edge, level + 0.01, 0.72], 0.27, 0.31)], housing, 'Optics housing')
  const lensWidth = wide ? 0.35 : 0.62
  const lensSections = wide ? [-0.64, 0.64] : [0]
  batch(root, lensSections.map(x => strut(
    [x - lensWidth / 2, level + 0.065, wide ? 1.52 : 1.23],
    [x + lensWidth / 2, level + 0.065, wide ? 1.52 : 1.23], 0.066, 0.049, 92, 64,
  )), sensor, 'Sensor strip')

  for (const side of [-1, 1]) {
    const pairs = wide ? 3 : 4
    for (let leg = 0; leg < pairs; leg++) {
      const offset = leg - (pairs - 1) / 2
      const hip: Point = [side * (wide ? 1.03 : 0.77), level - 0.18, offset * 0.6]
      const knee: Point = [side * ((wide ? 1.83 : 2.55) - 0.18 * Math.abs(offset)),
        wide ? 0.87 : 2.66 - Math.abs(offset) * 0.18, offset * (wide ? 1.04 : 1.21)]
      const toe: Point = [side * ((wide ? 2.43 : 3.68) - 0.29 * Math.abs(offset)), 0.13,
        offset * (wide ? 1.36 : 1.69)]
      const legGroup = new Group()
      legGroup.name = `Leg ${side === -1 ? 'L' : 'R'}${leg + 1}`
      root.add(legGroup)
      const thick = wide ? 0.23 : 0.16
      batch(legGroup, [
        strut(hip, knee, thick, thick * 1.19),
        strut(knee, toe, thick * 0.72, thick * 0.91),
      ], armor, 'Segmented limb')
      const direction = new Vector3(...toe).sub(new Vector3(...knee))
      const pistonA = new Vector3(...knee).addScaledVector(direction, 0.11).add(new Vector3(-side * 0.21, 0, 0))
      const pistonB = pistonA.clone().addScaledVector(direction, 0.58)
      const mid = pistonA.clone().lerp(pistonB, 0.55)
      batch(legGroup, [strut(pistonA.toArray(), mid.toArray(), 0.074, 0.074)], housing, 'Actuator')
      batch(legGroup, [strut(mid.toArray(), pistonB.toArray(), 0.045, 0.045)], joint, 'Actuator rod')
      batch(legGroup, [
        ring(-0.11, 0.11, 0.12, wide ? 0.22 : 0.19, 0.033, { segs: 360, smooth: 36 })
          .rotateY(Math.PI / 2).translate(...knee),
      ], joint, 'Bearing collar')
      batch(legGroup, [ribbon([hip, [side * 1.25, level - 0.22, hip[2] + 0.15],
        [knee[0] - side * 0.12, knee[1] - 0.11, knee[2]]], 0.067)], black, 'Hydraulic line')
      batch(legGroup, [strut([toe[0], toe[1] - 0.035, toe[2] - 0.19],
        [toe[0], toe[1] - 0.035, toe[2] + 0.16], 0.16, 0.09)], housing, 'Foot')
    }
  }
  function poseRupture(elapsed: number) {
    const duration = 1.18
    const playing = elapsed < duration
    debris.visible = playing
    const time = Math.min(elapsed, 0.52) * 0.34 + Math.max(0, elapsed - 0.52)
    const progress = playing ? Math.min(1, time * 1.9) : 0
    const recoil = playing ? Math.sin(Math.PI * Math.pow(elapsed / duration, 0.66)) : 0
    plates.forEach((plate, i) => {
      const angle = (i + 0.5) * Math.PI * 2 / count + Math.PI / 2
      plate.position.set(Math.cos(angle) * recoil * 0.88, recoil * 0.51, Math.sin(angle) * recoil * 0.88)
    })
    core.scale.setScalar(Math.max(0.1, 1 - progress))
    fragments.forEach((fragment, i) => {
      const a = i * Math.PI * 2 / fragments.length
      const distance = progress * (1.5 + i * 0.11)
      fragment.position.set(Math.cos(a) * distance, level + 0.18 + progress * (2.9 - 2.3 * progress),
        Math.sin(a) * distance)
      fragment.rotation.set(progress * (i + 2), a + time * 4, progress * 7)
      fragment.scale.setScalar(1 - progress * 0.74)
    })
    return playing
  }

  return { root, poseRupture }
}
