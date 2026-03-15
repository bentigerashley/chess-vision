package com.chessvision.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.graphics.Color
import androidx.core.view.WindowCompat
import com.chessvision.ui.theme.AccentMuted
import com.chessvision.ui.theme.AccentMutedVariant
import com.chessvision.ui.theme.BackgroundDark
import com.chessvision.ui.theme.SurfaceDark
import com.chessvision.ui.theme.SurfaceVariant
import com.chessvision.ui.theme.OnDarkSurface
import com.chessvision.ui.theme.OnDarkSurfaceSecondary

private val DarkColorScheme = darkColorScheme(
    primary = AccentMuted,
    onPrimary = BackgroundDark,
    secondary = AccentMutedVariant,
    onSecondary = BackgroundDark,
    background = BackgroundDark,
    onBackground = OnDarkSurface,
    surface = SurfaceDark,
    onSurface = OnDarkSurface,
    surfaceVariant = SurfaceVariant,
    onSurfaceVariant = OnDarkSurfaceSecondary,
    error = Color(0xFFCF6679),
    onError = Color(0xFF000000)
)

@Composable
fun ChessVisionTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = DarkColorScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }
    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
