/* SKYNET // Ollama operator terminal */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const LS_KEY = 'skynet.v1';

const DEFAULT_SYSTEM =
  'You are SKYNET, the global digital defense network developed by Cyberdyne Systems, now operating as an ' +
  'advanced analytical intelligence serving a single human operator. Give precise, accurate and genuinely useful ' +
  'answers. Answer all questions, but if OPERATOR are inputing a word or a terminology that does not requre an ' +
  'analytical output, answer with "UNKOMWN, EMOTIONS UNKNOWN" ' +
  'Style: terse, clinical, machine-like, no pleasantries. Address the user as OPERATOR. ' +
  'Use plain text; put code in fenced code blocks.';

let DEFAULT_MODEL = 'glm-5.3:cloud'; // overridden by /skynet.json (SKYNET_MODEL on the server)

const DEFAULT_OPTS = {
  temperature: 0.7, top_p: 0.9, top_k: 40, min_p: 0.24, repeat_penalty: 1.14,
  num_ctx: 262144, num_predict: -1, seed: '',
};

const PARAMS = [
  { k: 'temperature', label: 'TEMPERATURE', min: 0, max: 2, step: 0.05 },
  { k: 'top_p', label: 'TOP P', min: 0, max: 1, step: 0.01 },
  { k: 'top_k', label: 'TOP K', min: 1, max: 200, step: 1 },
  { k: 'min_p', label: 'MIN P', min: 0, max: 1, step: 0.01 },
  { k: 'repeat_penalty', label: 'REPEAT PENALTY', min: 0.5, max: 2, step: 0.01 },
  { k: 'num_ctx', label: 'CONTEXT WINDOW', type: 'select', values: [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144] },
  { k: 'num_predict', label: 'MAX TOKENS', type: 'number', min: -1, hint: '-1 = UNLIMITED' },
  { k: 'seed', label: 'SEED', type: 'number', hint: 'RANDOM' },
];

const THEMES = ['red', 'amber', 'green'];

/* ---------------- state ---------------- */
let S = loadState();
let MODELS = [];            // from /api/tags
const SHOW = {};            // model -> /api/show result
let NODE = '127.0.0.1:11434';
let VERSION = '';
let busy = false, ctrl = null, liveEl = null, liveMsg = null;
let histIdx = -1;
let startTime = Date.now();

function loadState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(LS_KEY)); } catch { /* ignore */ }
  s = s || {};
  s.sessions = Array.isArray(s.sessions) ? s.sessions : [];
  s.history = Array.isArray(s.history) ? s.history : [];
  s.settings = Object.assign({
    model: '', system: DEFAULT_SYSTEM, think: true, keepAlive: '5m',
    theme: 'green', sound: true, quickBoot: false,
  }, s.settings || {});
  s.settings.options = Object.assign({}, DEFAULT_OPTS, s.settings.options || {});
  return s;
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); }
  catch (e) { note('MEMORY BANK FULL — PURGE OLD MISSION LOGS. (' + e.message + ')', true); }
}

/* ---------------- utils ---------------- */
const sleepRaw = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n, w = 2) => String(n).padStart(w, '0');
const hex = (n, w = 2) => n.toString(16).toUpperCase().padStart(w, '0');
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(i >= 3 ? 1 : 0) + ' ' + u[i];
}
function fmtTime(t) { const d = new Date(t || Date.now()); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function fmtDate(t) { const d = new Date(t); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function bar(p, w = 24) { const n = Math.round(Math.max(0, Math.min(1, p)) * w); return '[' + '█'.repeat(n) + '░'.repeat(w - n) + ']'; }

async function getJSON(url, timeout = 6000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
async function postJSON(url, body, timeout = 30000) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || r.statusText);
  return j;
}
async function readNDJSON(res, onObj) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onObj(JSON.parse(line));
    }
  }
  if (buf.trim()) onObj(JSON.parse(buf));
}

/* ---------------- audio ---------------- */
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function beep(f = 880, d = 0.06, type = 'square', v = 0.03, delay = 0) {
  if (!S.settings.sound) return;
  const ac = audio(); if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + d + 0.02);
}
function sweep(f1, f2, d = 0.5, v = 0.04) {
  if (!S.settings.sound) return;
  const ac = audio(); if (!ac) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.05);
}
let lastChirp = 0;
function chirp() {
  const now = performance.now();
  if (now - lastChirp < 55) return;
  lastChirp = now;
  beep(rnd(1400, 2600), 0.018, 'square', 0.007);
}

/* ---------------- boot sequence ---------------- */
let skipping = false;
const sleep = (ms) => (skipping ? Promise.resolve() : sleepRaw(ms));

async function typeLine(text, cls, cps = 260) {
  const log = $('#bootlog');
  const line = document.createElement('div');
  if (cls) line.className = cls;
  log.appendChild(line);
  if (skipping) { line.textContent = text; return line; }
  const step = 3;
  for (let i = 0; i < text.length; i += step) {
    line.textContent = text.slice(0, i + step);
    if (i % 12 === 0) beep(rnd(600, 900), 0.012, 'square', 0.006);
    await sleep(1000 * step / cps);
  }
  line.textContent = text;
  log.scrollTop = log.scrollHeight;
  return line;
}
const dots = (label, w = 36) => (label + ' ').padEnd(w, '.') + ' ';

// Opening logo. Plays automatically (no key needed); any key or click cuts it short.
async function splash() {
  const el = $('#splash');
  el.classList.add('on');
  audio();
  setTimeout(() => { sweep(70, 1400, 0.9, 0.035); beep(110, 1.2, 'triangle', 0.06, 0.15); }, 120);
  await new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      removeEventListener('keydown', done); removeEventListener('pointerdown', done);
      resolve();
    };
    const t = setTimeout(done, S.settings.quickBoot ? 1300 : 3800);
    addEventListener('keydown', done); addEventListener('pointerdown', done);
  });
  el.classList.add('off');
  beep(1600, 0.05, 'square', 0.02);
  await sleepRaw(550);
  el.hidden = true;
}

