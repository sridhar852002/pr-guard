#!/usr/bin/env bash
# Quick check: is TrueForge up, is there an open PR, did Qodo comment?
set -euo pipefail

REPO="${PR_GUARD_REPO:-sridhar852002/pr-guard}"
BASE="${TRUEFORGE_URL:-http://localhost:8790}"

echo "=== PR Guard pre-submit checks ==="

if curl -sf "$BASE/api/v1/agents" >/dev/null 2>&1; then
  echo "✓ TrueForge reachable at $BASE"
else
  echo "✗ TrueForge not running — npx @truefoundry/trueforge@latest"
fi

if curl -sf "$BASE/api/v1/agents" >/dev/null 2>&1; then
  :
else
  :
fi

echo ""
echo "Open PRs:"
gh pr list --repo "$REPO" --state open --json number,title,url --jq '.[] | "  #\(.number) \(.title)\n  \(.url)"' 2>/dev/null || echo "  (gh not authenticated)"

echo ""
echo "Qodo comments on latest open PR:"
PR=$(gh pr list --repo "$REPO" --state open --json number --jq '.[0].number' 2>/dev/null || echo "")
if [[ -n "$PR" && "$PR" != "null" ]]; then
  gh api "repos/$REPO/issues/$PR/comments" --jq '.[] | select(.user.login | test("qodo|Qodo"; "i")) | "  \(.user.login): \(.body[0:120])..."' 2>/dev/null || true
  COUNT=$(gh api "repos/$REPO/issues/$PR/comments" --jq '[.[] | select(.user.login | test("qodo|Qodo"; "i"))] | length' 2>/dev/null || echo "0")
  if [[ "$COUNT" == "0" ]]; then
    echo "  ✗ No Qodo bot comments yet — complete QODO_SETUP.md step 1"
    echo "    Then comment /agentic_review on https://github.com/$REPO/pull/$PR"
  else
    echo "  ✓ Found $COUNT Qodo comment(s)"
  fi
else
  echo "  ✗ No open PR"
fi

echo ""
echo "README Qodo section filled?"
if grep -q 'fill after' README.md 2>/dev/null; then
  echo "  ✗ Still has placeholders — update after Qodo review + merge"
else
  echo "  ✓ Looks filled"
fi
