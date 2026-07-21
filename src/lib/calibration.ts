import type { BoardCorners, BoardOrientation, ImageSize, Point } from '../types/capture'

export type DisplayBounds = { x: number; y: number; width: number; height: number }

const MIN_BOARD_AREA_RATIO = 0.06

export const defaultCorners: readonly (Point | undefined)[] = [undefined, undefined, undefined, undefined]

export const clampUnit = (value: number) => Math.max(0, Math.min(1, value))

const isPoint = (point: Point | undefined): point is Point =>
  point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y)

export function asBoardCorners(corners: readonly (Point | undefined)[]): BoardCorners | undefined {
  if (corners.length !== 4 || !corners.every(isPoint)) return undefined
  return [corners[0], corners[1], corners[2], corners[3]]
}

export function signedPolygonArea(corners: readonly Point[]) {
  return corners.reduce((area, point, index) => {
    const next = corners[(index + 1) % corners.length]
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2
}

const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)

const squaredDistance = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

export function calibrationError(corners: BoardCorners | undefined, outerEdgesConfirmed: boolean): string | null {
  if (!corners) return 'Mark all four outside board corners in order.'
  if (!outerEdgesConfirmed) return 'Confirm that all four outside corners and board edges are visible.'
  if (!corners.every(isPoint)) return 'Each board corner must have a valid location.'
  if (corners.some(point => point.x < 0 || point.y < 0 || point.x > 1 || point.y > 1)) {
    return 'All four board corners must stay inside the photo.'
  }
  for (let index = 0; index < corners.length; index += 1) {
    for (let compare = index + 1; compare < corners.length; compare += 1) {
      if (squaredDistance(corners[index], corners[compare]) < 0.00004) return 'Place four separate board corners.'
    }
  }
  const turns = corners.map((point, index) => cross(point, corners[(index + 1) % 4], corners[(index + 2) % 4]))
  const sameDirection = turns.every(turn => turn > 0) || turns.every(turn => turn < 0)
  if (!sameDirection) return 'Corners must form one convex board outline.'
  if (signedPolygonArea(corners) <= 0) return 'Place corners clockwise: top left, top right, bottom right, then bottom left.'
  if (Math.abs(signedPolygonArea(corners)) < MIN_BOARD_AREA_RATIO) {
    return 'The selected board is too small to analyse reliably. Retake the photo closer to the board.'
  }
  return null
}

export function containBounds(container: ImageSize, source: ImageSize): DisplayBounds {
  if (container.width <= 0 || container.height <= 0 || source.width <= 0 || source.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const scale = Math.min(container.width / source.width, container.height / source.height)
  const width = source.width * scale
  const height = source.height * scale
  return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height }
}

export function displayToNormalised(point: Point, bounds: DisplayBounds): Point {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 }
  return {
    x: clampUnit((point.x - bounds.x) / bounds.width),
    y: clampUnit((point.y - bounds.y) / bounds.height),
  }
}

export function normalisedToDisplay(point: Point, bounds: DisplayBounds): Point {
  return { x: bounds.x + clampUnit(point.x) * bounds.width, y: bounds.y + clampUnit(point.y) * bounds.height }
}

export function normalisedToSource(point: Point, source: ImageSize): Point {
  return { x: clampUnit(point.x) * source.width, y: clampUnit(point.y) * source.height }
}

/** The first canonical corner always represents a8 when White is shown at the bottom. */
export function canonicalCornerOrder(corners: BoardCorners, orientation: BoardOrientation): BoardCorners {
  return orientation === 'white-at-bottom'
    ? corners
    : [corners[2], corners[3], corners[0], corners[1]]
}
