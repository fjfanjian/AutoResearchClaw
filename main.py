"""filename:main.py
Replace RT-DETRv2's ResNet backbone with frozen DINOv3 for aerial object detection.

METRIC_DEF:
  primary: val_loss (direction=lower, desc=FCOS detection loss on VisDrone val set)
  secondary: trainable_params_ratio (direction=lower, desc=fraction of model params trainable)
  secondary: inference_fps (direction=higher, desc=throughput FPS @ 640x640 on RTX 3090)
  threshold: val_loss_converge < 2.0

Dataset: VisDrone2019-DET (COCO format), /home/fj/datasets/visdrone
  Train: 6471 images (small_train_subset: 500 images used)
  Val: 548 images (tiny_subset: 50 images used for speed)
  10 classes: pedestrian, people, bicycle, car, van, truck, tricycle, awning-tricycle, bus, motor

Model architecture:
  Backbone: DINOv3 ViT-B/16 frozen (85.7M params, 768-dim, 12 blocks, patch=16)
            or ResNet18 pretrained (torchvision, 512-dim, stride-32)
  Neck: 4-level FPN (256 channels per level, top-down with lateral connections)
  Head: FCOS anchor-free head (focal cls + smooth L1 bbox + BCE centerness, 4 stacks)
  Adapters: CrossAttentionAdapter (MHSA, 8 heads, 64 queries, 768→256)
            CNNUpsampleAdapter (residual conv, bilinear upsample, 768→256)

Training protocol:
  Optimizer: AdamW (grouped LR: backbone × backbone_lr_mult, head × 1.0, adapter × adapter_lr_mult)
  LR: 0.005 (base), backbone_lr_mult varies by condition (1.0 / 0.0 / 1e-4)
  Weight decay: 1e-4, Grad clip: 1.0, LR schedule: CosineAnnealing
  Batch size: 2, Input: 640×640
  Epochs: 2-3 per condition (tiny subset, time budget 300s)

Evaluation:
  Primary metric: val_loss (FCOS total loss on val set)
  Secondary: inference_fps, trainable_params_ratio
  Seeds: [0, 1, 2] (3 seeds, minimum per requirement)
  Time budget: 300 seconds total
"""
import json
import os
import random
import sys
import time
import traceback

import numpy as np
import torch

# Try to use experiment_harness (pre-installed in sandbox)
try:
    from experiment_harness import ExperimentHarness
    HAS_HARNESS = True
except ImportError:
    HAS_HARNESS = False

from config import HyperParams, get_condition_config
from data import build_dataloaders
from models import (
    ResNet18FullyFinetunedDetector,
    ResNet18LinearProbeDetector,
    DINOv3NoAdapterDetector,
    DINOv3AttentionAdapterDetector,
    DINOv3PartialFinetuneDetector,
)
from train import (
    train_one_epoch,
    evaluate,
    benchmark_inference_fps,
    linear_probe_training_loop,
    run_phase,
)


# ── METRIC DEF ─────────────────────────────────────────────────────────────────
METRIC_DEF = (
    "METRIC_DEF|primary:val_loss:minimize|"
    "secondary:trainable_params_ratio:minimize|"
    "secondary:inference_fps:maximize|"
    "threshold:val_loss_converge<2.0"
)
print(METRIC_DEF)

# ── CONDITION REGISTRY ─────────────────────────────────────────────────────────
REGISTERED_CONDITIONS = [
    "rtdetr_r18_fully_finetuned:ResNet18+FCOS full fine-tune",
    "rtdetr_r18_linear_probe:ResNet18 frozen + FCOS trainable",
    "dinov3_vitb16_no_adapter_direct_head:DINOv3 frozen + 768→256 linear proj",
    "dinov3_vitb16_attention_adapter:DINOv3 frozen + CrossAttentionAdapter",
    "dinov3_vitb16_partial_finetune:DINOv3 last-2-blocks unfrozen + linear head",
]
print(f"REGISTERED_CONDITIONS|{json.dumps(REGISTERED_CONDITIONS)}")
SEED_COUNT = 3
SEEDS = [0, 1, 2]
print(f"SEED_COUNT: {SEED_COUNT} (fixed minimum, budget=300s, conditions={len(REGISTERED_CONDITIONS)})")


def set_all_seeds(seed: int):
    """Set all random seeds for reproducibility."""
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    np.random.seed(seed)
    random.seed(seed)


# ── CONDITION MAP ──────────────────────────────────────────────────────────────
CONDITION_MAP = {
    "rtdetr_r18_fully_finetuned": ResNet18FullyFinetunedDetector,
    "rtdetr_r18_linear_probe": ResNet18LinearProbeDetector,
    "dinov3_vitb16_no_adapter_direct_head": DINOv3NoAdapterDetector,
    "dinov3_vitb16_attention_adapter": DINOv3AttentionAdapterDetector,
    "dinov3_vitb16_partial_finetune": DINOv3PartialFinetuneDetector,
}


