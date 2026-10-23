# Independent field-validation intake

The repository currently has **no independently labelled Malaysian field set**. The 2,821 drone tiles, public egg-strip images, and 300 user paddle photos have already been used for training, model selection, or internal testing. Synthetic fixture images and screenshots are not field evidence. Do not reuse any of these as a new external test.

Keep new images local under ignored `data/field-validation/`. Use opaque site IDs; do not place residential addresses, coordinates, names of residents, or identifiable unredacted photos in Git. Obtain the right to retain and review images before copying them here. Labels must be completed by a qualified human before model predictions are viewed. Do not select a model or threshold using this external set and then present the same set as untouched validation.

```text
data/field-validation/
  drone/
    manifest.csv
    images/          # PNG or JPEG
    labels/          # same stem as image, YOLO txt; empty file for no candidate objects
  eggs/
    manifest.csv
    images/          # PNG or JPEG of ovitrap substrates
```

`drone/manifest.csv` needs these columns:

```csv
image,site_id,flight_id,reviewed_by,rights,independent_site_attested
```

YOLO class IDs must match the configured detector: `0 coconut_shell`, `1 drum`, `2 other_open_container`, `3 tyre`, `4 water_tank`. Each nonempty label line is `class_id x_center y_center width height` with normalized 0–1 coordinates. Reviewers should label *candidate container objects*, including hard negatives and visually ambiguous images. A label does not establish standing water or larvae.

`eggs/manifest.csv` needs these columns:

```csv
image,site_id,trap_id,substrate_id,interval_start,interval_end,reference_count,quality,reviewed_by,rights,independent_site_attested
```

Use timezone-aware ISO 8601 intervals, non-negative technician reference counts, and quality `VALID`, `UNCERTAIN`, or `INVALID`. Include independently checked **zero-egg** and poor-quality photos. A reference count is an image/substrate count, not an adult-population estimate. Repeated photos of one physical substrate and interval must be identified, not counted as new oviposition events. Set `independent_site_attested=true` only after a person verifies the collection site was not in the training, validation, or internal test sources; the script cannot establish site identity from pixels.

From the repository root, run:

```powershell
python scripts/audit_field_validation.py
```

The command writes `data/evaluations/field/preflight.json`. It verifies required labels, image decodability, YOLO class/box syntax, reference counts and collection intervals, duplicate images, and exact image-hash overlap with the existing drone, user-paddle, and public egg collections. `READY_FOR_EVALUATION` means only that the files passed preflight; **no inference or accuracy calculation occurs**. `MISSING_DATA` is the expected current result. Exact hashes cannot rule out near-duplicate crops or a reused site; human provenance review is still required.

Once a new set passes preflight, freeze its manifest and image hashes, evaluate the already selected checkpoints once, report per-class drone misses and egg count errors (including zero-count false positives), and retain site-level uncertainty. Any later fine-tuning needs a *new* untouched field holdout. Real flight, treatment and biological efficacy remain outside this validation.
