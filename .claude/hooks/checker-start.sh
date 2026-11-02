#!/bin/bash
# SubagentStart（matcher: checker）フック。
# チェック担当が見始めた時点のステージ済み差分のハッシュを控える。
# 終了時（checker-record.sh）に、このハッシュと終了時のハッシュが一致しなければ合格を記録しない。
cat >/dev/null
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0
hash_cmd() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi; }
mkdir -p .claude/state
git diff --cached --binary | hash_cmd | cut -c1-64 > .claude/state/check-start
exit 0
