package com.chessvision.model

/**
 * Represents the 13 classes output by the TFLite piece classifier.
 * Index matches the model output: 0 = empty, 1–6 = white, 7–12 = black.
 */
enum class PieceType(val index: Int, val fenChar: Char?, val label: String) {
    EMPTY(0, null, "empty"),
    WHITE_PAWN(1, 'P', "white pawn"),
    WHITE_KNIGHT(2, 'N', "white knight"),
    WHITE_BISHOP(3, 'B', "white bishop"),
    WHITE_ROOK(4, 'R', "white rook"),
    WHITE_QUEEN(5, 'Q', "white queen"),
    WHITE_KING(6, 'K', "white king"),
    BLACK_PAWN(7, 'p', "black pawn"),
    BLACK_KNIGHT(8, 'n', "black knight"),
    BLACK_BISHOP(9, 'b', "black bishop"),
    BLACK_ROOK(10, 'r', "black rook"),
    BLACK_QUEEN(11, 'q', "black queen"),
    BLACK_KING(12, 'k', "black king");

    val isWhite: Boolean
        get() = index in 1..6

    val isBlack: Boolean
        get() = index in 7..12

    companion object {
        fun fromIndex(index: Int): PieceType = entries.getOrElse(index) { EMPTY }
    }
}
