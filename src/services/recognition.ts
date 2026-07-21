import { calibrationError } from '../lib/calibration'
import { emptyBoard, type Board } from '../lib/position'
import type { CalibratedCapture } from '../types/capture'

export type Recognition = {
  kind: 'unavailable' | 'ready' | 'error'
  board: Board
  lowConfidence: string[]
  message: string
}

export function isCalibratedCapture(value: unknown): value is CalibratedCapture {
  if (!value || typeof value !== 'object') return false
  const capture = value as Partial<CalibratedCapture>
  return capture.kind === 'calibrated-capture'
    && capture.outerEdgesConfirmed === true
    && Boolean(capture.photo?.uri)
    && Number.isFinite(capture.photo?.width)
    && Number.isFinite(capture.photo?.height)
    && Array.isArray(capture.corners)
    && capture.corners.length === 4
    && (capture.orientation === 'white-at-bottom' || capture.orientation === 'white-at-top')
}

/**
 * The synthetic ONNX experiment is deliberately not imported by the mobile app.
 * A real-photo-qualified model plus a native preprocessing/runtime adapter is
 * required before this seam may return `ready`.
 */
export async function recogniseBoard(capture: unknown): Promise<Recognition> {
  if (!isCalibratedCapture(capture) || calibrationError(capture.corners, capture.outerEdgesConfirmed)) {
    return {
      kind: 'error',
      board: emptyBoard(),
      lowConfidence: [],
      message: 'Recognition requires a confirmed photo containing all four outer board corners.',
    }
  }
  return {
    kind: 'unavailable',
    board: emptyBoard(),
    lowConfidence: [],
    message: 'Automatic recognition is not installed yet. Correct the position manually before analysis.',
  }
}
