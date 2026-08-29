# How I built PR Guard: approval-gated security review without trusting the model

*Draft for DEV.to / Field Report track (Keychron keyboard). Publish and add link to submission form.*

---

Handing code review to an LLM is easy. Handing it **safely** is not — the agent needs your GitHub, has to run untrusted code from the PR branch, and the last step posts a public comment you cannot unsend.

For the [Agent Harness Hackathon](https://www.wemakedevs.org/hackathons/trueforge), I built **PR Guard** on [TrueForge](https://trueforge.dev): an agent that reads a PR via MCP, runs tests in a sandbox, applies a security checklist skill, and **pauses for Allow** before `pull_request_review_write`.

## The job, not the chat

WeMakeDevs' advice stuck: give the agent a **real job**, not another chat-with-my-data wrapper. Code review is that job — every team already does it, and it naturally needs the harness primitives judges look for.

## What TrueForge handled

| Piece | My use |
|---|---|
| MCP | GitHub read autonomous; write gated |
| Sandbox | Clone PR head, `npm test` in isolation |
| Skills | Gate-based `SKILL.md` for diff-only security scan |
| Subagents | Test run parallel to security scan |
| Approval | Literal gate on `pull_request_review_write` |
| Sessions | Review survives harness restart |

## The approval trap I almost missed

Default `@write`/`@destructive` gates **do not** pause unannotated MCP tools. I read TrueForge's `toolSelectors.ts` — unannotated tools are exempt unless named explicitly. GitHub's review tool might not carry the right annotation. Fix: gate the literal tool name in the agent manifest via API (the Save Agent UI doesn't expose this field).

**Lesson:** test the Allow/Deny pause on a real PR before you film anything.

## Fixture-first demos

Live PRs are unpredictable. I ship `demo/vulnerable-api` — a tiny repo with intentional vulns (hardcoded secret, injection pattern, missing auth) where tests still pass. The demo always finds something worth posting.

## Qodo as part of the story

Every change went through PR + `/agentic_review`. [FILL: your finding and fix]. Meta twist: PR Guard reviews PRs; Qodo reviewed PR Guard.

## What I'd do next

Inline comments per finding (blocked by a GitHub MCP bug on out-of-diff lines), CI integration, and a phone-friendly approval queue.

---

**Repo:** https://github.com/sridhar852002/pr-guard  
**Demo PR (use this in TrueForge):** https://github.com/sridhar852002/vulnerable-api-fixture/pull/1  
**Qodo PR:** https://github.com/sridhar852002/pr-guard/pull/1

Built with TrueForge. Reviewed with Qodo. #AgentHarness #TrueForge #WeMakeDevs
