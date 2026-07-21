# Dataset validation contract

Run this after selecting puzzle sources and rendering a private run:

```powershell
node training/validate-dataset.mjs `
  --source training/output/puzzle-sources.json `
  --render training/output/rendered-v1/manifest.json `
  --output training/output/rendered-v1 `
  --full
```

`--full` requires the intended production-shaped corpus: 50 unique Lichess
source records, 50 unique post-first-move FENs, all five chess-set variants,
and 250 artifacts. The validator performs no training and writes nothing.
Use `--partial` only for a deliberately incomplete renderer smoke run.

It rejects a run when any of these truths drift:

- the first field of each label is its six-field FEN, and every one of the 64
  square labels has matching piece, class ID, and class name;
- the fixed 13-class vocabulary is present in order (`empty`, six white
  pieces, six black pieces), each physical square has world coordinates, and
  each rendered piece has a unique instance ID, pixel count, and in-bounds box;
- source puzzle identity, source FEN/first UCI move, source version, training
  config version, set/model version, camera, lighting, and WebGL renderer
  provenance are present and agree with the source manifest;
- the camera records four projected physical board corners inside its accepted
  margin. A missing or cropped full-board frame is rejected;
- RGB PNGs, instance-mask PNGs, and labels are complete, one-to-one with the
  render manifest, and resolve below `training/output` without `..`, absolute,
  or symlink escapes. Extra unreferenced files also fail validation.

The validator is deliberately separate from the PWA. It does not import React,
Three.js, or model code, so it can guard a render archive before it becomes a
training input.
