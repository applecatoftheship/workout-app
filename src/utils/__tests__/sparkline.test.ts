import { describe, expect, it } from 'vitest'
import { buildSparklinePath } from '../sparkline'

describe('buildSparklinePath', () => {
  it('値が無いときは空の線を返す', () => {
    expect(buildSparklinePath([], 100, 28)).toEqual({ linePoints: '', areaPath: '' })
  })

  it('値が1つのときは横方向の中央に置く', () => {
    const { linePoints } = buildSparklinePath([1], 100, 28)
    expect(linePoints.startsWith('50,')).toBe(true)
  })

  it('両端の値はx=0とx=幅に置き、面の下端は高さになる', () => {
    const { linePoints, areaPath } = buildSparklinePath([0.8, 1.5], 100, 28)
    expect(linePoints).toBe('0,28 100,0')
    expect(areaPath).toBe('M 0,28 L 0,28 L 100,0 L 100,28 Z')
  })
})
