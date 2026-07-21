---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-brainstorm
topic: real-photo-recognition-readiness
created: 2026-07-22
---

# Real-Photo Recognition Readiness and Stockfish Verification

## Goal capsule

Establish whether the existing square classifier can accurately reconstruct
positions from full, natural photographs of physical chessboards; improve only
from evidence; and prove that a corrected position reaches the native
three-line Stockfish analysis flow.  A synthetic score must never be presented
as a real-world readiness result.

## Product contract

### Requirements

- R1. Evaluate the private MobileNetV3 square classifier on independently
  labelled photographs of physical boards, with a public source, licence, file
  checksum, source game/split identity, full-board corners, and square truth
  recorded for every evaluated image.
- R2. Treat `empty` as a normal thirteenth class, but make promotion depend on
  occupied-square results and complete-board reconstruction as well as overall
  accuracy so empty-square prevalence cannot conceal piece errors.
- R3. Report per-square class metrics, empty/occupied confusion, exact
  placement-FEN accuracy, incorrect-square distribution, king/pawn structural
  validity, confidence distribution, and calibration/corner provenance.
- R4. Keep images, weights, and detailed reports under ignored
  `training/output/`; commit only code, source metadata, documentation, and
  tests.  Do not train on, redistribute, or bundle a source whose licence does
  not authorise that use.
- R5. Use the ChessReD2K held-out test split as the primary internal gate when
  its CC BY-NC-SA 4.0 terms have been accepted for evaluation.  Its positions
  are derived from PGNs and its corner labels enable the app-compatible,
  user-calibrated path to be measured.
- R6. Do not enable automatic recognition in the React Native app unless the
  gate passes.  If it fails, preserve the honest correction-first fallback and
  state the measured reason.
- R7. Stockfish must receive only a user-corrected, validated FEN and return
  up to three ranked principal variations through the existing native UCI
  integration.

### Acceptance examples

- AE1. A ChessReD2K test photo plus its four named corners is rectified in
  `a8..h1` order, producing exactly 64 labels whose truth is reconstructed
  from the published piece annotations and empty squares.
- AE2. A report cannot say `ready` from a high empty-square accuracy alone: it
  independently checks piece macro-F1, occupied recall, exact board matches,
  correction burden, and structural position failures.
- AE3. The evaluator refuses a missing or checksum-mismatched source metadata
  file, unknown category, absent corner, duplicate square, image outside the
  held-out split, or train/test leakage.
- AE4. A corrected legal FEN drives native Stockfish through `uci`, `MultiPV
  3`, `isready`, `position fen`, and `go depth 14`; the UI only renders the
  returned ranked lines after `bestmove`.

### Scope boundaries

- Included: private evaluator/download preparation, real-photo truth adapter,
  benchmark reporting, pass/fail policy, source/licence documentation,
  Stockfish contract verification, and a genuine emulator smoke check.
- Deferred: automatic corner detection, shipping model weights, training on
  non-commercial material, and claiming broad commercial readiness from one
  benchmark source.
- Excluded: a second engine implementation.  The app already has a native
  Stockfish integration; this work verifies and documents that path instead of
  replacing it.

## Key technical decisions

- KTD1. **Use ChessReD2K test games for the primary gate.**
  Provenance: user-directed real-position testing.  Rejected alternative:
  treat generated validation images as evidence of physical-board accuracy.
  Reason: ChessReD contains smartphone photographs replayed from recorded
  games, FEN-derived labels, and annotated corners; synthetic data does not
  measure the domain gap.
- KTD2. **Evaluate the current calibrated-square architecture first.**
  Provenance: user-directed correction-first capture contract.  Rejected
  alternative: silently substitute an end-to-end detector.  Reason: the app
  requires a full board and four user-confirmed corners, so its production
  inference path needs a matching evaluation.
- KTD3. **Keep correction before engine analysis.**
  Provenance: user-directed.  Rejected alternative: send a photo-derived
  position directly to Stockfish.  Reason: side to move and history cannot be
  safely inferred from a single image, and correction is the product truth
  boundary.
- KTD4. **Use a conservative gated verdict, not a subjective ready label.**
  Promotion requires at least 95% macro-F1 across the 13 square classes, 97%
  occupied-square recall, 75% exact-placement boards, no more than two wrong
  squares at the 95th percentile, and no structural-invalid prediction.  A
  failed gate remains an honest `unavailable` app state and produces a
  diagnosed improvement backlog.
