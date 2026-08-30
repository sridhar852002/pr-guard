#!/usr/bin/env node
/**
 * PR Guard dashboard — static UI + TrueForge API proxy (avoids CORS).
 * Usage: node scripts/serve-ui.cjs
 * Open http://localhost:8800
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PR_GUARD_UI_PORT || 8800);
const TF = process.env.TRUEFORGE_URL || 'http://127.0.0.1:8790';
const UI = path.join(__dirname, '..', 'ui');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
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
          'Access-Control-Allow-Origin': '*',
        });
        res.end(text);
      })
      .catch((e) => send(res, 502, JSON.stringify({ error: String(e.message) }), 'application/json'));
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    return proxy(req, res, url.pathname + url.search);
  }

  if (url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ ok: true, trueforge: TF }), 'application/json');
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
  console.log(`TrueForge API → ${TF}`);
  console.log('Start TrueForge first: npx @truefoundry/trueforge@latest');
});
