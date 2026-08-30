#!/usr/bin/env node
/**
 * REAL continuous screen recording (not frame slideshow).
 * Uses headed Chrome + macOS `screencapture -v`.
 * Output: demo/recordings/pr-guard-demo-live.mp4
 */
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = process.env.TRUEFORGE_URL || 'http://localhost:8790';
const PR_URL =
  process.env.PR_URL ||
  'https://github.com/sridhar852002/vulnerable-api-fixture/pull/1';
const OUT_DIR = path.join(__dirname, '..', 'demo', 'recordings');
const OUT = path.join(OUT_DIR, 'pr-guard-demo-live.mp4');
const DURATION = Number(process.env.DEMO_SECONDS || 100);

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
    await sleep(3000);
  }
  throw new Error('turn timeout');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

  await api('GET', '/api/v1/agents');

  console.log('Launching visible Chrome...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: [
      '--window-size=1440,900',
      '--window-position=40,40',
      '--disable-infobars',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(2000);

  // Open settings briefly
  const settingsBtn = page.getByRole('button', { name: /Settings/i }).first();
  if (await settingsBtn.isVisible().catch(() => false)) {
    await settingsBtn.click();
    await sleep(2500);
    await page.keyboard.press('Escape').catch(() => {});
  }

  const session = await api('POST', '/api/v1/sessions', { agent: { name: 'pr-guard' } });
  const sessionId = session.data.id;
  const sessionUrl = `${BASE}/sessions/${sessionId}`;
  console.log('Session', sessionId);
  await page.goto(sessionUrl, { waitUntil: 'networkidle' });
  await sleep(1500);

  // Start macOS continuous video capture of main display
  console.log(`Starting screencapture -v for ${DURATION}s → ${OUT}`);
  const cap = spawn(
    'screencapture',
    ['-x', '-C', '-D', '1', '-v', `-V${DURATION}`, OUT],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let capErr = '';
  cap.stderr.on('data', (d) => {
    capErr += d.toString();
  });
  cap.stdout.on('data', (d) => {
    process.stdout.write(d);
  });

  // Give recorder a moment to arm
  await sleep(2000);

  console.log('Starting full review (live UI)...');
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

  // Keep session page focused / refreshed so live updates show
  const watch = (async () => {
    for (let i = 0; i < 40; i++) {
      try {
        await page.bringToFront();
        // Light interaction so UI stays active; avoid full reload thrash
        await page.mouse.move(200 + (i % 5) * 10, 200);
      } catch (_) {}
      await sleep(2500);
    }
  })();

  const turnData = await pollTurn(sessionId, turn1Id);
  const actions = turnData.state?.required_actions || [];
  console.log('Turn done, actions=', actions.length);

  await page.goto(sessionUrl, { waitUntil: 'networkidle' });
  await sleep(2000);

  if (actions.length > 0) {
    console.log('Holding on approval gate for camera...');
    await sleep(8000);
    const allowBtn = page.getByRole('button', { name: /^Allow$/i }).first();
    if (await allowBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Clicking Allow...');
      await allowBtn.click();
      await sleep(12000);
    } else {
      console.log('Allow not visible — API allow');
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
      await sleep(8000);
    }
  }

  console.log('Opening GitHub PR...');
  await page.goto(PR_URL, { waitUntil: 'domcontentloaded' });
  await sleep(8000);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  await watch.catch(() => {});

  // Wait for screencapture to finish if still running
  const code = await new Promise((resolve) => {
    if (cap.exitCode != null) return resolve(cap.exitCode);
    const t = setTimeout(() => {
      try {
        cap.kill('SIGINT');
      } catch (_) {}
      resolve(-1);
    }, (DURATION + 5) * 1000);
    cap.on('close', (c) => {
      clearTimeout(t);
      resolve(c);
    });
  });

  await browser.close();

  if (!fs.existsSync(OUT) || fs.statSync(OUT).size < 1000) {
    console.error('screencapture failed or empty file.');
    console.error(capErr || '(no stderr)');
    console.error(
      'macOS may need Screen Recording permission for Terminal/Cursor:\n' +
        'System Settings → Privacy & Security → Screen Recording → enable Cursor (or Terminal), then re-run.',
    );
    process.exit(1);
  }

  console.log('LIVE VIDEO SAVED:', OUT);
  console.log('Size:', Math.round(fs.statSync(OUT).size / 1024 / 1024) + ' MB');
  console.log('Add voice in CapCut → YouTube Unlisted.');
  spawnSync('open', ['-R', OUT]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
