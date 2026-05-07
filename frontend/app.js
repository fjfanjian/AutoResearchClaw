/**
 * AutoResearchClaw — Web UI Application
 *
 * Single-file SPA: API client, WebSocket client, and all views.
 * Views: Dashboard, Pipeline, Run History, Chat
 */

/* =========================================================
   1. Utilities
   ========================================================= */

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function toast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container')
    || (() => {
      const c = el('div', { id: 'toast-container' });
      document.body.appendChild(c);
      return c;
    })();
  const t = el('div', { class: `toast ${type}` }, msg);
  container.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function fmtDuration(sec) {
  if (!sec || sec < 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleString(); } catch { return str; }
}

function statusBadge(status) {
  const map = {
    running: 'running', completed: 'done', done: 'done',
    failed: 'failed', stopped: 'stopped', idle: 'idle', unknown: 'idle',
  };
  const cls = map[status] || 'idle';
  return el('span', { class: `badge badge-${cls}` }, status || 'unknown');
}

/* =========================================================
   2. API Client
   ========================================================= */

const API = {
  base: '',

  async get(path) {
    const res = await fetch(this.base + path);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.json();
  },

  async post(path, body = {}) {
    const res = await fetch(this.base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).detail || ''; } catch {}
      throw new Error(detail || `HTTP ${res.status}`);
    }
    return res.json();
  },

  health: () => API.get('/api/health'),
  config: () => API.get('/api/config'),
  pipelineStatus: () => API.get('/api/pipeline/status'),
  pipelineStages: () => API.get('/api/pipeline/stages'),
  pipelineStart: (body) => API.post('/api/pipeline/start', body),
  pipelineStop: () => API.post('/api/pipeline/stop'),
  listRuns: () => API.get('/api/runs'),
  getRun: (id) => API.get(`/api/runs/${encodeURIComponent(id)}`),
  getMetrics: (id) => API.get(`/api/runs/${encodeURIComponent(id)}/metrics`),
};

/* =========================================================
   3. WebSocket Client
   ========================================================= */

