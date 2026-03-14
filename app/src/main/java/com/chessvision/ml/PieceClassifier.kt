package com.chessvision.ml

import android.content.Context
import android.graphics.Bitmap
import com.chessvision.model.PieceType
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.common.FileUtil
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.exp

/**
 * TFLite classifier for chess pieces.
 * Model: 224x224 RGB input, 13 classes (empty + 6 white + 6 black).
 * Output: logits or probabilities of shape [1, 13].
 */
class PieceClassifier(context: Context) {

    private var interpreter: Interpreter? = null
    private val modelPath = "chess_piece_classifier.tflite"

    companion object {
        const val INPUT_SIZE = 224
        const val NUM_CLASSES = 13
        const val MIN_CONFIDENCE = 0.5f
    }

    init {
        loadModel(context)
    }

    private fun loadModel(context: Context) {
        try {
            val buffer = FileUtil.loadMappedFile(context, modelPath)
            val options = Interpreter.Options().setNumThreads(4)
            interpreter = Interpreter(buffer, options)
        } catch (e: Exception) {
            interpreter = null
        }
    }

    /**
     * Run inference on a single square image. Input is resized to 224x224 and normalized.
     */
    fun classifySquare(bitmap: Bitmap): Pair<PieceType, Float> {
        val interp = interpreter ?: return PieceType.EMPTY to 0f
        val input = preprocess(bitmap)
        val output = Array(1) { FloatArray(NUM_CLASSES) }
        interp.run(input, output)
        val probs = softmax(output[0])
        var maxIdx = 0
        var maxP = probs[0]
        for (i in 1 until NUM_CLASSES) {
            if (probs[i] > maxP) {
                maxP = probs[i]
                maxIdx = i
            }
        }
        val piece = PieceType.fromIndex(maxIdx)
        return piece to maxP
    }

    private fun preprocess(bitmap: Bitmap): ByteBuffer {
        val scaled = Bitmap.createScaledBitmap(bitmap, INPUT_SIZE, INPUT_SIZE, true)
        val buffer = ByteBuffer.allocateDirect(1 * INPUT_SIZE * INPUT_SIZE * 3 * 4)
        buffer.order(ByteOrder.nativeOrder())
        val intValues = IntArray(INPUT_SIZE * INPUT_SIZE)
        scaled.getPixels(intValues, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)
        for (i in 0 until INPUT_SIZE * INPUT_SIZE) {
            val pixel = intValues[i]
            buffer.putFloat(((pixel shr 16 and 0xFF) / 255f))
            buffer.putFloat(((pixel shr 8 and 0xFF) / 255f))
            buffer.putFloat((pixel and 0xFF) / 255f)
        }
        if (scaled != bitmap) scaled.recycle()
        return buffer
    }

    private fun softmax(logits: FloatArray): FloatArray {
        val max = logits.maxOrNull() ?: 0f
        val exp = logits.map { exp(it - max) }
        val sum = exp.sum()
        return exp.map { (it / sum).toFloat() }.toFloatArray()
    }

    fun close() {
        interpreter?.close()
        interpreter = null
    }
}
