# Fireworks on a budget

Your TrueForge Fireworks catalog has 5 models. **Cheapest: `minimax-m3`** (~$0.30 in / $1.20 out per 1M tokens on Fireworks).

PR Guard defaults to **`fireworks/minimax-m3`** with credit-saving settings:

| Setting | Value | Why |
|---|---|---|
| `reasoning_effort` | `none` | Skips expensive reasoning tokens |
| `max_tokens` | 2048 | Enough for a review comment |
| `iteration_limit` | 40 | Enough for subagent demo depth |
| `dynamic_sub_agents` | **on** (for final demo) | Parallel test ∥ security scan — required for DGX track depth |
| `generative_ui` | off | Less overhead |

Register:

```bash
./scripts/register-agent.sh
# or override:
PR_GUARD_MODEL=fireworks/minimax-m3 ./scripts/register-agent.sh
```

## Even cheaper (optional)

TrueForge's built-in Fireworks catalog doesn't include tiny models. For **~$0.10/1M tokens**, add a custom provider:

1. **Settings → Models → Add custom provider**
2. Name: `fireworks-cheap`
3. Base URL: `https://api.fireworks.ai/inference/v1`
4. API key: same Fireworks key
5. Model ID: `accounts/fireworks/models/llama-v3p2-3b-instruct` (or `llama-v3p2-1b-instruct`)
6. Register agent with: `PR_GUARD_MODEL=fireworks-cheap/llama-v3p2-3b-instruct ./scripts/register-agent.sh`

## Avoid burning credits

- Demo on the **fixture PR only** (small diff): https://github.com/sridhar852002/vulnerable-api-fixture/pull/1
- Run **one** end-to-end test before recording
- Don't re-run failed sessions — start a new short prompt instead
- Fireworks free tier: **10 req/min** without a card — space out retries

## Model cost ranking (your Fireworks catalog)

| Model | Rough cost | Use for PR Guard? |
|---|---|---|
| **minimax-m3** | $ | **Yes — default** |
| kimi-k2p7-code | $$ | Code-heavy PRs only |
| deepseek-v4-pro | $$$$ | No — too expensive |
| glm-5p2 | $$$$ | No |
| kimi-k3 | $$$$$ | No |

Subagents are **on** in `agent/pr-guard.agent.json` for the final demo. Expect ~2× token use vs the smoke test. Record **one** take of the full flow, then submit.