const WS = {
  _socket: null,
  _handlers: {},
  _reconnectDelay: 2000,
  _maxDelay: 30000,
  _timer: null,

  on(type, handler) {
    this._handlers[type] = this._handlers[type] || [];
    this._handlers[type].push(handler);
    return this;
  },

  off(type, handler) {
    if (!this._handlers[type]) return;
    this._handlers[type] = this._handlers[type].filter(h => h !== handler);
  },

  _emit(type, data) {
    (this._handlers[type] || []).forEach(h => h(data));
    (this._handlers['*'] || []).forEach(h => h({ type, data }));
  },

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws/events`;
    try {
      this._socket = new WebSocket(url);
    } catch (e) {
      this._scheduleReconnect();
      return;
    }

    this._socket.onopen = () => {
      this._reconnectDelay = 2000;
      this._emit('_connected', {});
    };

    this._socket.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        this._emit(msg.type, msg.data);
        this._emit('_any', msg);
      } catch {}
    };

    this._socket.onclose = () => {
      this._emit('_disconnected', {});
      this._scheduleReconnect();
    };

    this._socket.onerror = () => {
      this._emit('_error', {});
    };
  },

  send(obj) {
    if (this._socket && this._socket.readyState === WebSocket.OPEN) {
      this._socket.send(JSON.stringify(obj));
    }
  },

  _scheduleReconnect() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.connect(), this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, this._maxDelay);
  },

  disconnect() {
    clearTimeout(this._timer);
    if (this._socket) { this._socket.onclose = null; this._socket.close(); }
  },
};

/* =========================================================
   4. Application State
   ========================================================= */

const State = {
  view: 'dashboard',
  config: null,
  health: null,
  pipelineStatus: null,
  stages: [],
  runs: [],
  currentRun: null,
  wsConnected: false,
  logs: [],           // { text, cls }[]
  MAX_LOGS: 500,

  addLog(text, cls = 'info') {
    this.logs.push({ text, cls });
    if (this.logs.length > this.MAX_LOGS) this.logs.shift();
  },
};

/* =========================================================
   5. Views
   ========================================================= */

/* ----- 5.1  Dashboard ----- */
const DashboardView = {
  render() {
    const wrap = el('div', { class: 'section-gap' });

    // --- Quick Stats row ---
    const statsRow = el('div', { class: 'grid-4' });
    wrap.appendChild(statsRow);

    // --- Two-column layout: Start Run + Active Status ---
    const twoCol = el('div', { class: 'row' });
    const leftCol = el('div', { style: 'flex: 1; display: flex; flex-direction: column; gap: 1.25rem;' });
    const rightCol = el('div', { style: 'flex: 1.4; display: flex; flex-direction: column; gap: 1.25rem;' });
    twoCol.append(leftCol, rightCol);
    wrap.appendChild(twoCol);

    // Start New Run card
    const startCard = el('div', { class: 'card' });
    startCard.appendChild(el('div', { class: 'card-header' },
      el('span', { class: 'card-title' }, '🚀 Start New Run'),
    ));
    const topicInput = el('input', { class: 'form-input', placeholder: 'Enter research topic…', type: 'text', id: 'topic-input' });
    const autoToggle = el('input', { type: 'checkbox', id: 'auto-approve', checked: '' });
    const startBtn = el('button', { class: 'btn btn-primary w-full', id: 'start-btn', style: 'margin-top: 0.75rem;', onclick: () => this.handleStart(topicInput, autoToggle, startBtn) }, '▶ Run Pipeline');

    startCard.append(
      el('div', { class: 'form-group' },
        el('label', { class: 'form-label', for: 'topic-input' }, 'Research Topic'),
        topicInput,
      ),
      el('div', { class: 'toggle-row' },
        el('span', { class: 'toggle-label' }, 'Auto-approve gates'),
        el('label', { class: 'toggle' }, autoToggle, el('span', { class: 'toggle-slider' })),
      ),
      startBtn,
    );
    leftCol.appendChild(startCard);

    // Config Summary card
    const cfgCard = el('div', { class: 'card' });
    cfgCard.appendChild(el('div', { class: 'card-header' }, el('span', { class: 'card-title' }, '⚙️ Config')));
    cfgCard.appendChild(el('div', { id: 'cfg-body', class: 'text-muted text-sm' }, 'Loading…'));
    leftCol.appendChild(cfgCard);

    // Active Run card
    const activeCard = el('div', { class: 'card', id: 'active-run-card' });
    activeCard.appendChild(el('div', { class: 'card-header' },
      el('span', { class: 'card-title' }, '📊 Active Run'),
    ));
    activeCard.appendChild(el('div', { id: 'active-run-body' }, 'Loading…'));
    rightCol.appendChild(activeCard);

    // Log Stream card
    const logCard = el('div', { class: 'card' });
    logCard.appendChild(el('div', { class: 'card-header' },
      el('span', { class: 'card-title' }, '📜 Live Logs'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { State.logs = []; this.refreshLogs(); } }, 'Clear'),
    ));
    logCard.appendChild(el('div', { class: 'log-stream', id: 'log-stream' }));
    rightCol.appendChild(logCard);

    // populate async
    this.refreshStats(statsRow);
    this.refreshConfig();
    this.refreshActiveRun();
    this.refreshLogs();

    // live log subscription
    this._logUnsub = (msg) => {
      if (msg.type === 'log_line') {
        const text = msg.data.line || msg.data.message || JSON.stringify(msg.data);
        const cls = msg.data.level === 'ERROR' ? 'error'
          : msg.data.level === 'WARNING' ? 'warn'
          : msg.data.stage_change ? 'stage' : 'info';
        State.addLog(text, cls);
        this.refreshLogs();
      }
      if (['stage_start', 'stage_complete', 'stage_fail', 'pipeline_started', 'pipeline_completed'].includes(msg.type)) {
        this.refreshActiveRun();
        this.refreshStats(statsRow);
      }
    };
    WS.on('_any', this._logUnsub);

    return wrap;
  },

  unmount() {
    if (this._logUnsub) WS.off('_any', this._logUnsub);
  },

  async refreshStats(container) {
    let runCount = 0, active = 0;
    try {
      const r = await API.listRuns();
      runCount = (r.runs || []).length;
      active = (r.runs || []).filter(x => x.checkpoint?.status === 'running').length;
    } catch {}

    let stagesDone = 0, topic = '';
    try {
      const s = await API.pipelineStatus();
      stagesDone = s.stages_done || 0;
      topic = s.topic || '';
    } catch {}

    container.innerHTML = '';
    const cards = [
      { label: 'Total Runs',    value: runCount },
      { label: 'Active Runs',   value: active },
      { label: 'Stages Done',   value: stagesDone },
      { label: 'Pipeline',      value: topic ? '23 stages' : 'Ready' },
    ];
    cards.forEach(({ label, value }) => {
      const c = el('div', { class: 'stat-card' },
        el('div', { class: 'stat-value' }, String(value)),
        el('div', { class: 'stat-label' }, label),
      );
      container.appendChild(c);
    });
  },

  async refreshConfig() {
    const body = document.getElementById('cfg-body');
    if (!body) return;
    try {
      const cfg = await API.config();
      body.innerHTML = '';
      const rows = [
        ['Project', cfg.project],
        ['Topic', cfg.topic || '—'],
        ['Mode', cfg.mode],
        ['Voice', cfg.server?.voice_enabled ? '✅ enabled' : '—'],
      ];
      rows.forEach(([k, v]) => {
        const row = el('div', { class: 'flex justify-between', style: 'padding: 0.25rem 0; border-bottom: 1px solid rgba(51,65,85,0.4);' },
          el('span', { class: 'text-muted' }, k),
          el('span', { style: 'font-family: var(--font-mono); font-size: 0.8rem;' }, String(v || '—')),
        );
        body.appendChild(row);
      });
    } catch {
      if (body) body.textContent = 'Could not load config.';
    }
  },

  async refreshActiveRun() {
    const body = document.getElementById('active-run-body');
    if (!body) return;
    try {
      const status = await API.pipelineStatus();
      if (status.status === 'idle' || !status.run_id) {
        body.innerHTML = '';
        body.appendChild(el('div', { class: 'empty-state' },
          el('div', { class: 'empty-state-icon' }, '😴'),
          el('p', {}, 'No active run. Start one above.'),
        ));
        return;
      }

      const pct = status.stages_done ? Math.round((status.stages_done / 23) * 100) : 0;
      body.innerHTML = '';

      body.append(
        el('div', { class: 'flex justify-between items-center', style: 'margin-bottom: 0.5rem;' },
          el('span', { class: 'text-sm text-mono' }, status.run_id),
          statusBadge(status.status),
        ),
        el('div', { class: 'text-sm text-muted', style: 'margin-bottom: 0.5rem;' }, status.topic || ''),
        el('div', { class: 'progress-bar-wrap' },
          el('div', { class: 'progress-bar-fill', style: `width: ${pct}%` }),
        ),
        el('div', { class: 'flex justify-between text-sm text-muted', style: 'margin-top: 0.25rem;' },
          el('span', {}, `${status.stages_done || 0} / 23 stages`),
          el('span', {}, `${pct}%`),
        ),
      );

      if (status.status === 'running') {
        const stopBtn = el('button', {
          class: 'btn btn-danger btn-sm',
          style: 'margin-top: 0.75rem;',
          onclick: async () => {
            stopBtn.disabled = true;
            try {
              await API.pipelineStop();
              toast('Pipeline stopped.', 'info');
              this.refreshActiveRun();
            } catch (e) {
              toast('Stop failed: ' + e.message, 'error');
              stopBtn.disabled = false;
            }
          },
        }, '⏹ Stop Pipeline');
        body.appendChild(stopBtn);
      }
    } catch {
      if (body) body.textContent = 'Could not load status.';
    }
  },

  refreshLogs() {
    const container = document.getElementById('log-stream');
    if (!container) return;
    container.innerHTML = '';
    State.logs.forEach(({ text, cls }) => {
      container.appendChild(el('span', { class: `log-line ${cls}` }, text + '\n'));
    });
    container.scrollTop = container.scrollHeight;
  },

  async handleStart(topicInput, autoToggle, startBtn) {
    const topic = topicInput.value.trim();
    if (!topic) { toast('Please enter a research topic.', 'error'); topicInput.focus(); return; }
    startBtn.disabled = true;
    startBtn.textContent = '⏳ Starting…';
    try {
      const result = await API.pipelineStart({ topic, auto_approve: autoToggle.checked });
      toast(`Pipeline started: ${result.run_id}`, 'success');
      topicInput.value = '';
      State.addLog(`▶ Pipeline started — ${result.run_id}`, 'stage');
      this.refreshLogs();
      this.refreshActiveRun();
    } catch (e) {
      toast('Failed to start: ' + e.message, 'error');
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = '▶ Run Pipeline';
    }
  },
};

/* ----- 5.2  Pipeline (stage browser) ----- */
const PipelineView = {
  render() {
    const wrap = el('div', { class: 'section-gap' });

    const infoCard = el('div', { class: 'card' });
    infoCard.appendChild(el('div', { class: 'card-header' },
      el('span', { class: 'card-title' }, '⚙️ 23-Stage Pipeline Overview'),
      el('div', { id: 'stage-status-badge' }),
    ));
    infoCard.appendChild(el('div', { id: 'stage-list-wrap', style: 'margin-top: 0.5rem;' },
      el('div', { class: 'flex items-center gap-1', style: 'padding: 1rem;' },
        el('div', { class: 'spinner' }), el('span', { class: 'text-muted text-sm' }, ' Loading stages…'),
      ),
    ));
    wrap.appendChild(infoCard);

    this.load();

    this._wsHandler = (msg) => {
      if (['stage_start', 'stage_complete', 'stage_fail', 'pipeline_started', 'pipeline_completed', 'run_status_changed'].includes(msg.type)) {
        this.load();
      }
    };
    WS.on('_any', this._wsHandler);

    return wrap;
  },

  unmount() {
    if (this._wsHandler) WS.off('_any', this._wsHandler);
  },

  async load() {
    const wrap = document.getElementById('stage-list-wrap');
    const badgeContainer = document.getElementById('stage-status-badge');
    if (!wrap) return;

    let stagesData = [], statusData = { status: 'idle' };
    try { stagesData = (await API.pipelineStages()).stages || []; } catch {}
    try { statusData = await API.pipelineStatus(); } catch {}

    const doneNums = new Set();
    if (statusData.stages_done) {
      for (let i = 1; i <= statusData.stages_done; i++) doneNums.add(i);
    }
    const current = statusData.stages_done ? statusData.stages_done + 1 : null;
    const failed = statusData.status === 'failed' ? current : null;

    if (badgeContainer) {
      badgeContainer.innerHTML = '';
      badgeContainer.appendChild(statusBadge(statusData.status));
    }

    wrap.innerHTML = '';
    if (!stagesData.length) {
      wrap.appendChild(el('p', { class: 'text-muted text-sm' }, 'No stage data available.'));
      return;
    }

    const tracker = el('div', { class: 'stage-tracker' });
    stagesData.forEach(s => {
      const isDone = doneNums.has(s.number);
      const isActive = s.number === current && statusData.status === 'running';
      const isFailed = s.number === failed;
      const cls = `stage-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} ${isFailed ? 'failed' : ''}`.trim();
      const check = isDone ? '✓' : isActive ? '●' : isFailed ? '✗' : '';
      const item = el('div', { class: cls },
        el('span', { class: 'stage-num' }, String(s.number)),
        el('span', { class: 'stage-name' }, s.label || s.name),
        el('span', { class: 'stage-check' }, check),
      );
      tracker.appendChild(item);
    });
    wrap.appendChild(tracker);

    // Progress
    const pct = statusData.stages_done ? Math.round((statusData.stages_done / 23) * 100) : 0;
    const progressWrap = el('div', { style: 'margin-top: 1rem;' },
      el('div', { class: 'flex justify-between text-sm text-muted', style: 'margin-bottom: 0.35rem;' },
        el('span', {}, `Progress: ${statusData.stages_done || 0} / 23`),
        el('span', {}, `${pct}%`),
      ),
      el('div', { class: 'progress-bar-wrap' },
        el('div', { class: 'progress-bar-fill', style: `width: ${pct}%` }),
      ),
    );
    wrap.insertBefore(progressWrap, wrap.firstChild);
  },
};

/* ----- 5.3  Runs (history) ----- */
const RunsView = {
  render() {
    const wrap = el('div', { class: 'section-gap' });
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-header' },
      el('span', { class: 'card-title' }, '📋 Run History'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => this.load() }, '↻ Refresh'),
    ));
    card.appendChild(el('div', { id: 'runs-table-area' },
      el('div', { class: 'flex items-center gap-1', style: 'padding: 1rem;' },
        el('div', { class: 'spinner' }), el('span', { class: 'text-muted text-sm' }, ' Loading…'),
      ),
    ));
    wrap.appendChild(card);

    // Run detail panel (hidden initially)
    const detailCard = el('div', { class: 'card', id: 'run-detail-card', style: 'display: none;' });
    wrap.appendChild(detailCard);

    this.load();

    this._wsHandler = (msg) => {
      if (['run_discovered', 'run_status_changed'].includes(msg.type)) this.load();
    };
    WS.on('_any', this._wsHandler);

    return wrap;
  },

  unmount() {
    if (this._wsHandler) WS.off('_any', this._wsHandler);
  },

  async load() {
    const area = document.getElementById('runs-table-area');
    if (!area) return;
    let runs = [];
    try { runs = (await API.listRuns()).runs || []; } catch {
      area.innerHTML = '<p class="text-muted text-sm" style="padding: 1rem;">Failed to load runs.</p>';
      return;
    }

    if (!runs.length) {
      area.innerHTML = '';
      area.appendChild(el('div', { class: 'empty-state' },
        el('div', { class: 'empty-state-icon' }, '📭'),
        el('p', {}, 'No runs yet. Start a pipeline from the Dashboard.'),
      ));
      return;
    }

    const tableWrap = el('div', { class: 'run-table-wrap' });
    const table = el('table', { class: 'run-table' });
    const thead = el('thead', {},
      el('tr', {},
        el('th', {}, 'Run ID'),
        el('th', {}, 'Stage'),
        el('th', {}, 'Status'),
        el('th', {}, 'Actions'),
      ),
    );
    table.appendChild(thead);

    const tbody = el('tbody');
    runs.forEach(run => {
      const ckpt = run.checkpoint || {};
      const tr = el('tr');
      tr.append(
        el('td', { class: 'run-id-cell' }, run.run_id),
        el('td', {}, String(ckpt.stage || '—')),
        el('td', {}, statusBadge(ckpt.status || 'unknown')),
        el('td', {},
          el('button', { class: 'btn btn-ghost btn-sm run-link', onclick: () => this.showDetail(run.run_id) }, '🔍 Details'),
        ),
      );
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    area.innerHTML = '';
    area.appendChild(tableWrap);
  },

  async showDetail(runId) {
    const card = document.getElementById('run-detail-card');
    if (!card) return;
    card.style.display = '';
    card.innerHTML = '';
    card.appendChild(el('div', { class: 'card-header' },
      el('span', { class: 'card-title' }, `🔍 Run: ${runId}`),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { card.style.display = 'none'; } }, '✕ Close'),
    ));
    card.appendChild(el('div', { class: 'flex items-center gap-1', style: 'padding: 0.5rem 0;' },
      el('div', { class: 'spinner' }), el('span', { class: 'text-muted text-sm' }, ' Loading details…'),
    ));
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const [info, metricsRes] = await Promise.all([
        API.getRun(runId),
        API.getMetrics(runId).catch(() => ({ metrics: {} })),
      ]);
      card.innerHTML = '';
      card.appendChild(el('div', { class: 'card-header' },
        el('span', { class: 'card-title' }, `🔍 Run: ${runId}`),
        el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { card.style.display = 'none'; } }, '✕ Close'),
      ));

      // Info rows
      const ckpt = info.checkpoint || {};
      const infoRows = [
        ['Status', statusBadge(ckpt.status || 'unknown')],
        ['Current Stage', ckpt.stage ? String(ckpt.stage) : '—'],
        ['Topic', ckpt.topic || '—'],
        ['Start Time', fmtDate(ckpt.start_time)],
        ['Stages Completed', (info.stages_completed || []).length],
        ['Has Paper (md)', info.has_md ? '✅' : '—'],
        ['Has LaTeX', info.has_tex ? '✅' : '—'],
        ['Has PDF', info.has_pdf ? '✅' : '—'],
      ];
      const infoGrid = el('div', { class: 'grid-2', style: 'gap: 0.25rem; margin-bottom: 1rem;' });
      infoRows.forEach(([k, v]) => {
        const row = el('div', { class: 'flex justify-between', style: 'padding: 0.3rem 0; border-bottom: 1px solid rgba(51,65,85,0.4); font-size: 0.85rem;' },
          el('span', { class: 'text-muted' }, k),
          typeof v === 'string' || typeof v === 'number' ? el('span', {}, String(v)) : v,
        );
        infoGrid.appendChild(row);
      });
      card.appendChild(infoGrid);

      // Metrics
      const metrics = metricsRes.metrics || {};
      if (Object.keys(metrics).length > 0) {
        card.appendChild(el('div', { class: 'card-title', style: 'margin-bottom: 0.5rem;' }, '📈 Metrics'));
        const mg = el('div', { class: 'metrics-grid' });
        Object.entries(metrics).forEach(([k, v]) => {
          mg.appendChild(el('div', { class: 'metric-card' },
            el('div', { class: 'metric-key' }, k),
            el('div', { class: 'metric-val' }, typeof v === 'number' ? v.toFixed(4) : String(v)),
          ));
        });
        card.appendChild(mg);
      }

      // Stages completed list
      if ((info.stages_completed || []).length > 0) {
        card.appendChild(el('div', { class: 'card-title', style: 'margin: 1rem 0 0.5rem;' }, '✅ Completed Stages'));
        const stageList = el('div', { style: 'display: flex; flex-wrap: wrap; gap: 0.4rem;' });
        info.stages_completed.forEach(s => {
          stageList.appendChild(el('span', { class: 'badge badge-done' }, s));
        });
        card.appendChild(stageList);
      }
    } catch (e) {
      card.innerHTML = `<p class="text-muted text-sm" style="padding: 0.5rem 0;">Failed to load: ${e.message}</p>`;
    }
  },
};

/* ----- 5.4  Chat ----- */
const ChatView = {
  _ws: null,
  _open: false,

  render() {
    const wrap = el('div', {});
    const layout = el('div', { class: 'chat-layout' });

    const messages = el('div', { class: 'chat-messages', id: 'chat-messages' });
    const inputRow = el('div', { class: 'chat-input-row' });
    const input = el('input', { class: 'chat-input', id: 'chat-input', placeholder: 'Message ResearchClaw…', type: 'text' });
    const sendBtn = el('button', { class: 'btn btn-primary', id: 'chat-send-btn', onclick: () => this.send(input) }, '➤');

    input.addEventListener('keydown', e => { if (e.key === 'Enter') this.send(input); });
    inputRow.append(input, sendBtn);
    layout.append(messages, inputRow);
    wrap.appendChild(layout);

    this.connectWS(messages);
    return wrap;
  },

  unmount() {
    if (this._ws) { this._ws.onclose = null; this._ws.close(); this._ws = null; }
  },

  connectWS(messagesEl) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws/chat`;
    try {
      this._ws = new WebSocket(url);
    } catch { return; }

    this._ws.onopen = () => { this._open = true; };
    this._ws.onclose = () => { this._open = false; };
    this._ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        const data = msg.data || {};
        if (msg.type === 'chat_response') {
          this.appendBubble(messagesEl, data.message || '', 'bot');
        } else if (msg.type === 'chat_typing') {
          this.appendBubble(messagesEl, '…', 'bot typing', 'typing-bubble');
        } else if (msg.type === 'error') {
          this.appendBubble(messagesEl, `Error: ${data.error || 'unknown'}`, 'bot');
        }
      } catch {}
    };
  },

  appendBubble(container, text, cls, id = null) {
    // Remove previous typing bubble
    const prev = id ? document.getElementById(id) : null;
    if (prev) prev.remove();

    const bubble = el('div', { class: `chat-bubble ${cls}` }, text);
    if (id) bubble.id = id;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  },

  send(input) {
    const text = input.value.trim();
    if (!text) return;
    const messages = document.getElementById('chat-messages');
    if (messages) this.appendBubble(messages, text, 'user');
    input.value = '';

    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ message: text }));
    } else {
      toast('Chat WebSocket not connected.', 'error');
    }
  },
};

