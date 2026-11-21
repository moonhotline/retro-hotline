import * as THREE from 'three'
import type { Wall } from '../map'
import type { BatchCollector } from './batchCollector'

/**
 * Architectural Prop Factory for Fabricas Branco HQ - Floor 42.
 * Directly recreates the high-end corporate shooter environment from Max Payne 3.
 *
 * All props are batched by material through BatchCollector for near-zero draw calls,
 * while automatically registering Wall bounding boxes for player cover and bullet occlusion.
 */

export interface PropContext {
  batch: BatchCollector
  collidables: THREE.Object3D[]
  walls: Wall[]
}

/**
 * Registers an axis-aligned static collision box for player cover and bullet occlusion.
 */
export function addCoverWall(
  ctx: PropContext,
  x: number,
  z: number,
  hw: number,
  hd: number,
  h: number,
  bottom = 0
): void {
  ctx.walls.push({ x, z, hw, hd, h, bottom })

  // Also add an invisible proxy mesh to collidables for raycasting/glory kills/bullet impacts
  const proxyGeo = new THREE.BoxGeometry(hw * 2, h, hd * 2)
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false })
  const proxy = new THREE.Mesh(proxyGeo, proxyMat)
  proxy.position.set(x, bottom + h * 0.5, z)
  proxy.updateMatrixWorld(true)
  ctx.collidables.push(proxy)
}

/**
 * 1. Elevator Lobby: 4 high-rise passenger elevator bays.
 * Stainless steel elevator doors with dark anodized reveals, brass frames,
 * and illuminated floor indicator beacons.
 */
export function buildElevatorBank(ctx: PropContext): void {
  const { batch } = ctx
  const elevatorZ = [-9.8, -3.6, 3.6, 9.8]
  const wallX = -28.6

  // Solid rear travertine / dark marble perimeter elevator core wall
  batch.addBox(0.8, 5.2, 38.4, 'marble_dark', wallX - 0.4, 2.6, 0, { tile: 2.2 })
  addCoverWall(ctx, wallX - 0.4, 0, 0.4, 19.2, 5.2)

  for (let i = 0; i < elevatorZ.length; i++) {
    const z = elevatorZ[i]!

    // Elevator outer casing frame (brushed steel + brass header)
    batch.addBox(0.12, 3.6, 2.8, 'brushed_steel', wallX + 0.06, 1.8, z)
    batch.addBox(0.16, 0.22, 2.84, 'brass', wallX + 0.08, 3.65, z)

    // Elevator doors (two sliding panels with center reveal)
    const doorGap = i === 1 ? 0.08 : 0.01 // Elevator 2 slightly cracked open
    batch.addBox(0.04, 3.4, 1.25, 'brushed_steel', wallX + 0.12, 1.7, z - 0.65 - doorGap * 0.5)
    batch.addBox(0.04, 3.4, 1.25, 'brushed_steel', wallX + 0.12, 1.7, z + 0.65 + doorGap * 0.5)

    // Call button panel & floor indicator LED (42º ANDAR)
    batch.addBox(0.02, 0.45, 0.18, 'anodized_dark', wallX + 0.14, 1.45, z + 1.6)
    batch.addBox(0.01, 0.08, 0.14, 'led_amber', wallX + 0.155, 3.82, z, { castShadow: false })
  }
}

/**
 * 2. Main Executive Reception Desk:
 * Curved Nero Marquina dark marble counter with Calacatta white marble waterfall edge,
 * recessed LED kickboard lighting, and administrative terminal.
 */
