"""filename:config.py
HYPERPARAMETERS:
  data_root: "/home/fj/datasets/visdrone"
  dinov3_ckpt: "/home/fj/dinov3/weights/dinov3_vitb16_pretrain_lvd1689m-73cec8be.pth"
  img_size: 640
  num_classes: 10
  fpn_out_dim: 256
  dinov3_patch_size: 16
  dinov3_embed_dim: 768
  dinov3_num_blocks: 12
  batch_size: 2
  linear_probe_epochs: 3
  fully_ft_epochs: 2
  base_lr: 0.005
  weight_decay: 0.0001
  grad_clip: 1.0
  seed_list: [0, 1, 2]
  small_train_size: 500
  tiny_val_size: 50
"""
from dataclasses import dataclass


@dataclass
class HyperParams:
    """Centralized hyperparameters for all experiment conditions."""
    data_root: str = "/home/fj/datasets/visdrone"
    dinov3_ckpt: str = "/home/fj/dinov3/weights/dinov3_vitb16_pretrain_lvd1689m-73cec8be.pth"
    img_size: int = 640
    num_classes: int = 10
    fpn_out_dim: int = 256
    dinov3_patch_size: int = 16
    dinov3_embed_dim: int = 768
    dinov3_num_blocks: int = 12
    batch_size: int = 2
    linear_probe_epochs: int = 3
    fully_ft_epochs: int = 2
    base_lr: float = 0.005
    weight_decay: float = 1e-4
    grad_clip: float = 1.0
    seed_list: list = None

    def __post_init__(self):
        if self.seed_list is None:
            self.seed_list = [0, 1, 2]


def get_condition_config(condition_name: str) -> dict:
    """Per-condition LR, epochs, and freezing strategy."""
    configs = {
        "rtdetr_r18_fully_finetuned": {
            "lr": 0.01,
            "epochs": 2,
            "freeze_backbone": False,
            "backbone_lr_mult": 1.0,
            "adapter_lr_mult": 1.0,
        },
        "rtdetr_r18_linear_probe": {
            "lr": 0.05,
            "epochs": 3,
            "freeze_backbone": True,
            "backbone_lr_mult": 0.0,
            "adapter_lr_mult": 1.0,
        },
        "dinov3_vitb16_no_adapter_direct_head": {
            "lr": 0.005,
            "epochs": 3,
            "freeze_backbone": True,
            "backbone_lr_mult": 0.0,
            "adapter_lr_mult": 1.0,
        },
        "dinov3_vitb16_attention_adapter": {
            "lr": 0.005,
            "epochs": 3,
            "freeze_backbone": True,
            "backbone_lr_mult": 0.0,
            "adapter_lr_mult": 0.1,
        },
        "dinov3_vitb16_partial_finetune": {
            "lr": 0.005,
            "epochs": 3,
            "freeze_backbone": False,
            "backbone_lr_mult": 1e-4,
            "adapter_lr_mult": 1.0,
        },
    }
    if condition_name not in configs:
        raise ValueError(f"Unknown condition: {condition_name}")
    return configs[condition_name]
