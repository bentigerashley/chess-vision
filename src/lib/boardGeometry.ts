export type Point = { x: number; y: number }
export type ImageSize = { width: number; height: number }
export type BoardCorners = readonly [Point, Point, Point, Point]
export type BoardOrientation = 'white-at-bottom' | 'white-at-top' | 'white-at-left' | 'white-at-right'

export type Homography = readonly [number, number, number, number, number, number, number, number, number]

const MIN_BOARD_AREA_RATIO = 0.06

const isFinitePoint = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y)

const squaredDistance = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)

export function signedPolygonArea(corners: readonly Point[]) {
  return corners.reduce((area, point, index) => {
    const next = corners[(index + 1) % corners.length]
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2
}

/**
 * A manual calibration is intentionally conservative. Geometry alone cannot
 * recognise a physical board edge, so an explicit user confirmation is part
 * of the gate instead of pretending that arbitrary four points prove a board.
 */
export function calibrationError(
  corners: BoardCorners,
  image: ImageSize,
  outerEdgesConfirmed: boolean,
): string | null {
  if (!outerEdgesConfirmed) return 'Confirm that all four outer corners and board edges are visible.'
  if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0) {
    return 'The photo dimensions are not available yet.'
  }
  if (!corners.every(isFinitePoint)) return 'Each board corner must have a valid location.'
  if (corners.some(point => point.x < 0 || point.y < 0 || point.x > image.width || point.y > image.height)) {
    return 'All four board corners must stay inside the photo.'
  }
  for (let index = 0; index < corners.length; index += 1) {
    for (let compare = index + 1; compare < corners.length; compare += 1) {
      if (squaredDistance(corners[index], corners[compare]) < 16) return 'Place four separate board corners.'
    }
  }
  const turns = corners.map((point, index) => cross(point, corners[(index + 1) % 4], corners[(index + 2) % 4]))
  const sameDirection = turns.every(turn => turn > 0) || turns.every(turn => turn < 0)
  if (!sameDirection) return 'Corners must form one convex board outline.'
  if (signedPolygonArea(corners) <= 0) return 'Place corners clockwise: top-left, top-right, bottom-right, bottom-left.'
  if (Math.abs(signedPolygonArea(corners)) < image.width * image.height * MIN_BOARD_AREA_RATIO) {
    return 'The selected board is too small to analyse reliably. Retake the photo closer to the board.'
  }
  return null
}

const solveLinearSystem = (matrix: number[][], vector: number[]) => {
  const size = vector.length
  const augmented = matrix.map((row, index) => [...row, vector[index]])

  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row
    }
    if (Math.abs(augmented[best][pivot]) < 1e-10) throw new Error('Board corners cannot define a usable perspective transform.')
    ;[augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]]
    const divisor = augmented[pivot][pivot]
    for (let column = pivot; column <= size; column += 1) augmented[pivot][column] /= divisor
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue
      const factor = augmented[row][pivot]
      for (let column = pivot; column <= size; column += 1) augmented[row][column] -= factor * augmented[pivot][column]
    }
  }
  return augmented.map(row => row[size])
}

export function homographyFromPoints(from: readonly Point[], to: readonly Point[]): Homography {
  if (from.length !== 4 || to.length !== 4) throw new Error('Perspective transforms need exactly four points.')
  const matrix: number[][] = []
  const vector: number[] = []
  for (let index = 0; index < 4; index += 1) {
    const { x, y } = from[index]
    const { x: u, y: v } = to[index]
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    vector.push(u)
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    vector.push(v)
  }
  const [a, b, c, d, e, f, g, h] = solveLinearSystem(matrix, vector)
  return [a, b, c, d, e, f, g, h, 1]
}

export function projectPoint(transform: Homography, point: Point): Point {
  const [a, b, c, d, e, f, g, h, i] = transform
  const denominator = g * point.x + h * point.y + i
  return {
    x: (a * point.x + b * point.y + c) / denominator,
    y: (d * point.x + e * point.y + f) / denominator,
  }
}

export function sourceCornersForOrientation(corners: BoardCorners, orientation: BoardOrientation): BoardCorners {
  if (orientation === 'white-at-bottom') return corners
  if (orientation === 'white-at-top') return [corners[2], corners[3], corners[0], corners[1]]
  if (orientation === 'white-at-left') return [corners[1], corners[2], corners[3], corners[0]]
  return [corners[3], corners[0], corners[1], corners[2]]
}

