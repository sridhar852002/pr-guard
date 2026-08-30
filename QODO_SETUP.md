# Qodo setup (5 minutes)

Required for **every** hackathon submission — including DGX Spark and iPad tracks.

## 1. Install GitHub app

1. Sign in at [app.qodo.ai](https://app.qodo.ai)
2. **Integrations → SaaS → GitHub → Add installation**
3. Authorize **`sridhar852002/pr-guard`**
4. Confirm the repo appears as **active** in the Qodo portal

No credit card for the 14-day trial.

## 2. Trigger review on open PR

Open PR: https://github.com/sridhar852002/pr-guard/pull/1

If Qodo does not start automatically, comment:

```
/agentic_review
```

## 3. Respond to findings

| Severity | Action |
|----------|--------|
| **High** | Fix before merge, or dismiss in Qodo thread with a written reason |
| Medium / Low | Your call — document if you dismiss |

Push fixes → comment `/agentic_review` again → merge when clean.

## 4. Update README

Fill **§ Qodo Code Review Evidence** in `README.md` with:

- Link to the merged PR
- What Qodo found
- What you fixed or dismissed (and why)

## Verify locally

```bash
./scripts/qodo-check.sh
```

## Troubleshooting

- **No bot response:** repo not authorized in Qodo portal, or app not installed on the org/user account that owns the repo
- **Wrong repo:** re-add installation and select `sridhar852002/pr-guard`
- **Still stuck:** repo owner must complete step 1 (teammates cannot install for you)
