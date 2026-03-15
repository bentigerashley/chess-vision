package com.chessvision.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chessvision.ml.PieceClassifier
import com.chessvision.model.PieceType
import com.chessvision.ui.theme.DarkSquare
import com.chessvision.ui.theme.LightSquare
import com.chessvision.ui.theme.LowConfidenceTint

/**
 * 8x8 grid visualizing the detected board. Standard light/dark square colors.
 * Optional: tap to edit (onSquareClick), low-confidence tint, debug confidence values.
 */
@Composable
fun BoardPreview(
    board: Array<Array<PieceType>>,
    modifier: Modifier = Modifier,
    confidenceGrid: Array<Array<Float>>? = null,
    interactive: Boolean = false,
    showDebugOverlay: Boolean = false,
    onSquareClick: ((row: Int, col: Int) -> Unit)? = null
) {
    val flat = board.flatMap { it.toList() }
    LazyVerticalGrid(
        modifier = modifier.aspectRatio(1f),
        columns = GridCells.Fixed(8),
        horizontalArrangement = Arrangement.spacedBy(1.dp),
        verticalArrangement = Arrangement.spacedBy(1.dp)
    ) {
        itemsIndexed(flat) { index, piece ->
            val row = index / 8
            val col = index % 8
            val isLight = (row + col) % 2 == 0
            val confidence = confidenceGrid?.getOrNull(row)?.getOrNull(col)
            val lowConfidence = confidence != null && confidence < PieceClassifier.MIN_CONFIDENCE
            Box(
                modifier = Modifier
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(2))
                    .background(if (isLight) LightSquare else DarkSquare)
                    .then(
                        if (lowConfidence && !showDebugOverlay)
                            Modifier.background(LowConfidenceTint)
                        else Modifier
                    )
                    .then(
                        if (interactive && onSquareClick != null)
                            Modifier.clickable { onSquareClick(row, col) }
                        else Modifier
                    )
                    .then(
                        if (showDebugOverlay && confidence != null)
                            Modifier.border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.5f), RoundedCornerShape(2))
                        else Modifier
                    ),
                contentAlignment = Alignment.Center
            ) {
                val fenChar = piece.fenChar
                if (fenChar != null) {
                    val symbol = when (fenChar) {
                        'K' -> "♔"
                        'Q' -> "♕"
                        'R' -> "♖"
                        'B' -> "♗"
                        'N' -> "♘"
                        'P' -> "♙"
                        'k' -> "♚"
                        'q' -> "♛"
                        'r' -> "♜"
                        'b' -> "♝"
                        'n' -> "♞"
                        'p' -> "♟"
                        else -> fenChar.toString()
                    }
                    Text(
                        text = symbol,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                if (showDebugOverlay && confidence != null) {
                    Text(
                        text = "%.0f".format(confidence * 100),
                        fontSize = 8.sp,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(2.dp),
                        textAlign = TextAlign.End
                    )
                }
            }
        }
    }
}
