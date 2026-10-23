/* Frame-to-frame box matching for the live detection panel.
   This is a display aid, not a count of containers: a moving camera, a missed detection or a
   partly hidden object can all split one object into two tracks. */

export type Box = [number, number, number, number];
export type Detection = { object_class: string; bbox: number[]; confidence: number };
export type Track = { id: number; object_class: string; box: Box; confidence: number; hits: number; misses: number };

export const MIN_IOU = 0.3;
export const CONFIRM_HITS = 2;
export const MAX_MISSES = 3;
const SMOOTHING = 0.6; // weight of the newest box

export function iou(a: Box, b: Box): number {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}

export class Tracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private confirmedIds = new Set<number>();

  /** Feed one frame's detections; returns the tracks to draw (confirmed and seen this frame). */
  update(detections: Detection[]): Track[] {
    const boxes = detections.map(d => d.bbox as Box);
    const pairs: { t: number; d: number; score: number }[] = [];
    this.tracks.forEach((track, t) => boxes.forEach((box, d) => {
      if (detections[d].object_class !== track.object_class) return;
      const score = iou(track.box, box);
      if (score >= MIN_IOU) pairs.push({ t, d, score });
    }));
    pairs.sort((x, y) => y.score - x.score);
    const usedTracks = new Set<number>(), usedDetections = new Set<number>();
    for (const { t, d } of pairs) {
      if (usedTracks.has(t) || usedDetections.has(d)) continue;
      usedTracks.add(t); usedDetections.add(d);
      const track = this.tracks[t];
      track.box = track.box.map((v, i) => SMOOTHING * boxes[d][i] + (1 - SMOOTHING) * v) as Box;
      track.confidence = detections[d].confidence;
      track.hits += 1; track.misses = 0;
      if (track.hits >= CONFIRM_HITS) this.confirmedIds.add(track.id);
    }
    this.tracks.forEach((track, t) => { if (!usedTracks.has(t)) track.misses += 1; });
    detections.forEach((d, i) => {
      if (usedDetections.has(i)) return;
      this.tracks.push({ id: this.nextId++, object_class: d.object_class, box: [...boxes[i]] as Box, confidence: d.confidence, hits: 1, misses: 0 });
    });
    this.tracks = this.tracks.filter(t => t.misses <= MAX_MISSES);
    return this.tracks.filter(t => t.hits >= CONFIRM_HITS && t.misses === 0);
  }

  /** Distinct confirmed tracks since the feed started. An upper-bound-ish display figure, not a container count. */
  get distinct(): number { return this.confirmedIds.size; }

  reset() { this.tracks = []; this.confirmedIds.clear(); this.nextId = 1; }
}
