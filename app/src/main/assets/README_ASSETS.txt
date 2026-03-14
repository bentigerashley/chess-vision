ChessVision assets
==================

1) TFLite model
   - Add your chess piece classifier model as:
     app/src/main/assets/chess_piece_classifier.tflite
   - Input: 224x224 RGB image
   - Output: 13 classes (0=empty, 1-6=white pieces, 7-12=black pieces)

2) Stockfish binary
   - See project README for how to add Stockfish Android binaries to
     app/src/main/assets/ and extract to filesDir at runtime.
