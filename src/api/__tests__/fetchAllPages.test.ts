import { describe, expect, it } from 'vitest'
import { fetchAllPages } from '../fetchAllPages'

const makeSource = (total: number) => {
  const all = Array.from({ length: total }, (_, i) => i)
  const calls: Array<[number, number]> = []
  const build = (from: number, to: number) => {
    calls.push([from, to])
    return Promise.resolve({ data: all.slice(from, to + 1), error: null })
  }
  return { all, calls, build }
}

describe('fetchAllPages', () => {
  it('1000行を超えるときは全ページを取得する（1221行）', async () => {
    const { all, calls, build } = makeSource(1221)
    const rows = await fetchAllPages(build)
    expect(rows).toEqual(all)
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('ちょうど1000行のときは空ページを確認して終わる', async () => {
    const { all, calls, build } = makeSource(1000)
    const rows = await fetchAllPages(build)
    expect(rows).toEqual(all)
    expect(calls.length).toBe(2)
  })

  it('1000行未満は1回で終わる', async () => {
    const { calls, build } = makeSource(5)
    expect((await fetchAllPages(build)).length).toBe(5)
    expect(calls.length).toBe(1)
  })

  it('エラーはそのまま投げる', async () => {
    const err = new Error('boom')
    await expect(fetchAllPages(() => Promise.resolve({ data: null, error: err }))).rejects.toBe(err)
  })
})
