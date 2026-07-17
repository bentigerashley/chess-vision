import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react'
import {
  calibrationError,
  rectifyBoardImage,
  type BoardCorners,
  type BoardOrientation,
  type ImageSize,
  type Point,
} from '../lib/boardGeometry'
import type { CalibratedCapture } from '../services/recognition'
import './BoardCalibration.css'

type BoardCalibrationProps = {
  file: File
  onCalibrated: (capture: CalibratedCapture) => void
  onCancel: () => void
}

const cornerNames = ['Top left', 'Top right', 'Bottom right', 'Bottom left'] as const

const clamp = (value: number, maximum: number) => Math.max(0, Math.min(maximum, value))

const isPoint = (point: Point | undefined): point is Point => Boolean(point)

const asBoardCorners = (corners: (Point | undefined)[]): BoardCorners | undefined => {
  if (corners.length !== 4 || !corners.every(isPoint)) return undefined
  return [corners[0], corners[1], corners[2], corners[3]]
}

export function BoardCalibration({ file, onCalibrated, onCancel }: BoardCalibrationProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [sourceSize, setSourceSize] = useState<ImageSize>()
  const [corners, setCorners] = useState<(Point | undefined)[]>([])
  const [outerEdgesConfirmed, setOuterEdgesConfirmed] = useState(false)
  const [orientation, setOrientation] = useState<BoardOrientation>('white-at-bottom')
  const [dragging, setDragging] = useState<number | null>(null)
  const [isRectifying, setIsRectifying] = useState(false)
  const [renderError, setRenderError] = useState<string>()
  const photoUrl = useMemo(() => URL.createObjectURL(file), [file])

  useEffect(() => () => URL.revokeObjectURL(photoUrl), [photoUrl])

  const boardCorners = asBoardCorners(corners)
  const geometryError = sourceSize && boardCorners
    ? calibrationError(boardCorners, sourceSize, outerEdgesConfirmed)
    : undefined
  const canConfirm = Boolean(boardCorners && sourceSize && !geometryError && !isRectifying)

  const suggestedPoint = (index: number): Point => {
    const width = sourceSize?.width ?? 0
    const height = sourceSize?.height ?? 0
    return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }][index]
  }

  const updateCorner = (index: number, point: Point) => {
    if (!sourceSize) return
    setCorners(current => {
      const next = [...current]
      next[index] = { x: clamp(point.x, sourceSize.width), y: clamp(point.y, sourceSize.height) }
      return next
    })
    setOuterEdgesConfirmed(false)
    setRenderError(undefined)
  }

  const imagePoint = (event: PointerEvent<HTMLElement>): Point | undefined => {
    const image = imageRef.current
    if (!image || !sourceSize) return undefined
    const bounds = image.getBoundingClientRect()
    return {
      x: clamp((event.clientX - bounds.left) * sourceSize.width / bounds.width, sourceSize.width),
      y: clamp((event.clientY - bounds.top) * sourceSize.height / bounds.height, sourceSize.height),
    }
  }

  const placeCorner = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging !== null) return
    const firstMissing = corners.findIndex(point => !point)
    const nextIndex = firstMissing === -1 && corners.length < 4 ? corners.length : firstMissing
    if (nextIndex === -1) return
    const point = imagePoint(event)
    if (point) updateCorner(nextIndex, point)
  }

  const startDrag = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(index)
  }

  const dragCorner = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    if (dragging !== index) return
    const point = imagePoint(event)
    if (point) updateCorner(index, point)
  }

  const nudgeCorner = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    const delta = event.shiftKey ? 10 : 2
    const change = event.key === 'ArrowLeft' ? { x: -delta, y: 0 }
      : event.key === 'ArrowRight' ? { x: delta, y: 0 }
        : event.key === 'ArrowUp' ? { x: 0, y: -delta }
          : event.key === 'ArrowDown' ? { x: 0, y: delta }
            : undefined
    if (!change) return
    event.preventDefault()
    const point = corners[index] ?? suggestedPoint(index)
    updateCorner(index, { x: point.x + change.x, y: point.y + change.y })
  }

  const updateCoordinate = (index: number, coordinate: keyof Point, event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    if (!Number.isFinite(value)) return
    const point = corners[index] ?? suggestedPoint(index)
    updateCorner(index, { ...point, [coordinate]: value })
  }

  const confirmCalibration = async () => {
    if (!boardCorners || !sourceSize || !imageRef.current || geometryError) return
    setIsRectifying(true)
    setRenderError(undefined)
    try {
      const rectifiedImage = await rectifyBoardImage(imageRef.current, sourceSize, boardCorners, orientation)
      onCalibrated({
        kind: 'calibrated-capture',
        source: file,
        sourceSize,
        corners: boardCorners,
        orientation,
        rectifiedImage,
        rectifiedSize: { width: 512, height: 512 },
        outerEdgesConfirmed: true,
      })
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : 'The board could not be rectified. Retake the photo and try again.')
    } finally {
      setIsRectifying(false)
    }
  }

  return <section className="calibration" aria-labelledby="calibration-title">
    <p className="eyebrow">CALIBRATE THE FULL BOARD</p>
    <h2 id="calibration-title">Mark the four outside corners</h2>
    <p id="calibration-instructions">Tap the corners in order: top left, top right, bottom right, then bottom left. Drag a marker to refine it; focused markers support arrow keys (Shift + arrow for larger moves).</p>
    <div
      className="calibration-photo"
      onPointerDown={placeCorner}
      aria-describedby="calibration-instructions"
    >
      <img
        ref={imageRef}
        src={photoUrl}
        alt="Imported chessboard photo. Mark its four outside corners."
        onLoad={event => setSourceSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        onError={() => setRenderError('This photo could not be read. Choose a supported image file.')}
      />
      {sourceSize && boardCorners && <svg className="calibration-outline" viewBox={`0 0 ${sourceSize.width} ${sourceSize.height}`} aria-hidden="true"><polygon points={boardCorners.map(point => `${point.x},${point.y}`).join(' ')} /></svg>}
      {sourceSize && corners.map((point, index) => point && <button
        key={cornerNames[index]}
        type="button"
        className={`calibration-handle ${dragging === index ? 'dragging' : ''}`}
        style={{ left: `${point.x / sourceSize.width * 100}%`, top: `${point.y / sourceSize.height * 100}%` }}
        aria-label={`${cornerNames[index]} board corner at ${Math.round(point.x)}, ${Math.round(point.y)}. Use arrow keys to adjust.`}
        onPointerDown={event => startDrag(index, event)}
        onPointerMove={event => dragCorner(index, event)}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
        onKeyDown={event => nudgeCorner(index, event)}
      ><span>{index + 1}</span></button>)}
    </div>

    <p className="calibration-state" aria-live="polite">
      {!sourceSize ? 'Loading photo...' : !boardCorners ? `${corners.filter(isPoint).length} of 4 corners marked.` : geometryError ?? 'Board outline is valid. Confirm that the complete board is visible.'}
    </p>

    <fieldset className="calibration-fields">
      <legend>Corner coordinates (keyboard alternative)</legend>
      {cornerNames.map((name, index) => <label key={name}>{name}
        <span><input aria-label={`${name} X coordinate`} type="number" min="0" max={sourceSize?.width} value={corners[index]?.x ?? ''} onChange={event => updateCoordinate(index, 'x', event)} /> x</span>
        <span><input aria-label={`${name} Y coordinate`} type="number" min="0" max={sourceSize?.height} value={corners[index]?.y ?? ''} onChange={event => updateCoordinate(index, 'y', event)} /> y</span>
      </label>)}
    </fieldset>

    <fieldset className="calibration-orientation">
      <legend>Which side has White&apos;s pieces?</legend>
      <label><input type="radio" name="orientation" checked={orientation === 'white-at-bottom'} onChange={() => setOrientation('white-at-bottom')} /> At the bottom of this photo</label>
      <label><input type="radio" name="orientation" checked={orientation === 'white-at-top'} onChange={() => setOrientation('white-at-top')} /> At the top of this photo</label>
      <label><input type="radio" name="orientation" checked={orientation === 'white-at-left'} onChange={() => setOrientation('white-at-left')} /> On the left of this photo</label>
      <label><input type="radio" name="orientation" checked={orientation === 'white-at-right'} onChange={() => setOrientation('white-at-right')} /> On the right of this photo</label>
      <small>The rectified model image is always rotated to White at the bottom.</small>
    </fieldset>

    <label className="outer-edge-confirmation"><input type="checkbox" checked={outerEdgesConfirmed} onChange={event => setOuterEdgesConfirmed(event.target.checked)} /> I can see all four physical outside corners and the complete board edges. This is not a cropped board.</label>
    {renderError && <p className="calibration-error" role="alert">{renderError}</p>}
    <div className="calibration-actions"><button type="button" className="quiet" onClick={onCancel}>Choose another photo</button><button type="button" onClick={confirmCalibration} disabled={!canConfirm}>{isRectifying ? 'Rectifying board...' : 'Use this full board'}</button></div>
  </section>
}
