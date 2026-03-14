package com.chessvision

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.chessvision.ui.MainScreen
import com.chessvision.ui.theme.ChessVisionTheme
import com.chessvision.viewmodel.ChessViewModel
import com.chessvision.viewmodel.ChessViewModelFactory

/**
 * Single-Activity entry point. Hosts the Compose MainScreen and injects ChessViewModel.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ChessVisionTheme {
                val viewModel: ChessViewModel = viewModel(
                    factory = ChessViewModelFactory(LocalContext.current.applicationContext as ChessVisionApp)
                )
                Surface(modifier = Modifier.fillMaxSize()) {
                    MainScreen(viewModel = viewModel)
                }
            }
        }
    }
}
