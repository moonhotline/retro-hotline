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
  const eclipseEdge=p.sub(vec2(.1,.65)).length().sub(4.97).abs()
  const visible=smoothstep(3.15,5.35,positionLocal.z)
  const flareCenter = vec2(3.68,4.09)
  const flareDelta = p.sub(flareCenter)
  const flareDist = flareDelta.length()
  const rays = flareDelta.x.sub(flareDelta.y.mul(.55)).abs().mul(24).negate().exp()
  const flare = flareDist.mul(4.6).negate().exp().mul(35)
    .add(rays.mul(flareDist.mul(.94).negate().exp()).mul(3.1))
  const azimuth = p.sub(vec2(.1,.65)).normalize()
  const activity = azimuth.dot(vec2(-.71,-.71)).max(0).pow(8).mul(1.11).add(.45)
  const prominence = eclipseEdge.mul(azimuth.y.abs().mul(3).add(3.2)).negate().exp().mul(activity).mul(3.25)
  const glow = eclipseEdge.mul(25).negate().exp().mul(8.5).add(prominence)
  const cell = uv().mul(vec2(367,177)).fract().sub(.5).length()
  const dots = smoothstep(.13,.30,cell).oneMinus()
  const pixels = dots.mul(.91).add(.08)
  material.colorNode = color('#110e22').add(color('#8b82ee').mul(dots).mul(.82))
    .add(color('#ff6513').mul(glow.add(flare)).mul(visible).mul(pixels))
    .add(color('#fff4ce').mul(flareDist.mul(12).negate().exp()).mul(visible).mul(44))
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
  const bollards=[], diffusers=[], skyline=[], crowns=[]
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
      const h=2.48+i%4*1.78
      skyline.push(facade([x-width,0,z],[x+width,0,z],[x-width,h,z],42,60),
        facade([x-width,0,z],[x-width,0,z-3],[x-width,h,z],25,44))
      if (i % 2 === 0) crowns.push(capsule([x-width,h,z],[x+width,h,z],.023,62,23))
    }
  }
  batch(root,bollards,finish(0x252324,.47,.60),'Plaza path bollards')
  batch(root,diffusers,finish(0xf8ab63,.31,.22,0xffa440,3.9),'Amber pedestrian lamps')
  batch(root,crowns,finish(0xe7a164,.44,.43,0xcd6e39,1.2),'Warm skyline cornice lights')
  batch(root,skyline,glassTower(),'Distant city skyline at each plaza entrance')
  lightHalos(root,[[3.68,10.77,5.96]],1.48,'#fa7032',.33)
  point(root,0xe6a46b,35,13,[-5,1.65,8.16])
  point(root,0xd18449,31,14,[6.4,1.8,8.34])
  return root
}