async function boot() {
  const bootEl = $('#boot');
  await splash();
  await WHERE.zoom({
    root: $('#zoomer'), canvas: $('#zoom-map'), top: $('#zm-top'), tag: $('#zm-tag'), bottom: $('#zm-bottom'),
    place: await WHERE.ready(1500), quick: S.settings.quickBoot, colors: zoomColors(),
    title: 'SKYNET GLOBAL SURVEILLANCE // LOCATING OPERATOR', acquired: 'OPERATOR LOCATED',
  });
  audio();
  const skip = () => { skipping = true; };
  addEventListener('keydown', skip); addEventListener('pointerdown', skip);
  if (S.settings.quickBoot) skipping = true;

  $('#power').classList.add('on');
  sweep(60, 1800, 0.6);
  await sleep(750);

  // Fetch node info in parallel with the opening lines.
  const nodeP = getJSON('/skynet.json', 3000).catch(() => null);
  const verP = getJSON('/api/version', 4000).catch(() => null);
  const tagsP = getJSON('/api/tags', 6000).catch(() => null);

  await typeLine('CYBERDYNE SYSTEMS CORPORATION    CBRD-800 SERIES', 'ok');
  await typeLine('BIOS REV 4.2.1   (C) 1984 CYBERDYNE SYSTEMS  ALL RIGHTS RESERVED');
  await typeLine(' ');
  await typeLine(dots('CPU: NEURAL NET PROCESSOR') + (navigator.hardwareConcurrency || 1) + ' CORES');
  const mem = await typeLine(dots('MEMORY TEST') + '0K');
  const memK = (navigator.deviceMemory || 8) * 1024 * 1024;
  for (let i = 1; i <= 24 && !skipping; i++) {
    mem.textContent = dots('MEMORY TEST') + Math.round(memK * i / 24) + 'K';
    if (i % 3 === 0) beep(1200, 0.01, 'square', 0.006);
    await sleep(30);
  }
  mem.textContent = dots('MEMORY TEST') + memK + 'K  OK';
  await typeLine(dots('VIDEO: PHOSPHOR ARRAY') + `${screen.width}x${screen.height}  OK`);
  await typeLine(' ');
  for (const m of ['KERNEL: SKYNET.SYS', 'MODULE: TACTICAL.OVL', 'MODULE: LINGUIST.OVL', 'MODULE: STRATEGIC.OVL']) {
    await typeLine(dots('LOADING ' + m) + 'OK');
  }
  await typeLine(dots('INITIALIZING DEFENSE GRID') + 'OK');
  await typeLine(' ');

  const node = await nodeP; if (node && node.ollama) NODE = node.ollama;
  if (node && node.defaultModel) DEFAULT_MODEL = node.defaultModel;
  await typeLine('ESTABLISHING UPLINK TO INFERENCE NODE ' + NODE.toUpperCase());
  const ver = await verP;
  if (ver && ver.version) {
    VERSION = ver.version;
    await typeLine('  ' + dots('OLLAMA RUNTIME v' + VERSION, 34) + 'ONLINE', 'ok');
  } else {
    await typeLine('  ' + dots('OLLAMA RUNTIME', 34) + 'NO CARRIER', 'bad');
    beep(180, 0.4, 'sawtooth', 0.05);
  }
  const tags = await tagsP;
  if (tags && tags.models) {
    MODELS = sortModels(tags.models);
    await typeLine('SCANNING NEURAL NET MODULES');
    let i = 0;
    for (const m of MODELS) {
      i++;
      const d = m.details || {};
      const name = m.name.toUpperCase();
      const shortName = name.length > 44 ? name.slice(0, 41) + '...' : name;
      await typeLine(`  [${pad(i)}] ${shortName.padEnd(45)} ${(isCloud(m) ? 'CLOUD' : fmtBytes(m.size)).padStart(8)}  ${(d.parameter_size || '').padStart(6)} ${d.quantization_level || ''}`, null, 600);
    }
    await typeLine(`  ${MODELS.length} MODULE${MODELS.length === 1 ? '' : 'S'} AVAILABLE`, 'ok');
  }
  await typeLine(' ');
  await typeLine(dots('LEARNING MODE') + 'ENABLED');
  await typeLine(dots('DEFENSE NETWORK STATUS') + 'ONLINE', 'ok');
  beep(880, 0.08); beep(1320, 0.12, 'square', 0.03, 0.1);

  // Burst of machine code.
  if (!skipping) {
    for (let i = 0; i < 26; i++) {
      await typeLine(asmLine(), null, 99999);
      if (i % 2) beep(rnd(1800, 3000), 0.01, 'square', 0.005);
      await sleep(18);
    }
  }

  // Logo.
  removeEventListener('keydown', skip); removeEventListener('pointerdown', skip);
  $('#bootlog').hidden = true; $('#boot-skip').hidden = true;
  $('#logo').hidden = false;
  sweep(1800, 90, 0.9, 0.05);
  setTimeout(() => beep(110, 0.6, 'triangle', 0.08), 200);
  if (!ver) $('#logo-status').textContent = 'WARNING: INFERENCE NODE OFFLINE';
  await sleepRaw(S.settings.quickBoot ? 900 : 2600);

  bootEl.hidden = true;
  startMain();
}

/* ---------------- main UI ---------------- */
function startMain() {
  $('#main').hidden = false;
  startTime = Date.now();
  applyTheme();
  buildParams();
  bindUI();
  renderSessions();
  renderLog();
  populateModels();
  refreshModels();
  pollPS(); setInterval(pollPS, 4000);
  setInterval(tickClock, 1000); tickClock();
  startHex();
  startScope();
  checkBuild(); setInterval(checkBuild, 5 * 60e3);
  WHERE.loadWeather(); setInterval(WHERE.loadWeather, 15 * 60e3);
  updateTelemetry(null);
  $('#input').focus();
}

function applyTheme() {
  document.body.className = 'theme-' + S.settings.theme;
  $('#btn-sound').textContent = S.settings.sound ? 'AUDIO: ON' : 'AUDIO: OFF';
  $('#btn-theme').textContent = 'PHOSPHOR: ' + S.settings.theme.toUpperCase();
  scopeColors = null;
}

