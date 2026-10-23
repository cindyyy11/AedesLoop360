/* Rolling summary of live egg-count previews. A steady number means the camera is steady, not that the count is right. */

export const WINDOW = 5;

export type PreviewSummary = { n: number; median: number; min: number; max: number; settled: boolean };

export function summarise(estimates: number[]): PreviewSummary | null {
  const recent = estimates.slice(-WINDOW);
  if (recent.length === 0) return null;
  const sorted = [...recent].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  const min = sorted[0], max = sorted[sorted.length - 1];
  return { n: recent.length, median, min, max, settled: recent.length >= WINDOW && max - min <= Math.max(3, 0.15 * median) };
}
