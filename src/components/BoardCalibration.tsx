import { useMemo, useRef, useState } from 'react'
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import {
  asBoardCorners,
  calibrationError,
  canonicalCornerOrder,
  clampUnit,
  containBounds,
  defaultCorners,
  displayToNormalised,
  normalisedToDisplay,
} from '../lib/calibration'
import { colors, shared } from '../theme'
import type { BoardOrientation, CalibratedCapture, NativePhoto, Point } from '../types/capture'

type BoardCalibrationProps = {
  photo: NativePhoto
  onCalibrated: (capture: CalibratedCapture) => void
  onCancel: () => void
}

const cornerNames = ['Top left', 'Top right', 'Bottom right', 'Bottom left'] as const
const nudgeAmount = 0.025

export function BoardCalibration({ photo, onCalibrated, onCancel }: BoardCalibrationProps) {
  const previewRef = useRef<View>(null)
  const previewOrigin = useRef({ x: 0, y: 0 })
  const [preview, setPreview] = useState({ width: 0, height: 0 })
  const [corners, setCorners] = useState<(Point | undefined)[]>(() => [...defaultCorners])
  const [orientation, setOrientation] = useState<BoardOrientation>('white-at-bottom')
  const [outerEdgesConfirmed, setOuterEdgesConfirmed] = useState(false)

  const sourceSize = { width: photo.width, height: photo.height }
  const bounds = containBounds(preview, sourceSize)
  const boardCorners = asBoardCorners(corners)
  const error = calibrationError(boardCorners, outerEdgesConfirmed)
  const canContinue = Boolean(boardCorners && !error)

  const setCorner = (index: number, point: Point) => {
    setCorners(current => {
      const next = [...current]
      next[index] = point
      return next
    })
    setOuterEdgesConfirmed(false)
  }

  const setCornerFromPreview = (index: number, point: Point) => {
    setCorner(index, displayToNormalised(point, bounds))
  }

  const firstUnplacedCorner = () => corners.findIndex(corner => !corner)

  const placeCorner = (event: { nativeEvent: { locationX: number; locationY: number } }) => {
    const index = firstUnplacedCorner()
    if (index === -1) return
    setCornerFromPreview(index, { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY })
  }

  const updateFromPagePoint = (index: number, pageX: number, pageY: number) =>
    setCornerFromPreview(index, { x: pageX - previewOrigin.current.x, y: pageY - previewOrigin.current.y })

  const responders = useMemo(() => cornerNames.map((_, index) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => {
      previewRef.current?.measureInWindow((left, top) => {
        previewOrigin.current = { x: left, y: top }
        updateFromPagePoint(index, event.nativeEvent.pageX, event.nativeEvent.pageY)
      })
    },
    onPanResponderMove: (_event, gesture) => updateFromPagePoint(index, gesture.moveX, gesture.moveY),
  })), [bounds.height, bounds.width])

  const nudge = (index: number, x: number, y: number) => {
    const current = corners[index] ?? { x: 0.5, y: 0.5 }
    setCorner(index, { x: clampUnit(current.x + x), y: clampUnit(current.y + y) })
  }

  const onPreviewLayout = (event: LayoutChangeEvent) => {
    setPreview(event.nativeEvent.layout)
    previewRef.current?.measureInWindow((x, y) => { previewOrigin.current = { x, y } })
  }

  const nudgeDirections = [
    { label: 'left', glyph: '←', x: -nudgeAmount, y: 0 },
    { label: 'up', glyph: '↑', x: 0, y: -nudgeAmount },
    { label: 'down', glyph: '↓', x: 0, y: nudgeAmount },
    { label: 'right', glyph: '→', x: nudgeAmount, y: 0 },
  ] as const

  return <View style={[shared.card, styles.card]}>
    <Text style={shared.eyebrow}>CALIBRATE THE FULL BOARD</Text>
    <Text style={styles.title}>Mark the four outside corners</Text>
    <Text style={styles.help}>Tap the corners in order: top left, top right, bottom right, then bottom left. Drag a marker to refine it.</Text>

    <View ref={previewRef} style={[styles.preview, { aspectRatio: photo.width / photo.height }]} onLayout={onPreviewLayout}>
      <Image accessibilityLabel="Selected chessboard photo" source={{ uri: photo.uri }} resizeMode="contain" style={StyleSheet.absoluteFill} />
      <Pressable accessibilityRole="button" accessibilityLabel="Photo. Tap to mark the next board corner." style={StyleSheet.absoluteFill} onPress={placeCorner} />
      {corners.map((corner, index) => {
        if (!corner || !bounds.width || !bounds.height) return null
        const display = normalisedToDisplay(corner, bounds)
        return <View
          key={cornerNames[index]}
          style={[styles.handle, { left: display.x - 18, top: display.y - 18 }]}
          {...responders[index].panHandlers}
        ><Text style={styles.handleText}>{index + 1}</Text></View>
      })}
    </View>

    <Text accessibilityLiveRegion="polite" style={[styles.status, error && styles.error]}>
      {!boardCorners ? `${corners.filter(Boolean).length} of 4 corners marked.` : error ?? 'Board outline is valid. Confirm that the whole board is visible.'}
    </Text>

    <View style={styles.controls}>
      <Text style={styles.controlLabel}>Fine adjustments</Text>
      {cornerNames.map((name, index) => <View key={name} style={styles.nudgeRow}>
        <Text style={styles.cornerName}>{index + 1}. {name}</Text>
        <View style={styles.nudges}>
          {nudgeDirections.map(direction => <Pressable key={direction.label} accessibilityRole="button" accessibilityLabel={`Move ${name} ${direction.label}`} style={styles.nudge} onPress={() => nudge(index, direction.x, direction.y)}><Text style={styles.nudgeText}>{direction.glyph}</Text></Pressable>)}
        </View>
      </View>)}
    </View>

    <View style={styles.controls}>
      <Text style={styles.controlLabel}>Which side has White's pieces?</Text>
      <View style={styles.orientationRow}>
        <Pressable accessibilityRole="radio" accessibilityState={{ selected: orientation === 'white-at-bottom' }} style={[styles.orientation, orientation === 'white-at-bottom' && styles.orientationSelected]} onPress={() => setOrientation('white-at-bottom')}><Text style={styles.orientationText}>Closest to me</Text></Pressable>
        <Pressable accessibilityRole="radio" accessibilityState={{ selected: orientation === 'white-at-top' }} style={[styles.orientation, orientation === 'white-at-top' && styles.orientationSelected]} onPress={() => setOrientation('white-at-top')}><Text style={styles.orientationText}>Across from me</Text></Pressable>
      </View>
      <Text style={styles.caption}>The editor keeps canonical labels with White at the bottom. This choice is saved for a future recognition model.</Text>
    </View>

    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: outerEdgesConfirmed }} style={styles.confirmation} onPress={() => setOuterEdgesConfirmed(value => !value)}>
      <View style={[styles.checkbox, outerEdgesConfirmed && styles.checkboxChecked]}>{outerEdgesConfirmed && <Text style={styles.check}>✓</Text>}</View>
      <Text style={styles.confirmationText}>I can see all four physical outside corners and complete board edges. This is not a cropped board.</Text>
    </Pressable>

    <View style={styles.actions}>
      <Pressable accessibilityRole="button" style={styles.secondary} onPress={onCancel}><Text style={styles.secondaryText}>Choose another photo</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canContinue }} disabled={!canContinue} style={[styles.primary, !canContinue && styles.disabled]} onPress={() => boardCorners && onCalibrated({ kind: 'calibrated-capture', photo, corners: canonicalCornerOrder(boardCorners, orientation), orientation, outerEdgesConfirmed: true })}><Text style={styles.primaryText}>Continue to correction</Text></Pressable>
    </View>
  </View>
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  title: { color: colors.ink, fontSize: 23, fontWeight: '800' },
  help: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  preview: { backgroundColor: '#191816', borderColor: colors.border, borderWidth: 1, overflow: 'hidden', width: '100%' },
  handle: { alignItems: 'center', backgroundColor: colors.green, borderColor: colors.canvas, borderRadius: 18, borderWidth: 3, height: 36, justifyContent: 'center', position: 'absolute', width: 36 },
  handleText: { color: colors.canvas, fontSize: 15, fontWeight: '900' },
  status: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  error: { color: colors.warning },
  controls: { backgroundColor: colors.surfaceRaised, borderRadius: 10, gap: 8, padding: 12 },
  controlLabel: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  nudgeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cornerName: { color: colors.muted, flex: 1, fontSize: 13 },
  nudges: { flexDirection: 'row', gap: 6 },
  nudge: { alignItems: 'center', borderColor: colors.border, borderRadius: 6, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  nudgeText: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  orientationRow: { flexDirection: 'row', gap: 8 },
  orientation: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  orientationSelected: { backgroundColor: '#415b2d', borderColor: colors.green, borderWidth: 2 },
  orientationText: { color: colors.ink, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  confirmation: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  checkbox: { alignItems: 'center', borderColor: colors.muted, borderRadius: 4, borderWidth: 1, height: 22, justifyContent: 'center', marginTop: 1, width: 22 },
  checkboxChecked: { backgroundColor: colors.green, borderColor: colors.green },
  check: { color: colors.canvas, fontSize: 16, fontWeight: '900' },
  confirmationText: { color: colors.ink, flex: 1, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primary: { alignItems: 'center', backgroundColor: colors.green, borderRadius: 8, minHeight: 46, justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: colors.canvas, fontSize: 14, fontWeight: '900' },
  secondary: { alignItems: 'center', borderColor: colors.border, borderRadius: 8, borderWidth: 1, minHeight: 46, justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.45 },
})
