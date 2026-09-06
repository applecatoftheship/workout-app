import { describe, expect, it } from 'vitest'
import { summarizePayloadShape, topLevelKeysOf } from '../payloadDiagnostics'

describe('summarizePayloadShape', () => {
  it('トップレベルのキー一覧と各値の型を返す', () => {
    const result = summarizePayloadShape({ data: {}, count: 3, label: 'x' })
    expect(result).toMatchObject({ type: 'object', keys: ['data', 'count', 'label'] })
    expect(result.type === 'object' && result.children?.data).toEqual({ type: 'object', keys: [] })
    expect(result.type === 'object' && result.children?.count).toEqual({ type: 'number' })
  })

  it('配列は要素数を返し、要素の実データは含めない', () => {
    const result = summarizePayloadShape({ items: [10, 20, 30] })
    const json = JSON.stringify(result)
    expect(result).toMatchObject({ type: 'object', children: { items: { type: 'array', length: 3 } } })
    expect(json).not.toContain('10')
    expect(json).not.toContain('20')
    expect(json).not.toContain('30')
  })

  it('数値・真偽値の実データは要約に含まれない（型名のみ）', () => {
    const result = summarizePayloadShape({ steps: 8523, awake: true, weight: 71.4 })
    const json = JSON.stringify(result)
    expect(json).not.toContain('8523')
    expect(json).not.toContain('71.4')
    expect(result.type === 'object' && result.children?.steps).toEqual({ type: 'number' })
    expect(result.type === 'object' && result.children?.awake).toEqual({ type: 'boolean' })
  })

  it('ネストは2階層で止まる（3階層目のキー・値は要約に含まれない）', () => {
    const result = summarizePayloadShape({ a: { b: { c: { secret: 999 } } } })
    const a = result.type === 'object' ? result.children?.a : undefined
    const b = a?.type === 'object' ? a.children?.b : undefined
    expect(b).toMatchObject({ type: 'object', keys: ['c'] })
    // depth 2 で停止するため children は展開されない
    expect(b?.type === 'object' && b.children).toBeUndefined()
    const json = JSON.stringify(result)
    expect(json).not.toContain('secret')
    expect(json).not.toContain('999')
  })

  it('配列の先頭要素は2階層以内なら要約する（3階層目は要約しない）', () => {
    const result = summarizePayloadShape({ metrics: [{ name: 'x', data: [{ qty: 1 }] }] })
    const metrics = result.type === 'object' ? result.children?.metrics : undefined
    expect(metrics).toMatchObject({ type: 'array', length: 1 })
    // metrics[0] は depth 2 → keys は返るが children は返らない
    expect(metrics?.type === 'array' && metrics.firstItem).toMatchObject({
      type: 'object',
      keys: ['name', 'data'],
    })
    expect(metrics?.type === 'array' && metrics.firstItem?.type === 'object' && metrics.firstItem.children).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('qty')
  })

  it('文字列は最初に出現した1つだけ先頭20文字までを sample として残す', () => {
    const result = summarizePayloadShape({
      first: 'abcdefghijklmnopqrstuvwxyz',
      second: 'this-value-must-not-appear-in-summary',
    })
    const children = result.type === 'object' ? result.children ?? {} : {}
    expect(children.first).toEqual({ type: 'string', sample: 'abcdefghijklmnopqrst' })
    expect(children.second).toEqual({ type: 'string' })
    expect(JSON.stringify(result)).not.toContain('must-not-appear')
  })

  it('null / undefined / プリミティブがトップレベルでも扱える', () => {
    expect(summarizePayloadShape(null)).toEqual({ type: 'null' })
    expect(summarizePayloadShape(undefined)).toEqual({ type: 'undefined' })
    expect(summarizePayloadShape(['a', 'b'])).toMatchObject({ type: 'array', length: 2 })
  })

  it('キー数が上限(50)を超えても落ちず、先頭50件に丸める', () => {
    const big: Record<string, number> = {}
    for (let i = 0; i < 120; i += 1) {
      big[`k${i}`] = i
    }
    const result = summarizePayloadShape(big)
    expect(result.type === 'object' && result.keys.length).toBe(50)
  })
})

describe('topLevelKeysOf', () => {
  it('オブジェクトならキー一覧、それ以外なら空配列', () => {
    expect(topLevelKeysOf(summarizePayloadShape({ a: 1, b: 2 }))).toEqual(['a', 'b'])
    expect(topLevelKeysOf(summarizePayloadShape([1, 2, 3]))).toEqual([])
    expect(topLevelKeysOf(summarizePayloadShape(null))).toEqual([])
    expect(topLevelKeysOf(summarizePayloadShape('hi'))).toEqual([])
  })
})
