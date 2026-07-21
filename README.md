# Chess Vision

Chess Vision is a React PWA for turning a physical chessboard photo into a correctable position and then investigating it with engine lines. It runs on modern Android and iOS browsers through camera/file inputs; use HTTPS (or localhost) for camera permissions.

## Run it

```bash
npm install
npm run dev
npm run test
npm run build
```

## Recognition model

The app ships truthfully without trained weights: it opens an editable position when `public/models/chess-piece/model.json` is not available. Train/export a compatible TensorFlow.js model and put the model JSON plus shards in that directory. See [the model contract](public/models/README.md).

## Synthetic data

Synthetic rendering is a private developer workflow under [`training/`](training/README.md), not part of the app. It sources legal Lichess puzzle positions, renders full-board Three.js scenes, and validates labels before any dataset is used for model training. Synthetic data must be evaluated against held-out real photographs before recognition is presented as available.

## Current boundaries

The UI contains the recognition-model seam and a correction-first workflow. The actual production model preprocessing and browser Stockfish WebAssembly adapter are intentionally isolated next steps: neither should be represented as real recognition or trusted analysis until their weights/binary and validation tests are connected.
