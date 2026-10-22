"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TownshipData } from "./township-3d";

type Props = {
  data: TownshipData; chapter: number; selected: string;
  onSelect: (id: string) => void; eventAsset?: string; playing: boolean;
  onReady: (ready: boolean) => void;
  cameraAction: { command: string; sequence: number };
};
type SceneHandle = { update: (props: Props) => void };

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
    renderer.setClearColor(0x071d32);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Interactive fictional 3D township; equivalent evidence selection is available beside the scene");
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 450);
    const initial = new THREE.Vector3(110, 118, 125);
    camera.position.copy(initial);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.minDistance = 55; controls.maxDistance = 360;
    controls.maxPolarAngle = Math.PI / 2.2; controls.enablePan = false;
    scene.add(new THREE.HemisphereLight(0xc6eaff, 0x234234, 2.8));
    const sun = new THREE.DirectionalLight(0xffffff, 3.4); sun.position.set(-30, 80, 50); scene.add(sun);
    const pickable: THREE.Object3D[] = [];
    const positions = new Map<string, THREE.Vector3>();
    const blocks = new Map<string, THREE.Mesh>();
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const material = (color: number) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 }); materials.push(m); return m; };
    const navy = material(0x143c56), road = material(0x162f42), paper = material(0xc0d4dd);
    const roof = material(0x406b7e), green = material(0x2fd67a), blue = material(0x21b6ff), orange = material(0xff9b50);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, parent: THREE.Object3D = scene) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    const mark = (mesh: THREE.Object3D, id: string) => { mesh.userData.id = id; pickable.push(mesh); };
    const label = (text: string, x: number, y: number, z: number, color = "#dceefa") => {
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 80;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.fillStyle = "#071d32"; ctx.fillRect(0, 0, 512, 80);
      ctx.font = "bold 29px sans-serif"; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(text, 256, 50, 490);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
      const m = new THREE.SpriteMaterial({ map: texture, depthTest: false }); materials.push(m);
      const sprite = new THREE.Sprite(m); sprite.position.set(x, y, z); sprite.scale.set(25, 3.9, 1); scene.add(sprite);
    };
    const xy = (x: number, y: number) => new THREE.Vector3(x - 45, 0, y - 45);
    box(112, 2, 112, 0, -2, 0, navy);
    box(112, 0.15, 8, 0, -0.8, 0, road); box(8, 0.15, 112, 0, -0.8, 0, road);
    for (let i = -50; i <= 50; i += 8) { box(2.8, 0.1, 0.22, i, -0.6, 0, paper); box(0.22, 0.1, 2.8, 0, -0.6, i, paper); }
    const grid = new THREE.GridHelper(112, 28, 0x22445c, 0x16344a); grid.position.y = -0.85; scene.add(grid);
    for (const b of props.data.blocks) {
      const p = xy(b.x, b.y); positions.set(b.id, p);
      const m = material(b.status === "DATA_UNAVAILABLE" ? 0x694a32 : 0x214c4e);
      const tile = box(33, 0.5, 33, p.x, -0.5, p.z, m); blocks.set(b.id, tile); mark(tile, b.id);
      label(b.name + (b.status === "DATA_UNAVAILABLE" ? " / NO DATA" : ""), p.x, 1.5, p.z + 18, b.status === "DATA_UNAVAILABLE" ? "#ffb67f" : "#dceefa");
      for (let i = 0; i < 4; i++) {
        const x = p.x + (i % 2 ? 7 : -7), z = p.z + (i < 2 ? -8 : 5), h = 4 + (i % 3) * 2;
        box(8, h, 7, x, h / 2, z, paper);
        box(9, 0.7, 8, x, h + 0.3, z, roof);
        box(4, 0.15, 3, x, h + 0.75, z, navy);
        for (let k = 0; k < 3; k++) box(1, 1.3, 0.1, x - 2.5 + k * 2.4, h / 2 + 0.4, z + 3.55, blue);
      }
      for (let i = 0; i < 3; i++) {
        const x = p.x - 14, z = p.z - 10 + i * 10;
        box(0.6, 2, 0.6, x, 1, z, roof);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), green); crown.position.set(x, 3.5, z); scene.add(crown);
      }
    }
    for (const a of props.data.assets) {
      const p = xy(a.x, a.y); positions.set(a.id, p);
      const stem = box(0.3, 12, 0.3, p.x, 6, p.z, blue); mark(stem, a.id);
      const pin = new THREE.Mesh(new THREE.OctahedronGeometry(1.8), blue); pin.position.set(p.x, 13, p.z); scene.add(pin); mark(pin, a.id);
    }
    for (const b of props.data.blocks) {
      props.data.traps.filter(t => t.block_id === b.id).forEach((t, i) => {
        const p = xy(b.x + 12, b.y - 10 + i * 7); positions.set(t.id, p);
        const unavailable = t.effective_status !== "ACTIVE";
        const m = unavailable ? orange : green;
        const trap = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.85, 2.2, 12), m); trap.position.set(p.x, 1.2, p.z); scene.add(trap); mark(trap, t.id);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.2, 6, 24), m); ring.rotation.x = Math.PI / 2; ring.position.set(p.x, 0.6, p.z); scene.add(ring); mark(ring, t.id);
        if (unavailable) label("! " + t.name, p.x, 6, p.z, "#ffb67f");
      });
    }
    const selection = new THREE.Mesh(new THREE.TorusGeometry(4, 0.25, 6, 48), blue);
    selection.rotation.x = Math.PI / 2; selection.visible = false; scene.add(selection);
    const drone = new THREE.Group(); scene.add(drone); drone.visible = false;
    box(2.5, 0.7, 1.5, 0, 0, 0, paper, drone);
    for (const x of [-2.4, 2.4]) for (const z of [-2.4, 2.4]) {
      const arm = box(0.3, 0.25, 3.5, x / 2, 0, z / 2, paper, drone); arm.rotation.y = x * z > 0 ? Math.PI / 4 : -Math.PI / 4;
      const rotor = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.16, 6, 20), blue); rotor.rotation.x = Math.PI / 2; rotor.position.set(x, 0, z); drone.add(rotor);
    }
    const routeMaterial = new THREE.LineDashedMaterial({ color: 0x21b6ff, dashSize: 1.2, gapSize: 0.8 }); materials.push(routeMaterial);
    const route = new THREE.Line(new THREE.BufferGeometry(), routeMaterial); scene.add(route);
    let frame = 0, lastTime = 0, elapsed = 0, commandSequence = -1, fitScale = 1;
    let currentTarget: string | undefined;
    let running = false;
    const from = new THREE.Vector3(), target = new THREE.Vector3();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const render = () => renderer.render(scene, camera);
    const animate = (time: number) => {
      if (!running || document.hidden || reduced.matches) { frame = 0; lastTime = 0; return; }
      elapsed += lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0; lastTime = time;
      const t = Math.min(elapsed / 2, 1); drone.position.lerpVectors(from, target, t * t * (3 - 2 * t));
      drone.position.y += Math.sin(time / 350) * 0.15;
      render(); frame = requestAnimationFrame(animate);
    };
    const motion = () => {
      cancelAnimationFrame(frame); frame = 0; lastTime = 0;
      if (running && !document.hidden && !reduced.matches) frame = requestAnimationFrame(animate);
      else { drone.position.copy(target); render(); }
    };
    const update = (p: Props) => {
      const selectedPosition = positions.get(p.selected);
      selection.visible = !!selectedPosition;
      if (selectedPosition) selection.position.set(selectedPosition.x, 0.9, selectedPosition.z);
      const plan = [...p.data.plans].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      for (const b of p.data.blocks) {
        const m = blocks.get(b.id)?.material as THREE.MeshStandardMaterial;
        const priority = plan?.result.block_priorities.find(v => v.id === b.id);
        m.color.setHex(b.status === "DATA_UNAVAILABLE" ? 0x694a32 : p.chapter === 2 && priority ? 0x285979 : 0x214c4e);
        m.emissive.setHex(p.selected === b.id ? 0x174a66 : 0x000000);
      }
      const eventPosition = p.eventAsset ? positions.get(p.eventAsset) : undefined;
      drone.visible = !!eventPosition; route.visible = !!eventPosition;
      if (eventPosition && p.eventAsset !== currentTarget) {
        from.copy(currentTarget ? drone.position : new THREE.Vector3(-48, 19, 48));
        target.set(eventPosition.x, 19, eventPosition.z); elapsed = 0;
        route.geometry.dispose(); route.geometry = new THREE.BufferGeometry().setFromPoints([from, target]); route.computeLineDistances();
        if (!p.playing || reduced.matches) drone.position.copy(target);
      }
      currentTarget = p.eventAsset;
      running = p.playing && !!eventPosition;
      if (p.cameraAction.sequence !== commandSequence) {
        commandSequence = p.cameraAction.sequence;
        const command = p.cameraAction.command;
        if (command === "reset") { camera.position.copy(initial).multiplyScalar(fitScale); controls.target.set(0, 0, 0); }
        else if (command === "left" || command === "right") camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), command === "left" ? -0.3 : 0.3);
        else { const scale = command === "in" ? 0.85 : 1.18; camera.position.multiplyScalar(scale); camera.position.clampLength(controls.minDistance, controls.maxDistance); }
        controls.update();
      }
      motion(); render();
    };
    handle.current = { update };
    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h;
      const nextFit = Math.max(1, 1.3 / camera.aspect);
      camera.position.multiplyScalar(nextFit / fitScale); fitScale = nextFit;
      camera.updateProjectionMatrix(); controls.update(); render();
    };
    const observer = new ResizeObserver(resize); observer.observe(container);
    const raycaster = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = raycaster.intersectObjects(pickable, false)[0];
      if (hit) latest.current.onSelect(hit.object.userData.id as string);
    };
    const contextLost = (e: Event) => { e.preventDefault(); running = false; cancelAnimationFrame(frame); latest.current.onReady(false); setFailure("3D graphics were interrupted. Reload to restore the scene, or continue with the evidence selector and 2D map."); };
    controls.addEventListener("change", render);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    document.addEventListener("visibilitychange", motion); reduced.addEventListener("change", motion);
    controls.update(); resize(); update(latest.current);
    queueMicrotask(() => latest.current.onReady(true));
    return () => {
      running = false; handle.current = null; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      document.removeEventListener("visibilitychange", motion); reduced.removeEventListener("change", motion);
      renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointerup", pointerUp); renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Line) object.geometry.dispose(); });
      if (Array.isArray(grid.material)) grid.material.forEach(m => m.dispose()); else grid.material.dispose();
      materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [props.data]);
  return <><div ref={host} className="township-canvas" data-testid="township-canvas" />{failure && <p className="township-render-status" role="status">{failure}</p>}</>;
}
