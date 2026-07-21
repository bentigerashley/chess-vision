# Browser model contract

Place an exported TensorFlow.js graph model at `public/models/chess-piece/model.json` with its shard files beside it. The intended output labels are `empty`, `white_pawn` through `white_king`, then `black_pawn` through `black_king`.

The shipping app deliberately reports a missing model and opens an editable board instead of claiming recognition. Connect your preprocessing and output-label metadata in `src/services/recognition.ts` once training has produced validated weights.

The CUDA training baseline writes a private ONNX experiment under `training/output/models/`; it is not a compatible drop-in replacement for this TensorFlow.js graph-model seam. Do not copy it here. A held-out real-photo evaluation and a deliberate choice between TensorFlow.js conversion or ONNX Runtime Web, including preprocessing and output-adapter work, are required before this public contract can change.
