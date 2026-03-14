# ChessVision

Android app that captures or imports a photo of a chessboard, detects the board and pieces with **TensorFlow Lite**, converts the position to **FEN**, and runs **Stockfish** for evaluation and best move.

## Tech stack

- **Kotlin**, min SDK 26, target SDK 34
- **Jetpack Compose** (dark theme)
- **CameraX** (capture), **OpenCV** (board detection), **TensorFlow Lite** (piece classification), **Stockfish** (UCI engine)

## Project structure

```
ChessVision/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── assets/                    # Add .tflite model and Stockfish here (see below)
│       ├── java/com/chessvision/
│       │   ├── MainActivity.kt
│       │   ├── ChessVisionApp.kt
│       │   ├── camera/
│       │   │   └── CameraManager.kt    # CameraX capture
│       │   ├── vision/
│       │   │   ├── BoardDetector.kt   # OpenCV corner detection + perspective warp
│       │   │   └── SquareExtractor.kt # 8x8 square crops
│       │   ├── ml/
│       │   │   └── PieceClassifier.kt # TFLite inference
│       │   ├── fen/
│       │   │   └── FenGenerator.kt    # Board array → FEN
│       │   ├── engine/
│       │   │   └── StockfishEngine.kt # UCI + Stockfish binary
│       │   ├── viewmodel/
│       │   │   └── ChessViewModel.kt  # MVVM pipeline
│       │   ├── model/
│       │   │   ├── PieceType.kt
│       │   │   └── AnalysisResult.kt
│       │   └── ui/
│       │       ├── MainScreen.kt
│       │       ├── BoardPreview.kt
│       │       └── theme/
│       └── res/
├── build.gradle.kts
├── settings.gradle.kts
└── gradle.properties
```

## Adding the TFLite model

1. Name the model file: **`chess_piece_classifier.tflite`**.
2. Place it in: **`app/src/main/assets/chess_piece_classifier.tflite`**.
3. Model expectations:
   - **Input:** image `224×224`, RGB (batch, height, width, 3), float [0,1].
   - **Output:** 13 classes: `0` empty, `1` white pawn … `6` white king, `7` black pawn … `12` black king.

If the model is missing, the app shows an error asking you to add it.

## Adding the Stockfish binary

1. Get a Stockfish **Android** binary (e.g. from [Stockfish Android](https://github.com/nickcoutsos/stockfish-android) or build from [Stockfish](https://github.com/official-stockfish/Stockfish) for Android).
2. Name the binary by ABI, e.g.:
   - **`stockfish-arm64-v8a`** (no extension) for 64-bit ARM
   - **`stockfish-x86_64`** for emulator (64-bit x86)
3. Put the binary in **`app/src/main/assets/`** (e.g. `app/src/main/assets/stockfish-x86_64` for the emulator).
4. At runtime the app expects the binary in `context.filesDir` with the same name. Copy from assets on first run (e.g. in `ChessVisionApp.onCreate()` or before starting the engine):

   ```kotlin
   // Example: copy from assets to filesDir and set executable
   val name = "stockfish-x86_64"  // or stockfish-arm64-v8a
   val dest = File(context.filesDir, name)
   if (!dest.exists()) {
       context.assets.open(name).use { input ->
           dest.outputStream().use { output -> input.copyTo(output) }
       }
       dest.setExecutable(true)
   }
   ```

5. Implement this copy in your app (e.g. in `StockfishEngine.start()` or in the Application class) so that `context.filesDir.resolve(name)` exists and is executable.

Until the binary is present and copied, engine analysis will not run.

## Emulator testing

1. Open the project in **Android Studio**.
2. Create an AVD (e.g. API 34, x86_64) and start the emulator.
3. For “Capture Board”: use the emulator’s virtual camera or a webcam; grant camera permission.
4. For “Import Image”: use the gallery picker and select a photo of a chessboard.
5. Use an x86_64 Stockfish binary in assets (and copy to `filesDir`) so analysis works in the emulator.

## Build and run

- **Build:** `./gradlew assembleDebug` (or use Android Studio).
- **Run:** Install on device/emulator and launch **ChessVision**.

## Error handling

- **Board not detected:** Shown when OpenCV cannot find a clear quadrilateral (lighting, contrast, or board not fully visible).
- **Blurry / low confidence:** Shown when piece classifier confidence is below the threshold; user can retry or review the board.

## License

Use and modify as needed for your project.
