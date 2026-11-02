// Supabase（PostgREST）は1回の取得を最大1000行に制限している（max_rows）。
// それを超えるテーブルを1回の select で読むと、1001行目以降が黙って欠ける。
// この関数は range(from, to) で1000行ずつ取得し、全行を返す。
// build には毎回新しいクエリを作る関数を渡す（クエリビルダーは使い回せないため）。
// 並び順が決まっていないとページの境目で行が重複・欠落するので、呼び出し側で order を必ず付ける。
export const PAGE_SIZE = 1000

export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) {
      throw error
    }
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) {
      return rows
    }
  }
}
