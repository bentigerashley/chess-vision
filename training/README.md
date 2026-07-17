# Private training source tooling

This directory is developer-only infrastructure. It is not imported by the React PWA and generated data lives in the ignored `training/output/` directory.

## Setup

```powershell
py -m pip install -r training/requirements.txt
cd training
npm run test
npm run test:renderer
npm run test:validate
npm run select-puzzles
npm run render
```

The selector streams the official Lichess CC0 puzzle export and stops when it has selected the configured number of unique, valid puzzle records. It never writes the large `.csv.zst` export to disk.

Lichess rows describe the board before the opponent's first UCI move in `Moves`. The manifest's `rendered_fen` always applies that first move and is the only FEN downstream renderers may use.

`dataset.v1.json` pins the selection seed and URL. The manifest records response version headers plus the exact SHA-256 and byte count of the compressed prefix consumed before stream-and-stop selection. A configured full archive checksum is retained when a separately verified release checksum is available; this tool intentionally cannot verify one without downloading the full archive.

## Headless renderer

`npm run render` reads the ignored `output/puzzle-sources.json` manifest and creates five deterministic variants per selected position in `output/rendered-v1/`. It launches an installed local Chrome or Edge through `puppeteer-core` and a loopback-only static server; set `CHESS_VISION_BROWSER` if the browser is installed outside the usual Windows locations.

The renderer is deliberately isolated from the PWA dependency graph. It uses five original procedural, physically based mesh families (`wood-staunton`, `marble-classical`, `ebony-ivory-tournament`, `brass-minimal`, and `ornate-dark-wood`), rather than claiming that the pieces are scans of real products.

Each artifact has an RGB image, an instance-ID PNG mask, and a JSON label sidecar. The label starts with its complete FEN and records all 64 physical board squares, the fixed 13-class vocabulary, exact per-piece mask-derived visible-pixel bounding boxes, source provenance, deterministic scene seed, WebGL/browser identity, lighting, camera, and the accepted full-board projection. A frame is rejected before output whenever any physical outer board-frame corner falls outside its safe image margin.

For a faster, lower-resolution verification of all selected positions:

```powershell
npm run render -- --output output/smoke --variants 1 --width 320 --height 320
```
