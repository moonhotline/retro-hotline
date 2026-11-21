import { DoubleSide, Group, MeshStandardNodeMaterial } from 'three/webgpu'
import { color, mix, positionWorld, smoothstep } from 'three/tsl'
import { batch, capsule, facade, finish, ribbon, strut } from './geometry'
import { driftingHaze, lightHalos } from './haze'
import { industrialSurface, textured } from './surfaces'
import { point } from './cityDetails'

export function docks() {
  const root = new Group()
  const wall=industrialSurface('#292c2c','#535149',141,.07)
  const door=industrialSurface('#5b3b1a','#8c6235',827,.64)
  const safety=textured(finish(0xac6928,.52,.46),861,'metal',.027)
  const gantry=industrialSurface('#303136','#60513e',136,.52)
  const ceiling=[]
  const grating=[]
  batch(root,[
    facade([-8.6,0,24],[-8.6,0,-12],[-8.6,12.1,24]),
    facade([8.4,0,-12],[8.4,0,24],[8.4,12.1,-12]),
    facade([-8.6,11.85,22],[8.4,11.85,22],[-8.6,11.85,-3.65]),
    facade([-8.6,11.85,-8.3],[8.4,11.85,-8.3],[-8.6,11.85,-13.9]),
  ],wall,'Cast concrete loading hall and sky opening')
  for(let i=0;i<7;i++){
    const x=-7.52+i*2.51
    ceiling.push(strut([x,11.35,17],[x,11.35,-12.8],.17,.32,48,27))
  }
  for(let i=0;i<23;i++){
    const z=-8.17+i*.21
    grating.push(strut([-7.95,11.56,z],[8.05,11.56,z],.04,.060,15,14))
  }
  for(let i=0;i<40;i++){
    const x=-7.9+i*.4
    grating.push(strut([x,11.56,-8.17],[x,11.56,-3.52],.026,.054,14,14))
  }
  batch(root,ceiling,gantry,'Deep structural ceiling beams')
  batch(root,grating,safety,'Rectangular ceiling grating bars')
  batch(root,[facade([-8,11.95,-8.19],[8,11.95,-8.19],[-8,11.95,-3.60])],
    finish(0xffbe77,.47,.06,0xff9a35,5),'Amber light visible through the grating')

  batch(root,[facade([-7.85,5.15,-9.55],[7.85,5.15,-9.55],[-7.85,11.36,-9.55],154,83),
    facade([-7.85,5.15,-9.55],[7.85,5.15,-9.55],[-7.85,5.15,-9.88],84,68)],door,
    'Half-open steel loading door with physical thickness')
  const ribs=[]
  for(const y of [5.21,5.62,7.48,9.35,11.17]){
    ribs.push(strut([-7.91,y,-9.42],[7.91,y,-9.42],.13,.105,66,25))
  }
  for(const x of [-7.9,-4.2,-.38,3.62,7.89]){
    ribs.push(strut([x,5.15,-9.37],[x,11.4,-9.37],.095,.123,44,26))
    if(x<6) ribs.push(strut([x,7.45,-9.42],[x+3.5,9.32,-9.42],.077,.11,39,24))
  }
  for(const x of [-8.03,8.03]){
    for(const dx of [-.21,.21]) ribs.push(strut([x+dx,.05,-9.23],[x+dx,11.53,-9.23],.114,.13,60,30))
  }
  batch(root,ribs,gantry,'Raised door channels, transverse ribs and diagonal gussets')
  const hazard = new MeshStandardNodeMaterial({roughness:.55,metalness:.30,side:DoubleSide})
  const slash=positionWorld.x.mul(.92).add(positionWorld.y.mul(.81)).fract()
  hazard.colorNode=mix(color('#191d1e'),color('#c18935'),smoothstep(.48,.54,slash))
  batch(root,[facade([-7.74,5.21,-9.29],[7.74,5.21,-9.29],[-7.74,5.79,-9.29]),
    facade([7.15,.14,-7.38],[8.15,.14,-7.38],[7.15,.81,-7.38],65,40)],hazard,'Chipped diagonal caution striping')
  const mezz=[]
  const rail=[]
  for(let i=0;i<17;i++){
    const z=-.7-i*.32
    const y=.52+i*.18
    mezz.push(strut([-7.99,y,z],[-6.15,y,z],.174,.066,35,22))
    if (i%4===0) rail.push(capsule([-6.14,y,z],[-6.14,y+.98,z],.036,35,25))
  }
  for(let z=16;z>-7.9;z-=2.15) rail.push(capsule([-5.85,.48,z],[-5.85,1.34,z],.041,31,26))
  for(const y of [.9,1.35]) rail.push(capsule([-5.85,y,19],[-5.85,y,-.55],.046,96,35))
  rail.push(capsule([-6.14,1.5,-.62],[-6.14,4.42,-5.9],.046,94,38))
  mezz.push(strut([-8.05,.30,18],[-8.05,.30,-.8],1.07,.23,94,38),
    strut([-8.05,3.55,-5.9],[-8.05,3.55,-9.22],1.07,.21,72,25))
  batch(root,mezz,gantry,'Catwalk floor and seventeen steel stair treads')
  batch(root,rail,safety,'Continuous ochre guardrails')
  batch(root,[facade([-8.54,4.89,-3.88],[-8.54,4.89,-7.86],[-8.54,6.37,-3.88])],
    finish(0x446677,.31,.53,0x37698a,.95),'Blue inspection room window')
  const pipes=[]
  for(const x of [7.55,7.79,8.02]){
    pipes.push(ribbon([[x,.56,-6.9],[x,3.51,-6.9],[x,4.53,-6.91],
      [x,5.09,-5.99],[x,7.35,-5.79],[x,11.48,-5.79]],.075,85,27))
  }
  pipes.push(strut([7.93,1.45,-7.31],[7.93,1.45,-5.93],.34,1.21,85,66))
  batch(root,pipes,industrialSurface('#35444a','#4c6369',387,.62),'Upper routed conduits and switchgear cabinet')
  batch(root,[capsule([7.57,2.43,-7.26],[7.57,2.43,-5.97],.044,80,66)],
    finish(0x35cddf,.31,.28,0x33def7,4.6),'Cyan terminal emission')
  const freight=[]
  for(let i=0;i<18;i++){
    const side=i%2===0?-1:1
    const row=Math.floor(i/2)
    const x=side*(5.0+row%3*1.75)
    const z=-14.8-row*2.46
    freight.push(strut([x,1.13,z],[x,1.13,z-4.7],.89,1.13,35,29))
    if(i%4===0) freight.push(strut([x,3.25,z],[x,3.25,z-4.7],.89,1.02,37,24))
  }
  batch(root,freight,industrialSurface('#263847','#64432e',222,.52),'Container stacks visible below the door')
  const crane=[]
  for(const x of [-5,7.5]){
    for(const z of [-32,-47]){
      crane.push(strut([x,0,z],[x,11.8,z],.23,.28,51,23))
      crane.push(strut([x,11.7,z],[x+9.5,11.7,z],.16,.22,62,25))
      crane.push(strut([x,16.7,z],[x+7.3,11.9,z],.085,.087,34,17))
      crane.push(strut([x,11.5,z],[x,16.9,z],.11,.12,32,19))
    }
  }
  batch(root,crane,finish(0x25333c,.70,.44),'Distant dockside cargo cranes')
  point(root,0xff8432,260,20,[-3.5,7.44,-6])
  point(root,0xffab5f,65,10,[-8.17,3.9,2.8])
  point(root,0x32c4ec,82,11,[7.11,2.41,-6.62])
  point(root,0x7197cb,320,27,[-4.3,7.7,-22])
  lightHalos(root,[[-7.96,3.9,2.88]],.64,'#ffaa5d',.24)
  driftingHaze(root,[[-4.8,2.6,-25],[2.7,3,-35],[.6,4,-45]],'#6d889c',8.5,4.2)
  return root
}
