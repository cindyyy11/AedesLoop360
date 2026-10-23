# AedesLoop 360 Data Evidence Report

**Generated from repository evidence:** 2026-10-23  
**Evidence mode:** locally verified external drone labels, a measured grouped held-out detector evaluation, synthetic application fixtures, and deterministic simulation. This report makes no biological or field-impact claim.

## Dataset inventory

| Dataset | Local status | Licence / limitation |
|---|---|---|
| Drone Imagery Dataset of Aedes Mosquito Breeding Habitats, DOI `10.17632/vr3kkt9mvn.1` | User-supplied YOLOv8 archive locally extracted and validated: 2,821/2,821 images labelled, 4,916 boxes | Mendeley record states CC BY 4.0; embedded Roboflow export YAML states `Private`. Metadata conflict retained; source-group split is used because the publisher's tile-level splits overlap. |
| Ovitrap stick images and technician counts, DOI `10.5281/zenodo.6962536` | Candidate only; no images or count CSV loaded | Described as 300 egg-positive images; cannot establish negative specificity. Licence not verified locally. |
| AedesLoop local application fixtures | 2 images inventoried, 0 independent labels | Synthetic project fixtures. Not an evaluation dataset. |

The local group-disjoint split contains 1,947 train / 667 groups, 457 validation / 153 groups, and 417 test / 132 groups with zero source-group overlap. The test set contains only 11 tire and 15 coconut-shell instances. Archive SHA-256: `3f261dd83254d34f9eda537507845db1c0753b2880d2d4c8c522a9d03244676f`. Original Downloads archives were not modified. Dataset and trained model remain local and ignored by Git.

The checked-in specification is version 1.0; the update prompt calls it version 1.1. The repository specification was followed without silently changing its version.

## Model evaluation

| Task | Result | Why |
|---|---|---|
| Drone candidate-object detection | Completed grouped held-out test; registered in the local demo database | CPU YOLOv8n from random initialization, 10 epochs, deterministic 15% grouped training subset. Weak baseline; not suitable for operational decisions. |
| Ovitrap image-level count | `NOT_EVALUATED` | No technician-count image set, predictions, or checkpoint. |
| Negative-image specificity | `NOT_EVALUATED` | No verified negative samples are present. |

Measured test results on 417 source-grouped images (724 labelled objects): precision **88.57%**, recall **6.26%**, mAP@0.5 **5.85%**, mAP@0.5:0.95 **2.40%**. Mean inference time was 68.5 ms/image on CPU. Despite the displayed precision, the very low recall means this model misses most labelled objects and is not operationally ready. Water-tank AP@0.5 was 27.86%; other-open-container 0.19%, drum 1.22%, coconut shell 0%, and tyre 0%. Class precision/recall values can be misleading when the detector emits very few boxes. Test counts are 396 water tanks, 211 other containers, 91 drums, 15 coconut shells and 11 tyres. The dashboard stores the run as `IMPORTED` and displays its limitations. The CLI metric unit tests use hand-calculated toy inputs solely to verify formulas.

The drone upload route has a lazy optional local YOLO adapter. It records model-produced candidate boxes as `IMPORTED` and `UNCERTAIN` when `AEDES_DRONE_MODEL_PATH` is configured; otherwise it queues ground review. The supplied archive uses the same YOLO text labels and its classes map to the app's canonical candidate classes. The final checkpoint and evaluation JSON remain local under ignored `data/` paths. A real-checkpoint inference smoke test is being run separately from the held-out metric computation.

## Surveillance and operations

The dashboard reads persisted tenant-scoped block summaries and trap sample intervals. Its new interval view exposes valid/expected denominators, quality exclusions, interval length, source modes, and collection/upload timestamps. Blocks with no valid samples show `DATA_UNAVAILABLE`; they do not receive an egg value of zero.

The deterministic four-block allocation experiment compares uniform, a frozen static schedule, and adaptive planning under one scripted truth and an eight-hour staff budget. The currently computed run covers **4/8** scripted issue labels for uniform, **3/8** for static, and **4/8** for adaptive. Uniform discovers 3 latent ground sites, at 0.43 scripted findings per inspection-hour; static discovers 2 at 0.29; adaptive discovers 2 at 0.40 while assigning time to recurrence engineering review and trap servicing. Modelled cost per covered issue is 2.00 units for uniform, 2.67 for static, and 2.00 for adaptive. All three use 8 of 8 staff hours, cover all four blocks, and record zero scripted constraint violations, unauthorized drone actions, or treatment actions. These are simulation scores, not field measurements; adaptive does not win every metric.

## Reproduction

From the repository root:

```powershell
python scripts/data_evaluation.py validate-dataset --dataset local-app-fixture-images-v1 --out data/evaluations
python scripts/data_evaluation.py validate-dataset --dataset drone-aedes-habitat-candidate-v1 --out data/evaluations/drone/dataset-validation
python scripts/prepare_drone_group_split.py --root data/external/drone-aedes-yolov8-v1 --seed 360
python scripts/train_drone_yolo.py --data data/external/drone-aedes-yolov8-v1/data.grouped.yaml --out data/models/drone --epochs 10 --imgsz 416 --batch 8 --fraction 0.15 --threads 4 --name yolov8n-grouped-seed-360-fraction-15-sampled
python scripts/evaluate_drone_yolo.py --checkpoint data/models/drone/yolov8n-grouped-seed-360-fraction-15-sampled/weights/best.pt --data data/external/drone-aedes-yolov8-v1/data.grouped.yaml --out data/evaluations/drone
python scripts/data_evaluation.py eval-eggs --out data/evaluations
python scripts/benchmark_allocation.py --out data/evaluations/allocation-benchmark.json
```

Dataset validation reports local structure and provenance, not detector performance. Run `evaluate_drone_yolo.py` once after training for measured group-held-out metrics; register its report using `scripts/register_evaluation.py` so the tenant-scoped dashboard reads the persisted run. The coordinator dashboard action **Run simulated allocation benchmark** persists the three-policy simulated result.

The allocation command writes adjacent `.json`, `.csv`, and `.md` files. These are repeatable simulated artifacts and are not empirical findings.

## Limitations and next validation

The archive metadata conflict needs clarification before redistribution. The current CPU-trained baseline uses 15% of grouped train images from random initialization; regardless of held-out score, it requires larger/longer training, preferably with a compatible pretrained initialization, before any operational use. Ovitrap-negative and poor-quality samples are needed before image-count validity/specificity evaluation. Field efficacy and dengue incidence require separate, qualified studies and are outside this prototype evidence.
