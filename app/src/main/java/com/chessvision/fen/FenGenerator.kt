package com.chessvision.fen

import com.chessvision.model.PieceType

/**
 * Converts an 8x8 board array (row 0 = rank 8, row 7 = rank 1) into a FEN string.
 * Handles empty square compression and default FEN fields.
 */
object FenGenerator {

    /**
     * Build FEN position part from board (piece placement only).
     * Board[row][col]: row 0 = 8th rank (black side), row 7 = 1st rank (white side).
     * Col 0 = a-file, col 7 = h-file.
     */
    fun piecePlacementToFen(board: Array<Array<PieceType>>): String {
        require(board.size == 8 && board.all { it.size == 8 }) { "Board must be 8x8" }
        val ranks = mutableListOf<String>()
        for (row in 0..7) {
            var rank = ""
            var emptyCount = 0
            for (col in 0..7) {
                val piece = board[row][col]
                if (piece == PieceType.EMPTY) {
                    emptyCount++
                } else {
                    if (emptyCount > 0) {
                        rank += emptyCount
                        emptyCount = 0
                    }
                    rank += piece.fenChar
                }
            }
            if (emptyCount > 0) rank += emptyCount
            ranks.add(rank)
        }
        return ranks.joinToString("/")
    }

    /**
     * Full FEN string with default values:
     * - Side to move: white
     * - Castling: KQkq
     * - En passant: -
     * - Halfmove clock: 0
     * - Fullmove: 1
     */
    fun toFullFen(board: Array<Array<PieceType>>): String {
        val placement = piecePlacementToFen(board)
        return "$placement w KQkq - 0 1"
    }
}
