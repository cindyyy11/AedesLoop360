# ADR-006: Evidence-linked, read-only 3D township

Status: accepted, 23 October 2026.

The prototype needs a clear visual demonstration of inspection, ovitrap surveillance and allocation without implying live flight or evaluated health outcomes. Add a lazy-loaded Three.js renderer to the existing Township route; preserve the original 2D view and backend contracts.

The controller consumes authenticated block, asset, trap, mission-event and allocation endpoints. The renderer receives typed data and emits only local selection/camera changes. Playback consumes existing events and never calls a mutation endpoint. Backend approval and operator execution remain in the existing mission workflow.

Procedural geometry avoids external model downloads and asset-licence ambiguity. Explicit labels distinguish registered fictional coordinates from illustrative buildings, trap placement and drone motion. A saved plan is a dated snapshot, not a real-time risk forecast. Trap missingness is represented with text and symbols as well as colour.

Trade-offs: this supplies an inspectable presentation quickly, without physics, photogrammetry or live telemetry. WebGL2 is needed for graphics; HTML evidence and 2D mapping remain available otherwise. The scene caps pixel ratio, renders on demand when paused, respects reduced motion, suspends hidden-tab animation and releases GPU resources on unmount.

Validation and reproduction: `docs/3D_TOWNSHIP.md` and the two `township-3d` Playwright suites. No schema migration or backend authorization change is required.
