"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TownshipData } from "./township-3d";

export type LoopHighlight = { found: string[]; review: string[]; action: string[] };
type Props = {
  data: TownshipData; chapter: number; selected: string;
  onSelect: (id: string) => void; eventAsset?: string; eventKind?: string; playing: boolean;
  onReady: (ready: boolean) => void;
  cameraAction: { command: string; sequence: number };
  night: boolean; heat: boolean; route: string[];
  loopStage: number; loop: LoopHighlight;
};
type SceneHandle = { update: (props: Props) => void };

// Visual replay tags. Wording keeps "recorded" separate from "effective".
const EVENT_STYLE: Record<string, { color: number; css: string; text: string }> = {
  SKIPPED: { color: 0x9aa8b2, css: "#c7d3db", text: "SKIPPED · no action taken" },
  GROUND_REVIEW: { color: 0xffb67f, css: "#ffb67f", text: "UNCERTAIN · queued for ground review" },
  MOCK_ACTION_RECORDED: { color: 0x21b6ff, css: "#7fd4ff", text: "RECORDED · not verified effective" },
};
const LOOP_RING = { found: 0x7fd4ff, review: 0xffb67f, action: 0x21b6ff };

export default function TownshipScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<SceneHandle | null>(null);
  const latest = useRef(props);
  const [failure, setFailure] = useState("");
  useEffect(() => { latest.current = props; handle.current?.update(props); }, [props]);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2", { antialias: true, alpha: false });
      if (!context) throw new Error("WebGL2 unavailable");
      renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
    }
    catch { queueMicrotask(() => { latest.current.onReady(false); setFailure("3D rendering is unavailable on this device. Use the evidence selector, presentation chapters and 2D map below."); }); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Interactive fictional 3D township; equivalent evidence selection is available beside the scene");
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x071d32, 190, 440);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 450);
    const initial = new THREE.Vector3(110, 118, 125);
    camera.position.copy(initial);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.minDistance = 40; controls.maxDistance = 360;
    controls.maxPolarAngle = Math.PI / 2.2; controls.enablePan = false;
    const hemi = new THREE.HemisphereLight(0xc6eaff, 0x234234, 2.8); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 3.4); sun.position.set(-30, 80, 50);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
    Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 10, far: 220 });
    scene.add(sun);
    const pickable: THREE.Object3D[] = [];
    const positions = new Map<string, THREE.Vector3>();
    const blocks = new Map<string, THREE.Mesh>();
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const tickers: ((t: number, animated: boolean) => void)[] = [];
    const material = (color: number) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 }); materials.push(m); return m; };
    const navy = material(0x143c56), road = material(0x162f42), paper = material(0xc0d4dd);
    const roof = material(0x406b7e), green = material(0x2fd67a), blue = material(0x21b6ff), orange = material(0xff9b50);
    const windows = material(0xffcf8a); windows.emissive.setHex(0xffb55a);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, parent: THREE.Object3D = scene) => {
      const geometry = new THREE.BoxGeometry(w, h, d); geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, m); mesh.position.set(x, y, z);
      mesh.castShadow = h > 0.4; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    const mark = (mesh: THREE.Object3D, id: string) => { mesh.userData.id = id; pickable.push(mesh); };
    const label = (text: string, x: number, y: number, z: number, color = "#dceefa", scaleX = 25) => {
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 80;
      const ctx = canvas.getContext("2d"); if (!ctx) return undefined;
      ctx.fillStyle = "#071d32"; ctx.fillRect(0, 0, 512, 80);
      ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.strokeRect(1, 1, 510, 78); ctx.globalAlpha = 1;
      ctx.font = "bold 29px sans-serif"; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(text, 256, 50, 490);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
      const m = new THREE.SpriteMaterial({ map: texture, depthTest: false, fog: false }); materials.push(m);
      const sprite = new THREE.Sprite(m); sprite.position.set(x, y, z); sprite.scale.set(scaleX, scaleX * 0.156, 1); sprite.renderOrder = 5; scene.add(sprite);
      return sprite;
    };
    // Soft radial glow, additive so it reads on both the night and day backdrops.
    const glowCanvas = document.createElement("canvas"); glowCanvas.width = glowCanvas.height = 64;
    const gctx = glowCanvas.getContext("2d");
    if (gctx) { const g = gctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)"); gctx.fillStyle = g; gctx.fillRect(0, 0, 64, 64); }
    const glowTexture = new THREE.CanvasTexture(glowCanvas); textures.push(glowTexture);
    const glow = (color: number, size: number, x: number, y: number, z: number) => {
      const m = new THREE.SpriteMaterial({ map: glowTexture, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }); materials.push(m);
      const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.set(size, size, 1); scene.add(s); return s;
    };
    const xy = (x: number, y: number) => new THREE.Vector3(x - 45, 0, y - 45);

    // Ground, roads, grid
    const ground = box(112, 2, 112, 0, -2, 0, navy); ground.castShadow = false;
    box(112, 0.15, 8, 0, -0.8, 0, road); box(8, 0.15, 112, 0, -0.8, 0, road);
    for (let i = -50; i <= 50; i += 8) { box(2.8, 0.1, 0.22, i, -0.6, 0, paper); box(0.22, 0.1, 2.8, 0, -0.6, i, paper); }
    const grid = new THREE.GridHelper(112, 28, 0x22445c, 0x16344a); grid.position.y = -0.85; scene.add(grid);

    // Street lamps (night only glow)
    const lampGlows: THREE.Sprite[] = []; const lampHeads: THREE.Material[] = [];
    const lampHead = material(0xffe2b0); lampHead.emissive.setHex(0xffc27a); lampHeads.push(lampHead);
    for (const [lx, lz] of [[-30, 5], [30, -5], [-5, 30], [5, -30], [-30, -5], [30, 5], [5, 30], [-5, -30]] as const) {
      box(0.35, 8, 0.35, lx, 4, lz, roof);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), lampHead); head.position.set(lx, 8.2, lz); scene.add(head); geometries.push(head.geometry);
      lampGlows.push(glow(0xffc27a, 12, lx, 8.2, lz));
    }

    // Blocks, buildings, trees, hatch for blocks with no data
    const hatchCanvas = document.createElement("canvas"); hatchCanvas.width = hatchCanvas.height = 64;
    const hctx = hatchCanvas.getContext("2d");
    if (hctx) { hctx.fillStyle = "#3c2a1c"; hctx.fillRect(0, 0, 64, 64); hctx.strokeStyle = "#ffb67f"; hctx.lineWidth = 6; for (let i = -64; i < 128; i += 22) { hctx.beginPath(); hctx.moveTo(i, 64); hctx.lineTo(i + 64, 0); hctx.stroke(); } }
    const hatchTexture = new THREE.CanvasTexture(hatchCanvas); hatchTexture.wrapS = hatchTexture.wrapT = THREE.RepeatWrapping; hatchTexture.repeat.set(5, 5); hatchTexture.colorSpace = THREE.SRGBColorSpace; textures.push(hatchTexture);
    const hatchMaterial = new THREE.MeshStandardMaterial({ map: hatchTexture, roughness: 1 }); materials.push(hatchMaterial);
    const maxEggs = Math.max(0, ...props.data.blocks.map(b => b.status === "DATA_UNAVAILABLE" ? 0 : b.eggs_per_interval ?? 0));
    const heatColumns: { mesh: THREE.Mesh; label?: THREE.Sprite; height: number }[] = [];
    const lowHeat = new THREE.Color(0x15506b), highHeat = new THREE.Color(0x9ff0ff);
    for (const b of props.data.blocks) {
      const p = xy(b.x, b.y); positions.set(b.id, p);
      const unavailable = b.status === "DATA_UNAVAILABLE";
      const m = material(unavailable ? 0x694a32 : 0x214c4e);
      const tile = box(33, 0.5, 33, p.x, -0.5, p.z, m); tile.castShadow = false; blocks.set(b.id, tile); mark(tile, b.id);
      if (unavailable) { const hatch = new THREE.Mesh(new THREE.PlaneGeometry(33, 33), hatchMaterial); geometries.push(hatch.geometry); hatch.rotation.x = -Math.PI / 2; hatch.position.set(p.x, -0.2, p.z); scene.add(hatch); mark(hatch, b.id); }
      label(b.name + (unavailable ? " / NO DATA" : ""), p.x, 1.5, p.z + 18, unavailable ? "#ffb67f" : "#dceefa");
      for (let i = 0; i < 4; i++) {
        const x = p.x + (i % 2 ? 7 : -7), z = p.z + (i < 2 ? -8 : 5), h = 4 + (i % 3) * 2;
        box(8, h, 7, x, h / 2, z, paper);
        box(9, 0.7, 8, x, h + 0.3, z, roof);
        box(4, 0.15, 3, x, h + 0.75, z, navy);
        for (let k = 0; k < 3; k++) box(1, 1.3, 0.1, x - 2.5 + k * 2.4, h / 2 + 0.4, z + 3.55, windows).castShadow = false;
      }
      for (let i = 0; i < 3; i++) {
        const x = p.x - 14, z = p.z - 10 + i * 10;
        box(0.6, 2, 0.6, x, 1, z, roof);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), green); geometries.push(crown.geometry); crown.castShadow = true; crown.position.set(x, 3.5, z); scene.add(crown);
      }
      // Egg-count column: height = eggs per valid interval, opacity = interval coverage. Not a risk score.
      if (!unavailable && b.eggs_per_interval != null) {
        const height = 3 + 22 * (maxEggs > 0 ? b.eggs_per_interval / maxEggs : 0);
        const coverage = b.expected_intervals > 0 ? b.valid_intervals / b.expected_intervals : 0;
        const colMat = new THREE.MeshStandardMaterial({ color: lowHeat.clone().lerp(highHeat, maxEggs > 0 ? b.eggs_per_interval / maxEggs : 0), transparent: true, opacity: 0.3 + 0.5 * coverage, emissive: 0x2a8fb0, emissiveIntensity: 0.5, roughness: 0.4 });
        materials.push(colMat);
        const geometry = new THREE.CylinderGeometry(3.2, 3.2, 1, 6); geometry.translate(0, 0.5, 0); geometries.push(geometry);
        const mesh = new THREE.Mesh(geometry, colMat); mesh.position.set(p.x, 0, p.z + 12); mesh.scale.y = 0.001; mesh.visible = false; scene.add(mesh); mark(mesh, b.id);
        const tag = label(`${b.eggs_per_interval.toFixed(1)} eggs/interval · ${b.valid_intervals}/${b.expected_intervals} valid`, p.x, height + 4, p.z + 12, "#9ff0ff", 28);
        if (tag) tag.visible = false;
        heatColumns.push({ mesh, label: tag, height });
      }
    }

    // Registered assets (candidate containers' parent locations)
    const assetPins = new Map<string, THREE.Mesh>();
    const rings = new Map<string, THREE.Mesh>();
    const ringMat = (color: number) => { const m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }); materials.push(m); return m; };
    const ringGeometry = new THREE.TorusGeometry(4, 0.22, 6, 40); geometries.push(ringGeometry);
    for (const a of props.data.assets) {
      const p = xy(a.x, a.y); positions.set(a.id, p);
      const stem = box(0.3, 12, 0.3, p.x, 6, p.z, blue); mark(stem, a.id);
      const pinMat = new THREE.MeshStandardMaterial({ color: 0x21b6ff, emissive: 0x21b6ff, emissiveIntensity: 0.5, roughness: 0.4 }); materials.push(pinMat);
      const pin = new THREE.Mesh(new THREE.OctahedronGeometry(1.8), pinMat); geometries.push(pin.geometry); pin.castShadow = true; pin.position.set(p.x, 13, p.z); scene.add(pin); mark(pin, a.id);
      assetPins.set(a.id, pin);
      const ring = new THREE.Mesh(ringGeometry, ringMat(0x7fd4ff)); ring.rotation.x = Math.PI / 2; ring.position.set(p.x, 0.7, p.z); ring.visible = false; scene.add(ring); rings.set(a.id, ring);
    }
    tickers.push((t, animated) => {
      assetPins.forEach((pin, id) => {
        const phase = id.length + pin.position.x * 0.13;
        pin.rotation.y = animated ? t * 0.9 : 0;
        pin.position.y = 13 + (animated ? Math.sin(t * 1.4 + phase) * 0.5 : 0);
        (pin.material as THREE.MeshStandardMaterial).emissiveIntensity = animated ? 0.55 + 0.35 * Math.sin(t * 2 + phase) : 0.6;
      });
    });

    // Ovitraps: pulsing glow when reporting, flickering orange when equipment is unavailable.
    const trapGlows: { sprite: THREE.Sprite; mat: THREE.MeshStandardMaterial; offline: boolean; phase: number }[] = [];
    for (const b of props.data.blocks) {
      props.data.traps.filter(t => t.block_id === b.id).forEach((t, i) => {
        const p = xy(b.x + 12, b.y - 10 + i * 7); positions.set(t.id, p);
        const unavailable = t.effective_status !== "ACTIVE";
        const color = unavailable ? 0xff9b50 : 0x2fd67a;
        const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.5 }); materials.push(m);
        const trap = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.85, 2.2, 12), m); geometries.push(trap.geometry); trap.castShadow = true; trap.position.set(p.x, 1.2, p.z); scene.add(trap); mark(trap, t.id);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.2, 6, 24), m); geometries.push(ring.geometry); ring.rotation.x = Math.PI / 2; ring.position.set(p.x, 0.6, p.z); scene.add(ring); mark(ring, t.id);
        trapGlows.push({ sprite: glow(color, 9, p.x, 1.6, p.z), mat: m, offline: unavailable, phase: i * 1.7 + b.x });
        if (unavailable) label("! " + t.name, p.x, 6, p.z, "#ffb67f");
      });
    }
    tickers.push((t, animated) => {
      for (const g of trapGlows) {
        const k = !animated ? 0.7 : g.offline ? (Math.sin(t * 3 + g.phase) > 0.55 ? 1 : 0.15) : 0.55 + 0.45 * Math.sin(t * 2.2 + g.phase);
        g.mat.emissiveIntensity = 0.2 + 0.9 * k; g.sprite.material.opacity = 0.25 + 0.55 * k; g.sprite.scale.setScalar(g.offline ? 8 : 8 + 2.5 * k);
      }
    });

    // Launch pad + human approval gate: nothing flies until the gate is passed in the real workflow.
    const pad = xy(-3, 93); pad.y = 0; positions.set("approval-gate", pad);
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x21b6ff, emissive: 0x21b6ff, emissiveIntensity: 0.4, roughness: 0.4 }); materials.push(gateMat);
    const gate = new THREE.Group(); gate.position.copy(pad); scene.add(gate);
    box(1, 9, 1, -5, 4.5, 0, gateMat, gate); box(1, 9, 1, 5, 4.5, 0, gateMat, gate); box(11, 1, 1, 0, 9.2, 0, gateMat, gate);
    const padDisc = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.3, 32), roof); geometries.push(padDisc.geometry); padDisc.position.set(pad.x, -0.2, pad.z + 6); padDisc.receiveShadow = true; scene.add(padDisc);
    label("HUMAN APPROVAL GATE", pad.x, 12.5, pad.z, "#7fd4ff", 24);

    // Selection ring
    const selectionMat = ringMat(0x21b6ff);
    const selection = new THREE.Mesh(new THREE.TorusGeometry(4, 0.25, 6, 48), selectionMat); geometries.push(selection.geometry);
    selection.rotation.x = Math.PI / 2; selection.visible = false; scene.add(selection);

    // Drone: body, spinning rotors, LED, scan beam, trail
    const drone = new THREE.Group(); scene.add(drone); drone.visible = false;
    box(2.5, 0.7, 1.5, 0, 0, 0, paper, drone);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), ringMat(0x7fd4ff)); geometries.push(led.geometry); led.position.set(0, -0.45, 0); drone.add(led);
    const rotors: THREE.Object3D[] = [];
    for (const x of [-2.4, 2.4]) for (const z of [-2.4, 2.4]) {
      const arm = box(0.3, 0.25, 3.5, x / 2, 0, z / 2, paper, drone); arm.rotation.y = x * z > 0 ? Math.PI / 4 : -Math.PI / 4;
      const pivot = new THREE.Group(); pivot.position.set(x, 0.3, z); drone.add(pivot); rotors.push(pivot);
      box(2.4, 0.05, 0.22, 0, 0, 0, blue, pivot); box(0.22, 0.05, 2.4, 0, 0, 0, blue, pivot);
    }
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x21b6ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); materials.push(beamMat);
    const beamGeometry = new THREE.ConeGeometry(4, 1, 28, 1, true); geometries.push(beamGeometry);
    const beam = new THREE.Mesh(beamGeometry, beamMat); beam.visible = false; scene.add(beam);
    const eventRing = new THREE.Mesh(ringGeometry, ringMat(0x21b6ff)); eventRing.rotation.x = Math.PI / 2; eventRing.visible = false; scene.add(eventRing);
    const tags = new Map<string, THREE.Sprite>();
    for (const [kind, style] of Object.entries(EVENT_STYLE)) { const s = label(style.text, 0, 0, 0, style.css, 30); if (s) { s.visible = false; tags.set(kind, s); } }
    const TRAIL = 70;
    const trailPositions = new Float32Array(TRAIL * 3), trailColors = new Float32Array(TRAIL * 3);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3)); trailGeometry.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));
    const trailMaterial = new THREE.LineBasicMaterial({ vertexColors: true }); materials.push(trailMaterial);
    const trail = new THREE.Line(trailGeometry, trailMaterial); trail.frustumCulled = false; trail.visible = false; scene.add(trail);
    let trailCount = 0, trailTimer = 0;
    const routeMaterial = new THREE.LineDashedMaterial({ color: 0x21b6ff, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.55 }); materials.push(routeMaterial);
    const route = new THREE.Line(new THREE.BufferGeometry(), routeMaterial); route.visible = false; scene.add(route);

    let frame = 0, lastTime = 0, clock = 0, commandSequence = -1, fitScale = 1, droneElapsed = 0;
    let currentTarget: string | undefined, currentSelected = "", routeKey = "", eventKind: string | undefined;
    let night = !props.night, heatOn = !props.heat, loopStage = -1, planView = false, planScores = new Map<string, number>();
    let loopRings = new Map<string, keyof typeof LOOP_RING>();
    let fly: { t: number; dur: number; fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null = null;
    const from = new THREE.Vector3(), target = new THREE.Vector3(-48, 19, 48);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const render = () => renderer.render(scene, camera);
    const live = () => !document.hidden && !reduced.matches;

    const startFly = (toP: THREE.Vector3, toT: THREE.Vector3) => {
      if (reduced.matches) { camera.position.copy(toP); controls.target.copy(toT); controls.update(); fly = null; return; }
      fly = { t: 0, dur: 1.2, fromP: camera.position.clone(), toP, fromT: controls.target.clone(), toT };
    };
    const flyToObject = (point: THREE.Vector3, distance: number) => {
      const toT = new THREE.Vector3(point.x, 0, point.z);
      const offset = camera.position.clone().sub(controls.target); if (offset.lengthSq() < 1) offset.copy(initial);
      offset.setLength(Math.min(Math.max(offset.length(), controls.minDistance), distance));
      startFly(toT.clone().add(offset), toT);
    };

    const applyTheme = () => {
      const bg = night ? 0x071d32 : 0xa9d6ef;
      renderer.setClearColor(bg); (scene.fog as THREE.Fog).color.setHex(bg); container.style.background = night ? "#071d32" : "#a9d6ef";
      hemi.color.setHex(night ? 0x6f9bd1 : 0xc6eaff); hemi.groundColor.setHex(night ? 0x0b1a24 : 0x4a6b55); hemi.intensity = night ? 1.1 : 2.8;
      sun.color.setHex(night ? 0x8fb0ff : 0xfff2d8); sun.intensity = night ? 1.3 : 3.4;
      sun.position.set(night ? 40 : -30, 80, night ? -30 : 50);
      navy.color.setHex(night ? 0x143c56 : 0x5f8aa3); road.color.setHex(night ? 0x162f42 : 0x3d5668);
      windows.emissiveIntensity = night ? 1.6 : 0.1; lampHead.emissiveIntensity = night ? 1.5 : 0;
      lampGlows.forEach(s => { s.visible = night; });
    };

    const applyHeat = () => {
      heatColumns.forEach(c => { c.mesh.visible = heatOn; if (c.label) c.label.visible = heatOn; if (!heatOn) c.mesh.scale.y = 0.001; });
    };

    // Per-frame advance. `animated` is false for reduced motion/hidden tab: everything snaps to its final state.
    const advance = (dt: number, animated: boolean) => {
      clock += dt;
      if (fly) {
        fly.t = animated ? Math.min(fly.t + dt / fly.dur, 1) : 1;
        const k = smooth(fly.t);
        camera.position.lerpVectors(fly.fromP, fly.toP, k); controls.target.lerpVectors(fly.fromT, fly.toT, k);
        controls.update(); if (fly.t >= 1) fly = null;
      }
      for (const c of heatColumns) {
        if (!heatOn) continue;
        c.mesh.scale.y = animated ? c.mesh.scale.y + (c.height - c.mesh.scale.y) * Math.min(dt * 4, 1) : c.height;
      }
      tickers.forEach(fn => fn(clock, animated));
      // Selection and loop rings
      selectionMat.opacity = animated ? 0.65 + 0.3 * Math.sin(clock * 3) : 0.9;
      rings.forEach((ring, id) => {
        const kind = loopRings.get(id); ring.visible = !!kind;
        if (!kind) return;
        const mat = ring.material as THREE.MeshBasicMaterial; mat.color.setHex(LOOP_RING[kind]);
        const phase = animated ? (clock * 0.7 + ring.position.x * 0.05) % 1 : 0.2;
        ring.scale.setScalar(loopStage === 4 && kind === "action" ? 1.15 : 1 + phase * 0.9);
        mat.opacity = loopStage === 4 && kind === "action" ? 0.55 : 1 - phase;
      });
      gateMat.emissiveIntensity = loopStage === 2 ? (animated ? 1.2 + 0.6 * Math.sin(clock * 4) : 1.6) : 0.4;
      gateMat.color.setHex(loopStage === 2 ? 0x2fd67a : 0x21b6ff); gateMat.emissive.setHex(loopStage === 2 ? 0x2fd67a : 0x21b6ff);
      // Drone
      const hasTarget = drone.visible;
      if (hasTarget) {
        droneElapsed += animated ? dt : 100;
        const travel = Math.min(droneElapsed / 2.4, 1);
        drone.position.lerpVectors(from, target, smooth(travel));
        const hover = Math.min(Math.max(droneElapsed - 2.4, 0) / 1.1, 1);
        drone.position.y -= smooth(hover) * 4;
        if (animated) drone.position.y += Math.sin(clock * 2.8) * 0.15;
        const style = eventKind ? EVENT_STYLE[eventKind] : undefined;
        const arrived = travel >= 1 && !!style;
        led.position.set(0, -0.45, 0); (led.material as THREE.MeshBasicMaterial).color.setHex(style ? style.color : 0x7fd4ff);
        rotors.forEach((r, i) => { r.rotation.y = animated ? clock * (i % 2 ? 38 : -38) : i; });
        drone.rotation.y = animated && travel < 1 ? Math.atan2(target.x - from.x, target.z - from.z) : drone.rotation.y;
        beam.visible = arrived;
        if (arrived && style) {
          const h = Math.max(drone.position.y, 1);
          beam.position.set(drone.position.x, h / 2, drone.position.z); beam.scale.set(1, h, 1);
          beamMat.color.setHex(style.color); beamMat.opacity = animated ? 0.13 + 0.06 * Math.sin(clock * 5) : 0.16;
          const eventPos = currentTarget ? positions.get(currentTarget) : undefined;
          eventRing.visible = !!eventPos;
          if (eventPos) {
            const phase = animated ? (clock * 0.9) % 1 : 0.3;
            eventRing.position.set(eventPos.x, 0.8, eventPos.z); eventRing.scale.setScalar(0.7 + phase * 1.6);
            const em = eventRing.material as THREE.MeshBasicMaterial; em.color.setHex(style.color); em.opacity = 1 - phase;
          }
        } else eventRing.visible = false;
        tags.forEach((s, k) => { s.visible = arrived && k === eventKind; if (s.visible && currentTarget) { const ep = positions.get(currentTarget); if (ep) s.position.set(ep.x, 24, ep.z); } });
        // Fading trail
        trail.visible = animated && travel < 1 + 0.001 && trailCount > 1;
        trailTimer += dt;
        if (animated && trailTimer > 0.03 && (travel < 1)) {
          trailTimer = 0;
          trailPositions.copyWithin(3, 0, (TRAIL - 1) * 3); trailPositions.set([drone.position.x, drone.position.y, drone.position.z], 0);
          trailCount = Math.min(trailCount + 1, TRAIL);
          for (let i = 0; i < TRAIL; i++) { const f = i < trailCount ? 1 - i / TRAIL : 0; trailColors.set([0.13 * f, 0.71 * f, 1 * f], i * 3); }
          trailGeometry.attributes.position.needsUpdate = true; trailGeometry.attributes.color.needsUpdate = true; trailGeometry.setDrawRange(0, trailCount);
        }
        if (travel >= 1) trail.visible = trailCount > 1 && animated && hover < 1;
      } else { beam.visible = false; eventRing.visible = false; trail.visible = false; tags.forEach(s => { s.visible = false; }); }
    };

    const loop = (time: number) => {
      frame = 0;
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0; lastTime = time;
      advance(dt, true); render();
      if (live()) frame = requestAnimationFrame(loop);
    };
    const motion = () => {
      cancelAnimationFrame(frame); frame = 0; lastTime = 0;
      if (live()) frame = requestAnimationFrame(loop);
      else { advance(0, false); render(); }
    };

    const update = (p: Props) => {
      if (p.night !== night) { night = p.night; applyTheme(); }
      if (p.heat !== heatOn) { heatOn = p.heat; applyHeat(); }
      loopStage = p.loopStage;
      const selectedPosition = positions.get(p.selected);
      selection.visible = !!selectedPosition;
      if (selectedPosition) selection.position.set(selectedPosition.x, 0.9, selectedPosition.z);
      if (p.selected !== currentSelected) { currentSelected = p.selected; if (selectedPosition) flyToObject(selectedPosition, 95); }
      const plan = [...p.data.plans].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      planView = p.chapter === 2 || p.loopStage === 1;
      planScores = new Map(plan?.result.block_priorities.map(v => [v.id, v.score]) ?? []);
      const maxScore = Math.max(1, ...planScores.values());
      for (const b of p.data.blocks) {
        const m = blocks.get(b.id)?.material as THREE.MeshStandardMaterial;
        const score = planScores.get(b.id);
        m.color.setHex(b.status === "DATA_UNAVAILABLE" ? 0x694a32 : planView && score != null ? 0x285979 : 0x214c4e);
        const selectedBlock = p.selected === b.id;
        m.emissive.setHex(selectedBlock ? 0x174a66 : planView && score != null ? 0x21b6ff : 0x000000);
        m.emissiveIntensity = selectedBlock ? 1 : planView && score != null ? 0.15 + 0.45 * (score / maxScore) : 1;
      }
      // Loop highlights per stage (derived only from recorded events/plans; nothing inferred)
      const next = new Map<string, keyof typeof LOOP_RING>();
      if (p.loopStage === 0) p.loop.found.forEach(id => next.set(id, "found"));
      if (p.loopStage === 3 || p.loopStage === 4) { p.loop.review.forEach(id => next.set(id, "review")); p.loop.action.forEach(id => next.set(id, "action")); }
      loopRings = next;

      // Recorded mission route (all assets in event order) + current event drone target
      const eventPosition = p.eventAsset ? positions.get(p.eventAsset) : undefined;
      const key = p.route.join("|");
      if (key !== routeKey) {
        routeKey = key;
        const points = p.route.map(id => positions.get(id)).filter((v): v is THREE.Vector3 => !!v).map(v => new THREE.Vector3(v.x, 19, v.z));
        route.geometry.dispose();
        route.geometry = new THREE.BufferGeometry().setFromPoints(points.length ? [new THREE.Vector3(-48, 19, 48), ...points] : []);
        route.computeLineDistances();
      }
      route.visible = !!eventPosition && p.route.length > 0;
      drone.visible = !!eventPosition;
      eventKind = p.eventKind;
      if (eventPosition && p.eventAsset !== currentTarget) {
        from.copy(currentTarget ? drone.position.clone().setY(19) : new THREE.Vector3(-48, 19, 48));
        target.set(eventPosition.x, 19, eventPosition.z); droneElapsed = 0; trailCount = 0;
        if (!p.playing || reduced.matches) droneElapsed = 100;
      }
      currentTarget = eventPosition ? p.eventAsset : undefined;
      if (!eventPosition) droneElapsed = 0;

      if (p.cameraAction.sequence !== commandSequence) {
        commandSequence = p.cameraAction.sequence;
        const command = p.cameraAction.command;
        const offset = camera.position.clone().sub(controls.target);
        if (command === "reset") startFly(initial.clone().multiplyScalar(fitScale), new THREE.Vector3());
        else if (command === "gate") flyToObject(pad, 85);
        else if (command === "left" || command === "right") { offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), command === "left" ? -0.3 : 0.3); camera.position.copy(controls.target).add(offset); controls.update(); }
        else { offset.multiplyScalar(command === "in" ? 0.85 : 1.18).clampLength(controls.minDistance, controls.maxDistance); camera.position.copy(controls.target).add(offset); controls.update(); }
      }
      motion();
    };
    handle.current = { update };
    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h;
      const nextFit = Math.max(1, 1.3 / camera.aspect);
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(nextFit / fitScale);
      camera.position.copy(controls.target).add(offset); fitScale = nextFit;
      camera.updateProjectionMatrix(); controls.update(); render();
    };
    const observer = new ResizeObserver(resize); observer.observe(container);
    const raycaster = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; fly = null; };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = raycaster.intersectObjects(pickable.filter(o => o.visible), false)[0];
      if (hit) latest.current.onSelect(hit.object.userData.id as string);
    };
    const wheel = () => { fly = null; };
    const contextLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(frame); frame = 0; latest.current.onReady(false); setFailure("3D graphics were interrupted. Reload to restore the scene, or continue with the evidence selector and 2D map."); };
    const onChange = () => { if (!frame) render(); };
    controls.addEventListener("change", onChange);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("wheel", wheel, { passive: true });
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    document.addEventListener("visibilitychange", motion); reduced.addEventListener("change", motion);
    controls.update(); resize(); update(latest.current);
    queueMicrotask(() => latest.current.onReady(true));
    return () => {
      handle.current = null; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      document.removeEventListener("visibilitychange", motion); reduced.removeEventListener("change", motion);
      renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("wheel", wheel); renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      scene.traverse(object => { if (object instanceof THREE.Line) object.geometry.dispose(); });
      geometries.forEach(g => g.dispose()); trailGeometry.dispose();
      if (Array.isArray(grid.material)) grid.material.forEach(m => m.dispose()); else grid.material.dispose();
      grid.geometry.dispose();
      materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [props.data]);
  return <><div ref={host} className="township-canvas" data-testid="township-canvas" />{failure && <p className="township-render-status" role="status">{failure}</p>}</>;
}