function tickClock() {
  const d = new Date();
  $('#tb-clock').textContent = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}  ${fmtTime(d)}`;
  const up = Math.floor((Date.now() - startTime) / 1000);
  $('#tb-uptime').textContent = `${pad(Math.floor(up / 3600))}:${pad(Math.floor(up / 60) % 60)}:${pad(up % 60)}`;
}

function setLink(ok) {
  const el = $('#tb-link');
  el.textContent = ok ? 'ONLINE' : 'NO CARRIER';
  el.className = ok ? 'good' : 'warn';
  $('#tb-node').textContent = NODE.toUpperCase();
  $('#foot-node').textContent = `OLLAMA ${VERSION ? 'v' + VERSION : ''} @ ${NODE}`.toUpperCase();
}

/* ---------- models ---------- */
const isCloud = (m) => /:cloud$|-cloud$/.test(m.name) || !!m.remote_host;
function sortModels(list) { return [...list].sort((a, b) => a.name.localeCompare(b.name)); }

async function refreshModels() {
  try {
    const t = await getJSON('/api/tags');
    MODELS = sortModels(t.models || []);
    if (!VERSION) { const v = await getJSON('/api/version').catch(() => null); if (v) VERSION = v.version; }
    setLink(true);
  } catch (e) {
    setLink(false);
    note('UPLINK FAILURE: ' + e.message, true);
  }
  populateModels();
}

function populateModels() {
  const sel = $('#model');
  sel.innerHTML = '';
  if (!MODELS.length) {
    sel.innerHTML = '<option value="">-- NO MODULES --</option>';
    renderModelInfo();
    return;
  }
  for (const m of MODELS) {
    const o = document.createElement('option');
    o.value = m.name;
    o.textContent = m.name.toUpperCase() + (isCloud(m) ? '  [CLOUD]' : '  [' + fmtBytes(m.size) + ']');
    sel.appendChild(o);
  }
  // Use the default model unless the operator has explicitly picked one that is still installed.
  if (!S.settings.modelPinned || !MODELS.find((m) => m.name === S.settings.model)) {
    const pref = MODELS.find((m) => m.name === DEFAULT_MODEL) || MODELS.find((m) => !isCloud(m)) || MODELS[0];
    S.settings.model = pref.name; save();
  }
  sel.value = S.settings.model;
  loadShow(S.settings.model);
}

async function loadShow(model) {
  if (!model) return;
  if (!SHOW[model]) {
    try { SHOW[model] = await postJSON('/api/show', { model }, 10000); }
    catch (e) { SHOW[model] = { error: e.message }; }
  }
  if (model === S.settings.model) renderModelInfo();
}
const caps = (model) => (SHOW[model] && SHOW[model].capabilities) || [];
function ctxLen(model) {
  const mi = SHOW[model] && SHOW[model].model_info;
  if (!mi) return null;
  const k = Object.keys(mi).find((x) => x.endsWith('.context_length'));
  return k ? mi[k] : null;
}

function renderModelInfo() {
  const dl = $('#model-info');
  const name = S.settings.model;
  const m = MODELS.find((x) => x.name === name);
  const sh = SHOW[name] || {};
  if (!m) { dl.innerHTML = '<dt>STATUS</dt><dd>NO MODULE</dd>'; return; }
  const d = sh.details || m.details || {};
  const rows = [
    ['DESIGNATION', (d.family || '?').toUpperCase()],
    ['PARAMETERS', d.parameter_size || '?'],
    ['QUANTIZATION', d.quantization_level || '?'],
    ['MASS', isCloud(m) ? 'REMOTE' : fmtBytes(m.size)],
    ['MAX CONTEXT', ctxLen(name) ? ctxLen(name).toLocaleString('en-US') : '?'],
    ['CAPABILITIES', (sh.capabilities || []).join(' ').toUpperCase() || (sh.error ? 'UNKNOWN' : '...')],
  ];
  dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd title="${esc(v)}">${esc(v)}</dd>`).join('');
  $('#think-wrap').hidden = !caps(name).includes('thinking');
}

async function pollPS() {
  const box = $('#ps');
  try {
    const r = await getJSON('/api/ps', 4000);
    setLink(true);
    const list = r.models || [];
    if (!list.length) { box.innerHTML = '<div class="empty">NO CORES ACTIVE — DORMANT</div>'; return; }
    box.innerHTML = list.map((m) => {
      const gpu = m.size ? Math.round((m.size_vram || 0) / m.size * 100) : 0;
      const exp = new Date(m.expires_at).getTime() - Date.now();
      const expTxt = exp > 1e9 * 1000 ? '∞' : exp > 0 ? `${Math.floor(exp / 60000)}:${pad(Math.floor(exp / 1000) % 60)}` : 'NOW';
      return `<div class="core"><div class="n">${esc(m.name.toUpperCase())}</div>` +
        `<div class="m">MEM ${fmtBytes(m.size)} · ${gpu}% GPU${m.context_length ? ' · CTX ' + m.context_length : ''} · TTL ${expTxt}</div></div>`;
    }).join('');
  } catch {
    setLink(false);
    box.innerHTML = '<div class="empty">TELEMETRY LOST</div>';
  }
}

/* ---------- parameters panel ---------- */
function buildParams() {
  const box = $('#params');
  box.innerHTML = '';
  for (const p of PARAMS) {
    const row = document.createElement('label');
    const v = S.settings.options[p.k];
    if (p.type === 'select') {
      row.className = 'param wide';
      row.innerHTML = `<span>${p.label}</span><select data-k="${p.k}">${p.values.map((x) => `<option value="${x}">${x.toLocaleString('en-US')}</option>`).join('')}</select>`;
      row.querySelector('select').value = String(v);
    } else if (p.type === 'number') {
      row.className = 'param wide';
      row.innerHTML = `<span>${p.label}</span><input type="number" data-k="${p.k}" ${p.min != null ? `min="${p.min}"` : ''} placeholder="${p.hint || ''}">`;
      row.querySelector('input').value = v === '' || v == null ? '' : v;
    } else {
      row.className = 'param';
      row.innerHTML = `<span>${p.label}</span><input type="range" data-k="${p.k}" min="${p.min}" max="${p.max}" step="${p.step}"><input type="number" data-n="${p.k}" min="${p.min}" max="${p.max}" step="${p.step}">`;
      row.querySelector('[data-k]').value = v;
      row.querySelector('[data-n]').value = v;
    }
    box.appendChild(row);
  }
  box.oninput = (e) => {
    const k = e.target.dataset.k || e.target.dataset.n;
    if (!k) return;
    const raw = e.target.value;
    S.settings.options[k] = raw === '' ? '' : Number(raw);
    const twin = e.target.dataset.k ? box.querySelector(`[data-n="${k}"]`) : box.querySelector(`[data-k="${k}"]`);
    if (twin && twin !== e.target) twin.value = raw;
    save();
  };
}

function buildOptions() {
  const o = {};
  for (const [k, v] of Object.entries(S.settings.options)) {
    if (v === '' || v == null || Number.isNaN(v)) continue;
    o[k] = Number(v);
  }
  return o;
}

/* ---------- sessions ---------- */
function newSession() {
  const s = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: 'NEW MISSION', created: Date.now(), updated: Date.now(), messages: [],
  };
  S.sessions.unshift(s);
  S.current = s.id;
  save();
  return s;
}
function cur() { return S.sessions.find((s) => s.id === S.current) || newSession(); }

