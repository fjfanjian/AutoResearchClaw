"""filename:models.py
DINOv3 ViT-B/16 backbone + ResNet18 backbone + FPN + FCOS Head + 5 Condition Models.

DINOv3 ViT-B/16: 85.7M params, 12 blocks, 768-dim, patch=16.
Input 640×640×3 → patch_embed → 12 transformer blocks → 1600 patch tokens.
FPN: 4-level Feature Pyramid Network, 256 channels per level.
FCOS: anchor-free detection head with focal cls + smooth L1 bbox + BCE centerness.
"""
import math
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision


# ══════════════════════════════════════════════════════════════════
# DINOv3 ViT-B/16 Backbone
# ══════════════════════════════════════════════════════════════════


class RotaryEmbedding(nn.Module):
    """Rotary Position Embedding (RoPE) — DINOv3 uses this instead of learned pos embeddings."""

    def __init__(self, dim: int, rope_periods: torch.Tensor):
        super().__init__()
        self.dim = dim
        # Use the first (largest) period as the base frequency for inv_freq
        # The DINOv3 checkpoint stores periods=[32,16,8,4]; we use period=32 as base
        base_period = float(rope_periods[0].item()) if rope_periods.numel() > 0 else 32.0
        # inv_freq[d//2] = 1 / (base_period ^ (d / dim))
        self.register_buffer(
            "inv_freq",
            1.0 / (base_period ** (torch.arange(0, dim, 2).float() / dim))
        )

    def forward(self, q: torch.Tensor, k: torch.Tensor) -> tuple:
        """Apply rotary embedding to q and k in-place.

        Args:
            q: [B, H, N, D] query (D = head_dim, must be even)
            k: [B, H, N, D] key
        Returns:
            q, k with rotary applied
        """
        seq_len = q.shape[2]
        device = q.device

        # Build angle: [N, D//2]
        t = torch.arange(seq_len, device=device, dtype=self.inv_freq.dtype)
        angle = t.unsqueeze(1) * self.inv_freq.unsqueeze(0)  # [N, D//2]
        angle = angle.repeat_interleave(2, dim=-1)  # [N, D] — interleave to pair dims

        cos = angle.cos()   # [N, D]
        sin = angle.sin()   # [N, D]

        # Reshape for broadcasting: [1, 1, N, D]
        cos = cos.view(1, 1, seq_len, self.dim)
        sin = sin.view(1, 1, seq_len, self.dim)

        q_f = q.float()
        k_f = k.float()

        # Rotate: q' = q * cos + rotate(q) * sin
        # For each pair (d, d+D/2): rotate by angle
        # rotate(q)[d] = -q[d+1], rotate(q)[d+1] = q[d]
        half = self.dim // 2
        q_even = q_f[..., :half]
        q_odd = q_f[..., half:]
        k_even = k_f[..., :half]
        k_odd = k_f[..., half:]

        q_out = torch.cat([
            q_even * cos[..., :half] + (-q_odd) * sin[..., :half],
            q_odd * cos[..., half:] + q_even * sin[..., half:],
        ], dim=-1)
        k_out = torch.cat([
            k_even * cos[..., :half] + (-k_odd) * sin[..., :half],
            k_odd * cos[..., half:] + k_even * sin[..., half:],
        ], dim=-1)

        return q_out.type_as(q), k_out.type_as(k)


