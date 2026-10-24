"use client";

export type CameraCommand = "left" | "right" | "in" | "out" | "reset";

const SPIN = (
  <>
    <path d="M3.5 5v4.5H8" />
    <path d="M4 9.5A8 8 0 1 1 5.2 16" />
  </>
);
const ICONS: Record<CameraCommand, React.ReactNode> = {
  left: SPIN,
  right: <g transform="translate(24 0) scale(-1 1)">{SPIN}</g>,
  in: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5M11 8v6M8 11h6" /></>,
  out: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5M8 11h6" /></>,
  reset: <><circle cx="12" cy="12" r="3" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></>,
};

/** Icon-only camera button. The label is the accessible name and the hover tooltip. */
export function IconButton({ icon, label, disabled, onClick }: { icon: CameraCommand; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{ICONS[icon]}</svg>
    </button>
  );
}

const LABEL: Record<CameraCommand, string> = { left: "Rotate left", right: "Rotate right", in: "Zoom in", out: "Zoom out", reset: "Reset view" };

/**
 * Top-right corner of a scene: the 3D / Map switch with the camera icon buttons under it.
 * `commands` lists the buttons to show; `enabled` says which of them can be used right now.
 */
export function SceneCorner({ mode, onMode, modeDisabled, commands, enabled, onCommand }: {
  mode: "3d" | "map";
  onMode: (m: "3d" | "map") => void;
  modeDisabled?: boolean;
  commands: CameraCommand[];
  enabled: (c: CameraCommand) => boolean;
  onCommand: (c: CameraCommand) => void;
}) {
  return (
    <div className="scene-corner" role="toolbar" aria-label="Scene navigator">
      <div className="scene-seg" role="group" aria-label="Scene view">
        {([["3d", "3D view"], ["map", "Map view"]] as const).map(([m, label]) => (
          <button key={m} type="button" aria-pressed={mode === m} disabled={modeDisabled} onClick={() => onMode(m)}>{label}</button>
        ))}
      </div>
      <div className="scene-tools" role="group" aria-label="Camera">
        {commands.map(c => <IconButton key={c} icon={c} label={LABEL[c]} disabled={!enabled(c)} onClick={() => onCommand(c)} />)}
      </div>
    </div>
  );
}
