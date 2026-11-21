import { Group, MeshBasicNodeMaterial, SphereGeometry } from 'three/webgpu'
import { color, mix, sin, uv } from 'three/tsl'
import { batch, capsule, facade, finish, patch, ribbon, type Point } from './geometry'
import { lightHalos } from './haze'
import { landscape } from './landscape'
import { textured } from './surfaces'
import { glazing, interiorLight } from './atrium'

const amber = 0xffc079

export function orchard() {
  const root = new Group()
  const radius = 26
  const angle = (t: number) => -.46 + t * 2.28
  const around = (t: number,y: number,offset = 0): Point => {
    const a = angle(t)
    return [-13 + (radius+offset) * Math.sin(a), y, -4 + (radius+offset) * (1 - Math.cos(a))]
  }
  batch(root,[patch((u,v) => around(u,.11+8.22*v),280,60)],glazing(),'Transmissive curved inner glazing')
  const slab = []
  const glow = []
  for (const y of [.11,2.69,5.35,7.99]) {
    slab.push(patch((u,v)=>around(u,y+.20*v,-.24*Math.sin(v*Math.PI)),314,18))
    slab.push(patch((u,v)=>around(u,y+.08,v*3.4),260,14))
    if (y > 1) {
      glow.push(patch((u,v)=>around(u,y-.22+v*.039,.18),240,9))
      glow.push(patch((u,v)=>around(u,y-.33+v*.038,1.7),240,8))
    }
  }
  batch(root,slab,textured(finish(0xadb8c1,.38,.64),97,'metal',.015),'Four rolled anodized bands')
  batch(root,glow,finish(amber,.36,.17,0xffb866,3.7),'Warm continuous interior ceiling rings')

  const chassis = []
  const partitions = []
  for (let i = 0; i <= 48; i++) {
    const u = i / 48
    chassis.push(capsule(around(u,.07,.035),around(u,8.13,.035),.031,12,20))
    if (i % 4 === 0) chassis.push(capsule(around(u,.1,2.08),around(u,8.03,2.08),.14,20,14))
    for (let k = 0; k < 3; k++) {
      if ((i + 2 * k) % 5 > 2) {
        const y = .23 + k * 2.63
        partitions.push(facade(around(u,y,3.2),around(u+.017,y,3.2),around(u,y+2.26,3.2),18,16))
      }
    }
  }
  batch(root,chassis,finish(0x343b42,.47,.48),'Glazing mullions and structural columns in depth')
  batch(root,partitions,finish(0x54473d,.76,.07,0x6d451f,.38),'Warm room partitions behind glazing')
  const doors = [.62,.636,.652,.668,.684].map(u => capsule(around(u,0,-.09),around(u,2.53,-.09),.039,42,28))
  batch(root,doors,finish(0x675444,.37,.7),'Bronze gallery entrance framing')
  for (const u of [.38,.54,.64,.76,.91]) {
    const [x,y,z] = around(u,2.12,1.12)
    interiorLight(root,x,y,z,62)
  }

  const trees = [
    [-6.04,15.3,6.1],[-10.8,4.3,3.85],[-6.2,1.2,4.17],[-2.6,1.55,3.47],[.72,-1,4.3],
    [4.4,1,3.03],[9.8,2.8,3.14],[-12.7,1,3.63],[-14.1,-1.6,3.62],[-3.4,-4.6,3.65],
    [15.6,11.2,3.8],[15.8,17.7,3.3],[-4.95,-5.1,2.9],
  ] as const
  const beds: Point[] = [[-.62,1.15,14.9],[-.19,1.18,12.3],[.88,1.25,10.3],[1.15,1.25,7.55],
    [-.46,1.25,4.03],[8.9,1.39,14.1],[8.2,1.28,10],[7.1,1.18,8.4],[8.3,1.34,17.3],[2.15,1.0,15.95],[6.6,1.55,18.7]]
  landscape(root,trees,beds,[[4.5,.68,16],[4.75,.64,12],[4.5,.63,8],[4.2,.63,4],
    [7.86,.64,13],[8.27,.59,16]],6722)
  batch(root,[ribbon(Array.from({length:65},(_,i)=> {
    const a = i / 64 * Math.PI * 2
    return [-5.9+7.65*Math.cos(a), .032, 8.2+5.55*Math.sin(a)] as Point
  }),.066,292,25)],finish(0x57524a,.86,.04),'Oval pond masonry lip')

  batch(root,[ribbon([[-8.6,0,17.3],[-6.2,3.2,15.8],[-4.3,5.4,12.8],
    [-2.9,6.3,10.46]],.28,126,45)],textured(finish(0x342a24,.84,.07),674,'wood',.033),
    'Foreground trunk framing the courtyard')
  const moon = new MeshBasicNodeMaterial({fog:false})
  moon.colorNode = mix(color('#aab4c0'),color('#ecf5ff').mul(2.4),
    sin(uv().x.mul(29).add(sin(uv().y.mul(38)).mul(1.4))).mul(.16).add(.82))
  batch(root,[new SphereGeometry(.85,128,72).translate(-10.8,23.7,-40)],moon,'Moon disk')
  lightHalos(root,[[-5.15,22.0,-39.13]],3.15,'#9fb8d3',.26)
  return root
}
