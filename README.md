# PR Guard — approval-gated security review on TrueForge

Built for [WeMakeDevs' Agent Harness Hackathon](https://www.wemakedevs.org/hackathons/trueforge) — **Best Use of TrueForge (DGX Spark)** · **Best UI (iPad)** · Qodo code quality trail.

**Real job:** hand a pull request to an agent that reads it, runs tests in a sandbox, scans for security issues, and **stops for your Allow** before posting a public review.

## PR Guard Console (Best UI)

Research-backed **agent operation center** — not default chat. Built for the hackathon **Best UI (iPad)** track:

- **Intervention queue first** — approval gate always visible at top with evidence pack (tool, why, payload)
- **Linear/Vercel dark-first** — layered surfaces, single accent, keyboard shortcuts
- **Live trace + findings cards** — severity-parsed security results, elapsed timer, subagent indicators

```bash
npx @truefoundry/trueforge@latest          # terminal 1
./scripts/register-agent.sh               # once
npm run ui                                # terminal 2 → http://localhost:8800
```

Film the **approval gate section** and **Allow click** for judges. Shortcuts: `⌘↵` start · `A` allow · `D` deny.

## Harness features (what judges score)

| TrueForge capability | PR Guard |
|---|---|
| MCP tools | GitHub — `pull_request_read` + gated `pull_request_review_write` |
| Sandbox | Clone PR branch, run real test suite in isolation |
| Skills | `security-code-review` — gate-based diff scan |
| Subagents | Test run ∥ security scan in parallel |
| Approval gate | Literal tool name gate — pause before the one irreversible write |
| Sessions | SQLite persistence — survives restart (demo this!) |

## Quick start

**Prerequisites:** Node 22+, model API key, GitHub PAT (fine-grained: PR read/write on demo repo only).

```bash
# 1. Start harness
npx @truefoundry/trueforge@latest
# → http://localhost:8790

# 2. Add model (Settings → Models) and GitHub connector (Settings → Connectors, name: github)

# 3. Register agent (defaults to fireworks/minimax-m3 — see FIREWORKS.md)
./scripts/register-agent.sh

# 4. Import skill (after pushing this repo public)
PR_GUARD_REPO_URL=https://github.com/sridhar852002/pr-guard ./scripts/import-skill.sh

# 5. Run on a fixture PR (reliable demo — see demo/vulnerable-api/)
```

**macOS:** local sandbox uses seatbelt — no bwrap needed. **Linux:** `apt install bubblewrap socat ripgrep` or use Daytona.

### Approval gate (critical)

The default `@write`/`@destructive` gate is **not enough** — unannotated MCP tools are exempt unless explicitly named. This agent gates `pull_request_review_write` by literal name. Create the agent via API (`scripts/register-agent.sh`), not Save Agent UI — the UI doesn't expose approval selectors.

**Test the gate before recording your demo.** Paste a PR URL, confirm Allow/Deny appears before the review posts.

## Demo fixture

Don't demo on random PRs. Use the intentional vuln fixture:

```bash
./scripts/create-fixture-pr.sh   # creates feat/insecure-login branch locally
# Push demo/vulnerable-api to its own GitHub repo, open PR, use that URL
```

Fixture includes: hardcoded secret, injection pattern, missing auth — tests pass, security scan should fail.

## Session persistence (Double-O differentiator)

Winning submissions demo restart survival:

1. Start a review, let sandbox progress begin.
2. Stop TrueForge (`Ctrl+C`), restart it.
3. Reopen the same session in the sidebar — context intact.
4. **Film 10 seconds of this** — most teams skip it.

## Qodo Code Review Evidence

Hackathon rule: every substantive change goes through a PR reviewed by Qodo before merge.

- **Representative PR:** https://github.com/sridhar852002/pr-guard/pull/1 — submission pack: PR Guard Console UI, voiceover pipeline, Qodo workflow docs
- **What Qodo surfaced:** High — wildcard CORS on API proxy; unvalidated PR URL in agent prompt; `innerHTML` log sink; `submitApproval` cleared pending action before use; CLI auto-allowed reviews by default. Medium — missing Playwright dep, failing `npm test`, qodo-check false positives.
- **What we did:** Removed wildcard CORS + allowlisted loopback API routes; validated GitHub PR URLs; safe DOM logging; fixed approval race; default `PR_GUARD_AUTO_ALLOW=0`; added Playwright devDep + fixture `npm test`; hardened qodo-check exits.
- **Follow-up review:** `/agentic_review` after fixes → merge

**Setup:** [`QODO_SETUP.md`](QODO_SETUP.md) · verify: `./scripts/qodo-check.sh`

## Docs

| File | Purpose |
|---|---|
| [`WIN.md`](WIN.md) | Step-by-step win playbook (~24h left) |
| [`SUBMISSION.md`](SUBMISSION.md) | Form copy-paste answers |
| [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) | 3-minute video shot list |
| [`BLOG_DRAFT.md`](BLOG_DRAFT.md) | Field Report track (Keychron) |
| [`SUBMISSION_CHECKLIST.md`](SUBMISSION_CHECKLIST.md) | Pre-submit gate |

## Agent spec

[`agent/pr-guard.agent.json`](agent/pr-guard.agent.json) — edit `mcp_servers[0].name` if your GitHub connector isn't named `github`. Override model via `PR_GUARD_MODEL` in `scripts/register-agent.sh`.

## Why this beats "another chatbot"

WeMakeDevs: *"Give your agent a real job instead of building another chat-with-my-data app."* Code review needs real GitHub access, sandboxed test execution, and a human gate before an irreversible public action — exactly what an agent harness is for.