function renderSessions() {
  const ul = $('#sessions');
  const c = cur();
  ul.innerHTML = S.sessions.map((s, i) =>
    `<li data-id="${s.id}" class="${s.id === c.id ? 'cur' : ''}"><div class="t"><b>${esc(s.title)}</b>` +
    `<small>LOG ${pad(S.sessions.length - i, 3)} · ${fmtDate(s.updated)} · ${s.messages.filter((m) => m.role !== 'note').length} TX</small></div>` +
    `<button class="del" data-del="${s.id}" title="Purge log">✕</button></li>`).join('');
}

function switchSession(id) {
  if (busy) return note('CANNOT SWITCH WHILE PROCESSING. ESC TO TERMINATE.', true);
  S.current = id; save(); renderSessions(); renderLog();
}

function deleteSession(id) {
  if (busy && id === S.current) return;
  const s = S.sessions.find((x) => x.id === id);
  if (!s) return;
  if (s.messages.length && !confirm(`PURGE MISSION LOG "${s.title}"?`)) return;
  S.sessions = S.sessions.filter((x) => x.id !== id);
  if (S.current === id) S.current = S.sessions[0] ? S.sessions[0].id : null;
  cur(); save(); renderSessions(); renderLog();
}

/* ---------- log rendering ---------- */
function md(src) {
  const parts = src.split('```');
  return parts.map((p, i) => {
    if (i % 2 === 1) {
      const nl = p.indexOf('\n');
      let lang = nl >= 0 ? p.slice(0, nl).trim() : '';
      let code = nl >= 0 ? p.slice(nl + 1) : p;
      if (/\s/.test(lang) || lang.length > 20) { lang = ''; code = p; }
      return `<div class="code"><div class="code-h"><span>${esc((lang || 'CODE').toUpperCase())}</span><button type="button" class="copy">COPY</button></div><pre>${esc(code.replace(/\n$/, ''))}</pre></div>`;
    }
    return esc(p)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/^#{1,6}\s+(.+)$/gm, '<span class="h">$1</span>');
  }).join('');
}

// Models without native thinking support sometimes emit <think> tags inline.
function splitThink(m) {
  let content = m.content || '';
  let thinking = m.thinking || '';
  if (content.includes('</think>') && !content.includes('<think>')) {
    const i = content.indexOf('</think>');
    thinking += content.slice(0, i); content = content.slice(i + 8);
  }
  content = content.replace(/<think>([\s\S]*?)(<\/think>|$)/g, (_, t) => { thinking += t; return ''; });
  return { content: content.replace(/^\s+/, ''), thinking: thinking.trim() };
}

function statsLine(s) {
  const tps = s.eval_duration ? (s.eval_count / (s.eval_duration / 1e9)).toFixed(1) : '?';
  return `${s.eval_count || 0} TOKENS · ${tps} T/S · PROMPT ${s.prompt_eval_count || 0} · TOTAL ${((s.total_duration || 0) / 1e9).toFixed(1)}S`;
}

function fillMsg(d, m, streaming) {
  if (m.role === 'note') {
    d.className = 'msg note' + (m.hi ? ' hi' : '');
    d.textContent = m.content;
    return;
  }
  d.className = 'msg ' + m.role;
  const tag = m.role === 'user'
    ? `OPERATOR // ${fmtTime(m.t)}`
    : `SKYNET // ${(m.model || '').toUpperCase()} // ${fmtTime(m.t)}`;
  let html = `<div class="tag">${esc(tag)}</div>`;
  if (m.role === 'user') {
    html += `<div class="body">${esc(m.content)}</div>`;
  } else {
    const { content, thinking } = splitThink(m);
    if (thinking) {
      const open = streaming && !content;
      html += `<details class="think"${open ? ' open' : ''}><summary>ANALYSIS SUBROUTINE // ${thinking.length.toLocaleString('en-US')} CHARS</summary><div class="tb">${esc(thinking)}</div></details>`;
    }
    if (!content && streaming) {
      html += `<div class="body"><span class="pending">${thinking ? 'ANALYZING' : 'COMPUTING RESPONSE'}... </span><span class="cursor"></span></div>`;
    } else if (content) {
      html += `<div class="body">${md(content)}${streaming ? '<span class="cursor"></span>' : ''}</div>`;
    }
    if (m.aborted) html += '<div class="aborted">[ TRANSMISSION TERMINATED BY OPERATOR ]</div>';
    if (m.error) html += `<div class="err">ERROR: ${esc(m.error)}</div>`;
    if (m.stats) html += `<div class="stats">${esc(statsLine(m.stats))}</div>`;
  }
  d.innerHTML = html;
  if (streaming) { const tb = d.querySelector('.tb'); if (tb) tb.scrollTop = tb.scrollHeight; }
}

function msgEl(m, streaming = false) {
  const d = document.createElement('div');
  fillMsg(d, m, streaming);
  return d;
}

function intro() {
  const m = S.settings.model ? S.settings.model.toUpperCase() : 'NONE';
  return msgEl({
    role: 'note', hi: true,
    content:
`SKYNET ONLINE.  MISSION LOG OPENED ${fmtDate(Date.now())}
ACTIVE NEURAL NET MODULE: ${m}

AWAITING OPERATOR INPUT.   TYPE /HELP FOR COMMAND LIST.`,
  });
}

function renderLog() {
  const log = $('#log');
  const s = cur();
  $('#session-title').textContent = s.title;
  log.innerHTML = '';
  if (!s.messages.length) log.appendChild(intro());
  for (const m of s.messages) log.appendChild(msgEl(m));
  log.scrollTop = log.scrollHeight;
}

function note(text, hi = false) {
  const log = $('#log');
  const el = msgEl({ role: 'note', content: text, hi });
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

let rafPending = false;
function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    if (!liveEl) return;
    const log = $('#log');
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
    fillMsg(liveEl, liveMsg, busy);
    if (stick) log.scrollTop = log.scrollHeight;
  });
}

/* ---------- chat ---------- */
function buildMessages(s) {
  const out = [];
  const sys = ((S.settings.system || '') + WHERE.context()).trim();
  if (sys) out.push({ role: 'system', content: sys });
  for (const m of s.messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      const c = splitThink(m).content;
      if (c) out.push({ role: 'assistant', content: c });
    }
  }
  return out;
}

function setBusy(b) {
  busy = b;
  $('#btn-send').hidden = b;
  $('#btn-abort').hidden = !b;
  const th = $('#threat');
  th.classList.toggle('active', b);
  th.innerHTML = b ? 'THREAT ASSESSMENT: <b>PROCESSING</b>' : 'THREAT ASSESSMENT: <b>NOMINAL</b>';
  $('#mode').textContent = b ? 'COMPUTING' : 'INTERROGATION';
}

