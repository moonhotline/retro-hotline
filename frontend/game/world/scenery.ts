import {
  AdditiveBlending, CanvasTexture, DoubleSide, Group, MeshBasicMaterial,
  MeshBasicNodeMaterial, MeshStandardNodeMaterial, Object3D, SphereGeometry, SRGBColorSpace,
  type Camera, type ColorRepresentation,
} from 'three/webgpu'
import { cameraPosition, color, mix, positionWorld, reflector, screenUV, smoothstep, texture, uv, vec2 } from 'three/tsl'
import { batch, capsule, facade, finish, patch, plating, strut } from '../../lab/models/geometry'
import { industrialSurface, textured, weatherField } from '../../lab/models/surfaces'
import { dockWindow } from '../../lab/volume'
import { battery, branches, checkpoints, mainPath, sectors, terminal } from './map'

function flat(x0: number, x1: number, z0: number, z1: number, y: number) {
  return facade([x0, y, z0], [x1, y, z0], [x0, y, z1], 1, 1)
}

function label(text: string, tint = '#bbd3dc', background = '#1a2529') {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')!
  context.fillStyle = background
  context.fillRect(0, 0, 512, 128)
  context.fillStyle = tint
  context.font = '600 47px system-ui'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 256, 67, 478)
  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  return new MeshBasicMaterial({ map, side: DoubleSide })
}

function roadSurface(camera: Camera) {
  const material = new MeshStandardNodeMaterial({ roughness: .51, metalness: .13, side: DoubleSide })
  const field = weatherField(661)
  material.roughnessMap = field
  const { x, z } = positionWorld
  const p = vec2(x, z)
  const broad = texture(field, p.mul(.115)).r
  const sand = texture(field, p.mul(2.52)).r
  const wet = smoothstep(.26, .64, broad.mul(.83).add(sand.mul(.17)))
  const seam = z.div(3.1).fract().sub(.5).abs().max(x.div(2.4).fract().sub(.5).abs())
  const joint = smoothstep(.478, .5, seam).mul(.23)
  material.colorNode = color('#333c43').mul(broad.mul(.38).add(sand.mul(.22)).add(.56)).mul(joint.oneMinus())
  material.roughnessNode = mix(.73, .24, wet)
  const anchor = new Object3D()
  anchor.rotation.x = -Math.PI / 2
  anchor.position.y = -.04
  const reflection = reflector({ target: anchor, resolution: .34, generateMipmaps: true, bounces: false })
  reflection.uvNode = screenUV.flipX().add(vec2(sand.sub(.45), broad.sub(.45)).mul(.006))
  reflection.levelNode = mix(3.7, 1.4, wet)
  const glaze = cameraPosition.sub(positionWorld).normalize().y.abs().oneMinus().pow(4)
  const reflected = reflection.rgb.mul(wet.mul(.24).add(.025)).mul(glaze.mul(.64).add(.43))
  const { panes, size, grid, slope, ceiling } = dockWindow
  const footprint = panes.reduce((mask, center, i) => {
    if (i % 2) return mask
    return mask.add(smoothstep(0, .22, x.sub(center).abs().negate().add(size[0]))
      .mul(smoothstep(0, .31, z.sub(panes[i + 1]!).abs().negate().add(size[1]))))
  }, color('#000').r)
  const grateX = x.add(ceiling * slope[0] - grid[0]).div(grid[2]).add(.5).fract().sub(.5).abs()
  const grateZ = z.add(ceiling * slope[1] - grid[1]).div(grid[3]).add(.5).fract().sub(.5).abs()
  const projection = color('#ff9028').mul(footprint).mul(smoothstep(.08, .24, grateX)
    .mul(smoothstep(.12, .32, grateZ))).mul(wet.mul(.19).add(.32))
  material.emissiveNode = reflected.add(projection)
  return { material, anchor, dispose: () => reflection.reflector.renderTargets.get(camera)?.dispose() }
}