class TransformerBlock(nn.Module):
    """DINOv3 transformer block with pre-norm, RoPE attention, and MLP."""

    def __init__(self, embed_dim: int, num_heads: int = 12, mlp_ratio: float = 4.0,
                 dropout: float = 0.1):
        super().__init__()
        self.embed_dim = embed_dim
        self.num_heads = num_heads
        self.head_dim = embed_dim // num_heads
        self.scale = self.head_dim ** -0.5

        # Pre-norm
        self.norm1 = nn.LayerNorm(embed_dim)
        self.norm2 = nn.LayerNorm(embed_dim)

        # Attention: combined qkv projection
        self.attn_qkv = nn.Linear(embed_dim, embed_dim * 3)
        self.attn_proj = nn.Linear(embed_dim, embed_dim)

        # RoPE — period list [32, 16, 8, 4] typical for DINOv3 ViT-B/16
        period_list = torch.tensor([32.0, 16.0, 8.0, 4.0])
        self.rope = RotaryEmbedding(self.head_dim, period_list)

        # MLP
        mlp_hidden = int(embed_dim * mlp_ratio)
        self.mlp_fc1 = nn.Linear(embed_dim, mlp_hidden)
        self.mlp_fc2 = nn.Linear(mlp_hidden, embed_dim)
        self.mlp_act = nn.GELU()
        self.mlp_dropout = nn.Dropout(dropout)

        # Layer scale
        self.ls1_gamma = nn.Parameter(torch.ones(embed_dim) * 0.1)
        self.ls2_gamma = nn.Parameter(torch.ones(embed_dim) * 0.1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward with pre-norm, RoPE attention, and MLP."""
        B, N, C = x.shape

        # Pre-norm + attention with residual
        h = self.norm1(x)
        qkv = self.attn_qkv(h)  # [B, N, 3*C]
        qkv = qkv.reshape(B, N, 3, self.num_heads, self.head_dim)
        qkv = qkv.permute(2, 0, 3, 1, 4)  # [3, B, H, N, D]
        q, k, v = qkv[0], qkv[1], qkv[2]  # each [B, H, N, D]

        # Apply RoPE to q and k
        q, k = self.rope(q, k)

        # Scaled dot-product attention
        attn = (q @ k.transpose(-2, -1)) * self.scale  # [B, H, N, N]
        attn = F.softmax(attn, dim=-1)
        attn = self.mlp_dropout(attn)

        # Project and combine heads
        attn_out = (attn @ v).transpose(1, 2).reshape(B, N, C)  # [B, N, C]
        attn_out = self.attn_proj(attn_out)

        # Layer scale
        x = x + self.ls1_gamma * attn_out

        # MLP with residual
        h = self.norm2(x)
        mlp_out = self.mlp_fc2(self.mlp_act(self.mlp_fc1(h)))
        mlp_out = self.mlp_dropout(mlp_out)
        x = x + self.ls2_gamma * mlp_out

        return x


class DINOv3ViTBackbone(nn.Module):
    """DINOv3 ViT-B/16 frozen backbone. Output: [B, 1600, 768] patch tokens."""

    def __init__(self, ckpt_path: str):
        super().__init__()
        self.patch_size = 16
        self.embed_dim = 768
        self.num_blocks = 12
        self.num_patches_per_side = 640 // 16  # 40
        self.num_tokens = 40 * 40  # 1600 patches only

        # Patch embedding: Conv2d as linear projection (unstructured weight)
        self.patch_embed = nn.Conv2d(3, self.embed_dim, kernel_size=16, stride=16)

        # CLS and storage tokens (loaded from checkpoint)
        self.cls_token = nn.Parameter(torch.zeros(1, 1, self.embed_dim))
        self.storage_tokens = nn.Parameter(torch.zeros(1, 4, self.embed_dim))

        # Transformer blocks
        self.blocks = nn.ModuleList([
            TransformerBlock(self.embed_dim, num_heads=12) for _ in range(12)
        ])
        self.norm = nn.LayerNorm(self.embed_dim)

        # Load pretrained weights
        self._load_dinov3_weights(ckpt_path)
        self._freeze_all_params()

    def _load_dinov3_weights(self, ckpt_path: str):
        """Load DINOv3 pretrain weights from .pth file.

        Checkpoint keys (from inspection):
          blocks.{i}.norm1.weight, blocks.{i}.attn.qkv.weight,
          blocks.{i}.attn.proj.weight, blocks.{i}.ls1.gamma,
          blocks.{i}.norm2.weight, blocks.{i}.mlp.fc1.weight,
          blocks.{i}.mlp.fc2.weight, blocks.{i}.ls2.gamma,
          norm.weight, norm.bias, patch_embed.proj.weight/bias,
          cls_token, storage_tokens, rope_embed.periods
        """
        state_dict = torch.load(ckpt_path, map_location="cpu", weights_only=True)
        our_dict = self.state_dict()
        loaded_dict = {}

        for key, value in state_dict.items():
            # Patch embed: Conv2d weight only (no bias in our Conv2d)
            if key == "patch_embed.proj.weight":
                if "patch_embed.weight" in our_dict and value.shape == our_dict["patch_embed.weight"].shape:
                    loaded_dict["patch_embed.weight"] = value
            elif key == "patch_embed.proj.bias":
                pass  # Conv2d doesn't expose bias as separate param

            # Block keys: replace dot-notation with underscore-notation
            elif key.startswith("blocks."):
                new_key = (key
                    .replace(".attn.qkv.", ".attn_qkv.")
                    .replace(".attn.proj.", ".attn_proj.")
                    .replace(".mlp.fc1.", ".mlp_fc1.")
                    .replace(".mlp.fc2.", ".mlp_fc2.")
                    .replace(".ls1.gamma", ".ls1_gamma")
                    .replace(".ls2.gamma", ".ls2_gamma")
                )
                if new_key in our_dict and value.shape == our_dict[new_key].shape:
                    loaded_dict[new_key] = value
                else:
                    pass  # Skip mismatched shapes

            # Global norm and tokens
            elif key in ("norm.weight", "norm.bias", "cls_token", "storage_tokens"):
                if key in our_dict and value.shape == our_dict[key].shape:
                    loaded_dict[key] = value

        self.load_state_dict(loaded_dict, strict=False)
        total_loaded = sum(v.numel() for v in loaded_dict.values())
        total_model = sum(v.numel() for v in self.state_dict().values())
        print(f"  [DINOv3] Loaded {total_loaded/1e6:.1f}M / {total_model/1e6:.1f}M params "
              f"({len(loaded_dict)} tensors)")

    def _freeze_all_params(self):
        """Freeze all parameters."""
        for param in self.parameters():
            param.requires_grad = False

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward: [B, 3, 640, 640] → [B, 1600, 768] patch tokens."""
        B = x.shape[0]

        # Patch embedding: [B, 3, 640, 640] → [B, 768, 40, 40]
        x = self.patch_embed(x)
        # Reshape to sequence: [B, 768, 1600]
        x = x.flatten(2).transpose(1, 2)  # [B, 1600, 768]

        # Prepend CLS token and storage tokens
        cls_t = self.cls_token.expand(B, -1, -1)  # [B, 1, 768]
        storage_t = self.storage_tokens.expand(B, -1, -1)  # [B, 4, 768]
        x = torch.cat([cls_t, storage_t, x], dim=1)  # [B, 1605, 768]

        # Transformer blocks
        for block in self.blocks:
            x = block(x)  # [B, 1605, 768]

        x = self.norm(x)  # [B, 1605, 768]

        # Strip CLS + storage tokens, return only patch tokens
        return x[:, 5:, :]  # [B, 1600, 768]


# ══════════════════════════════════════════════════════════════════
# ResNet18 Backbone
# ══════════════════════════════════════════════════════════════════


class ResNet18Backbone(nn.Module):
    """ResNet18 backbone with multi-scale feature output for FPN."""

    def __init__(self, pretrained: bool = True):
        super().__init__()
        rn18 = torchvision.models.resnet18(
            weights="DEFAULT" if pretrained else None
        )
        self.conv1 = rn18.conv1
        self.bn1 = rn18.bn1
        self.relu = rn18.relu
        self.maxpool = rn18.maxpool
        self.layer1 = rn18.layer1  # stride 4,  [B, 64,  160, 160]
        self.layer2 = rn18.layer2  # stride 8,  [B, 128,  80,  80]
        self.layer3 = rn18.layer3  # stride 16, [B, 256,  40,  40]
        self.layer4 = rn18.layer4  # stride 32, [B, 512,  20,  20]
        self.out_channels = 512

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Single-scale forward: returns pooled [B, 512] features."""
        x = self.conv1(x); x = self.bn1(x); x = self.relu(x); x = self.maxpool(x)
        x = self.layer1(x); x = self.layer2(x); x = self.layer3(x); x = self.layer4(x)
        pooled = F.adaptive_avg_pool2d(x, 1)
        return pooled.flatten(1)  # [B, 512]

    def forward_multi_scale(self, x: torch.Tensor) -> dict:
        """Multi-scale forward: returns dict of feature maps for FPN."""
        x = self.conv1(x); x = self.bn1(x); x = self.relu(x); x = self.maxpool(x)
        c2 = self.layer1(x)   # [B, 64,  160, 160]
        c3 = self.layer2(c2)  # [B, 128,  80,  80]
        c4 = self.layer3(c3)  # [B, 256,  40,  40]
        c5 = self.layer4(c4)  # [B, 512,  20,  20]
        return {"c2": c2, "c3": c3, "c4": c4, "c5": c5}


# ══════════════════════════════════════════════════════════════════
# Adapters
# ══════════════════════════════════════════════════════════════════


class CNNUpsampleAdapter(nn.Module):
    """CNN upsampling adapter for DINOv3 patch tokens.

    Reshapes [B, 1600, 768] → [B, 768, 40, 40] → 3-stage upsampling → c2-c5 pyramid.
    KEY DIFFERENCE: Residual convolutions + bilinear upsampling for spatial refinement.
    """

    def __init__(self, embed_dim: int = 768, out_dim: int = 256):
        super().__init__()
        self.embed_dim = embed_dim
        self.out_dim = out_dim

        # Stage 1: 40×40, 768 ch
        self.stage1 = nn.Sequential(
            nn.Conv2d(embed_dim, 512, 3, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            nn.Conv2d(512, 512, 3, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
        )
        # Stage 2: upsampling 40→80, 512→384 ch
        self.stage2_upsample = nn.Sequential(
            nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False),
            nn.Conv2d(512, 384, 3, padding=1),
            nn.BatchNorm2d(384),
            nn.ReLU(inplace=True),
        )
        # Stage 3: upsampling 80→160, 384→256 ch
        self.stage3_upsample = nn.Sequential(
            nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False),
            nn.Conv2d(384, out_dim, 3, padding=1),
            nn.BatchNorm2d(out_dim),
            nn.ReLU(inplace=True),
        )

    def forward(self, tokens: torch.Tensor) -> dict:
        """tokens: [B, 1600, 768] → dict c2-c5 pyramid."""
        B = tokens.shape[0]
        # Reshape to spatial: [B, 1600, 768] → [B, 768, 40, 40]
        x = tokens.transpose(1, 2).view(B, self.embed_dim, 40, 40)  # [B,768,40,40]
        c5 = self.stage1(x)  # [B, 512, 40, 40]
        c4 = self.stage2_upsample(c5)  # [B, 384, 80, 80]
        c3 = self.stage3_upsample(c4)  # [B, 256, 160, 160]
        c2 = F.max_pool2d(c3, kernel_size=2, stride=2)  # [B, 256, 80, 80]
        return {"c2": c2, "c3": c3, "c4": c4, "c5": c5}


class CrossAttentionAdapter(nn.Module):
    """Cross-attention adapter: DINOv3 tokens → spatial queries → adapted tokens.

    Uses bidirectional MHSA with 64 learnable spatial query tokens.
    KEY DIFFERENCE: Token-level attention refinement (vs CNN convolutions).
    768 → 256 dimension reduction.
    """

    def __init__(self, embed_dim: int = 768, adapter_dim: int = 256, num_queries: int = 64):
        super().__init__()
        self.embed_dim = embed_dim
        self.adapter_dim = adapter_dim
        self.num_queries = num_queries

        # Spatial queries: 8×8 = 64 learnable position tokens
        self.spatial_queries = nn.Parameter(torch.randn(1, num_queries, adapter_dim) * 0.02)

        # Projections for patch tokens: 768 → 256
        self.query_proj = nn.Linear(embed_dim, adapter_dim)
        self.key_proj = nn.Linear(embed_dim, adapter_dim)
        self.value_proj = nn.Linear(embed_dim, adapter_dim)

        # Projection for spatial queries
        self.spatial_kv_proj = nn.Linear(adapter_dim, adapter_dim)

        # Cross-attention: 8-head MHSA
        self.cross_attn = nn.MultiheadAttention(
            embed_dim=adapter_dim, num_heads=8, batch_first=True, dropout=0.1
        )

        # FFN after attention
        self.ffn = nn.Sequential(
            nn.Linear(adapter_dim, adapter_dim * 2),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(adapter_dim * 2, adapter_dim),
        )
        self.norm1 = nn.LayerNorm(adapter_dim)
        self.norm2 = nn.LayerNorm(adapter_dim)

        # Output projection
        self.output_proj = nn.Linear(adapter_dim, adapter_dim)

    def forward(self, tokens: torch.Tensor) -> torch.Tensor:
        """tokens: [B, 1600, 768] → adapted: [B, 1600, 256].

        Uses two separate cross-attention calls to avoid multi-head reshape issues:
        1. Spatial queries → attend to all patch tokens (gather global context)
        2. Each patch token → attend to enriched spatial queries (broadcast refinement)
        """
        B = tokens.shape[0]

        # Project patch tokens to adapter_dim
        q = self.query_proj(tokens)   # [B, 1600, 256]
        k = self.key_proj(tokens)     # [B, 1600, 256]
        v = self.value_proj(tokens)   # [B, 1600, 256]

        # Spatial queries: 64 learnable tokens
        sq = self.spatial_queries.expand(B, -1, -1)  # [B, 64, 256]

        # Step 1: Spatial queries attend to patch tokens
        # cross_attn(query=[B,64,256], key=[B,1600,256], value=[B,1600,256])
        sq_enriched, _ = self.cross_attn(
            query=sq,          # [B, 64, 256]
            key=k,             # [B, 1600, 256]
            value=v            # [B, 1600, 256]
        )  # → [B, 64, 256]
        sq = sq + sq_enriched
        sq = self.norm1(sq)
        sq = sq + self.ffn(sq)
        sq = self.norm2(sq)  # [B, 64, 256]

        # Step 2: Patch tokens attend to enriched spatial queries
        # cross_attn(query=[B,1600,256], key=[B,64,256], value=[B,64,256])
        patch_refined, _ = self.cross_attn(
            query=q,           # [B, 1600, 256]
            key=sq,            # [B, 64, 256]
            value=sq           # [B, 64, 256]
        )  # → [B, 1600, 256]
        refined = q + patch_refined  # residual
        refined = self.norm1(refined)
        refined = refined + self.ffn(refined)
        out = self.output_proj(self.norm2(refined))  # [B, 1600, 256]

        return out


# ══════════════════════════════════════════════════════════════════
# FPN Neck
# ══════════════════════════════════════════════════════════════════


class FeaturePyramidNetwork(nn.Module):
    """4-level FPN. Accepts c2-c5 dict → outputs p2-p5 dict (all 256-ch)."""

    def __init__(self, in_channels: int = 256, out_channels: int = 256):
        super().__init__()
        self.out_channels = out_channels

        # Lateral 1×1 convs to reduce channels
        self.lateral_c2 = nn.Conv2d(in_channels, out_channels, 1)
        self.lateral_c3 = nn.Conv2d(in_channels, out_channels, 1)
        self.lateral_c4 = nn.Conv2d(in_channels, out_channels, 1)
        self.lateral_c5 = nn.Conv2d(in_channels, out_channels, 1)

        # Output 3×3 convs to reduce aliasing
        self.fpn_c2 = nn.Conv2d(out_channels, out_channels, 3, padding=1)
        self.fpn_c3 = nn.Conv2d(out_channels, out_channels, 3, padding=1)
        self.fpn_c4 = nn.Conv2d(out_channels, out_channels, 3, padding=1)
        self.fpn_c5 = nn.Conv2d(out_channels, out_channels, 3, padding=1)

    def forward(self, features: dict) -> dict:
        """features: {c2, c3, c4, c5} → {p2, p3, p4, p5}."""
        c2 = self.lateral_c2(features["c2"])
        c3 = self.lateral_c3(features["c3"])
        c4 = self.lateral_c4(features["c4"])
        c5 = self.lateral_c5(features["c5"])

        # Top-down path
        p5 = self.fpn_c5(c5)  # [B, 256, H5, W5]
        p5_up = F.interpolate(p5, size=c4.shape[2:], mode="nearest")
        p4 = self.fpn_c4(c4 + p5_up)
        p4_up = F.interpolate(p4, size=c3.shape[2:], mode="nearest")
        p3 = self.fpn_c3(c3 + p4_up)
        p3_up = F.interpolate(p3, size=c2.shape[2:], mode="nearest")
        p2 = self.fpn_c2(c2 + p3_up)

        return {"p2": p2, "p3": p3, "p4": p4, "p5": p5}


# ══════════════════════════════════════════════════════════════════
# FCOS Detection Head
# ══════════════════════════════════════════════════════════════════


class FCOSHead(nn.Module):
    """Anchor-free FCOS detection head. 4 FPN levels × 3 branches (cls/reg/ctr)."""

    def __init__(self, in_channels: int = 256, num_classes: int = 10, num_stacks: int = 4):
        super().__init__()
        self.num_classes = num_classes
        self.strides = {"p2": 4, "p3": 8, "p4": 16, "p5": 32}

        cls_convs = []
        reg_convs = []
        ctr_convs = []

        for i in range(num_stacks):
            cls_convs.append(nn.Conv2d(in_channels, in_channels, 3, padding=1))
            cls_convs.append(nn.GroupNorm(32, in_channels))
            cls_convs.append(nn.ReLU(inplace=True))

            reg_convs.append(nn.Conv2d(in_channels, in_channels, 3, padding=1))
            reg_convs.append(nn.GroupNorm(32, in_channels))
            reg_convs.append(nn.ReLU(inplace=True))

            ctr_convs.append(nn.Conv2d(in_channels, in_channels, 3, padding=1))
            ctr_convs.append(nn.GroupNorm(32, in_channels))
            ctr_convs.append(nn.ReLU(inplace=True))

        self.cls_convs = nn.Sequential(*cls_convs)
        self.reg_convs = nn.Sequential(*reg_convs)
        self.ctr_convs = nn.Sequential(*ctr_convs)

        # Prediction heads: 10 classes + 1 background = 11 channels
        self.cls_head = nn.Conv2d(in_channels, num_classes + 1, 3, padding=1)
        self.reg_head = nn.Conv2d(in_channels, 4, 3, padding=1)   # l, t, r, b
        self.ctr_head = nn.Conv2d(in_channels, 1, 3, padding=1)  # centerness

        self._init_weights()

    def _init_weights(self):
        """Initialize head weights."""
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.normal_(m.weight, std=0.01)
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.GroupNorm):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)

    def forward(self, features: dict) -> dict:
        """features: {p2, p3, p4, p5} → dict with cls/bbox/centerness per level."""
        cls_out = {}
        reg_out = {}
        ctr_out = {}

        for level_name in ["p2", "p3", "p4", "p5"]:
            x = features[level_name]  # [B, 256, H, W]
            cls_feat = self.cls_convs(x)
            reg_feat = self.reg_convs(x)
            ctr_feat = self.ctr_convs(x)

            cls_out[level_name] = self.cls_head(cls_feat)   # [B, 11, H, W]
            reg_out[level_name] = self.reg_head(reg_feat)   # [B, 4, H, W]
            ctr_out[level_name] = self.ctr_head(ctr_feat)   # [B, 1, H, W]

        return {
            "cls": cls_out,
            "bbox": reg_out,
            "centerness": ctr_out,
            "strides": self.strides,
        }


# ══════════════════════════════════════════════════════════════════
# Focal Loss
# ══════════════════════════════════════════════════════════════════


def sigmoid_focal_loss(pred: torch.Tensor, target: torch.Tensor, alpha: float = 0.25,
                       gamma: float = 2.0, reduction: str = "none") -> torch.Tensor:
    """Sigmoid focal loss for classification.

    Args:
        pred: [B, C, H, W] logits
        target: [B, H, W] class indices (0=background, 1..10=object)
        alpha, gamma: focal loss parameters
        reduction: "none" | "mean" | "sum"
    """
    p = pred.softmax(dim=1)  # [B, C, H, W]
    ce_loss = F.cross_entropy(pred, target, reduction="none")  # [B, H, W]
    p_t = p.gather(1, target.unsqueeze(1)).squeeze(1)  # [B, H, W]
    focal_weight = (1 - p_t) ** gamma
    if alpha >= 0:
        alpha_t = torch.where(target > 0, torch.full_like(target, alpha), torch.full_like(target, 1 - alpha))
        focal_weight = alpha_t * focal_weight
    loss = focal_weight * ce_loss
    if reduction == "mean":
        return loss.mean()
    elif reduction == "sum":
        return loss.sum()
    return loss


# ══════════════════════════════════════════════════════════════════
# Base Detector
# ══════════════════════════════════════════════════════════════════


class BaseDetector(nn.Module):
    """Abstract base: backbone + adapter + FPN + FCOSHead.

    Subclasses MUST override: _build_backbone(), _build_adapter(),
    and at least one of forward() or compute_loss().
    """

    def __init__(self, cfg):
        super().__init__()
        self.cfg = cfg
        self.num_classes = cfg.num_classes
        self.fpn = FeaturePyramidNetwork(in_channels=cfg.fpn_out_dim)
        self.head = FCOSHead(in_channels=cfg.fpn_out_dim, num_classes=cfg.num_classes)
        self.strides = [4, 8, 16, 32]
        self._trainable_params = None

    def _build_backbone(self):
        raise NotImplementedError

    def _build_adapter(self):
        raise NotImplementedError

    def forward(self, x):
        raise NotImplementedError

    def compute_loss(self, preds: dict, targets: list) -> torch.Tensor:
        """FCOS detection loss: focal(cls) + smooth_l1(bbox) + bce(centerness)."""
        from data import compute_fcos_targets

        total_cls_loss = 0.0
        total_reg_loss = 0.0
        total_ctr_loss = 0.0
        level_names = ["p2", "p3", "p4", "p5"]

        for i, level_name in enumerate(level_names):
            stride = self.strides[i]
            cls_pred = preds["cls"][level_name]  # [B, 11, H, W]
            reg_pred = preds["bbox"][level_name]  # [B, 4, H, W]
            ctr_pred = preds["centerness"][level_name]  # [B, 1, H, W]

            B, _, H, W = cls_pred.shape

            # Generate targets
            cls_target, bbox_target, ctr_target = compute_fcos_targets(
                targets, feat_size=H, stride=stride,
                img_size=self.cfg.img_size, num_classes=self.num_classes
            )
            cls_target = cls_target.to(cls_pred.device)
            bbox_target = bbox_target.to(reg_pred.device)
            ctr_target = ctr_target.to(ctr_pred.device)

            # Classification: focal loss
            cls_loss = sigmoid_focal_loss(cls_pred, cls_target, alpha=0.25, gamma=2.0)
            total_cls_loss += cls_loss.mean()

            # Regression: only for positive locations (inside GT boxes)
            pos_mask = (cls_target > 0).unsqueeze(1).float()  # [B, 1, H, W]
            reg_pred_exp = torch.exp(reg_pred.clamp(max=10)) * stride  # clamp for stability
            bbox_t = bbox_target.unsqueeze(1).to(reg_pred.device)  # [B, 1, 4, H, W]
            bbox_t = bbox_t.squeeze(1)  # [B, 4, H, W]  ← fix broadcasting mismatch
            reg_loss = F.smooth_l1_loss(
                reg_pred_exp * pos_mask,
                bbox_t * pos_mask,
                reduction="sum"
            )
            pos_count = pos_mask.sum().clamp(min=1.0)
            total_reg_loss += reg_loss / pos_count

            # Centerness: BCE
            ctr_target_squeezed = ctr_target.unsqueeze(1).to(ctr_pred.device)  # [B, 1, H, W]
            ctr_loss = F.binary_cross_entropy_with_logits(
                ctr_pred,
                ctr_target_squeezed,
                reduction="sum"
            )
            total_ctr_loss += ctr_loss / pos_count.squeeze()  # pos_count: [1] → scalar

        loss = total_cls_loss + total_reg_loss + 0.5 * total_ctr_loss
        return loss

    def configure_optimizer(self, cond_cfg: dict):
        """Grouped AdamW: backbone / adapter / head have separate LR multipliers."""
        bb_params = list(self.backbone.parameters())
        adapter_params = [] if self.adapter is None else list(self.adapter.parameters())
        head_params = list(self.fpn.parameters()) + list(self.head.parameters())

        param_groups = [
            {"params": head_params, "lr": cond_cfg["lr"]},
        ]
        if bb_params and cond_cfg["backbone_lr_mult"] > 0:
            param_groups.append({
                "params": bb_params,
                "lr": cond_cfg["lr"] * cond_cfg["backbone_lr_mult"],
            })
        if adapter_params:
            param_groups.append({
                "params": adapter_params,
                "lr": cond_cfg["lr"] * cond_cfg["adapter_lr_mult"],
            })

        optimizer = torch.optim.AdamW(param_groups, lr=cond_cfg["lr"],
                                       weight_decay=self.cfg.weight_decay)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=cond_cfg["epochs"] * 100
        )
        return optimizer, scheduler

    @property
    def trainable_params(self):
        if self._trainable_params is not None:
            return self._trainable_params
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


# ══════════════════════════════════════════════════════════════════
# CONDITION 1: rtdetr_r18_fully_finetuned
# ══════════════════════════════════════════════════════════════════


class ResNet18FullyFinetunedDetector(BaseDetector):
    """ResNet18 pretrained + FPN + FCOS, fully fine-tuned (all params trainable).

    KEY DIFFERENCE: All parameters trainable. Backbone and head both receive
    full LR. Standard fine-tuning protocol.
    """

    def __init__(self, cfg):
        super().__init__(cfg)
        self.backbone = self._build_backbone()
        self.adapter = None

        # Channel projections for FPN input (ResNet multi-scale → FPN)
        self.c2_proj = nn.Conv2d(64, 256, 1)
        self.c3_proj = nn.Conv2d(128, 256, 1)
        self.c4_proj = nn.Conv2d(256, 256, 1)
        self.c5_proj = nn.Conv2d(512, 256, 1)

        self._trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)

    def _build_backbone(self):
        return ResNet18Backbone(pretrained=True)

    def _build_adapter(self):
        return None

    def forward(self, x: torch.Tensor) -> dict:
        """Multi-scale ResNet18 → channel projection → FPN → FCOSHead."""
        multi_scale = self.backbone.forward_multi_scale(x)
        multi_scale["c2"] = self.c2_proj(multi_scale["c2"])
        multi_scale["c3"] = self.c3_proj(multi_scale["c3"])
        multi_scale["c4"] = self.c4_proj(multi_scale["c4"])
        multi_scale["c5"] = self.c5_proj(multi_scale["c5"])
        fpn_feats = self.fpn(multi_scale)
        preds = self.head(fpn_feats)
        return preds


# ══════════════════════════════════════════════════════════════════
# CONDITION 2: rtdetr_r18_linear_probe
# ══════════════════════════════════════════════════════════════════


class ResNet18LinearProbeDetector(BaseDetector):
    """ResNet18 frozen + FPN + FCOS trainable (linear probe).

    KEY DIFFERENCE: Backbone completely frozen (requires_grad=False),
    BN in eval mode. Only FPN + head trainable (~0.3M params).
    """

    def __init__(self, cfg):
        super().__init__(cfg)
        self.backbone = self._build_backbone()
        self.adapter = None

        self.c2_proj = nn.Conv2d(64, 256, 1)
        self.c3_proj = nn.Conv2d(128, 256, 1)
        self.c4_proj = nn.Conv2d(256, 256, 1)
        self.c5_proj = nn.Conv2d(512, 256, 1)

        # KEY DIFFERENCE: Freeze backbone
        for param in self.backbone.parameters():
            param.requires_grad = False
        self.backbone.eval()

        self._trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        print(f"  [LinearProbe] {self._trainable_params/1e6:.2f}M / "
              f"{sum(p.numel() for p in self.parameters())/1e6:.2f}M params trainable")

    def _build_backbone(self):
        return ResNet18Backbone(pretrained=True)

    def _build_adapter(self):
        return None

    def forward(self, x: torch.Tensor) -> dict:
        """Frozen backbone eval mode → channel projection → FPN → FCOSHead."""
        self.backbone.eval()
        with torch.no_grad():
            multi_scale = self.backbone.forward_multi_scale(x)
        multi_scale["c2"] = self.c2_proj(multi_scale["c2"])
        multi_scale["c3"] = self.c3_proj(multi_scale["c3"])
        multi_scale["c4"] = self.c4_proj(multi_scale["c4"])
        multi_scale["c5"] = self.c5_proj(multi_scale["c5"])
        fpn_feats = self.fpn(multi_scale)
        preds = self.head(fpn_feats)
        return preds

    def configure_optimizer(self, cond_cfg: dict):
        """Override: backbone excluded from optimizer (backbone_lr_mult=0)."""
        cond_cfg = dict(cond_cfg)
        cond_cfg["backbone_lr_mult"] = 0.0
        return super().configure_optimizer(cond_cfg)


# ══════════════════════════════════════════════════════════════════
# CONDITION 3: dinov3_vitb16_no_adapter_direct_head
# ══════════════════════════════════════════════════════════════════


class DINOv3NoAdapterDetector(BaseDetector):
    """DINOv3 frozen + direct 768→256 conv projection + FCOS.

    KEY DIFFERENCE: Only a single Conv2d(768→256) between ViT tokens and FPN.
    1600 patch tokens reshaped to 40×40, then bilinearly upsampled to create
    fake multi-scale pyramid. No CNN upsampling, no cross-attention.
    """

    def __init__(self, cfg):
        super().__init__(cfg)
        self.backbone = self._build_backbone()
        self.adapter = None

        # Direct linear projection: 768→256 (Conv2d as 1×1 conv)
        self.direct_proj = nn.Sequential(
            nn.Conv2d(768, 768, 1),
            nn.GELU(),
            nn.Conv2d(768, 256, 1),
        )

        self._trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        print(f"  [DINOv3-NoAdapter] {self._trainable_params/1e6:.2f}M params trainable")

    def _build_backbone(self):
        return DINOv3ViTBackbone(ckpt_path=self.cfg.dinov3_ckpt)

    def _build_adapter(self):
        return None

    def forward(self, x: torch.Tensor) -> dict:
        """DINOv3 tokens → direct proj → bilinear pyramid → FCOSHead."""
        tokens = self.backbone(x)  # [B, 1600, 768]
        B = tokens.shape[0]
        # Reshape: [B, 1600, 768] → [B, 768, 40, 40]
        spatial = tokens.transpose(1, 2).view(B, 768, 40, 40)
        feat256 = self.direct_proj(spatial)  # [B, 256, 40, 40]

        # Create multi-scale pyramid from single 40×40 feature map
        p5 = feat256
        p4 = F.interpolate(feat256, size=(80, 80), mode="bilinear", align_corners=False)
        p3 = F.interpolate(feat256, size=(160, 160), mode="bilinear", align_corners=False)
        p2 = p3

        fpn_feats = {"p2": p2, "p3": p3, "p4": p4, "p5": p5}
        preds = self.head(fpn_feats)
        return preds

    def configure_optimizer(self, cond_cfg: dict):
        """Override: DINOv3 frozen (backbone_lr_mult=0)."""
        cond_cfg = dict(cond_cfg)
        cond_cfg["backbone_lr_mult"] = 0.0
        cond_cfg["adapter_lr_mult"] = 0.0
        return super().configure_optimizer(cond_cfg)


# ══════════════════════════════════════════════════════════════════
# CONDITION 4: dinov3_vitb16_attention_adapter
# ══════════════════════════════════════════════════════════════════


class DINOv3AttentionAdapterDetector(BaseDetector):
    """DINOv3 frozen + CrossAttentionAdapter + FCOS.

    KEY DIFFERENCE: CrossAttentionAdapter uses bidirectional MHSA with
    64 learnable spatial queries to refine 1600 patch tokens.
    Adapter output [B,1600,256] → spatial reshape → bilinear pyramid.
    """

    def __init__(self, cfg):
        super().__init__(cfg)
        self.backbone = self._build_backbone()
        self.adapter = self._build_adapter()

        # Post-attention channel projection
        self.channel_proj = nn.Conv2d(256, 256, 1)

        self._trainable_params = (
            sum(p.numel() for p in self.adapter.parameters()) +
            sum(p.numel() for p in self.channel_proj.parameters()) +
            sum(p.numel() for p in self.fpn.parameters()) +
            sum(p.numel() for p in self.head.parameters())
        )
        print(f"  [DINOv3-AttentionAdapter] {self._trainable_params/1e6:.2f}M adapter params")

    def _build_backbone(self):
        return DINOv3ViTBackbone(ckpt_path=self.cfg.dinov3_ckpt)

    def _build_adapter(self):
        return CrossAttentionAdapter(embed_dim=768, adapter_dim=256, num_queries=64)

    def forward(self, x: torch.Tensor) -> dict:
        """DINOv3 → CrossAttentionAdapter → channel proj → bilinear pyramid → FCOS."""
        tokens = self.backbone(x)  # [B, 1600, 768]
        adapted = self.adapter(tokens)  # [B, 1600, 256]
        B = adapted.shape[0]
        spatial = adapted.transpose(1, 2).view(B, 256, 40, 40)  # [B, 256, 40, 40]
        spatial = self.channel_proj(spatial)  # [B, 256, 40, 40]

        p5 = spatial
        p4 = F.interpolate(spatial, size=(80, 80), mode="bilinear", align_corners=False)
        p3 = F.interpolate(spatial, size=(160, 160), mode="bilinear", align_corners=False)
        p2 = p3

        fpn_feats = {"p2": p2, "p3": p3, "p4": p4, "p5": p5}
        preds = self.head(fpn_feats)
        return preds

    def configure_optimizer(self, cond_cfg: dict):
        """Override: adapter gets 0.1× base LR (conservative for attention)."""
        cond_cfg = dict(cond_cfg)
        cond_cfg["backbone_lr_mult"] = 0.0
        cond_cfg["adapter_lr_mult"] = 0.1
        return super().configure_optimizer(cond_cfg)


# ══════════════════════════════════════════════════════════════════
# CONDITION 5: dinov3_vitb16_partial_finetune
# ══════════════════════════════════════════════════════════════════


class DINOv3PartialFinetuneDetector(BaseDetector):
    """DINOv3 ViT-B/16 with last 2 transformer blocks UNFROZEN + FCOS.

    KEY DIFFERENCE: Blocks 10, 11 trainable; blocks 0-9 frozen.
    backbone_lr_mult=1e-4. backbone.train() mode during training.
    ~14M params trainable vs 0 in frozen conditions.
    """

    def __init__(self, cfg):
        super().__init__(cfg)
        self.backbone = self._build_backbone()
        self.adapter = None

        self.direct_proj = nn.Sequential(
            nn.Conv2d(768, 768, 1),
            nn.GELU(),
            nn.Conv2d(768, 256, 1),
        )

        # KEY DIFFERENCE: Partial fine-tuning — unfreeze last 2 blocks
        num_frozen = cfg.dinov3_num_blocks - 2  # unfreeze blocks 10, 11
        trainable_bb = 0
        for block_idx, block in enumerate(self.backbone.blocks):
            if block_idx >= num_frozen:
                # Unfreeze
                for param in block.parameters():
                    param.requires_grad = True
                trainable_bb += sum(p.numel() for p in block.parameters())
                print(f"  [PartialFinetune] Unfroze ViT block {block_idx}")
            else:
                # Keep frozen
                for param in block.parameters():
                    param.requires_grad = False

        total_bb = sum(p.numel() for p in self.backbone.parameters())
        self._trainable_params = (
            trainable_bb +
            sum(p.numel() for p in self.parameters() if p.requires_grad)
        )
        print(f"  [PartialFinetune] {trainable_bb/1e6:.1f}M backbone + "
              f"{(self._trainable_params - trainable_bb)/1e6:.1f}M head params trainable, "
              f"{(total_bb - trainable_bb)/1e6:.1f}M frozen")

    def _build_backbone(self):
        return DINOv3ViTBackbone(ckpt_path=self.cfg.dinov3_ckpt)

    def _build_adapter(self):
        return None

    def forward(self, x: torch.Tensor) -> dict:
        """Same forward as DINOv3NoAdapterDetector, but backbone in train() mode."""
        tokens = self.backbone(x)  # [B, 1600, 768]
        B = tokens.shape[0]
        spatial = tokens.transpose(1, 2).view(B, 768, 40, 40)
        feat256 = self.direct_proj(spatial)

        p5 = feat256
        p4 = F.interpolate(feat256, size=(80, 80), mode="bilinear", align_corners=False)
        p3 = F.interpolate(feat256, size=(160, 160), mode="bilinear", align_corners=False)
        p2 = p3

        fpn_feats = {"p2": p2, "p3": p3, "p4": p4, "p5": p5}
        preds = self.head(fpn_feats)
        return preds

    def configure_optimizer(self, cond_cfg: dict):
        """Override: backbone gets 1e-4× base LR (very small, linear scaling)."""
        cond_cfg = dict(cond_cfg)
        cond_cfg["backbone_lr_mult"] = 1e-4
        cond_cfg["adapter_lr_mult"] = 0.0
        return super().configure_optimizer(cond_cfg)

    def compute_loss(self, preds: dict, targets: list) -> torch.Tensor:
        """Override: backbone.train() mode for partial fine-tuning."""
        # KEY DIFFERENCE: partial fine-tune needs train mode for unfrozen blocks
        self.backbone.train()
        return super().compute_loss(preds, targets)
