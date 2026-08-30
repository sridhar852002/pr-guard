#!/usr/bin/env bash
# Quick check: is TrueForge up, is there an open PR, did Qodo comment?
set -euo pipefail

REPO="${PR_GUARD_REPO:-sridhar852002/pr-guard}"
BASE="${TRUEFORGE_URL:-http://localhost:8790}"
FAIL=0

fail() {
  echo "✗ $1"
  FAIL=1
}

ok() {
  echo "✓ $1"
}

echo "=== PR Guard pre-submit checks ==="

if curl -sf "$BASE/api/v1/agents" >/dev/null 2>&1; then
  ok "TrueForge reachable"
else
  fail "TrueForge not running — npx @truefoundry/trueforge@latest"
fi

echo ""
echo "Open PRs:"
gh pr list --repo "$REPO" --state open --json number,title,url --jq '.[] | "  #\(.number) \(.title)\n  \(.url)"' 2>/dev/null || fail "gh not authenticated"

echo ""
echo "Qodo comments on latest open PR:"
PR=$(gh pr list --repo "$REPO" --state open --json number --jq '.[0].number' 2>/dev/null || echo "")
if [[ -n "$PR" && "$PR" != "null" ]]; then
  COUNT=$(gh api "repos/$REPO/issues/$PR/comments" --jq '[.[] | select(.user.login | test("qodo|Qodo"; "i"))] | length' 2>/dev/null || echo "0")
  if [[ "$COUNT" == "0" ]]; then
    fail "No Qodo bot comments — see QODO_SETUP.md"
  else
    ok "Found $COUNT Qodo comment(s) on PR #$PR"
  fi
else
  fail "No open PR"
fi

echo ""
echo "README Qodo section filled?"
if grep -qE 'fill after|update after|\*\(update' README.md 2>/dev/null; then
  fail "README still has Qodo placeholders"
else
  ok "README Qodo section looks filled"
fi

exit "$FAIL"
