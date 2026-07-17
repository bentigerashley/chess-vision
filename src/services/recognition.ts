import * as tf from '@tensorflow/tfjs'
import { emptyBoard, type Board } from '../lib/position'
import { calibrationError, type BoardCorners, type BoardOrientation, type ImageSize } from '../lib/boardGeometry'

/**
 * The only recognition input accepted by the app. It records both the
 * original image and the exact, user-confirmed geometry that produced the
 * canonical white-at-bottom PNG used by a future model.
 */
export type CalibratedCapture = {
  kind: 'calibrated-capture'
  source: File
  sourceSize: ImageSize
  corners: BoardCorners
  orientation: BoardOrientation
  rectifiedImage: Blob
  rectifiedSize: ImageSize
  outerEdgesConfirmed: true
}

export type Recognition = { kind: 'unavailable'|'ready'|'error', board: Board, lowConfidence: string[], message: string }

class RecognitionModelUnavailable extends Error {}

let modelPromise: Promise<tf.GraphModel> | undefined

async function loadRecognitionModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const response = await fetch('/models/chess-piece/model.json', { method: 'HEAD' })
      if (!response.ok) throw new RecognitionModelUnavailable()
      return tf.loadGraphModel('/models/chess-piece/model.json')
    })().catch(error => {
      modelPromise = undefined
      throw error
    })
  }
  return modelPromise
}

const isImageSize = (value: unknown): value is ImageSize => Boolean(value && typeof value === 'object'
  && Number.isFinite((value as ImageSize).width) && Number.isFinite((value as ImageSize).height)
  && (value as ImageSize).width > 0 && (value as ImageSize).height > 0)

const isBoardCorners = (value: unknown): value is BoardCorners => Array.isArray(value) && value.length === 4
  && value.every(point => Boolean(point && typeof point === 'object'
    && Number.isFinite((point as { x: unknown }).x) && Number.isFinite((point as { y: unknown }).y)))

export function isCalibratedCapture(value: unknown): value is CalibratedCapture {
  if (!value || typeof value !== 'object') return false
  const capture = value as Partial<CalibratedCapture>
  if (capture.kind !== 'calibrated-capture' || capture.outerEdgesConfirmed !== true) return false
  if (!isImageSize(capture.sourceSize) || !isImageSize(capture.rectifiedSize) || !isBoardCorners(capture.corners) || !capture.orientation) return false
  if (!['white-at-bottom', 'white-at-top', 'white-at-left', 'white-at-right'].includes(capture.orientation)) return false
  return calibrationError(capture.corners, capture.sourceSize, capture.outerEdgesConfirmed) === null
}

export async function recogniseBoard(capture: CalibratedCapture): Promise<Recognition> {
  if (!isCalibratedCapture(capture)) {
    return {
      kind: 'error',
      board: emptyBoard(),
      lowConfidence: [],
      message: 'Recognition requires a confirmed photo containing all four outer board corners.',
    }
  }
  try {
    await loadRecognitionModel()
    return { kind: 'unavailable', board: emptyBoard(), lowConfidence: [], message: 'A model file was found, but this build has no output adapter yet. Correct the board manually.' }
  } catch (error) {
    if (error instanceof RecognitionModelUnavailable) return { kind: 'unavailable', board: emptyBoard(), lowConfidence: [], message: 'Recognition model not installed. Start with an editable board.' }
    return { kind: 'error', board: emptyBoard(), lowConfidence: [], message: 'The recognition model could not be loaded. You can still correct the board manually.' }
  }
}
