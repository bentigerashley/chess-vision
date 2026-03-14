package com.chessvision.camera

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import java.io.File
import kotlin.coroutines.resume

/**
 * Manages CameraX image capture for "Capture Board". Binds preview + ImageCapture,
 * captures to a temp file and decodes to Bitmap for the pipeline.
 */
class CameraManager(private val context: Context) {

    private var imageCapture: ImageCapture? = null
    private var cameraProvider: ProcessCameraProvider? = null

    companion object {
        private const val TAG = "CameraManager"
    }

    suspend fun bindCaptureUseCase(
        lifecycleOwner: LifecycleOwner,
        previewView: androidx.camera.view.PreviewView
    ): Result<Unit> = suspendCancellableCoroutine { cont ->
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            try {
                cameraProvider = future.get()
                val preview = androidx.camera.core.Preview.Builder().build().also {
                    it.surfaceProvider = previewView.surfaceProvider
                }
                imageCapture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build()
                val selector = CameraSelector.DEFAULT_BACK_CAMERA
                cameraProvider?.unbindAll()
                cameraProvider?.bindToLifecycle(lifecycleOwner, selector, preview, imageCapture)
                cont.resume(Result.success(Unit))
            } catch (e: Exception) {
                Log.e(TAG, "bindCaptureUseCase failed", e)
                cont.resume(Result.failure(e))
            }
        }, ContextCompat.getMainExecutor(context))
    }

    fun unbind() {
        cameraProvider?.unbindAll()
        cameraProvider = null
        imageCapture = null
    }

    /** Capture to temp file then load as Bitmap (avoids YUV conversion). */
    suspend fun takePicture(): Result<Bitmap> = withContext(Dispatchers.IO) {
        val capture = imageCapture ?: return@withContext Result.failure(IllegalStateException("ImageCapture not bound"))
        val file = File(context.cacheDir, "capture_${System.currentTimeMillis()}.jpg")
        suspendCancellableCoroutine { cont ->
            capture.takePicture(
                ImageCapture.OutputFileOptions.Builder(file).build(),
                ContextCompat.getMainExecutor(context),
                object : ImageCapture.OnImageSavedCallback {
                    override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                        val bitmap = BitmapFactory.decodeFile(file.absolutePath)
                        file.delete()
                        if (bitmap != null) cont.resume(Result.success(bitmap))
                        else cont.resume(Result.failure(IllegalStateException("Failed to decode capture")))
                    }
                    override fun onError(exception: ImageCaptureException) {
                        file.delete()
                        cont.resume(Result.failure(exception))
                    }
                }
            )
        }
    }
}
