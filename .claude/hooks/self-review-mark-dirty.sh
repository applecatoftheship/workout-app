#!/bin/bash
# PostToolUse (matcher: Edit|Write) hook.
#
# Marks the current session's self-review state as "dirty" so that the
# paired Stop hook (self-review-trigger.sh) knows code changed during this
# turn and should route through the code-reviewer subagent before Claude
# is allowed to stop. See self-review-trigger.sh for the full lifecycle.
set -uo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
[ -z "$SESSION_ID" ] && SESSION_ID="unknown"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Only meaningful inside a git repo; otherwise there is nothing to diff later.
git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1 || exit 0

STATE_DIR="/tmp/.claude-self-review"
mkdir -p "$STATE_DIR" 2>/dev/null
STATE_FILE="$STATE_DIR/${SESSION_ID}.json"

ROUNDS=0
BASELINE_SHA=""
if [ -f "$STATE_FILE" ]; then
  ROUNDS=$(jq -r '.rounds // 0' "$STATE_FILE" 2>/dev/null)
  [[ "$ROUNDS" =~ ^[0-9]+$ ]] || ROUNDS=0
  BASELINE_SHA=$(jq -r '.baseline_sha // ""' "$STATE_FILE" 2>/dev/null)
fi

# baseline_sha anchors the diff reviewed at Stop time. It is only captured
# once per review cycle (i.e. while state is clean/absent), so every round
# within the same cycle reviews the full cumulative change, not just the
# latest increment.
if [ -z "$BASELINE_SHA" ]; then
  BASELINE_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null)
fi

jq -n \
  --arg baseline "$BASELINE_SHA" \
  --argjson rounds "$ROUNDS" \
  '{dirty: true, rounds: $rounds, baseline_sha: $baseline}' \
  > "$STATE_FILE" 2>/dev/null

exit 0
