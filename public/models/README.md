# Browser model contract

Place an exported TensorFlow.js graph model at `public/models/chess-piece/model.json` with its shard files beside it. The intended output labels are `empty`, `white_pawn` through `white_king`, then `black_pawn` through `black_king`.

The shipping app deliberately reports a missing model and opens an editable board instead of claiming recognition. Connect your preprocessing and output-label metadata in `src/services/recognition.ts` once training has produced validated weights.
