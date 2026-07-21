---
title: Realistic Synthetic Chess Sets - Plan
type: feature
date: 2026-07-21
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Realistic Synthetic Chess Sets - Plan

## Goal Capsule

Replace the visually generic synthetic chess renders with five convincingly distinct real-world set and board families. Preserve the private generator, legal puzzle/FEN provenance, full-board framing, and exact label contract.

**Product authority:** The supplied dataset examples show that the current pieces, colours, lighting, and camera composition are not realistic enough for a real-board recognition corpus.

**Open blocker:** Original procedural assets can be made substantially more realistic, but they must not be represented as scans or copies of the reference sites' models without a compatible asset licence.

## Product Contract

### Summary

The training renderer will produce richer Staunton, marble, ebony/ivory, brass, and ornate wood scenes. Each family will change the piece proportions, physical board materials, surface wear, lighting mood, and valid camera pose rather than applying a different colour to one shared model.

### Problem Frame

The existing samples show the complete board and valid piece placement, but their shared green-and-cream board, flat background, narrow camera range, hard highlights, and simplified silhouettes make the corpus look synthetic. Those shortcuts reduce its value as a bridge to photographs of real chessboards.

### Key Decisions

- **Keep generation private and label-first.** (session-settled: user-directed — chosen over a browser-visible renderer: the generator is training infrastructure, not an app feature.)
- **Use five visually independent set-and-board families.** (session-settled: user-directed — chosen over recolouring a common generic set: real-world board recognition needs meaningful style diversity.)
- **Retain the full-board safety gate.** (session-settled: user-directed — chosen over dramatic cropped compositions: the app only accepts complete physical boards.)
- **Build original high-detail procedural models.** The referenced 3D chess sites are visual-quality benchmarks, not a source of copied geometry or textures.

### Requirements

**Set identity**

- R1. Each named family must have recognisably different chess-piece proportions and silhouettes, including a detailed knight, a mitred bishop, a crenellated rook, a crowned queen, and a cross-topped king.
- R2. Each family must pair with its own board frame, square palette, material treatment, and plausible table surface; no output may default to one shared green-and-cream board.
- R3. Procedural material detail must include perceptible but non-destructive wood grain, marble veining, brushed metal, or ivory/ebony variation appropriate to the family.

**Photographic variation**

- R4. Accepted camera poses must vary azimuth, elevation, focal length, distance, framing margin, and target offset while keeping the entire physical board frame visible.
- R5. Lighting must use a plausible multi-source studio or indoor setup with soft shadows, contact definition, balanced exposure, and family-appropriate colour temperature.
- R6. Scene background and tabletop context must avoid the floating-model appearance of the current plain background.

**Truth and quality gates**

- R7. A renderer upgrade must not change the FEN-to-64-square mapping, source provenance, instance-ID mask encoding, or mask-derived annotation contract.
- R8. A fresh 50-position × 5-style dataset must pass source, frame, PNG, mask, and label validation before it is presented as training-ready.
- R9. Representative images from all five families must be visually inspected for style distinction, complete framing, readable piece silhouettes, and exposure defects.

### Acceptance Examples

- AE1. A marble sample uses stone-like pieces and a complementary stone board rather than the wooden frame and green squares used by the Staunton sample.
- AE2. Across representative samples, the board appears at noticeably different legal viewpoints while all four outer frame corners remain within the recorded inset margin.
- AE3. An ornate wood king, queen, bishop, rook, knight, and pawn have distinguishable real-piece silhouettes without changing the label's exact FEN square map.
- AE4. If a camera pose crops any frame corner, the renderer rejects it before emitting an RGB image, mask, or JSON label.
- AE5. A regenerated corpus validates every visible-pixel count and bounding box against its decoded instance mask.

### Scope Boundaries

- In scope: original procedural geometry, PBR material detail, family-specific boards/tabletops, lighting, camera variation, renderer truth metadata, tests, and dataset regeneration.
- Deferred: buying or redistributing third-party scanned models, HDR asset pipelines, training weights, and real-photograph evaluation.
- Outside scope: altering the PWA's user-facing correction or Stockfish flow.

### Sources / Research