def main():
    # Time budget estimate
    print("TIME_ESTIMATE: Running pilot for time estimate...")
    t_pilot_start = time.time()

    cfg = HyperParams()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"DEVICE: {device}")

    total_budget = 300.0  # seconds
    is_cpu = (device.type == "cpu")
    fps_warmup = 2 if is_cpu else 10
    fps_max_iters = 5 if is_cpu else 100
    elapsed_total = 0.0

    # Initialize harness if available
    harness = ExperimentHarness(time_budget=total_budget) if HAS_HARNESS else None

    results = {}  # condition_name → {seed → best_val_loss, metrics}

    # ── PHASE 1: R18 inference benchmark ────────────────────────────────────
    t, _ = run_phase(1, "R18 baseline FPS benchmark", 30,
                     lambda: benchmark_inference_fps(
                         ResNet18FullyFinetunedDetector(cfg).to(device),
                         device, cfg.img_size, warmup=fps_warmup, max_iters=fps_max_iters))
    elapsed_total += t
    print(f"  [Phase1] R18 FPS benchmark: {t:.1f}s elapsed, remaining={total_budget - elapsed_total:.1f}s")

    # ── PHASE 2: DINOv3 frozen inference benchmark ──────────────────────────
    dinov3_fps = 0.0
    t, fps_result = run_phase(2, "DINOv3 frozen FPS benchmark", 20,
                               lambda: benchmark_inference_fps(
                                   DINOv3NoAdapterDetector(cfg).to(device),
                                   device, cfg.img_size, warmup=fps_warmup, max_iters=fps_max_iters))
    elapsed_total += t
    if fps_result is not None:
        dinov3_fps = fps_result
        print(f"  [Phase2] DINOv3 FPS: {dinov3_fps:.1f}")
        if dinov3_fps < 30:
            print(f"  WARNING: DINOv3 FPS {dinov3_fps:.1f} < 30 FPS threshold")
    else:
        print(f"  [Phase2] DINOv3 FPS benchmark failed")

    # ── Build dataloaders (tiny regime for speed within budget) ─────────────
    train_loader, val_loader = build_dataloaders(cfg, regime="tiny_subset", num_workers=0)
    print(f"  DATASET: train={len(train_loader.dataset)}, val={len(val_loader.dataset)} images")

    # ── PHASE 3: Training — all conditions × 3 seeds ─────────────────────────
    print(f"\n{'='*60}")
    print(f"PHASE 3: Training ({elapsed_total:.1f}s elapsed, {total_budget - elapsed_total:.1f}s remaining)")
    print(f"{'='*60}")

    for condition_name in [c.split(":")[0] for c in REGISTERED_CONDITIONS]:
        if condition_name not in CONDITION_MAP:
            print(f"MISSING_CONDITION: {condition_name}")
            continue

        model_cls = CONDITION_MAP[condition_name]
        cond_cfg = get_condition_config(condition_name)
        condition_results = {}
        successes = 0
        total_seeds = 0

        # Calculate per-seed time budget
        remaining_for_conditions = total_budget - elapsed_total
        # Reserve 20s for Phase 5, 20s for Phase 6
        training_budget = max(0, remaining_for_conditions - 40)
        # Cap per-seed budget to ensure all conditions can run
        # CPU training: ~2 batches/epoch × ~15s/batch × 2 epochs = ~60s per seed max
        per_seed_budget = min(40.0, max(5.0, training_budget / SEED_COUNT))

        print(f"\n  Condition: {condition_name}")
        print(f"  Config: lr={cond_cfg['lr']}, epochs={cond_cfg['epochs']}, "
              f"backbone_lr_mult={cond_cfg['backbone_lr_mult']}")
        print(f"  Per-seed budget: {per_seed_budget:.1f}s")

        for seed in SEEDS:
            total_seeds += 1
            remaining = total_budget - elapsed_total
            if remaining <= 0:
                print(f"    [TimeBudget] Skipping seed={seed} (time exhausted)")
                break

            # Set seed
            set_all_seeds(seed)

            # Build model
            try:
                model = model_cls(cfg).to(device)
            except Exception as e:
                print(f"    [BuildError] seed={seed} {condition_name}: {e}")
                traceback.print_exc()
                continue

            # Build optimizer
            optimizer, scheduler = model.configure_optimizer(cond_cfg)

            # Time-budgeted training
            seed_start = time.time()
            try:
                training_result = linear_probe_training_loop(
                    model, train_loader, val_loader,
                    optimizer, scheduler, device, cfg, cond_cfg,
                    time_budget=per_seed_budget
                )
            except Exception as e:
                print(f"    [TrainError] seed={seed} {condition_name}: {e}")
                traceback.print_exc()
                continue

            seed_time = time.time() - seed_start
            elapsed_total += seed_time

            if training_result is not None:
                val_loss = training_result["best_val_loss"]
                fps = training_result["metrics"].get("inference_fps", [0.0])[-1]

                # Validate metric
                if val_loss != val_loss:  # NaN
                    print(f"    condition={condition_name} seed={seed} val_loss: NaN (SKIP)")
                    continue

                condition_results[seed] = val_loss
                successes += 1

                # Per-seed reporting
                tpr = float(model.trainable_params) / max(1, sum(p.numel() for p in model.parameters()))
                print(f"    condition={condition_name} seed={seed} val_loss: {val_loss:.4f}")
                print(f"    condition={condition_name} seed={seed} inference_fps: {fps:.1f}")
                print(f"    condition={condition_name} seed={seed} trainable_params_ratio: {tpr:.4f}")
                print(f"    condition={condition_name} seed={seed} time: {seed_time:.1f}s")

                # Report to harness
                if harness:
                    harness.report_metric("val_loss", val_loss)
                    harness.check_value(val_loss, "val_loss")

            else:
                print(f"    condition={condition_name} seed={seed} TIMEOUT")

            # Check harness stop
            if harness and harness.should_stop():
                print(f"    [Harness] Time budget exhausted")
                break

        # Aggregate results for this condition
        if condition_results:
            values = list(condition_results.values())
            mean_val = float(np.mean(values))
            std_val = float(np.std(values))
            results[condition_name] = {
                "mean": mean_val,
                "std": std_val,
                "seeds": {str(s): v for s, v in condition_results.items()},
                "successes": successes,
                "total": total_seeds,
            }
            print(f"  condition={condition_name} val_loss_mean: {mean_val:.4f}")
            print(f"  condition={condition_name} val_loss_std: {std_val:.4f}")
            print(f"  condition={condition_name} success_rate: {successes}/{total_seeds}")
        else:
            results[condition_name] = {
                "mean": float("nan"),
                "std": float("nan"),
                "seeds": {},
                "successes": 0,
                "total": total_seeds,
            }
            print(f"  condition={condition_name} NO RESULTS (all seeds failed)")

    # ── PHASE 5: Backbone comparison ─────────────────────────────────────────
    t, _ = run_phase(5, "DINOv3 vs ResNet frozen comparison", 30,
                     lambda: None)  # Already done above as part of training
    elapsed_total += t

    # ── PHASE 6: Summary ──────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"SUMMARY — Total elapsed: {elapsed_total:.1f}s / {total_budget}s budget")
    print(f"{'='*60}")

    valid_results = {k: v for k, v in results.items() if not np.isnan(v["mean"])}

    for name, res in valid_results.items():
        print(f"  {name}: val_loss={res['mean']:.4f}±{res['std']:.4f} "
              f"(success={res['successes']}/{res['total']})")

    # Ranked by mean val_loss (lower = better)
    if valid_results:
        sorted_results = sorted(valid_results.items(), key=lambda x: x[1]["mean"])
        print(f"\n  Ranked (best→worst by val_loss):")
        for rank, (name, res) in enumerate(sorted_results, 1):
            print(f"  {rank}. {name}: {res['mean']:.4f}±{res['std']:.4f}")

        best_name, best_res = sorted_results[0]
        print(f"\n  METRIC|val_loss|{best_name}|{best_res['mean']:.4f}")
    else:
        print("  No valid results to rank")

    print(f"  Remaining budget: {total_budget - elapsed_total:.1f}s")

    # ── Save results ───────────────────────────────────────────────────────────
    output = {
        "hyperparameters": {
            "data_root": cfg.data_root,
            "dinov3_ckpt": cfg.dinov3_ckpt,
            "img_size": cfg.img_size,
            "num_classes": cfg.num_classes,
            "batch_size": cfg.batch_size,
            "base_lr": cfg.base_lr,
            "weight_decay": cfg.weight_decay,
            "grad_clip": cfg.grad_clip,
            "seeds": SEEDS,
            "total_budget": total_budget,
            "elapsed": elapsed_total,
        },
        "metrics": results,
        "dinov3_fps": dinov3_fps,
    }

    with open("results.json", "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n  Results saved to results.json")

    # Finalize harness
    if harness:
        harness.finalize()

    print(f"\n{'='*60}")
    print(f"EXPERIMENT COMPLETE")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
