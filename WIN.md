# Win playbook — DGX Spark (Best Use of TrueForge)

Research from [Undox](https://dev.to/manasdutta/undox-approval-gated-data-broker-opt-outs-on-trueforge-219m), [SentryOps](https://dev.to/dharm_koshiya_41aa1154100/building-sentryops-safe-autonomous-incident-remediation-with-trueforge-and-qodo-2pmc), [TreasuryForge](https://dev.to/codedpool/i-built-an-autonomous-treasury-agent-then-let-a-code-review-bot-find-every-way-it-could-lose-money-4ocf), and WeMakeDevs' own guidance.

## What actually wins Double-O

Judges reward **harness depth**, not chat cleverness. Your demo must prove five things on screen:

| Harness feature | How PR Guard proves it | Demo shot |
|---|---|---|
| MCP real tool | GitHub reads PR diff, posts review | Settings → Connectors + PR open in 2nd tab |
| Sandbox | Clones PR branch, runs `npm test` | Agent steps showing sandbox exec |
| Approval gate | Pause on `pull_request_review_write` | **Allow/Deny UI — full screen, 20+ seconds** |
| Subagents | Test run ∥ security scan | Agent-steps panel with two parallel branches |
| Session persistence | Resume after refresh/restart | See below |

WeMakeDevs literally said: give the agent a **real job**, not "chat with my data."

PR Guard is that job: code review with real repo access, untrusted code execution, and one irreversible public action.

## Competitive edge vs other submissions

Most teams will ship incident-response or research agents (WeMakeDevs' suggested examples). PR Guard is differentiated because:

1. **Meta fit** — you're using an agent harness *to review code built with Qodo*, which is the hackathon's required workflow.
2. **Verifiable output** — judges can open the PR and see the posted review; not just chat text.
3. **Conservative security skill** — file:line findings with severity discipline reads like production tooling, not prompt theater.

## Non-negotiables before submit (~24h left)

Do these in order. Skip none.

### 1. Push public repo (30 min)

```bash
gh repo create pr-guard --public --source=. --push
# or create on GitHub manually, then:
git remote add origin git@github.com:YOU/pr-guard.git
git push -u origin main
```

### 2. Qodo PR trail (1–2 hours)

Judges **open your PRs**. One merged PR is minimum; three is better.

```bash
git checkout -b feat/submission-pack
# push, open PR, comment /agentic_review on GitHub
# fix High findings, push again, /agentic_review again, merge
# paste link + summary into README § Qodo Code Review Evidence
```

### 3. Fixture-first demo (45 min)

**Never demo on a random live PR.** Use `demo/vulnerable-api`:

```bash
./scripts/create-fixture-pr.sh
# push demo/vulnerable-api to github.com/YOU/vulnerable-api-fixture
# open PR feat/insecure-login → main
```

Fixture guarantees: hardcoded secret, injection pattern, missing auth — tests pass, security scan fails.

### 4. Prove approval gate (15 min, do BEFORE recording)

```bash
npx @truefoundry/trueforge@latest
./scripts/register-agent.sh
# PR Guard session → paste fixture PR URL
# Confirm Allow/Deny appears BEFORE pull_request_review_write
```

If it doesn't pause, stop and fix before filming anything.

### 5. Session persistence shot (10 min) — Undox's Double-O secret

Winners demo **restart survival**:

1. Start review on fixture PR; let it reach sandbox + partial progress.
2. Copy session URL or note session in sidebar.
3. Stop TrueForge (`Ctrl+C`), restart `npx @truefoundry/trueforge@latest`.
4. Reopen same session → show conversation + agent state still there.
5. Film 10 seconds of this in your demo — most teams skip it.

### 6. Record demo (45 min)

Follow `DEMO_SCRIPT.md` exactly. The approval gate gets **2:00–2:30** — not a voiceover, **on screen**.

Upload unlisted YouTube. Title: `PR Guard — approval-gated security review on TrueForge | Agent Harness Hackathon`.

### 7. Submit form (15 min)

Copy from `SUBMISSION.md`. Select track: **Best Use of TrueForge (NVIDIA DGX Spark)**.

Also enter all tracks (same project) but you can only win one.

### 8. Radio Traffic (optional, 5 min)

Post clip of Allow/Deny pause on X/LinkedIn. Tag `@WeMakeDevs`, `@TrueFoundry`, `@Qodo`.

## Form answers that score

**How did you use TrueForge?** Lead with the harness checklist (MCP + sandbox + approval + subagents + sessions), not the LLM.

**How did you use Qodo?** Name a specific High finding you fixed and one you dismissed with reason.

**What problem?** "Handing code review to an agent is unsafe without sandboxed test runs and a human gate before posting publicly."

## Honest odds

- Valid submission + certificate: **high** if you complete steps 1–7.
- DGX Spark win: **competitive** — PR Guard is a strong Double-O concept if the demo proves all five harness features live.
- One team wins. Execution beats ideas.

## Star TrueForge (free prize draw)

Star https://github.com/truefoundry/trueforge — separate Logitech MX Master 3 draw, no project required.
