import {
  asBoardCorners,
  calibrationError,
  canonicalCornerOrder,
  containBounds,
  displayToNormalised,
  normalisedToDisplay,
  normalisedToSource,
} from './calibration'

const corners = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.12 },
  { x: 0.86, y: 0.86 },
  { x: 0.08, y: 0.82 },
] as const

describe('native calibration geometry', () => {
  it('requires a confirmed clockwise, convex full-board outline', () => {
    expect(calibrationError(asBoardCorners(corners), false)).toMatch(/Confirm/)
    expect(calibrationError(asBoardCorners(corners), true)).toBeNull()
    expect(calibrationError(asBoardCorners([corners[0], corners[2], corners[1], corners[3]]), true)).toMatch(/clockwise|convex/i)
  })

  it('maps letterboxed portrait and landscape previews to normalised source coordinates', () => {
    const landscape = containBounds({ width: 300, height: 300 }, { width: 1200, height: 600 })
    expect(landscape).toEqual({ x: 0, y: 75, width: 300, height: 150 })
    expect(displayToNormalised({ x: 150, y: 150 }, landscape)).toEqual({ x: 0.5, y: 0.5 })

    const portrait = containBounds({ width: 300, height: 300 }, { width: 600, height: 1200 })
    expect(portrait).toEqual({ x: 75, y: 0, width: 150, height: 300 })
    const point = displayToNormalised({ x: 112.5, y: 225 }, portrait)
    expect(point).toEqual({ x: 0.25, y: 0.75 })
    expect(normalisedToDisplay(point, portrait)).toEqual({ x: 112.5, y: 225 })
    expect(normalisedToSource(point, { width: 600, height: 1200 })).toEqual({ x: 150, y: 900 })
  })

  it('uses the selected white side to produce one canonical a8-to-h1 order', () => {
    const boardCorners = asBoardCorners(corners)!
    expect(canonicalCornerOrder(boardCorners, 'white-at-bottom')[0]).toEqual(corners[0])
    expect(canonicalCornerOrder(boardCorners, 'white-at-top')[0]).toEqual(corners[2])
  })
})
