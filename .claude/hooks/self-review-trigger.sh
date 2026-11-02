#!/bin/bash
# Stop hook.
#
# Fires once per turn, after Claude has finished responding (i.e. after any
# Write/Edit calls in that turn have already settled). If self-review-mark-
# dirty.sh flagged this session as dirty, this script blocks the stop
# (exit 2) and instructs Claude to invoke the "code-reviewer" subagent
# (.claude/agents/code-reviewer.md) on the changes made since the review
# cycle's baseline commit, capped at MAX_ROUNDS round-trips so the loop
# cannot run away.
#
# If the review round produces further edits, mark-dirty.sh flags dirty
# again and this hook fires once more on the next Stop. If a round produces
# no further edits, the cycle is considered resolved and the state is
# cleared on the next Stop.
set -uo pipefail

MAX_ROUNDS=4
STATE_DIR="/tmp/.claude-self-review"

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
[ -z "$SESSION_ID" ] && SESSION_ID="unknown"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_FILE="$STATE_DIR/${SESSION_ID}.json"

# No state file recorded for this session => no edits happened this cycle.
[ -f "$STATE_FILE" ] || exit 0

DIRTY=$(jq -r '.dirty // false' "$STATE_FILE" 2>/dev/null)
ROUNDS=$(jq -r '.rounds // 0' "$STATE_FILE" 2>/dev/null)
[[ "$ROUNDS" =~ ^[0-9]+$ ]] || ROUNDS=0
BASELINE_SHA=$(jq -r '.baseline_sha // ""' "$STATE_FILE" 2>/dev/null)

if [ "$DIRTY" != "true" ]; then
  # Previous review round produced no further edits (or nothing was ever
  # dirty this pass) -> the cycle is resolved.
  rm -f "$STATE_FILE" 2>/dev/null
  exit 0
fi

if [ "$ROUNDS" -ge "$MAX_ROUNDS" ]; then
  rm -f "$STATE_FILE" 2>/dev/null
  MSG="[自動セルフレビュー] 往復上限（${MAX_ROUNDS}回）に達したため、これ以上の自動レビューは行わず停止を許可します。残っている変更があれば人間が確認してください。"
  jq -n --arg msg "$MSG" \
    '{hookSpecificOutput: {hookEventName: "Stop", systemMessage: $msg}}'
  exit 0
fi

# Gather changed files since baseline: committed diff (baseline..HEAD) +
# uncommitted tracked changes + untracked new files. Falls back to plain
# `git status` if the baseline commit is missing/unreachable for any reason
# (e.g. history was rewritten mid-session).
CHANGED_FILES=""
if [ -n "$BASELINE_SHA" ] && git -C "$PROJECT_DIR" cat-file -e "$BASELINE_SHA" 2>/dev/null; then
  CHANGED_FILES=$(git -C "$PROJECT_DIR" diff --name-only "$BASELINE_SHA" -- . 2>/dev/null)
  UNTRACKED=$(git -C "$PROJECT_DIR" ls-files --others --exclude-standard 2>/dev/null)
  CHANGED_FILES=$(printf '%s\n%s\n' "$CHANGED_FILES" "$UNTRACKED")
else
  CHANGED_FILES=$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null | awk '{print $2}')
fi
CHANGED_FILES=$(echo "$CHANGED_FILES" | sed '/^$/d' | sort -u)

if [ -z "$CHANGED_FILES" ]; then
  # Dirty flag was set but nothing actually differs from baseline anymore
  # (e.g. edits were reverted, or they landed outside the repo) -> resolved.
  rm -f "$STATE_FILE" 2>/dev/null
  exit 0
fi

NEXT_ROUND=$((ROUNDS + 1))

# Consume the dirty flag for this round; baseline_sha is deliberately kept
# fixed so every round reviews the full cumulative diff of the editing
# cycle, not just the latest round's incremental edits.
jq -n \
  --arg baseline "$BASELINE_SHA" \
  --argjson rounds "$NEXT_ROUND" \
  '{dirty: false, rounds: $rounds, baseline_sha: $baseline}' \
  > "$STATE_FILE" 2>/dev/null

FILE_LIST=$(echo "$CHANGED_FILES" | sed 's/^/- /')
SHORT_SHA="${BASELINE_SHA:0:12}"

MESSAGE="[チェック担当への引き渡し ${NEXT_ROUND}/${MAX_ROUNDS}回目] このターンでコードが変更されました。停止する前に次を行ってください。①npx vitest run・npm run build・npx oxlint src を実行し、出力を残す。②変更をgit addする。③Agentツールで subagent_type: \"checker\" を起動し、仕様（受け入れ条件）・git diff --cached の対象ファイル・①の出力をそのまま渡す。④checkerの指摘は自分で直し、②からやり直す（checkerはファイルを変更しない）。合格の記録はSubagentStopフックが自動で行うので、自分でscripts/check-record.shを実行しないこと。⑤checkerの出力をそのままユーザーに伝える。往復上限は${MAX_ROUNDS}回です。

変更ファイル一覧:
${FILE_LIST}"

jq -n --arg msg "$MESSAGE" \
  '{hookSpecificOutput: {hookEventName: "Stop", additionalContext: $msg, permissionDecisionReason: $msg, systemMessage: $msg}}'

echo "$MESSAGE" >&2

exit 2
