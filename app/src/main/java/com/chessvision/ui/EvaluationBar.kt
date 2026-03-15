package com.chessvision.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.chessvision.model.AnalysisResult

/**
 * Vertical evaluation bar (chess-engine style). White advantage = fill from center upward,
 * Black advantage = fill from center downward. Neutral at center.
 * Uses a normalized score in [-1, 1] for display; mate is shown as ±1.
 */
@Composable
fun EvaluationBar(
    result: AnalysisResult?,
    modifier: Modifier = Modifier
) {
    val (normalized, isMate) = when {
        result == null -> 0f to false
        result.mateInMoves != null -> {
            val sign = if (result.mateInMoves!! > 0) 1f else -1f
            sign to true
        }
        result.evaluationCp != null -> {
            val cp = result.evaluationCp!!.toFloat()
            // Map centipawns to roughly [-1, 1]; clamp for display
            val n = (cp / 500f).coerceIn(-1f, 1f)
            n to false
        }
        else -> 0f to false
    }

    Box(
        modifier = modifier
            .width(12.dp)
            .height(120.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
    ) {
        val fillFraction = (normalized + 1f) / 2f // 0 = black, 0.5 = even, 1 = white
        Box(
            modifier = Modifier
                .align(if (normalized >= 0) Alignment.TopCenter else Alignment.BottomCenter)
                .fillMaxWidth()
                .fillMaxHeight(if (normalized >= 0) fillFraction else (1f - fillFraction))
                .clip(RoundedCornerShape(6.dp))
                .background(
                    if (normalized >= 0) Color(0xFFF0D9B5) else Color(0xFF5C4033)
                )
        )
    }
}