export function buildReceptionArea(ctx: PropContext): void {
  const { batch } = ctx
  const rx = -18.2
  const rz = 0

  // Main counter body (dark marble with brass reveal)
  batch.addBox(1.4, 1.05, 5.4, 'marble_dark', rx, 0.525, rz, { tile: 1.8 })
  // White marble top slab
  batch.addBox(1.55, 0.08, 5.6, 'marble_white', rx, 1.09, rz, { tile: 2.2 })
  // Recessed warm LED undercounter strip
  batch.addBox(1.42, 0.04, 5.3, 'led_warm', rx, 0.06, rz, { castShadow: false })

  // Receptionist work ledge & keyboard well
  batch.addBox(0.85, 0.05, 4.2, 'walnut_wood', rx - 0.25, 0.76, rz)

  // Dual thin-bezel administrative monitors
  for (const zOff of [-0.9, 0.9]) {
    // Stand & base
    batch.addBox(0.18, 0.02, 0.24, 'brushed_steel', rx - 0.2, 0.78, rz + zOff)
    batch.addBox(0.04, 0.32, 0.05, 'brushed_steel', rx - 0.2, 0.94, rz + zOff)
    // Display panel with cyan illuminated screen
    batch.addBox(0.03, 0.42, 0.75, 'anodized_dark', rx - 0.16, 1.15, rz + zOff)
    batch.addBox(0.008, 0.38, 0.71, 'led_cyan', rx - 0.14, 1.15, rz + zOff, { castShadow: false })
  }

  // Cover wall for player/enemy tactical cover
  addCoverWall(ctx, rx, rz, 0.78, 2.8, 1.12)
}

/**
 * 3. Massive Architectural Marble Columns:
 * High-load fluted columns separating the lobby, bullpen, and executive levels.
 */
export function buildMarbleColumns(ctx: PropContext): void {
  const { batch } = ctx
  const colX = [-10.2, -2.2, 5.8]
  const colZ = [-8.0, 8.0]

  for (const x of colX) {
    for (const z of colZ) {
      // Main column shaft: polished Calacatta white marble
      batch.addBox(1.4, 5.2, 1.4, 'marble_white', x, 2.6, z, { tile: 2.4 })

      // Plinth base: Nero Marquina dark marble
      batch.addBox(1.58, 0.32, 1.58, 'marble_dark', x, 0.16, z, { tile: 1.8 })

      // Brass architectural reveals at top and bottom
      batch.addBox(1.52, 0.06, 1.52, 'brass', x, 0.35, z)
      batch.addBox(1.52, 0.06, 1.52, 'brass', x, 4.88, z)

      // Solid cover wall
      addCoverWall(ctx, x, z, 0.79, 0.79, 5.2)
    }
  }
}

/**
 * 4. Open Office Bullpen:
 * 4-station modular workstations with acoustic fabric privacy dividers,
 * dual widescreen displays, keyboard trays, and ergonomic task chairs.
 */
export function buildWorkstations(ctx: PropContext): void {
  const { batch } = ctx
  const podPositions = [
    { x: -9.4, z: -13.0 },
    { x: -2.2, z: -13.0 },
    { x: 5.0, z: -13.0 },
    { x: -9.4, z: 12.8 },
    { x: -2.2, z: 12.8 },
    { x: 5.0, z: 12.8 },
  ]

  for (const pod of podPositions) {
    const px = pod.x
    const pz = pod.z

    // Central acoustic partition wall (travertine/drywall divider)
    batch.addBox(3.8, 1.35, 0.12, 'travertine', px, 0.675, pz, { tile: 1.5 })
    batch.addBox(0.12, 1.35, 2.6, 'travertine', px, 0.675, pz, { tile: 1.5 })

    // Desktops (dark walnut wood tops with brushed steel cable grommets)
    for (const zSign of [-1, 1]) {
      const dz = pz + zSign * 0.72
      batch.addBox(3.6, 0.06, 1.25, 'walnut_wood', px, 0.74, dz, { tile: 2.0 })

      // Brushed steel legs
      for (const lx of [px - 1.65, px + 1.65]) {
        batch.addBox(0.06, 0.72, 0.06, 'brushed_steel', lx, 0.36, dz + zSign * 0.5)
      }

      // Workstation monitors (dual screen setup per desk)
      for (const mx of [px - 0.85, px + 0.85]) {
        batch.addBox(0.16, 0.02, 0.18, 'brushed_steel', mx, 0.77, dz)
        batch.addBox(0.03, 0.28, 0.04, 'brushed_steel', mx, 0.92, dz)
        batch.addBox(0.68, 0.38, 0.03, 'anodized_dark', mx, 1.12, dz - zSign * 0.2)
        batch.addBox(0.64, 0.34, 0.008, 'led_cyan', mx, 1.12, dz - zSign * 0.185, { castShadow: false })
      }

      // Ergonomic executive task chairs
      for (const cx of [px - 0.85, px + 0.85]) {
        const chairZ = dz + zSign * 0.75
        // Five-star caster base
        batch.addCylinder(0.35, 0.35, 0.04, 10, 'brushed_steel', cx, 0.12, chairZ)
        batch.addCylinder(0.04, 0.04, 0.38, 8, 'brushed_steel', cx, 0.32, chairZ)
        // Cushion seat
        batch.addBox(0.52, 0.1, 0.48, 'leather_black', cx, 0.54, chairZ)
        // Ergonomic mesh backrest
        batch.addBox(0.48, 0.55, 0.06, 'leather_black', cx, 0.82, chairZ + zSign * 0.22)
      }
    }

    // Cover volumes for each workstation pod
    addCoverWall(ctx, px, pz, 1.95, 1.45, 1.35)
  }
}

