// Ported from Nyxera0x/cutaway at 5d8f1c6. See CUTAWAY-LICENSE.
import * as THREE from 'three/webgpu'
const D2R = Math.PI / 180

// ------------------------------------------------------------ sweepX: a closed (x, r) profile turned round the x axis
// profile: [[x, r], ...] closed loop, either winding. a0..a1: the arc, angle 0 at +y, 90° at +z. Profile corners
// sharper than `smooth` degrees keep a hard edge; softer ones are shaded smooth. A partial arc gets capped ends.
export function sweepX(profile, {a0 = 0, a1 = Math.PI * 2, segs = 64, smooth = 32} = {}) {
  let P = profile.map(([x, r]) => [x, Math.max(0, r)]);
  let area = 0;
  for (let i = 0; i < P.length; i++) {
    const [x0, r0] = P[i];
    const [x1, r1] = P[(i + 1) % P.length];
    area += x0 * r1 - x1 * r0;
  }
  if (area < 0) P = P.reverse();
  const n = P.length;
  // outward edge normals in the (x, r) plane
  const EN = [];
  for (let i = 0; i < n; i++) {
    const [x0, r0] = P[i];
    const [x1, r1] = P[(i + 1) % n];
    const l = Math.hypot(x1 - x0, r1 - r0) || 1;
    EN.push([(r1 - r0) / l, -(x1 - x0) / l]);
  }
  const cosS = Math.cos(smooth * D2R);
  const vN = (i, e) => {
    // normal at vertex i as seen from edge e (e is i-1 or i)
    const other = e === i ? (i - 1 + n) % n : i;
    const a = EN[e];
    const b = EN[other];
    if (a[0] * b[0] + a[1] * b[1] < cosS) return a;
    const x = a[0] + b[0];
    const y = a[1] + b[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6;
  const pos = [];
  const nor = [];
  const idx = [];
  const cs = [];
  for (let j = 0; j <= segs; j++) {
    const th = a0 + ((a1 - a0) * j) / segs;
    cs.push([Math.cos(th), Math.sin(th)]);
  }
  for (let e = 0; e < n; e++) {
    const i0 = e;
    const i1 = (e + 1) % n;
    const [x0, r0] = P[i0];
    const [x1, r1] = P[i1];
    if (Math.hypot(x1 - x0, r1 - r0) < 1e-9) continue;
    const n0 = vN(i0, e);
    const n1 = vN(i1, e);
    const base = pos.length / 3;
    for (let j = 0; j <= segs; j++) {
      const [c, s] = cs[j];
      pos.push(x0, r0 * c, r0 * s, x1, r1 * c, r1 * s);
      nor.push(n0[0], n0[1] * c, n0[1] * s, n1[0], n1[1] * c, n1[1] * s);
    }
    for (let j = 0; j < segs; j++) {
      const a = base + j * 2;
      const b = a + 1;
      const c = a + 3;
      const d = a + 2;
      idx.push(a, b, c, a, c, d);
    }
  }
  if (!full) {
    const tri = THREE.ShapeUtils.triangulateShape(
      P.map(([x, r]) => new THREE.Vector2(x, r)),
      [],
    );
    for (const [th, flip] of [
      [a0, true],
      [a1, false],
    ]) {
      const c = Math.cos(th);
      const s = Math.sin(th);
      // the cap's normal: -d/dθ at a0, +d/dθ at a1
      const nx = 0;
      const ny = flip ? s : -s;
      const nz = flip ? -c : c;
      const base = pos.length / 3;
      for (const [x, r] of P) {
        pos.push(x, r * c, r * s);
        nor.push(nx, ny, nz);
      }
      for (const t of tri) {
        if (flip) idx.push(base + t[0], base + t[2], base + t[1]);
        else idx.push(base + t[0], base + t[1], base + t[2]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// a rounded rectangle profile for a ring: x0..x1 wide, r0..r1 deep, corners rounded by `round`
export function ringProfile(x0, x1, r0, r1, round = 0.01, steps = 3) {
  const rr = Math.min(round, (x1 - x0) / 2.01, (r1 - r0) / 2.01);
  const pts = [];
  const corner = (cx, cr, a0) => {
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (k / steps) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rr, cr + Math.sin(a) * rr]);
    }
  };
  corner(x1 - rr, r0 + rr, -Math.PI / 2);
  corner(x1 - rr, r1 - rr, 0);
  corner(x0 + rr, r1 - rr, Math.PI / 2);
  corner(x0 + rr, r0 + rr, Math.PI);
  return pts;
}
export const ring = (x0, x1, r0, r1, round, opts) => sweepX(ringProfile(x0, x1, r0, r1, round), opts);
