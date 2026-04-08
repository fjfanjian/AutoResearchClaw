"""filename:data.py
VisDrone2019-DET dataset loader.
Dataset: COCO-format aerial object detection, 6471 train / 548 val images.
10 classes: pedestrian, people, bicycle, car, van, truck, tricycle, awning-tricycle, bus, motor.
Regimes: tiny_subset (50 val), small_train_subset (500 train), full_scale (548 val).
"""
import json
import os
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image


class VisDroneCocoDataset(Dataset):
    """VisDrone2019-DET in COCO format."""

    def __init__(self, data_root: str, annotation_file: str, img_size: int = 640, regime: str = "full_scale"):
        self.data_root = data_root
        self.img_size = img_size
        self.regime = regime

        # Load COCO annotations
        with open(annotation_file, "r") as f:
            self.coco_data = json.load(f)

        # Build image_id → image_info mapping
        self.images = {img["id"]: img for img in self.coco_data["images"]}
        # Build image_id → list of annotations mapping
        ann_map = {}
        for ann in self.coco_data["annotations"]:
            img_id = ann["image_id"]
            ann_map.setdefault(img_id, []).append(ann)

        # Determine which image_ids to use based on regime
        all_image_ids = sorted([img["id"] for img in self.coco_data["images"]])

        if regime == "tiny_subset":
            self.image_ids = all_image_ids[:50]
        elif regime == "small_train_subset":
            self.image_ids = all_image_ids[:500]
        elif regime == "full_scale":
            self.image_ids = all_image_ids
        elif regime == "full_train":
            self.image_ids = all_image_ids
        else:
            self.image_ids = all_image_ids

        self.ann_map = ann_map

        # Image transforms: Resize → ToTensor → Normalize
        self.transform = transforms.Compose([
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225]),
        ])

    def __len__(self):
        return len(self.image_ids)

    def __getitem__(self, idx):
        image_id = self.image_ids[idx]
        img_info = self.images[image_id]

        # Load image
        img_path = os.path.join(self.data_root, img_info["file_name"])
        try:
            image = Image.open(img_path).convert("RGB")
        except Exception:
            image = Image.new("RGB", (self.img_size, self.img_size))

        orig_w, orig_h = img_info.get("width", self.img_size), img_info.get("height", self.img_size)

        # Transform
        image_tensor = self.transform(image)  # [3, img_size, img_size]

        # Get annotations
        anns = self.ann_map.get(image_id, [])
        boxes = []
        labels = []
        for ann in anns:
            cat = ann["category_id"]
            if cat < 1 or cat > 10:
                continue
            bbox = ann["bbox"]  # [x, y, w, h]
            x, y, w, h = bbox
            # Convert to xyxy, clip to image bounds
            x1 = max(0.0, min(float(x), self.img_size - 1))
            y1 = max(0.0, min(float(y), self.img_size - 1))
            x2 = max(0.0, min(float(x + w), self.img_size - 1))
            y2 = max(0.0, min(float(y + h), self.img_size - 1))
            if x2 > x1 and y2 > y1:
                boxes.append([x1, y1, x2, y2])
                labels.append(int(cat))

        if len(boxes) == 0:
            boxes = torch.zeros(0, 4, dtype=torch.float32)
            labels = torch.zeros(0, dtype=torch.int64)
        else:
            boxes = torch.tensor(boxes, dtype=torch.float32)
            labels = torch.tensor(labels, dtype=torch.int64)

        target = {
            "boxes": boxes,
            "labels": labels,
            "image_id": image_id,
            "orig_size": [orig_h, orig_w],
        }
        return image_tensor, target

    @staticmethod
    def collate_fn(batch):
        """Custom collate for variable N boxes per image."""
        images = torch.stack([item[0] for item in batch])
        targets = [item[1] for item in batch]
        return images, targets


