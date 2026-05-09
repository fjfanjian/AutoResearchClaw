"""Configuration management API routes."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["config"])


# ── Config group metadata ──────────────────────────────────────────

CONFIG_GROUPS: list[dict[str, str]] = [
    {"key": "project", "label": "项目", "icon": "FolderOpen"},
    {"key": "research", "label": "研究", "icon": "Search"},
    {"key": "runtime", "label": "运行时", "icon": "Clock"},
    {"key": "notifications", "label": "通知", "icon": "Bell"},
    {"key": "knowledge_base", "label": "知识库", "icon": "Database"},
    {"key": "llm", "label": "LLM", "icon": "Cpu"},
    {"key": "security", "label": "安全", "icon": "Shield"},
    {"key": "experiment", "label": "实验", "icon": "Flask"},
    {"key": "export", "label": "导出", "icon": "FileText"},
    {"key": "web_search", "label": "网络搜索", "icon": "Globe"},
    {"key": "openclaw_bridge", "label": "OpenClaw 桥接", "icon": "Link"},
    {"key": "metaclaw_bridge", "label": "MetaClaw 桥接", "icon": "Brain"},
    {"key": "memory", "label": "记忆", "icon": "HardDrive"},
    {"key": "skills", "label": "技能", "icon": "Zap"},
    {"key": "knowledge_graph", "label": "知识图谱", "icon": "Network"},
    {"key": "multi_project", "label": "多项目", "icon": "Layers"},
    {"key": "compute_servers", "label": "计算服务器", "icon": "Server"},
    {"key": "mcp", "label": "MCP 集成", "icon": "Plug"},
    {"key": "overleaf", "label": "Overleaf", "icon": "Cloud"},
    {"key": "server", "label": "Web 服务器", "icon": "Monitor"},
    {"key": "dashboard", "label": "仪表板", "icon": "BarChart3"},
    {"key": "trends", "label": "趋势追踪", "icon": "TrendingUp"},
    {"key": "copilot", "label": "副驾驶", "icon": "Users"},
    {"key": "quality_assessor", "label": "质量评估", "icon": "Award"},
    {"key": "calendar", "label": "会议日历", "icon": "Calendar"},
]

# ── Field metadata ─────────────────────────────────────────────────

# Format: "dotted.key.path" -> FieldMeta
# group: matches CONFIG_GROUPS[].key
# type: string | int | float | boolean | select | password | taglist | text

CONFIG_FIELD_META: dict[str, dict[str, Any]] = {}

# ── Project ──
_project_fields: dict[str, dict[str, Any]] = {
    "project.name": {
        "group": "project", "label": "项目名称", "type": "string",
        "required": True, "placeholder": "如: Attention-Driven Object Detection",
    },
    "project.mode": {
        "group": "project", "label": "项目模式", "type": "select",
        "required": True, "options": ["docs-first", "semi-auto", "full-auto"],
    },
}
CONFIG_FIELD_META.update(_project_fields)

# ── Research ──
_research_fields: dict[str, dict[str, Any]] = {
    "research.topic": {
        "group": "research", "label": "研究主题", "type": "text",
        "required": True, "placeholder": "用一句话完整描述研究目标",
    },
    "research.domains": {
        "group": "research", "label": "研究领域", "type": "taglist",
        "required": False, "placeholder": "如: object-detection",
    },
    "research.daily_paper_count": {
        "group": "research", "label": "每日论文数", "type": "int",
        "required": False, "min": 0, "max": 100,
    },
    "research.quality_threshold": {
        "group": "research", "label": "文献质量阈值", "type": "float",
        "required": False, "min": 0.0, "max": 10.0, "step": 0.1,
    },
    "research.graceful_degradation": {
        "group": "research", "label": "优雅降级", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_research_fields)

# ── Runtime ──
_runtime_fields: dict[str, dict[str, Any]] = {
    "runtime.timezone": {
        "group": "runtime", "label": "时区", "type": "string",
        "required": True, "placeholder": "Asia/Shanghai",
    },
    "runtime.max_parallel_tasks": {
        "group": "runtime", "label": "最大并行任务数", "type": "int",
        "required": False, "min": 1, "max": 32,
    },
    "runtime.approval_timeout_hours": {
        "group": "runtime", "label": "审批超时(小时)", "type": "int",
        "required": False, "min": 1, "max": 168,
    },
    "runtime.retry_limit": {
        "group": "runtime", "label": "重试次数限制", "type": "int",
        "required": False, "min": 0, "max": 10,
    },
}
CONFIG_FIELD_META.update(_runtime_fields)

# ── Notifications ──
_notif_fields: dict[str, dict[str, Any]] = {
    "notifications.channel": {
        "group": "notifications", "label": "通知渠道", "type": "select",
        "required": True, "options": ["console", "discord", "slack"],
    },
    "notifications.target": {
        "group": "notifications", "label": "通知目标", "type": "string",
        "required": False, "placeholder": "Webhook URL 或 channel ID",
    },
    "notifications.on_stage_start": {
        "group": "notifications", "label": "阶段开始时通知", "type": "boolean",
        "required": False,
    },
    "notifications.on_stage_fail": {
        "group": "notifications", "label": "阶段失败时通知", "type": "boolean",
        "required": False,
    },
    "notifications.on_gate_required": {
        "group": "notifications", "label": "门控审批时通知", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_notif_fields)

# ── Knowledge Base ──
_kb_fields: dict[str, dict[str, Any]] = {
    "knowledge_base.backend": {
        "group": "knowledge_base", "label": "知识库后端", "type": "select",
        "required": True, "options": ["markdown", "obsidian"],
    },
    "knowledge_base.root": {
        "group": "knowledge_base", "label": "知识库根目录", "type": "string",
        "required": True, "placeholder": "docs/kb",
    },
    "knowledge_base.obsidian_vault": {
        "group": "knowledge_base", "label": "Obsidian Vault", "type": "string",
        "required": False, "placeholder": "Obsidian vault 名称或路径",
    },
}
CONFIG_FIELD_META.update(_kb_fields)

# ── LLM ──
_llm_fields: dict[str, dict[str, Any]] = {
    "llm.provider": {
        "group": "llm", "label": "LLM 提供商", "type": "select",
        "required": True,
        "options": ["openai", "openrouter", "deepseek", "minimax", "acp", "openai-compatible"],
    },
    "llm.base_url": {
        "group": "llm", "label": "API 端点", "type": "string",
        "required": False, "placeholder": "https://api.example.com/v1",
    },
    "llm.wire_api": {
        "group": "llm", "label": "API 协议", "type": "select",
        "required": False, "options": ["chat_completions"],
    },
    "llm.api_key_env": {
        "group": "llm", "label": "API Key 环境变量", "type": "string",
        "required": False,
    },
    "llm.api_key": {
        "group": "llm", "label": "API Key", "type": "password",
        "required": False, "sensitive": True,
    },
    "llm.primary_model": {
        "group": "llm", "label": "主模型", "type": "string",
        "required": False, "placeholder": "gpt-4o / claude-sonnet-4-20250514",
    },
    "llm.fallback_models": {
        "group": "llm", "label": "回退模型列表", "type": "taglist",
        "required": False, "placeholder": "如: claude-sonnet-4-20250514",
    },
    "llm.s2_api_key": {
        "group": "llm", "label": "Semantic Scholar API Key", "type": "password",
        "required": False, "sensitive": True,
    },
    "llm.notes": {
        "group": "llm", "label": "备注", "type": "text",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_llm_fields)

# ── LLM > ACP ──
_acp_fields: dict[str, dict[str, Any]] = {
    "llm.acp.agent": {
        "group": "llm", "label": "ACP Agent CLI", "type": "select",
        "required": False, "options": ["claude", "codex", "gemini"],
    },
    "llm.acp.cwd": {
        "group": "llm", "label": "ACP 工作目录", "type": "string",
        "required": False, "placeholder": ".",
    },
    "llm.acp.timeout_sec": {
        "group": "llm", "label": "ACP 超时(秒)", "type": "int",
        "required": False, "min": 60, "max": 36000,
    },
}
CONFIG_FIELD_META.update(_acp_fields)

# ── Security ──
_security_fields: dict[str, dict[str, Any]] = {
    "security.hitl_required_stages": {
        "group": "security", "label": "HITL 必审阶段", "type": "taglist",
        "required": False, "placeholder": "如: 5, 9, 20",
    },
    "security.allow_publish_without_approval": {
        "group": "security", "label": "允许免审批发布", "type": "boolean",
        "required": False,
    },
    "security.redact_sensitive_logs": {
        "group": "security", "label": "脱敏敏感日志", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_security_fields)

# ── Experiment ──
_experiment_fields: dict[str, dict[str, Any]] = {
    "experiment.mode": {
        "group": "experiment", "label": "实验模式", "type": "select",
        "required": True,
        "options": ["simulated", "sandbox", "docker", "ssh_remote"],
    },
    "experiment.time_budget_sec": {
        "group": "experiment", "label": "每次运行超时(秒)", "type": "int",
        "required": False, "min": 10, "max": 86400,
    },
    "experiment.max_iterations": {
        "group": "experiment", "label": "最大优化迭代次数", "type": "int",
        "required": False, "min": 1, "max": 100,
    },
    "experiment.max_refine_duration_sec": {
        "group": "experiment", "label": "最大优化时长(秒)", "type": "int",
        "required": False, "min": 0, "max": 86400,
    },
    "experiment.metric_key": {
        "group": "experiment", "label": "主指标名称", "type": "string",
        "required": False, "placeholder": "val_loss",
    },
    "experiment.metric_direction": {
        "group": "experiment", "label": "指标优化方向", "type": "select",
        "required": False, "options": ["minimize", "maximize"],
    },
    "experiment.keep_threshold": {
        "group": "experiment", "label": "保留阈值", "type": "float",
        "required": False, "min": 0.0, "max": 1.0, "step": 0.05,
    },
}
CONFIG_FIELD_META.update(_experiment_fields)

# ── Experiment > Sandbox ──
_sandbox_fields: dict[str, dict[str, Any]] = {
    "experiment.sandbox.python_path": {
        "group": "experiment", "label": "[沙箱] Python 路径", "type": "string",
        "required": False, "placeholder": ".venv/bin/python3",
    },
    "experiment.sandbox.gpu_required": {
        "group": "experiment", "label": "[沙箱] 需要 GPU", "type": "boolean",
        "required": False,
    },
    "experiment.sandbox.max_memory_mb": {
        "group": "experiment", "label": "[沙箱] 最大内存(MB)", "type": "int",
        "required": False, "min": 256, "max": 65536,
    },
    "experiment.sandbox.allowed_imports": {
        "group": "experiment", "label": "[沙箱] 允许的导入", "type": "taglist",
        "required": False, "placeholder": "如: numpy",
    },
}
CONFIG_FIELD_META.update(_sandbox_fields)

# ── Experiment > Docker ──
_docker_fields: dict[str, dict[str, Any]] = {
    "experiment.docker.image": {
        "group": "experiment", "label": "[Docker] 镜像", "type": "string",
        "required": False, "placeholder": "researchclaw/experiment:latest",
    },
    "experiment.docker.gpu_enabled": {
        "group": "experiment", "label": "[Docker] 启用 GPU", "type": "boolean",
        "required": False,
    },
    "experiment.docker.memory_limit_mb": {
        "group": "experiment", "label": "[Docker] 内存限制(MB)", "type": "int",
        "required": False, "min": 256, "max": 131072,
    },
    "experiment.docker.network_policy": {
        "group": "experiment", "label": "[Docker] 网络策略", "type": "select",
        "required": False, "options": ["none", "setup_only", "pip_only", "full"],
    },
    "experiment.docker.auto_install_deps": {
        "group": "experiment", "label": "[Docker] 自动安装依赖", "type": "boolean",
        "required": False,
    },
    "experiment.docker.shm_size_mb": {
        "group": "experiment", "label": "[Docker] 共享内存(MB)", "type": "int",
        "required": False, "min": 64, "max": 65536,
    },
    "experiment.docker.keep_containers": {
        "group": "experiment", "label": "[Docker] 保留容器", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_docker_fields)

# ── Experiment > SSH Remote ──
_ssh_fields: dict[str, dict[str, Any]] = {
    "experiment.ssh_remote.host": {
        "group": "experiment", "label": "[SSH] 主机", "type": "string",
        "required": False,
    },
    "experiment.ssh_remote.user": {
        "group": "experiment", "label": "[SSH] 用户", "type": "string",
        "required": False,
    },
    "experiment.ssh_remote.port": {
        "group": "experiment", "label": "[SSH] 端口", "type": "int",
        "required": False, "min": 1, "max": 65535,
    },
    "experiment.ssh_remote.gpu_ids": {
        "group": "experiment", "label": "[SSH] GPU ID 列表", "type": "taglist",
        "required": False,
    },
    "experiment.ssh_remote.use_docker": {
        "group": "experiment", "label": "[SSH] 使用 Docker", "type": "boolean",
        "required": False,
    },
    "experiment.ssh_remote.timeout_sec": {
        "group": "experiment", "label": "[SSH] 超时(秒)", "type": "int",
        "required": False, "min": 30, "max": 36000,
    },
}
CONFIG_FIELD_META.update(_ssh_fields)

# ── Experiment > Code Agent ──
_code_agent_fields: dict[str, dict[str, Any]] = {
    "experiment.code_agent.enabled": {
        "group": "experiment", "label": "[CodeAgent] 启用", "type": "boolean",
        "required": False,
    },
    "experiment.code_agent.architecture_planning": {
        "group": "experiment", "label": "[CodeAgent] 架构规划", "type": "boolean",
        "required": False,
    },
    "experiment.code_agent.sequential_generation": {
        "group": "experiment", "label": "[CodeAgent] 顺序生成", "type": "boolean",
        "required": False,
    },
    "experiment.code_agent.hard_validation": {
        "group": "experiment", "label": "[CodeAgent] 严格验证", "type": "boolean",
        "required": False,
    },
    "experiment.code_agent.hard_validation_max_repairs": {
        "group": "experiment", "label": "[CodeAgent] 最大修复次数", "type": "int",
        "required": False, "min": 0, "max": 20,
    },
    "experiment.code_agent.exec_fix_max_iterations": {
        "group": "experiment", "label": "[CodeAgent] 执行修复迭代", "type": "int",
        "required": False, "min": 0, "max": 20,
    },
    "experiment.code_agent.exec_fix_timeout_sec": {
        "group": "experiment", "label": "[CodeAgent] 修复超时(秒)", "type": "int",
        "required": False, "min": 10, "max": 600,
    },
    "experiment.code_agent.review_max_rounds": {
        "group": "experiment", "label": "[CodeAgent] 评审轮次", "type": "int",
        "required": False, "min": 1, "max": 10,
    },
}
CONFIG_FIELD_META.update(_code_agent_fields)

# ── Experiment > OpenCode ──
_opencode_fields: dict[str, dict[str, Any]] = {
    "experiment.opencode.enabled": {
        "group": "experiment", "label": "[OpenCode] 启用", "type": "boolean",
        "required": False,
    },
    "experiment.opencode.auto": {
        "group": "experiment", "label": "[OpenCode] 自动触发", "type": "boolean",
        "required": False,
    },
    "experiment.opencode.complexity_threshold": {
        "group": "experiment", "label": "[OpenCode] 复杂度阈值", "type": "float",
        "required": False, "min": 0.0, "max": 1.0, "step": 0.05,
    },
    "experiment.opencode.model": {
        "group": "experiment", "label": "[OpenCode] 模型覆盖", "type": "string",
        "required": False,
    },
    "experiment.opencode.timeout_sec": {
        "group": "experiment", "label": "[OpenCode] 超时(秒)", "type": "int",
        "required": False, "min": 30, "max": 36000,
    },
    "experiment.opencode.max_retries": {
        "group": "experiment", "label": "[OpenCode] 重试次数", "type": "int",
        "required": False, "min": 0, "max": 10,
    },
    "experiment.opencode.workspace_cleanup": {
        "group": "experiment", "label": "[OpenCode] 清理工作区", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_opencode_fields)

# ── Experiment > Benchmark Agent ──
_benchmark_fields: dict[str, dict[str, Any]] = {
    "experiment.benchmark_agent.enabled": {
        "group": "experiment", "label": "[Benchmark] 启用", "type": "boolean",
        "required": False,
    },
    "experiment.benchmark_agent.enable_hf_search": {
        "group": "experiment", "label": "[Benchmark] HuggingFace 搜索", "type": "boolean",
        "required": False,
    },
    "experiment.benchmark_agent.max_hf_results": {
        "group": "experiment", "label": "[Benchmark] 最大 HF 结果数", "type": "int",
        "required": False, "min": 1, "max": 50,
    },
    "experiment.benchmark_agent.enable_web_search": {
        "group": "experiment", "label": "[Benchmark] 网络搜索", "type": "boolean",
        "required": False,
    },
    "experiment.benchmark_agent.tier_limit": {
        "group": "experiment", "label": "[Benchmark] 数据集级别限制", "type": "int",
        "required": False, "min": 1, "max": 5,
    },
    "experiment.benchmark_agent.min_benchmarks": {
        "group": "experiment", "label": "[Benchmark] 最少数据集数", "type": "int",
        "required": False, "min": 1, "max": 20,
    },
    "experiment.benchmark_agent.min_baselines": {
        "group": "experiment", "label": "[Benchmark] 最少基线方法数", "type": "int",
        "required": False, "min": 1, "max": 20,
    },
    "experiment.benchmark_agent.max_iterations": {
        "group": "experiment", "label": "[Benchmark] 最大迭代次数", "type": "int",
        "required": False, "min": 1, "max": 10,
    },
}
CONFIG_FIELD_META.update(_benchmark_fields)

# ── Experiment > Figure Agent ──
_figure_fields: dict[str, dict[str, Any]] = {
    "experiment.figure_agent.enabled": {
        "group": "experiment", "label": "[Figure] 启用", "type": "boolean",
        "required": False,
    },
    "experiment.figure_agent.min_figures": {
        "group": "experiment", "label": "[Figure] 最少图表数", "type": "int",
        "required": False, "min": 1, "max": 20,
    },
    "experiment.figure_agent.max_figures": {
        "group": "experiment", "label": "[Figure] 最多图表数", "type": "int",
        "required": False, "min": 1, "max": 50,
    },
    "experiment.figure_agent.max_iterations": {
        "group": "experiment", "label": "[Figure] 优化迭代次数", "type": "int",
        "required": False, "min": 1, "max": 20,
    },
    "experiment.figure_agent.render_timeout_sec": {
        "group": "experiment", "label": "[Figure] 渲染超时(秒)", "type": "int",
        "required": False, "min": 5, "max": 300,
    },
    "experiment.figure_agent.dpi": {
        "group": "experiment", "label": "[Figure] 输出 DPI", "type": "int",
        "required": False, "min": 72, "max": 1200,
    },
    "experiment.figure_agent.strict_mode": {
        "group": "experiment", "label": "[Figure] 严格模式", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_figure_fields)

# ── Experiment > Repair ──
_repair_fields: dict[str, dict[str, Any]] = {
    "experiment.repair.enabled": {
        "group": "experiment", "label": "[修复] 启用", "type": "boolean",
        "required": False,
    },
    "experiment.repair.max_cycles": {
        "group": "experiment", "label": "[修复] 最大循环数", "type": "int",
        "required": False, "min": 1, "max": 20,
    },
    "experiment.repair.min_completion_rate": {
        "group": "experiment", "label": "[修复] 最低完成率", "type": "float",
        "required": False, "min": 0.0, "max": 1.0, "step": 0.1,
    },
    "experiment.repair.min_conditions": {
        "group": "experiment", "label": "[修复] 最低条件数", "type": "int",
        "required": False, "min": 1, "max": 20,
    },
    "experiment.repair.timeout_sec_per_cycle": {
        "group": "experiment", "label": "[修复] 每周期超时(秒)", "type": "int",
        "required": False, "min": 30, "max": 36000,
    },
}
CONFIG_FIELD_META.update(_repair_fields)

# ── Experiment > CLI Agent ──
_cli_agent_fields: dict[str, dict[str, Any]] = {
    "experiment.cli_agent.provider": {
        "group": "experiment", "label": "[CLI Agent] 提供商", "type": "select",
        "required": False, "options": ["llm", "binary"],
    },
    "experiment.cli_agent.model": {
        "group": "experiment", "label": "[CLI Agent] 模型", "type": "string",
        "required": False,
    },
    "experiment.cli_agent.max_budget_usd": {
        "group": "experiment", "label": "[CLI Agent] 最大预算(USD)", "type": "float",
        "required": False, "min": 0.0, "max": 100.0, "step": 0.5,
    },
    "experiment.cli_agent.timeout_sec": {
        "group": "experiment", "label": "[CLI Agent] 超时(秒)", "type": "int",
        "required": False, "min": 30, "max": 36000,
    },
}
CONFIG_FIELD_META.update(_cli_agent_fields)

# ── Experiment > Agentic Sandbox ──
_agentic_fields: dict[str, dict[str, Any]] = {
    "experiment.agentic.timeout_sec": {
        "group": "experiment", "label": "[Agentic] 超时(秒)", "type": "int",
        "required": False, "min": 30, "max": 36000,
    },
    "experiment.agentic.memory_limit_mb": {
        "group": "experiment", "label": "[Agentic] 内存限制(MB)", "type": "int",
        "required": False, "min": 256, "max": 65536,
    },
    "experiment.agentic.gpu_enabled": {
        "group": "experiment", "label": "[Agentic] 启用 GPU", "type": "boolean",
        "required": False,
    },
    "experiment.agentic.allow_shell_commands": {
        "group": "experiment", "label": "[Agentic] 允许 Shell 命令", "type": "boolean",
        "required": False,
    },
    "experiment.agentic.max_turns": {
        "group": "experiment", "label": "[Agentic] 最大交互轮次", "type": "int",
        "required": False, "min": 1, "max": 200,
    },
}
CONFIG_FIELD_META.update(_agentic_fields)

# ── Export ──
_export_fields: dict[str, dict[str, Any]] = {
    "export.target_conference": {
        "group": "export", "label": "目标会议", "type": "select",
        "required": True,
        "options": ["neurips_2025", "iclr_2026", "icml_2026"],
    },
    "export.authors": {
        "group": "export", "label": "作者名", "type": "string",
        "required": False, "placeholder": "Anonymous",
    },
    "export.bib_file": {
        "group": "export", "label": "BibTeX 文件名", "type": "string",
        "required": False, "placeholder": "references",
    },
}
CONFIG_FIELD_META.update(_export_fields)

# ── Web Search ──
_websearch_fields: dict[str, dict[str, Any]] = {
    "web_search.enabled": {
        "group": "web_search", "label": "启用网络搜索", "type": "boolean",
        "required": False,
    },
    "web_search.tavily_api_key": {
        "group": "web_search", "label": "Tavily API Key", "type": "password",
        "required": False, "sensitive": True,
    },
    "web_search.tavily_api_key_env": {
        "group": "web_search", "label": "Tavily API Key 环境变量", "type": "string",
        "required": False,
    },
    "web_search.enable_scholar": {
        "group": "web_search", "label": "Google Scholar 搜索", "type": "boolean",
        "required": False,
    },
    "web_search.enable_crawling": {
        "group": "web_search", "label": "网页爬取", "type": "boolean",
        "required": False,
    },
    "web_search.enable_pdf_extraction": {
        "group": "web_search", "label": "PDF 文本提取", "type": "boolean",
        "required": False,
    },
    "web_search.max_web_results": {
        "group": "web_search", "label": "最大网络结果数", "type": "int",
        "required": False, "min": 1, "max": 50,
    },
    "web_search.max_scholar_results": {
        "group": "web_search", "label": "最大 Scholar 结果数", "type": "int",
        "required": False, "min": 1, "max": 50,
    },
}
CONFIG_FIELD_META.update(_websearch_fields)

# ── OpenClaw Bridge ──
_openclaw_fields: dict[str, dict[str, Any]] = {
    "openclaw_bridge.use_cron": {
        "group": "openclaw_bridge", "label": "定时研究运行", "type": "boolean",
        "required": False,
    },
    "openclaw_bridge.use_message": {
        "group": "openclaw_bridge", "label": "进度通知", "type": "boolean",
        "required": False,
    },
    "openclaw_bridge.use_memory": {
        "group": "openclaw_bridge", "label": "跨会话知识持久化", "type": "boolean",
        "required": False,
    },
    "openclaw_bridge.use_sessions_spawn": {
        "group": "openclaw_bridge", "label": "派生并行子会话", "type": "boolean",
        "required": False,
    },
    "openclaw_bridge.use_web_fetch": {
        "group": "openclaw_bridge", "label": "实时网络搜索", "type": "boolean",
        "required": False,
    },
    "openclaw_bridge.use_browser": {
        "group": "openclaw_bridge", "label": "基于浏览器的论文采集", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_openclaw_fields)

# ── MetaClaw Bridge ──
_metaclaw_fields: dict[str, dict[str, Any]] = {
    "metaclaw_bridge.enabled": {
        "group": "metaclaw_bridge", "label": "启用 MetaClaw", "type": "boolean",
        "required": False,
    },
    "metaclaw_bridge.proxy_url": {
        "group": "metaclaw_bridge", "label": "MetaClaw 代理 URL", "type": "string",
        "required": False,
    },
    "metaclaw_bridge.skills_dir": {
        "group": "metaclaw_bridge", "label": "技能存储目录", "type": "string",
        "required": False,
    },
    "metaclaw_bridge.fallback_url": {
        "group": "metaclaw_bridge", "label": "回退 LLM URL", "type": "string",
        "required": False,
    },
    "metaclaw_bridge.fallback_api_key": {
        "group": "metaclaw_bridge", "label": "回退 API Key", "type": "password",
        "required": False, "sensitive": True,
    },
    "metaclaw_bridge.lesson_to_skill.enabled": {
        "group": "metaclaw_bridge", "label": "[L2S] 自动转换教训为技能", "type": "boolean",
        "required": False,
    },
    "metaclaw_bridge.lesson_to_skill.min_severity": {
        "group": "metaclaw_bridge", "label": "[L2S] 最低严重级别", "type": "select",
        "required": False, "options": ["info", "warning", "error", "critical"],
    },
    "metaclaw_bridge.lesson_to_skill.max_skills_per_run": {
        "group": "metaclaw_bridge", "label": "[L2S] 每轮最大技能数", "type": "int",
        "required": False, "min": 1, "max": 20,
    },
    "metaclaw_bridge.prm.enabled": {
        "group": "metaclaw_bridge", "label": "[PRM] 启用过程奖励模型", "type": "boolean",
        "required": False,
    },
    "metaclaw_bridge.prm.model": {
        "group": "metaclaw_bridge", "label": "[PRM] 评判模型", "type": "string",
        "required": False,
    },
    "metaclaw_bridge.prm.votes": {
        "group": "metaclaw_bridge", "label": "[PRM] 多数投票次数", "type": "int",
        "required": False, "min": 1, "max": 10,
    },
    "metaclaw_bridge.prm.temperature": {
        "group": "metaclaw_bridge", "label": "[PRM] 采样温度", "type": "float",
        "required": False, "min": 0.0, "max": 2.0, "step": 0.1,
    },
}
CONFIG_FIELD_META.update(_metaclaw_fields)

# ── Memory ──
_memory_fields: dict[str, dict[str, Any]] = {
    "memory.enabled": {
        "group": "memory", "label": "启用记忆", "type": "boolean",
        "required": False,
    },
    "memory.store_dir": {
        "group": "memory", "label": "存储目录", "type": "string",
        "required": False,
    },
    "memory.embedding_model": {
        "group": "memory", "label": "嵌入模型", "type": "string",
        "required": False,
    },
    "memory.max_entries_per_category": {
        "group": "memory", "label": "每类最大条目数", "type": "int",
        "required": False, "min": 10, "max": 10000,
    },
    "memory.decay_half_life_days": {
        "group": "memory", "label": "衰减半衰期(天)", "type": "int",
        "required": False, "min": 1, "max": 365,
    },
    "memory.confidence_threshold": {
        "group": "memory", "label": "置信度阈值", "type": "float",
        "required": False, "min": 0.0, "max": 1.0, "step": 0.05,
    },
}
CONFIG_FIELD_META.update(_memory_fields)

# ── Skills ──
_skills_fields: dict[str, dict[str, Any]] = {
    "skills.enabled": {
        "group": "skills", "label": "启用技能系统", "type": "boolean",
        "required": False,
    },
    "skills.custom_dirs": {
        "group": "skills", "label": "自定义技能目录", "type": "taglist",
        "required": False,
    },
    "skills.auto_match": {
        "group": "skills", "label": "自动匹配技能", "type": "boolean",
        "required": False,
    },
    "skills.max_skills_per_stage": {
        "group": "skills", "label": "每阶段最大技能数", "type": "int",
        "required": False, "min": 1, "max": 20,
    },
}
CONFIG_FIELD_META.update(_skills_fields)

# ── Knowledge Graph ──
_kg_fields: dict[str, dict[str, Any]] = {
    "knowledge_graph.enabled": {
        "group": "knowledge_graph", "label": "启用知识图谱", "type": "boolean",
        "required": False,
    },
    "knowledge_graph.store_path": {
        "group": "knowledge_graph", "label": "存储路径", "type": "string",
        "required": False,
    },
    "knowledge_graph.max_entities": {
        "group": "knowledge_graph", "label": "最大实体数", "type": "int",
        "required": False, "min": 100, "max": 100000,
    },
    "knowledge_graph.auto_update": {
        "group": "knowledge_graph", "label": "自动更新", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_kg_fields)

# ── Multi Project ──
_mp_fields: dict[str, dict[str, Any]] = {
    "multi_project.enabled": {
        "group": "multi_project", "label": "启用多项目管理", "type": "boolean",
        "required": False,
    },
    "multi_project.projects_dir": {
        "group": "multi_project", "label": "项目目录", "type": "string",
        "required": False,
    },
    "multi_project.max_concurrent": {
        "group": "multi_project", "label": "最大并行数", "type": "int",
        "required": False, "min": 1, "max": 10,
    },
    "multi_project.shared_knowledge": {
        "group": "multi_project", "label": "共享知识", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_mp_fields)

# ── Compute Servers ──
_cs_fields: dict[str, dict[str, Any]] = {
    "compute_servers.enabled": {
        "group": "compute_servers", "label": "启用多服务器调度", "type": "boolean",
        "required": False,
    },
    "compute_servers.prefer_free": {
        "group": "compute_servers", "label": "优先空闲服务器", "type": "boolean",
        "required": False,
    },
    "compute_servers.failover": {
        "group": "compute_servers", "label": "故障转移", "type": "boolean",
        "required": False,
    },
    "compute_servers.monitor_interval_sec": {
        "group": "compute_servers", "label": "监控间隔(秒)", "type": "int",
        "required": False, "min": 5, "max": 3600,
    },
}
CONFIG_FIELD_META.update(_cs_fields)

# ── MCP Integration ──
_mcp_fields: dict[str, dict[str, Any]] = {
    "mcp.server_enabled": {
        "group": "mcp", "label": "启用 MCP 服务器", "type": "boolean",
        "required": False,
    },
    "mcp.server_port": {
        "group": "mcp", "label": "MCP 服务器端口", "type": "int",
        "required": False, "min": 1024, "max": 65535,
    },
    "mcp.server_transport": {
        "group": "mcp", "label": "MCP 传输协议", "type": "select",
        "required": False, "options": ["stdio", "sse"],
    },
}
CONFIG_FIELD_META.update(_mcp_fields)

# ── Overleaf ──
_overleaf_fields: dict[str, dict[str, Any]] = {
    "overleaf.enabled": {
        "group": "overleaf", "label": "启用 Overleaf 同步", "type": "boolean",
        "required": False,
    },
    "overleaf.git_url": {
        "group": "overleaf", "label": "Git URL", "type": "string",
        "required": False,
    },
    "overleaf.branch": {
        "group": "overleaf", "label": "Git 分支", "type": "string",
        "required": False,
    },
    "overleaf.auto_push": {
        "group": "overleaf", "label": "自动推送", "type": "boolean",
        "required": False,
    },
    "overleaf.auto_pull": {
        "group": "overleaf", "label": "自动拉取", "type": "boolean",
        "required": False,
    },
    "overleaf.poll_interval_sec": {
        "group": "overleaf", "label": "轮询间隔(秒)", "type": "int",
        "required": False, "min": 10, "max": 36000,
    },
}
CONFIG_FIELD_META.update(_overleaf_fields)

# ── Server (Web) ──
_server_fields: dict[str, dict[str, Any]] = {
    "server.enabled": {
        "group": "server", "label": "启用 Web 服务器", "type": "boolean",
        "required": False,
    },
    "server.host": {
        "group": "server", "label": "监听地址", "type": "string",
        "required": False,
    },
    "server.port": {
        "group": "server", "label": "监听端口", "type": "int",
        "required": False, "min": 1, "max": 65535,
    },
    "server.auth_token": {
        "group": "server", "label": "认证 Token", "type": "password",
        "required": False, "sensitive": True,
    },
    "server.voice_enabled": {
        "group": "server", "label": "启用语音", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_server_fields)

# ── Dashboard ──
_dashboard_fields: dict[str, dict[str, Any]] = {
    "dashboard.enabled": {
        "group": "dashboard", "label": "启用仪表板", "type": "boolean",
        "required": False,
    },
    "dashboard.refresh_interval_sec": {
        "group": "dashboard", "label": "刷新间隔(秒)", "type": "int",
        "required": False, "min": 1, "max": 60,
    },
    "dashboard.max_log_lines": {
        "group": "dashboard", "label": "最大日志行数", "type": "int",
        "required": False, "min": 100, "max": 10000,
    },
    "dashboard.browser_notifications": {
        "group": "dashboard", "label": "浏览器通知", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_dashboard_fields)

# ── Trends ──
_trends_fields: dict[str, dict[str, Any]] = {
    "trends.enabled": {
        "group": "trends", "label": "启用趋势追踪", "type": "boolean",
        "required": False,
    },
    "trends.domains": {
        "group": "trends", "label": "追踪领域", "type": "taglist",
        "required": False,
    },
    "trends.daily_digest": {
        "group": "trends", "label": "每日摘要", "type": "boolean",
        "required": False,
    },
    "trends.digest_time": {
        "group": "trends", "label": "摘要发送时间", "type": "string",
        "required": False, "placeholder": "08:00",
    },
    "trends.max_papers_per_day": {
        "group": "trends", "label": "每日最大论文数", "type": "int",
        "required": False, "min": 1, "max": 100,
    },
    "trends.trend_window_days": {
        "group": "trends", "label": "趋势窗口(天)", "type": "int",
        "required": False, "min": 1, "max": 365,
    },
}
CONFIG_FIELD_META.update(_trends_fields)

# ── CoPilot ──
_copilot_fields: dict[str, dict[str, Any]] = {
    "copilot.mode": {
        "group": "copilot", "label": "副驾驶模式", "type": "select",
        "required": True, "options": ["auto-pilot", "co-pilot", "manual"],
    },
    "copilot.pause_at_gates": {
        "group": "copilot", "label": "门控时暂停", "type": "boolean",
        "required": False,
    },
    "copilot.pause_at_every_stage": {
        "group": "copilot", "label": "每阶段暂停", "type": "boolean",
        "required": False,
    },
    "copilot.feedback_timeout_sec": {
        "group": "copilot", "label": "反馈超时(秒)", "type": "int",
        "required": False, "min": 60, "max": 86400,
    },
    "copilot.allow_branching": {
        "group": "copilot", "label": "允许分支探索", "type": "boolean",
        "required": False,
    },
    "copilot.max_branches": {
        "group": "copilot", "label": "最大分支数", "type": "int",
        "required": False, "min": 1, "max": 10,
    },
}
CONFIG_FIELD_META.update(_copilot_fields)

# ── Quality Assessor ──
_qa_fields: dict[str, dict[str, Any]] = {
    "quality_assessor.enabled": {
        "group": "quality_assessor", "label": "启用质量评估", "type": "boolean",
        "required": False,
    },
    "quality_assessor.venue_recommendation": {
        "group": "quality_assessor", "label": "会议推荐", "type": "boolean",
        "required": False,
    },
    "quality_assessor.score_history": {
        "group": "quality_assessor", "label": "评分历史", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_qa_fields)

# ── Calendar ──
_calendar_fields: dict[str, dict[str, Any]] = {
    "calendar.enabled": {
        "group": "calendar", "label": "启用会议日历", "type": "boolean",
        "required": False,
    },
    "calendar.target_venues": {
        "group": "calendar", "label": "目标会议", "type": "taglist",
        "required": False, "placeholder": "如: neurips_2026",
    },
    "calendar.auto_plan": {
        "group": "calendar", "label": "自动规划倒计时", "type": "boolean",
        "required": False,
    },
}
CONFIG_FIELD_META.update(_calendar_fields)


# ── Helpers ────────────────────────────────────────────────────────

_SENSITIVE_KEYWORDS = ("api_key", "token", "auth", "secret", "password")


def _redact(obj: Any) -> Any:
    """Recursively redact sensitive fields."""
    if isinstance(obj, dict):
        return {
            k: "***" if any(s in k.lower() for s in _SENSITIVE_KEYWORDS)
            else _redact(v) for k, v in obj.items()
        }
    if isinstance(obj, (list, tuple)):
        return [_redact(i) for i in obj]
    return obj


def _deep_update(base: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    """Recursively update base dict with overrides."""
    for key, value in overrides.items():
        if isinstance(value, dict) and key in base and isinstance(base[key], dict):
            base[key] = _deep_update(base[key], value)
        else:
            base[key] = value
    return base


def _get_nested_value(obj: dict[str, Any], dotted_key: str) -> Any:
    """Resolve a dotted key path like 'llm.acp.agent' in a nested dict."""
    parts = dotted_key.split(".")
    current = obj
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def _set_nested_value(obj: dict[str, Any], dotted_key: str, value: Any) -> None:
    """Set a value at a dotted key path in a nested dict."""
    parts = dotted_key.split(".")
    current = obj
    for part in parts[:-1]:
        if part not in current or not isinstance(current[part], dict):
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value


def _apply_partial_update(
    base: dict[str, Any],
    updates: dict[str, Any],
    field_meta: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Apply a partial update to a nested config dict.

    Supports both dotted keys (e.g., 'llm.acp.agent') and nested dicts.
    For sensitive fields, skip if value is '***' (unchanged).
    """
    result = __import__("copy").deepcopy(base)

    for key, value in updates.items():
        # Check if this is a sensitive field being sent back unchanged
        meta = field_meta.get(key, {})
        if meta.get("sensitive") and value == "***":
            continue

        if isinstance(value, dict):
            _deep_update(result, {key: value})
        elif "." in key:
            _set_nested_value(result, key, value)
        else:
            result[key] = value

    return result


