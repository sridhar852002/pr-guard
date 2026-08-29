# Submission checklist

Deadline: **August 30, 2026, 8:00 PM London** (Aug 31 12:30 AM IST).  
Submit: https://forms.gle/PxGLsWW1HPyroQ5u9 · Register: https://forms.gle/dNHFh7wH8uJj4bZH8

**Playbook:** see [`WIN.md`](WIN.md) for ordered steps.

## Repo & harness

- [ ] Repo is **public** on GitHub
- [ ] `./scripts/smoke-check.sh` passes with harness running
- [ ] `./scripts/register-agent.sh` creates agent successfully
- [ ] Approval gate verified on fixture PR (Allow/Deny before post)
- [ ] Session persistence clip recorded (restart → reopen session)
- [ ] No keys in repo or video

## Qodo (required — judges open your PRs)

- [ ] Qodo GitHub app installed on repo
- [ ] 2+ substantive PRs: branch → PR → `/agentic_review` → fix/dismiss → merge
- [ ] README § Qodo Code Review Evidence filled with merged PR link
- [ ] High-severity findings fixed; dismissals have reasons in thread

## Demo & submit

- [ ] Fixture PR from `demo/vulnerable-api` (not random repo)
- [ ] ~3 min YouTube uploaded (unlisted OK)
- [ ] [`SUBMISSION.md`](SUBMISSION.md) answers copied to form
- [ ] Track: **Best Use of TrueForge (DGX Spark)**
- [ ] Optional: publish [`BLOG_DRAFT.md`](BLOG_DRAFT.md) for Field Report track
- [ ] Optional: social clip — tag @WeMakeDevs @TrueFoundry @Qodo
- [ ] Star https://github.com/truefoundry/trueforge (MX Master 3 draw)

## Last 10 minutes

- [ ] Stranger test: clone README steps on fresh machine
- [ ] PR history tells the build story (not one giant commit)