- The supplied `training/output/dataset-v2` images establish the current visual shortcomings.
- [Chess3D showcase](https://discourse.threejs.org/t/how-i-built-a-3d-chess-game-using-three-js/85303) is a visual-quality reference only; its geometry will not be copied.

## Planning Contract

### Technical Direction

- Keep the renderer's public family IDs stable, but introduce family specifications that own both chess-piece proportions/materials and the matching physical board/table palette.
- Replace the shared low-detail lathe parts with denser, family-shaped profiles and add recognisable secondary forms: collars, rims, mitres, crown finials, rook walls, knight ears/mane/muzzle, and king crosses.
- Generate repeatable albedo, roughness, bump, and subtle colour-variation maps in the renderer. Use material variation as a surface cue, not as noise that obscures class identity.
- Sample bounded camera and lighting rigs from the seeded scene. Every candidate continues through the existing full-frame projection validation before it can produce labels.
- Keep RGB-only changes isolated from the instance-mask pass; masks continue to render the exact ID material replacements and derive boxes/pixels from decoded IDs.

### Existing Patterns

- `training/scene/piece-factories.mjs` owns all original piece geometry and per-family materials.
- `training/scene/board-scene.mjs` owns the playable square locations, full-frame camera acceptance, and scene lighting.
- `training/renderer/main.mjs` owns the PBR RGB pass, unlit ID-mask pass, and FEN-first label emission.
- `training/tests/renderer-contract.node-test.mjs` protects source FEN labels, mask geometry, full-board framing, and White-at-bottom convention.
- `training/validate-dataset.mjs` independently decodes and verifies RGB/mask dimensions and every label annotation.

### Implementation Units

#### U1. Define distinctive high-detail set families

**Files:** `training/scene/piece-factories.mjs`, `training/tests/renderer-contract.node-test.mjs`.

**Approach:** Expand each original family profile beyond scalar size changes. Use higher radial/curve fidelity, differentiated base/stem/upper-body profiles, and family-controlled detailing. Model the knight as a rounded, multi-form horse head rather than a flat slab. Keep all meshes generated locally and retain the stable five style IDs.

**Test scenarios:** Every declared family creates all twelve FEN piece variants; representative type meshes have non-empty geometry; styles yield different scale/profile metadata without losing piece-class identity.

#### U2. Couple pieces to realistic boards and material surfaces

**Files:** `training/scene/piece-factories.mjs`, `training/scene/board-scene.mjs`, `training/tests/renderer-contract.node-test.mjs`.

**Approach:** Add family-specific board, frame, inlay, and tabletop specifications. Build compatible procedural surface maps for wood, marble, metal, ivory, and lacquer. Apply physically plausible roughness, clearcoat, metalness, normal/bump detail, and restrained random variation to pieces and boards.

**Test scenarios:** Each style resolves a distinct board palette/material specification; material outputs are valid PBR values; a generated scene includes its tabletop/background context and does not use the legacy universal board palette.

#### U3. Introduce varied indoor photographic rigs

**Files:** `training/scene/board-scene.mjs`, `training/renderer/main.mjs`, `training/tests/renderer-contract.node-test.mjs`.

**Approach:** Sample named camera rigs across plausible overhead, player-side, and diagonal views, varying azimuth, elevation, focal length, framing and target point. Replace the fixed lighting layout with family-appropriate daylight/window, warm lamp, and neutral studio rigs using soft shadows and controlled exposure. Record the selected rig in scene metadata without changing label geometry.

**Test scenarios:** Deterministic seeds select reproducible rigs; sampled camera poses satisfy full-frame validation; White rank 1 stays nearest the bottom; camera metadata spans more than one azimuth/elevation/focal-length combination across representative seeds.

#### U4. Verify visual outputs and preserve training truth

**Files:** `training/renderer/main.mjs`, `training/validate-dataset.mjs`, `training/tests/validate-dataset.node-test.mjs`, `training/README.md`, `training/VALIDATION.md`.

**Approach:** Version the visual generator metadata, preserve the current RGB/mask label relationship, and add checks for rig/family metadata. Regenerate a fresh ignored dataset directory, validate it, and visually inspect one output for each family at full resolution.

**Test scenarios:** The decoded ID mask still reproduces every labelled box/pixel count; every label's FEN squares remain exact; full 50 × 5 output validates; documentation describes the new styles and remains clear that synthetic images require real-photo evaluation.

### Dependency Order

1. U1 establishes visible piece identity.
2. U2 applies family-specific physical materials and boards to those forms.
3. U3 broadens composition and realistic lighting while preserving the frame invariant.
4. U4 verifies the completed output contract and regenerates the private corpus.

### Risks and Mitigations

- Higher mesh complexity can make a full 250-image run slower. Keep geometry reusable per scene, dispose resources after jobs, and verify a smoke render before the full run.
- Strong reflections can hide piece edges. Use bounded roughness and exposure ranges, then inspect all family outputs before accepting a corpus.
- Wider camera poses can undermine whole-board recognition. Retain the existing physical-frame projection gate as a hard rejection condition.
- Procedural detail cannot prove real-photo transfer. Preserve the documented real-photo evaluation requirement instead of claiming photorealism.

## Verification Contract

- Run `npm run test:renderer` after geometry, board, camera, or light changes.
- Run `npm run test:validate` after metadata or truth-contract changes.
- Render a one-variant smoke corpus and inspect all five family styles before a full render.
- Render 50 source positions × five styles to a fresh ignored output directory and run `validate-dataset.mjs` over it.
- Run root `npm run typecheck`, `npm run test`, and `npm run build` to prove the private renderer still has no PWA dependency.

## Definition of Done

- Five rendered families have visibly different pieces, boards, materials, and lighting rather than generic recolours.
- Camera composition varies substantially while every output retains the complete physical outer board frame.
- The source/FEN/square/mask truth contract remains intact and independently validates for a fresh 250-artifact corpus.
- The upgraded renderer, tests, documentation, and plan are committed and pushed to `cross-platform`.
