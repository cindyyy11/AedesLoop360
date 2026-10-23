# Command workspace

Mode: Operate. A persistent SIMULATED banner. Mobile navigation wraps above single-column content. Forms have labels, focus rings, pending and error states. Maps use selectable fictional database assets. No decorative graphs or disease-risk percentages.

## Design direction: field-equipment editorial (2026-10-23, v2)

Chosen deliberately against the generic AI-dashboard look: no gradients, no frosted glass, no soft coloured shadows, no rounded bubbly cards, no ambient pulse animations. The reference family is printed field manuals, safety equipment labelling and Swiss editorial grids, which reads human art-directed and holds attention through typography and contrast rather than effects.

- Tokens live in `apps/web/app/globals.css` (`:root`), sampled from the supplied logo: flat deep navy `#0a2547` on cool paper `#edf3f7`, navy rail, loop blue `#0d9fe8` and eco green `#2fd67a` as the twin accents (the two arrows in the logo mark), signal orange `#ff5a1f` reserved for warnings and unavailable data. Exactly one gradient exists in the system, the blue-to-green loop rule under page titles and on the splash track, taken from the logo arrows.
- Shape lock: 3px radius everywhere, 2px badges, 1.5-2px ink borders, hard offset shadows only on the login card and button hover. Panels are flat bordered sheets; section headings are uppercase with a signal-orange square.
- Typography does the attention work: 52px extra-bold grotesque page headings, monospace for navigation, buttons, badges, table headers, KPI numerals and timestamps. Data reads as instrument labelling.
- Overview is an index strip, not KPI cards: four mono numerals divided by hairlines, with the unavailable-data cell inverted to black with an orange numeral. Map blocks are flat solid tiles; assets are orange diamonds; tables have black header bars and lime-tint row hover.
- Overview reading order (2026-10-23 clarity pass): a blue-ruled lede states that numbers are local SQLite / fixture-seeded and not dengue risk; then numbered chapters — **01 What we observed** (map, next steps, block table), **02 Trap interval trends**, **03 Model & planning evidence** (intentionally empty until held-out runs / coordinator benchmark). Suggested next steps read live `DATA_UNAVAILABLE` blocks instead of a fixed “Block 4” sentence.
- Motion is limited to instant hover inversions and a 1px hard-shadow button press. There are no entrance animations; reduced-motion still disables transitions.
- All API data, labels, roles and the SIMULATED invariants are unchanged; this refresh is presentation only.

## Brand and splash

- The supplied logo lives at `apps/web/public/brand/aedesloop-360-logo.jpg` (full lockup) with a cropped emblem at `apps/web/public/brand/aedesloop-emblem-transparent.png` (drone and ovitrap artwork only, wordmark removed so the name is always set in live text, white background knocked out to transparency by edge flood-fill so it sits directly on the navy sidebar with no white tile).
- Emblem tile in the sidebar next to the live-text name `AedesLoop 360` and the descriptor `Smart Mosquito Control`; full logo lockup framed on the login card; emblem is also the favicon.
- Startup shows a splash screen while the session check runs (held at least 1.5s so it is actually seen): emblem, `AedesLoop 360` in display type, `Smart Mosquito Control` tagline, an indeterminate loading track and a status line. No fake progress percentage. The track is static under `prefers-reduced-motion`.
