package com.chessvision.engine

import android.content.Context
import android.util.Log
import com.chessvision.model.AnalysisResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.DataOutputStream
import java.io.File
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

/**
 * Wraps the Stockfish Android binary with UCI protocol.
 * Sends "position fen ...", "go depth 15", and parses "info" and "bestmove" from output.
 */
class StockfishEngine(private val context: Context) {

    private var process: Process? = null
    private var outputStream: DataOutputStream? = null
    private var reader: BufferedReader? = null

    companion object {
        private const val TAG = "StockfishEngine"
        /** Binary name in assets (e.g. stockfish-arm64-v8a or stockfish-x86_64). */
        const val BINARY_NAME_ARM64 = "stockfish-arm64-v8a"
        const val BINARY_NAME_X86_64 = "stockfish-x86_64"
        const val GO_DEPTH = 15
        const val GO_TIMEOUT_MS = 30_000L
    }

    /**
     * Start the engine. Binary must be placed in app's filesDir and made executable
     * (see README for extracting from assets).
     */
    suspend fun start(): Boolean = withContext(Dispatchers.IO) {
        try {
            val binary = getBinaryPath()
            if (binary == null) {
                Log.e(TAG, "Stockfish binary not found. See README for setup.")
                return@withContext false
            }
            process = ProcessBuilder(binary).redirectErrorStream(true).start()
            outputStream = DataOutputStream(process!!.outputStream)
            reader = BufferedReader(InputStreamReader(process!!.inputStream))
            send("uci")
            waitFor("uciok")
            send("isready")
            waitFor("readyok")
            Log.d(TAG, "Stockfish started.")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start Stockfish", e)
            false
        }
    }

    private fun getBinaryPath(): String? {
        val abi = android.os.Build.SUPPORTED_ABIS.firstOrNull() ?: "arm64-v8a"
        val name = when {
            abi.startsWith("arm64") -> BINARY_NAME_ARM64
            abi == "x86_64" -> BINARY_NAME_X86_64
            abi == "x86" -> "stockfish-x86"
            else -> BINARY_NAME_ARM64
        }
        val file = context.filesDir.resolve(name)
        if (!file.exists()) {
            try {
                context.assets.open(name).use { input ->
                    file.outputStream().use { output -> input.copyTo(output) }
                }
                file.setExecutable(true)
            } catch (_: Exception) {
                return null
            }
        }
        return if (file.canExecute()) file.absolutePath else null
    }

    private fun send(cmd: String) {
        outputStream?.write("$cmd\n".toByteArray())
        outputStream?.flush()
    }

    private fun waitFor(expected: String): Boolean {
        val deadline = System.currentTimeMillis() + 5000
        while (System.currentTimeMillis() < deadline) {
            val line = reader?.readLine() ?: break
            if (line.contains(expected)) return true
        }
        return false
    }

    /**
     * Analyze the given FEN: send position, run go depth, parse evaluation and bestmove.
     */
    suspend fun analyze(fen: String): AnalysisResult = withContext(Dispatchers.IO) {
        if (process == null || outputStream == null || reader == null) {
            return@withContext AnalysisResult(null, null, null, null)
        }
        try {
            send("position fen $fen")
            send("isready")
            waitFor("readyok")
            send("go depth $GO_DEPTH")
            val deadline = System.currentTimeMillis() + GO_TIMEOUT_MS
            var evaluationCp: Int? = null
            var mateInMoves: Int? = null
            var bestMove: String? = null
            var rawLine: String? = null
            while (System.currentTimeMillis() < deadline) {
                val line = reader?.readLine() ?: break
                if (line.startsWith("info ")) {
                    parseInfoLine(line)?.let { (cp, mate) ->
                        evaluationCp = cp
                        mateInMoves = mate
                        rawLine = line
                    }
                }
                if (line.startsWith("bestmove ")) {
                    bestMove = line.removePrefix("bestmove ").split(" ").firstOrNull()?.takeIf { it != "(none)" }
                    break
                }
            }
            AnalysisResult(evaluationCp, mateInMoves, bestMove, rawLine)
        } catch (e: Exception) {
            Log.e(TAG, "Analyze failed", e)
            AnalysisResult(null, null, null, null)
        }
    }

    private fun parseInfoLine(line: String): Pair<Int?, Int?>? {
        var cp: Int? = null
        var mate: Int? = null
        val parts = line.split(" ")
        var i = 0
        while (i < parts.size) {
            when (parts[i]) {
                "cp" -> if (i + 1 < parts.size) cp = parts[++i].toIntOrNull()
                "mate" -> if (i + 1 < parts.size) mate = parts[++i].toIntOrNull()
            }
            i++
        }
        return if (cp != null || mate != null) Pair(cp, mate) else null
    }

    fun stop() {
        try {
            send("quit")
            process?.waitFor(2, TimeUnit.SECONDS)
            process?.destroy()
        } catch (_: Exception) { }
        process = null
        outputStream = null
        reader = null
    }
}
