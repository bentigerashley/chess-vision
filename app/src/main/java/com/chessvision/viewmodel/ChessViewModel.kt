package com.chessvision.viewmodel

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.chessvision.ChessVisionApp
import com.chessvision.camera.CameraManager
import com.chessvision.engine.StockfishEngine
import com.chessvision.fen.FenGenerator
import com.chessvision.ml.PieceClassifier
import com.chessvision.model.AnalysisResult
import com.chessvision.model.PieceType
import com.chessvision.vision.BoardDetector
import com.chessvision.vision.SquareExtractor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * MVVM ViewModel for the full pipeline: capture/import -> detect board -> extract squares ->
 * classify -> FEN -> Stockfish analysis.
 */
class ChessViewModel(private val appContext: Context) : ViewModel() {

    private val boardDetector = BoardDetector()
    private val squareExtractor = SquareExtractor()
    private var pieceClassifier: PieceClassifier? = null
    private val stockfishEngine = StockfishEngine(appContext)
    private var cameraManager: CameraManager? = null

    private val _uiState = MutableStateFlow(ChessUiState())
    val uiState: StateFlow<ChessUiState> = _uiState.asStateFlow()

    private var analysisJob: Job? = null

    init {
        viewModelScope.launch {
            withContext(Dispatchers.Default) {
                pieceClassifier = try { PieceClassifier(appContext) } catch (_: Exception) { null }
            }
            stockfishEngine.start()
        }
    }

    fun setCameraManager(manager: CameraManager?) {
        cameraManager = manager
    }

    fun captureBoard() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isCapturing = true, errorMessage = null)
            val result = cameraManager?.takePicture()
            _uiState.value = _uiState.value.copy(isCapturing = false)
            when {
                result == null -> _uiState.value = _uiState.value.copy(errorMessage = "Camera not ready")
                result.isFailure -> _uiState.value = _uiState.value.copy(errorMessage = result.exceptionOrNull()?.message ?: "Capture failed")
                else -> processBitmap(result.getOrThrow())
            }
        }
    }

    fun importImage(uri: Uri) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(errorMessage = null)
            val bitmap = withContext(Dispatchers.IO) {
                appContext.contentResolver.openInputStream(uri)?.use { stream ->
                    android.graphics.BitmapFactory.decodeStream(stream)
                }
            }
            if (bitmap != null) processBitmap(bitmap)
            else _uiState.value = _uiState.value.copy(errorMessage = "Could not load image")
        }
    }

    private fun processBitmap(bitmap: Bitmap) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isProcessing = true, errorMessage = null)
            val result = withContext(Dispatchers.Default) {
                val warped = boardDetector.detectAndWarp(bitmap, 400)
                if (warped == null) {
                    _uiState.value = _uiState.value.copy(
                        isProcessing = false,
                        errorMessage = "Board not detected. Ensure good lighting and a clear 8x8 board."
                    )
                    return@withContext null
                }
                val squares = squareExtractor.extractSquares(warped, 2)
                val classifier = pieceClassifier
                if (classifier == null) {
                    _uiState.value = _uiState.value.copy(
                        isProcessing = false,
                        errorMessage = "Piece classifier not loaded. Add chess_piece_classifier.tflite to assets."
                    )
                    warped.recycle()
                    squares.forEach { it.recycle() }
                    return@withContext null
                }
                val board = Array(8) { Array(8) { PieceType.EMPTY } }
                val confGrid = Array(8) { FloatArray(8) }
                var lowConfidence = false
                for (row in 0 until 8) {
                    for (col in 0 until 8) {
                        val idx = row * 8 + col
                        val (piece, conf) = classifier.classifySquare(squares[idx])
                        board[row][col] = piece
                        confGrid[row][col] = conf
                        if (conf < PieceClassifier.MIN_CONFIDENCE) lowConfidence = true
                    }
                }
                warped.recycle()
                squares.forEach { it.recycle() }
                val fen = FenGenerator.toFullFen(board)
                _uiState.value = _uiState.value.copy(
                    isProcessing = false,
                    screen = AppScreen.VERIFICATION,
                    detectedBoard = board,
                    confidenceGrid = confGrid.map { it.toTypedArray() }.toTypedArray(),
                    fenString = fen,
                    errorMessage = if (lowConfidence) "Some pieces had low confidence. Tap squares to correct." else null
                )
                fen
            }
            // Do not auto-run analysis; user taps "Analyze" on verification screen
        }
    }

    /** Set piece at (row, col) and recompute FEN. Used for manual correction on verification screen. */
    fun setPiece(row: Int, col: Int, piece: PieceType) {
        val board = _uiState.value.detectedBoard ?: return
        if (row !in 0..7 || col !in 0..7) return
        val newBoard = Array(8) { r -> Array(8) { c -> board[r][c] } }
        newBoard[row][col] = piece
        val fen = FenGenerator.toFullFen(newBoard)
        _uiState.value = _uiState.value.copy(detectedBoard = newBoard, fenString = fen)
    }

    /** Rotate board 180° (rank 8 ↔ rank 1, files reversed). Useful when orientation was wrong. */
    fun rotateBoard() {
        val board = _uiState.value.detectedBoard ?: return
        val newBoard = Array(8) { row ->
            Array(8) { col ->
                board[7 - row][7 - col]
            }
        }
        val conf = _uiState.value.confidenceGrid
        val newConf = conf?.let { grid ->
            Array(8) { row -> Array(8) { col -> grid[7 - row][7 - col] } }
        }
        val fen = FenGenerator.toFullFen(newBoard)
        _uiState.value = _uiState.value.copy(
            detectedBoard = newBoard,
            confidenceGrid = newConf,
            fenString = fen
        )
    }

    /** Run Stockfish analysis on current FEN and switch to analysis screen. */
    fun startAnalysis() {
        val fen = _uiState.value.fenString ?: return
        analysisJob?.cancel()
        analysisJob = viewModelScope.launch {
            _uiState.value = _uiState.value.copy(screen = AppScreen.ANALYSIS, isAnalyzing = true, analysisResult = null)
            val result = withContext(Dispatchers.IO) { stockfishEngine.analyze(fen) }
            _uiState.value = _uiState.value.copy(isAnalyzing = false, analysisResult = result)
        }
    }

    /** Return to capture screen; clear detected state so user can retake. */
    fun backToCapture() {
        _uiState.value = ChessUiState(screen = AppScreen.CAPTURE)
    }

    /** Return from analysis to verification to correct position and re-analyze. */
    fun backToVerification() {
        _uiState.value = _uiState.value.copy(screen = AppScreen.VERIFICATION)
    }

    /** Toggle debug overlay (e.g. confidence values, grid). For development. */
    fun toggleDebugOverlay() {
        _uiState.value = _uiState.value.copy(showDebugOverlay = !_uiState.value.showDebugOverlay)
    }

    private fun runAnalysis(fen: String) {
        analysisJob?.cancel()
        analysisJob = viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isAnalyzing = true, analysisResult = null)
            val result = withContext(Dispatchers.IO) { stockfishEngine.analyze(fen) }
            _uiState.value = _uiState.value.copy(isAnalyzing = false, analysisResult = result)
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    override fun onCleared() {
        super.onCleared()
        analysisJob?.cancel()
        pieceClassifier?.close()
        stockfishEngine.stop()
        cameraManager?.unbind()
    }
}

