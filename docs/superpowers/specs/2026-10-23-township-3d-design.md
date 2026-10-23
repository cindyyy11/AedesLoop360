# Township 3D walkthrough

User approved the township walkthrough design on 23 October 2026.

Add a procedural, fictional four-block 3D scene above the existing Township content. Use registered block and asset coordinates; buildings, vegetation and trap offsets are illustrative geometry, not surveyed positions. Keep existing APIs, roles, mission approval and dashboard intact.

The scene supports orbit/zoom/reset, accessible object selection, evidence links and three manually selectable presentation chapters: inspection, monitoring, allocation. Replay only persisted mission events, including skip/review outcomes; drone travel is illustrative interpolation, never telemetry or a newly executed mission. Show event timestamps, mode and mission status. No events means no replay. Never infer biological efficacy.

Use lazy-loaded Three.js with capped pixel ratio, reduced-motion support, explicit animation playback, resource cleanup, and an accessible HTML evidence list even without WebGL. Parallel authenticated API reads feed the scene. Failed reads show retry; no fabricated fallback records. Existing 2D map remains available.

Validate TypeScript, ESLint, production build and browser tests for selection, chapters, recorded replay, missing records, failed requests, mobile layout and WebGL fallback. No database migrations or backend writes are needed.
