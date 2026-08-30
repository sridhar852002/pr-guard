#!/usr/bin/env node
/**
 * Record PR Guard Console (localhost:8800) with wall-clock video duration.
 * Output: demo/recordings/pr-guard-console-demo.webm
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const TF = process.env.TRUEFORGE_URL || 'http://localhost:8790';
const UI = process.env.PR_GUARD_UI_URL || 'http://127.0.0.1:8800';
const PR_URL =
  process.env.PR_URL ||
  'https://github.com/sridhar852002/vulnerable-api-fixture/pull/1';
const OUT_DIR = path.join(__dirname, '..', 'demo', 'recordings');
const OUT = path.join(OUT_DIR, 'pr-guard-console-demo.webm');
const OUT_MP4 = path.join(OUT_DIR, 'pr-guard-console-with-voice.mp4');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHttp(url, ms = 60000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch (_) {}
    await sleep(500);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

function startUiServer() {
  const child = spawn(process.execPath, [path.join(__dirname, 'serve-ui.cjs')], {
    env: { ...process.env, TRUEFORGE_URL: TF, PR_GUARD_UI_PORT: '8800' },
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
  return child;
}

async function ensureAgent() {
  const r = await fetch(`${TF}/api/v1/agents`);
  const j = await r.json();
  const names = (j.data || []).map((a) => a.name || a.manifest?.name);
  if (names.includes('pr-guard')) return;
  console.log('Registering pr-guard agent…');
  const { spawnSync } = require('child_process');
  const reg = spawnSync(path.join(__dirname, 'register-agent.sh'), {
    env: { ...process.env, TRUEFORGE_URL: TF },
    stdio: 'inherit',
  });
  if (reg.status !== 0) throw new Error('register-agent.sh failed');
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

  console.log('=== PR Guard Console — test & record ===');
  await waitHttp(`${TF}/api/v1/agents`);
  console.log('✓ TrueForge up');

  await ensureAgent();
  console.log('✓ Agent registered');

  let uiChild = null;
  try {
    await waitHttp(`${UI}/health`, 2000);
    console.log('✓ UI server already running');
  } catch {
    console.log('Starting UI server…');
    uiChild = startUiServer();
    await waitHttp(`${UI}/health`, 15000);
    console.log('✓ UI server up');
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
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
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0,0,1440,900);
  const stream = canvas.captureStream(10);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
  rec.ondataavailable = (e) => { if (e.data && e.data.size) window.__chunks.push(e.data); };
  window.__drawJpeg = (b64) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, 1440, 900); window.__frameCount++; resolve(); };
    img.onerror = reject;
    img.src = 'data:image/jpeg;base64,' + b64;
  });
  window.__stopAndExport = () => new Promise((resolve) => {
    rec.onstop = async () => {
      const blob = new Blob(window.__chunks, { type: 'video/webm' });
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      resolve(btoa(s));
    };
    rec.stop();
  });
  rec.start();
  window.__ready = true;
})();
</script></body></html>`);
  await recPage.waitForFunction(() => window.__ready === true);

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const client = await page.context().newCDPSession(page);
  let piping = true;
  let pipeCount = 0;
  client.on('Page.screencastFrame', async (frame) => {
    try {
      await client.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    } catch (_) {}
    if (!piping) return;
    pipeCount++;
    if (pipeCount % 2 !== 0) return;
    try {
      await recPage.evaluate(async (b64) => window.__drawJpeg(b64), frame.data);
    } catch (_) {}
  });
  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 72,
    maxWidth: 1440,
    maxHeight: 900,
    everyNthFrame: 1,
  });

  const t0 = Date.now();
  console.log('Opening console…');
  await page.goto(UI, { waitUntil: 'networkidle' });
  await sleep(3500);

  await page.locator('#pr-url').fill(PR_URL);
  await sleep(800);

  console.log('Starting review…');
  await page.locator('#start-btn').click();

  console.log('Waiting for agent run…');
  for (let i = 0; i < 90; i++) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const gate = await page.locator('#intervention-active:not(.hidden)').isVisible().catch(() => false);
    const done = await page.locator('#run-status').textContent().catch(() => '');
    console.log(`  t=${elapsed}s gate=${gate} status=${done?.trim()}`);
    if (gate) break;
    if (/complete|failed|error|denied/i.test(done || '')) break;
    await sleep(2500);
  }

  const gateVisible = await page.locator('#intervention-active:not(.hidden)').isVisible().catch(() => false);
  if (gateVisible) {
    console.log('Holding approval gate 18s (film the evidence pack)…');
    await sleep(18000);
    console.log('Clicking Allow…');
    await page.locator('#allow-btn').click();
  } else {
    console.warn('Gate not visible — UI may still be running; waiting…');
    await sleep(20000);
  }

  console.log('Waiting for completion…');
  await page.locator('#run-status').filter({ hasText: /complete/i }).waitFor({ timeout: 120000 }).catch(() => {});
  await sleep(8000);

  console.log('Showing findings panel…');
  await page.locator('#findings-list').scrollIntoViewIfNeeded().catch(() => {});
  await sleep(5000);

  piping = false;
  try {
    await client.send('Page.stopScreencast');
  } catch (_) {}

  const wallSec = (Date.now() - t0) / 1000;
  const b64 = await recPage.evaluate(() => window.__stopAndExport());
  await browser.close();

  if (!b64 || b64.length < 1000) throw new Error('Empty recording');
  fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));

  let duration = null;
  try {
    duration = await measureDuration(OUT);
  } catch (e) {
    console.warn('Duration probe:', e.message);
  }

  console.log('\n=== RECORDING DONE ===');
  console.log('  webm:', OUT);
  console.log('  size:', (fs.statSync(OUT).size / 1024 / 1024).toFixed(2), 'MB');
  console.log('  wall :', wallSec.toFixed(1), 's');
  if (duration) console.log('  dur  :', duration.toFixed(1), 's');

  console.log('\nAdding voiceover…');
  const vo = spawn(
    process.execPath,
    [path.join(__dirname, 'add-voiceover.cjs')],
    {
      env: {
        ...process.env,
        INPUT_WEBM: OUT,
        OUTPUT_MP4: OUT_MP4,
      },
      stdio: 'inherit',
    },
  );
  await new Promise((res, rej) => {
    vo.on('exit', (c) => (c === 0 ? res() : rej(new Error('voiceover exit ' + c))));
  });

  console.log('\nSubmit this file:', OUT_MP4);
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