/* =========================================================
   6. Router
   ========================================================= */

const VIEWS = {
  dashboard: DashboardView,
  pipeline:  PipelineView,
  runs:      RunsView,
  chat:      ChatView,
};

const TITLES = {
  dashboard: 'Dashboard',
  pipeline:  'Pipeline',
  runs:      'Run History',
  chat:      'Chat',
};

let _currentView = null;

function navigate(viewName) {
  if (!VIEWS[viewName]) return;

  // Unmount previous
  if (_currentView && _currentView.unmount) _currentView.unmount();

  // Update nav active
  $$('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.view === viewName);
  });

  // Update title
  const title = document.getElementById('page-title');
  if (title) title.textContent = TITLES[viewName] || viewName;

  // Render view
  const main = document.getElementById('main-content');
  main.innerHTML = '';
  _currentView = VIEWS[viewName];
  main.appendChild(_currentView.render());

  State.view = viewName;

  // On mobile close sidebar
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }
}

/* =========================================================
   7. Status Bar
   ========================================================= */

function setStatus(connected) {
  State.wsConnected = connected;
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  if (dot) {
    dot.className = 'status-dot ' + (connected ? 'online' : 'error');
  }
  if (label) label.textContent = connected ? 'Connected' : 'Reconnecting…';
}

