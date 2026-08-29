#!/usr/bin/env bash
# Register PR Guard agent with TrueForge (requires harness running on :8790).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="${PR_GUARD_MODEL:-fireworks/minimax-m3}"
GITHUB_CONNECTOR="${PR_GUARD_GITHUB_CONNECTOR:-github}"
BASE="${TRUEFORGE_URL:-http://localhost:8790}"

if ! curl -sf "$BASE/api/v1/agents" >/dev/null 2>&1; then
  echo "TrueForge not reachable at $BASE — start it first:"
  echo "  npx @truefoundry/trueforge@latest"
  exit 1
fi

TMP="$(mktemp)"
jq \
  --arg model "$MODEL" \
  --arg github "$GITHUB_CONNECTOR" \
  '.manifest.model.name = $model | .manifest.mcp_servers[0].name = $github' \
  "$ROOT/agent/pr-guard.agent.json" > "$TMP"

echo "Registering agent (model=$MODEL, github connector=$GITHUB_CONNECTOR)..."
curl -sf -X POST "$BASE/api/v1/agents" \
  -H "Content-Type: application/json" \
  -d @"$TMP" | jq .

rm -f "$TMP"
echo "Done. Open $BASE → Agents → pr-guard → New session"
