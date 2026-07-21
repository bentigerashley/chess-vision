import { useEffect, useMemo, useRef, useState } from 'react'
import { AppState, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, Pressable } from 'react-native'
import { BoardCalibration } from './src/components/BoardCalibration'
import { CapturePanel } from './src/components/CapturePanel'
import { ChessBoard } from './src/components/ChessBoard'
import { EngineLines } from './src/components/EngineLines'
import { PiecePalette } from './src/components/PiecePalette'
import { useStockfishAnalysis } from './src/hooks/useStockfishAnalysis'
import { emptyBoard, toFen, validatePosition, type Board, type Piece } from './src/lib/position'
import { recogniseBoard } from './src/services/recognition'
import { colors, shared } from './src/theme'
import type { CalibratedCapture, NativePhoto } from './src/types/capture'
import type { Turn } from './src/types/chess'
import type { Square } from 'chess.js'

export default function App() {
  const [board, setBoard] = useState<Board>(emptyBoard)
  const [turn, setTurn] = useState<Turn>('w')
  const [castling, setCastling] = useState('-')
  const [enPassant, setEnPassant] = useState('-')
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>('P')
  const [photo, setPhoto] = useState<NativePhoto>()
  const [capture, setCapture] = useState<CalibratedCapture>()
  const [message, setMessage] = useState('Start with a complete photo of the real board.')
  const recognitionRequest = useRef(0)
  const analysis = useStockfishAnalysis()

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') return
      analysis.cancel()
    })
    return () => subscription.remove()
  }, [analysis.cancel])

  const fen = useMemo(() => toFen(board, turn, castling || '-', enPassant || '-'), [board, castling, enPassant, turn])

  const choosePhoto = (nextPhoto: NativePhoto) => {
    recognitionRequest.current += 1
    analysis.reset()
    setPhoto(nextPhoto)
    setCapture(undefined)
    setBoard(emptyBoard())
    setMessage('Mark all four outer board corners before recognition can start.')
  }

  const completeCalibration = async (nextCapture: CalibratedCapture) => {
    const request = recognitionRequest.current + 1
    recognitionRequest.current = request
    setPhoto(undefined)
    setCapture(nextCapture)
    analysis.reset()
    try {
      const result = await recogniseBoard(nextCapture)
      if (recognitionRequest.current !== request) return
      setBoard(result.board)
      setMessage(result.message)
    } catch (error) {
      if (recognitionRequest.current !== request) return
      setBoard(emptyBoard())
      setMessage(error instanceof Error ? `${error.message} Correct the board manually before analysis.` : 'Recognition could not start. Correct the board manually before analysis.')
    }
  }

  const retake = () => {
    recognitionRequest.current += 1
    analysis.reset()
    setPhoto(undefined)
    setCapture(undefined)
    setBoard(emptyBoard())
    setMessage('Choose a complete board photo to begin again.')
  }

  const assignPiece = (square: Square, piece: Piece | null) => {
    if (board[square] === piece) return
    analysis.reset()
    setBoard(current => ({ ...current, [square]: piece }))
  }

  const runAnalysis = () => {
    if (!capture) {
      setMessage('Calibrate a complete board photo before analysis.')
      return
    }
    const validation = validatePosition(board, turn, castling || '-', enPassant || '-')
    if (!validation.valid) {
      setMessage(validation.message)
      return
    }
    setMessage('Stockfish is analysing your corrected position.')
    analysis.analyse(validation.fen)
  }

  return <SafeAreaView style={styles.safeArea}>
    <StatusBar barStyle="light-content" />
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><Text style={styles.brandMark}>♞</Text><Text style={styles.brand}>chess vision</Text><View style={styles.nativeBadge}><Text style={styles.nativeText}>NATIVE</Text></View></View>
      <Text style={styles.intro}>Correctable board capture and private on-device analysis for iPhone and Android.</Text>

      {!capture && <CapturePanel onPhoto={choosePhoto} onMessage={setMessage} />}
      {photo && <BoardCalibration photo={photo} onCalibrated={completeCalibration} onCancel={retake} />}

      <Text accessibilityLiveRegion="polite" style={styles.status}>{message}</Text>

      {capture && <>
        <View style={[shared.card, styles.captureSummary]}><View><Text style={shared.eyebrow}>FULL BOARD CONFIRMED</Text><Text style={styles.captureText}>The position below is the source of truth. Review every square before analysis.</Text></View><Pressable accessibilityRole="button" style={styles.retake} onPress={retake}><Text style={styles.retakeText}>Retake</Text></Pressable></View>
        <View style={styles.boardSection}>
          <ChessBoard board={board} selected={selectedPiece} onAssign={assignPiece} />
          <PiecePalette selected={selectedPiece} onSelect={setSelectedPiece} />
        </View>
        <View style={[shared.card, styles.positionCard]}>
          <Text style={shared.eyebrow}>POSITION CHECK</Text>
          <Text selectable style={styles.fen}>{fen}</Text>
          <Text style={styles.label}>Side to move</Text>
          <View style={styles.turnRow}>
            <Pressable accessibilityRole="radio" accessibilityState={{ selected: turn === 'w' }} style={[styles.turn, turn === 'w' && styles.turnSelected]} onPress={() => { if (turn !== 'w') { analysis.reset(); setTurn('w') } }}><Text style={styles.turnText}>White</Text></Pressable>
            <Pressable accessibilityRole="radio" accessibilityState={{ selected: turn === 'b' }} style={[styles.turn, turn === 'b' && styles.turnSelected]} onPress={() => { if (turn !== 'b') { analysis.reset(); setTurn('b') } }}><Text style={styles.turnText}>Black</Text></Pressable>
          </View>
          <View style={styles.historyRow}>
            <View style={styles.historyField}><Text style={styles.label}>Castling</Text><TextInput accessibilityLabel="Castling rights" autoCapitalize="characters" autoCorrect={false} maxLength={4} onChangeText={value => { const next = value || '-'; if (next !== castling) { analysis.reset(); setCastling(next) } }} style={styles.input} value={castling} placeholder="- or KQkq" placeholderTextColor="#8a857c" /></View>
            <View style={styles.historyField}><Text style={styles.label}>En passant</Text><TextInput accessibilityLabel="En passant target" autoCapitalize="none" autoCorrect={false} maxLength={2} onChangeText={value => { const next = value || '-'; if (next !== enPassant) { analysis.reset(); setEnPassant(next) } }} style={styles.input} value={enPassant} placeholder="- or e3" placeholderTextColor="#8a857c" /></View>
          </View>
          <Text style={styles.historyHint}>Use “-” when the photo cannot establish history.</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: analysis.status === 'starting' || analysis.status === 'searching' }} disabled={analysis.status === 'starting' || analysis.status === 'searching'} style={[styles.analyse, (analysis.status === 'starting' || analysis.status === 'searching') && styles.analyseDisabled]} onPress={runAnalysis}><Text style={styles.analyseText}>Analyse with Stockfish →</Text></Pressable>
        </View>
        <EngineLines lines={analysis.lines} status={analysis.status} error={analysis.error} onCancel={() => { analysis.cancel(); setMessage('Analysis cancelled. You can keep correcting the position.') }} onRetry={runAnalysis} />
      </>}

      {!capture && <View style={[shared.card, styles.gate]}><Text style={shared.eyebrow}>ANALYSIS GATE</Text><Text style={styles.gateText}>A confirmed full-board photo is required before Stockfish can analyse a position.</Text></View>}
    </ScrollView>
  </SafeAreaView>
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  page: { gap: 16, padding: 16, paddingBottom: 36 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 7, paddingTop: 4 },
  brandMark: { color: colors.green, fontSize: 26 },
  brand: { color: colors.ink, fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  nativeBadge: { backgroundColor: '#415b2d', borderRadius: 5, marginLeft: 5, paddingHorizontal: 7, paddingVertical: 3 },
  nativeText: { color: '#dff5bf', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 2 },
  status: { color: colors.warning, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  captureSummary: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  captureText: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 5, maxWidth: 245 },
  retake: { borderColor: colors.border, borderRadius: 7, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  retakeText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  boardSection: { gap: 13 },
  positionCard: { gap: 11 },
  fen: { backgroundColor: '#211f1c', borderRadius: 8, color: colors.cream, fontFamily: 'monospace', fontSize: 12, lineHeight: 18, padding: 11 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  turnRow: { flexDirection: 'row', gap: 8 },
  turn: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, minHeight: 42, justifyContent: 'center' },
  turnSelected: { backgroundColor: '#415b2d', borderColor: colors.green, borderWidth: 2 },
  turnText: { color: colors.ink, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  historyRow: { flexDirection: 'row', gap: 10 },
  historyField: { flex: 1, gap: 5 },
  input: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.ink, fontSize: 14, minHeight: 43, paddingHorizontal: 10 },
  historyHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  analyse: { alignItems: 'center', backgroundColor: colors.green, borderRadius: 8, justifyContent: 'center', minHeight: 50, marginTop: 2 },
  analyseDisabled: { opacity: 0.5 },
  analyseText: { color: colors.canvas, fontSize: 15, fontWeight: '900' },
  gate: { gap: 8 },
  gateText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
})
