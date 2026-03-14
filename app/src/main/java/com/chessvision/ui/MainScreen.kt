package com.chessvision.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import com.chessvision.camera.CameraManager
import com.chessvision.viewmodel.ChessViewModel

/**
 * Main screen: camera preview, Capture / Import buttons, then detected board,
 * FEN, and Stockfish analysis in a bottom panel.
 */
@Composable
fun MainScreen(viewModel: ChessViewModel) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val uiState by viewModel.uiState.collectAsState()

    val cameraManager = remember { CameraManager(context) }
    val previewView = remember { PreviewView(context) }

    DisposableEffect(lifecycleOwner) {
        viewModel.setCameraManager(cameraManager)
        onDispose {
            viewModel.setCameraManager(null)
        }
    }

    LaunchedEffect(lifecycleOwner) {
        cameraManager.bindCaptureUseCase(lifecycleOwner, previewView)
    }

    DisposableEffect(Unit) {
        onDispose { cameraManager.unbind() }
    }

    val importLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { viewModel.importImage(it) }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        // --- Top: Camera preview ---
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(280.dp),
            contentAlignment = Alignment.Center
        ) {
            AndroidView(previewView)
            if (uiState.isCapturing) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }

        // --- Middle: Buttons ---
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = { viewModel.captureBoard() },
                enabled = !uiState.isCapturing && !uiState.isProcessing
            ) {
                Text("Capture Board")
            }
            OutlinedButton(
                onClick = { importLauncher.launch("image/*") },
                enabled = !uiState.isProcessing
            ) {
                Text("Import Image")
            }
        }

        // Error message
        uiState.errorMessage?.let { msg ->
            Text(
                text = msg,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(16.dp)
            )
        }

        if (uiState.isProcessing || uiState.isAnalyzing) {
            CircularProgressIndicator(
                modifier = Modifier.padding(16.dp),
                color = MaterialTheme.colorScheme.primary
            )
        }

        // --- Bottom: Detected board + FEN + Analysis ---
        uiState.detectedBoard?.let { board ->
            Spacer(modifier = Modifier.height(8.dp))
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        "Detected board",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                    BoardPreview(
                        board = board,
                        modifier = Modifier.fillMaxWidth(0.9f).align(Alignment.CenterHorizontally)
                    )
                    uiState.fenString?.let { fen ->
                        Text(
                            "FEN",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = fen,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    uiState.analysisResult?.let { result ->
                        Text(
                            "Evaluation",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = result.evaluationText(),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            "Best move",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = result.bestMove ?: "—",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }
}

/** Wraps PreviewView for Compose (no AndroidView in dependency - use androidx.compose.ui.viewinterop.AndroidView). */
@Composable
private fun AndroidView(previewView: PreviewView) {
    AndroidView(
        factory = { previewView },
        modifier = Modifier.fillMaxSize()
    )
}
