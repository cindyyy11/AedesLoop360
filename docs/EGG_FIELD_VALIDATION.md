# Independent egg-model validation

## Additional public-data search — 23 October 2026

Checked the [AeEggCounter independent test deposit](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/TL5NP2) using its public [repository API](https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/TL5NP2). The downloaded depositor README describes 76 independent paper samples assessed by two trained specialists. The repository metadata declares CC0 1.0. It has 76 alleged original JPEGs and paired marked images; 71 pairs have straightforward count-bearing marked filenames, with **zero explicit zero-count pairs**. Five genetics-lab pairs have a different filename pattern and were not coerced into labels.

The candidate was **rejected for a clean-image benchmark** after visual inspection: repository file ID `12511079`, named `20250610_144239.jpg` (without `marked`), already contains red detector boxes and `egg` confidence labels. File naming alone therefore cannot identify clean originals. The numerical filenames also do not substitute for a depositor-confirmed human-reference-count table. The download/diagnostic process was stopped before inference; no external accuracy was calculated, no model was changed, and no result was registered in the dashboard. Partially downloaded photos remain local under ignored `data/external/aeeggcounter-test/images/` for provenance inspection and must not be used as training or test inputs.

The metadata snapshot and README are ignored `data/tests/aeeggcounter-metadata.json` and `data/tests/aeeggcounter-readme.docx`. Reproduce the metadata rejection report with:

```powershell
python scripts/audit_egg_external_candidate.py --metadata data/tests/aeeggcounter-metadata.json
```

Output: `data/external/aeeggcounter-test/candidate-audit.json`; expected `REJECTED_FOR_CLEAN_IMAGE_BENCHMARK`, `evaluation_performed=false`. The [public catalog](https://datasetcatalog.nlm.nih.gov/dataset?q=0003250458) helped locate this deposit, but file metadata and the README were verified directly against Harvard Dataverse. A clean original-image release, a confirmed per-image reference table and actual zero-egg samples would be needed to reconsider it. The existing local model remains suitable only for the already-tested human-reviewed demo.

## Verified source provenance

The supplied `observed_egg_counts.csv` exactly matches the [Zenodo dataset](https://zenodo.org/records/6962536): local and published MD5 are `1b7fa6cbfc152b9e2131aba4ef33622f`. This verifies the label file, not the bytes of the extracted photo archive. The publisher describes 300 iPhone 7 paddle photos from weekly surveillance in Córdoba, collected December 2021–March 2022, with technician counts under magnification. Every photo contains at least one egg. The [CONICET record](https://datosdeinvestigacion.conicet.gov.ar/handle/11336/201038?show=full) gives CC BY 2.5 Argentina attribution terms. Attribute Andreo and Rodríguez Gonzalez; retain the Zenodo creators and DOI 10.5281/zenodo.6962536 with redistributed source material. Photographs remain local and ignored.

The [authors' article page](https://veroandreo.gitlab.io/publication/2023_04_20_ovitrap_monitor/) links the study and software. The accessible dataset descriptions do **not** define the three filename components or identify which images share a physical paddle, trap, site, or collection round. The linked DOI and raw code pages could not be retrieved in this audit. `site-direction:` is therefore a historical implementation label for a filename prefix assumption, not verified metadata. Do not claim the current split is physically independent. No split or model was retuned during this audit.

To resolve this, obtain a publisher data dictionary mapping each code to physical paddle, trap, anonymized site and collection interval. A reply must establish whether repeated photos or visits share those units. This work has not contacted the authors. Once mappings exist, rebuild groups by shared paddle/trap/site as appropriate, choose the generalization question, retrain on development groups, and evaluate on a new reserved set. Changing grouping after seeing current test outcomes does not make those same photos a blind test.

## Fresh test collection — external evidence still required

Use `fixtures/egg-field-collection.template.json` as the collection ledger. It intentionally contains no observations or invented labels. Keep real photos and private metadata under ignored `data/external/egg-field-independent/`. Use pseudonymous site IDs; no residential addresses are required.

Collect new paddles and collection rounds not used in training or model selection. Include actual technician-confirmed zero-egg paddles, low counts, moderate and dense counts, different phones and lighting, and blurred/occluded examples. Several photos of one physical paddle are one group. Reused traps/sites across rounds need explicit IDs and must be handled according to the intended independent-site or future-round evaluation design. A blank generated image is a software fixture, not a labelled field negative.

For each image, record the relative filename, SHA-256, physical paddle ID, trap/site IDs, UTC interval start/end and capture timestamp, device, image rights, reviewed normalized ROI, quality and two independent blinded technician counts. Adjudicate disagreements before revealing predictions. Preserve genuine zeros as integer `0`; unknown counts stay `null` and cannot be scored. Record poor-quality images and inference failures rather than silently excluding them.

Suggested pilot target (project assumption, not a statistical guarantee): at least 30 independent collection groups, including at least 10 independent negative groups. Define count ranges and acceptable error with the project owner before scoring. More groups are needed if the resulting uncertainty remains too wide for the intended use.

## Frozen evaluation protocol

1. Freeze the checkpoint hash (`3ccd3f459141197c13710a51e3cadb4e94b62657dcbb6f24df376f7e647c7714`) and reviewed preprocessing/ROI procedure before examining predictions.
2. Verify rights, counts, group metadata and no overlapping image hashes or physical groups with development data. Hash checks alone cannot detect all related photographs.
3. Keep the collection ledger immutable for the run. Every eligible image must produce either an estimate or an explicit failure.
4. Score image MAE, median error, signed bias, group MAE and bootstrap uncertainty; show metrics separately for zero, low and high counts and image quality. For genuine negatives report nonzero-estimate fraction, inference coverage and false-positive count magnitude. Do not infer species or disease risk.
5. Report model-alone performance separately from reviewer-corrected workflow performance. Count corrections must not be reported as model accuracy.
6. If tuning follows, retire this set into development and collect another independent test set.

The existing external evaluator accepts image folders and `code,count_obs` labels, including zero, for an explicitly chosen model:

```powershell
python scripts/evaluate_egg_external.py --images data/external/egg-field-independent/images --labels data/external/egg-field-independent/observed_egg_counts.csv --checkpoint data/models/eggs/user-paddle-v1/texture_ridge.joblib --roi 0.36,0.04,0.66,0.99 --out data/evaluations/egg-field-independent.json
```

That CLI uses one fixed ROI and image metrics; it does not certify group independence or compute group/negative-stratum metrics. Use it only if the new capture geometry matches that reviewed ROI. A different layout needs recorded per-image crops and a preregistered evaluator update before scoring. No fresh field evaluation has been executed, because no independent labelled field set or genuine zero-egg photos were supplied. The current human-reviewed demo is complete; operational accuracy remains unvalidated.
