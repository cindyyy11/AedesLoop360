"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { PAD } from "./township-geo";
import type { TownshipData } from "./township-3d";

// The fictional township uses 0-100 plan units. They are laid onto a real basemap at a configurable,
// non-residential anchor purely for presentation: 1 unit = METRES_PER_UNIT metres. The overlay is NOT a
// survey and carries no location accuracy; the basemap is context only.
const [ANCHOR_LAT, ANCHOR_LNG] = (process.env.NEXT_PUBLIC_MAP_ANCHOR ?? "1.2802,103.8715").split(",").map(Number);
const METRES_PER_UNIT = 6;
const KIND_COLOR: Record<string, string> = { SKIPPED: "#c7d3db", GROUND_REVIEW: "#ffb67f", MOCK_ACTION_RECORDED: "#21b6ff" };
const toLatLng = (x: number, y: number): L.LatLngTuple => [
  ANCHOR_LAT - ((y - 50) * METRES_PER_UNIT) / 111320,
  ANCHOR_LNG + ((x - 50) * METRES_PER_UNIT) / (111320 * Math.cos((ANCHOR_LAT * Math.PI) / 180)),
];

export type MapCommand = { command: string; sequence: number };
type MapData = Pick<TownshipData, "blocks" | "assets" | "traps">;
// Plan-unit extent to show: the whole township when blocks exist, otherwise just the pad and the given assets.
const extent = (data: MapData) => {
  const pts = [PAD, ...data.assets.map(a => ({ x: a.x, y: a.y })), ...data.blocks.flatMap(b => [{ x: b.x - 14, y: b.y - 14 }, { x: b.x + 14, y: b.y + 14 }])];
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), pad = data.blocks.length ? 8 : 10;
  return L.latLngBounds([toLatLng(Math.min(...xs) - pad, Math.min(...ys) - pad), toLatLng(Math.max(...xs) + pad, Math.max(...ys) + pad)]);
};
type Props = {
  data: MapData; dronePoint?: { x: number; y: number }; route: string[]; visited: number; routeOnly: boolean;
  eventAsset?: string; eventKind?: string; selected: string; onSelect: (id: string) => void; mapCommand: MapCommand;
};

