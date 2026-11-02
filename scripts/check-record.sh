#!/bin/bash
# チェック担当の「合格」を記録する。記録するのは、いまステージされている差分
# （git diff --cached）のハッシュ。コミット時に .githooks/pre-commit が同じハッシュを
# 計算し、一致しなければコミットを止める（＝チェック後に変更が入ったら再チェックが必要）。
# 使い方: scripts/check-record.sh "判定の要約（チェック担当の出力の最終部分）"
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
hash_cmd() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi; }
if git diff --cached --quiet; then
  echo "ステージされた変更がありません。git add してからチェックを受けてください。" >&2
  exit 1
fi
HASH=$(git diff --cached --binary | hash_cmd | cut -c1-64)
mkdir -p .claude/state
{
  echo "hash=$HASH"
  echo "checked_at=$(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "summary=$(printf '%s' "${1:-}" | tr '\n' ' ' | cut -c1-500)"
} > .claude/state/check-pass
echo "チェック合格を記録しました: ${HASH:0:12}"
