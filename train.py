"""filename:train.py
Training loop, evaluation, FPS benchmarking, and time-budgeted execution.
"""
import time
import torch
import torch.nn.functional as F


def train_one_epoch(model, loader, optimizer, scheduler, device, cfg, epoch: int,
                    time_budget: float = float("inf")) -> float:
    """Single epoch training loop for object detection.

    Args:
        model: detection model
        loader: training DataLoader
        optimizer, scheduler: optimizer and LR scheduler
        device: torch device
        cfg: HyperParams
        epoch: current epoch number
        time_budget: max seconds for this epoch

    Returns:
        Average training loss for the epoch
    """
    model.train()
    total_loss = 0.0
    num_batches = 0
    epoch_start = time.time()

    for batch_idx, (images, targets) in enumerate(loader):
        elapsed = time.time() - epoch_start
        if elapsed > time_budget:
            print(f"    [TimeBudget] Breaking epoch at batch {batch_idx} ({elapsed:.1f}s > {time_budget:.1f}s)")
            break

        images = images.to(device)
        targets = [{k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in t.items()} for t in targets]

        optimizer.zero_grad()
        preds = model(images)
        loss = model.compute_loss(preds, targets)

        # NaN guard
        if torch.isnan(loss) or torch.isinf(loss):
            print(f"  WARNING: NaN/Inf loss at batch {batch_idx}, skipping")
            continue

        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
        optimizer.step()
        if scheduler is not None:
            scheduler.step()

        total_loss += loss.item()
        num_batches += 1

    return total_loss / num_batches if num_batches > 0 else float("inf")


def evaluate(model, loader, device, cfg, max_batches: int = None) -> dict:
    """Validation evaluation: runs model.eval() and computes val_loss.

    Args:
        model: detection model
        loader: validation DataLoader
        device: torch device
        cfg: HyperParams
        max_batches: cap on number of batches for speed (None = all)

    Returns:
        dict with val_loss and inference_fps
    """
    model.eval()
    all_losses = []
    batch_count = 0
    # Determine CPU vs GPU mode for adaptive batch/fps limits
    is_cpu = (str(device) == "cpu") or (hasattr(device, "type") and device.type == "cpu")
    eval_max_batches = 2 if is_cpu else (max_batches if max_batches else 9999)

    with torch.no_grad():
        for images, targets in loader:
            if batch_count >= eval_max_batches:
                break
            images = images.to(device)
            targets = [{k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in t.items()} for t in targets]
            preds = model(images)
            loss = model.compute_loss(preds, targets)
            if not (torch.isnan(loss) or torch.isinf(loss)):
                all_losses.append(loss.item())
            batch_count += 1

    avg_loss = float("nan") if len(all_losses) == 0 else sum(all_losses) / len(all_losses)
    # CPU: skip FPS benchmark; GPU: limited benchmark
    fps_warmup = 0 if is_cpu else 2
    fps_max_iters = 0 if is_cpu else 3
    fps = benchmark_inference_fps(model, device, cfg.img_size,
                                   warmup=fps_warmup, max_iters=fps_max_iters, time_budget=3.0)

    return {
        "val_loss": avg_loss,
        "trainable_params_ratio": float(model.trainable_params) / max(1, sum(p.numel() for p in model.parameters())),
        "inference_fps": fps,
    }


