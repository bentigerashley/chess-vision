import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import { files, pieceGlyph, pieceLabel, ranks, type Board, type Piece } from '../lib/position'
import type { Square } from 'chess.js'

type ChessBoardProps = {
  board: Board
  selected: Piece | null
  onAssign: (square: Square, piece: Piece | null) => void
}

export function ChessBoard({ board, selected, onAssign }: ChessBoardProps) {
  return <View accessibilityRole="summary" accessibilityLabel="Correctable chess position, White side at the bottom" style={styles.board}>
    {ranks.map((rank, row) => <View key={rank} style={styles.row}>
      {files.map((file, column) => {
        const square = `${file}${rank}` as Square
        const piece = board[square]
        const isDark = (row + column) % 2 === 1
        return <Pressable
          key={square}
          accessibilityRole="button"
          accessibilityLabel={`${square}, ${piece ? pieceLabel[piece] : 'empty'}. ${selected ? `Assign ${pieceLabel[selected]}` : 'Clear square'}.`}
          style={[styles.square, isDark ? styles.dark : styles.light]}
          onPress={() => onAssign(square, selected)}
        >
          {piece && <Text style={[styles.piece, piece === piece.toUpperCase() ? styles.whitePiece : styles.blackPiece]}>{pieceGlyph[piece]}</Text>}
          {column === 0 && <Text style={[styles.rank, isDark ? styles.lightLabel : styles.darkLabel]}>{rank}</Text>}
          {row === 7 && <Text style={[styles.file, isDark ? styles.lightLabel : styles.darkLabel]}>{file}</Text>}
        </Pressable>
      })}
    </View>)}
  </View>
}

const styles = StyleSheet.create({
  board: { aspectRatio: 1, borderColor: '#171614', borderWidth: 5, overflow: 'hidden', width: '100%' },
  row: { flex: 1, flexDirection: 'row' },
  square: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 35, position: 'relative' },
  light: { backgroundColor: colors.cream },
  dark: { backgroundColor: colors.brown },
  piece: { fontSize: 31, lineHeight: 37, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 1 },
  whitePiece: { color: colors.whitePiece },
  blackPiece: { color: colors.blackPiece },
  rank: { fontSize: 10, fontWeight: '900', left: 3, position: 'absolute', top: 2 },
  file: { bottom: 1, fontSize: 10, fontWeight: '900', position: 'absolute', right: 3 },
  lightLabel: { color: colors.cream },
  darkLabel: { color: colors.brown },
})
