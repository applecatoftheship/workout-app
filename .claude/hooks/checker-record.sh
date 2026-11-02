#!/bin/bash
# SubagentStop（matcher: checker）フック。
# チェック担当の最終出力の最後の行が「判定: 合格」で、かつチェック中にステージ済み差分が
# 変わっていない（checker-start.sh が控えたハッシュと一致する）ときだけ、合格を記録する。
# 記録はハーネス（このスクリプト）が行い、実装担当のエージェント自身は記録しない。
set -uo pipefail
INPUT=$(cat)
MSG=$(printf '%s' "$INPUT" | jq -r '.last_assistant_message // ""' 2>/dev/null)
# 最後の「空行でも ``` だけの行でもない」行を判定行とみなす。空白とバッククォートだけを除く（ASCIIのみ）
LAST=$(printf '%s\n' "$MSG" | sed -e 's/[` ]//g' -e 's/\t//g' | sed '/^$/d' | tail -1)
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0
hash_cmd() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi; }
START=$(cat .claude/state/check-start 2>/dev/null)
NOW=$(git diff --cached --binary | hash_cmd | cut -c1-64)
rm -f .claude/state/check-start
if [ "$LAST" != "判定:合格" ]; then
  rm -f .claude/state/check-pass
  echo "チェック担当の判定は合格ではありません。指摘を直し、もう一度 checker に通してください。" >&2
  exit 0
fi
if [ -z "$START" ] || [ "$START" != "$NOW" ]; then
  rm -f .claude/state/check-pass
  echo "チェック中にステージ済みの差分が変わったため、合格を記録しませんでした。もう一度 checker に通してください。" >&2
  exit 0
fi
scripts/check-record.sh "$(printf '%s' "$MSG" | tail -c 400)" >&2 || true
exit 0