function floorPath(root: Group, material: MeshStandardNodeMaterial) {
  const surface = [flat(-9, 9, 24, -13, -.041), flat(-15, 15, -13, -43, -.041),
    flat(-6.28, 6.28, -65.9, -184.9, -.043)]
  const marks = []
  for (const { width, points } of [...mainPath, ...branches]) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!
      if (a.z > -43 && b.z >= -43) continue
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      const nx = (b.z - a.z) / length
      const nz = (a.x - b.x) / length
      surface.push(facade([a.x + nx * width, -.04, a.z + nz * width],
        [a.x - nx * width, -.04, a.z - nz * width], [b.x + nx * width, -.04, b.z + nz * width], 1, 1))
      surface.push(patch((u, v) => [b.x + Math.cos(u * Math.PI * 2) * v * width,
        -.04, b.z + Math.sin(u * Math.PI * 2) * v * width], 36, 2))
      if (a.z <= -66 && a.z > -184) continue
      for (let d = 2.2; d + 1.5 < length; d += 5.2) {
        const x = a.x + (b.x - a.x) * d / length, z = a.z + (b.z - a.z) * d / length
        marks.push(facade([x + nx * .055, -.036, z + nz * .055], [x - nx * .055, -.036, z - nz * .055],
          [x + nx * .055 + (b.x - a.x) * 1.15 / length, -.036,
            z + nz * .055 + (b.z - a.z) * 1.15 / length], 1, 1))
      }
    }
  }
  batch(root, surface, material, 'Continuous wet roadway and footpaths')
  batch(root, marks, finish(0x8e8165, .82, .01), 'Painted wayfinding along the shared route')
}

function water(root: Group) {
  const material = new MeshStandardNodeMaterial({ roughness: .28, metalness: .24, side: DoubleSide })
  const detail = weatherField(722)
  material.roughnessMap = detail
  const p = vec2(positionWorld.x, positionWorld.z)
  const ripples = texture(detail, p.mul(vec2(.21, 1.34))).r
  material.colorNode = mix(color('#132a38'), color('#2b4754'), smoothstep(.2, .74, ripples))
  material.roughnessNode = mix(.23, .49, ripples)
  batch(root, [flat(-145, 145, -64, -188, -4.65)], material, 'Fogbound coastal water below bridge deck')
}

function landscapeFloor(root: Group) {
  const soil = new MeshStandardNodeMaterial({ roughness: .88, side: DoubleSide })
  const detail = weatherField(572)
  soil.roughnessMap = detail
  const { x, z } = positionWorld
  const grain = texture(detail, vec2(x, z).mul(.34)).r
  soil.colorNode = mix(color('#1d302c'), color('#304332'), smoothstep(.27, .69, grain))
  batch(root, [flat(3.4, 48, -357, -418, -.095), flat(3.4, 49, -431, -494, -.095),
    flat(-29, 24, -510, -554, -.095)], soil, 'Planted soil around the campus paths')

  const pool = new MeshStandardNodeMaterial({ roughness: .18, metalness: .38, side: DoubleSide })
  pool.colorNode = mix(color('#132b34'), color('#365660'), grain)
  const shoreline = [patch((u, v) => {
    const angle = Math.PI * 2 * u
    return [-6.2 + 7.1 * v * Math.cos(angle), -.081, -535.8 + 5.3 * v * Math.sin(angle)]
  }, 110, 32)]
  batch(root, shoreline, pool, 'Apple Park courtyard pond')
}

function wayfinding(root: Group) {
  const directions = [[-3.75, -47, 'GOLDEN GATE ↑'], [3.85, -49, '↑ 港区'], [-3.9, -62, '金门大桥 ↑'],
    [3.75, -190, 'TIMES SQUARE ↑'], [-3.9, -278, 'THE SPHERE →'], [3.75, -364, 'BAY VIEW →'],
    [-3.9, -433, 'VOYAGER ↑'], [3.75, -516, 'APPLE PARK →']] as const
  for (const [x, z, text] of directions) {
    batch(root, [capsule([x, 0, z - .06], [x, 2.4, z - .06], .048, 26, 24)], finish(0x424b4e), 'Wayfinding post')
    batch(root, [facade([x - 1, 2.16, z], [x + 1, 2.16, z], [x - 1, 2.68, z], 1, 1)],
      label(text), 'Directional sign')
  }
  const frames = []
  const strips = []
  for (const point of Object.values(checkpoints)) {
    const x = point.x + (point.name === '港区库房' ? 1.75 : 2.8), z = point.z
    frames.push(strut([x, .04, z], [x, .98, z], .10, .12, 20, 15))
    strips.push(capsule([x, .76, z + .096], [x, .95, z + .096], .042, 22, 15))
  }
  batch(root, frames, finish(0x1d353e), 'Checkpoint beacon housings')
  batch(root, strips, finish(0x84cabb, .45, .2, 0x65ddc4, 2.8), 'Checkpoint status strip')
}

