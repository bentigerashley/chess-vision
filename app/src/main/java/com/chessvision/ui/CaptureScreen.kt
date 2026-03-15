package com.chessvision.ui

import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.chessvision.ui.theme.AccentMuted
import com.chessvision.ui.theme.DebugOverlayStroke

/**
 * Camera-centric capture interface. Most of the display is the camera preview.
 * A semi-transparent square frame shows where to place the board for reliable detection.
 */
@Composable
fun CaptureScreen(
    previewView: PreviewView,
    isCapturing: Boolean,
    isProcessing: Boolean,
    errorMessage: String?,
    onCapture: () -> Unit,
    onImportClick: () -> Unit
) {
    Box(modifier = Modifier.fillMaxSize()) {
        // Full-area camera preview
        AndroidView(
            factory = { previewView },
            modifier = Modifier.fillMaxSize()
        )

        // Semi-transparent square frame overlay: align board here for best detection
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.88f)
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .border(2.dp, DebugOverlayStroke, RoundedCornerShape(8.dp))
                    .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.15f))
            )
        }

        // Loading overlay when capturing or processing
        if (isCapturing || isProcessing) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.4f)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = AccentMuted)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = if (isCapturing) "Capturing…" else "Detecting board…",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        // Bottom bar: capture + import
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.95f))
                .padding(horizontal = 24.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (errorMessage != null) {
                Text(
                    text = errorMessage,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }
            // Single large capture button
            Button(
                onClick = onCapture,
                enabled = !isCapturing && !isProcessing,
                modifier = Modifier.fillMaxWidth(0.85f),
                colors = ButtonDefaults.buttonColors(containerColor = AccentMuted),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Capture board")
            }
            // Smaller import option
            OutlinedButton(
                onClick = onImportClick,
                enabled = !isProcessing
            ) {
                Text("Import from gallery")
            }
        }
    }
}
