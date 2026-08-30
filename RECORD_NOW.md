# Full-length live demo (use THIS)

## File (ready to upload — NEW console UI)

**`demo/recordings/pr-guard-console-with-voice.mp4`** — PR Guard Console + AI voice (~202s)

Also: silent `pr-guard-console-demo.webm` · older TrueForge UI: `pr-guard-demo-with-voice.mp4`

| | |
|---|---|
| Size | ~4.6 MB |
| **Duration** | **~119 seconds** |
| Resolution | 1440×900 |
| Audio | AI voice (Edge neural) — re-run script for ElevenLabs/OpenAI |

This replaces the old ~12s broken file (MediaRecorder “live” WebM without duration). Reload/re-open the file if your player still shows 12s (cached).

## Human-like AI voice (recommended)

Neural TTS timed to the demo — no mic needed:

```bash
npm install
node scripts/add-voiceover.cjs
# → demo/recordings/pr-guard-demo-with-voice.mp4
```

| Provider | Key | Quality |
|----------|-----|---------|
| **ElevenLabs** (best) | `ELEVENLABS_API_KEY` | Most human |
| OpenAI | `OPENAI_API_KEY` | Very natural (`tts-1-hd`) |
| Edge neural (default) | none | Free, no signup |

Force a provider: `VOICE_PROVIDER=elevenlabs node scripts/add-voiceover.cjs`

Edit lines/timing: `demo/voiceover-script.json`

## Manual voice → submit

1. CapCut → import `pr-guard-demo-live.webm`
2. Record voice-over (~2 min)
3. Export **MP4**
4. YouTube → **Unlisted**
5. Form: https://forms.gle/PxGLsWW1HPyroQ5u9

### Voice script (~2 min)

> PR Guard is a security-aware code review agent on TrueForge.  
> Hand it a GitHub PR — it reads the diff over MCP, runs tests in the sandbox, and applies a security skill.  
> Here it reviews our intentional vuln fixture. Tests pass, but security still finds injection, missing auth, and a hardcoded API key.  
> Posting a public review is irreversible, so TrueForge pauses for Allow — the licence to act.  
> After Allow, the COMMENT review lands on the real PR.  
> Built with TrueForge: MCP, sandbox, skills, approval gate, and sessions.