function towerOutline() {
  const root = new Group()
  const steel = finish(0x723b2f, .53, .28, 0x832a14, .32)
  const shapes = []
  for (const z of [0, -58]) {
    for (const side of [-1, 1]) shapes.push(strut([side * 6.4, -1, z], [side * 4.6, 25.8, z], .74, .92, 60, 38))
    for (const [y, span] of [[10.8, 5.4], [18.7, 4.89], [25.2, 4.64]] as const) {
      shapes.push(strut([-span, y, z], [span, y, z], .6, .7, 52, 34))
    }
  }
  batch(root, shapes, steel, 'Bridge tower outline beyond the cargo yard')
  return root
}

export function farLandmarks() {
  return sectors.map(sector => {
    const root = sector.id === 'gate' ? towerOutline() : new Group()
    root.position.set(sector.x, 0, sector.z)
    if (sector.id === 'docks') {
      batch(root, [facade([-8.6, 0, -11], [-8.6, 0, 23], [-8.6, 12, -11], 12, 9),
        facade([8.4, 0, 23], [8.4, 0, -11], [8.4, 12, 23], 12, 9),
        facade([-8.6, 5, -9.55], [8.4, 5, -9.55], [-8.6, 12, -9.55], 18, 9),
        flat(-8.6, 8.4, 23, -13, 12)], finish(0x2c3233), 'Loading hall outline')
    } else if (sector.id === 'square') {
      const buildings = []
      for (const side of [-1, 1]) {
        for (let i = 0; i < 8; i++) {
          const x = side * (6.85 + (i % 3) * .72 + (side > 0 ? .84 : 0))
          const z = 14 - i * 9.1
          const height = 16.3 + i * 17 % 20 + (side > 0 ? 5 : 0)
          buildings.push(facade([x, 0, z], [x, 0, z - 8.9], [x, height, z], 6, 8),
            facade([x, 0, z], [x + side * 6, 0, z], [x, height, z], 5, 8))
        }
      }
      batch(root, buildings, finish(0x252e3a), 'Broadway skyline outline')
      batch(root, [facade([.33, 4, -27.8], [3.25, 4, -27.8], [.33, 24.6, -27.8], 7, 12)],
        finish(0x4c1728, .6, .1, 0x5b1628, .75), 'Red screen in the distance')
    } else if (sector.id === 'sphere') {
      const shape = new SphereGeometry(8.15, 56, 32, 0, Math.PI * 2, 0, Math.PI * .717)
      batch(root, [shape.translate(0, 6.68, 0)], finish(0x1d1a37, .48, .46, 0x362448, .39), 'Exosphere outline')
    } else if (sector.id === 'bay-view') {
      batch(root, [patch((u, v) => {
        const x = -18 + 36 * u, z = 4.9 - 22 * v
        const near = Math.hypot((x - 4.55) / 12, (z + 3.4) / 7.6)
        const far = Math.hypot((x + 10.9) / 8, (z + 6.8) / 7.6)
        return [x, 4.3 + 8.25 * Math.exp(-near * 1.68) + 4.85 * Math.exp(-far * 1.68) - Math.max(0, z - 1) * .078, z]
      }, 68, 34)], finish(0x596378, .42, .41), 'Twin canopy outline')
    } else if (sector.id === 'voyager') {
      const tip = [4.25, 4.15, 6.35] as const
      const apex = [.7, 10.54, -7.45] as const
      batch(root, [plating([[-18, 12.15, 4.25], tip, [1.4, 10.79, 1.8], apex], .42, 12),
        plating([tip, [17.1, 12.2, 2.39], apex, [1.4, 10.79, 1.8]], .53, 12)],
      finish(0x343d46, .41, .44), 'Folded roof outline')
    } else if (sector.id === 'orchard') {
      batch(root, [patch((u, v) => {
        const angle = -.46 + 2.28 * u
        return [-13 + 26 * Math.sin(angle), .11 + v * 8.22, -4 + 26 * (1 - Math.cos(angle))]
      }, 78, 22)], finish(0x425769, .45, .36), 'Curved campus outline')
    }
    return { sector, root }
  })
}

