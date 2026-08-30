#!/usr/bin/env node
/**
 * PR Guard dashboard — static UI + loopback-only TrueForge API proxy.
 * Binds 127.0.0.1 only; no wildcard CORS; allowlisted API routes.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PR_GUARD_UI_PORT || 8800);
const TF = process.env.TRUEFORGE_URL || 'http://127.0.0.1:8790';
const UI = path.join(__dirname, '..', 'ui');
const ALLOWED_ORIGINS = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const API_ALLOW = [
  { method: 'GET', re: /^\/api\/v1\/agents$/ },
  { method: 'POST', re: /^\/api\/v1\/sessions$/ },
  { method: 'GET', re: /^\/api\/v1\/sessions\/[^/]+\/turns\/[^/]+$/ },
  { method: 'POST', re: /^\/api\/v1\/sessions\/[^/]+\/turns$/ },
];

function isLoopback(req) {
  const addr = req.socket.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

function apiAllowed(method, pathname) {
  return API_ALLOW.some((r) => r.method === method && r.re.test(pathname));
}

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

function deny(res, code, msg) {
  send(res, code, JSON.stringify({ error: msg }), 'application/json');
}

function proxy(req, res, urlPath) {
  const target = `${TF}${urlPath}`;
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    })
      .then(async (r) => {
        const text = await r.text();
        res.writeHead(r.status, {
          'Content-Type': r.headers.get('content-type') || 'application/json',
        });
        res.end(text);
      })
      .catch((e) => deny(res, 502, String(e.message)));
  });
}

const server = http.createServer((req, res) => {
  if (!isLoopback(req)) {
    return deny(res, 403, 'loopback only');
  }

  if (req.method === 'OPTIONS') {
    return send(res, 405, 'Method not allowed');
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    if (!originAllowed(req)) {
      return deny(res, 403, 'origin not allowed');
    }
    if (!apiAllowed(req.method, url.pathname)) {
      return deny(res, 403, 'API route not allowlisted');
    }
    return proxy(req, res, url.pathname + url.search);
  }

  if (url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
  }

  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const fp = path.join(UI, file);
  if (!fp.startsWith(UI) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    return send(res, 404, 'Not found');
  }
  send(res, 200, fs.readFileSync(fp), MIME[path.extname(fp)] || 'application/octet-stream');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PR Guard UI  → http://127.0.0.1:${PORT}`);
  console.log('Start TrueForge first: npx @truefoundry/trueforge@latest');
});