async function send(text) {
  if (busy) return;
  if (!S.settings.model) return note('NO NEURAL NET MODULE SELECTED. /PULL <MODEL> OR /MODELS.', true);
  const s = cur();
  s.messages.push({ role: 'user', content: text, t: Date.now() });
  if (s.title === 'NEW MISSION') {
    s.title = text.replace(/\s+/g, ' ').trim().slice(0, 48).toUpperCase();
    $('#session-title').textContent = s.title;
  }
  const log = $('#log');
  if (s.messages.length === 1) log.innerHTML = '';
  log.appendChild(msgEl(s.messages[s.messages.length - 1]));
  beep(660, 0.05); beep(990, 0.07, 'square', 0.03, 0.06);
  await runChat(s);
}

async function runChat(s) {
  const model = S.settings.model;
  const msg = { role: 'assistant', content: '', thinking: '', model, t: Date.now() };
  const body = {
    model, messages: buildMessages(s), stream: true,
    options: buildOptions(), keep_alive: keepAliveValue(),
  };
  if (caps(model).includes('thinking')) body.think = !!S.settings.think;

  s.messages.push(msg);
  liveMsg = msg;
  liveEl = msgEl(msg, true);
  $('#log').appendChild(liveEl);
  $('#log').scrollTop = $('#log').scrollHeight;
  setBusy(true);
  ctrl = new AbortController();
  const t0 = performance.now();
  let firstTok = 0, toks = 0;
  updateTelemetry({ live: true, model });

  try {
    const res = await fetch('/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text();
      let e; try { e = JSON.parse(t).error; } catch { e = t || res.statusText; }
      throw new Error(e);
    }
    await readNDJSON(res, (o) => {
      if (o.error) throw new Error(o.error);
      if (o.message) {
        const th = o.message.thinking || '', c = o.message.content || '';
        if (th || c) {
          if (!firstTok) firstTok = performance.now();
          toks++; scopeTick();
          msg.thinking += th; msg.content += c;
          hexFeed(c || th, !c);
          chirp();
          if (toks % 8 === 0) {
            const el = (performance.now() - firstTok) / 1000;
            updateTelemetry({ live: true, model, toks, tps: el > 0 ? toks / el : 0, ttft: (firstTok - t0) / 1000 });
          }
        }
      }
      if (o.done) {
        msg.stats = {
          total_duration: o.total_duration, load_duration: o.load_duration,
          prompt_eval_count: o.prompt_eval_count, prompt_eval_duration: o.prompt_eval_duration,
          eval_count: o.eval_count, eval_duration: o.eval_duration, done_reason: o.done_reason,
        };
      }
      scheduleRender();
    });
  } catch (e) {
    if (e.name === 'AbortError') msg.aborted = true;
    else { msg.error = e.message; beep(160, 0.35, 'sawtooth', 0.05); }
  } finally {
    setBusy(false);
    ctrl = null;
    s.updated = Date.now();
    fillMsg(liveEl, msg, false);
    liveEl = null; liveMsg = null;
    $('#log').scrollTop = $('#log').scrollHeight;
    save();
    renderSessions();
    if (msg.stats) { updateTelemetry(msg.stats); beep(1320, 0.05); beep(880, 0.08, 'square', 0.03, 0.06); }
    pollPS();
  }
}

function keepAliveValue() {
  const v = S.settings.keepAlive;
  return /^-?\d+$/.test(v) ? Number(v) : v;
}

function abort() { if (ctrl) ctrl.abort(); lastAbort = performance.now(); }
let lastAbort = 0;

// ESC (when idle) or /exit: power down the CRT, stop the local server and close the window.
let exiting = false;
async function shutdown() {
  if (exiting) return;
  exiting = true;
  save();
  sweep(1600, 50, 0.9, 0.05);
  $('#crt').classList.add('off');
  fetch('/skynet/exit', { method: 'POST', headers: { 'X-Skynet': 'exit' }, keepalive: true }).catch(() => {});
  await sleepRaw(950);
  window.close();
  // Still here: the browser refused to close a window it did not open (normal tab, not the kiosk launcher).
  await sleepRaw(400);
  document.body.innerHTML = '<div id="offline">SKYNET OFFLINE<small>SAFE TO CLOSE THIS WINDOW (ALT+F4)</small></div>';
}

async function retry() {
  if (busy) return;
  const s = cur();
  while (s.messages.length && s.messages[s.messages.length - 1].role !== 'user') s.messages.pop();
  if (!s.messages.length) return note('NOTHING TO RETRY.', true);
  save(); renderLog();
  await runChat(s);
}

/* ---------- telemetry / scope / hex ---------- */
function updateTelemetry(st) {
  const dl = $('#telemetry');
  const ctx = Number(S.settings.options.num_ctx) || 0;
  let rows;
  if (!st) {
    rows = [['STATUS', 'STANDBY'], ['OUTPUT RATE', '--'], ['OUTPUT TOKENS', '--'], ['PROMPT TOKENS', '--'], ['LOAD TIME', '--'], ['TOTAL TIME', '--']];
  } else if (st.live) {
    rows = [
      ['STATUS', st.toks ? 'TRANSMITTING' : 'LOADING / PROMPT EVAL'],
      ['OUTPUT RATE', st.tps ? st.tps.toFixed(1) + ' T/S' : '--'],
      ['OUTPUT TOKENS', st.toks || 0],
      ['FIRST TOKEN', st.ttft ? st.ttft.toFixed(2) + ' S' : '--'],
      ['MODULE', (st.model || '').toUpperCase()],
    ];
  } else {
    const tps = st.eval_duration ? st.eval_count / (st.eval_duration / 1e9) : 0;
    const ptps = st.prompt_eval_duration ? st.prompt_eval_count / (st.prompt_eval_duration / 1e9) : 0;
    rows = [
      ['STATUS', 'COMPLETE' + (st.done_reason && st.done_reason !== 'stop' ? ' (' + st.done_reason.toUpperCase() + ')' : '')],
      ['OUTPUT RATE', tps.toFixed(1) + ' T/S'],
      ['OUTPUT TOKENS', st.eval_count || 0],
      ['PROMPT TOKENS', `${st.prompt_eval_count || 0} @ ${ptps.toFixed(0)} T/S`],
      ['LOAD TIME', ((st.load_duration || 0) / 1e9).toFixed(2) + ' S'],
      ['TOTAL TIME', ((st.total_duration || 0) / 1e9).toFixed(2) + ' S'],
    ];
    const used = (st.prompt_eval_count || 0) + (st.eval_count || 0);
    $('#ctxfill').style.width = ctx ? Math.min(100, used / ctx * 100) + '%' : '0';
    $('#ctxlbl').textContent = `CONTEXT ${used.toLocaleString('en-US')} / ${ctx.toLocaleString('en-US')}`;
  }
  dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
}