def build_dataloaders(cfg, regime: str = "tiny_subset", num_workers: int = 2):
    """Build train and val DataLoaders for the given regime."""
    train_regime = "small_train_subset" if regime in ("tiny_subset", "small_train_subset") else "full_train"
    val_regime = regime if regime != "full_train" else "full_scale"

    train_dataset = VisDroneCocoDataset(
        data_root=cfg.data_root,
        annotation_file=os.path.join(cfg.data_root, "train_coco.json"),
        img_size=cfg.img_size,
        regime=train_regime,
    )
    val_dataset = VisDroneCocoDataset(
        data_root=cfg.data_root,
        annotation_file=os.path.join(cfg.data_root, "val_coco.json"),
        img_size=cfg.img_size,
        regime=val_regime,
    )

    train_loader = DataLoader(
        train_dataset,
        batch_size=cfg.batch_size,
        shuffle=True,
        num_workers=num_workers,
        collate_fn=VisDroneCocoDataset.collate_fn,
        pin_memory=True,
        drop_last=True,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=cfg.batch_size,
        shuffle=False,
        num_workers=num_workers,
        collate_fn=VisDroneCocoDataset.collate_fn,
        pin_memory=True,
    )
    return train_loader, val_loader


def compute_fcos_targets(targets, feat_size: int, stride: int, img_size: int, num_classes: int = 10):
    """Generate per-location FCOS classification and regression targets.

    Args:
        targets: list of target dicts from dataset (boxes [N,4] xyxy, labels [N])
        feat_size: spatial size H=W of this FPN level
        stride: stride of this FPN level (4, 8, 16, or 32)
        img_size: input image size (640)
        num_classes: number of object classes (10)

    Returns:
        cls_target: [B, feat_size, feat_size] — 0=background, 1..10=object class
        bbox_target: [B, 4, feat_size, feat_size] — (l,t,r,b) distances to nearest GT
        ctr_target: [B, feat_size, feat_size] — centerness score
    """
    B = len(targets)
    device = torch.device("cpu")

    # Initialize targets with background (class 0)
    cls_target = torch.zeros(B, feat_size, feat_size, dtype=torch.int64)
    bbox_target = torch.zeros(B, 4, feat_size, feat_size, dtype=torch.float32)
    ctr_target = torch.zeros(B, feat_size, feat_size, dtype=torch.float32)

    for b in range(B):
        boxes = targets[b]["boxes"]  # [N, 4] xyxy
        labels = targets[b]["labels"]  # [N]
        if boxes.shape[0] == 0:
            continue

        for i in range(feat_size):
            for j in range(feat_size):
                # Location center in image coordinates
                cx = (j * stride + stride / 2) / img_size
                cy = (i * stride + stride / 2) / img_size

                best_dist = float("inf")
                best_box_idx = -1
                for k in range(boxes.shape[0]):
                    bx1, by1, bx2, by2 = boxes[k].tolist()
                    bx1 /= img_size; by1 /= img_size
                    bx2 /= img_size; by2 /= img_size

                    # Check if location is inside box (normalized coords)
                    if cx < bx1 or cx > bx2 or cy < by1 or cy > by2:
                        continue

                    # Distance to each side
                    l = cx - bx1
                    t = cy - by1
                    r = bx2 - cx
                    b_d = by2 - cy
                    max_dist = max(l, t, r, b_d)

                    if max_dist < best_dist:
                        best_dist = max_dist
                        best_box_idx = k

                if best_box_idx >= 0:
                    bx1, by1, bx2, by2 = boxes[best_box_idx].tolist()
                    bx1 /= img_size; by1 /= img_size
                    bx2 /= img_size; by2 /= img_size
                    l = cx - bx1
                    t = cy - by1
                    r = bx2 - cx
                    b_d = by2 - cy

                    # Clamp to avoid negative (numerical stability)
                    l = max(l, 1e-6); t = max(t, 1e-6)
                    r = max(r, 1e-6); b_d = max(b_d, 1e-6)

                    cls_target[b, i, j] = labels[best_box_idx].item()
                    bbox_target[b, 0, i, j] = l
                    bbox_target[b, 1, i, j] = t
                    bbox_target[b, 2, i, j] = r
                    bbox_target[b, 3, i, j] = b_d

                    # Centerness: geometric mean of normalized side ratios
                    min_lr = min(l, r)
                    max_lr = max(l, r)
                    min_tb = min(t, b_d)
                    max_tb = max(t, b_d)
                    ctr_target[b, i, j] = (min_lr / max_lr) * (min_tb / max_tb)

    return cls_target, bbox_target, ctr_target
