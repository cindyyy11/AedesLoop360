"use client";
import type { Schema } from "../lib/api";

type Props = {
  blocks: Schema["Summary"][];
  assets: Schema["AssetRecord"][];
  selected: string;
  onSelect: (id: string) => void;
};

// Fictional 0-100 plan units, drawn as a simple illustrated map. Bubble size is eggs per trap, so the
// biggest bubble is the block to look at first. A block with no data gets a dashed "?" ring, never a
// small bubble, because no data is not low risk.
const TREES: Array<[number, number]> = [
  [4, 6], [8, 38], [5, 52], [36, 4], [48, 5], [92, 8], [95, 30], [37, 36], [49, 48], [36, 52],
  [47, 94], [6, 94], [30, 95], [60, 94], [94, 56], [93, 94], [50, 36], [38, 62], [50, 60],
];

function Houses({ cx, cy, tone }: { cx: number; cy: number; tone: string }) {
  const out = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++)
      out.push(<rect key={`${r}${c}`} x={cx - 10 + c * 5.2} y={cy - 4.5 + r * 5} width="3.6" height="3.2" rx=".5" fill={tone} />);
  return <>{out}</>;
}

export function TownshipGlance({ blocks, assets, selected, onSelect }: Props) {
  const maxEggs = Math.max(1, ...blocks.map((b) => b.eggs_per_interval ?? 0));
  const radius = (eggs: number) => 7 + (eggs / maxEggs) * 9;
  return (
    <figure className="glance">
      <svg viewBox="0 0 100 100" role="img" aria-label="Illustrated map of four blocks. Bubble size shows eggs per trap; a dashed question-mark ring means no data.">
        <defs>
          <pattern id="gl-hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2" height="2" fill="#ffd9cc" />
            <rect width="1" height="2" fill="#ffb59b" />
          </pattern>
          <filter id="gl-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy=".6" stdDeviation=".6" floodColor="#0a2547" floodOpacity=".25" />
          </filter>
        </defs>

        <rect width="100" height="100" fill="#e6f1e4" />
        {/* river */}
        <path d="M0 80 C 25 70, 45 92, 70 86 S 95 74, 100 78 L100 100 L0 100 Z" fill="#bfe3f5" />
        <path d="M0 80 C 25 70, 45 92, 70 86 S 95 74, 100 78" fill="none" stroke="#8ccbe8" strokeWidth=".8" />
        {/* roads */}
        <rect x="38.5" y="0" width="8" height="100" fill="#f7f9fa" />
        <rect x="0" y="38.5" width="100" height="8" fill="#f7f9fa" />
        <line x1="42.5" y1="0" x2="42.5" y2="100" stroke="#c4d0d8" strokeWidth=".5" strokeDasharray="2 2" />
        <line x1="0" y1="42.5" x2="100" y2="42.5" stroke="#c4d0d8" strokeWidth=".5" strokeDasharray="2 2" />
        {TREES.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="2.2" fill="#9ccf9a" />
            <circle cx={x - 0.5} cy={y - 0.5} r="1.2" fill="#b7e0b3" />
          </g>
        ))}

        {blocks.map((b) => {
          const none = b.status === "DATA_UNAVAILABLE" || b.eggs_per_interval == null;
          const r = none ? 11 : radius(b.eggs_per_interval ?? 0);
          return (
            <g key={b.id}>
              {/* egg bubble behind the block */}
              <circle cx={b.x} cy={b.y} r={r} fill={none ? "none" : "#0d9fe8"} fillOpacity=".22"
                stroke={none ? "#ff5a1f" : "#0d9fe8"} strokeWidth={none ? 0.9 : 0.6} strokeDasharray={none ? "2 1.6" : undefined} />
              {/* block plot */}
              <rect x={b.x - 12.5} y={b.y - 9} width="25" height="18" rx="1.6" fill={none ? "url(#gl-hatch)" : "#c9e8c2"}
                stroke={none ? "#ff5a1f" : "#127344"} strokeWidth=".7" filter="url(#gl-soft)" />
              <Houses cx={b.x} cy={b.y + 1.5} tone={none ? "#e8a88f" : "#7fbf86"} />
              {none && <text x={b.x} y={b.y + 3.2} textAnchor="middle" className="glance-q">?</text>}
              {/* label chip */}
              <g transform={`translate(${b.x} ${b.y - 12.5})`}>
                <rect x="-14.5" y="-3.6" width="29" height="6.4" rx="1.2" fill="#0a2547" />
                <text x="0" y="0.9" textAnchor="middle" className="glance-label">
                  {b.name} · {none ? "no data" : `${b.eggs_per_interval!.toFixed(1)} eggs`}
                </text>
              </g>
            </g>
          );
        })}

        {assets.map((a) => {
          const on = a.id === selected;
          const x = a.x, y = a.y + 12;
          return (
            <g key={a.id} role="button" tabIndex={0} aria-label={`View ${a.name}`} className={`glance-pin${on ? " is-on" : ""}`}
              onClick={() => onSelect(a.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(a.id); } }}>
              <title>{a.name}</title>
              <path d={`M${x} ${y + 1} C ${x - 3.6} ${y - 3.2}, ${x - 2.6} ${y - 6.2}, ${x} ${y - 6.2} C ${x + 2.6} ${y - 6.2}, ${x + 3.6} ${y - 3.2}, ${x} ${y + 1} Z`}
                fill={on ? "#0a2547" : "#0d9fe8"} stroke="#fff" strokeWidth=".7" />
              <circle cx={x} cy={y - 3.6} r="1.1" fill="#fff" />
            </g>
          );
        })}

        {/* compass */}
        <g transform="translate(92 10)">
          <circle r="4.5" fill="#fff" stroke="#c4d0d8" strokeWidth=".4" />
          <path d="M0 -3.6 L1.4 1 L0 0.2 L-1.4 1 Z" fill="#0a2547" />
          <text y="-5.4" textAnchor="middle" className="glance-n">N</text>
        </g>
      </svg>
      <figcaption>
        <span><i className="g-bubble" /> Bubble size = eggs per trap</span>
        <span><i className="g-none" /> Dashed ? = no data, not safe</span>
        <span><i className="g-pin" /> Trap site, tap to open</span>
      </figcaption>
    </figure>
  );
}
