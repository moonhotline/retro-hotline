import { Group, PointLight } from 'three/webgpu'
import { batch, capsule, facade, finish, patch, plating, ribbon, strut, type Point } from './geometry'
import { driftingHaze, lightHalos } from './haze'
import { industrialSurface, textured } from './surfaces'

export function gate() {
  const root = new Group()
  const steel = industrialSurface('#ae5029', '#642a1a', 466, .46)
  const cable = textured(finish(0x52231a, .43, .57), 772, 'metal', .024)
  const towers = []
  const ribs = []
  const cladding = []
  const rails = []
  const steelwork = []
  const deck = []
  const lampFrames = []
  const lampGlass = []
  const lamps: Point[] = []
  const towerAt = [0, -58]
  for (const z of towerAt) {
    for (const side of [-1, 1]) {
      const width = 5.9 * side
      const outer = 6.4 * side
      const high = 4.62 * side
      towers.push(strut([outer, -1, z], [high, 25.8, z], 0.82, 0.96, 102, 68))
      for (let i = 0; i < 21; i++) {
        const y = 1 + i * 1.16
        const x = outer + (high - outer) * (y + 1) / 26.8
        ribs.push(facade([x - .62,y,z + .79],[x + .62,y,z + .79],[x - .62,y + .026,z + .79], 22, 5))
        for (const dx of [-.50,-.42,.42,.50]) {
          cladding.push(capsule([x+dx,y + .06,z + .77],[x+dx,y + .06,z + .89],.031,13,6))
        }
      }
      rails.push(plating([[width - 1.35,2.65,z - 1.4],[width + 1.35,2.65,z - 1.4],
        [width + 1.35,2.65,z + 1.58],[width - 1.35,2.65,z + 1.58]], .13, 14))
    }
    for (const [y, span, beam] of [[10.8, 5.4, 1.03], [18.7, 4.89, .65], [25.25, 4.64, .78]] as const) {
      towers.push(strut([-span, y, z], [span, y, z], .63, beam, 85, 64))
      for (let i = -7; i <= 7; i++) {
        const x = i * span / 8
        ribs.push(strut([x,y-beam*.8,z+.67],[x,y+beam*.85,z+.67],.12,.16,16,15))
      }
      for (const side of [-1,1]) {
        towers.push(strut([side * (span-.20),y-1.12,z],[side * (span-1.52),y-.39,z],
          .65,.35,42,26))
      }
    }
  }
  for (const side of [-1,1]) {
    const x = 6.04 * side
    deck.push(facade([x - .20,.09,35],[x + .20,.09,35],[x - .20,.09,-87],22,120))
    deck.push(facade([x - side*.20,.09,35],[x - side*.20,-.05,35],[x - side*.20,.09,-87],15,124))
  }
  batch(root,deck,textured(finish(0x3b3630,.77,.09),158,'stone',.015),'Concrete curb and rain channel')
  batch(root,towers,steel,'Tapered portal towers and web plates')
  batch(root,[...ribs,...cladding],finish(0x7c3825,.57,.51),'Tower seams, ribs and rivet heads')
  const cableHeight = (z: number) => z > 0 ? 4.75 + 20.75 * Math.exp(-z * 0.101) :
    7.3 + 18.2 * Math.pow((z + 29) / 29, 2)
  for (const side of [-1, 1]) {
    const x = side * 6.3
    const route: Point[] = Array.from({length: 53}, (_, i) => {
      const z = -59 + i * 1.82
      return [x - side * Math.max(0, (8 - Math.abs(z)) * .22), cableHeight(z), z]
    })
    steelwork.push(ribbon(route,.23,224,35))
    steelwork.push(ribbon(route.map(([x,y,z])=>[x,y+.265,z]),.033,210,18))
    for (let z = -56; z < 32; z += 1.7) {
      const cx = x - side * Math.max(0,(8-Math.abs(z))*.22)
      const y = cableHeight(z)
      steelwork.push(capsule([cx,y-.03,z-.09],[cx,y-.03,z+.09],.258,22,12))
      for (const gap of [-.075,.075]) {
        steelwork.push(capsule([x,0,z+gap],[cx,y,z+gap],.021,10,8))
      }
    }
    for (const y of [.16,.73,1.19]) rails.push(capsule([x,y,36],[x,y,-81],.062,40,112))
    for (let z = 33; z > -80; z -= .40) rails.push(capsule([x,.13,z],[x,1.18,z],.025,9,8))
    for (let z = 33; z > -80; z -= 3.2) {
      rails.push(strut([x,0,z],[x,1.24,z],.075,.079,12,20))
    }
    for (const z of (side > 0 ? [19,7,-13,-25,-37,-50,-64] : [5,-7,-19,-31,-43,-55,-69])) {
      const end = x - side * 1.34
      const low = z === 19 ? -.67 : 0
      lampFrames.push(ribbon([[x,0,z],[x,4.38+low,z],[x,5.21+low,z],
        [x-side*.63,5.73+low,z],[end,5.73+low,z]],.063,85,22))
      lampGlass.push(capsule([end-.24,5.69+low,z],[end+.24,5.69+low,z],.11,36,23))
      if (z > -45) {
        lamps.push([end,5.69+low,z+.18])
        const light = new PointLight(0xff983e, 135, 24, 2)
        light.position.set(end,5.43+low,z)
        root.add(light)
      }
    }
  }
  batch(root,steelwork,cable,'Clamped main cables and doubled suspension hangers')
  batch(root,rails,steel,'Bridge guardrails and tower catwalks')
  batch(root,lampFrames,cable,'Gooseneck sodium standards')
  batch(root,lampGlass,finish(0xffbd70,.31,.12,0xffa031,6),'Amber sodium bulbs')
  batch(root,Array.from({length: 34},(_,i) => {
    const z = 29 - i * 3.4
    return facade([-.087,0.001,z],[.087,0.001,z],[-.087,0.001,z-1.34],12,14)
  }),finish(0xb4a695,.69,.06),'Faded white center line')
  batch(root,[-1,1].map(side => patch((u,v)=>[
    side * (11 + v * 53), -0.9 + Math.sin(u*9 + side) * 3.4 * v + v * 4.7,
    -19 - u * 160,
  ],144,50)),finish(0x283337,.93,.04),'Distant fogbank and coastal headlands')
  lightHalos(root,lamps,1.22,'#f68c36',.32)
  driftingHaze(root,[[.5,1.6,-14],[-4.7,2.2,-32],[1.8,2.62,-48],[7.5,3.05,-61]],'#69737d',14,3.4)
  return root
}