/** App has three distinct stages: capture → verification → analysis. */
enum class AppScreen { CAPTURE, VERIFICATION, ANALYSIS }

/** UI state for MainScreen. */
data class ChessUiState(
    val screen: AppScreen = AppScreen.CAPTURE,
    val isCapturing: Boolean = false,
    val isProcessing: Boolean = false,
    val isAnalyzing: Boolean = false,
    val detectedBoard: Array<Array<PieceType>>? = null,
    /** Per-square confidence from classifier (0f..1f). Only set when board is first detected. */
    val confidenceGrid: Array<Array<Float>>? = null,
    val fenString: String? = null,
    val analysisResult: AnalysisResult? = null,
    val errorMessage: String? = null,
    val showDebugOverlay: Boolean = false
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as ChessUiState
        if (screen != other.screen || isCapturing != other.isCapturing || isProcessing != other.isProcessing ||
            isAnalyzing != other.isAnalyzing || fenString != other.fenString ||
            errorMessage != other.errorMessage || analysisResult != other.analysisResult ||
            showDebugOverlay != other.showDebugOverlay) return false
        if (detectedBoard != null) {
            if (other.detectedBoard == null) return false
            for (r in 0..7) for (c in 0..7) if (detectedBoard[r][c] != other.detectedBoard!![r][c]) return false
        } else if (other.detectedBoard != null) return false
        if (confidenceGrid != null) {
            if (other.confidenceGrid == null) return false
            for (r in 0..7) for (c in 0..7) if (confidenceGrid[r][c] != other.confidenceGrid!![r][c]) return false
        } else if (other.confidenceGrid != null) return false
        return true
    }
    override fun hashCode(): Int = javaClass.hashCode()
}

/** Factory to inject Application context into ViewModel. */
class ChessViewModelFactory(private val app: ChessVisionApp) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ChessViewModel::class.java)) {
            return ChessViewModel(app) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