function dockScattering(root: Group) {
  const light = new MeshBasicNodeMaterial({ side: DoubleSide, blending: AdditiveBlending,
    transparent: true, depthWrite: false })
  light.colorNode = color('#ff9a38')
  const edge = uv().x.sub(.5).abs()
  light.opacityNode = smoothstep(.13, .5, edge).oneMinus().pow(2)
    .mul(uv().y.add(.05)).mul(.086)
  const shafts = Array.from({ length: 20 }, (_, i) => {
    const x = -7.15 + i * .76
    const far = -7.9 + (i % 4) * .91
    return patch((u, v) => [
      x + (u - .5) * (1.22 - v * .92) - (1 - v) * 5.7,
      .035 + v * 11.55,
      far + (1 - v) * 6.1,
    ], 29, 18)
  })
  return batch(root, shafts, light, 'Airborne light from the loading hall grating')
}

function batteryPack(x: number, y: number, z: number) {
  const root = new Group()
  root.position.set(x, y, z)
  batch(root, [strut([0, .09, -.32], [0, .09, .32], .265, .095, 44, 40),
    strut([-.17, .23, -.11], [.17, .23, -.11], .034, .033, 26, 23)], finish(0x535d50, .42, .56), 'Emergency battery casing and handle')
  batch(root, [-.15, -.04, .07, .18].map(dx => capsule([dx, .174, .12], [dx, .174, .23], .022, 28, 19)),
    finish(0xb2e89a, .51, .3, 0x91e96a, 3), 'Remaining charge')
  return root
}

