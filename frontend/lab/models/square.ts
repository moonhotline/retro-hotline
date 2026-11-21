import { DoubleSide, Group, MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import { color, mix, sin, smoothstep, uv } from 'three/tsl'
import { batch, capsule, facade, finish, patch, ribbon, strut, type Point } from './geometry'
import { driftingHaze, lightHalos } from './haze'
import { seeded, textured } from './surfaces'
import { glassTower, point } from './cityDetails'

export function square() {
  const root = new Group()
  const towers = []
  const signs = []
  const storefront = []
  const storefrontFrames = []
  const parapets = []
  const windowMaterial=glassTower()
  const screen = new MeshBasicNodeMaterial({side:DoubleSide})
  const cross = uv().x.sub(uv().y.sub(.5).mul(uv().y.sub(.5)).mul(.83)).add(.21)
  const white = smoothstep(.422,.430,cross).mul(smoothstep(.645,.654,cross).oneMinus())
  const dimRed = sin(cross.mul(24)).mul(.20).add(.79)
  const led = sin(uv().x.mul(652)).mul(sin(uv().y.mul(327))).mul(.075).add(.94)
  screen.colorNode = mix(color('#b91333').mul(dimRed),color('#ffd9ca').mul(2.6),white).mul(led)
  for (const side of [-1, 1]) {
    for (let i=0;i<8;i++) {
      const z=14-i*9.1
      const inner=side*(6.85 +(i%3)*.72 + (side>0?.84:0))
      const farX=inner+side*(6+(i%2)*2.3)
      const h=16.3+(i*17%20)+(side>0?5:0)
      const end = z-8.9
      const thick = .38 + i%3*.29
      towers.push(facade([inner,3.7,z],[inner,3.7,end],[inner,h,z],41,45),
        facade([inner,0,z],[farX,0,z],[inner,h,z],32,34),
        facade([farX,0,z],[farX,0,end],[farX,h,z],24,29),
        facade([inner,h,z],[farX,h,z],[inner,h,end],20,24))
      storefront.push(facade([inner-side*.16,0,z-.14],[inner-side*.16,0,end+.11],
        [inner-side*.16,3.65,z-.14],32,34))
      const frameX=inner-side*.18
      for (let j=0;j<=6;j++) {
        const frameZ=z-.18-j*1.42
        storefrontFrames.push(capsule([frameX,.02,frameZ],[frameX,3.64,frameZ],.026,16,16))
      }
      storefrontFrames.push(capsule([frameX,2.61,z],[frameX,2.61,end],.047,34,15))
      parapets.push(strut([inner-side*.2,3.6,z],[inner-side*.2,3.6,end],thick*.45,.11,31,28))
      if (i>0 && i<5) {
        const x=inner-side*.36
        const y=5.06 + i*.35
        signs.push(patch((u,v)=>[x-side*Math.sin(Math.PI*u)*.42,y+v*(5.2 + (i%2)*3),z-.42-u*7.94],94,78))
        parapets.push(strut([x,y-.11,z-.39],[x,y-.11,z-8.4],.125,.105,29,24))
      }
    }
  }
  const towerX=1.85
  towers.push(facade([towerX-2.05,0,-28],[towerX+2.05,0,-28],[towerX-2.05,28,-28],88,68))
  const floorSpans=[[3.5,10.3],[10.68,17.8],[18.15,24.72]] as const
  for (const [lo,hi] of floorSpans) {
    signs.push(facade([towerX-1.47,lo,-27.86],[towerX+1.47,lo,-27.86],
      [towerX-1.47,hi,-27.86],92,68))
  }
  batch(root,[capsule([.48,3.9,-27.75],[.48,8.0,-27.75],.042,60,49),
    capsule([3.24,19.1,-27.75],[3.24,23.8,-27.75],.047,60,49)],
  finish(0x31ade8,.25,.32,0x4fdcff,4.6),'Blue vertical wayfinding lights')
  batch(root,towers,windowMaterial,'Layered office blocks with lit interiors')
  batch(root,storefront,glassTower(),'Dark storefront glass with warm interior cells')
  batch(root,storefrontFrames,finish(0x29252b,.43,.63),'Shopfront glazing frames and transoms')
  batch(root,signs,screen,'Curved side screens and three-part central LED display')
  batch(root,parapets,finish(0x29343c,.55,.65),'Billboard casings and lower lintels')

  const stair = [], red = [], rail = []
  const left=-8.25
  for (let i=0;i<10;i++) {
    const x=left + (9-i)*.48
    const y=.165 + i*.178
    stair.push(strut([x,y-.135,21.1],[x,y-.135,2.6],.193,.105,43,31))
    red.push(facade([x+.20,y-.092,21.1],[x+.20,y-.092,2.6],[x+.20,y+.012,21.1],34,24))
  }
  batch(root,stair,textured(finish(0x5e252d,.42,.35),961,'stone',.043),'Treads of the red staircase')
  batch(root,red,finish(0xda2443,.28,.3,0xff0429,3.1),'Inlaid red stair risers')
  for (const z of [17.3,14.9,12.2,9.7,7.2,4.7,2.4]) {
    rail.push(capsule([-5.09,.15,z],[-5.09,1.27,z],.027,29,24))
  }
  for (const y of [.40,1.29]) rail.push(capsule([-5.09,y,17.2],[-5.09,y,2.37],.041,114,38))
  batch(root,rail,finish(0x818a92,.24,.71),'Steel stair handrails')
  const glass = new MeshStandardNodeMaterial({ color:0x8fa2ad,roughness:.24,metalness:.34,
    transparent:true,opacity:.22,side:DoubleSide,depthWrite:false })
  batch(root,[facade([-5.09,.25,17.2],[-5.09,.25,2.4],[-5.09,1.21,17.2])],glass,'Glazed balustrade')
  const poles = []
  const filaments = []
  const streetLamps: Point[] = []
  for (const side of [-1,1]) {
    for (const z of [13,2,-9,-21,-36]) {
      const x = side * 5.93
      const end = x - side * .91
      poles.push(ribbon([[x,.02,z],[x,3.9,z],[x,4.89,z],[end,5.29,z]],.039,49,22))
      filaments.push(capsule([end-.11,5.22,z],[end+.11,5.22,z],.058,26,22))
      streetLamps.push([end,5.22,z+.11])
    }
  }
  batch(root,poles,finish(0x282a27,.48,.71),'Street lighting with curved rain-wet standards')
  batch(root,filaments,finish(0xe5c0a2,.31,.22,0xffbd84,4.4),'Warm sodium street fixtures')
  lightHalos(root,streetLamps,.52,'#f8c58f',.25)
  point(root,0xffb37e,39,11,[4.91,4.94,13])
  point(root,0xfec481,22,9,[-5,4.94,2])
  const posts=[]
  for(const z of [18.5,14.8,10.9,6.9,2.7,-1.6,-6,-10.9,-16,-21]){
    posts.push(capsule([3.45,.01,z],[3.45,.99,z],.145,50,36))
  }
  batch(root,posts,finish(0x8b8781,.26,.83),'Wet stainless steel bollards')
  point(root,0xf52137,52,13,[-3.9,.9,12])
  point(root,0xff5067,140,21,[2.3,4.5,-25])
  point(root,0x5b93de,100,24,[6.1,2.4,2])

  const rain=new MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:DoubleSide,opacity:.29})
  rain.colorNode=color('#9cb4ce')
  const rng=seeded(790)
  const streaks=[]
  for(let i=0;i<780;i++) {
    const x=(rng()-.5)*21
    const z=12-rng()*50
    const y=rng()*24
    streaks.push(patch((u,v)=>[x+(u-.5)*.010-v*.045,y-v*.49,z],3,3))
  }
  batch(root,streaks,rain,'Fine rain in world space')
  driftingHaze(root,[[-6,1.65,-3],[6,2,-13],[-5.4,2.1,-19],[4,2.7,-26],[1.1,1.8,-36]],'#6e879b',3.65,2.2)
  return root
}
