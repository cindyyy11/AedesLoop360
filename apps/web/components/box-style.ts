import type { CSSProperties } from "react";
import type { Schema } from "../lib/api";

/* Stored boxes are normalised but not in one format: seeded fixture annotations are [x, y, width, height],
   model detections are [x1, y1, x2, y2]. Draw each the way it was stored. */
export function boxStyle(finding: Pick<Schema["FindingRecord"], "bbox" | "model_version">): CSSProperties {
  const [a, b, c, d] = finding.bbox;
  const fixture = finding.model_version === "DEMO_PREANNOTATED_V1";
  const width = fixture ? c : c - a, height = fixture ? d : d - b;
  return { left: `${a * 100}%`, top: `${b * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` };
}
