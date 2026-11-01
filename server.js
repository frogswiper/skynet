#!/usr/bin/env node
// SKYNET terminal — static file server + allow-listed proxy to a local Ollama.
// Zero dependencies. Binds 127.0.0.1 by default.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.SKYNET_PORT || '8484', 10);
const BIND = process.env.SKYNET_BIND || '127.0.0.1';
const OLLAMA = new URL(process.env.OLLAMA_URL || 'http://127.0.0.1:11434');
const ROOT = path.join(__dirname, 'public');
// Model the UI selects until the operator picks one. The installer writes the newest GLM cloud model here.
const DEFAULT_MODEL = process.env.SKYNET_MODEL || 'glm-5.3:cloud';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

// Only the Ollama endpoints the UI needs. No /api/delete, /api/create, /api/push.
const ALLOWED = new Set([
  'GET /api/version', 'GET /api/tags', 'GET /api/ps',
  'POST /api/show', 'POST /api/chat', 'POST /api/generate', 'POST /api/pull',
]);

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
};

function proxy(req, res, pathname) {
  if (!ALLOWED.has(`${req.method} ${pathname}`)) {
    res.writeHead(404, { 'content-type': 'application/json', ...SEC_HEADERS });
    return res.end(JSON.stringify({ error: 'ACCESS DENIED: endpoint not permitted' }));
  }
  const up = http.request({
    hostname: OLLAMA.hostname,
    port: OLLAMA.port || 11434,
    path: req.url,
    method: req.method,
    headers: { 'content-type': 'application/json' },
  }, (upRes) => {
    res.writeHead(upRes.statusCode, {
      'content-type': upRes.headers['content-type'] || 'application/json',
      'cache-control': 'no-store',
      ...SEC_HEADERS,
    });
    upRes.pipe(res);
  });
  up.on('error', (e) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json', ...SEC_HEADERS });
    res.end(JSON.stringify({ error: `NODE UNREACHABLE: ${e.message}` }));
  });
  // Browser hit TERMINATE / closed the tab → drop the upstream request so Ollama stops generating.
  res.on('close', () => { if (!res.writableFinished) up.destroy(); });
  req.pipe(up);
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, SEC_HEADERS); return res.end();
  }
  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403, SEC_HEADERS); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, SEC_HEADERS); return res.end('404'); }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'no-cache',
      ...SEC_HEADERS,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400, SEC_HEADERS); return res.end(); }
  if (pathname.startsWith('/api/')) return proxy(req, res, pathname);
  if (pathname === '/skynet.json') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...SEC_HEADERS });
    return res.end(JSON.stringify({ ollama: OLLAMA.host, defaultModel: DEFAULT_MODEL }));
  }
  serveStatic(req, res, pathname);
}).listen(PORT, BIND, () => {
  console.log(`SKYNET ONLINE  http://${BIND}:${PORT}  →  ollama ${OLLAMA.origin}`);
});