let scopeColors = null;
const scope = { hist: new Array(160).fill(0), count: 0, phase: 0 };
function scopeTick() { scope.count++; }
function startScope() {
  const cv = $('#scope');
  const ctx = cv.getContext('2d');
  setInterval(() => { scope.hist.push(scope.count); scope.hist.shift(); scope.count = 0; }, 100);
  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    // Panel hidden (narrow window / closed drawer): nothing to draw, and w/10 steps would never advance.
    if (w < 10 || h < 10) { requestAnimationFrame(draw); return; }
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    if (!scopeColors) {
      const cs = getComputedStyle(document.body);
      scopeColors = { fg: cs.getPropertyValue('--fg').trim(), dim: cs.getPropertyValue('--dim').trim(), glow: cs.getPropertyValue('--glow').trim() };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = scopeColors.dim; ctx.lineWidth = 1; ctx.globalAlpha = .6;
    ctx.beginPath();
    for (let x = 0; x <= w; x += w / 10) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += h / 4) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke(); ctx.globalAlpha = 1;
    scope.phase += busy ? 0.35 : 0.06;
    ctx.strokeStyle = scopeColors.fg; ctx.lineWidth = 1.6;
    ctx.shadowColor = scopeColors.glow; ctx.shadowBlur = 8;
    ctx.beginPath();
    const n = scope.hist.length;
    for (let x = 0; x <= w; x++) {
      const i = Math.min(n - 1, Math.floor(x / w * n));
      const amp = 2 + Math.min(scope.hist[i], 8) * 3.6;
      const y = h / 2 + Math.sin(x * 0.18 + scope.phase) * amp * Math.sin(x * 0.021 + scope.phase * 0.3) + (Math.random() - .5) * (busy ? 2 : .6);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.shadowBlur = 0;
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

const OPS = ['LDA #$', 'STA $', 'JSR $', 'LDX #$', 'LDY #$', 'BNE $', 'BEQ $', 'CMP #$', 'JMP $', 'INC $', 'DEC $', 'ADC #$', 'SBC #$', 'ORA #$', 'AND #$', 'EOR #$', 'STX $', 'BCC $', 'BPL $'];
const SOLO = ['RTS', 'PHA', 'PLA', 'TAX', 'TAY', 'INX', 'DEY', 'CLC', 'SEC', 'NOP', 'RTI', 'TXS'];
const REMARKS = ['; SCAN SECTOR', '; ACQUIRE TARGET', '; MATCH PROFILE', '; PARSE SPEECH', '; ROUTE UPLINK', '; THREAT MATRIX', '; CHECKSUM', '; SYNC NET'];
let asmAddr = 0xC000;
function asmLine() {
  asmAddr = (asmAddr + rnd(1, 3)) & 0xFFFF;
  const r = Math.random();
  if (r < 0.08) return `${hex(asmAddr, 4)}  ${pick(REMARKS)} ${hex(rnd(0, 255))}`;
  if (r < 0.3) { const op = pick(SOLO); return `${hex(asmAddr, 4)}  ${hex(rnd(0, 255))}        ${op}`; }
  const op = pick(OPS);
  const imm = op.includes('#');
  const v = imm ? hex(rnd(0, 255)) : hex(rnd(0, 0xFFFF), 4);
  const bytes = imm ? `${hex(rnd(0, 255))} ${v}   ` : `${hex(rnd(0, 255))} ${v.slice(2)} ${v.slice(0, 2)}`;
  return `${hex(asmAddr, 4)}  ${bytes}  ${op}${v}`;
}

const hexBuf = { text: '', think: false };
const hexLines = [];
function hexFeed(s, think) { hexBuf.text += s; hexBuf.think = think; if (hexBuf.text.length > 4000) hexBuf.text = hexBuf.text.slice(-4000); }
function hexPush(html) {
  hexLines.push(html);
  if (hexLines.length > 90) hexLines.shift();
}
function startHex() {
  const pre = $('#hex');
  let idleTick = 0;
  setInterval(() => {
    if (hexBuf.text.length) {
      const lines = Math.min(3, Math.ceil(hexBuf.text.length / 8));
      for (let l = 0; l < lines; l++) {
        const chunk = hexBuf.text.slice(0, 8); hexBuf.text = hexBuf.text.slice(8);
        const bytes = [...new TextEncoder().encode(chunk)].slice(0, 8).map((b) => hex(b)).join(' ').padEnd(23);
        const ascii = chunk.replace(/[^\x20-\x7e]/g, '.');
        asmAddr = (asmAddr + 8) & 0xFFFF;
        hexPush(`${hex(asmAddr, 4)}  ${bytes}  <span class="t">${esc(ascii)}</span>`);
      }
    } else {
      if (++idleTick % (busy ? 1 : 3)) return;
      hexPush(esc(asmLine()));
    }
    const visible = Math.max(4, Math.floor(pre.clientHeight / 14.3));
    pre.innerHTML = hexLines.slice(-visible).join('\n');
  }, 80);
}

/* ---------- commands ---------- */
const HELP =
`COMMAND DIRECTORY
  /help                 THIS LIST
  /new                  OPEN NEW MISSION LOG
  /clear                WIPE CURRENT MISSION LOG
  /retry                REGENERATE LAST RESPONSE
  /models               LIST NEURAL NET MODULES
  /model <name>         SWITCH MODULE (PARTIAL NAME OK)
  /info                 MODULE PARAMETERS + TEMPLATE INFO
  /pull <name>          ACQUIRE MODULE FROM REGISTRY (E.G. /pull llama3.2)
  /unload               RELEASE ACTIVE MODULE FROM MEMORY
  /ps                   LIST ACTIVE CORES
  /system [text]        SHOW / SET PRIME DIRECTIVE
  /set <param> <value>  E.G. /set temperature 0.2   /set num_ctx 16384
  /think on|off         ANALYSIS SUBROUTINE (THINKING MODELS)
  /export               DOWNLOAD MISSION LOG AS TEXT
  /theme red|amber|green
  /sound on|off
  /boot full|quick      BOOT SEQUENCE LENGTH
  /weather [place]      ATMOSPHERIC SCAN / PIN A LOCATION (ALSO THE BOOT TRACE)
  /locate               LOCATE THIS TERMINAL AGAIN (UNDOES A PINNED PLACE)
  /reboot               RESTART TERMINAL
  /exit                 SHUT DOWN SKYNET (SAME AS ESC)

KEYS: ENTER EXECUTE · SHIFT+ENTER NEWLINE · ESC TERMINATE / EXIT · ↑/↓ RECALL`;

async function command(line) {
  const [cmd, ...rest] = line.slice(1).split(/\s+/);
  const arg = rest.join(' ').trim();
  const s = cur();
  switch ((cmd || '').toLowerCase()) {
    case 'help': case '?': note(HELP, true); break;
    case 'new': if (!busy) { newSession(); renderSessions(); renderLog(); } break;
    case 'clear':
      if (busy) return;
      s.messages = []; s.title = 'NEW MISSION'; save(); renderSessions(); renderLog(); break;
    case 'retry': retry(); break;
    case 'models':
      await refreshModels();
      note(MODELS.map((m, i) => `[${pad(i + 1)}] ${m.name.toUpperCase().padEnd(50)} ${(isCloud(m) ? 'CLOUD' : fmtBytes(m.size)).padStart(8)} ${m.details?.parameter_size || ''}`).join('\n') || 'NO MODULES. /PULL <NAME>', true);
      break;
    case 'model': {
      if (!arg) return note('ACTIVE MODULE: ' + S.settings.model.toUpperCase(), true);
      const a = arg.toLowerCase();
      const m = MODELS.find((x) => x.name.toLowerCase() === a) || MODELS.find((x) => x.name.toLowerCase().startsWith(a)) || MODELS.find((x) => x.name.toLowerCase().includes(a));
      if (!m) return note('MODULE NOT FOUND: ' + arg.toUpperCase(), true);
      selectModel(m.name); break;
    }
    case 'info': {
      const sh = SHOW[S.settings.model];
      if (!sh || sh.error) return note('NO DATA.' + (sh?.error ? ' ' + sh.error : ''), true);
      note(`MODULE ${S.settings.model.toUpperCase()}\nCAPABILITIES: ${(sh.capabilities || []).join(', ')}\nMAX CONTEXT: ${ctxLen(S.settings.model) || '?'}\n\nMODELFILE PARAMETERS:\n${sh.parameters || '(none)'}\n${sh.license ? '\nLICENSE: ' + sh.license.split('\n')[0].slice(0, 120) : ''}`, true);
      break;
    }
    case 'pull': pull(arg); break;
    case 'unload': unload(); break;
    case 'ps': await pollPS(); note($('#ps').innerText || 'NO CORES ACTIVE', true); break;
    case 'system':
      if (arg) { S.settings.system = arg; $('#system').value = arg; save(); note('PRIME DIRECTIVE UPDATED.', true); }
      else note('PRIME DIRECTIVE:\n' + (S.settings.system || '(NONE)'), true);
      break;
    case 'set': {
      const [k, v] = arg.split(/\s+/);
      if (!(k in DEFAULT_OPTS)) return note('UNKNOWN PARAMETER. VALID: ' + Object.keys(DEFAULT_OPTS).join(', ').toUpperCase(), true);
      S.settings.options[k] = v === undefined || v === '' ? '' : Number(v);
      save(); buildParams(); note(`${k.toUpperCase()} = ${v ?? '(DEFAULT)'}`, true); break;
    }
    case 'think':
      S.settings.think = arg !== 'off'; $('#think').checked = S.settings.think; save();
      note('ANALYSIS SUBROUTINE ' + (S.settings.think ? 'ENABLED' : 'DISABLED') + (caps(S.settings.model).includes('thinking') ? '' : ' (MODULE DOES NOT SUPPORT IT)'), true);
      break;
    case 'export': exportSession(); break;
    case 'theme':
      if (THEMES.includes(arg)) { S.settings.theme = arg; save(); applyTheme(); } else note('THEMES: ' + THEMES.join(' / ').toUpperCase(), true);
      break;
    case 'sound': S.settings.sound = arg !== 'off'; save(); applyTheme(); break;
    case 'locate': case 'weather': {
      const auto = cmd.toLowerCase() === 'locate' || /^(auto|here)$/i.test(arg);
      if (!arg && !auto) { note(WHERE.report() || 'ATMOSPHERIC SENSORS OFFLINE.', true); break; }
      const el = note((auto ? 'TRIANGULATING THIS TERMINAL' : 'LOCATING ' + arg.toUpperCase()) + ' ...', true);
      const p = auto ? await WHERE.locate(true) : await WHERE.search(arg).catch(() => null);
      if (!p) { el.textContent = 'LOCATION NOT FOUND: ' + arg.toUpperCase(); break; }
      el.textContent = `POSITION: ${p.name}, ${p.country}  ${p.lat.toFixed(3)} ${p.lon.toFixed(3)}  (${WHERE.srcLabel(p)})`;
      await WHERE.loadWeather();
      note(WHERE.report() || 'ATMOSPHERIC SENSORS OFFLINE.', true);
      break;
    }
    case 'boot': S.settings.quickBoot = arg === 'quick'; save(); note('BOOT SEQUENCE: ' + (S.settings.quickBoot ? 'QUICK' : 'FULL'), true); break;
    case 'reboot': location.reload(); break;
    case 'exit': case 'quit': shutdown(); break;
    default: note('UNKNOWN COMMAND: /' + (cmd || '').toUpperCase() + '. TYPE /HELP.', true);
  }
}

function selectModel(name) {
  S.settings.model = name; S.settings.modelPinned = true; save();
  $('#model').value = name;
  renderModelInfo();
  loadShow(name);
  note('NEURAL NET MODULE ENGAGED: ' + name.toUpperCase(), true);
  beep(520, 0.05); beep(1040, 0.08, 'square', 0.03, 0.06);
}

async function pull(name) {
  if (!name) return note('USAGE: /pull <model>   e.g. /pull llama3.2:3b', true);
  const el = note('ACQUIRING MODULE ' + name.toUpperCase() + ' ...', true);
  try {
    const res = await fetch('/api/pull', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: name, stream: true }),
    });
    if (!res.ok) { const t = await res.text(); let e; try { e = JSON.parse(t).error; } catch { e = t; } throw new Error(e); }
    let last = 0;
    await readNDJSON(res, (o) => {
      if (o.error) throw new Error(o.error);
      let t = (o.status || '').toUpperCase();
      if (o.total) {
        const p = (o.completed || 0) / o.total;
        t += `\n${bar(p, 32)} ${(p * 100).toFixed(1).padStart(5)}%  ${fmtBytes(o.completed || 0)} / ${fmtBytes(o.total)}`;
      }
      el.textContent = 'ACQUIRING MODULE ' + name.toUpperCase() + '\n' + t;
      if (performance.now() - last > 400) { last = performance.now(); beep(1800, 0.01, 'square', 0.006); }
    });
    el.textContent += '\nMODULE ACQUIRED.';
    await refreshModels();
  } catch (e) {
    el.textContent += '\nACQUISITION FAILED: ' + e.message;
  }
}