def benchmark_inference_fps(model: torch.nn.Module, device: str, img_size: int,
                             warmup: int = 10, max_iters: int = 100,
                             time_budget: float = 15.0) -> float:
    """Measure inference throughput in FPS on dummy input.

    Args:
        model: the model to benchmark
        device: "cuda" or "cpu"
        img_size: input image size (640)
        warmup: number of warmup iterations
        max_iters: maximum number of timed iterations
        time_budget: max seconds to spend benchmarking (caps actual iters)

    Returns:
        Frames per second (float)
    """
    model.eval()
    dummy = torch.randn(1, 3, img_size, img_size, device=device)

    with torch.no_grad():
        for _ in range(warmup):
            _ = model(dummy)

    _is_cuda = str(device) == "cuda" or (hasattr(device, "type") and device.type == "cuda")
    if torch.cuda.is_available() and _is_cuda:
        torch.cuda.synchronize()

    t_start = time.time()
    count = 0
    with torch.no_grad():
        for i in range(max_iters):
            elapsed = time.time() - t_start
            if elapsed >= time_budget:
                break
            _ = model(dummy)
            count += 1

    _is_cuda = str(device) == "cuda" or (hasattr(device, "type") and device.type == "cuda")
    if torch.cuda.is_available() and _is_cuda:
        torch.cuda.synchronize()

    elapsed = time.time() - t_start
    fps = count / elapsed if elapsed > 0 else 0.0
    return fps


def linear_probe_training_loop(model, train_loader, val_loader, optimizer, scheduler,
                                 device, cfg, cond_cfg: dict,
                                 time_budget: float = float("inf")) -> dict:
    """Training loop for frozen-backbone conditions.

    Args:
        model: detection model
        train_loader, val_loader: DataLoaders
        optimizer, scheduler: optimizer and LR scheduler
        device: torch device
        cfg: HyperParams
        cond_cfg: condition-specific config dict
        time_budget: max seconds for the entire training

    Returns:
        dict with best_val_loss, per-epoch metrics
    """
    best_val_loss = float("inf")
    metrics = {"train_loss": [], "val_loss": [], "inference_fps": []}
    loop_start = time.time()

    for epoch in range(cond_cfg["epochs"]):
        epoch_start = time.time()

        # Per-epoch time budget: evenly divide remaining time
        elapsed_so_far = time.time() - loop_start
        remaining = time_budget - elapsed_so_far
        if remaining <= 0:
            print(f"    [TimeBudget] No time for epoch {epoch}")
            break
        epoch_budget = remaining / (cond_cfg["epochs"] - epoch)

        train_loss = train_one_epoch(
            model, train_loader, optimizer, scheduler, device, cfg, epoch, epoch_budget
        )
        val_metrics = evaluate(model, val_loader, device, cfg, max_batches=20)
        epoch_time = time.time() - epoch_start

        # NaN guard for val_loss
        val_loss = val_metrics["val_loss"]
        if val_loss != val_loss:  # NaN check
            val_loss = best_val_loss

        print(f"    Epoch {epoch}: train_loss={train_loss:.4f} val_loss={val_loss:.4f} "
              f"time={epoch_time:.1f}s fps={val_metrics['inference_fps']:.1f}")

        metrics["train_loss"].append(train_loss)
        metrics["val_loss"].append(val_loss)
        metrics["inference_fps"].append(val_metrics["inference_fps"])

        if val_loss < best_val_loss:
            best_val_loss = val_loss

    return {"best_val_loss": best_val_loss, "metrics": metrics}


def run_phase(phase_id: int, description: str, budget_seconds: float,
              fn, *args) -> tuple:
    """Time-budgeted execution wrapper.

    Args:
        phase_id: phase number
        description: human-readable description
        budget_seconds: max seconds for this phase
        fn: callable to execute
        *args: arguments to fn

    Returns:
        (elapsed_time, result or None)
    """
    t_start = time.time()
    try:
        result = fn(*args)
    except Exception as e:
        elapsed = time.time() - t_start
        print(f"  ERROR PHASE {phase_id} ({description}): {e}")
        return elapsed, None

    elapsed = time.time() - t_start
    if elapsed > budget_seconds:
        print(f"  [TIME] Phase {phase_id} ({description}): {elapsed:.1f}s / {budget_seconds:.1f}s budget")
    else:
        print(f"  [TIME] Phase {phase_id} ({description}): {elapsed:.1f}s / {budget_seconds:.1f}s budget")
    return elapsed, result
