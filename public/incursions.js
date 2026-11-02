/* SKYNET // TEMPORAL INCURSION TRACKER
   A line map of the world (window.WORLD, Natural Earth 1:110m) with random sightings of
   Terminator units arriving through time displacement. Each sighting records where it was
   found, the date it materialised and the year it was sent from. Purely fictional. */
(function () {
  'use strict';

  const LAT_N = 84, LAT_S = -58;                       // crop: Arctic islands to Cape Horn
  const MAX_TRACKED = 14;
  const NEXT_MIN = 18e3, NEXT_MAX = 48e3;               // ms between new sightings
  const PULSE = 6000;                                   // ms a fresh sighting pulses

  // [designation, weight, year sent from]
  const UNITS = [
    ['T-1000', 6, 2029], ['T-800', 6, 2029], ['T-850', 2, 2032], ['T-X', 2, 2032],
    ['T-600', 1, 2026], ['T-700', 1, 2027], ['T-888', 1, 2027], ['T-1001', 1, 2029],
    ['T-3000', 1, 2032], ['REV-9', 1, 2042],
  ];
  const CANON = [1984, 1984, 1995, 1995, 1997, 2004, 2017, 2020];
  const TARGETS = ['CONNOR, SARAH', 'CONNOR, JOHN', 'REESE, KYLE', 'DYSON, MILES', 'BREWSTER, KATE',
    'RAMOS, DANIELLA', 'RESISTANCE CELL', 'CYBERDYNE ASSET', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'];
  const STATUS = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'PURSUIT', 'TERMINATED', 'LOST CONTACT', 'DORMANT'];
  // [name, country, lat, lon]
  const CITIES = [
    ['LOS ANGELES', 'US', 34.05, -118.24], ['LOS ANGELES', 'US', 34.05, -118.24], ['SAN FRANCISCO', 'US', 37.77, -122.42],
    ['NEW YORK', 'US', 40.71, -74.0], ['CHICAGO', 'US', 41.88, -87.63], ['DETROIT', 'US', 42.33, -83.05],
    ['HOUSTON', 'US', 29.76, -95.37], ['SEATTLE', 'US', 47.61, -122.33], ['DENVER', 'US', 39.74, -104.99],
    ['LAS VEGAS', 'US', 36.17, -115.14], ['ANCHORAGE', 'US', 61.22, -149.9], ['MIAMI', 'US', 25.76, -80.19],
    ['TORONTO', 'CA', 43.65, -79.38], ['VANCOUVER', 'CA', 49.28, -123.12], ['MEXICO CITY', 'MX', 19.43, -99.13],
    ['CIUDAD JUAREZ', 'MX', 31.69, -106.42], ['HAVANA', 'CU', 23.11, -82.37], ['BOGOTA', 'CO', 4.71, -74.07],
    ['LIMA', 'PE', -12.05, -77.04], ['SAO PAULO', 'BR', -23.55, -46.63], ['RIO DE JANEIRO', 'BR', -22.91, -43.17],
    ['BUENOS AIRES', 'AR', -34.6, -58.38], ['SANTIAGO', 'CL', -33.45, -70.67], ['REYKJAVIK', 'IS', 64.15, -21.94],
    ['LONDON', 'GB', 51.51, -0.13], ['DUBLIN', 'IE', 53.35, -6.26], ['PARIS', 'FR', 48.86, 2.35],
    ['MADRID', 'ES', 40.42, -3.7], ['LISBON', 'PT', 38.72, -9.14], ['ROME', 'IT', 41.9, 12.5],
    ['BERLIN', 'DE', 52.52, 13.4], ['AMSTERDAM', 'NL', 52.37, 4.9], ['OSLO', 'NO', 59.91, 10.75],
    ['TROMSO', 'NO', 69.65, 18.96], ['STOCKHOLM', 'SE', 59.33, 18.07], ['HELSINKI', 'FI', 60.17, 24.94],
    ['COPENHAGEN', 'DK', 55.68, 12.57], ['WARSAW', 'PL', 52.23, 21.01], ['PRAGUE', 'CZ', 50.08, 14.44],
    ['VIENNA', 'AT', 48.21, 16.37], ['ATHENS', 'GR', 37.98, 23.73], ['ISTANBUL', 'TR', 41.01, 28.98],
    ['KYIV', 'UA', 50.45, 30.52], ['MOSCOW', 'RU', 55.76, 37.62], ['NOVOSIBIRSK', 'RU', 55.01, 82.93],
    ['VLADIVOSTOK', 'RU', 43.12, 131.89], ['MURMANSK', 'RU', 68.97, 33.09], ['CAIRO', 'EG', 30.04, 31.24],
    ['LAGOS', 'NG', 6.52, 3.38], ['NAIROBI', 'KE', -1.29, 36.82], ['KINSHASA', 'CD', -4.44, 15.27],
    ['JOHANNESBURG', 'ZA', -26.2, 28.05], ['CAPE TOWN', 'ZA', -33.92, 18.42], ['CASABLANCA', 'MA', 33.57, -7.59],
    ['RIYADH', 'SA', 24.71, 46.68], ['DUBAI', 'AE', 25.2, 55.27], ['TEHRAN', 'IR', 35.69, 51.39],
    ['KARACHI', 'PK', 24.86, 67.0], ['DELHI', 'IN', 28.61, 77.21], ['MUMBAI', 'IN', 19.08, 72.88],
    ['KOLKATA', 'IN', 22.57, 88.36], ['BANGKOK', 'TH', 13.76, 100.5], ['SINGAPORE', 'SG', 1.35, 103.82],
    ['JAKARTA', 'ID', -6.21, 106.85], ['MANILA', 'PH', 14.6, 120.98], ['HONG KONG', 'HK', 22.32, 114.17],
    ['SHANGHAI', 'CN', 31.23, 121.47], ['BEIJING', 'CN', 39.9, 116.41], ['ULAANBAATAR', 'MN', 47.89, 106.91],
    ['SEOUL', 'KR', 37.57, 126.98], ['TOKYO', 'JP', 35.68, 139.69], ['OSAKA', 'JP', 34.69, 135.5],
    ['SYDNEY', 'AU', -33.87, 151.21], ['MELBOURNE', 'AU', -37.81, 144.96], ['PERTH', 'AU', -31.95, 115.86],
    ['DARWIN', 'AU', -12.46, 130.84], ['AUCKLAND', 'NZ', -36.85, 174.76], ['HONOLULU', 'US', 21.31, -157.86],
  ];

  let cfg = { beep() {}, sweep() {}, onSighting() {}, operator: () => null };
  const list = [];
  let serial = 0, cv = null, ctx = null, base = null, colors = null, timer = 0, started = false;

  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function weighted(a) {
    let r = Math.random() * a.reduce((s, x) => s + x[1], 0);
    for (const x of a) if ((r -= x[1]) < 0) return x;
    return a[0];
  }
  const fmtDate = (d) => `${d.y}.${pad(d.m)}.${pad(d.d)}`;
  const fmtTime = (d) => `${pad(d.h)}:${pad(d.mi)}`;

  function make(seenAt) {
    const [unit, , from] = weighted(UNITS);
    const r = Math.random();
    let y;
    if (r < 0.3) y = pick(CANON);
    else if (r < 0.4) y = rnd(1850, 1983);                       // deep-past anomaly
    else y = rnd(1984, 2026);
    y = Math.min(y, from - 1);
    const m = rnd(1, 12), days = new Date(y, m, 0).getDate();
    const c = pick(CITIES);
    return {
      id: ++serial, unit, from,
      when: { y, m, d: rnd(1, days), h: rnd(0, 23), mi: rnd(0, 59) },
      city: c[0], cc: c[1],
      lat: c[2] + (Math.random() - 0.5) * 0.6, lon: c[3] + (Math.random() - 0.5) * 0.6,
      target: pick(TARGETS), status: pick(STATUS),
      flux: (Math.random() * 9 + 1).toFixed(2),
      seen: seenAt,
    };
  }

  function add(s, quiet) {
    list.unshift(s);
    if (list.length > MAX_TRACKED) list.length = MAX_TRACKED;
    renderList();
    if (!quiet) {
      cfg.sweep(180, 1600, 0.35, 0.018);
      cfg.beep(1760, 0.05, 'square', 0.02, 0.38);
      cfg.beep(1760, 0.05, 'square', 0.02, 0.5);
      cfg.onSighting(s);
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { add(make(performance.now())); schedule(); }, rnd(NEXT_MIN, NEXT_MAX));
  }

  /* ---------------- map ---------------- */
  function proj(lon, lat, w, h) {
    return [(lon + 180) / 360 * w, (LAT_N - lat) / (LAT_N - LAT_S) * h];
  }

  function readColors() {
    const cs = getComputedStyle(document.body), v = (k) => cs.getPropertyValue(k).trim();
    const red = document.body.classList.contains('theme-red');
    colors = { fg: v('--fg'), mid: v('--mid'), dim: v('--dim'), hi: v('--hi'), glow: v('--glow'),
      hit: red ? '#ffffff' : '#ff2a1a' };
  }

  function buildBase(w, h, dpr) {
    const W0 = window.WORLD;
    base = document.createElement('canvas');
    base.width = w * dpr; base.height = h * dpr;
    const g = base.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.strokeStyle = colors.dim; g.lineWidth = 0.5; g.globalAlpha = 0.55;
    g.setLineDash([1, 3]);
    g.beginPath();
    for (let lon = -150; lon <= 150; lon += 30) { const [x] = proj(lon, 0, w, h); g.moveTo(x, 0); g.lineTo(x, h); }
    for (let lat = -30; lat <= 60; lat += 30) { const [, y] = proj(0, lat, w, h); g.moveTo(0, y); g.lineTo(w, y); }
    g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    if (!W0) return;
    const q = W0.q;
    g.strokeStyle = colors.mid; g.lineWidth = 0.9; g.lineJoin = 'round';
    g.shadowColor = colors.glow; g.shadowBlur = 3;
    g.beginPath();
    for (const a of W0.land.concat(W0.lakes || [])) {
      for (let i = 0; i < a.length; i += 2) {
        const [x, y] = proj(a[i] / q, a[i + 1] / q, w, h);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
    }
    g.stroke();
  }

  function draw(now) {
    requestAnimationFrame(draw);
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (w < 10 || h < 10) return;                      // drawer closed / panel hidden
    if (!colors) { readColors(); base = null; }
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); base = null;
    }
    if (!base) buildBase(w, h, dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // radar sweep
    const sx = (now / 40) % (w + 40) - 20;
    const grad = ctx.createLinearGradient(sx - 30, 0, sx, 0);
    grad.addColorStop(0, 'transparent'); grad.addColorStop(1, colors.glow);
    ctx.fillStyle = grad; ctx.globalAlpha = 0.35; ctx.fillRect(sx - 30, 0, 30, h); ctx.globalAlpha = 1;

    // this terminal
    const op = cfg.operator();
    if (op && isFinite(op.lat) && isFinite(op.lon)) {
      const [x, y] = proj(op.lon, op.lat, w, h);
      ctx.strokeStyle = colors.hi; ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x) - 2.5, Math.round(y) - 2.5, 5, 5);
    }

    // sightings, oldest first so the newest sits on top
    ctx.font = '10px ' + (getComputedStyle(cv).fontFamily || 'monospace');
    ctx.textBaseline = 'middle';
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      const [x, y] = proj(s.lon, s.lat, w, h);
      const age = now - s.seen;
      const fresh = age < PULSE;
      const fade = Math.max(0.35, 1 - i / MAX_TRACKED);
      ctx.globalAlpha = fade;
      ctx.fillStyle = s.status === 'TERMINATED' ? colors.mid : colors.hit;
      ctx.shadowColor = colors.hit; ctx.shadowBlur = fresh ? 10 : 4;
      ctx.beginPath(); ctx.arc(x, y, i === 0 ? 2.4 : 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (s.status === 'TERMINATED') {
        ctx.strokeStyle = colors.mid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.stroke();
      }
      if (fresh) {
        // temporal displacement bubble: expanding rings + lock brackets
        ctx.strokeStyle = colors.hit; ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const p = ((age / 1200) + k / 3) % 1;
          ctx.globalAlpha = (1 - p) * 0.9;
          ctx.beginPath(); ctx.arc(x, y, 2 + p * 16, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (Math.floor(age / 250) % 2 === 0) {
          ctx.strokeStyle = colors.hi;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.moveTo(x, 0); ctx.lineTo(x, h);
          ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
      if (i === 0) {
        const label = s.unit + ' ' + s.when.y;
        const tw = ctx.measureText(label).width;
        const lx = x + 6 + tw > w ? x - 6 - tw : x + 6;
        const ly = Math.min(h - 6, Math.max(6, y - 6));
        ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(lx - 2, ly - 6, tw + 4, 12);
        ctx.fillStyle = colors.hi; ctx.fillText(label, lx, ly);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- list + log ---------------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderList() {
    const ul = document.getElementById('tt-list'), n = document.getElementById('tt-count');
    if (n) n.textContent = list.length + ' TRACKED';
    if (!ul) return;
    ul.innerHTML = list.slice(0, 4).map((s, i) =>
      `<li class="${i === 0 ? 'new' : ''}${s.status === 'TERMINATED' ? ' dead' : ''}">` +
      `<div><b>${esc(s.unit)}</b><span>${esc(s.city)}, ${esc(s.cc)}</span></div>` +
      `<div class="when">FOUND ${fmtDate(s.when)} ${fmtTime(s.when)}<span>FROM ${s.from}</span></div></li>`).join('');
  }

  function dms(v, pos, neg) {
    const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60);
    return `${pad(d, pos === 'E' ? 3 : 2)}°${pad(m)}'${v >= 0 ? pos : neg}`;
  }

  function line(s) {
    const back = s.from - s.when.y;
    return `#${pad(s.id, 3)} ${s.unit.padEnd(7)} ${fmtDate(s.when)} ${fmtTime(s.when)}  FROM ${s.from} (Δt ${("-" + back).padStart(4)} YRS)  ` +
      `${(s.city + ', ' + s.cc).padEnd(19)} ${dms(s.lat, 'N', 'S')} ${dms(s.lon, 'E', 'W')}  ` +
      `${s.flux} TJ  TARGET ${s.target.padEnd(16)} ${s.status}`;
  }

  function report() {
    if (!list.length) return 'NO TEMPORAL INCURSIONS DETECTED.';
    return 'TEMPORAL INCURSION LOG // TIME DISPLACEMENT EQUIPMENT SIGNATURES\n' +
      'FOUND = DATE THE UNIT MATERIALISED · FROM = YEAR IT WAS SENT BACK\n\n' +
      list.map(line).join('\n') +
      `\n\n${list.length} UNITS TRACKED · ${list.filter((s) => s.status !== 'TERMINATED').length} NOT TERMINATED`;
  }

  function summary(s) {
    return `TEMPORAL INCURSION: ${s.unit} FOUND ${fmtDate(s.when)} ${fmtTime(s.when)} · ${s.city}, ${s.cc} · SENT FROM ${s.from}`;
  }

  function start(c) {
    if (started) return;
    started = true;
    cfg = Object.assign(cfg, c || {});
    cv = document.getElementById('tt-map');
    if (!cv) return;
    ctx = cv.getContext('2d');
    // Seed a few historic sightings so the map isn't empty, then a fresh one shortly after.
    const now = performance.now();
    for (let i = 0; i < 6; i++) add(make(now - PULSE - 1), true);
    setTimeout(() => { add(make(performance.now())); schedule(); }, rnd(3000, 6000));
    requestAnimationFrame(draw);
  }

  function spawn() { const s = make(performance.now()); add(s); schedule(); return s; }

  window.INCURSIONS = { start, report, summary, spawn, recolor() { colors = null; } };
})();
