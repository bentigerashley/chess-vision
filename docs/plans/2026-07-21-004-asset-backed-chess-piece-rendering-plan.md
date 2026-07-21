---
title: Asset-Backed Synthetic Chess Rendering
type: feature
date: 2026-07-21
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

## Product Contract

### Problem

The v4 procedural pieces have correctly labelled legal positions and safe full-board framing, but their inflated bases and abstract knights create an uncanny synthetic domain. More rings and primitives will not reliably reach the silhouette quality of photographed tournament sets.

### Direction

Use a provenance-locked, pre-authored glTF asset as the only renderable training-piece source. Never substitute the existing procedural factory for the approved asset pack.

### Requirements

- R1: Primary rendered pieces use a high-quality, licensed glTF set whose king, queen, bishop, rook, pawn, and knight are individually addressable.
- R2: Asset retrieval is deterministic, checksum-verified, private to training tooling, and records attribution and licence terms; the React PWA never ships the asset.
- R3: The asset adapter normalizes the original board-space transforms so any legal FEN can place each of the twelve piece classes on the project’s labelled physical squares.
- R4: Asset materials remain realistic under the existing bounded camera and light variation, while preserving RGB/mask agreement and full-board framing.
- R5: Labels identify the actual mesh source, licence, asset revision, and fallback status alongside the existing FEN-first truth.
- R6: The v5 full corpus contains 50 legal source positions × five visual variants, each validated for FEN, masks, camera acceptance, and provenance.
- R7: Visual acceptance rejects swollen bases, unreadable crown forms, and non-chess-like knight silhouettes before a full corpus is treated as trainable.

### Non-goals

- N1: Embedding third-party mesh data or asset-loading code in the app/PWA.
- N2: Passing unlicensed, non-commercial, no-AI, or provenance-uncertain model downloads into the training pipeline.
- N3: Claiming that synthetic-only data proves real-board recognition accuracy.

## Implementation Units

### U1. Add a licensed asset-lock and fetch workflow

Create a checksum-pinned local asset cache, an attribution record, and a fetch command for the approved GLB. The cache remains ignored and is verified before rendering.

### U2. Build the glTF chess-piece adapter

Load the GLB once in the private browser renderer, map named white/black nodes to the FEN alphabet, centre and scale each mesh on a labelled board square, and clone it safely for RGB/mask rendering.

### U3. Switch visual variants to the asset-backed source

Use the asset-backed Staunton geometry as the source for the five material/board environments. Do not expose a procedural fallback from the training renderer.

### U4. Strengthen provenance and visual-quality validation

Require asset source metadata in v3 labels, add asset/fallback contract tests, regenerate the full v5 corpus, and inspect representative images at close range and whole-board distance.

## Acceptance Evidence

- The asset fetcher rejects a missing or checksum-mismatched GLB.
- Every FEN piece resolves to a mesh with a recognisable non-inflated base and a conventional knight silhouette.
- The full v5 run validates 250 RGB/mask/label artifacts and has no cropped outer board frame.
- Representative renders show the asset-backed pieces at both close and overview camera angles without v4’s inflated bases.