function seedVault(root: Group) {
  const x = terminal.x, z = terminal.z
  const room = new Group()
  room.position.set(x, 0, z)
  root.add(room)
  const frame = textured(finish(0x495250, .44, .61), 620, 'metal', .019)
  const walls = industrialSurface('#313837', '#4f5854', 816, .23)
  batch(room, [facade([-2.45, 0, 3.5], [-2.45, 0, -5.8], [-2.45, 3.1, 3.5], 55, 30),
    facade([2.45, 0, -5.8], [2.45, 0, 3.5], [2.45, 3.1, -5.8], 55, 30),
    facade([-2.45, 0, -5.8], [2.45, 0, -5.8], [-2.45, 3.1, -5.8], 50, 32),
    facade([-2.45, 3.1, 3.5], [2.45, 3.1, 3.5], [-2.45, 3.1, -5.8], 32, 28)], walls, 'Seed bank duty room')
  const mullions = [-2.42, 2.42].flatMap(dx => [
    strut([dx, 0, 3.49], [dx, 3.06, 3.49], .071, .065, 45, 29),
    strut([dx, 0, -2.12], [dx, 3.06, -2.12], .071, .065, 45, 29)])
  batch(room, [...mullions, strut([-2.44, 2.86, 3.49], [2.44, 2.86, 3.49], .06, .086, 62, 31),
    strut([-2.44, 2.92, -2.12], [2.44, 2.92, -2.12], .06, .086, 62, 31)], frame, 'Cold storage window frames')
  batch(room, [facade([-2.43, .08, -2.12], [2.43, .08, -2.12], [-2.43, 2.89, -2.12], 65, 40)],
    new MeshStandardNodeMaterial({ color: 0x9dcdd1, transparent: true, opacity: .15,
      roughness: .19, metalness: .27, depthWrite: false, side: DoubleSide }), 'Cold room glazing')

  const crates = []
  const slats = []
  const racks = []
  for (const [i, text] of ['稻', '麦', '豆'].entries()) {
    const dx = (i - 1) * 1.37
    for (let row = 0; row < 3; row++) {
      const back = -2.63 - row * .93
      const y = 1.56 - row * .38
      crates.push(strut([dx, y, back], [dx, y, back - .74], .55, .19, 51, 29))
      for (const edge of [-.47, .47]) slats.push(strut([dx + edge, y - .16, back + .008],
        [dx + edge, y + .17, back + .008], .034, .021, 25, 23))
      racks.push(strut([dx - .62, y - .23, back - .33], [dx + .62, y - .23, back - .33], .44, .046, 39, 18))
    }
    for (const edge of [-.56, .56]) racks.push(strut([dx + edge, .04, -2.78], [dx + edge, 1.4, -2.78], .042, .046, 27, 20))
    batch(room, [facade([dx - .23, 1.49, -2.565], [dx + .23, 1.49, -2.565], [dx - .23, 1.64, -2.565], 1, 1)],
      label(text, '#3d2d22', '#caba91'), 'Hand-lettered seed crate')
  }
  batch(room, crates, finish(0x806046, .71, .06), 'Three rows of wooden seed crates')
  batch(room, slats, finish(0xa17e51, .71, .08), 'Crate braces')
  batch(room, racks, frame, 'Seed bank storage racks')
  const lamp = finish(0x313930, .43, .21, 0xb0eede, .02)
  batch(room, [capsule([-1.72, 2.86, -3.7], [1.72, 2.86, -3.7], .043, 60, 36)], lamp, 'Cold storage overhead strip')
  batch(room, [capsule([-1.25, 2.86, .8], [1.25, 2.86, .8], .046, 60, 36)],
    finish(0xe1d9a4, .43, .21, 0xffd598, 2.1), 'Duty room pilot light')
  batch(room, [strut([-1.47, .79, -.86], [1.47, .79, -.86], .24, .165, 72, 38),
    strut([.7, .04, -.91], [.7, .83, -.91], .2, .2, 28, 28),
    strut([-.7, .04, -.91], [-.7, .83, -.91], .2, .2, 28, 28)], frame, 'Manual transfer terminal and workbench')
  batch(room, [plating([[-.78, 1.36, -1.13], [.84, 1.36, -1.13], [.84, 1.03, -.81], [-.78, 1.03, -.81]], .11, 28)],
    finish(0x252f32, .52, .44), 'Transfer terminal bezel')
  const screen = facade([-.71, 1.09, -.84], [.76, 1.09, -.84], [-.71, 1.32, -1.07], 1, 1)
  const off = batch(room, [screen], label('种子库离线。', '#f3a661', '#25231d'), 'Offline terminal')
  const on = batch(room, [screen.clone()], label('种子库供电恢复。', '#dcf8dd', '#224336'), 'Powered terminal')
  const pack = batteryPack(-1, .93, -.76)
  room.add(pack)
  return {
    show(opening: boolean, powered: boolean) {
      off.visible = !powered
      on.visible = powered
      pack.visible = opening || powered
      lamp.emissiveIntensity = powered ? 8.7 : .02
      lamp.color.setHex(powered ? 0xbfd6cd : 0x313930)
    },
  }
}

export function buildWorldSurfaces(camera: Camera) {
  const root = new Group()
  const road = roadSurface(camera)
  root.add(road.anchor)
  floorPath(root, road.material)
  water(root)
  batch(root, [flat(-86, 85, 29, -67, -.12), flat(-56, 83, -183, -556, -.12)],
    finish(0x2d3334, .88, .05), 'Harbor fill and continuous city ground')
  landscapeFloor(root)
  wayfinding(root)
  const beams = dockScattering(root)
  const pack = batteryPack(battery.x, .59, battery.z)
  batch(root, [strut([battery.x, .29, battery.z - .39], [battery.x, .29, battery.z + .39], .34, .29, 52, 43)],
    finish(0x3a3a33, .66, .39), 'Battery locker transport tray')
  root.add(pack)
  const vault = seedVault(root)
  return { root, beams, pack, vault, dispose: road.dispose }
}

export function contactShadow(tint: ColorRepresentation = 0x080e13) {
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide })
  material.colorNode = color(tint)
  material.opacityNode = smoothstep(.10, .5, uv().sub(vec2(.5,.5)).length()).oneMinus().pow(2).mul(.66)
  return batch(new Group(), [flat(-2.3, 2.3, -2.3, 2.3, -.026)], material, 'Ground contact shadow')
}
