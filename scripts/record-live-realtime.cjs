#!/usr/bin/env node
/**
 * Real continuous demo video with CORRECT duration.
 * Pipes CDP screencast frames into a MediaRecorder in real-time
 * while the agent runs — wall-clock length = video length.
 *
 * Output: demo/recordings/pr-guard-demo-live.webm
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = process.env.TRUEFORGE_URL || 'http://localhost:8790';
const PR_URL =
  process.env.PR_URL ||
  'https://github.com/sridhar852002/vulnerable-api-fixture/pull/1';
const OUT_DIR = path.join(__dirname, '..', 'demo', 'recordings');
const OUT = path.join(OUT_DIR, 'pr-guard-demo-live.webm');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(method, urlPath, body) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 400)}`);
  return json;
}

async function pollTurn(sessionId, turnId) {
  for (let i = 0; i < 80; i++) {
    const t = await api('GET', `/api/v1/sessions/${sessionId}/turns/${turnId}`);
    const status = t.data?.state?.status;
    if (status === 'done' || status === 'failed' || status === 'error') return t.data;
    await sleep(2500);
  }
  throw new Error('turn timeout');
}

async function measureDuration(filePath) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'video/webm',
      'Content-Length': fs.statSync(filePath).size,
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setContent(
    `<video id="v" src="http://127.0.0.1:${port}/" preload="metadata"></video>`,
  );
  const dur = await page.evaluate(
    () =>
      new Promise((res, rej) => {
        const v = document.getElementById('v');
        v.onloadedmetadata = () => res(v.duration);
        v.onerror = () => rej(new Error('metadata failed'));
        setTimeout(() => rej(new Error('timeout')), 20000);
      }),
  );
  await browser.close();
  server.close();
  return dur;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await api('GET', '/api/v1/agents');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  // Recorder page: canvas + MediaRecorder running for wall-clock duration
  const recPage = await browser.newPage();
  await recPage.setContent(`<!DOCTYPE html>
<html><body style="margin:0;background:#000">
<canvas id="c" width="1440" height="900"></canvas>
<script>
window.__ready = false;
window.__chunks = [];
window.__frameCount = 0;
(async () => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0,0,1440,900);
  ctx.fillStyle = '#fff';
  ctx.font = '28px system-ui';
  ctx.fillText('PR Guard demo starting…', 40, 80);

  const stream = canvas.captureStream(10); // 10 fps continuous
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3500000 });
  rec.ondataavailable = (e) => { if (e.data && e.data.size) window.__chunks.push(e.data); };
  window.__rec = rec;
  window.__ctx = ctx;
  window.__drawJpeg = (b64) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 1440, 900);
      window.__frameCount++;
      resolve();
    };
    img.onerror = reject;
    img.src = 'data:image/jpeg;base64,' + b64;
  });
  window.__stopAndExport = () => new Promise(async (resolve) => {
    if (rec.state === 'inactive') {
      resolve('');
      return;
    }
    rec.onstop = async () => {
      const blob = new Blob(window.__chunks, { type: 'video/webm' });
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let s = '';
      const step = 0x8000;
      for (let i = 0; i < bytes.length; i += step) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
      }
      resolve(btoa(s));
    };
    rec.stop();
  });
  // IMPORTANT: no timeslice — timeslice writes "live" WebM with unknown
  // duration; many players then only show ~10–15s. Single start/stop writes
  // a finite duration into the file.
  rec.start();
  window.__ready = true;
})();
</script></body></html>`);

  await recPage.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  console.log('MediaRecorder started (10fps wall-clock)');

  // Demo page (TrueForge UI)
  const page = await browser.newPage();
  const client = await page.context().newCDPSession(page);

  let pipeCount = 0;
  let piping = true;
  client.on('Page.screencastFrame', async (frame) => {
    try {
      await client.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    } catch (_) {}
    if (!piping) return;
    // Throttle draws to ~8-10/sec so recorder stays real-time
    pipeCount++;
    if (pipeCount % 2 !== 0) return; // roughly half of CDP frames
    try {
      await recPage.evaluate(async (b64) => {
        await window.__drawJpeg(b64);
      }, frame.data);
    } catch (_) {}
  });

  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 70,
    maxWidth: 1440,
    maxHeight: 900,
    everyNthFrame: 1,
  });

  const t0 = Date.now();
  console.log('Opening TrueForge…');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(3000);

  const settingsBtn = page.getByRole('button', { name: /Settings/i }).first();
  if (await settingsBtn.isVisible().catch(() => false)) {
    await settingsBtn.click();
    await sleep(4000);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(1000);
  }

  const session = await api('POST', '/api/v1/sessions', { agent: { name: 'pr-guard' } });
  const sessionId = session.data.id;
  const sessionUrl = `${BASE}/sessions/${sessionId}`;
  console.log('Session', sessionId);

  await page.goto(sessionUrl, { waitUntil: 'networkidle' });
  await sleep(2000);

  console.log('Starting full review…');
  const turn1 = await api('POST', `/api/v1/sessions/${sessionId}/turns`, {
    stream: false,
    input: [
      {
        type: 'user.message',
        content: `Review this pull request end to end: ${PR_URL}`,
      },
    ],
  });
  const turn1Id = turn1.data.id;

  let turnData;
  for (let i = 0; i < 60; i++) {
    const t = await api('GET', `/api/v1/sessions/${sessionId}/turns/${turn1Id}`);
    const status = t.data?.state?.status;
    const nAct = (t.data?.state?.required_actions || []).length;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`t=${i} ${elapsed}s status=${status} actions=${nAct} draws=${pipeCount}`);
    if (i % 4 === 0) {
      await page.goto(sessionUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    } else {
      await page.mouse.move(320 + (i % 7) * 8, 260);
    }
    if (status === 'done' || status === 'failed' || status === 'error') {
      turnData = t.data;
      break;
    }
    await sleep(2500);
  }
  if (!turnData) turnData = await pollTurn(sessionId, turn1Id);

  await page.goto(sessionUrl, { waitUntil: 'networkidle' });
  const actions = turnData.state?.required_actions || [];
  console.log('Approval actions:', actions.length);

  // Hold on approval gate ~15s for voice-over
  console.log('Holding on approval gate 15s…');
  await sleep(15000);

  if (actions.length > 0) {
    const allowBtn = page.getByRole('button', { name: /^Allow$/i }).first();
    if (await allowBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Clicking Allow…');
      await allowBtn.click();
      await sleep(18000);
    } else {
      console.log('API Allow…');
      const t2 = await api('POST', `/api/v1/sessions/${sessionId}/turns`, {
        stream: false,
        previous_turn_id: turn1Id,
        input: [
          {
            type: 'user.tool_approval',
            thread_id: actions[0].thread_id,
            tool_call_id: actions[0].tool_calls[0].id,
            approval: { status: 'allow' },
          },
        ],
      });
      await pollTurn(sessionId, t2.data.id);
      await page.goto(sessionUrl, { waitUntil: 'networkidle' });
      await sleep(12000);
    }
  }

  console.log('GitHub PR 10s…');
  await page.goto(PR_URL, { waitUntil: 'domcontentloaded' });
  await sleep(10000);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  piping = false;
  try {
    await client.send('Page.stopScreencast');
  } catch (_) {}

  const wallSec = (Date.now() - t0) / 1000;
  console.log(`Stopping recorder (wall-clock ${wallSec.toFixed(1)}s)…`);
  const b64 = await recPage.evaluate(() => window.__stopAndExport());
  const frameCount = await recPage.evaluate(() => window.__frameCount);

  await browser.close();

  if (!b64 || b64.length < 1000) throw new Error('Empty recording');
  fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));
  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);

  let duration = null;
  try {
    duration = await measureDuration(OUT);
  } catch (e) {
    console.warn('Could not measure duration:', e.message);
  }

  console.log('SAVED:', OUT);
  console.log(`Size: ${mb} MB | wall-clock: ${wallSec.toFixed(1)}s | canvas draws: ${frameCount}`);
  if (duration != null) {
    console.log(`Measured duration: ${duration.toFixed(1)}s`);
    if (duration < 40) {
      console.error('WARNING: video shorter than 40s — something still wrong');
      process.exit(2);
    }
  }
  console.log('Add voice in CapCut → MP4 → YouTube Unlisted.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
