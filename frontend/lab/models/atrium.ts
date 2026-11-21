import { DoubleSide, Group, MeshStandardNodeMaterial, PointLight } from 'three/webgpu'
import { color, mix, smoothstep, uv } from 'three/tsl'
import { batch, capsule, facade, finish, patch, strut } from './geometry'
import { textured } from './surfaces'

const amber = 0xffc079

export function glazing() {
  const glass = new MeshStandardNodeMaterial({
    metalness: 0.24, roughness: 0.17, transparent: true, opacity: .25,
    side: DoubleSide, depthWrite: false,
  })
  const frame = smoothstep(0.475,0.492,uv().x.mul(31).fract().sub(.5).abs())
  glass.colorNode = mix(color('#6f8e9c'),color('#161c20'),frame)
  return glass
}

export function interiorLight(root: Group, x: number, y: number, z: number, intensity = 72) {
  const light = new PointLight(amber,intensity,13,2)
  light.position.set(x,y,z)
  root.add(light)
}

export function publicAtrium(root: Group, span: number, front: number, height: (x: number)=>number, wood: boolean) {
  const panes = [
    patch((u,v) => { const x = (u * 2 - 1) * span; return [x,v*height(x),front] }, 194, 66),
    facade([-span,0,front],[-span,0,front-11],[-span,5.2,front],55,50),
    facade([span,0,front],[span,0,front-11],[span,5.2,front],55,50),
  ]
  batch(root,panes,glazing(),'Exterior glazing with visible floor plates behind')
  const bars = []
  const frame = []
  for (let x = -span; x <= span; x += 1.12) {
    bars.push(strut([x,0,front+.04],[x,height(x),front+.04],.027,.033,24,16))
    if (Math.abs(x) > 3) frame.push(capsule([x,0,front-4],[x+.41,height(x)-.55,front-3],.13,24,16))
  }
  for (const x of [-2.85,-1.45,-.02,1.42,2.84]) {
    bars.push(strut([x,0,front+.59],[x,3.13,front+.59],.055,.06,34,28))
  }
  bars.push(strut([-2.85,3.13,front+.59],[2.84,3.13,front+.59],.055,.115,62,40))
  batch(root,bars,finish(0x2b2927,.41,.65),'Door jambs and glazing mullions')
  batch(root,frame,finish(wood?0xc2a486:0x4b5355,.42,.47),'Inner frame visible through glazing')
  const slabs = []
  const lines = []
  const inner = wood ? [.35,3.30] : [.35,2.76,5.35]
  for (const y of inner) {
    for (const side of [-1,1]) {
      const x = side * 3.3
      slabs.push(facade([x,y,front-.76],[side*span,y,front-.76],[x,y,front-12],58,42))
      slabs.push(facade([x,y,front-.77],[side*span,y,front-.77],[x,y+.20,front-.77],52,16))
      lines.push(capsule([x,y+.23,front-.66],[side*span,y+.23,front-.66],.028,38,26))
      lines.push(capsule([side*(span-1),y+.24,front-2],[side*(span-1),y+.24,front-12],.019,30,25))
    }
  }
  batch(root,slabs,textured(finish(wood?0xbd9873:0xa29380,.57,.14),58,wood?'wood':'stone',.04),'Visible mezzanine slabs and soffits')
  batch(root,lines,finish(0xfcc582,.3,.1,0xffb96d,3.4),'Recessed amber mezzanine light lines')
  const details = []
  const glazingLights = []
  const ledNoses = []
  for (const side of [-1,1]) {
    for (let i = 0; i < 9; i++) {
      const x = side * (3.7 + i * (span - 4.8) / 8)
      const z = front - 3.4 - i % 3 * 1.64
      const height = wood ? .67 : .73
      if (wood) {
        details.push(strut([x-.42,height,z],[x+.43,height,z],.47,.045,23,18))
        details.push(capsule([x,.04,z],[x,height-.05,z],.092,20,13))
        details.push(strut([x-.28,.39,z-.74],[x+.28,.39,z-.74],.27,.08,24,16))
      } else {
        details.push(strut([x-.42,.36,z],[x+.43,.36,z],.36,.30,24,12))
        details.push(strut([x-.49,3.06,z-.86],[x+.48,3.06,z-.86],.34,.20,24,12))
      }
      glazingLights.push(capsule([x-.26,wood ? 3.65 : 5.26,front-1.55],
        [x+.26,wood ? 3.65 : 5.26,front-1.55],.035,24,20))
    }
  }
  batch(root,details,finish(wood ? 0x786746 : 0x68615a,.54,.19),
    wood ? 'Timber cafe tables and bench seating' : 'Terraced interior planter bases')
  batch(root,glazingLights,finish(0xf5b977,.37,.24,0xffc387,3.4),'Suspended lights behind the entrance glazing')

  const stairs = []
  for (let i = 0; i < 17; i++) {
    const z=front-2.8-i*.36
    const y = .13 + i * .143
    stairs.push(strut([-2.14,y,z],[2.14,y,z],.19,.08,28,22))
    if (!wood) ledNoses.push(capsule([-2.13,y+.039,z+.164],[2.13,y+.039,z+.164],.012,19,17))
  }
  if (ledNoses.length) batch(root,ledNoses,finish(0xeac38d,.44,.16,0xffc683,1.8),'Soft lighting along each stair nosing')
  batch(root,stairs,finish(0xbda28a,.44,.11,0x9e5f2a,.26),'Broad central interior stair')
  for (const x of [-7,-3,3,7]) interiorLight(root,x,2.6,front-1.9,62)
  for (const x of [-7.3,0,7.3]) interiorLight(root,x,5.0,front-5.8,38)
}
