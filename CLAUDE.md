# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Install**: `pip install -e ".[dev]"` (use `.[dev,all]` for full dependencies)
- **Run pipeline**: `researchclaw run --topic "Your idea" --auto-approve`
- **Run all tests**: `pytest tests/`
- **Run single test**: `pytest tests/test_foo.py::test_name -v`
- **Run test file**: `pytest tests/test_rc_executor.py -v`
- **Run tests matching pattern**: `pytest tests/ -k "executor" -v`
- **Check environment**: `researchclaw doctor`
- **Setup OpenCode beast mode**: `researchclaw setup`

## Project Overview

AutoResearchClaw is a fully autonomous 23-stage academic research pipeline. Given a research topic, it produces a complete academic paper with real literature references, executable experiments, statistical analysis, multi-agent peer review, and conference-ready LaTeX (NeurIPS/ICML/ICLR templates).

Entry point: `researchclaw/cli.py` → `researchclaw.pipeline.runner.execute_pipeline()`.

## Key Architecture

### Pipeline (researchclaw/pipeline/)
- **`stages.py`** — 23-stage `IntEnum` (Stage 1-23, 8 phases A-H), status transitions, gate/rollback logic. Three gate stages (5, 9, 20) require approval.
- **`contracts.py`** — `StageContract` per stage defining `required_keys` (input context) and `produced_keys` (output artifacts).
- **`executor.py`** — 23 stage executor functions + `_STAGE_EXECUTORS` dispatch dict. Each executor gets `(run_dir, shared_ctx, config, adapters)` and returns `StageResult(success, data)`.
- **`stage_impls/`** — Executor implementation modules, one per phase:
  - `_topic.py` (Stages 1-2), `_literature.py` (3-6), `_synthesis.py` (7-8),
  - `_experiment_design.py` (9-11), `_code_generation.py` (10), `_execution.py` (12-13),
  - `_analysis.py` (14-15), `_paper_writing.py` (16-19), `_review_publish.py` (20-23)
- **`runner.py`** — `execute_pipeline()` orchestrator: checkpoint/restore, stage loop, HITL pausing, cost tracking, evolution lesson extraction. `execute_iterative_pipeline()` for REFINE/PIVOT loops.
- **`opencode_bridge.py`** — Routes complex code generation to OpenCode CLI agent.
- **`code_agent.py`** — Multi-phase code generation agent (architecture planning → sequential generation → validation).
- **`experiment_diagnosis.py`** / **`experiment_repair.py`** — Anti-fabrication: diagnose failed experiments, repair code, retry.
- **`verified_registry.py`** — Ground-truth experiment data registry (prevents hallucinated numbers in papers).
- **`paper_verifier.py`** — Citation integrity + relevance verification (arXiv/CrossRef/DataCite/Semantic Scholar/LLM).

### Config & LLM
- **`researchclaw/config.py`** — `RCConfig` dataclass loaded from YAML. Fields: project, research, runtime, llm, experiment, web_search, export, hitl, security, etc.
- **`researchclaw/llm/client.py`** — `LLMClient` (OpenAI-compatible), `from_rc_config()` factory.
- **`researchclaw/llm/acp_client.py`** — ACP agent client for using any ACP-compatible CLI (Claude Code, Codex, Gemini, etc.) as LLM backend.
- **`researchclaw/llm/anthropic_adapter.py`** — Direct Anthropic API adapter.

### Experiment Execution (researchclaw/experiment/)
- **`sandbox.py`** — Local subprocess sandbox with immutable harness, resource limits.
- **`docker_sandbox.py`** — Docker sandbox with configurable network policy.
- **`ssh_sandbox.py`** / **`colab_sandbox.py`** — Remote execution.
- **`validator.py`** — AST-based code validation (syntax, security, import) with auto-repair.
- **`visualize.py`** — Matplotlib chart generation.
- **`code_agent.py`** / **`agentic_sandbox.py`** — Agent-driven code generation with execution feedback.

### Literature (researchclaw/literature/)
- **`openalex_client.py`**, **`semantic_scholar.py`**, **`arxiv_client.py`** — Real paper API clients.
- **`search.py`** — Query expansion, multi-source orchestration, deduplication, circuit breaker.
- **`verify.py`** — 4-layer citation verification pipeline.

### HITL Co-Pilot (researchclaw/hitl/)
- **`intervention.py`** — `InterventionType`, `PauseReason`, `HumanAction` enums and data models.
- **`session.py`** — `HITLSession` state machine managing pause/resume/approve/reject/guide flows.
- **`config.py`** — Per-stage HITL policy configuration.
- **`smart_pause.py`** — Confidence-driven dynamic intervention triggering.
- **`learning.py`** — ALHF intervention learning from human review patterns.
- **`branching.py`** — Pipeline forking for parallel hypothesis exploration.
- **`claim_verifier.py`** — Inline claim fact-checking against collected literature.
- **`cost_guard.py`** — Budget monitoring with threshold alerts.
- **`workshops/`** — `idea.py` (hypothesis co-creation), `baseline.py` (experiment design review), `paper.py` (collaborative drafting).
- **`adapters/`** — CLI, WebSocket, and MCP adapters for human interaction.

### Agents (researchclaw/agents/)
- **`base.py`** — Base agent class with LLM integration, structured output parsing, retry logic.
- **`benchmark_agent/`** — 4-agent benchmark pipeline (Surveyor→Selector→Acquirer→Validator).
- **`figure_agent/`** — 5-agent figure pipeline (Planner→CodeGen→Renderer→Critic→Integrator).
- **`code_searcher/`** — Code search for existing implementations.

### Evolution & Learning
- **`researchclaw/evolution.py`** — `EvolutionStore`: cross-run lesson extraction with time-decay.
- **`researchclaw/evolution_aevolve.py`** — A-Evolve agentic evolution integration.
- **`researchclaw/metaclaw_bridge/`** — MetaClaw cross-run knowledge transfer (lessons→skills).

### Other
- **`researchclaw/hardware.py`** — GPU/CUDA/MPS auto-detection for hardware-aware code gen.
- **`researchclaw/health.py`** — Sentinel watchdog (NaN/Inf, paper-evidence consistency).
- **`researchclaw/knowledge/base.py`** — Per-run knowledge base (6 categories).
- **`researchclaw/prompts.py`** — `PromptManager` loading from `prompts.default.yaml`.
- **`researchclaw/quality.py`** — Paper quality scoring (7 dimensions).
- **`researchclaw/skills/`** — 19 built-in skills loaded into LLM prompts.

## Data Flow

1. User provides topic → `shared_ctx` dict accumulates data through 23 stages
2. Each stage: reads required keys from `shared_ctx`, writes produced keys
3. Runner checkpoints `shared_ctx` to disk after each stage (supports `--resume`)
4. Stage 15 can trigger: PROCEED (→16), REFINE (→13, max 10 iterations), PIVOT (→8, max 3 pivots)
5. Final output: `artifacts/rc-<timestamp>-<hash>/deliverables/` containing paper, LaTeX, BibTeX, charts

## Key Design Principles

- `--auto-approve` skips all 3 gate stages for fully autonomous mode
- `--mode co-pilot` enables HITL collaboration at critical decision points
- All external API calls (literature, LLM) have circuit breakers and graceful degradation
- Experiment code runs in sandbox with AST validation, resource limits, and self-healing repair
- Citation verification has 4 fallback layers; unverifiable refs are removed
