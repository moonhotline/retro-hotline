import { Group, PointLight } from 'three/webgpu'
import { batch, capsule, finish, patch, ribbon, type Point } from './geometry'
import { landscape } from './landscape'
import { textured } from './surfaces'
import { publicAtrium } from './atrium'

export function bayView() {
  const root = new Group()
  const roof = (x: number,z: number) => {
    const peak = (cx:number,cz:number,strength:number,width:number) =>
      strength * Math.exp(-Math.sqrt(((x-cx)/width)**2+((z-cz)/7.6)**2)*1.68)
    return 4.35 + peak(4.55,-3.4,8.25,12) + peak(-10.9,-6.8,4.85,8) - Math.max(0,z-1)*.078
  }
  const shell = patch((u,v)=>{
    const x=-18+u*36
    const z=4.9-v*22
    return [x,roof(x,z)-.05,z]
  },264,148)
  batch(root,[shell],textured(finish(0x93a5b8,.42,.68),731,'metal',.026),'Curved canopy deck')
  const courses = [[],[],[]] as ReturnType<typeof patch>[][]
  for (let row=0;row<44;row++) {
    for (let col=-1;col<73;col++) {
      const x0=-18+(col+(row%2)*.5)*.5
      const z0=4.91-row*.50
      if (x0 < -18.41 || x0 > 17.8) continue
      courses[(row+col+3)%3]!.push(patch((u,v)=>{
        const x = x0 + u*.484
        const z = z0 - v*.63 - .102*Math.sin(Math.PI*u)*(1-v)
        const lip=.028+.062*Math.pow(1-v,2)*Math.sin(u*Math.PI)
        return [x,roof(x,z)+lip,z]
      },5,5))
    }
  }
  courses.forEach((tiles,i)=>{
    batch(root,tiles,finish([0x708aa8,0x8da0b9,0x657e9d][i]!, .30+i*.034,.65),'Overlapping scalloped photovoltaic scales')
  })
  batch(root,[ribbon(Array.from({length:85},(_,i)=>{
    const x=-18+36*i/84
    return [x,roof(x,4.91)-.1,4.91] as Point
  }),.12,272,43)],finish(0xbfc1c5,.37,.63),'Silver rolled front eave')
  const soffit = []
  for (let i=0;i<46;i++) {
    const x = -17.6+i*.78
    soffit.push(ribbon(Array.from({length:12},(_,j)=>{
      const z=4.81-j*1.55
      return [x,roof(x,z)-.24,z] as Point
    }),.053,43,14))
  }
  batch(root,soffit,textured(finish(0xa87548,.55,.12),17,'wood',.039),'Warm timber soffit ribs')
  const header = patch((u,v) => {
    const x = -17.9+35.8*u
    return [x,roof(x,4.94)-.25+v*.20,4.965]
  },244,27)
  batch(root,[header],textured(finish(0xa5a1a0,.45,.54),42,'metal',.022),'Continuous curved fascia and gutter')
  const eaveLight = new PointLight(0xffbd75,62,12,2)
  eaveLight.position.set(3.1,3.8,4.19)
  root.add(eaveLight)
  publicAtrium(root,15.25,3.15,x=>roof(x,3.15)-.19,true)
  batch(root,[-13,-8,-3.9,5.1,10.8,15.0].map(x=>
    capsule([x-1.06,.06,3.81],[x+1.05,roof(x,3.6)-.25,3.63],.145,46,38)),
      finish(0xc2c5c0,.38,.36),'Raked canopy posts')
  landscape(root,[[-7.8,15.3,5.7],[-15,6,4.6],[-11.8,-3,4.5],[12.7,5.3,4.1],
    [16.8,14,4.2],[18,3.9,3.4],[8.36,-3,2.65],[-8.9,-6,3.2]],
    [[-5.1,1.21,15.8],[-4,1.17,13.6],[-3.8,1.13,10.5],[-4.2,1.04,7.2],
    [4.46,1.07,14],[5.3,1.1,12.8],[4.15,1.29,10.5],[4.88,.86,7.2],[3.33,1.28,17.1],[-4.3,1.5,18.5]],
    [[-3.76,.66,15.2],[-3.74,.6,11.75],[-3.21,.6,8.1],[2.9,.56,8.1],[3.5,.61,11.75]],333)
  return root
}