/* =========================================================
   8. Bootstrap
   ========================================================= */

function init() {
  // Sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const mainWrapper = document.querySelector('.main-wrapper');
  const toggle = document.getElementById('sidebar-toggle');

  if (toggle) {
    toggle.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        sidebar.classList.toggle('open');
      } else {
        const collapsed = sidebar.classList.toggle('collapsed');
        mainWrapper.classList.toggle('expanded', collapsed);
      }
    });
  }

  // Nav links
  $$('.nav-item').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.dataset.view);
    });
  });

  // WebSocket setup
  WS.on('_connected', () => setStatus(true))
    .on('_disconnected', () => setStatus(false))
    .on('_error', () => setStatus(false));

  // Bubble log lines to State
  WS.on('log_line', (data) => {
    const text = data.line || data.message || JSON.stringify(data);
    const cls = data.level === 'ERROR' ? 'error'
      : data.level === 'WARNING' ? 'warn'
      : data.stage_change ? 'stage' : 'info';
    State.addLog(text, cls);
  });

  WS.on('stage_start', (data) => {
    State.addLog(`▶ Stage ${data.stage || ''} started: ${data.name || ''}`, 'stage');
  });
  WS.on('stage_complete', (data) => {
    State.addLog(`✓ Stage ${data.stage || ''} complete: ${data.name || ''}`, 'success');
  });
  WS.on('stage_fail', (data) => {
    State.addLog(`✗ Stage ${data.stage || ''} failed: ${data.error || ''}`, 'error');
  });
  WS.on('pipeline_started', (data) => {
    State.addLog(`🚀 Pipeline started — ${data.run_id || ''}`, 'stage');
    toast('Pipeline started!', 'success');
  });
  WS.on('pipeline_completed', (data) => {
    State.addLog(`🎉 Pipeline completed — ${data.run_id || ''}`, 'success');
    toast('Pipeline completed!', 'success', 5000);
  });
  WS.on('paper_ready', (data) => {
    State.addLog(`📄 Paper ready: ${data.path || ''}`, 'success');
    toast('📄 Paper ready!', 'success', 6000);
  });

  WS.connect();

  // Default view
  navigate('dashboard');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
