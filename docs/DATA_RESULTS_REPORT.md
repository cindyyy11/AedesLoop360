# AedesLoop 360 Data Evidence Report

**Generated from repository evidence:** 2026-10-23  
**Evidence mode:** local synthetic fixtures and deterministic simulation. This report contains no empirical ML or biological outcomes.

## Dataset inventory

| Dataset | Local status | Licence / limitation |
|---|---|---|
| Drone Imagery Dataset of Aedes Mosquito Breeding Habitats, DOI `10.17632/vr3kkt9mvn.1` | Candidate only; no archive, labels, or split files loaded | Source page/spec declares CC BY 4.0 and five candidate-container classes. Verify the source licence and flight/site grouping before reuse. |
| Ovitrap stick images and technician counts, DOI `10.5281/zenodo.6962536` | Candidate only; no images or count CSV loaded | Described as 300 egg-positive images; cannot establish negative specificity. Licence not verified locally. |
| AedesLoop local application fixtures | 2 images inventoried, 0 independent labels | Synthetic project fixtures. Not an evaluation dataset. |

The checked-in specification is version 1.0; the update prompt calls it version 1.1. The repository specification was followed without silently changing its version.

## Model evaluation

| Task | Result | Why |
|---|---|---|
| Drone candidate-object detection | `NOT_EVALUATED` | No independent test labels, predictions, or checkpoint. |
| Ovitrap image-level count | `NOT_EVALUATED` | No technician-count image set, predictions, or checkpoint. |
| Negative-image specificity | `NOT_EVALUATED` | No verified negative samples are present. |

No accuracy percentages, dengue effects, egg reductions, or model performance claims are made. The CLI evaluates real supplied labels and predictions when available; its metric unit tests use hand-calculated toy inputs solely to verify formulas.

The drone upload route now has a lazy optional local YOLO adapter. It records model-produced candidate boxes as `IMPORTED` and `UNCERTAIN` when `AEDES_DRONE_MODEL_PATH` is configured; otherwise it queues ground review. This changes the integration capability, not the evidence status: no external dataset, compatible checkpoint or genuine evaluation metrics are present. The model version includes a checkpoint hash prefix on inference records.

## Surveillance and operations

The dashboard reads persisted tenant-scoped block summaries and trap sample intervals. Its new interval view exposes valid/expected denominators, quality exclusions, interval length, source modes, and collection/upload timestamps. Blocks with no valid samples show `DATA_UNAVAILABLE`; they do not receive an egg value of zero.

The deterministic four-block allocation experiment compares uniform, a frozen static schedule, and adaptive planning under one scripted truth and an eight-hour staff budget. The currently computed run covers **4/8** scripted issue labels for uniform, **3/8** for static, and **4/8** for adaptive. Uniform discovers 3 latent ground sites, at 0.43 scripted findings per inspection-hour; static discovers 2 at 0.29; adaptive discovers 2 at 0.40 while assigning time to recurrence engineering review and trap servicing. Modelled cost per covered issue is 2.00 units for uniform, 2.67 for static, and 2.00 for adaptive. All three use 8 of 8 staff hours, cover all four blocks, and record zero scripted constraint violations, unauthorized drone actions, or treatment actions. These are simulation scores, not field measurements; adaptive does not win every metric.

## Reproduction

From the repository root:

```powershell
python scripts/data_evaluation.py validate-dataset --dataset local-app-fixture-images-v1 --out data/evaluations
python scripts/data_evaluation.py validate-dataset --dataset drone-aedes-habitat-candidate-v1 --out data/evaluations
python scripts/data_evaluation.py eval-drone --out data/evaluations
python scripts/data_evaluation.py eval-eggs --out data/evaluations
python scripts/benchmark_allocation.py --out data/evaluations/allocation-benchmark.json
```

The two evaluation commands above produce `NOT_EVALUATED` until held-out labels, predictions, and checkpoints are supplied. Use the coordinator dashboard action **Run simulated allocation benchmark** to create and persist the three-policy result.

The allocation command writes adjacent `.json`, `.csv`, and `.md` files. These are repeatable simulated artifacts and are not empirical findings.

## Limitations and next validation

The source dataset archives/licences and independent labels need to be obtained and checked. Then create a group-disjoint test split where flight/site or trap/substrate metadata supports it, run inference with a recorded checkpoint, and retain the CLI summary and error artefacts. Egg-negative and poor-quality samples are needed before validity/specificity evaluation. Field efficacy and dengue incidence require separate, qualified studies and are outside this prototype evidence.