/**
 * 5. Filing Cabinet Banks & Copy Machine Hub:
 * Heavy locking steel drawer banks and corporate multifunction copy units.
 */
export function buildFilingCabinets(ctx: PropContext): void {
  const { batch } = ctx
  const banks = [
    { x: -11.4, z: -18.0, len: 4.8 },
    { x: -4.2, z: -18.0, len: 4.8 },
    { x: -11.4, z: 18.0, len: 4.8 },
    { x: -4.2, z: 18.0, len: 4.8 },
  ]

  for (const b of banks) {
    // Metal cabinet body
    batch.addBox(b.len, 1.18, 0.72, 'brushed_steel', b.x, 0.59, b.z, { tile: 1.5 })
    // Dark top laminate
    batch.addBox(b.len + 0.06, 0.04, 0.76, 'anodized_dark', b.x, 1.2, b.z)
    // Brass label holders & drawer handles
    const drawers = 4
    const dw = b.len / drawers
    for (let d = 0; d < drawers; d++) {
      const dx = b.x - b.len * 0.5 + dw * (d + 0.5)
      batch.addBox(0.18, 0.03, 0.02, 'brass', dx, 0.78, b.z + (b.z > 0 ? -0.38 : 0.38))
    }

    addCoverWall(ctx, b.x, b.z, b.len * 0.53, 0.4, 1.22)
  }

  // Heavy multifunction copy center at x = -7.2, z = -17.6
  batch.addBox(1.2, 1.05, 0.95, 'drywall_painted', -7.2, 0.525, -17.6)
  batch.addBox(0.9, 0.12, 0.65, 'anodized_dark', -7.2, 1.12, -17.6)
  batch.addBox(0.35, 0.22, 0.02, 'led_cyan', -7.2, 1.22, -17.2, { castShadow: false })
  addCoverWall(ctx, -7.2, -17.6, 0.65, 0.52, 1.25)
}

/**
 * 6. Elevated Executive Penthouse / Boardroom:
 * Massive dark walnut conference table, 10 executive leather chairs,
 * frosted glass tactical boards, and architectural ceiling recessed light troughs.
 */
