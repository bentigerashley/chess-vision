# GPU square-classifier baseline

This is private developer tooling for a synthetic-only experiment. It receives a completed, user-calibrated chessboard after rectification; it does not replace the native app's whole-board confirmation flow or enable recognition in the app.

Run from the repository root after installing `training/requirements-ml.txt`:

```powershell
py -3.9 -m training.ml.train --dataset training/output/dataset-v6-final --output training/output/models/chess-piece-v1
py -3.9 -m training.ml.verify_export --experiment training/output/models/chess-piece-v1
```

The training command fails before data loading when CUDA is unavailable. It runs the renderer's full validator, keeps variants of the same Lichess puzzle in one source split, rectifies each board from renderer corners `[a1, h1, h8, a8]` into `[a8, h8, h1, a1]`, and trains a 13-class MobileNetV3-Small classifier on the resulting 96×96 crops.

`best.pt`, `model.onnx`, `model-contract.json`, `metrics.json`, `experiment.json`, and `onnx-verification.json` remain under ignored `training/output/models/`. The ONNX file is an interchange artifact only. A real-photo holdout and a separate native-runtime plus output-adapter decision are required before any model can be installed in the app.