- KTD5. **Respect source restrictions.**
  ChessReD2K's CC BY-NC-SA 4.0 licence permits the internal benchmark only;
  it is neither a production-training source nor a shipped app asset.  A
  separate commercially suitable corpus is required before fine-tuning or
  distribution.

## Implementation units

### U1. Create a provenance-checked ChessReD adapter

**Files:** `training/ml/chessred.py`, `training/tests/test_ml_chessred.py`,
`training/real/chessred2k.source.json`.

**Approach:** Convert published categories, sparse piece annotations, named
white-perspective corners, and official split IDs into the existing 13-class,
`a8..h1` square contract.  Validate source checksum and test-game ownership
before images become evaluation records.  Keep download/extraction explicit,
resumable, and private.

**Test scenarios:** category mapping; absent-square-to-empty conversion;
canonical corner ordering; duplicate/missing/unknown label rejection; MD5 and
licence metadata validation; and rejection of an ID outside ChessReD2K test.

### U2. Add deterministic GPU real-photo evaluation and readiness report

**Files:** `training/ml/real_eval.py`, `training/tests/test_ml_real_eval.py`,
`training/requirements-ml.txt`, `training/README.md`.

**Approach:** Load the existing checkpoint on CUDA, run app-compatible
rectification and square crops, calculate source-grouped board metrics and
confidence summaries, then write a versioned JSON and Markdown report below
`training/output/`.  The report applies the KTD4 gate and records an explicit
not-ready reason rather than promoting by default.

**Test scenarios:** known-logit prediction/metric calculations; no leakage
between target split and model provenance; exact placement versus a one-square
error; empty-only inflation cannot satisfy the gate; malformed images/corners
fail with actionable errors; CPU-only execution is rejected; and report schema
is deterministic.

### U3. Verify the corrected native Stockfish handoff

**Files:** `src/services/stockfish.ts`, `src/services/stockfish.test.ts`,
`src/hooks/useStockfishAnalysis.ts`, `README.md`.

**Approach:** Preserve the installed native engine and correction-first FEN
boundary.  Extend its protocol test evidence to cover startup sequencing,
MultiPV bounds, terminal parsing, cancellation, and error states; exercise a
legal FEN on the Android emulator and retain only a text smoke record.

**Test scenarios:** exactly three ordered lines, newline-stripped native
callbacks, delayed `readyok`, timeout/cancel, native startup error, no search
before a legal FEN, and no duplicate engine run after correction changes.

### U4. Publish a factual readiness record

**Files:** `docs/solutions/real-photo-recognition-readiness.md`, `README.md`.

**Approach:** Record source limits, commands, the promotion policy, observed
benchmark result, any non-promotion rationale, and the next legal route to
improve.  Link the internal source and academic record without putting photos
or proprietary data in version control.

**Test scenarios:** documentation names the output report, does not call
synthetic validation production readiness, describes `empty` as a class rather
than a separate detection result, and accurately states Stockfish's correction
gate.

## Dependencies and sequencing

1. U1 establishes truth and provenance before any model inference.
2. U2 uses U1's canonical records and applies the promotion policy.
3. U3 is independent of recognition accuracy but must be smoke-tested against
   the installed Android build.
4. U4 is written only from generated report evidence; it must not anticipate a
   passing score.

## Risks and mitigations

- ChessReD2K is 4.68 GB and non-commercial: fetch only into ignored output,
  resume downloads, verify its MD5, and prevent it entering a training or app
  asset path.
- A benchmark's sequence frames can be nearly identical: report results by
  official game and use only held-out test games for the final gate.
- Real-photo failure is likely for synthetic-only weights: preserve the
  correction-first UX and use the per-class/confidence report to identify the
  next legal corpus or modelling decision.
- A single complete-board metric is unforgiving: report it alongside
  correction burden rather than obscuring it with pooled empty squares.

## Sources

- [ChessReD dataset record](https://data.4tu.nl/datasets/99b5c721-280b-450b-b058-b2900b69a90f)
- [ChessReD official implementation](https://github.com/tmasouris/end-to-end-chess-recognition)
- [End-to-End Chess Recognition paper](https://arxiv.org/abs/2310.04086)

## Product Contract preservation

Product Contract unchanged.  This implementation adds the missing held-out
real-photo gate without widening the app's correction-first capture contract.