export function buildExecutiveBoardroom(ctx: PropContext): void {
  const { batch } = ctx
  const bx = 16.5
  const bz = -8.5

  // Massive walnut conference table: 7.2m x 2.2m
  batch.addBox(7.2, 0.1, 2.2, 'walnut_wood', bx, 0.32 + 0.74, bz, { tile: 2.2 })
  // Polished Nero Marquina center runner with brass inlays
  batch.addBox(5.8, 0.015, 0.65, 'marble_dark', bx, 0.32 + 0.795, bz, { tile: 1.8 })
  batch.addBox(5.9, 0.02, 0.035, 'brass', bx, 0.32 + 0.795, bz - 0.34)
  batch.addBox(5.9, 0.02, 0.035, 'brass', bx, 0.32 + 0.795, bz + 0.34)

  // Double pedestal table bases (brushed steel + dark marble)
  for (const px of [bx - 2.2, bx + 2.2]) {
    batch.addBox(0.85, 0.72, 1.2, 'brushed_steel', px, 0.32 + 0.36, bz)
    batch.addBox(0.95, 0.06, 1.3, 'marble_dark', px, 0.32 + 0.03, bz)
  }

  // 10 Executive high-back leather chairs around the boardroom table
  const chairOffsets = [-2.4, -1.2, 0, 1.2, 2.4]
  for (const cx of chairOffsets) {
    for (const zSide of [-1, 1]) {
      const cz = bz + zSide * 1.55
      batch.addCylinder(0.32, 0.32, 0.04, 10, 'brushed_steel', bx + cx, 0.32 + 0.12, cz)
      batch.addCylinder(0.04, 0.04, 0.38, 8, 'brushed_steel', bx + cx, 0.32 + 0.32, cz)
      batch.addBox(0.58, 0.1, 0.52, 'leather_black', bx + cx, 0.32 + 0.54, cz)
      batch.addBox(0.52, 0.72, 0.08, 'leather_black', bx + cx, 0.32 + 0.92, cz + zSide * 0.24)
    }
  }

  // Boardroom tactical glass whiteboard divider
  batch.addBox(6.4, 2.8, 0.06, 'glass_frosted', bx, 0.32 + 1.8, bz + 3.4, { castShadow: false })
  batch.addBox(6.6, 0.08, 0.12, 'brushed_steel', bx, 0.32 + 0.4, bz + 3.4)

  // Solid cover wall for conference table
  addCoverWall(ctx, bx, bz, 3.8, 1.2, 0.9)
}

/**
 * 7. Rodrigo Branco's Executive Office & Hero Desk:
 * The primary narrative centerpiece of the 42nd floor.
 * Rodrigo's monolithic mahogany/walnut hero desk, credenza with dark marble top,
 * and high-end whiskey bar with crystal decanters.
 */
export function buildRodrigoOffice(ctx: PropContext): void {
  const { batch } = ctx
  const hx = 22.8
  const hz = 6.2

  // Monolithic hero desk: 3.4m x 1.45m
  batch.addBox(3.4, 0.09, 1.45, 'walnut_wood', hx, 0.32 + 0.78, hz, { tile: 1.8 })
  // Brushed steel leg slab
  batch.addBox(0.12, 0.74, 1.32, 'brushed_steel', hx - 1.48, 0.32 + 0.37, hz)
  // Nero Marquina dark marble return block
  batch.addBox(1.05, 0.68, 1.32, 'marble_dark', hx + 1.05, 0.32 + 0.36, hz, { tile: 1.6 })
  batch.addBox(0.95, 0.04, 1.22, 'anodized_dark', hx + 1.05, 0.32 + 0.02, hz)

  // Rodrigo's executive leather throne chair
  batch.addBox(0.68, 0.1, 0.66, 'leather_black', hx + 2.35, 0.32 + 0.5, hz)
  batch.addBox(0.11, 0.92, 0.62, 'leather_black', hx + 2.65, 0.32 + 0.96, hz)
  batch.addBox(0.08, 0.46, 0.08, 'brushed_steel', hx + 2.35, 0.32 + 0.25, hz)

  // Executive Credenza along rear wall (walnut with marble top)
  batch.addBox(4.2, 0.78, 0.64, 'walnut_wood', hx + 0.4, 0.32 + 0.39, hz + 7.6, { tile: 1.8 })
  batch.addBox(4.26, 0.045, 0.68, 'marble_dark', hx + 0.4, 0.32 + 0.8, hz + 7.6, { tile: 1.6 })

  // Executive Whiskey Bar: credenza tray with decanters
  const barX = hx - 0.8
  const barZ = hz + 7.6
  batch.addBox(0.72, 0.03, 0.44, 'brass', barX, 0.32 + 0.84, barZ)
  // Crystal whiskey decanter
  batch.addBox(0.12, 0.24, 0.12, 'glass_facade', barX - 0.18, 0.32 + 0.98, barZ, { castShadow: false })
  batch.addBox(0.09, 0.16, 0.09, 'led_amber', barX - 0.18, 0.32 + 0.94, barZ, { castShadow: false })
  // Crystal tumblers
  for (const ox of [0.08, 0.22]) {
    batch.addCylinder(0.04, 0.04, 0.09, 8, 'glass_facade', barX + ox, 0.32 + 0.9, barZ, { castShadow: false })
  }

  // Cover walls
  addCoverWall(ctx, hx, hz, 1.8, 0.8, 0.9)
  addCoverWall(ctx, hx + 0.4, hz + 7.6, 2.2, 0.4, 0.85)
}

