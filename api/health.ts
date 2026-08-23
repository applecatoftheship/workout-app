// プッシュ通知実装 Phase 1a：Vercel API衝突検証用のダミー関数（2026年8月23日）。
// vercel.jsonのrewrites（全パスindex.htmlフォールバック）と/api配下の
// サーバーレス関数が衝突しないかを確認するためのみに存在する。
// 本実装ではない（実際の通知APIはPhase 1bで別途実装）。
export default function handler(req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) {
  res.status(200).json({ status: 'ok' })
}