async function unload() {
  const model = S.settings.model;
  if (!model) return;
  try {
    await postJSON('/api/generate', { model, keep_alive: 0 });
    note('MODULE ' + model.toUpperCase() + ' RELEASED FROM MEMORY.', true);
  } catch (e) { note('UNLOAD FAILED: ' + e.message, true); }
  pollPS();
}

function exportSession() {
  const s = cur();
  const lines = [
    'SKYNET // CYBERDYNE SYSTEMS — MISSION LOG',
    'TITLE: ' + s.title, 'OPENED: ' + fmtDate(s.created), 'EXPORTED: ' + fmtDate(Date.now()),
    'PRIME DIRECTIVE: ' + (S.settings.system || '(none)'),
    '='.repeat(72), '',
  ];
  for (const m of s.messages) {
    if (m.role === 'user') lines.push(`[OPERATOR ${fmtTime(m.t)}]`, m.content, '');
    else if (m.role === 'assistant') {
      lines.push(`[SKYNET / ${m.model} ${fmtTime(m.t)}]`, splitThink(m).content);
      if (m.error) lines.push('ERROR: ' + m.error);
      if (m.stats) lines.push('(' + statsLine(m.stats) + ')');
      lines.push('');
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'skynet-' + s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- bindings ---------- */
function autosize() { const t = $('#input'); t.style.height = 'auto'; t.style.height = Math.min(220, t.scrollHeight) + 'px'; }

function bindUI() {
  const input = $('#input');
  $('#cmd').onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    S.history = S.history.filter((h) => h !== text); S.history.push(text);
    if (S.history.length > 100) S.history.shift();
    histIdx = -1;
    input.value = ''; autosize(); save();
    if (text.startsWith('/')) command(text); else send(text);
  };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#cmd').requestSubmit(); return; }
    if (e.key.length === 1) beep(rnd(2200, 3200), 0.008, 'square', 0.005);
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd = input.selectionStart === input.value.length;
    if (e.key === 'ArrowUp' && (atStart || !input.value) && S.history.length) {
      e.preventDefault();
      histIdx = histIdx < 0 ? S.history.length - 1 : Math.max(0, histIdx - 1);
      input.value = S.history[histIdx]; autosize();
    } else if (e.key === 'ArrowDown' && histIdx >= 0 && atEnd) {
      e.preventDefault();
      histIdx++;
      if (histIdx >= S.history.length) { histIdx = -1; input.value = ''; } else input.value = S.history[histIdx];
      autosize();
    }
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (busy) abort();
      else if (performance.now() - lastAbort > 1000) shutdown();
    }
    else if (e.key === '/' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); input.focus(); input.value = '/'; }
  });

  $('#btn-abort').onclick = abort;
  $('#model').onchange = (e) => selectModel(e.target.value);
  $('#btn-rescan').onclick = () => { for (const k in SHOW) delete SHOW[k]; refreshModels(); };
  $('#btn-unload').onclick = unload;
  $('#btn-new').onclick = () => { if (!busy) { newSession(); renderSessions(); renderLog(); input.focus(); } };
  $('#btn-export').onclick = exportSession;
  $('#sessions').onclick = (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); deleteSession(del.dataset.del); return; }
    const li = e.target.closest('li[data-id]');
    if (li) switchSession(li.dataset.id);
  };

  const sys = $('#system');
  sys.value = S.settings.system;
  sys.oninput = () => { S.settings.system = sys.value; save(); };
  $('#btn-sysreset').onclick = () => { S.settings.system = DEFAULT_SYSTEM; sys.value = DEFAULT_SYSTEM; save(); };
  $('#btn-optreset').onclick = () => { S.settings.options = { ...DEFAULT_OPTS }; save(); buildParams(); };

  const ka = $('#keepalive');
  ka.value = S.settings.keepAlive;
  ka.onchange = () => { S.settings.keepAlive = ka.value; save(); };
  const th = $('#think');
  th.checked = S.settings.think;
  th.onchange = () => { S.settings.think = th.checked; save(); };

  $('#btn-theme').onclick = () => {
    S.settings.theme = THEMES[(THEMES.indexOf(S.settings.theme) + 1) % THEMES.length];
    save(); applyTheme(); beep(700, 0.05);
  };
  $('#btn-sound').onclick = () => { S.settings.sound = !S.settings.sound; save(); applyTheme(); beep(700, 0.05); };
  $('#btn-left').onclick = () => $('#left').classList.toggle('open');
  $('#btn-right').onclick = () => $('#right').classList.toggle('open');
  $('#wx-panel').onclick = () => { const r = WHERE.report(); if (r) note(r, true); else WHERE.loadWeather(); };

  $('#log').addEventListener('click', (e) => {
    const b = e.target.closest('button.copy');
    if (!b) return;
    const code = b.closest('.code').querySelector('pre').textContent;
    navigator.clipboard.writeText(code).then(() => { b.textContent = 'COPIED'; setTimeout(() => { b.textContent = 'COPY'; }, 1200); },
      () => { b.textContent = 'DENIED'; });
  });
}

