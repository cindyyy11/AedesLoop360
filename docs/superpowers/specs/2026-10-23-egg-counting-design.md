# Reviewed egg-count estimation

Approved in chat on 23 October 2026: compare a non-ML image-processing baseline and pretrained image count model, group all photographs of a physical pallet, select on validation only, reserve test and external images, and require human confirmation before interval updates.

## Evidence and scope

Local Mosqlimate archive: 683 images, 686 CSV rows, 173 declared pallets, four absent labelled images and one unlabelled image. Six byte-identical pairs include three pairs with conflicting counts. No zero-count image is present (declared counts 50–4000). Ovitrap Monitor: 300 matched image/count pairs, counts 1–305, also no negatives. Some Mosqlimate images contain handwritten count answers and QR codes. These are potential shortcuts, not egg evidence.

Sources: https://data.mendeley.com/datasets/jd5txz2f7d/2 (CC BY 4.0, publisher describes 700 images); https://zenodo.org/records/6962536 (external evaluation candidate; licence must be verified before use). User originals remain unchanged. No source archive or checkpoint is committed.

## Model and evaluation

Quarantine inconsistent duplicate-image pallet groups, absent and unlabelled files; deduplicate remaining identical images. Use deterministic group-disjoint train/validation/test partitions stratified by count range. Exclude filenames, pallet IDs, phone and label metadata from input features. Crop to an explicitly recorded substrate region, suppress header/QR/background markings, retain crop previews for inspection, and disclose uncertain coverage. No arbitrary random crops with whole-image count targets.

Compare a train-median baseline, high-resolution image-processing/texture features with regression, a frozen ImageNet-pretrained ResNet18 count head, and staged fine-tuning of the pretrained ResNet18. For fine-tuning, warm up the regression head with backbone frozen, then unfreeze the final residual block at a lower learning rate; compare deeper unfreezing only if validation supports it. The dataset has only about 170 physical pallets, so full-model fine-tuning is an experiment, not an assumed winner. Use a log1p count target, robust loss, group-aware early stopping and only physically plausible, label-preserving image transforms. CPU compute is available; no GPU is assumed. Download pretrained weights from the official PyTorch host and record their hash; never silently substitute untrained weights. Select by pallet-weighted validation MAE; report image and pallet MAE, RMSE, signed bias, count-range errors and group-bootstrap uncertainty. Test inference runs only after the candidate is frozen. Any further tuning after looking at test results requires a new external evaluation, not a revised claim on the same test set. External evaluation stays separate and must record dataset shift; absence of negatives prevents specificity claims. Accuracy is measured, not guaranteed.

## Application boundary

Separate authenticated ovitrap image upload/analysis from aerial upload so egg images never produce drone findings. Require a normalized, reviewer-selected substrate ROI. Persist tenant/trap/media/model version, crop, status and proposed count; return explicit unavailable/error states with no fabricated zero. Synchronous local inference is bounded and does not launch an in-process background job. Model absence leaves human import and labelled fixtures operational.

Only a reviewer/coordinator confirmation endpoint may create an interval from an analysis, using existing interval/substrate/media deduplication and audit. Store accepted/corrected count, reviewer identity, model provenance and IMPORTED mode; proposals never affect trends. Offline trap remains unavailable. Show uploaded image, model/crop provenance and review controls with loading, failure and empty states. Generated OpenAPI is canonical.

## Acceptance

Tests cover missing/contradictory labels, group/duplicate isolation, masked preprocessing, metric calculations, missing checkpoint, invalid ROI, role/tenant denial, idempotency, no sample from proposal, confirmed/corrected sample persistence and duplicate interval rejection. Run API focused and regression tests, migrations on isolated SQLite, contract generation, frontend lint/typecheck/build and browser workflow where supported. Document exact measured results and runtime limits. PostgreSQL/field generalization remain unverified unless executed.

## Measured data-preparation note

The implemented audit found 663 usable unique images after missing/unlabelled files, duplicate bytes and four conflicting-label pallet IDs were excluded. Of those, 352 passed the conservative automatic complete-substrate crop check: 219 train images / 86 pallets, 70 validation images / 27 pallets, and 63 locked test images / 27 pallets. Other images remain in the manifest but are not scored because the substrate is clipped or ambiguous. Training ROIs are machine-suggested, not yet individually verified by a human; in the application, the operator must explicitly select and verify the ROI before inference. Training losses weight each pallet equally despite differing photo counts.

The user-supplied paddle set is the more relevant target domain. Its 300 CSV rows all matched images, with no duplicate bytes, counts 1–305 and no zero-count samples. Codes were grouped by their first two segments (50 groups, assumed to mean site/direction; source documentation has not confirmed this), producing 186 train / 30 groups, 57 validation / 10 groups and 57 test / 10 groups. A fixed paddle crop was used after visually checking sample photos. Validation group MAE was 13.78 for the train-group median, 11.63 for texture ridge, 12.65 for extra trees, 13.27 for histogram gradient boosting, 12.38 for a frozen ResNet head and 12.95 for staged layer-4 fine-tuning (early stopped after three epochs). The validation-selected texture ridge had test image MAE 9.56 eggs and group MAE 6.40 (95% group bootstrap interval 2.72–10.87). The set is not a fully blind final test: a public-source checkpoint was first evaluated over all 300 images as a transfer diagnostic before this split. Treat these numbers as exploratory until group semantics are verified and a new independent test set is collected. The model also has no zero-count training examples.

The public-strip-only model sharply failed to transfer to the paddle photos: image MAE 216.04 eggs and positive bias 215.66 on all 300 examples, using one fixed visual ROI. This confirms that in-domain labelled paddle photos are essential; ImageNet pretraining alone does not resolve the domain shift.
