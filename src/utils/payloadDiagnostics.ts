// api/sync-apple-health.ts が「既知のどの形式（type付き3種別 / Health Auto Export の
// data.metrics）にも該当しない」ペイロードを400で弾く際、実際に何が届いたのかを
// 後から確認できるようにするための構造要約（2026年9月6日）。
//
// Apple Healthのデータ送信元として RoutineHub 等の公開ショートカットを使う方針のため、
// 送られてくるJSONの形が事前に分からない。現状は中身を残さず400で弾くだけなので、
// 「トップレベルのキー / 各値の型 / 配列の要素数」だけを console.warn とレスポンスに残す。
//
// 【重要】実データ（歩数・体重・心拍などの数値、真偽値）は要約に一切含めない。
//   - number / boolean は型名のみ（値は出さない）
//   - 文字列は「最初に出現した1つ」だけ、形式判別用に先頭20文字までを sample として残す
//   - ネストは2階層まで（それより深いキー・値は要約しない）
// 認証ヘッダー（x-webhook-secret）等はそもそもこの関数に渡さない（呼び出し側の責務）。

export type PayloadShapeSummary =
  | { type: 'object'; keys: string[]; children?: Record<string, PayloadShapeSummary> }
  | { type: 'array'; length: number; firstItem?: PayloadShapeSummary }
  | { type: 'string'; sample?: string }
  | { type: 'number' }
  | { type: 'boolean' }
  | { type: 'null' }
  | { type: 'undefined' }

// トップレベルオブジェクトのキーは通常十数個程度だが、異常なペイロード対策で上限を設ける。
const MAX_KEYS_LISTED = 50
const STRING_SAMPLE_LENGTH = 20

export function summarizePayloadShape(value: unknown, maxDepth = 2): PayloadShapeSummary {
  // 「最初の文字列1つだけ」を判定するための走査中フラグ（object→key順、array→先頭要素の
  // 深さ優先で最初に到達した文字列）。
  let stringSampleTaken = false

  function walk(node: unknown, depth: number): PayloadShapeSummary {
    if (node === null) {
      return { type: 'null' }
    }
    if (node === undefined) {
      return { type: 'undefined' }
    }

    if (typeof node === 'string') {
      if (!stringSampleTaken) {
        stringSampleTaken = true
        return { type: 'string', sample: node.slice(0, STRING_SAMPLE_LENGTH) }
      }
      return { type: 'string' }
    }

    if (typeof node === 'number') {
      return { type: 'number' }
    }
    if (typeof node === 'boolean') {
      return { type: 'boolean' }
    }

    if (Array.isArray(node)) {
      const summary: PayloadShapeSummary = { type: 'array', length: node.length }
      if (depth < maxDepth && node.length > 0) {
        summary.firstItem = walk(node[0], depth + 1)
      }
      return summary
    }

    if (typeof node === 'object') {
      const record = node as Record<string, unknown>
      const keys = Object.keys(record).slice(0, MAX_KEYS_LISTED)
      const summary: PayloadShapeSummary = { type: 'object', keys }
      if (depth < maxDepth && keys.length > 0) {
        const children: Record<string, PayloadShapeSummary> = {}
        for (const key of keys) {
          children[key] = walk(record[key], depth + 1)
        }
        summary.children = children
      }
      return summary
    }

    // function / symbol / bigint 等（JSON.parse では発生しないが型安全のため）。
    return { type: 'undefined' }
  }

  return walk(value, 0)
}

// レスポンスに載せる「トップレベルのキー一覧」。オブジェクト以外（配列・プリミティブ・
// null）なら空配列。
export function topLevelKeysOf(summary: PayloadShapeSummary): string[] {
  return summary.type === 'object' ? summary.keys : []
}
