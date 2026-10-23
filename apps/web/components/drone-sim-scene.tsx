"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildTimeline, LOT, lotX, sample } from "./drone-sim-model";

export type SimTarget = { assetId: string; name: string; findingId: string; waterState: string; objectClass: string; confidence: number | null };
export type SimView = "orbit" | "follow" | "pov";
export type SimTick = {
  t: number; duration: number; phase: string; targetIndex: number; arrivedIndex: number;
  altitude: number; speed: number; battery: number; detection: { x: number; y: number; w: number; h: number } | null;
};
type Props = {
  targets: SimTarget[]; outcomes: Record<string, string>; playing: boolean; speed: number;
  seek: { value: number; seq: number }; view: SimView; recenter: number; frame: RefObject<HTMLDivElement | null>;
  onTick: (tick: SimTick) => void; onEnd: () => void; onReady: (ready: boolean) => void;
};
type Handle = { update: (props: Props) => void };

const OUTCOME_COLOR: Record<string, number> = { SKIPPED: 0x9aa8b2, GROUND_REVIEW: 0xffa24d, MOCK_ACTION_RECORDED: 0x21b6ff };
const BATTERY_DRAIN = 0.17; // simulated % per second

export default function DroneSimScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<Handle | null>(null);
  const latest = useRef(props);
  const [failure, setFailure] = useState("");
  const key = props.targets.map(t => `${t.assetId}:${t.waterState}`).join("|");
  useEffect(() => { latest.current = props; handle.current?.update(props); }, [props]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const targets = latest.current.targets;
    const n = targets.length;
    let renderer: THREE.WebGLRenderer;
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2", { antialias: true, alpha: false });
      if (!context) throw new Error("WebGL2 unavailable");
      renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
    } catch {
      queueMicrotask(() => { latest.current.onReady(false); setFailure("3D rendering is unavailable on this device. The target list and recorded outcomes below remain usable."); });
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", "Illustrative 3D residential street with a simulated drone inspecting registered planters; the same information is listed beside the scene");

    const tl = buildTimeline(n);
    const scene = new THREE.Scene();
    const skyCanvas = document.createElement("canvas"); skyCanvas.width = 4; skyCanvas.height = 256;
    const sctx = skyCanvas.getContext("2d");
    if (sctx) { const g = sctx.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, "#5ea6dd"); g.addColorStop(0.7, "#b9dcf0"); g.addColorStop(1, "#e6f1f4"); sctx.fillStyle = g; sctx.fillRect(0, 0, 4, 256); }
    const sky = new THREE.CanvasTexture(skyCanvas); sky.colorSpace = THREE.SRGBColorSpace; scene.background = sky;
    scene.fog = new THREE.Fog(0xcfe5ee, 90, 330);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    const spanX = (tl.zone.maxX + tl.zone.minX) / 2;
    const orbitHome = () => { camera.position.set(spanX + 6, 30 + n * 2.5, 38 + n * 4); controls.target.set(spanX, 1, -16); controls.update(); };
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 12; controls.maxDistance = 220; controls.maxPolarAngle = Math.PI / 2.05; controls.enablePan = true;
    orbitHome();
    const pov = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 300);

    scene.add(new THREE.HemisphereLight(0xdcefff, 0x5d7447, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1d6, 3.1); sun.position.set(spanX + 40, 70, 30); sun.target.position.set(spanX, 0, -14);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.3;
    const half = Math.max(60, (tl.zone.maxX - tl.zone.minX) / 2 + 20);
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: 55, bottom: -55, near: 10, far: 220 });
    scene.add(sun, sun.target);

    const mats = new Map<number, THREE.MeshStandardMaterial>();
    const mat = (color: number, rough = 0.9) => { const k = color * 10 + Math.round(rough * 9); let m = mats.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough }); mats.set(k, m); } return m; };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, parent: THREE.Object3D = scene) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z);
      mesh.castShadow = h > 0.3; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    const sprites: THREE.Texture[] = [], tags: THREE.Sprite[] = [];
    const label = (text: string, x: number, y: number, z: number, color = "#0a2547", w = 7) => {
      const c = document.createElement("canvas"); c.width = 320; c.height = 64;
      const ctx = c.getContext("2d"); if (!ctx) return;
      ctx.fillStyle = "rgba(252,254,255,.92)"; ctx.fillRect(0, 0, 320, 64); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, 317, 61);
      ctx.font = "bold 28px ui-monospace, Consolas, monospace"; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(text, 160, 42, 300);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; sprites.push(tex);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false })); s.position.set(x, y, z); s.scale.set(w, w * 0.2, 1); s.renderOrder = 4; scene.add(s); tags.push(s);
    };

    // --- Neighbourhood: one row of lots north of a street (illustrative, not a survey) ---
    const W = tl.zone.maxX - tl.zone.minX + 80;
    box(W + 120, 0.4, 200, spanX, -0.2, -10, mat(0x7fae63)).castShadow = false;
    box(W, 0.1, 8, spanX, 0.02, 0, mat(0x3b4249)).castShadow = false;
    for (let x = tl.zone.minX - 20; x < tl.zone.maxX + 20; x += 7) box(3, 0.04, 0.2, x, 0.09, 0, mat(0xe8e0b8, 0.6)).castShadow = false;
    box(W, 0.18, 2, spanX, 0.05, -5, mat(0xbfc5c6)).castShadow = false;
    box(W, 0.18, 2, spanX, 0.05, 5, mat(0xbfc5c6)).castShadow = false;
    const gableShape = new THREE.Shape([new THREE.Vector2(-5.4, 0), new THREE.Vector2(5.4, 0), new THREE.Vector2(0, 2.8)]);
    const gable = new THREE.ExtrudeGeometry(gableShape, { depth: 10.4, bevelEnabled: false });
    const wall = [0xe9dcc4, 0xd7e3d6, 0xe8d0c0, 0xcfd9e6], roofs = [0x8c4b3a, 0x5d6b78, 0x7a5a45, 0x4f5f66];
    const trees: THREE.Group[] = [];
    const tree = (x: number, z: number, s: number) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
      box(0.5 * s, 3 * s, 0.5 * s, 0, 1.5 * s, 0, mat(0x6b4a2f), g);
      for (const [dx, dy, dz, r] of [[0, 4.2, 0, 2.4], [1.2, 3.6, 0.6, 1.7], [-1.1, 3.8, -0.5, 1.8]] as const) {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), mat(0x3f8a49, 0.95)); crown.position.set(dx * s, dy * s, dz * s); crown.castShadow = true; g.add(crown);
      }
      trees.push(g);
    };
    for (let i = 0; i < n; i++) {
      const x0 = lotX(i, n);
      box(LOT - 0.4, 0.06, 28, x0, 0.04, -20, mat(i % 2 ? 0x86b46a : 0x7aa860)).castShadow = false;
      const hv = i % 4;
      box(9, 5, 9, x0, 2.5, -16.5, mat(wall[hv]));
      const roof = new THREE.Mesh(gable, mat(roofs[hv], 0.8)); roof.geometry.translate(0, 0, -5.2); roof.rotation.y = Math.PI / 2; roof.position.set(x0, 5, -16.5); roof.castShadow = true; scene.add(roof);
      box(1.4, 2.3, 0.15, x0 - 1.5, 1.15, -11.96, mat(0x5a3d2b));
      for (const wx of [-3, 2.6]) box(1.5, 1.4, 0.12, x0 + wx, 2.6, -11.97, mat(0x8fb4c9, 0.2));
      box(2.8, 0.18, 1.6, x0 - 1.5, 2.7, -11.1, mat(0x6b6f73)); // porch cover
      box(0.14, 2.7, 0.14, x0 - 2.8, 1.35, -10.4, mat(0x6b6f73)); box(0.14, 2.7, 0.14, x0 - 0.2, 1.35, -10.4, mat(0x6b6f73));
      box(0.1, 1.1, 28, x0 + LOT / 2 - 0.2, 0.55, -20, mat(0xcdb78d)); // side fence
      box(LOT - 0.3, 1.1, 0.1, x0, 0.55, -34, mat(0xcdb78d)); // back fence
      box(1.2, 1.1, 0.8, x0 + 5.5, 0.55, -13.5, mat(0x3f5663)); // bin
      tree(x0 + (i % 2 ? -6.5 : 6.5), i % 2 ? -8 : -30, 0.9 + (i % 3) * 0.1);
    }
    // Parked car and utility poles (decorative; cruise altitude clears the wires)
    const car = new THREE.Group(); car.position.set(lotX(Math.min(1, n - 1), n) + 4, 0, -2.3); scene.add(car);
    box(4.4, 0.9, 1.8, 0, 0.75, 0, mat(0x2c5d8a, 0.4), car); box(2.4, 0.8, 1.6, -0.2, 1.5, 0, mat(0x9fc2d8, 0.2), car);
    for (const wx of [-1.4, 1.4]) for (const wz of [-0.9, 0.9]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 12), mat(0x1c1c1c)); wh.rotation.x = Math.PI / 2; wh.position.set(wx, 0.38, wz); car.add(wh); }
    const poleXs: number[] = [];
    for (let x = tl.zone.minX - 4; x < tl.zone.maxX + 8; x += LOT * 2) { poleXs.push(x); box(0.3, 9, 0.3, x, 4.5, 6.2, mat(0x6b5a48)); box(2.4, 0.2, 0.2, x, 8.6, 6.2, mat(0x6b5a48)); }
    const wireMat = new THREE.LineBasicMaterial({ color: 0x2b2f33 });
    for (let k = 0; k < poleXs.length - 1; k++) for (const dz of [-0.9, 0.9]) {
      const a = poleXs[k], b = poleXs[k + 1];
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a + dz, 8.5, 6.2), new THREE.Vector3((a + b) / 2, 7.2, 6.2), new THREE.Vector3(b + dz, 8.5, 6.2));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(14)), wireMat));
    }
    tree(tl.zone.minX + 12, 11, 1.1); tree(tl.zone.minX - 3, 8, 1);

    // Authorised test zone outline + launch pad
    const z = tl.zone;
    const zonePts = [[z.minX, z.minZ], [z.maxX, z.minZ], [z.maxX, z.maxZ], [z.minX, z.maxZ]].map(([x, zz]) => new THREE.Vector3(x, 0.25, zz));
    const zoneLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(zonePts), new THREE.LineDashedMaterial({ color: 0x1f8a52, dashSize: 2, gapSize: 1.2 }));
    zoneLine.computeLineDistances(); scene.add(zoneLine);
    const wallGeo = new THREE.BufferGeometry().setFromPoints([...zonePts, zonePts[0]].flatMap((p, i, a) => i < 4 ? [p, a[i + 1], new THREE.Vector3(a[i + 1].x, 20, a[i + 1].z), p, new THREE.Vector3(a[i + 1].x, 20, a[i + 1].z), new THREE.Vector3(p.x, 20, p.z)] : []));
    scene.add(new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ color: 0x2fd67a, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })));
    label("AUTHORISED TEST ZONE · fictional", z.minX + 12, 3, z.maxZ - 1, "#1f8a52", 12);
    const padM = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.12, 32), mat(0x444c52)); padM.position.set(tl.pad.x, 0.1, tl.pad.z); padM.receiveShadow = true; scene.add(padM);
    const padH = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.1, 32), new THREE.MeshBasicMaterial({ color: 0xf3f6f8, side: THREE.DoubleSide })); padH.rotation.x = -Math.PI / 2; padH.position.set(tl.pad.x, 0.17, tl.pad.z); scene.add(padH);
    label("LAUNCH PAD · DISARMED", tl.pad.x, 4.2, tl.pad.z, "#0a2547", 8);

    // Planters: appearance comes from the stored finding's water state, never from the drone replay.
    const water: THREE.Mesh[] = [];
    const rings: { ring: THREE.Mesh; flag: THREE.Group; ringMat: THREE.MeshBasicMaterial; asset: string }[] = [];
    targets.forEach((tg, i) => {
      const p = tl.targets[i];
      const potMat = mat(0xb4623d, 0.75);
      box(1.2, 0.7, 0.8, p.x, 0.35, p.z, potMat); box(1.4, 0.06, 1.0, p.x, 0.03, p.z, mat(0x7a3f26));
      if (tg.waterState === "VISIBLE_WATER") {
        const w = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.62), new THREE.MeshStandardMaterial({ color: 0x3fa6d4, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.88 }));
        w.position.set(p.x, 0.62, p.z); scene.add(w); water.push(w);
      } else box(1.0, 0.05, 0.62, p.x, 0.62, p.z, mat(tg.waterState === "DRY" ? 0x6b5a45 : 0x4a3c2e));
      if (tg.waterState !== "VISIBLE_WATER") { const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), mat(0x3f8a49)); leaf.position.set(p.x - 0.25, 0.95, p.z); leaf.castShadow = true; scene.add(leaf); }
      if (tg.waterState === "OCCLUDED") {
        // Carport roof hides the container from above: honest reason for UNCERTAIN.
        for (const [dx, dz] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2]]) box(0.12, 2.4, 0.12, p.x + dx, 1.2, p.z + dz, mat(0x6b6f73));
        box(3.4, 0.14, 2.8, p.x, 2.45, p.z, mat(0x8a9399, 0.6));
      }
      label(`${i + 1} · ${tg.name.split(" / ")[0]}`, p.x, tg.waterState === "OCCLUDED" ? 4 : 2.6, p.z, "#0a2547", 5.4);
      const rm = new THREE.MeshBasicMaterial({ color: 0x21b6ff, transparent: true, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.07, 6, 40), rm); ring.rotation.x = Math.PI / 2; ring.position.set(p.x, 0.25, p.z); ring.visible = false; scene.add(ring);
      const flag = new THREE.Group(); flag.position.set(p.x + 1.7, 0, p.z); flag.visible = false; scene.add(flag);
      box(0.06, 2.2, 0.06, 0, 1.1, 0, mat(0x444c52), flag); box(0.9, 0.5, 0.04, 0.45, 1.95, 0, new THREE.MeshStandardMaterial({ color: 0xffa24d }), flag);
      rings.push({ ring, flag, ringMat: rm, asset: tg.assetId });
    });

    // --- Drone ---
    const drone = new THREE.Group(); drone.rotation.order = "YXZ"; scene.add(drone);
    box(1.5, 0.32, 0.9, 0, 0, 0, mat(0x2b3138, 0.5), drone);
    box(0.5, 0.18, 0.5, 0, 0.22, 0, mat(0x21b6ff, 0.4), drone);
    const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat(0x14181c, 0.4)); gimbal.position.set(0, -0.28, 0.45); drone.add(gimbal);
    const rotors: THREE.Group[] = [];
    for (const [rx, rz] of [[-1.1, -0.9], [1.1, -0.9], [-1.1, 0.9], [1.1, 0.9]]) {
      const arm = box(0.14, 0.1, 1.6, rx / 2, 0, rz / 2, mat(0x2b3138), drone); arm.rotation.y = rx * rz > 0 ? Math.PI / 4 : -Math.PI / 4; arm.scale.z = 1.05;
      const g = new THREE.Group(); g.position.set(rx, 0.18, rz); drone.add(g); rotors.push(g);
      box(1.2, 0.03, 0.12, 0, 0, 0, mat(0x111418), g);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.01, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false })); g.add(disc);
    }
    const ledFront = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); ledFront.position.set(0, 0, 0.5); drone.add(ledFront);
    const ledBack = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); ledBack.position.set(0, 0, -0.5); drone.add(ledBack);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x21b6ff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true), beamMat); beam.visible = false; scene.add(beam);

    // Flight path: whole planned route (dashed) and flown portion (solid), sampled on a fixed grid.
    const STEP = 0.25, samples = Math.ceil(tl.duration / STEP) + 1;
    const pathPts: THREE.Vector3[] = [];
    for (let k = 0; k < samples; k++) pathPts.push(sample(tl, k * STEP).pos.clone());
    const plan = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPts), new THREE.LineDashedMaterial({ color: 0x0a2547, dashSize: 0.8, gapSize: 0.6, transparent: true, opacity: 0.45 }));
    plan.computeLineDistances(); scene.add(plan);
    const flown = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPts), new THREE.LineBasicMaterial({ color: 0x21b6ff }));
    flown.frustumCulled = false; flown.geometry.setDrawRange(0, 0); scene.add(flown);

    // --- State ---
    let frame = 0, last = 0, clock = 0, time = 0, yaw = 0, ended = false, lastTick = -1, tickAcc = 1, seekSeq = latest.current.seek.seq, recenterSeq = latest.current.recenter;
    let view: SimView = latest.current.view, playing = false, speed = 1, outcomes: Record<string, string> = {};
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), camGoal = new THREE.Vector3(), look = new THREE.Vector3(), prev = new THREE.Vector3();
    const live = () => !document.hidden && (!reduced.matches || playing);
    const targetBox = (i: number) => {
      const p = tl.targets[i], occ = targets[i].waterState === "OCCLUDED";
      const c = occ ? new THREE.Vector3(p.x, 2.45, p.z) : new THREE.Vector3(p.x, 0.45, p.z), s = occ ? [3.4, 0.1, 2.8] : [1.5, 0.9, 1.1];
      return [-1, 1].flatMap(a => [-1, 1].flatMap(b => [-1, 1].map(d => new THREE.Vector3(c.x + a * s[0] / 2, c.y + b * s[1] / 2, c.z + d * s[2] / 2))));
    };

    const setPose = (dt: number, animated: boolean) => {
      const { pos, seg } = sample(tl, time, tmp);
      drone.position.copy(pos);
      sample(tl, Math.max(0, time - 0.1), prev);
      const vel = fwd.copy(pos).sub(prev).divideScalar(0.1);
      const hs = Math.hypot(vel.x, vel.z);
      if (hs > 0.4) { const goal = Math.atan2(vel.x, vel.z); let d = goal - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * (animated ? Math.min(dt * 4, 1) : 1); }
      drone.rotation.y = yaw; drone.rotation.x = Math.min(hs * 0.035, 0.22);
      if (animated && seg.phase !== "Landed" && seg.phase !== "Pre-flight checks") drone.position.y += Math.sin(clock * 3) * 0.05;
      const spinning = seg.phase !== "Landed" && seg.phase !== "Pre-flight checks";
      rotors.forEach((r, i) => { r.rotation.y = animated && spinning ? clock * (i % 2 ? 60 : -60) : i * 0.6; });
      ledFront.visible = ledBack.visible = animated ? Math.sin(clock * 6) > -0.4 : true;
      const idx = seg.idx, near = idx >= 0 && ["Descend to inspect", "Inspect", "Climb"].includes(seg.phase);
      beam.visible = near && idx >= 0;
      if (beam.visible) { const p = tl.targets[idx], h = Math.max(drone.position.y - 0.3, 0.5); beam.position.set(p.x, h / 2 + 0.3, p.z); beam.scale.set(1.6 * (h / 6.5 + 0.3), h, 1.6 * (h / 6.5 + 0.3)); beamMat.opacity = animated ? 0.12 + 0.05 * Math.sin(clock * 5) : 0.14; beam.position.x = (drone.position.x + p.x) / 2; beam.position.z = (drone.position.z + p.z) / 2; }
      // Gimbal camera: looks at the current target when close, otherwise ahead and down.
      pov.position.set(drone.position.x, Math.max(drone.position.y - 0.35, 0.8), drone.position.z);
      if (idx >= 0 && ["Transit", "Descend to inspect", "Inspect", "Climb"].includes(seg.phase) && Math.hypot(drone.position.x - tl.targets[idx].x, drone.position.z - tl.targets[idx].z) < 30) look.copy(tl.targets[idx]);
      else look.set(drone.position.x + Math.sin(yaw) * 18, Math.max(drone.position.y - 12, 0), drone.position.z + Math.cos(yaw) * 18);
      pov.lookAt(look);
      const reached = tl.arrive.reduce((acc, a, i) => (time >= a ? i : acc), -1);
      flown.geometry.setDrawRange(0, Math.min(samples, Math.floor(time / STEP) + 1));
      rings.forEach((r, i) => {
        const kind = outcomes[r.asset], shown = !!kind && time >= tl.arrive[i] + 1.5;
        r.ring.visible = shown; r.flag.visible = shown && kind === "GROUND_REVIEW";
        if (shown) {
          const phase = animated ? (clock * 0.8) % 1 : 0.3;
          r.ringMat.color.setHex(OUTCOME_COLOR[kind] ?? 0x9aa8b2);
          r.ring.scale.setScalar(kind === "MOCK_ACTION_RECORDED" ? 1 + phase * 0.5 : 1); r.ringMat.opacity = kind === "MOCK_ACTION_RECORDED" ? 1 - phase * 0.8 : 0.85;
        }
      });
      return { seg, hs, reached, vel };
    };

    const detect = (idx: number, phase: string) => {
      if (idx < 0 || !["Transit", "Descend to inspect", "Inspect", "Climb"].includes(phase)) return null;
      pov.updateMatrixWorld();
      const pts = targetBox(idx), xs: number[] = [], ys: number[] = [];
      for (const pt of pts) {
        const cs = pt.clone().applyMatrix4(pov.matrixWorldInverse);
        if (cs.z > -0.5) return null;
        pt.project(pov); xs.push(pt.x); ys.push(pt.y);
      }
      const x0 = Math.max(Math.min(...xs), -1), x1 = Math.min(Math.max(...xs), 1), y0 = Math.max(Math.min(...ys), -1), y1 = Math.min(Math.max(...ys), 1);
      if (x1 <= x0 || y1 <= y0) return null;
      return { x: (x0 + 1) / 2, y: (1 - y1) / 2, w: (x1 - x0) / 2, h: (y1 - y0) / 2 };
    };

    const advance = (dt: number, animated: boolean) => {
      clock += dt;
      if (playing && !ended) {
        time += dt * speed;
        if (time >= tl.duration) { time = tl.duration; ended = true; latest.current.onEnd(); }
      }
      trees.forEach((t, i) => { t.rotation.z = animated ? Math.sin(clock * 0.9 + i) * 0.012 : 0; });
      water.forEach(w => { (w.material as THREE.MeshStandardMaterial).opacity = animated ? 0.82 + 0.08 * Math.sin(clock * 2.2) : 0.88; });
      const state = setPose(dt, animated);
      if (view === "follow") {
        camGoal.set(drone.position.x - Math.sin(yaw) * 15, drone.position.y + 7, drone.position.z - Math.cos(yaw) * 15 + 4);
        camera.position.lerp(camGoal, animated ? 1 - Math.exp(-dt * 3) : 1); controls.target.lerp(drone.position, animated ? 1 - Math.exp(-dt * 4) : 1); camera.lookAt(controls.target);
      }
      tickAcc += dt;
      if (tickAcc > 0.12 || Math.abs(time - lastTick) > 0.5) {
        tickAcc = 0; lastTick = time;
        latest.current.onTick({
          t: time, duration: tl.duration, phase: state.seg.phase, targetIndex: state.seg.idx, arrivedIndex: state.reached,
          altitude: Math.max(drone.position.y - 0.35, 0), speed: Math.hypot(state.vel.x, state.vel.y, state.vel.z),
          battery: Math.max(100 - time * BATTERY_DRAIN, 0), detection: detect(state.seg.idx, state.seg.phase),
        });
      }
    };

    const render = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      const fr = latest.current.frame.current?.getBoundingClientRect(), box0 = container.getBoundingClientRect();
      renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
      const showTags = (on: boolean) => { tags.forEach(s => { s.visible = on; }); drone.visible = on; };
      if (view === "pov") { pov.aspect = w / h; pov.updateProjectionMatrix(); showTags(false); renderer.render(scene, pov); showTags(true); return; }
      renderer.render(scene, camera);
      if (fr && fr.width > 0) {
        const x = fr.left - box0.left, y = h - (fr.bottom - box0.top);
        pov.aspect = fr.width / fr.height; pov.updateProjectionMatrix();
        renderer.setScissorTest(true); renderer.setScissor(x, y, fr.width, fr.height); renderer.setViewport(x, y, fr.width, fr.height);
        renderer.clearDepth(); showTags(false); renderer.render(scene, pov); showTags(true); renderer.setScissorTest(false);
      }
    };
    const loop = (ts: number) => {
      frame = 0;
      const dt = last ? Math.min((ts - last) / 1000, 0.1) : 0; last = ts;
      controls.enabled = view === "orbit"; if (view === "orbit") controls.update();
      advance(dt, true); render();
      if (live()) frame = requestAnimationFrame(loop);
    };
    const kick = () => {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      if (live()) frame = requestAnimationFrame(loop); else { advance(0, false); render(); }
    };

    handle.current = {
      update: p => {
        if (p.view !== view) { view = p.view; if (view === "orbit") controls.update(); }
        playing = p.playing; speed = p.speed; outcomes = p.outcomes;
        if (p.seek.seq !== seekSeq) { seekSeq = p.seek.seq; time = Math.min(Math.max(p.seek.value, 0), tl.duration); ended = time >= tl.duration; tickAcc = 1; }
        if (playing && ended && time >= tl.duration) { time = 0; ended = false; }
        if (p.recenter !== recenterSeq) { recenterSeq = p.recenter; orbitHome(); }
        kick();
      },
    };
    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); render();
    };
    const observer = new ResizeObserver(resize); observer.observe(container);
    const onChange = () => { if (!frame) render(); };
    const lost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(frame); frame = 0; latest.current.onReady(false); setFailure("3D graphics were interrupted. Reload to restore the scene; the target list below is unaffected."); };
    controls.addEventListener("change", onChange);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", kick); reduced.addEventListener("change", kick);
    resize(); handle.current.update(latest.current);
    queueMicrotask(() => latest.current.onReady(true));
    return () => {
      handle.current = null; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      document.removeEventListener("visibilitychange", kick); reduced.removeEventListener("change", kick);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      scene.traverse(o => {
        const m = o as THREE.Mesh; m.geometry?.dispose();
        const ms = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(ms) ? ms : ms ? [ms] : []).forEach(x => x.dispose());
      });
      mats.forEach(m => m.dispose()); sprites.forEach(t => t.dispose()); sky.dispose(); gable.dispose(); wireMat.dispose();
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [key]);

  return <><div ref={host} className="dronesim-canvas" data-testid="dronesim-canvas" />{failure && <p className="township-render-status" role="status">{failure}</p>}</>;
}
