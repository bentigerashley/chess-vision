import { isCalibratedCapture, recogniseBoard } from './recognition'

const capture = {
  kind: 'calibrated-capture',
  photo: { uri: 'file:///board.jpg', width: 1000, height: 800 },
  corners: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }],
  orientation: 'white-at-bottom',
  outerEdgesConfirmed: true,
} as const

describe('recognition capture contract', () => {
  it('only accepts a confirmed, complete calibrated capture', () => {
    expect(isCalibratedCapture(capture)).toBe(true)
    expect(isCalibratedCapture({ ...capture, outerEdgesConfirmed: false })).toBe(false)
    expect(isCalibratedCapture({ ...capture, kind: 'raw-photo' })).toBe(false)
    expect(isCalibratedCapture({ ...capture, corners: {} })).toBe(false)
  })

  it('keeps the synthetic-only model behind a truthful editable fallback', async () => {
    await expect(recogniseBoard(capture)).resolves.toMatchObject({
      kind: 'unavailable',
      board: expect.objectContaining({ a1: null, e8: null }),
      message: expect.stringMatching(/not installed/i),
    })
    await expect(recogniseBoard({ ...capture, outerEdgesConfirmed: false })).resolves.toMatchObject({ kind: 'error' })
  })
})
