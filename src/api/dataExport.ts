import { getCurrentUserId, supabase } from './client'
import { EXPORT_TABLE_NAMES, buildExportPayload } from '../utils/dataExportHelpers'
import type { ExportPayload } from '../utils/dataExportHelpers'

// データエクスポート機能（2026年9月13日新設）：本番DBへの書き込みは一切発生しない
// 読み取り専用機能。テーブルごとにuser_id列でスコープしたselect('*')を発行する
// （対象テーブル一覧・選定理由はsrc/utils/dataExportHelpers.ts参照）。
async function fetchTableForExport(table: string, userId: string): Promise<unknown[]> {
  const { data, error } = await supabase.from(table).select('*').eq('user_id', userId)

  if (error) {
    // どのテーブルの取得に失敗したかを呼び出し元（Settings.tsxのエラートースト）が
    // 判別できるよう、テーブル名をメッセージに含める。
    throw new Error(`${table}の取得に失敗しました: ${error.message}`)
  }

  return data ?? []
}

// いずれか1テーブルでも取得に失敗したら全体を中断する（部分的なエクスポート
// ファイルを作らないための指示通りの挙動）。Promise.allは1件でもrejectすると
// 即座に全体がrejectされるため、この要件をそのまま満たす。
export async function buildUserDataExport(): Promise<ExportPayload> {
  const userId = await getCurrentUserId()

  const results = await Promise.all(EXPORT_TABLE_NAMES.map((table) => fetchTableForExport(table, userId)))

  const tables: Record<string, unknown[]> = {}
  EXPORT_TABLE_NAMES.forEach((table, index) => {
    tables[table] = results[index]
  })

  return buildExportPayload(userId, tables)
}