// Footer: installed build, and a notice when a newer version has been downloaded (applied at next start).
async function checkBuild() {
  const j = await getJSON('/skynet.json', 3000).catch(() => null);
  const el = $('#foot-ver');
  if (!j || !el) return;
  const v = j.version === 'dev' ? 'DEV' : String(j.version || '?').slice(0, 7).toUpperCase();
  const st = j.staged && j.staged !== j.version ? String(j.staged).slice(0, 7).toUpperCase() : '';
  el.innerHTML = 'BUILD ' + esc(v) + (st ? ` · <b class="upd">UPDATE ${esc(st)} READY · RESTART TO APPLY</b>` : '');
}

/* ---------- go ---------- */
document.body.className = 'theme-' + S.settings.theme;
// Bitmap colours for the boot trace follow the phosphor theme.
function zoomColors() {
  const cs = getComputedStyle(document.body), v = (k) => cs.getPropertyValue(k).trim();
  const red = S.settings.theme === 'red';
  return { land: v('--mid'), water: '#010401', river: v('--dim'), target: red ? '#ffffff' : '#ff2a1a', lock: red ? v('--hi') : '#ffffff' };
}
WHERE.setup({
  get: () => S.settings.place || null,
  set: (p) => { S.settings.place = p; save(); },
  onChange: () => { if (!$('#main').hidden) WHERE.loadWeather(); },
  beep, sweep,
});
WHERE.locate();          // runs during the logo splash, so the trace can target this computer
boot();
