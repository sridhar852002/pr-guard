#!/usr/bin/env node
/**
 * Silent demo recorder — screenshots + ffmpeg stitch (no Playwright recordVideo).
 * Output: demo/recordings/pr-guard-demo.mp4
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE = process.env.TRUEFORGE_URL || 'http://localhost:8790';
const PR_URL =
  process.env.PR_URL ||
  'https://github.com/sridhar852002/vulnerable-api-fixture/pull/1';
const OUT_DIR = path.join(__dirname, '..', 'demo', 'recordings');
const FRAMES = path.join(OUT_DIR, 'frames');
const FFMPEG =
  process.env.FFMPEG ||
  '/var/folders/qj/5703kv591zd8v_my5vgp9jrc0000gn/T/cursor-sandbox-cache/dded340c4a92eed12566273a4af8c42d/playwright/ffmpeg-1011/ffmpeg-mac';

let frame = 0;

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

async function snap(page, label) {
  frame += 1;
  const file = path.join(FRAMES, `frame_${String(frame).padStart(4, '0')}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`frame ${frame}: ${label}`);
}

async function hold(page, label, seconds, fps = 1) {
  const n = Math.max(1, Math.round(seconds * fps));
  for (let i = 0; i < n; i++) {
    await snap(page, `${label} (${i + 1}/${n})`);
    await sleep(1000 / fps);
  }
}

async function pollTurn(sessionId, turnId) {
  for (let i = 0; i < 90; i++) {
    const t = await api('GET', `/api/v1/sessions/${sessionId}/turns/${turnId}`);
    const status = t.data?.state?.status;
    if (status === 'done' || status === 'failed' || status === 'error') return t.data;
    await sleep(3000);
  }
  throw new Error('turn timeout');
}

async function main() {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  await api('GET', '/api/v1/agents');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await hold(page, 'home', 3);

  const settingsBtn = page.getByRole('button', { name: /Settings/i }).first();
  if (await settingsBtn.isVisible().catch(() => false)) {
    await settingsBtn.click();
    await hold(page, 'settings', 4);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(500);
  }

  const session = await api('POST', '/api/v1/sessions', { agent: { name: 'pr-guard' } });
  const sessionId = session.data.id;
  console.log('Session', sessionId);
  const sessionUrl = `${BASE}/sessions/${sessionId}`;

  await page.goto(sessionUrl, { waitUntil: 'networkidle' });
  await hold(page, 'session-open', 2);

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
  console.log('Turn1', turn1Id);

  // Capture while agent works
  for (let i = 0; i < 20; i++) {
    const t = await api('GET', `/api/v1/sessions/${sessionId}/turns/${turn1Id}`);
    const status = t.data?.state?.status;
    const actions = t.data?.state?.required_actions || [];
    console.log(`poll ${i} status=${status} actions=${actions.length}`);
    await page.goto(sessionUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await hold(page, `working-${status}`, 2);
    if (status === 'done' || status === 'failed' || status === 'error') {
      var turnData = t.data;
      break;
    }
  }
  if (!turnData) turnData = await pollTurn(sessionId, turn1Id);

  await page.goto(sessionUrl, { waitUntil: 'networkidle' });
  const actions = turnData.state?.required_actions || [];
  console.log('actions', actions.length);

  if (actions.length > 0) {
    await hold(page, 'approval-gate', 12); // long hold for voice-over
    const action = actions[0];
    const allowBtn = page.getByRole('button', { name: /^Allow$/i }).first();
    if (await allowBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allowBtn.click();
      await hold(page, 'after-allow-ui', 15);
    } else {
      await api('POST', `/api/v1/sessions/${sessionId}/turns`, {
        stream: false,
        previous_turn_id: turn1Id,
        input: [
          {
            type: 'user.tool_approval',
            thread_id: action.thread_id,
            tool_call_id: action.tool_calls[0].id,
            approval: { status: 'allow' },
          },
        ],
      }).then(async (t2) => {
        console.log('Turn2', t2.data.id);
        await pollTurn(sessionId, t2.data.id);
      });
      await page.goto(sessionUrl, { waitUntil: 'networkidle' });
      await hold(page, 'after-allow-api', 10);
    }
  } else {
    await hold(page, 'final-no-gate', 8);
  }

  // Show GitHub PR in a tab for the "review landed" beat
  await page.goto(PR_URL, { waitUntil: 'domcontentloaded' });
  await hold(page, 'github-pr', 8);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await hold(page, 'end', 3);

  await browser.close();

  const out = path.join(OUT_DIR, 'pr-guard-demo.mp4');
  console.log('Stitching with ffmpeg...');
  const r = spawnSync(
    FFMPEG,
    [
      '-y',
      '-framerate',
      '1',
      '-i',
      path.join(FRAMES, 'frame_%04d.png'),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '1',
      out,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    // fallback: copy frames note
    throw new Error('ffmpeg stitch failed');
  }
  console.log('Saved:', out);
  console.log('Open session:', sessionUrl);
  console.log('Add voice in CapCut/iMovie → export → YouTube Unlisted.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
