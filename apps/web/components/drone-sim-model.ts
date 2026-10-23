import * as THREE from "three";

// Pure layout + flight timeline for the 3D mission rehearsal. Kinematics here are authored (constant cruise
// speed, fixed dwell); they are NOT telemetry from any aircraft.
export const LOT = 16;
export const CRUISE = 14;
export const INSPECT = 6.5;
export const DWELL = 6;
const SPEED = 6;
const REST = 0.35;

export type Seg = { t0: number; t1: number; a: THREE.Vector3; b: THREE.Vector3; phase: string; idx: number; ease: boolean };
export type Timeline = { segs: Seg[]; duration: number; arrive: number[]; pad: THREE.Vector3; targets: THREE.Vector3[]; zone: { minX: number; maxX: number; minZ: number; maxZ: number } };

export const lotX = (i: number, n: number) => (i - (n - 1) / 2) * LOT;
// Three illustrative placements per lot: front porch, back yard, back corner.
export const targetPosition = (i: number, n: number) => {
  const x = lotX(i, n);
  const slot = i % 3;
  return new THREE.Vector3(slot === 0 ? x + 3.5 : slot === 1 ? x + 2 : x - 5, 0.5, slot === 0 ? -10.4 : slot === 1 ? -27 : -26);
};

export function buildTimeline(n: number): Timeline {
  const zone = { minX: lotX(0, n) - LOT / 2 - 12, maxX: lotX(n - 1, n) + LOT / 2 + 4, minZ: -37, maxZ: 15 };
  const pad = new THREE.Vector3(zone.minX + 6, REST, 9);
  const targets = Array.from({ length: n }, (_, i) => targetPosition(i, n));
  const segs: Seg[] = [];
  const arrive: number[] = [];
  let t = 0;
  let cur = pad.clone();
  const push = (to: THREE.Vector3, dur: number, phase: string, idx: number, ease = true) => {
    segs.push({ t0: t, t1: t + dur, a: cur.clone(), b: to.clone(), phase, idx, ease });
    t += dur; cur = to.clone();
  };
  const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
  push(cur, 2.5, "Pre-flight checks", -1);
  push(new THREE.Vector3(pad.x, CRUISE, pad.z), 3.5, "Take-off", -1);
  targets.forEach((tp, i) => {
    const above = new THREE.Vector3(tp.x, CRUISE, tp.z);
    push(above, Math.max(2.5, flat(cur, above) / SPEED), "Transit", i);
    push(new THREE.Vector3(tp.x, INSPECT, tp.z), 2.5, "Descend to inspect", i);
    arrive[i] = t;
    push(cur, DWELL, "Inspect", i);
    push(above, 2.5, "Climb", i);
  });
  const home = new THREE.Vector3(pad.x, CRUISE, pad.z);
  push(home, Math.max(2.5, flat(cur, home) / SPEED), "Return to pad", -1);
  push(new THREE.Vector3(pad.x, REST, pad.z), 3.5, "Landing", -1);
  push(cur, 1.5, "Landed", -1);
  return { segs, duration: t, arrive, pad, targets, zone };
}

const smooth = (k: number) => k * k * (3 - 2 * k);
export function sample(tl: Timeline, time: number, out = new THREE.Vector3()) {
  const t = Math.min(Math.max(time, 0), tl.duration);
  const seg = tl.segs.find(s => t <= s.t1) ?? tl.segs[tl.segs.length - 1];
  const k = seg.t1 > seg.t0 ? (t - seg.t0) / (seg.t1 - seg.t0) : 1;
  out.lerpVectors(seg.a, seg.b, seg.ease ? smooth(k) : k);
  return { pos: out, seg };
}
