#!/usr/bin/env node
/**
 * Encode demo/recordings/frames/*.png → pr-guard-demo.webm via Chrome MediaRecorder.
 * No system ffmpeg required. Silent — add voice later.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'demo', 'recordings');
const FRAMES = path.join(OUT_DIR, 'frames');
const OUT = path.join(OUT_DIR, 'pr-guard-demo.webm');

async function main() {
  const files = fs
    .readdirSync(FRAMES)
    .filter((f) => /^frame_\d+\.png$/.test(f))
    .sort();
  if (!files.length) throw new Error('No frames');

  const dataUrls = files.map((f) => {
    const b = fs.readFileSync(path.join(FRAMES, f));
    return 'data:image/png;base64,' + b.toString('base64');
  });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();

  // Load blank page and inject recorder
  await page.setContent('<canvas id="c" width="1440" height="900"></canvas>');

  const webmBase64 = await page.evaluate(async ({ dataUrls }) => {
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(0); // manual frame advances
    const chunks = [];
    const rec = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm',
      videoBitsPerSecond: 2500000,
    });
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise((resolve) => {
      rec.onstop = resolve;
    });
    rec.start(100);

    function load(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }

    const track = stream.getVideoTracks()[0];
    for (const src of dataUrls) {
      const img = await load(src);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // request a frame for captureStream(0)
      if (track.requestFrame) track.requestFrame();
      await new Promise((r) => setTimeout(r, 1000)); // 1 fps
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
  }, { dataUrls });

  await browser.close();

  fs.writeFileSync(OUT, Buffer.from(webmBase64, 'base64'));
  console.log('Saved', OUT, '(' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');
  console.log('Duration ~' + files.length + 's at 1fps. Add voice in CapCut → export MP4 → YouTube Unlisted.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
