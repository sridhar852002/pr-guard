# Submission form copy-paste

Form: https://forms.gle/PxGLsWW1HPyroQ5u9  
Deadline: **Aug 30, 2026, 8:00 PM London** (Aug 31 12:30 AM IST)

Replace `YOUR_*` placeholders before submitting.

---

## Track

**Best Use of TrueForge (NVIDIA DGX Spark)** — primary  
**Best UI (iPad)** — secondary (PR Guard Console at `npm run ui`)  
(You can enter all tracks; you can only win one.)

## GitHub link

`https://github.com/sridhar852002/pr-guard`

## Deployed link

Leave blank (local TrueForge + fixture repo is fine).

## YouTube demo

Upload **`demo/recordings/pr-guard-console-your-voice.mp4`** (local only — not in git) as **Unlisted**, then paste that link.

## What does your project do?

PR Guard is a security-aware pull request review agent. Give it a GitHub PR URL and it reads the diff via MCP, runs the project's test suite in TrueForge's isolated sandbox, applies a gate-based security checklist (skill), drafts a ranked review, and **pauses for human Allow** before posting the single irreversible `pull_request_review_write` call. Built for teams who want agent-assisted review without blind trust.

## How did you use TrueForge in your project?

TrueForge is the entire runtime — not a wrapper:

- **MCP:** GitHub connector for `pull_request_read` (autonomous) and `pull_request_review_write` (approval-gated via explicit `require_approval_for_tools` literal, because unannotated tools bypass default `@write` gates).
- **Sandbox:** Clones the PR branch and runs the repo's test suite in isolation (local seatbelt on macOS / bwrap on Linux).
- **Skills:** `security-code-review` SKILL.md loaded on demand for diff-only security gates.
- **Subagents:** Test execution and security scanning delegated in parallel to keep root context clean.
- **Approval:** The only irreversible step (posting a public review) requires Allow in the chat UI — shown on camera in the demo.
- **Sessions:** Review state survives TrueForge restart; demo shows reopening the same session after `Ctrl+C`.

Agent spec: `agent/pr-guard.agent.json` (API-created because the UI doesn't expose approval tool selectors).

## How did you use Qodo in your project?

Every substantive change shipped via branch → PR → Qodo `/agentic_review` → fix or dismiss with reason → merge. See README § Qodo Code Review Evidence.

Representative PR: https://github.com/sridhar852002/pr-guard/pull/1 — Qodo found High issues (wildcard CORS, unvalidated PR URL, `innerHTML` log sink, approval race, CLI auto-allow). We fixed them, re-ran `/agentic_review`, then merged. Judges can open that PR for the full review trail.

## Blog link (optional — Field Report / Keychron track)

`https://dev.to/YOUR/post` or leave blank

See `BLOG_DRAFT.md` for a ready-to-publish post.
