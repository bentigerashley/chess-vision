package com.chessvision.model

/**
 * Result of Stockfish analysis: evaluation score (cp or mate) and best move.
 */
data class AnalysisResult(
    val evaluationCp: Int?,
    val mateInMoves: Int?,
    val bestMove: String?,
    val rawLine: String?
) {
    fun evaluationText(): String {
        if (mateInMoves != null) return "Mate in $mateInMoves"
        if (evaluationCp != null) {
            val side = if (evaluationCp >= 0) "White" else "Black"
            return "$side ${kotlin.math.abs(evaluationCp) / 100.0}"
        }
        return "—"
    }
}
