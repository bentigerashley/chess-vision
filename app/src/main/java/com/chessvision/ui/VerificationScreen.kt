package com.chessvision.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.chessvision.model.PieceType
import com.chessvision.ui.theme.AccentMuted

/**
 * Verification screen: confirm or correct the detected position before analysis.
 * Tap a square to set piece (empty or any of 12 pieces); rotate board if orientation was wrong.
 * FEN is selectable/copyable; "Analyze" runs the engine. "Show debug" toggles confidence overlay.
 */
@Composable
fun VerificationScreen(
    board: Array<Array<PieceType>>,
    confidenceGrid: Array<Array<Float>>?,
    fenString: String,
    errorMessage: String?,
    isAnalyzing: Boolean,
    showDebugOverlay: Boolean,
    onPieceSet: (row: Int, col: Int, piece: PieceType) -> Unit,
    onRotateBoard: () -> Unit,
    onAnalyze: () -> Unit,
    onBackToCapture: () -> Unit,
    onToggleDebug: () -> Unit,
    modifier: Modifier = Modifier
) {
    var selectorSquare by remember { mutableStateOf<Pair<Int, Int>?>(null) }

    selectorSquare?.let { (row, col) ->
        PieceSelectorSheet(
            onPieceSelected = { piece ->
                onPieceSet(row, col, piece)
                selectorSquare = null
            },
            onDismiss = { selectorSquare = null }
        )
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        // Header: title + retake
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Confirm position",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
            OutlinedButton(
                onClick = onBackToCapture,
                content = { Text("Retake photo") }
            )
        }

        if (errorMessage != null) {
            Text(
                text = errorMessage,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }

        // Board: tap to open piece selector
        Box(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .align(Alignment.CenterHorizontally)
                .padding(vertical = 8.dp)
        ) {
            BoardPreview(
                board = board,
                confidenceGrid = confidenceGrid,
                interactive = true,
                showDebugOverlay = showDebugOverlay,
                onSquareClick = { r, c -> selectorSquare = Pair(r, c) }
            )
        }

        // Rotate board
        OutlinedButton(
            onClick = onRotateBoard,
            modifier = Modifier.align(Alignment.CenterHorizontally)
        ) {
            Text("Rotate board 180°")
        }

        // FEN panel: selectable/copyable
        Text(
            text = "FEN",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 16.dp)
        )
        SelectionContainer {
            Text(
                text = fenString,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(vertical = 4.dp)
            )
        }

        // Analyze button
        Button(
            onClick = onAnalyze,
            enabled = !isAnalyzing,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = AccentMuted)
        ) {
            if (isAnalyzing) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = MaterialTheme.colorScheme.onPrimary
                )
            } else {
                Text("Analyze")
            }
        }

        // Debug overlay toggle (for development/testing)
        OutlinedButton(
            onClick = onToggleDebug,
            modifier = Modifier
                .padding(top = 8.dp)
                .align(Alignment.CenterHorizontally)
        ) {
            Text(if (showDebugOverlay) "Hide debug" else "Show debug")
        }
    }
}
