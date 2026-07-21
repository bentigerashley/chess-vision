import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import { pieceGlyph, pieceLabel, pieces, type Piece } from '../lib/position'

type PiecePaletteProps = {
  selected: Piece | null
  onSelect: (piece: Piece | null) => void
}

export function PiecePalette({ selected, onSelect }: PiecePaletteProps) {
  return <View style={styles.container}>
    <Text style={styles.title}>Choose a piece, then tap a square</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.palette}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: selected === null }} accessibilityLabel="Clear selected square" style={[styles.clear, selected === null && styles.chosen]} onPress={() => onSelect(null)}><Text style={styles.clearText}>Clear</Text></Pressable>
      {pieces.map(piece => <Pressable key={piece} accessibilityRole="button" accessibilityState={{ selected: selected === piece }} accessibilityLabel={pieceLabel[piece]} style={[styles.piece, selected === piece && styles.chosen]} onPress={() => onSelect(piece)}><Text style={styles.glyph}>{pieceGlyph[piece]}</Text></Pressable>)}
    </ScrollView>
  </View>
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  title: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  palette: { alignItems: 'center', gap: 8, paddingRight: 12 },
  clear: { alignItems: 'center', borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 44, justifyContent: 'center', paddingHorizontal: 13 },
  clearText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  piece: { alignItems: 'center', borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  glyph: { color: colors.ink, fontSize: 26 },
  chosen: { borderColor: colors.green, borderWidth: 2, backgroundColor: '#415b2d' },
})