def _get_app_state() -> dict[str, Any]:
    """Get shared application state."""
    from researchclaw.server.app import _app_state
    return _app_state


# ── Request/Response models ───────────────────────────────────────

class ConfigSaveRequest(BaseModel):
    updates: dict[str, Any]


class ConfigSaveResponse(BaseModel):
    success: bool
    message: str
    config_path: str


# ── Routes ────────────────────────────────────────────────────────

@router.get("/config/fields")
async def get_config_fields() -> dict[str, Any]:
    """Return config field metadata so the front-end can render forms."""
    return {
        "groups": CONFIG_GROUPS,
        "fields": CONFIG_FIELD_META,
    }


@router.get("/config/full")
async def get_full_config() -> dict[str, Any]:
    """Return full config (with sensitive fields redacted)."""
    state = _get_app_state()
    config = state["config"]
    config_path = state.get("config_path")
    data = config.to_dict()
    return {
        "config_path": str(config_path) if config_path else "",
        "config": _redact(data),
    }


def _tuples_to_lists(obj: Any) -> Any:
    """Recursively convert all tuples to lists for clean YAML serialization."""
    if isinstance(obj, tuple):
        return [_tuples_to_lists(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _tuples_to_lists(v) for k, v in obj.items()}
    if isinstance(obj, (list,)):
        return [_tuples_to_lists(i) for i in obj]
    return obj


@router.post("/config/save")
async def save_config(req: ConfigSaveRequest) -> ConfigSaveResponse:
    """Save partial config updates to the YAML file and hot-reload."""
    state = _get_app_state()
    config = state["config"]
    config_path_str: str | None = state.get("config_path")

    if not config_path_str:
        raise HTTPException(status_code=400, detail="Config file path not set (read-only mode)")

    config_path = Path(config_path_str)

    # Read the current config as dict
    current_dict = config.to_dict()

    # Apply partial updates
    updated_dict = _apply_partial_update(current_dict, req.updates, CONFIG_FIELD_META)

    # Validate
    try:
        from researchclaw.config import RCConfig
        RCConfig.from_dict(updated_dict, check_paths=False)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Config validation failed: {exc}")

    # Convert tuples to lists for clean YAML output
    clean_dict = _tuples_to_lists(updated_dict)

    # Write back to YAML
    try:
        with config_path.open("w", encoding="utf-8") as f:
            yaml.dump(
                clean_dict,
                f,
                default_flow_style=False,
                sort_keys=False,
                allow_unicode=True,
                width=120,
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to write config: {exc}")

    # Hot-reload: load the new config and store it
    try:
        new_config = RCConfig.load(config_path, check_paths=False)
        state["config"] = new_config
    except Exception as exc:
        logger.warning(f"Config saved but reload failed: {exc}")

    return ConfigSaveResponse(
        success=True,
        message="配置已保存",
        config_path=str(config_path),
    )
