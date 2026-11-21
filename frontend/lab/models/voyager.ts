import { Group, PointLight } from 'three/webgpu'
import { batch, finish, plating, ribbon, strut, type Point } from './geometry'
import { landscape } from './landscape'
import { industrialSurface, textured } from './surfaces'
import { publicAtrium } from './atrium'

export function voyager() {
  const root = new Group()
  const left:Point=[-18,12.15,4.25]
  const tip:Point=[4.25,4.15,6.35]
  const right:Point=[17.1,12.2,2.39]
  const ridge:Point=[.7,10.54,-7.45]
  const hinge:Point=[1.4,10.79,1.8]
  const rear:Point=[16.3,9.8,-14.4]
  const platingMaterial = industrialSurface('#333a43','#5d6269',455,.67)
  batch(root,[plating([left,tip,hinge,ridge],.42,28),
    plating([tip,right,ridge,hinge],.53,30), plating([right,rear,ridge],.42,28)],
    platingMaterial,'Three folded roof plates with fascia thickness')
  const junction:Point=[4.75,.025,5.91]
  batch(root,[plating([tip,[8.2,7.10,4.65],[5.9,.04,4.52],junction],.34,28),
    plating([left,[-12.8,9.75,.95],[-14.55,.04,1.08],[-15.75,.04,2.65]],.30,28)],
    textured(finish(0x4c4b45,.49,.67),118,'metal',.026),'Folded plate extensions to concrete plinth')
  batch(root,[ribbon([[-17.97,11.97,4.38],[-6.85,8.1,5.41],[4.23,4.03,6.44],
    [4.74,.19,5.99]],.052,208,36)],
  finish(0xc6ee35,.29,.29,0xaaff00,3.3),'Continuous acid green eave and entry edge')
  const lime = new PointLight(0xbafe15,32,9.5,2)
  lime.position.set(4.61,.48,6)
  root.add(lime)
  publicAtrium(root,15.2,2.65,x=>5.6+Math.abs(x-2.6)*.22,false)
  const diagrid = []
  for (let i=0;i<10;i++) {
    const x=-15+i*3.1
    const top=6.15+Math.abs(x-3)*.21
    diagrid.push(strut([x,.15,1.1],[x+3,top,1.15],.075,.087,48,29),
      strut([x,top,1.24],[x+3,.16,1.25],.067,.079,48,29))
    diagrid.push(strut([x,top,-3],[x+3,top-.40,-8.2],.076,.08,42,24))
  }
  batch(root,diagrid,finish(0x373f41,.44,.58),'Exposed triangular atrium and roof framing')
  const planters = [-1,1].map(side => ribbon([[side*3.05,.22,19],[side*4.9,.22,11.6],
    [side*7.9,.22,5.7],[side*12.2,.22,4.81]],.235,118,46))
  batch(root,planters,textured(finish(0x666364,.75,.07),801,'stone',.046),'Curved concrete planters')
  landscape(root,[[-11.1,12.4,6.39],[-13.7,4.6,4.0],[9.1,7.4,2.6],[11.7,3.6,3.4],[14.2,5,3.8],
    [16.2,11.4,4.6],[-9.1,5.39,2.9]],
    [[-5.6,1.18,15.7],[-6.2,1.2,13],[-7,1.05,10.4],[-10.5,1.31,7.4],
    [6.6,1.06,12.4],[9.4,1.3,8.2],[12.0,1.4,7.2]],
    [[-4.09,.62,16.55],[-5.4,.64,12.8],[-6.45,.63,9.55],[5.3,.62,13.6],[6.92,.61,9.2]],464)
  return root
}
