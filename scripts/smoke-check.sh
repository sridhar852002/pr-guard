#!/usr/bin/env bash
# Quick health check before recording your demo.
set -euo pipefail

BASE="${TRUEFORGE_URL:-http://localhost:8790}"
FAIL=0

check() {
  if "$@"; then
    echo "OK  $*"
  else
    echo "FAIL $*"
    FAIL=1
  fi
}

check curl -sf "$BASE/api/v1/health" >/dev/null
check test -n "${ANTHROPIC_API_KEY:-${OPENAI_API_KEY:-}}"
check command -v jq >/dev/null
check command -v node >/dev/null

if [[ -z "${GITHUB_TOKEN:-${GH_TOKEN:-}}" ]]; then
  echo "WARN  No GITHUB_TOKEN/GH_TOKEN — GitHub MCP will not work"
fi

if [[ $FAIL -eq 0 ]]; then
  echo "Harness looks reachable. Next: ./scripts/register-agent.sh"
else
  exit 1
fi
