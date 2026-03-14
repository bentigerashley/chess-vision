package com.chessvision.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import com.chessvision.model.PieceType
import com.chessvision.ui.theme.DarkSquare
import com.chessvision.ui.theme.LightSquare

/**
 * 8x8 grid visualizing the detected board (FEN pieces). Light/dark square colors.
 */
@Composable
fun BoardPreview(
    board: Array<Array<PieceType>>,
    modifier: Modifier = Modifier
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
            Box(
                modifier = Modifier
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(2))
                    .background(if (isLight) LightSquare else DarkSquare),
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
            }
        }
    }
}
