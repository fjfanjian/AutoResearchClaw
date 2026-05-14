"""Stages 3-6: Search strategy, literature collection, screening, and knowledge extraction."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

import yaml

from researchclaw.adapters import AdapterBundle
from researchclaw.config import RCConfig
from researchclaw.llm.client import LLMClient
from researchclaw.pipeline._helpers import (
    StageResult,
    _build_fallback_queries,
    _chat_with_prompt,
    _extract_topic_keywords,
    _extract_yaml_block,
    _find_prior_file,
    _get_evolution_overlay,
    _parse_jsonl_rows,
    _read_prior_artifact,
    _safe_filename,
    _safe_json_loads,
    _utcnow_iso,
    _write_jsonl,
)
from researchclaw.pipeline.stages import Stage, StageStatus
from researchclaw.prompts import PromptManager

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Local helpers
# ---------------------------------------------------------------------------


def _expand_search_queries(queries: list[str], topic: str) -> list[str]:
    """Expand search queries for broader coverage (minimal expansion).

    With the improved Stage-03 prompt already producing domain-anchored
    queries, expansion is kept to a single broad topic-derived query to
    fill any obvious gaps.  The old suffix variants (survey, benchmark,
    comparison) have been removed because they multiply API calls without
    adding meaningful diversity.
    """
    expanded = list(queries)  # keep originals
    seen = {q.lower().strip() for q in queries}

    topic_words = topic.split()

    # One broad query from the first meaningful phrase (skip leading fluff)
    _skip_prefixes = {
        "investigation", "investigating", "exploring", "towards",
        "toward", "study", "studies", "analysis", "review",
        "comprehensive", "novel", "method", "approach",
        "into", "in", "of", "for", "and", "or", "the", "to", "by",
        "mitigating", "mitigation",
    }
    meaningful_start = 0
    for i, w in enumerate(topic_words):
        if w.lower().rstrip(".,;:") not in _skip_prefixes:
            meaningful_start = i
            break
    broad_words = topic_words[meaningful_start:meaningful_start + 5]
    if len(broad_words) >= 3:
        broad = " ".join(broad_words)
        if broad.lower().strip() not in seen and len(broad) > 10:
            expanded.append(broad)
            seen.add(broad.lower().strip())

    return expanded


# ---------------------------------------------------------------------------
# Stage executors
# ---------------------------------------------------------------------------


def _execute_search_strategy(
    stage_dir: Path,
    run_dir: Path,
    config: RCConfig,
    adapters: AdapterBundle,
    *,
    llm: LLMClient | None = None,
    prompts: PromptManager | None = None,
) -> StageResult:
    problem_tree = _read_prior_artifact(run_dir, "problem_tree.md") or ""
    topic = config.research.topic
    plan: dict[str, Any] | None = None
    sources: list[dict[str, Any]] | None = None
    if llm is not None:
        _pm = prompts or PromptManager()
        _overlay = _get_evolution_overlay(run_dir, "search_strategy")
        sp = _pm.for_stage("search_strategy", evolution_overlay=_overlay, topic=topic, problem_tree=problem_tree)
        resp = _chat_with_prompt(
            llm,
            sp.system,
            sp.user,
            json_mode=sp.json_mode,
            max_tokens=sp.max_tokens,
        )
        payload = _safe_json_loads(resp.content, {})
        if isinstance(payload, dict):
            yaml_text = str(payload.get("search_plan_yaml", "")).strip()
            if yaml_text:
                try:
                    parsed = yaml.safe_load(_extract_yaml_block(yaml_text))
                except yaml.YAMLError:
                    parsed = None
                if isinstance(parsed, dict):
                    plan = parsed
            src = payload.get("sources", [])
            if isinstance(src, list):
                sources = [item for item in src if isinstance(item, dict)]
    if plan is None:
        # Build smart fallback queries by extracting key terms from topic
        # instead of using the raw (often very long) topic string.
        _fallback_queries = _build_fallback_queries(topic)
        plan = {
            "topic": topic,
            "generated": _utcnow_iso(),
            "search_strategies": [
                {
                    "name": "keyword_core",
                    "queries": _fallback_queries[:5],
                    "sources": ["arxiv", "semantic_scholar", "openreview"],
                    "max_results_per_query": 60,
                },
                {
                    "name": "backward_forward_citation",
                    "queries": _fallback_queries[5:10] or _fallback_queries[:3],
                    "sources": ["semantic_scholar", "google_scholar"],
                    "depth": 1,
                },
                {
                    "name": "general_web",
                    "queries": _fallback_queries[:3],
                    "sources": ["web"],
                    "max_results_per_query": 10,
                    "purpose": "Verify existence and find documentation for architectures and tools",
                },
            ],
            "filters": {
                "min_year": 2020,
                "language": ["en"],
                "peer_review_preferred": True,
            },
            "deduplication": {"method": "title_doi_hash", "fuzzy_threshold": 0.9},
        }
    if not sources:
        sources = [
            {
                "id": "arxiv",
                "name": "arXiv",
                "type": "api",
                "url": "https://export.arxiv.org/api/query",
                "status": "available",
                "query": topic,
                "verified_at": _utcnow_iso(),
            },
            {
                "id": "semantic_scholar",
                "name": "Semantic Scholar",
                "type": "api",
                "url": "https://ai4scholar.net/graph/v1/paper/search",
                "status": "available",
                "query": topic,
                "verified_at": _utcnow_iso(),
            },
            {
                "id": "web_general",
                "name": "General Web Search",
                "type": "web_search",
                "url": "tavily",
                "status": "available",
                "query": topic,
                "verified_at": _utcnow_iso(),
            },
        ]
    if config.openclaw_bridge.use_web_fetch:
        for src in sources:
            try:
                response = adapters.web_fetch.fetch(str(src.get("url", "")))
                src["status"] = (
                    "verified"
                    if response.status_code in (200, 301, 302, 405)
                    else "unreachable"
                )
                src["http_status"] = response.status_code
            except Exception:  # noqa: BLE001
                src["status"] = "unknown"
    (stage_dir / "search_plan.yaml").write_text(
        yaml.dump(plan, default_flow_style=False, allow_unicode=True),
        encoding="utf-8",
    )
    (stage_dir / "sources.json").write_text(
        json.dumps(
            {"sources": sources, "count": len(sources), "generated": _utcnow_iso()},
            indent=2,
        ),
        encoding="utf-8",
    )

    # F1.5: Extract queries from plan for Stage 4 real literature search.
    # LLMs produce diverse YAML structures — we handle all of them:
    #   Format A: search_strategies: [{name: ..., queries: [...]}, ...]
    #   Format B: search_queries: [{id: ..., query: "..."}, ...]
    #   Format C: search_strings: {label: [...]} or search_terms: {label: [...]}
    #   Format D: sources: [{query: "..."}, ...] (fallback from source list)
    queries_list: list[str] = []
    year_min = 2020

    def _clean_bool_query(q: str) -> str:
        """Strip boolean operators / parens / quotes from a structured query string."""
        s = re.sub(r'[()]', ' ', q)
        s = re.sub(r'\b(AND|OR|NOT)\b', '', s)
        s = s.replace('"', ' ')
        return re.sub(r'\s{2,}', ' ', s).strip()

    if isinstance(plan, dict):
        # Format A: search_strategies with queries
        strategies = plan.get("search_strategies", [])
        if isinstance(strategies, list):
            for strat in strategies:
                if isinstance(strat, dict):
                    qs = strat.get("queries", [])
                    if isinstance(qs, list):
                        queries_list.extend(str(q) for q in qs if q)

        # Format B: search_queries with individual query strings
        if not queries_list:
            for _key in ("search_queries", "search_terms", "search_strings"):
                sq = plan.get(_key, None)
                if isinstance(sq, list):
                    for item in sq:
                        if isinstance(item, dict):
                            q = str(item.get("query", "")).strip()
                            if q:
                                queries_list.append(_clean_bool_query(q))
                        elif isinstance(item, str) and len(item) > 2:
                            queries_list.append(item)
                elif isinstance(sq, dict):
                    for _lk, _lv in sq.items():
                        if isinstance(_lv, list):
                            queries_list.extend(str(x) for x in _lv if x)
                        elif isinstance(_lv, str) and len(_lv) > 2:
                            queries_list.append(_lv)

        # Format D: sources[{query: ...}] (last resort)
        if not queries_list:
            srcs = plan.get("sources", [])
            if isinstance(srcs, list):
                for s in srcs:
                    if isinstance(s, dict):
                        q = str(s.get("query", "")).strip()
                        if q and len(q) > 3:
                            queries_list.append(_clean_bool_query(q))

        # Extract year filter
        filters = plan.get("filters", {})
        if isinstance(filters, dict) and filters.get("min_year"):
            try:
                year_min = int(filters["min_year"])
            except (ValueError, TypeError):
                pass

    # --- Sanitize queries: shorten overly long queries ---
    # LLMs often produce the full topic title as a query, which is too long for
    # arXiv and Semantic Scholar (they work best with 3-8 keyword queries).
    _stop = {
        "a", "an", "the", "of", "for", "in", "on", "and", "or", "with",
        "to", "by", "from", "its", "is", "are", "was", "be", "as", "at",
        "via", "using", "based", "study", "analysis", "empirical",
        "towards", "toward", "into", "exploring", "comparison", "tasks",
        "effectiveness", "investigation", "comprehensive", "novel",
        "challenge", "challenges", "gaps", "gap", "critical", "survey", "review",
    }

    def _extract_search_terms(text: str) -> list[str]:
        """Extract meaningful search terms from text, removing stop words."""
        return [
            w for w in re.split(r"[^a-zA-Z0-9]+", text)
            if w.lower() not in _stop and len(w) > 1
        ]

    _MAX_QUERY_LEN = 60  # characters — beyond this, shorten to keywords
    _SEARCH_SUFFIXES = ["benchmark", "survey", "seminal", "state of the art"]

    def _shorten_query(q: str, max_kw: int = 6) -> str:
        """Shorten a query to *max_kw* keywords, preserving any trailing suffix."""
        q_stripped = q.strip()
        # Check if query ends with a known search suffix
        suffix = ""
        q_core = q_stripped
        for sfx in _SEARCH_SUFFIXES:
            if q_stripped.lower().endswith(sfx):
                suffix = sfx
                q_core = q_stripped[: -len(sfx)].strip()
                break
        # Extract keywords from the core part
        kws = _extract_search_terms(q_core)
        shortened = " ".join(kws[:max_kw])
        if suffix:
            shortened = f"{shortened} {suffix}"
        return shortened

    if queries_list:
        sanitized: list[str] = []
        for q in queries_list:
            if len(q) > _MAX_QUERY_LEN:
                shortened = _shorten_query(q)
                if shortened.strip():
                    sanitized.append(shortened)
            else:
                sanitized.append(q)
        queries_list = sanitized

    def _build_default_search_queries(topic_text: str) -> list[str]:
        """Generate concept-style search queries from the topic instead of copying the title."""
        _words = _extract_search_terms(topic_text)
        if not _words:
            return [topic_text[:60]]
        kw_primary = " ".join(_words[:6])
        kw_short = " ".join(_words[:4])
        kw_alt = " ".join(_words[1:5]) if len(_words) > 4 else kw_short
        return [
            kw_primary,
            f"{kw_short} benchmark",
            f"{kw_short} survey",
            kw_alt,
            f"{kw_short} recent advances",
        ]

    if not queries_list:
        queries_list = _build_default_search_queries(topic)

    # Ensure minimum query diversity — if dedup leaves too few, add variants
    _all_kw = _extract_search_terms(topic)
    _seen_q: set[str] = set()
    unique_queries: list[str] = []
    for q in queries_list:
        q_lower = q.strip().lower()
        if q_lower and q_lower not in _seen_q:
            _seen_q.add(q_lower)
            unique_queries.append(q.strip())
    # If we have fewer than 5 unique queries, generate supplemental keyword variants
    if len(unique_queries) < 5 and len(_all_kw) >= 3:
        supplements = [
            " ".join(_all_kw[:4]) + " survey",
            " ".join(_all_kw[:4]) + " benchmark",
            " ".join(_all_kw[1:5]),  # shifted window for diversity
            " ".join(_all_kw[:3]) + " comparison",
            " ".join(_all_kw[:3]) + " deep learning",
            " ".join(_all_kw[2:6]),  # another shifted window
        ]
        for s in supplements:
            s_lower = s.strip().lower()
            if s_lower not in _seen_q:
                _seen_q.add(s_lower)
                unique_queries.append(s.strip())
            if len(unique_queries) >= 8:
                break
    queries_list = unique_queries
    (stage_dir / "queries.json").write_text(
        json.dumps({"queries": queries_list, "year_min": year_min}, indent=2),
        encoding="utf-8",
    )
    return StageResult(
        stage=Stage.SEARCH_STRATEGY,
        status=StageStatus.DONE,
        artifacts=("search_plan.yaml", "sources.json", "queries.json"),
        evidence_refs=(
            "stage-03/search_plan.yaml",
            "stage-03/sources.json",
            "stage-03/queries.json",
        ),
    )


def _execute_literature_collect(
    stage_dir: Path,
    run_dir: Path,
    config: RCConfig,
    adapters: AdapterBundle,
    *,
    llm: LLMClient | None = None,
    prompts: PromptManager | None = None,
) -> StageResult:
    """Stage 4: Collect literature — prefer real APIs, fallback to LLM."""
    topic = config.research.topic

    # Read queries.json from Stage 3 (F1.5 output)
    queries_text = _read_prior_artifact(run_dir, "queries.json")
    queries_data = _safe_json_loads(queries_text or "{}", {})
    queries: list[str] = queries_data.get("queries", [topic])
    year_min: int = queries_data.get("year_min", 2020)

    # --- Try real API search first ---
    candidates: list[dict[str, Any]] = []
    bibtex_entries: list[str] = []
    real_search_succeeded = False

    try:
        from researchclaw.literature.search import (
            search_papers_multi_query,
            papers_to_bibtex,
        )

        # Expand queries for broader coverage
        expanded_queries = _expand_search_queries(queries, config.research.topic)
        logger.info(
            "[literature] Searching %d queries (expanded from %d) "
            "across OpenAlex → S2 → arXiv…",
            len(expanded_queries),
            len(queries),
        )
        papers = search_papers_multi_query(
            expanded_queries,
            limit_per_query=20,
            year_min=year_min,
            s2_api_key=config.llm.s2_api_key,
        )
        if papers:
            real_search_succeeded = True
            # Count by source
            src_counts: dict[str, int] = {}
            for p in papers:
                src_counts[p.source] = src_counts.get(p.source, 0) + 1
                d = p.to_dict()
                d["collected_at"] = _utcnow_iso()
                candidates.append(d)
                bibtex_entries.append(p.to_bibtex())
            src_str = ", ".join(f"{s}: {n}" for s, n in src_counts.items())
            logger.info(
                "[literature] Found %d papers (%s)", len(papers), src_str
            )
    except Exception:  # noqa: BLE001
        logger.warning(
            "[rate-limit] Literature search failed — falling back to LLM",
            exc_info=True,
        )

    # --- Inject foundational/seminal papers ---
    try:
        from researchclaw.data import load_seminal_papers
        seminal = load_seminal_papers(topic)
        if seminal:
            _existing_titles = {c.get("title", "").lower() for c in candidates}
            _injected = 0
            for sp in seminal:
                if sp.get("title", "").lower() not in _existing_titles:
                    candidates.append({
                        "id": f"seminal-{sp.get('cite_key', '')}",
                        "title": sp.get("title", ""),
                        "source": "seminal_library",
                        "url": "",
                        "year": sp.get("year", 2020),
                        "abstract": f"Foundational paper on {', '.join(sp.get('keywords', [])[:3])}.",
                        "authors": [{"name": sp.get("authors", "")}],
                        "cite_key": sp.get("cite_key", ""),
                        "venue": sp.get("venue", ""),
                        "collected_at": _utcnow_iso(),
                    })
                    _injected += 1
            if _injected:
                logger.info("Stage 4: Injected %d seminal papers from seed library", _injected)
    except Exception:  # noqa: BLE001
        logger.debug("Seminal paper injection skipped", exc_info=True)

    # --- Fallback: LLM-generated candidates ---
    if not candidates and llm is not None:
        plan_text = _read_prior_artifact(run_dir, "search_plan.yaml") or ""
        _pm = prompts or PromptManager()
        _overlay = _get_evolution_overlay(run_dir, "literature_collect")
        sp = _pm.for_stage("literature_collect", evolution_overlay=_overlay, topic=topic, plan_text=plan_text)
        resp = _chat_with_prompt(
            llm,
            sp.system,
            sp.user,
            json_mode=sp.json_mode,
            max_tokens=sp.max_tokens,
        )
        payload = _safe_json_loads(resp.content, {})
        if isinstance(payload, dict) and isinstance(payload.get("candidates"), list):
            candidates = [row for row in payload["candidates"] if isinstance(row, dict)]

    # --- Web search augmentation (Tavily/DDG + Google Scholar + Crawl4AI) ---
    web_context_parts: list[str] = []
    if config.web_search.enabled:
        try:
            from researchclaw.web.agent import WebSearchAgent
            import os

            tavily_key = config.web_search.tavily_api_key or os.environ.get(
                config.web_search.tavily_api_key_env, ""
            )

            # Collect seed URLs from topic verification (Stage-02) and search plan
            # so the WebSearchAgent can crawl authoritative sources (docs, repos).
            _seed_urls: list[str] = []
            _tv_raw = _read_prior_artifact(run_dir, "topic_verification.json")
            if _tv_raw:
                try:
                    _tv = _safe_json_loads(_tv_raw, {})
                    if isinstance(_tv, dict):
                        _urls = _tv.get("suggested_urls", [])
                        if isinstance(_urls, list):
                            _seed_urls.extend(u for u in _urls if isinstance(u, str))
                except Exception:  # noqa: BLE001
                    pass
            if not _seed_urls:
                _plan_raw = _read_prior_artifact(run_dir, "search_plan.yaml")
                if _plan_raw:
                    try:
                        _plan = yaml.safe_load(_plan_raw)
                        if isinstance(_plan, dict):
                            _plan_urls = _plan.get("seed_urls", [])
                            if isinstance(_plan_urls, list):
                                _seed_urls.extend(u for u in _plan_urls if isinstance(u, str))
                    except Exception:  # noqa: BLE001
                        pass

            web_agent = WebSearchAgent(
                tavily_api_key=tavily_key,
                enable_scholar=config.web_search.enable_scholar,
                enable_crawling=config.web_search.enable_crawling,
                enable_pdf=config.web_search.enable_pdf_extraction,
                max_web_results=config.web_search.max_web_results,
                max_scholar_results=config.web_search.max_scholar_results,
                max_crawl_urls=config.web_search.max_crawl_urls,
            )
            web_result = web_agent.search_and_extract(
                topic, search_queries=queries,
                crawl_urls=_seed_urls or None,
            )

            # Convert Google Scholar papers into candidates
            for sp in web_result.scholar_papers:
                _existing_titles = {
                    str(c.get("title", "")).lower().strip() for c in candidates
                }
                if sp.title.lower().strip() not in _existing_titles:
                    lit_paper = sp.to_literature_paper()
                    d = lit_paper.to_dict()
                    d["collected_at"] = _utcnow_iso()
                    candidates.append(d)
                    bibtex_entries.append(lit_paper.to_bibtex())

            # Convert general web results (docs, GitHub, blogs) into candidates
            import hashlib as _hashlib

            _existing_urls: set[str] = set()
            for c in candidates:
                _u = str(c.get("url", "")).lower().strip()
                if _u:
                    _existing_urls.add(_u)
            for wr in web_result.web_results:
                if not wr.title or not (wr.snippet or wr.content):
                    continue
                url_lower = wr.url.lower().strip()
                # Skip pure academic sources already covered by API search
                if any(d in url_lower for d in ("arxiv.org", "openreview.net", "semanticscholar")):
                    continue
                if url_lower in _existing_urls:
                    continue
                _existing_urls.add(url_lower)
                # Classify content type
                if "github.com" in url_lower or "gitlab" in url_lower:
                    _ctype = "code_repository"
                elif "docs." in url_lower or "readthedocs" in url_lower or "/docs/" in url_lower:
                    _ctype = "documentation"
                elif "blog." in url_lower or "medium.com" in url_lower:
                    _ctype = "blog"
                elif "pypi.org" in url_lower:
                    _ctype = "package"
                else:
                    _ctype = "web_article"
                url_hash = _hashlib.sha256(wr.url.encode()).hexdigest()[:12]
                candidates.append({
                    "id": f"web-{url_hash}",
                    "title": wr.title,
                    "source": f"web_{_ctype}",
                    "url": wr.url,
                    "year": 2025,
                    "abstract": (wr.content or wr.snippet or "")[:800],
                    "content_type": _ctype,
                    "is_web_result": True,
                    "collected_at": _utcnow_iso(),
                })

            # Save web search context for downstream stages
            web_context = web_result.to_context_string(max_length=20_000)
            if web_context.strip():
                (stage_dir / "web_context.md").write_text(
                    web_context, encoding="utf-8"
                )
                web_context_parts.append(web_context)

            # Save full web search metadata
            (stage_dir / "web_search_result.json").write_text(
                json.dumps(web_result.to_dict(), indent=2, default=str),
                encoding="utf-8",
            )

            logger.info(
                "[web-search] Added %d scholar papers, %d web results, %d crawled pages",
                len(web_result.scholar_papers),
                len(web_result.web_results),
                len(web_result.crawled_pages),
            )
        except Exception:  # noqa: BLE001
            logger.warning(
                "[web-search] Web search augmentation failed — continuing with academic APIs only",
                exc_info=True,
            )

    # --- Ultimate fallback: placeholder data ---
    # BUG-L2: Do NOT overwrite real_search_succeeded here — it was already
    # set correctly in the search block above. Overwriting would mislabel
    # LLM-hallucinated or seminal papers as "real search" results.
    if not candidates:
        logger.warning("Stage 4: All literature searches failed — using placeholder papers")
        candidates = [
            {
                "id": f"candidate-{idx + 1}",
                "title": f"[Placeholder] Study {idx + 1} on {topic}",
                "source": "arxiv" if idx % 2 == 0 else "semantic_scholar",
                "url": f"https://example.org/{_safe_filename(topic.lower())}/{idx + 1}",
                "year": 2024,
                "abstract": f"This candidate investigates {topic} and reports preliminary findings.",
                "collected_at": _utcnow_iso(),
                "is_placeholder": True,
            }
            for idx in range(max(20, config.research.daily_paper_count or 20))
        ]

    # Write candidates
    out = stage_dir / "candidates.jsonl"
    _write_jsonl(out, candidates)

    # BUG-50 fix: Generate BibTeX from candidates when real search failed
    # (LLM/placeholder fallback paths don't populate bibtex_entries)
    if not bibtex_entries and candidates:
        for c in candidates:
            if c.get("is_placeholder"):
                continue
            _ck = c.get("cite_key", "")
            if not _ck:
                # Derive cite_key from first author surname + year
                _authors = c.get("authors", [])
                _surname = "unknown"
                if isinstance(_authors, list) and _authors:
                    _a0 = _authors[0] if isinstance(_authors[0], str) else (_authors[0].get("name", "") if isinstance(_authors[0], dict) else "")
                    _surname = _a0.split()[-1].lower() if _a0.strip() else "unknown"
                _yr = c.get("year", 2024)
                _title_word = "".join(
                    w[0] for w in str(c.get("title", "study")).split()[:3]
                ).lower()
                _ck = f"{_surname}{_yr}{_title_word}"
            _title = c.get("title", "Untitled")
            _year = c.get("year", 2024)
            _author_str = ""
            _raw_authors = c.get("authors", [])
            if isinstance(_raw_authors, list):
                _names = []
                for _a in _raw_authors:
                    if isinstance(_a, str):
                        _names.append(_a)
                    elif isinstance(_a, dict):
                        _names.append(_a.get("name", ""))
                _author_str = " and ".join(n for n in _names if n)
            bibtex_entries.append(
                f"@article{{{_ck},\n"
                f"  title={{{_title}}},\n"
                f"  author={{{_author_str or 'Unknown'}}},\n"
                f"  year={{{_year}}},\n"
                f"  url={{{c.get('url', '')}}},\n"
                f"}}"
            )
        logger.info(
            "Stage 4: Generated %d BibTeX entries from candidates (fallback)",
            len(bibtex_entries),
        )

    # Write references.bib (F2.4)
    artifacts = ["candidates.jsonl"]
    if web_context_parts:
        artifacts.append("web_context.md")
    if (stage_dir / "web_search_result.json").exists():
        artifacts.append("web_search_result.json")
    if bibtex_entries:
        bib_content = "\n\n".join(bibtex_entries) + "\n"
        (stage_dir / "references.bib").write_text(bib_content, encoding="utf-8")
        artifacts.append("references.bib")
        logger.info(
            "Stage 4: Wrote %d BibTeX entries to references.bib", len(bibtex_entries)
        )

    # Write search metadata
    (stage_dir / "search_meta.json").write_text(
        json.dumps(
            {
                "real_search": real_search_succeeded,
                "queries_used": queries,
                "year_min": year_min,
                "total_candidates": len(candidates),
                "bibtex_entries": len(bibtex_entries),
                "ts": _utcnow_iso(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    artifacts.append("search_meta.json")

    return StageResult(
        stage=Stage.LITERATURE_COLLECT,
        status=StageStatus.DONE,
        artifacts=tuple(artifacts),
        evidence_refs=tuple(f"stage-04/{a}" for a in artifacts),
    )


_MAX_ABSTRACT_LEN = 800  # Truncate long abstracts to reduce token usage
_MAX_CANDIDATES_CHARS = 30_000  # Cap total candidates text sent to LLM


def _execute_literature_screen(
    stage_dir: Path,
    run_dir: Path,
    config: RCConfig,
    adapters: AdapterBundle,
    *,
    llm: LLMClient | None = None,
    prompts: PromptManager | None = None,
) -> StageResult:
    candidates_text = _read_prior_artifact(run_dir, "candidates.jsonl") or ""

    # --- P1-1: keyword relevance pre-filter ---
    # Before LLM screening, drop papers whose title+abstract share no keywords
    # with the research topic.  This catches cross-domain noise cheaply.
    topic_keywords = _extract_topic_keywords(
        config.research.topic, config.research.domains
    )
    filtered_rows: list[dict[str, Any]] = []
    dropped_count = 0
    for raw_line in candidates_text.strip().splitlines():
        row = _safe_json_loads(raw_line, {})
        if not isinstance(row, dict):
            continue
        title = str(row.get("title", "")).lower()
        abstract = str(row.get("abstract", "")).lower()
        text_blob = f"{title} {abstract}"
        overlap = sum(1 for kw in topic_keywords if kw in text_blob)
        # T2.2: Relaxed from ≥2 to ≥1 keyword hit — previous threshold was
        # too aggressive (94% rejection rate).  Single-keyword matches are
        # still screened by the LLM in the next step.
        if overlap >= 1:
            row["keyword_overlap"] = overlap
            filtered_rows.append(row)
        else:
            dropped_count += 1
    # If pre-filter dropped everything, fall back to original (safety valve)
    if not filtered_rows:
        filtered_rows = _parse_jsonl_rows(candidates_text)
    # Truncate abstracts and strip authors to reduce token usage
    for row in filtered_rows:
        abstract = row.get("abstract", "")
        if isinstance(abstract, str) and len(abstract) > _MAX_ABSTRACT_LEN:
            row["abstract"] = abstract[:_MAX_ABSTRACT_LEN] + "..."
        # Strip authors list — not needed for screening and inflates tokens
        row.pop("authors", None)

    # Rebuild candidates_text from filtered rows
    candidates_text = "\n".join(
        json.dumps(r, ensure_ascii=False) for r in filtered_rows
    )
    # Cap total candidates text size to avoid blowing token budget
    if len(candidates_text) > _MAX_CANDIDATES_CHARS:
        # Truncate at newline boundary to avoid cutting mid-JSON-line
        candidates_text = candidates_text[:_MAX_CANDIDATES_CHARS].rsplit("\n", 1)[0]
        logger.info(
            "Candidates text truncated to %d chars for screening",
            len(candidates_text),
        )
    logger.info(
        "Domain pre-filter: kept %d, dropped %d (keywords: %s)",
        len(filtered_rows),
        dropped_count,
        topic_keywords[:8],
    )

    shortlist: list[dict[str, Any]] = []
    if llm is not None:
        _pm = prompts or PromptManager()
        _overlay = _get_evolution_overlay(run_dir, "literature_screen")
        sp = _pm.for_stage(
            "literature_screen",
            evolution_overlay=_overlay,
            topic=config.research.topic,
            domains=", ".join(config.research.domains)
            if config.research.domains
            else "general",
            quality_threshold=config.research.quality_threshold,
            candidates_text=candidates_text,
        )
        resp = _chat_with_prompt(
            llm,
            sp.system,
            sp.user,
            json_mode=sp.json_mode,
            max_tokens=sp.max_tokens,
        )
        payload = _safe_json_loads(resp.content, {})
        if isinstance(payload, dict) and isinstance(payload.get("shortlist"), list):
            shortlist = [row for row in payload["shortlist"] if isinstance(row, dict)]
    # T2.2: Ensure minimum shortlist size for adequate related work.
    # Configurable via research.min_shortlist (default 8); niche topics
    # (e.g. infrared small-target detection) benefit from lower minimums
    # to avoid flooding the shortlist with irrelevant keyword-match filler papers.
    # If the actual relevant pool is smaller than the configured minimum,
    # dynamically lower the target to avoid padding with noise.
    _MIN_SHORTLIST = getattr(config.research, "min_shortlist", 8) or 8
    if not shortlist:
        # When LLM produces zero, synthesize from filtered candidates
        _target = min(_MIN_SHORTLIST, max(len(filtered_rows), 6) if filtered_rows else _MIN_SHORTLIST)
        rows = (
            filtered_rows[:_target]
            if filtered_rows
            else _parse_jsonl_rows(candidates_text)[:_target]
        )
        for idx, item in enumerate(rows):
            item["relevance_score"] = round(0.75 - idx * 0.02, 3)
            item["quality_score"] = round(0.72 - idx * 0.015, 3)
            item["keep_reason"] = "Template screened entry"
            item["template_data"] = True
            shortlist.append(item)
    elif len(shortlist) < _MIN_SHORTLIST:
        # T2.2: LLM returned too few — supplement from filtered candidates
        # but cap at a dynamic ceiling: never exceed 2x the LLM-selected count
        # to avoid diluting quality with padding noise
        _dynamic_ceil = min(_MIN_SHORTLIST, max(len(shortlist) * 2, _MIN_SHORTLIST))
        existing_titles = {
            str(s.get("title", "")).lower().strip() for s in shortlist
        }
        for row in filtered_rows:
            if len(shortlist) >= _dynamic_ceil:
                break
            title_lower = str(row.get("title", "")).lower().strip()
            if title_lower and title_lower not in existing_titles:
                row.setdefault("relevance_score", 0.6)
                row.setdefault("quality_score", 0.55)
                row.setdefault("keep_reason", "Supplemented to meet minimum shortlist")
                row.setdefault("template_data", True)
                shortlist.append(row)
                existing_titles.add(title_lower)
        logger.info(
            "Stage 5: Supplemented shortlist from %d to %d papers (minimum: %d, ceiling: %d)",
            len(shortlist) - len([r for r in shortlist if r.get("template_data")]),
            len(shortlist), _MIN_SHORTLIST, _dynamic_ceil,
        )
    out = stage_dir / "shortlist.jsonl"
    _write_jsonl(out, shortlist)
    return StageResult(
        stage=Stage.LITERATURE_SCREEN,
        status=StageStatus.DONE,
        artifacts=("shortlist.jsonl",),
        evidence_refs=("stage-05/shortlist.jsonl",),
    )


def _execute_knowledge_extract(
    stage_dir: Path,
    run_dir: Path,
    config: RCConfig,
    adapters: AdapterBundle,
    *,
    llm: LLMClient | None = None,
    prompts: PromptManager | None = None,
) -> StageResult:
    shortlist = _read_prior_artifact(run_dir, "shortlist.jsonl") or ""

    # Inject topic verification note from Stage-02 if web evidence was found
    _vf_path = _find_prior_file(run_dir, "topic_verification.json")
    _verification_note = ""
    if _vf_path is not None:
        try:
            _vf_data = _safe_json_loads(_vf_path.read_text(encoding="utf-8"), {})
            if isinstance(_vf_data, dict) and _vf_data.get("verified"):
                _titles = _vf_data.get("evidence_titles", [])
                _urls = _vf_data.get("suggested_urls", [])
                if _titles or _urls:
                    _lines = ["### IMPORTANT: Topic Components Verified",
                              "Web search confirmed these architectures/tools exist. "
                              "Treat the following as authoritative sources:"]
                    for t in _titles:
                        _lines.append(f"- {t}")
                    for u in _urls:
                        _lines.append(f"  - {u}")
                    _verification_note = "\n".join(_lines) + "\n"
        except Exception:  # noqa: BLE001
            pass

    # Inject web context from Stage 4 if available
    web_context = _read_prior_artifact(run_dir, "web_context.md") or ""
    _web_context_part = ""
    if web_context:
        _web_context_part = "\n\n--- Web Search Context ---\n" + web_context[:10_000]

    if _verification_note:
        shortlist = shortlist + "\n" + _verification_note
    if _web_context_part:
        shortlist = shortlist + _web_context_part

    cards_dir = stage_dir / "cards"
    cards_dir.mkdir(parents=True, exist_ok=True)
    cards: list[dict[str, Any]] = []
    if llm is not None:
        _pm = prompts or PromptManager()
        _overlay = _get_evolution_overlay(run_dir, "knowledge_extract")

        # --- Batch processing: split papers into chunks of BATCH_SIZE ---
        # Avoids max_tokens truncation (was 4096, now 16384 per batch)
        _BATCH_SIZE = 5
        _all_rows = _parse_jsonl_rows(shortlist)
        _papers = [r for r in _all_rows if isinstance(r, dict)]
        _batches = [
            _papers[i:i + _BATCH_SIZE]
            for i in range(0, len(_papers), _BATCH_SIZE)
        ]

        if not _batches:
            _batches = [[]]  # safety: at least one empty batch to trigger fallback

        for _batch_idx, _batch_papers in enumerate(_batches):
            if not _batch_papers:
                continue
            # Build batch-specific shortlist string
            _batch_lines = "\n".join(
                json.dumps(p, default=str) for p in _batch_papers
            )
            _batch_shortlist = _batch_lines
            if _verification_note:
                _batch_shortlist += "\n" + _verification_note
            if _web_context_part:
                _batch_shortlist += _web_context_part

            sp = _pm.for_stage(
                "knowledge_extract", evolution_overlay=_overlay,
                shortlist=_batch_shortlist,
            )
            resp = _chat_with_prompt(
                llm,
                sp.system,
                sp.user,
                json_mode=sp.json_mode,
                max_tokens=sp.max_tokens,
            )
            payload = _safe_json_loads(resp.content, {})
            batch_cards: list[dict[str, Any]] = []
            if isinstance(payload, dict) and isinstance(payload.get("cards"), list):
                batch_cards = [item for item in payload["cards"] if isinstance(item, dict)]

            # Retry once with stricter prompt if batch returned empty
            if not batch_cards:
                _retry_sp = _pm.for_stage(
                    "knowledge_extract_retry",
                    evolution_overlay=_overlay,
                    shortlist=_batch_shortlist,
                )
                _retry_resp = _chat_with_prompt(
                    llm,
                    _retry_sp.system,
                    _retry_sp.user,
                    json_mode=True,
                    max_tokens=_retry_sp.max_tokens,
                )
                _retry_payload = _safe_json_loads(_retry_resp.content, {})
                if isinstance(_retry_payload, dict) and isinstance(
                    _retry_payload.get("cards"), list
                ):
                    batch_cards = [
                        item for item in _retry_payload["cards"]
                        if isinstance(item, dict)
                    ]
                if batch_cards:
                    logger.info(
                        "Stage 06 batch %d/%d: retry succeeded — %d cards",
                        _batch_idx + 1, len(_batches), len(batch_cards),
                    )

            cards.extend(batch_cards)
            logger.info(
                "Stage 06 batch %d/%d: %d papers → %d cards",
                _batch_idx + 1, len(_batches), len(_batch_papers), len(batch_cards),
            )

    if not cards:
        # Fallback: parse abstract structure with basic NLP heuristics.
        # Many academic abstracts follow the pattern:
        #   [background/problem] ... "We propose" / "In this paper" [method] ...
        #   "Experiments on" / "Results show" [findings] ... "However" [limitations]
        rows = _parse_jsonl_rows(shortlist)
        logger.warning(
            "Stage 06: LLM extraction produced no cards (%d shortlist rows). "
            "Building cards from paper metadata with NLP fallback.",
            len(rows),
        )
        _SECTION_MARKERS = [
            (["we propose", "in this paper", "our approach", "our method",
              "we present", "we introduce", "to address", "this paper presents"],
             "method_start"),
            (["experiment", "result", "evaluation", "we evaluate", "we test",
              "our experiments", "we conduct", "performance of", "achieving"],
             "findings_start"),
            (["however", "limitation", "future work", "we acknowledge",
              "despite", "although", "our method does not"],
             "limitations_start"),
        ]

        def _segment_abstract(text: str) -> dict[str, str]:
            """Basic NLP segmentation of an abstract into structured fields."""
            text_lower = text.lower()
            breaks: list[tuple[int, str]] = []
            for markers, label in _SECTION_MARKERS:
                for m in markers:
                    pos = text_lower.find(m)
                    if pos >= 0:
                        breaks.append((pos, label))
                        break  # first marker of this type wins
            breaks.sort()
            if not breaks:
                # Can't segment — treat as problem+method only
                return {"problem": text[:300], "method": text[100:400],
                        "findings": "", "limitations": ""}

            segments: dict[str, str] = {"problem": "", "method": "", "findings": "", "limitations": ""}
            # Pre-first-break region = problem
            first_pos = breaks[0][0]
            segments["problem"] = text[:min(first_pos, 400)].strip()
            # Assign each region to its label
            for i, (pos, label) in enumerate(breaks):
                end = breaks[i + 1][0] if i + 1 < len(breaks) else min(pos + 500, len(text))
                segment = text[pos:end].strip()
                if "method" in label:
                    segments["method"] = segment[:400]
                elif "findings" in label:
                    segments["findings"] = segment[:400]
                elif "limitations" in label:
                    segments["limitations"] = segment[:300]
            return segments

        for idx, paper in enumerate(rows[:6]):
            title = str(paper.get("title", f"Paper {idx + 1}"))
            abstract = str(paper.get("abstract", "")).strip()
            cite_key = str(paper.get("cite_key", ""))
            url = str(paper.get("url", ""))
            if abstract and abstract not in ("None", ""):
                seg = _segment_abstract(abstract)
            else:
                seg = {"problem": "", "method": "", "findings": "", "limitations": ""}
            cards.append(
                {
                    "card_id": f"card-{idx + 1}",
                    "title": title,
                    "problem": seg["problem"] or (
                        abstract[:200] if abstract and abstract not in ("None", "")
                        else f"Related to: {config.research.topic}"
                    ),
                    "method": seg["method"] or (abstract[:300] if abstract else ""),
                    "data": "",
                    "metrics": "",
                    "findings": seg["findings"] or (abstract[:200] if abstract else ""),
                    "limitations": seg["limitations"],
                    "citation": url,
                    "cite_key": cite_key,
                    "data_quality": "degraded",
                    "source": "fallback_nlp",
                }
            )
    for idx, card in enumerate(cards):
        card_id = _safe_filename(str(card.get("card_id", f"card-{idx + 1}")))
        parts = [f"# {card.get('title', card_id)}", ""]
        for key in (
            "cite_key",
            "problem",
            "method",
            "data",
            "metrics",
            "findings",
            "limitations",
            "citation",
        ):
            parts.append(f"## {key.title()}")
            parts.append(str(card.get(key, "")))
            parts.append("")
        (cards_dir / f"{card_id}.md").write_text("\n".join(parts), encoding="utf-8")
    return StageResult(
        stage=Stage.KNOWLEDGE_EXTRACT,
        status=StageStatus.DONE,
        artifacts=("cards/",),
        evidence_refs=("stage-06/cards/",),
    )
