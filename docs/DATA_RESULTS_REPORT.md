# AedesLoop 360 Data Evidence Report

**Generated from repository evidence:** 2026-10-23  
**Evidence mode:** locally verified external drone labels, a measured grouped held-out detector evaluation, synthetic application fixtures, and deterministic simulation. This report makes no biological or field-impact claim.

## Dataset inventory

| Dataset | Local status | Licence / limitation |
|---|---|---|
| Drone Imagery Dataset of Aedes Mosquito Breeding Habitats, DOI `10.17632/vr3kkt9mvn.1` | User-supplied YOLOv8 archive locally extracted and validated: 2,821/2,821 images labelled, 4,916 boxes | Mendeley record states CC BY 4.0; embedded Roboflow export YAML states `Private`. Metadata conflict retained; source-group split is used because the publisher's tile-level splits overlap. |
| Public egg-strip images and user-supplied wood-paddle photos | Both are present locally; a target-domain paddle reviewer-assist model has a separate grouped held-out report | Strip-to-paddle transfer performed poorly. Paddle data has no zero-count examples; negative specificity remains unmeasured. See the egg-count section of `docs/DEMO_RUNBOOK.md`. |
| AedesLoop local application fixtures | 2 images inventoried, 0 independent labels | Synthetic project fixtures. Not an evaluation dataset. |

The local group-disjoint split contains 1,947 train / 667 groups, 457 validation / 153 groups, and 417 test / 132 groups with zero source-group overlap. The test set contains only 11 tire and 15 coconut-shell instances. Archive SHA-256: `3f261dd83254d34f9eda537507845db1c0753b2880d2d4c8c522a9d03244676f`. Original Downloads archives were not modified. Dataset and trained model remain local and ignored by Git.

The checked-in specification is version 1.0; the update prompt calls it version 1.1. The repository specification was followed without silently changing its version.

## Model evaluation

| Task | Result | Why |
|---|---|---|
| Drone candidate-object detection | Completed grouped held-out test; latest run registered in the local demo database | Official COCO-pretrained YOLOv8n, fine-tuned at native 512px on all 1,947 grouped training images. Six completed epochs across an interrupted first stage and five-epoch smaller-batch continuation. |
| Ovitrap image-level count card | Completed 57-image / 10-group held-out test, registered in both local demo databases | Validation-selected paddle texture-ridge model: image MAE 9.56, group MAE 6.40, signed bias −4.02. Count proposals still require human confirmation. |
| Negative-image specificity | `NOT_EVALUATED` | No verified negative samples are present. |

On the same 417 source-grouped test images (724 labelled objects), the new model reached precision **69.59%**, recall **62.54%**, mAP@0.5 **68.30%**, and mAP@0.5:0.95 **50.45%**. The earlier scratch/15%-subset baseline had precision 88.57%, recall 6.26%, mAP@0.5 5.85%, and mAP@0.5:0.95 2.40%. Its high precision reflected very few predictions and did not make it useful for candidate discovery. The latest run ID is `drone-yolo-group-test-5df5f3c2347841fab8b68207584b4f15`; its dataset, official starting weight, intermediate weight and final checkpoint SHA-256 values are in the local report. The dashboard reads this latest run and displays eight limitations, including the low other-open-container recall and rare-class test counts.

| Candidate class | Test objects | AP@0.5 | Recall |
|---|---:|---:|---:|
| Coconut shell | 15 | 50.11% | 53.97% |
| Drum | 91 | 68.13% | 71.43% |
| Other open container | 211 | 57.58% | 27.96% |
| Tyre | 11 | 68.08% | 63.64% |
| Water tank | 396 | 97.63% | 95.71% |

The tyre and coconut-shell estimates have high sampling uncertainty because their test counts are small. The low recall for other open containers is a meaningful remaining failure. These scores are for candidate objects in this dataset, not water, larvae, Aedes species, intervention eligibility or dengue risk. The CLI metric unit tests use hand-calculated toy inputs solely to verify formulas.

