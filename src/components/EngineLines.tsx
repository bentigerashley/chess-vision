import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { EngineLine } from '../services/stockfish'
import type { AnalysisStatus } from '../hooks/useStockfishAnalysis'
import { colors, shared } from '../theme'

type EngineLinesProps = {
  lines: EngineLine[]
  status: AnalysisStatus
  error?: string
  onCancel: () => void
  onRetry: () => void
}

export function EngineLines({ lines, status, error, onCancel, onRetry }: EngineLinesProps) {
  const isSearching = status === 'starting' || status === 'searching'
  return <View style={[shared.card, styles.container]}>
    <View style={styles.heading}><Text style={shared.eyebrow}>TOP ENGINE LINES</Text>{isSearching && <Pressable accessibilityRole="button" style={styles.cancel} onPress={onCancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>}</View>
    {isSearching && <Text accessibilityLiveRegion="polite" style={styles.searching}>Analysing the corrected position…</Text>}
    {status === 'error' && <View style={styles.errorBlock}><Text accessibilityLiveRegion="polite" style={styles.error}>{error ?? 'Analysis failed.'}</Text><Pressable accessibilityRole="button" style={styles.retry} onPress={onRetry}><Text style={styles.retryText}>Retry</Text></Pressable></View>}
    {!isSearching && status !== 'error' && !lines.length && <Text style={styles.empty}>Your principal variations will appear here after analysis.</Text>}
    {Boolean(lines.length) && <>
      {lines.length < 3 && <Text style={styles.partial}>Partial result — Stockfish returned {lines.length} line{lines.length === 1 ? '' : 's'}.</Text>}
      {lines.map(line => <View key={line.rank} style={styles.line}>
        <View style={styles.lineHeader}><Text style={styles.rank}>#{line.rank}</Text><Text style={styles.evaluation}>{line.evaluation}</Text><Text style={styles.depth}>depth {line.depth}</Text></View>
        <Text selectable style={styles.moves}>{line.moves}</Text>
      </View>)}
    </>}
  </View>
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  searching: { color: colors.warning, fontSize: 14, fontWeight: '700' },
  cancel: { borderColor: colors.warning, borderRadius: 7, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  cancelText: { color: colors.warning, fontSize: 13, fontWeight: '800' },
  errorBlock: { backgroundColor: '#4c2d2c', borderRadius: 8, gap: 8, padding: 12 },
  error: { color: '#ffd3ce', fontSize: 14, lineHeight: 20 },
  retry: { alignSelf: 'flex-start', backgroundColor: colors.danger, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 8 },
  retryText: { color: colors.canvas, fontSize: 13, fontWeight: '900' },
  empty: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  partial: { color: colors.warning, fontSize: 13, fontWeight: '700' },
  line: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 7, padding: 12 },
  lineHeader: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  rank: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  evaluation: { color: colors.green, fontSize: 19, fontWeight: '900' },
  depth: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  moves: { color: colors.ink, fontFamily: 'monospace', fontSize: 13, lineHeight: 19 },
})
