export type Point = { x: number; y: number }

export type ImageSize = { width: number; height: number }

/** Coordinates are normalised to the displayed image's source pixels. */
export type BoardCorners = readonly [Point, Point, Point, Point]

export type BoardOrientation = 'white-at-bottom' | 'white-at-top'

export type NativePhoto = {
  uri: string
  width: number
  height: number
  fileName?: string | null
  mimeType?: string | null
}

export type CalibratedCapture = {
  kind: 'calibrated-capture'
  photo: NativePhoto
  corners: BoardCorners
  orientation: BoardOrientation
  outerEdgesConfirmed: true
}
