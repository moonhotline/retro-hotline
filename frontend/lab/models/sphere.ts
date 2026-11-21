import { DoubleSide, Group, MeshBasicNodeMaterial, MeshStandardNodeMaterial, SphereGeometry } from 'three/webgpu'
import { color, positionLocal, smoothstep, uv, vec2 } from 'three/tsl'
import { batch, capsule, facade, finish, patch, ribbon, type Point } from './geometry'
import { lightHalos } from './haze'
import { glassTower, point } from './cityDetails'

function podium(radius:number,y:number,height:number) {
  return patch((u,v)=>{
    const a=u * Math.PI * 2
    return [Math.sin(a)*radius,y+v*height,Math.cos(a)*radius]
  },304,28)
}

export function sphere() {
  const root = new Group()
  const material = new MeshBasicNodeMaterial()
  const p=positionLocal.xy
  const eclipseEdge=p.sub(vec2(.1,.65)).length().sub(5.84).abs()
  const visible=smoothstep(2.95,5.12,positionLocal.z)
  const flareDist=p.sub(vec2(4.34,4.60)).length()
  const rays=p.x.sub(4.34).sub(p.y.sub(4.60).mul(.55)).abs().mul(12).negate().exp()
  const flare=flareDist.mul(2.75).negate().exp().mul(63).add(rays.mul(flareDist.mul(.9).negate().exp()).mul(1.75))
  const glow=eclipseEdge.mul(11).negate().exp().mul(11.5).add(eclipseEdge.mul(3.4).negate().exp().mul(1.2))
  const cell=uv().mul(vec2(415,194)).fract().sub(.5).length()
  const dots=smoothstep(.14,.29,cell).oneMinus()
  const corona=glow.add(flare).mul(visible)
  material.colorNode = color('#130d24').add(color('#8a6eff').mul(dots).mul(.82))
    .add(color('#ff6c17').mul(corona).mul(dots.mul(.87).add(.14)))
  const globe=batch(root,[new SphereGeometry(8.15,438,242,.0,Math.PI*2,0,Math.PI*.717)],material,'Pixel-resolved eclipse exosphere')
  globe.position.y=6.68
  batch(root,[podium(8.87,1.18,.44)],finish(0x3e332c,.32,.62),'Continuous dark podium cornice')
  batch(root,[podium(8.90,1.22,.052)],finish(0xffc477,.4,.22,0xffa13b,4.4),'Continuous amber podium girt')
  const glass=new MeshStandardNodeMaterial({color:0x6f5b4b,roughness:.24,metalness:.31,
    transparent:true,opacity:.38,depthWrite:false,side:DoubleSide})
  batch(root,[podium(8.57,.05,1.25)],glass,'Glazed concourse at base of exosphere')
  const ribs=[]
  const glowRings=[]
  for(let i=0;i<54;i++){
    const a=i/54*Math.PI*2
    const x=Math.cos(a)*8.56,z=Math.sin(a)*8.56
    ribs.push(capsule([x,.04,z],[x,1.24,z],.021,13,19))
  }
  for(const radius of [5.2,6.9,8.16]){
    glowRings.push(podium(radius,.94,.075))
  }
  batch(root,ribs,finish(0x585047,.47,.54),'Entry glazing mullions')
  batch(root,glowRings,finish(0xd39b66,.39,.21,0xe88830,3.8),'Entry foyer lamps and lit soffit bands')
  const inlay = [-1,1].map(side=>ribbon(Array.from({length:41},(_,i)=> {
    const a=-.83+i/40*Math.PI*1.1
    return [side*(9.1+3.5*Math.cos(a)),.005,12+7.1*Math.sin(a)] as Point
  }),.024,189,30))
  batch(root,inlay,finish(0xd5a360,.32,.43,0xe18b30,2.8),'Curving warm plaza inlay')
  const bollards=[], diffusers=[], skyline=[]
  for(const side of [-1,1]){
    for(const z of [23,19,15,11,7]) {
      const x=side*(5.3+Math.sin(z*.24)*1.3)
      bollards.push(capsule([x,.03,z],[x,.68,z],.125,33,29))
      diffusers.push(capsule([x,.56,z],[x,.69,z],.119,36,29))
    }
    for(let i=0;i<7;i++){
      const x=side*(11.8+i*4.2)
      const z=-12.4-(i%3)*3.1
      const width=2.1+i%3
      const h=3.45+i%4*2.18
      skyline.push(facade([x-width,0,z],[x+width,0,z],[x-width,h,z],42,60),
        facade([x-width,0,z],[x-width,0,z-3],[x-width,h,z],25,44))
    }
  }
  batch(root,bollards,finish(0x252324,.47,.60),'Plaza path bollards')
  batch(root,diffusers,finish(0xf8ab63,.31,.22,0xffa440,3.9),'Amber pedestrian lamps')
  batch(root,skyline,glassTower(),'Distant city skyline at each plaza entrance')
  lightHalos(root,[[4.34,11.28,5.05]],1.4,'#eb6b21',.27)
  point(root,0xff9540,115,19,[-5,1.1,8.16])
  point(root,0xff7e34,139,19,[6.4,2.1,8.34])
  return root
}