/** Maps canonical (rectified) pixels back to their source-image pixels. */
export function inverseHomographyForBoard(
  corners: BoardCorners,
  outputSize: number,
  orientation: BoardOrientation,
): Homography {
  if (!Number.isInteger(outputSize) || outputSize < 2) throw new Error('Rectified board size must be at least 2 pixels.')
  const edge = outputSize - 1
  const canonical: BoardCorners = [{ x: 0, y: 0 }, { x: edge, y: 0 }, { x: edge, y: edge }, { x: 0, y: edge }]
  return homographyFromPoints(canonical, sourceCornersForOrientation(corners, orientation))
}

const sampleBilinear = (pixels: Uint8ClampedArray, size: ImageSize, point: Point, target: Uint8ClampedArray, offset: number) => {
  const x = Math.max(0, Math.min(size.width - 1, point.x))
  const y = Math.max(0, Math.min(size.height - 1, point.y))
  const left = Math.floor(x)
  const top = Math.floor(y)
  const right = Math.min(size.width - 1, left + 1)
  const bottom = Math.min(size.height - 1, top + 1)
  const xRatio = x - left
  const yRatio = y - top
  for (let channel = 0; channel < 4; channel += 1) {
    const topValue = pixels[(top * size.width + left) * 4 + channel] * (1 - xRatio)
      + pixels[(top * size.width + right) * 4 + channel] * xRatio
    const bottomValue = pixels[(bottom * size.width + left) * 4 + channel] * (1 - xRatio)
      + pixels[(bottom * size.width + right) * 4 + channel] * xRatio
    target[offset + channel] = Math.round(topValue * (1 - yRatio) + bottomValue * yRatio)
  }
}

/**
 * Rectifies a user-confirmed outer-board quadrilateral to a square PNG. The
 * inverse transform samples the source image once, leaving the original photo
 * available for correction and audit.
 */
export async function rectifyBoardImage(
  source: CanvasImageSource,
  sourceSize: ImageSize,
  corners: BoardCorners,
  orientation: BoardOrientation,
  outputSize = 512,
): Promise<Blob> {
  const crop = {
    left: Math.max(0, Math.floor(Math.min(...corners.map(({ x }) => x)) - 1)),
    top: Math.max(0, Math.floor(Math.min(...corners.map(({ y }) => y)) - 1)),
    right: Math.min(sourceSize.width, Math.ceil(Math.max(...corners.map(({ x }) => x)) + 1)),
    bottom: Math.min(sourceSize.height, Math.ceil(Math.max(...corners.map(({ y }) => y)) + 1)),
  }
  const cropSize = { width: crop.right - crop.left, height: crop.bottom - crop.top }
  const cropCorners: BoardCorners = [
    { x: corners[0].x - crop.left, y: corners[0].y - crop.top },
    { x: corners[1].x - crop.left, y: corners[1].y - crop.top },
    { x: corners[2].x - crop.left, y: corners[2].y - crop.top },
    { x: corners[3].x - crop.left, y: corners[3].y - crop.top },
  ]
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = cropSize.width
  sourceCanvas.height = cropSize.height
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('This browser cannot read the board photo.')
  sourceContext.drawImage(source, crop.left, crop.top, cropSize.width, cropSize.height, 0, 0, cropSize.width, cropSize.height)
  const sourcePixels = sourceContext.getImageData(0, 0, cropSize.width, cropSize.height).data

  const targetCanvas = document.createElement('canvas')
  targetCanvas.width = outputSize
  targetCanvas.height = outputSize
  const targetContext = targetCanvas.getContext('2d')
  if (!targetContext) throw new Error('This browser cannot create the rectified board.')
  const target = targetContext.createImageData(outputSize, outputSize)
  const transform = inverseHomographyForBoard(cropCorners, outputSize, orientation)

  for (let y = 0; y < outputSize; y += 1) {
    for (let x = 0; x < outputSize; x += 1) {
      const sourcePoint = projectPoint(transform, { x, y })
      const offset = (y * outputSize + x) * 4
      sampleBilinear(sourcePixels, cropSize, sourcePoint, target.data, offset)
    }
  }
  targetContext.putImageData(target, 0, 0)
  return new Promise<Blob>((resolve, reject) => targetCanvas.toBlob(blob => {
    if (blob) resolve(blob)
    else reject(new Error('The rectified board image could not be created.'))
  }, 'image/png'))
}
