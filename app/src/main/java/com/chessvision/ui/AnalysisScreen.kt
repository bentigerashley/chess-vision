package com.chessvision.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.chessvision.model.AnalysisResult
import com.chessvision.model.PieceType
import com.chessvision.ui.theme.AccentMuted

/**
 * Analysis screen: detected board stays visible on top; below, evaluation bar + score + best move.
 * Options to go back to verification (to correct and re-analyze) or start a new scan.
 */
@Composable
fun AnalysisScreen(
    board: Array<Array<PieceType>>,
    fenString: String?,
    analysisResult: AnalysisResult?,
    isAnalyzing: Boolean,
    onBackToVerification: () -> Unit,
    onNewScan: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        // Board remains visible for context
        Box(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .align(Alignment.CenterHorizontally)
                .padding(vertical = 8.dp)
        ) {
            BoardPreview(
                board = board,
                interactive = false
            )
        }

        // Analysis panel
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            EvaluationBar(result = analysisResult)
            Column(
                verticalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.weight(1f)
            ) {
                if (isAnalyzing) {
                    CircularProgressIndicator(
                        modifier = Modifier.padding(8.dp),
                        color = AccentMuted
                    )
                    Text(
                        text = "Analyzing…",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Text(
                        text = analysisResult?.evaluationText() ?: "—",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Best move: ${analysisResult?.bestMove ?: "—"}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        if (fenString != null) {
            Text(
                text = "FEN: $fenString",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 16.dp)
            )
        }

        // Actions
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick = onBackToVerification,
                modifier = Modifier.weight(1f)
            ) {
                Text("Correct position")
            }
            Button(
                onClick = onNewScan,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = AccentMuted)
            ) {
                Text("New scan")
            }
        }
    }
}
