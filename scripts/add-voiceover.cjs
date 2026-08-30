#!/usr/bin/env node
/**
 * Add human-like voiceover to pr-guard-demo-live.webm
 *
 * Provider priority (first key wins):
 *   ELEVENLABS_API_KEY → most natural
 *   OPENAI_API_KEY     → tts-1-hd
 *   (default)          → Microsoft Edge neural TTS (free, no key)
 *
 * Usage:
 *   npm install
 *   node scripts/add-voiceover.cjs
 *
 * Optional env:
 *   VOICE_PROVIDER=edge|openai|elevenlabs
 *   INPUT_WEBM=demo/recordings/pr-guard-demo-live.webm
 *   OUTPUT_MP4=demo/recordings/pr-guard-demo-with-voice.mp4
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'demo', 'voiceover-script.json');
const INPUT =
  process.env.INPUT_WEBM ||
  path.join(ROOT, 'demo', 'recordings', 'pr-guard-demo-live.webm');
const OUTPUT =
  process.env.OUTPUT_MP4 ||
  path.join(ROOT, 'demo', 'recordings', 'pr-guard-demo-with-voice.mp4');
const WORK = path.join(ROOT, 'demo', 'recordings', '.voice-work');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function ffmpegBin() {
  try {
    return require('ffmpeg-static');
  } catch {
    const which = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
    throw new Error(
      'ffmpeg not found. Run: npm install (includes ffmpeg-static) or brew install ffmpeg'
    );
  }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')}\n${r.stderr || r.stdout || 'failed'}`
    );
  }
  return r;
}

function probeDurationSec(file) {
  const ff = ffmpegBin();
  const r = spawnSync(
    ff,
    [
      '-hide_banner',
      '-i',
      file,
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' }
  );
  const m = (r.stderr || '').match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

function pickProvider(forced) {
  if (forced && forced !== 'auto') return forced;
  if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'edge';
}

async function synthEdge(text, outFile, voice, prosody) {
  const { EdgeTTS } = await import('edge-tts-universal');
  const chosen = process.env.VOICE_EDGE || voice;
  const tts = new EdgeTTS(text, chosen, {
    rate: prosody.rate || '+0%',
    pitch: prosody.pitch || '+0Hz',
    volume: prosody.volume || '+0%',
  });
  const result = await tts.synthesize();
  const buf = Buffer.from(await result.audio.arrayBuffer());
  fs.writeFileSync(outFile, buf);
}

function humanizeClip(inFile, outFile, ff) {
  // Warm, podcast-style chain — tames the flat TTS timbre a little.
  run(ff, [
    '-i',
    inFile,
    '-af',
    'highpass=f=90,lowpass=f=11000,equalizer=f=250:t=q:w=1.2:g=2,equalizer=f=3000:t=q:w=1.5:g=-1.5,acompressor=threshold=-20dB:ratio=2.5:attack=12:release=120,volume=1.05',
    '-ar',
    '44100',
    '-ac',
    '1',
    '-q:a',
    '2',
    '-y',
    outFile,
  ]);
}

async function synthOpenAI(text, outFile, voice) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      voice: voice || 'nova',
      input: text,
      response_format: 'mp3',
      speed: 0.95,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI TTS ${res.status}: ${await res.text()}`);
  }
  fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
}

async function synthElevenLabs(text, outFile, voiceId) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY not set');
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.38,
          similarity_boost: 0.82,
          style: 0.42,
          use_speaker_boost: true,
        },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  }
  fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
}

async function synthSegment(provider, text, outFile, cfg, ff) {
  const raw = outFile.replace(/\.mp3$/, '.raw.mp3');
  if (provider === 'elevenlabs') {
    await synthElevenLabs(text, raw, cfg.voice.elevenlabs);
  } else if (provider === 'openai') {
    await synthOpenAI(text, raw, cfg.voice.openai);
  } else {
    await synthEdge(text, raw, cfg.voice.edge, cfg.prosody);
  }
  if (provider === 'edge') {
    humanizeClip(raw, outFile, ff);
    fs.unlinkSync(raw);
  } else {
    fs.renameSync(raw, outFile);
  }
}

function buildTimeline(segments, workDir, provider, cfg, ff) {
  return (async () => {
    const clips = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const clip = path.join(workDir, `seg-${String(i).padStart(2, '0')}.mp3`);
      process.stdout.write(`  [${i + 1}/${segments.length}] t=${seg.at}s … `);
      await synthSegment(provider, seg.text, clip, cfg, ff);
      const dur = probeDurationSec(clip);
      console.log(`${(dur || 0).toFixed(1)}s`);
      clips.push({ ...seg, file: clip, dur: dur || 0 });
    }
    return clips;
  })();
}

function mixTimeline(clips, totalSec, outAudio, ff) {
  const args = [
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=44100:cl=stereo:d=${totalSec.toFixed(3)}`,
  ];
  for (const clip of clips) {
    args.push('-i', clip.file);
  }

  const filters = [];
  for (let i = 0; i < clips.length; i++) {
    const delayMs = Math.max(0, Math.round(clips[i].at * 1000));
    filters.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
  }
  const mixInputs = ['[0:a]', ...clips.map((_, i) => `[a${i}]`)].join('');
  filters.push(
    `${mixInputs}amix=inputs=${clips.length + 1}:duration=first:dropout_transition=0[out]`
  );

  run(ff, [
    ...args,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[out]',
    '-t',
    String(totalSec),
    '-c:a',
    'libmp3lame',
    '-q:a',
    '2',
    '-y',
    outAudio,
  ]);
}

function muxVideoAudio(video, audioMp3, outMp4, ff) {
  run(ff, [
    '-i',
    video,
    '-i',
    audioMp3,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-shortest',
    '-y',
    outMp4,
  ]);
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error('Missing input video:', INPUT);
    console.error('Run: node scripts/record-live-realtime.cjs first');
    process.exit(1);
  }

  const cfg = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf8'));
  const provider = pickProvider(process.env.VOICE_PROVIDER);
  ensureDir(WORK);

  const ff = ffmpegBin();
  const videoDur = probeDurationSec(INPUT);
  const totalSec = videoDur && videoDur > 30 ? videoDur : 119;

  console.log('PR Guard voiceover');
  console.log('  input :', INPUT);
  console.log('  output:', OUTPUT);
  console.log('  video :', videoDur ? `${videoDur.toFixed(1)}s` : `~${totalSec}s (assumed)`);
  console.log('  voice :', provider);
  if (provider === 'edge') {
    console.log('  edge  :', process.env.VOICE_EDGE || cfg.voice.edge);
    console.log('  tip   : Edge still sounds synthetic. For truly human voice:');
    console.log('          export ELEVENLABS_API_KEY=... && VOICE_PROVIDER=elevenlabs node scripts/add-voiceover.cjs');
  }

  console.log('\nSynthesizing segments…');
  const clips = await buildTimeline(cfg.segments, WORK, provider, cfg, ff);

  const timelineMp3 = path.join(WORK, 'timeline.mp3');
  console.log('\nMixing timeline…');
  mixTimeline(clips, totalSec, timelineMp3, ff);

  console.log('Muxing video + voice…');
  muxVideoAudio(INPUT, timelineMp3, OUTPUT, ff);

  const outDur = probeDurationSec(OUTPUT);
  const stat = fs.statSync(OUTPUT);
  console.log('\nDone.');
  console.log('  file    :', OUTPUT);
  console.log('  size    :', (stat.size / 1024 / 1024).toFixed(2), 'MB');
  console.log('  duration:', outDur ? `${outDur.toFixed(1)}s` : 'unknown');
  console.log('\nUpload to YouTube as Unlisted → paste link in hackathon form.');
}

main().catch((e) => {
  console.error('\nVoiceover failed:', e.message);
  process.exit(1);
});