export default function TownshipMap({ data, dronePoint, route, visited, routeOnly, eventAsset, eventKind, selected, onSelect, mapCommand }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  const drone = useRef<L.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const dataRef = useRef(data);
  const [tilesFailed, setTilesFailed] = useState(false);
  useEffect(() => { onSelectRef.current = onSelect; dataRef.current = data; });

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const instance = L.map(container, { zoomControl: false, attributionControl: true, zoomSnap: 0.25, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(instance);
    tiles.on("tileerror", () => setTilesFailed(true));
    tiles.on("tileload", () => setTilesFailed(false));
    overlay.current = L.layerGroup().addTo(instance);
    map.current = instance;
    instance.fitBounds(extent(dataRef.current));
    return () => { instance.stop(); instance.remove(); map.current = null; overlay.current = null; drone.current = null; };
  }, []);

  // Static layers: blocks, assets, traps, route.
  useEffect(() => {
    const group = overlay.current;
    if (!group) return;
    group.clearLayers();
    const spots = new Map<string, { x: number; y: number }>();
    const pick = (id: string) => () => onSelectRef.current(id);
    for (const b of data.blocks) {
      spots.set(b.id, { x: b.x, y: b.y });
      const unavailable = b.status === "DATA_UNAVAILABLE";
      L.rectangle([toLatLng(b.x - 14, b.y - 14), toLatLng(b.x + 14, b.y + 14)], {
        color: selected === b.id ? "#ffffff" : unavailable ? "#ffb67f" : "#3d8ca6", weight: selected === b.id ? 3 : 1.5,
        fillColor: unavailable ? "#ffb67f" : "#2fa38f", fillOpacity: unavailable ? 0.12 : 0.22, dashArray: unavailable ? "4 4" : undefined,
      }).bindTooltip(`${b.name} · ${b.status.replaceAll("_", " ")}`).on("click", pick(b.id)).addTo(group);
    }
    for (const a of data.assets) {
      spots.set(a.id, { x: a.x, y: a.y });
      L.circleMarker(toLatLng(a.x, a.y), { radius: selected === a.id ? 8 : 5, color: selected === a.id ? "#fff" : "#04202f", weight: 1.5, fillColor: "#21b6ff", fillOpacity: 1 })
        .bindTooltip(a.name).on("click", pick(a.id)).addTo(group);
    }
    for (const b of data.blocks) data.traps.filter(t => t.block_id === b.id).forEach((t, i) => {
      const spot = { x: b.x + 12, y: b.y - 10 + i * 7 }; spots.set(t.id, spot);
      const off = t.effective_status !== "ACTIVE";
      L.circleMarker(toLatLng(spot.x, spot.y), { radius: selected === t.id ? 8 : 6, color: selected === t.id ? "#fff" : "#04202f", weight: 1.5, fillColor: off ? "#ffb67f" : "#2fd67a", fillOpacity: 1 })
        .bindTooltip(`${t.name} · ${t.effective_status}${off ? " (data unavailable, not low)" : ""}`).on("click", pick(t.id)).addTo(group);
    });
    L.marker(toLatLng(PAD.x, PAD.y), { icon: L.divIcon({ className: "tm-pad-icon", html: "<span>Pad</span>", iconSize: [34, 20] }), interactive: false }).addTo(group);
    const points = route.map(id => spots.get(id)).filter((p): p is { x: number; y: number } => !!p);
    const path = (list: { x: number; y: number }[]) => [PAD, ...list].map(p => toLatLng(p.x, p.y));
    if (points.length) L.polyline(path(points), { color: "#21b6ff", weight: 3, opacity: 0.7, dashArray: "6 6", className: "tm-route" }).addTo(group);
    if (!routeOnly && visited > 0) L.polyline(path(points.slice(0, visited)), { color: "#0b6fa4", weight: 5, opacity: 0.95, className: "tm-flown" }).addTo(group);
  }, [data, route, visited, routeOnly, selected]);

  // Drone marker follows the replay position.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const spots = new Map<string, { x: number; y: number }>();
    data.assets.forEach(a => spots.set(a.id, { x: a.x, y: a.y }));
    const at = dronePoint ?? (eventAsset ? spots.get(eventAsset) : routeOnly ? PAD : undefined);
    if (!at) { drone.current?.remove(); drone.current = null; return; }
    const color = eventKind ? KIND_COLOR[eventKind] ?? "#21b6ff" : "#21b6ff";
    const icon = L.divIcon({ className: "tm-drone-icon", html: `<i style="--c:${color}"></i>`, iconSize: [26, 26], iconAnchor: [13, 13] });
    if (!drone.current) drone.current = L.marker(toLatLng(at.x, at.y), { icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(instance);
    else { drone.current.setIcon(icon); drone.current.setLatLng(toLatLng(at.x, at.y)); }
  }, [data.assets, dronePoint, eventAsset, eventKind, routeOnly]);

  // Navigator commands (rotate is a 3D-only control).
  useEffect(() => {
    const instance = map.current;
    if (!instance || mapCommand.sequence === 0) return;
    if (mapCommand.command === "in") instance.zoomIn(1);
    else if (mapCommand.command === "out") instance.zoomOut(1);
    else if (mapCommand.command === "reset") instance.fitBounds(extent(dataRef.current));
  }, [mapCommand]);

  return <div className="township-map-wrap">
    <div ref={host} className="township-map" role="group" aria-label="Real-world basemap with the fictional township placed on it and the mission route" />
    {tilesFailed && <p className="township-map-note" role="status">Basemap tiles could not load (offline or blocked). The fictional township overlay and route still show.</p>}
  </div>;
}
