# PR Guard

A pull request review agent on [TrueForge](https://github.com/truefoundry/trueforge). You give it a GitHub PR URL. It reads the diff, runs tests in a sandbox, scans for security issues, then **waits for your approval** before posting a public review.

```
PR URL → read (MCP) → sandbox tests ∥ security skill → draft → Allow/Deny → GitHub comment
```

The write is gated on purpose. Posting a review is irreversible, so `pull_request_review_write` is listed in `require_approval_for_tools`.

## Run it

Need Node 22+, TrueForge, a model key, and a GitHub PAT with PR read/write on the repos you review.

```bash
npx @truefoundry/trueforge@latest
# Settings → add a model and a GitHub connector named `github`

./scripts/register-agent.sh
npm install
npm run ui
```

Console: http://localhost:8800  
Harness: http://localhost:8790

Paste a PR URL and start a review. Shortcuts: `⌘↵` start, `A` allow, `D` deny.

Register via the script, not the agent Save UI — the UI does not expose per-tool approval selectors.

## Layout

```
agent/pr-guard.agent.json          # model, MCP, sandbox, subagents, approval
skills/security-code-review/       # gate-based diff scan (file + line)
ui/                                # operator console
scripts/register-agent.sh          # create the agent over the TrueForge API
scripts/full-review.sh             # CLI path (pauses at the gate unless you opt in)
demo/vulnerable-api/               # fixture with intentional vulns; tests still pass
```

Override the model with `PR_GUARD_MODEL`. Connector name with `PR_GUARD_GITHUB_CONNECTOR`.

## Fixture

[`demo/vulnerable-api`](demo/vulnerable-api) has a hardcoded secret, an injection pattern, and a missing auth check. Tests pass; the security scan should not.

Demo PR: https://github.com/sridhar852002/vulnerable-api-fixture/pull/1