The drone upload route has a lazy optional local YOLO adapter. It records model-produced candidate boxes as `IMPORTED` and `UNCERTAIN` when `AEDES_DRONE_MODEL_PATH` is configured; otherwise it queues ground review. The supplied archive uses the same YOLO text labels and its classes map to the app's canonical candidate classes. The final checkpoint and evaluation JSON remain local under ignored `data/` paths. A real-checkpoint isolated upload test persisted four detected boxes on a training image as `IMPORTED`/`UNCERTAIN` with model version `best@2e3bd975dedb`; no treatment was authorized.

## Surveillance and operations

The dashboard reads persisted tenant-scoped block summaries and trap sample intervals. Its new interval view exposes valid/expected denominators, quality exclusions, interval length, source modes, and collection/upload timestamps. Blocks with no valid samples show `DATA_UNAVAILABLE`; they do not receive an egg value of zero.

The deterministic four-block allocation experiment compares uniform, a frozen static schedule, and adaptive planning under one scripted truth and an eight-hour staff budget. The currently computed run covers **4/8** scripted issue labels for uniform, **3/8** for static, and **4/8** for adaptive. Uniform discovers 3 latent ground sites, at 0.43 scripted findings per inspection-hour; static discovers 2 at 0.29; adaptive discovers 2 at 0.40 while assigning time to recurrence engineering review and trap servicing. Modelled cost per covered issue is 2.00 units for uniform, 2.67 for static, and 2.00 for adaptive. All three use 8 of 8 staff hours, cover all four blocks, and record zero scripted constraint violations, unauthorized drone actions, or treatment actions. These are simulation scores, not field measurements; adaptive does not win every metric.

## Reproduction

From the repository root:

```powershell
python scripts/data_evaluation.py validate-dataset --dataset local-app-fixture-images-v1 --out data/evaluations
python scripts/data_evaluation.py validate-dataset --dataset drone-aedes-habitat-candidate-v1 --out data/evaluations/drone/dataset-validation
python scripts/prepare_drone_group_split.py --root data/external/drone-aedes-yolov8-v1 --seed 360
python scripts/train_drone_yolo.py --data data/external/drone-aedes-yolov8-v1/data.grouped.yaml --out data/models/drone --epochs 6 --imgsz 512 --batch 4 --fraction 1.0 --threads 4 --model data/models/pretrained/yolov8n.pt --name yolov8n-coco-pretrained-grouped-full-512-clean
python scripts/evaluate_drone_yolo.py --checkpoint data/models/drone/yolov8n-coco-pretrained-grouped-full-512-clean/weights/best.pt --data data/external/drone-aedes-yolov8-v1/data.grouped.yaml --out data/evaluations/drone
python scripts/data_evaluation.py eval-eggs --out data/evaluations
python scripts/benchmark_allocation.py --out data/evaluations/allocation-benchmark.json
```

The clean rerun above starts directly from the locally downloaded official `yolov8n.pt` and may produce different metrics from the recorded two-stage run. That run first completed one epoch at batch 8, stopped with a CPU allocation failure, then completed five more epochs at batch 4 from its saved best checkpoint. The exact run metadata and hashes are under `data/models/drone/` and `data/evaluations/drone/`. Dataset validation reports local structure and provenance, not detector performance. Register a new `evaluate_drone_yolo.py` report with `scripts/register_evaluation.py` only after evaluating a validation-selected checkpoint. The coordinator dashboard action **Run simulated allocation benchmark** persists the three-policy simulated result.

The allocation command writes adjacent `.json`, `.csv`, and `.md` files. These are repeatable simulated artifacts and are not empirical findings.

## Limitations and next validation

The archive metadata conflict needs clarification before redistribution. The official YOLOv8 weights and runtime have AGPL-3.0 or Enterprise licensing terms that must be reviewed for deployment. This local model has not been validated on representative Malaysian field imagery or independent collection sites. It needs additional labelled examples, especially diverse open containers, and an external validation set before operational use. Ovitrap-negative and poor-quality samples are needed before image-count validity/specificity evaluation. Field efficacy and dengue incidence require separate, qualified studies and are outside this prototype evidence.
