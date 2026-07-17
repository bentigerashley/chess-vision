import { describe, expect, it } from 'vitest'
import { isCalibratedCapture } from './recognition'

const capture = {
  kind: 'calibrated-capture',
  source: {} as File,
  sourceSize: { width: 1000, height: 800 },
  corners: [{ x: 10, y: 10 }, { x: 990, y: 10 }, { x: 990, y: 790 }, { x: 10, y: 790 }],
  orientation: 'white-at-bottom',
  rectifiedImage: {} as Blob,
  rectifiedSize: { width: 512, height: 512 },
  outerEdgesConfirmed: true,
} as const

describe('recognition capture contract', () => {
  it('only accepts a confirmed, complete calibrated capture', () => {
    expect(isCalibratedCapture(capture)).toBe(true)
    expect(isCalibratedCapture({ ...capture, outerEdgesConfirmed: false })).toBe(false)
    expect(isCalibratedCapture({ ...capture, kind: 'raw-photo' })).toBe(false)
    expect(isCalibratedCapture({ ...capture, corners: {} })).toBe(false)
  })
})