/**
 * 8. Floor-to-Ceiling Curtain Walls & Venetian Blinds:
 * South and West exterior glass facades overlooking São Paulo,
 * with anodized dark bronze mullions and angled blinds catching the golden sunset light.
 */
export function buildCurtainWallsAndBlinds(ctx: PropContext): void {
  const { batch } = ctx

  // South Curtain Wall (z = 18.5, length = 41m)
  const southZ = 18.46
  batch.addBox(41.0, 5.2, 0.04, 'glass_facade', 8.5, 2.6, southZ, { castShadow: false })
  // Top and bottom bronze sill extrusions
  batch.addBox(41.2, 0.22, 0.32, 'anodized_dark', 8.5, 0.11, southZ)
  batch.addBox(41.2, 0.26, 0.34, 'anodized_dark', 8.5, 5.08, southZ)

  // Vertical bronze mullions every 3.8m
  for (let mx = -12.0; mx <= 29.0; mx += 3.8) {
    batch.addBox(0.14, 5.2, 0.28, 'anodized_dark', mx, 2.6, southZ)
  }

  // West Curtain Wall (x = 28.5, length = 37m)
  const westX = 28.46
  batch.addBox(0.04, 5.2, 37.0, 'glass_facade', westX, 2.6, 0, { castShadow: false })
  batch.addBox(0.32, 0.22, 37.2, 'anodized_dark', westX, 0.11, 0)
  batch.addBox(0.34, 0.26, 37.2, 'anodized_dark', westX, 5.08, 0)

  for (let mz = -18.0; mz <= 18.0; mz += 3.8) {
    batch.addBox(0.28, 5.2, 0.14, 'anodized_dark', westX, 2.6, mz)
  }

  // Angled architectural Venetian blinds bays along executive curtain walls
  // Slats angled at 26 degrees to catch the low golden hour sun
  const slatSpacing = 0.14
  for (let bz = -14.0; bz <= 14.0; bz += 4.2) {
    for (let sy = 0.6; sy <= 4.6; sy += slatSpacing) {
      batch.addBox(0.12, 0.016, 3.8, 'anodized_dark', westX - 0.22, sy, bz, {
        rx: 0,
        ry: 0,
        rz: 0.46,
      })
    }
  }

  // Perimeter collision walls preventing player from falling out
  addCoverWall(ctx, 8.5, southZ, 20.6, 0.25, 5.2)
  addCoverWall(ctx, westX, 0, 0.25, 18.6, 5.2)
}

/**
 * 9. Tropical Corporate Planters:
 * Architectural travertine square planters with lush indoor foliage.
 */
export function buildTropicalPlanters(ctx: PropContext): void {
  const { batch } = ctx
  const planterCoords = [
    { x: -14.2, z: -7.5 },
    { x: -14.2, z: 7.5 },
    { x: 9.8, z: -16.5 },
    { x: 9.8, z: 16.5 },
    { x: 25.5, z: -14.5 },
  ]

  for (const pt of planterCoords) {
    // Travertine planter box
    batch.addBox(1.6, 0.72, 1.6, 'travertine', pt.x, 0.36, pt.z, { tile: 1.5 })
    batch.addBox(1.7, 0.06, 1.7, 'brass', pt.x, 0.74, pt.z)

    // Soil bed
    batch.addBox(1.4, 0.1, 1.4, 'leather_black', pt.x, 0.68, pt.z)

    // Foliage canopy (layered lush green volumes)
    batch.addBox(1.5, 0.85, 1.5, 'foliage_green', pt.x, 1.25, pt.z, { tile: 1.2 })
    batch.addBox(1.1, 0.6, 1.1, 'foliage_green', pt.x, 1.85, pt.z, { tile: 1.2 })

    addCoverWall(ctx, pt.x, pt.z, 0.88, 0.88, 0.8)
  }
}
