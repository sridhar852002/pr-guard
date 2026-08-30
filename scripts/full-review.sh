#!/usr/bin/env bash
# Full end-to-end PR Guard review via TrueForge API (includes approval gate).
set -euo pipefail

BASE="${TRUEFORGE_URL:-http://localhost:8790}"
PR_URL="${1:-https://github.com/sridhar852002/vulnerable-api-fixture/pull/1}"
AUTO_ALLOW="${PR_GUARD_AUTO_ALLOW:-0}"

poll_turn() {
  local session=$1 turn=$2
  local status actions
  for _ in $(seq 1 120); do
    local resp
    resp=$(curl -sf "$BASE/api/v1/sessions/$session/turns/$turn")
    status=$(echo "$resp" | jq -r '.data.state.status // empty')
    actions=$(echo "$resp" | jq '.data.state.required_actions // [] | length')
    if [[ "$status" == "done" ]]; then
      echo "$resp"
      return 0
    fi
    if [[ "$status" == "failed" || "$status" == "error" ]]; then
      echo "$resp" | jq .
      return 1
    fi
    sleep 5
  done
  echo "Timeout waiting for turn $turn" >&2
  return 1
}

echo "Creating session..."
SESSION=$(curl -sf -X POST "$BASE/api/v1/sessions" \
  -H "Content-Type: application/json" \
  -d '{"agent":{"name":"pr-guard"}}' | jq -r '.data.id')
echo "Session: $SESSION"
echo "UI: $BASE"

echo "Starting full review on $PR_URL ..."
TURN1=$(curl -sf -X POST "$BASE/api/v1/sessions/$SESSION/turns" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg url "$PR_URL" '{stream:false,input:[{type:"user.message",content:("Review this pull request end to end: " + $url)}]}')" \
  | jq -r '.data.id')
echo "Turn 1: $TURN1"

RESP=$(poll_turn "$SESSION" "$TURN1") || exit 1
echo "$RESP" | jq '{status: .data.state.status, actions: (.data.state.required_actions | length), output: .data.state.output.content[0:500]}'

ACTIONS=$(echo "$RESP" | jq '.data.state.required_actions')
ACTION_COUNT=$(echo "$ACTIONS" | jq 'length')

if [[ "$ACTION_COUNT" -gt 0 ]]; then
  echo ""
  echo "=== APPROVAL GATE TRIGGERED ($ACTION_COUNT action(s)) ==="
  echo "$ACTIONS" | jq '[.[] | {type, tool: .tool_calls[0].name, args: .tool_calls[0].arguments}]'

  if [[ "$AUTO_ALLOW" != "1" ]]; then
    echo ""
    echo ">>> OPEN IN BROWSER FOR DEMO: $BASE"
    echo ">>> Session ID: $SESSION"
    echo ">>> Click Allow on pull_request_review_write, then show review on PR."
    echo ""
    echo "Paused for approval. Set PR_GUARD_AUTO_ALLOW=1 to auto-allow from CLI."
    exit 0
  fi

  THREAD=$(echo "$ACTIONS" | jq -r '.[0].thread_id')
  TCALL=$(echo "$ACTIONS" | jq -r '.[0].tool_calls[0].id')
  echo "Auto-allowing tool_call=$TCALL thread=$THREAD"

  TURN2=$(curl -sf -X POST "$BASE/api/v1/sessions/$SESSION/turns" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg prev "$TURN1" --arg thread "$THREAD" --arg tc "$TCALL" \
      '{stream:false,previous_turn_id:$prev,input:[{type:"user.tool_approval",thread_id:$thread,tool_call_id:$tc,approval:{status:"allow"}}]}')" \
    | jq -r '.data.id')
  echo "Turn 2 (approval): $TURN2"

  RESP=$(poll_turn "$SESSION" "$TURN2") || exit 1
  echo "$RESP" | jq '{status: .data.state.status, output: .data.state.output.content}'
fi

echo ""
echo "=== FINAL OUTPUT ==="
echo "$RESP" | jq -r '.data.state.output.content // "no output"'

echo ""
echo "Check PR for posted review: $PR_URL"
