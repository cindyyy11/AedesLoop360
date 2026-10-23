import { test, expect } from "@playwright/test";
import { MAX_MISSES, Tracker, iou, type Detection } from "../components/live-tracker";

const det = (box: number[], cls = "water_tank", confidence = 0.8): Detection => ({ object_class: cls, bbox: box, confidence });

test("iou is 1 for identical boxes, 0 for disjoint boxes", () => {
  expect(iou([0, 0, 0.5, 0.5], [0, 0, 0.5, 0.5])).toBe(1);
  expect(iou([0, 0, 0.2, 0.2], [0.5, 0.5, 0.9, 0.9])).toBe(0);
  expect(iou([0, 0, 0.4, 0.4], [0.2, 0, 0.6, 0.4])).toBeCloseTo(1 / 3, 5);
});

test("a box needs repeated sightings before it is shown, and keeps its id", () => {
  const t = new Tracker();
  expect(t.update([det([0.4, 0.5, 0.58, 0.65])])).toHaveLength(0); // first sighting is not shown
  const shown = t.update([det([0.41, 0.5, 0.59, 0.65])]);
  expect(shown).toHaveLength(1);
  const id = shown[0].id;
  expect(t.update([det([0.42, 0.51, 0.6, 0.66])])[0].id).toBe(id);
  expect(t.distinct).toBe(1);
});

test("a one-frame false detection never appears or counts", () => {
  const t = new Tracker();
  t.update([det([0.1, 0.1, 0.2, 0.2])]);
  for (let i = 0; i < 6; i++) expect(t.update([])).toHaveLength(0);
  expect(t.distinct).toBe(0);
});

test("a track survives a short gap, then is dropped", () => {
  const t = new Tracker();
  const box = [0.4, 0.5, 0.58, 0.65];
  t.update([det(box)]); t.update([det(box)]);
  for (let i = 0; i < MAX_MISSES; i++) expect(t.update([])).toHaveLength(0);
  const back = t.update([det(box)]);
  expect(back).toHaveLength(1);
  expect(back[0].id).toBe(1);
  for (let i = 0; i <= MAX_MISSES; i++) t.update([]);
  t.update([det(box)]);
  expect(t.update([det(box)])[0].id).toBe(2); // old track expired, so this is a new id
  expect(t.distinct).toBe(2);
});

test("different classes and separate objects keep separate tracks", () => {
  const t = new Tracker();
  const a = [0.1, 0.1, 0.3, 0.3], b = [0.6, 0.6, 0.8, 0.8];
  t.update([det(a), det(b, "tyre")]);
  const shown = t.update([det(a), det(b, "tyre")]);
  expect(shown.map(s => s.object_class).sort()).toEqual(["tyre", "water_tank"]);
  expect(new Set(shown.map(s => s.id)).size).toBe(2);
  // A water_tank appearing where the tyre was must not inherit the tyre's id.
  const swap = t.update([det(a), det(b, "water_tank")]);
  expect(swap.find(s => s.object_class === "water_tank" && s.box[0] > 0.5)).toBeUndefined();
});

test("reset clears ids and the distinct count", () => {
  const t = new Tracker();
  t.update([det([0, 0, 0.3, 0.3])]); t.update([det([0, 0, 0.3, 0.3])]);
  t.reset();
  expect(t.distinct).toBe(0);
  t.update([det([0, 0, 0.3, 0.3])]);
  expect(t.update([det([0, 0, 0.3, 0.3])])[0].id).toBe(1);
});
