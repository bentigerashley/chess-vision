import { describe, expect, it } from 'vitest'
import {
  calibrationError,
  inverseHomographyForBoard,
  projectPoint,
  type BoardCorners,
} from './boardGeometry'

const corners: BoardCorners = [
  { x: 120, y: 80 },
  { x: 980, y: 120 },
  { x: 920, y: 760 },
  { x: 100, y: 700 },
]

describe('calibrated board geometry', () => {
  it('accepts an ordered convex outer-board quadrilateral only after edge confirmation', () => {
    expect(calibrationError(corners, { width: 1200, height: 900 }, false)).toMatch(/outer corners/i)
    expect(calibrationError(corners, { width: 1200, height: 900 }, true)).toBeNull()
  })

  it('rejects crossed and cropped/duplicate corner selections', () => {
    const crossed: BoardCorners = [corners[0], corners[2], corners[1], corners[3]]
    const duplicate: BoardCorners = [corners[0], corners[1], corners[1], corners[3]]

    expect(calibrationError(crossed, { width: 1200, height: 900 }, true)).toMatch(/clockwise|convex/i)
    expect(calibrationError(duplicate, { width: 1200, height: 900 }, true)).toMatch(/separate/i)
  })

  it('maps the canonical grid back to the physical board corners', () => {
    const transform = inverseHomographyForBoard(corners, 512, 'white-at-bottom')

    expect(projectPoint(transform, { x: 0, y: 0 })).toEqual(expect.objectContaining({ x: expect.closeTo(corners[0].x), y: expect.closeTo(corners[0].y) }))
    expect(projectPoint(transform, { x: 511, y: 0 })).toEqual(expect.objectContaining({ x: expect.closeTo(corners[1].x), y: expect.closeTo(corners[1].y) }))
    expect(projectPoint(transform, { x: 511, y: 511 })).toEqual(expect.objectContaining({ x: expect.closeTo(corners[2].x), y: expect.closeTo(corners[2].y) }))
    expect(projectPoint(transform, { x: 0, y: 511 })).toEqual(expect.objectContaining({ x: expect.closeTo(corners[3].x), y: expect.closeTo(corners[3].y) }))
  })

  it('rotates a white-at-top photo into the white-at-bottom model convention', () => {
    const transform = inverseHomographyForBoard(corners, 512, 'white-at-top')

    expect(projectPoint(transform, { x: 0, y: 0 })).toEqual(expect.objectContaining({ x: expect.closeTo(corners[2].x), y: expect.closeTo(corners[2].y) }))
    expect(projectPoint(transform, { x: 0, y: 511 })).toEqual(expect.objectContaining({ x: expect.closeTo(corners[1].x), y: expect.closeTo(corners[1].y) }))
  })

  it('normalizes either sideways phone orientation to white at the bottom', () => {
    const left = inverseHomographyForBoard(corners, 512, 'white-at-left')
    const right = inverseHomographyForBoard(corners, 512, 'white-at-right')

    expect(projectPoint(left, { x: 0, y: 0 })).toEqual(expect.objectContaining({ x: expect.closeTo(corners[1].x), y: expect.closeTo(corners[1].y) }))
    expect(projectPoint(left, { x: 511, y: 511 })).toEqual(expect.objectContaining({ x: expect.closeTo(corners[3].x), y: expect.closeTo(corners[3].y) }))
    expect(projectPoint(right, { x: 0, y: 0 })).toEqual(expect.objectContaining({ x: expect.closeTo(corners[3].x), y: expect.closeTo(corners[3].y) }))
    expect(projectPoint(right, { x: 511, y: 511 })).toEqual(expect.objectContaining({ x: expect.closeTo(corners[1].x), y: expect.closeTo(corners[1].y) }))
  })
})
