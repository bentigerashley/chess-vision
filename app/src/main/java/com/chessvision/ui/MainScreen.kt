package com.chessvision.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import com.chessvision.camera.CameraManager
import com.chessvision.viewmodel.AppScreen
import com.chessvision.viewmodel.ChessViewModel

/**
 * Root UI: three distinct stages — Capture → Verification → Analysis.
 * Camera is bound only on capture screen.
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

    // Bind camera only when on capture screen
    LaunchedEffect(uiState.screen) {
        if (uiState.screen == AppScreen.CAPTURE) {
            cameraManager.bindCaptureUseCase(lifecycleOwner, previewView)
        } else {
            cameraManager.unbind()
        }
    }

    DisposableEffect(Unit) {
        onDispose { cameraManager.unbind() }
    }

    val importLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { viewModel.importImage(it) }
    }

    when (uiState.screen) {
        AppScreen.CAPTURE -> CaptureScreen(
            previewView = previewView,
            isCapturing = uiState.isCapturing,
            isProcessing = uiState.isProcessing,
            errorMessage = uiState.errorMessage,
            onCapture = { viewModel.captureBoard() },
            onImportClick = { importLauncher.launch("image/*") }
        )
        AppScreen.VERIFICATION -> {
            val board = uiState.detectedBoard
            if (board != null) {
                VerificationScreen(
                    board = board,
                    confidenceGrid = uiState.confidenceGrid,
                    fenString = uiState.fenString ?: "",
                    errorMessage = uiState.errorMessage,
                    isAnalyzing = uiState.isAnalyzing,
                    showDebugOverlay = uiState.showDebugOverlay,
                    onPieceSet = { r, c, p -> viewModel.setPiece(r, c, p) },
                    onRotateBoard = { viewModel.rotateBoard() },
                    onAnalyze = { viewModel.startAnalysis() },
                    onBackToCapture = { viewModel.backToCapture() },
                    onToggleDebug = { viewModel.toggleDebugOverlay() }
                )
            }
        }
        AppScreen.ANALYSIS -> {
            val board = uiState.detectedBoard
            if (board != null) {
                AnalysisScreen(
                    board = board,
                    fenString = uiState.fenString,
                    analysisResult = uiState.analysisResult,
                    isAnalyzing = uiState.isAnalyzing,
                    onBackToVerification = { viewModel.backToVerification() },
                    onNewScan = { viewModel.backToCapture() }
                )
            }
        }
    }
}
