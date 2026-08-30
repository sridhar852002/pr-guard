#!/usr/bin/env node
/**
 * REAL continuous browser video (CDP screencast @ ~8fps → WebM).
 * Captures the live TrueForge UI while the agent runs — not a 1fps slideshow.
 * Output: demo/recordings/pr-guard-demo-live.webm
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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
  for (let i = 0; i < 60; i++) {
    const t = await api('GET', `/api/v1/sessions/${sessionId}/turns/${turnId}`);
    const status = t.data?.state?.status;
    if (status === 'done' || status === 'failed' || status === 'error') return t.data;
    await sleep(2500);
  }
  throw new Error('turn timeout');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  const jpegFrames = []; // base64 jpeg without prefix
  let capturing = false;

  client.on('Page.screencastFrame', async (frame) => {
    if (capturing) jpegFrames.push(frame.data);
    try {
      await client.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    } catch (_) {}
  });

  async function startCast() {
    capturing = true;
    await client.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 72,
      maxWidth: 1440,
      maxHeight: 900,
      everyNthFrame: 1,
    });
  }
  async function stopCast() {
    capturing = false;
    try {
      await client.send('Page.stopScreencast');
    } catch (_) {}
  }

  console.log('Opening TrueForge...');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await startCast();
  await sleep(2500);

  const settingsBtn = page.getByRole('button', { name: /Settings/i }).first();
  if (await settingsBtn.isVisible().catch(() => false)) {
    await settingsBtn.click();
    await sleep(3000);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(800);
  }

  const session = await api('POST', '/api/v1/sessions', { agent: { name: 'pr-guard' } });
  const sessionId = session.data.id;
  const sessionUrl = `${BASE}/sessions/${sessionId}`;
  console.log('Session', sessionId);

  await page.goto(sessionUrl, { waitUntil: 'networkidle' });
  await sleep(1500);

  console.log('Starting live review (continuous capture)...');
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

  // Stay on session page — soft refresh only occasionally so streaming UI can update
  let turnData;
  for (let i = 0; i < 50; i++) {
    const t = await api('GET', `/api/v1/sessions/${sessionId}/turns/${turn1Id}`);
    const status = t.data?.state?.status;
    const nAct = (t.data?.state?.required_actions || []).length;
    console.log(`t=${i} status=${status} actions=${nAct} frames=${jpegFrames.length}`);
    if (i % 3 === 0) {
      await page.goto(sessionUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    } else {
      await page.mouse.move(300 + i * 3, 280);
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
  console.log('Approval actions:', actions.length, 'frames so far:', jpegFrames.length);

  // Hold on gate ~10s of continuous video
  await sleep(10000);

  if (actions.length > 0) {
    const allowBtn = page.getByRole('button', { name: /^Allow$/i }).first();
    if (await allowBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      console.log('Clicking Allow in UI...');
      await allowBtn.click();
      await sleep(15000);
    } else {
      console.log('API Allow...');
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
      await sleep(10000);
    }
  }

  console.log('GitHub PR...');
  await page.goto(PR_URL, { waitUntil: 'domcontentloaded' });
  await sleep(8000);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  await stopCast();
  console.log('Captured JPEG frames:', jpegFrames.length);

  if (jpegFrames.length < 30) {
    throw new Error('Too few frames captured — aborting');
  }

  // Subsample to ~8fps equivalent for encode size (keep max ~600 frames)
  let frames = jpegFrames;
  if (frames.length > 600) {
    const step = Math.ceil(frames.length / 600);
    frames = frames.filter((_, i) => i % step === 0);
  }

  console.log('Encoding continuous WebM from', frames.length, 'live frames...');

  // Use a fresh page for MediaRecorder encode
  const enc = await context.newPage();
  await enc.setContent('<canvas id="c" width="1440" height="900"></canvas>');

  // Pass frames in chunks to avoid huge single evaluate payload
  const chunkSize = 40;
  await enc.evaluate(() => {
    window.__frames = [];
  });
  for (let i = 0; i < frames.length; i += chunkSize) {
    const chunk = frames.slice(i, i + chunkSize);
    await enc.evaluate((chunk) => {
      window.__frames.push(...chunk);
    }, chunk);
  }

  const fps = 8;
  const webmB64 = await enc.evaluate(async ({ fps }) => {
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const chunks = [];
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise((r) => {
      rec.onstop = r;
    });
    rec.start(100);

    function loadJpeg(b64) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = 'data:image/jpeg;base64,' + b64;
      });
    }

    const delay = 1000 / fps;
    for (const b64 of window.__frames) {
      const img = await loadJpeg(b64);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (track.requestFrame) track.requestFrame();
      await new Promise((r) => setTimeout(r, delay));
    }
    rec.stop();
    await stopped;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let s = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(s);
  }, { fps });

  await browser.close();

  fs.writeFileSync(OUT, Buffer.from(webmB64, 'base64'));
  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
  console.log('LIVE CONTINUOUS VIDEO:', OUT);
  console.log(`Size: ${mb} MB | ~${(frames.length / fps).toFixed(0)}s at ${fps}fps`);
  console.log('This is continuous capture of the live UI (not a 1fps slideshow).');
  console.log('Add voice in CapCut → export MP4 → YouTube Unlisted.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
