# Demo script (~3 minutes)

Judges score the demo as hard as the code. The approval gate is *"the one nobody films"* — yours must be on screen 20+ seconds.

**Use the fixture PR** (`demo/vulnerable-api`) — never a random live PR.

---

**0:00–0:15 — Hook**

"Code review is the workflow everyone runs and nobody trusts an agent with — it needs real repo access, sandboxed test runs, and one irreversible public step. PR Guard does all three on TrueForge."

**0:15–0:35 — Harness setup (not just chat)**

Split screen or cut:
- TrueForge Settings → Connectors → GitHub connected
- Settings → Sandbox (local or Daytona)
- Agents → pr-guard selected

"Real MCP tool, real sandbox — not mocked."

**0:35–1:25 — Run on fixture PR**

Paste: `Review this pull request end to end: https://github.com/sridhar852002/vulnerable-api-fixture/pull/1`

Narrate agent steps as they stream:
- `pull_request_read` — reading diff
- Sandbox — cloning, `npm test`
- Skill load — security-code-review gates
- **Subagents** — point at steps panel if two parallel branches appear

**1:25–1:50 — Draft review**

Scroll the drafted comment in chat:
- Test result (pass)
- `[High] Secrets handling — src/config.js:2 — hardcoded API key — move to env var`
- `[High] Injection — src/login.js:6 — concatenated username in query string — use parameterized queries`
- `[Medium] Auth — src/login.js:18 — adminAction has no caller check — add auth middleware`

**1:50–2:25 — THE GATE (mandatory full-screen shot)**

TrueForge pauses on `pull_request_review_write`. Show tool name + args + **Allow / Deny**.

Narrate: "This step needs a licence to proceed — the only irreversible call in the flow."

Click **Allow**. Cut to GitHub PR — review comment visible.

**2:25–2:45 — Session persistence (Double-O bonus)**

Quick cut: stop TrueForge, restart, reopen same session from sidebar. "Harness session survived restart — not a one-shot demo."

**2:45–3:00 — Close**

"PR Guard formalizes security review with harness primitives: MCP, sandbox, skills, subagents, approval, sessions. Qodo evidence in the README."

Point at README Qodo section + repo structure.

---

## Before you record

- [ ] `./scripts/smoke-check.sh` passes
- [ ] Approval gate confirmed on dry run (Allow/Deny before post)
- [ ] Fixture PR open in second browser tab
- [ ] No API keys on screen
- [ ] Session restart clip pre-recorded if live restart is flaky

## After recording

- [ ] Upload unlisted YouTube
- [ ] Fill `SUBMISSION.md` and submit form
- [ ] Post clip to X/LinkedIn — tag @WeMakeDevs @TrueFoundry @Qodo
