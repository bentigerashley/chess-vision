# Real-photo recognition readiness

## Decision

Do not enable automatic recognition from the synthetic MobileNetV3 experiment
until a full, source-traceable real-photo benchmark passes the private
promotion gate. The React Native editor remains the truth boundary and native
Stockfish receives only the corrected, validated FEN.

## Why this exists

The synthetic holdout reached 98.875% pooled square accuracy, but 1,105 of its
1,600 squares were empty. That result is useful pipeline evidence, not a
physical-board claim. A full board fails when even one square is wrong, so the
release decision must separately measure piece identity, occupancy, exact
placement, correction burden, and structural sanity.

## Benchmark contract

`training/ml/chessred.py` converts the official ChessReD2K held-out test split
into the established `a8..h1` class contract. The source record pins the
official annotations MD5 and licence. `training/ml/real_eval.py` rejects CPU
fallback and incomplete/incorrect provenance, rectifies from the four outer
corners, and emits an ignored report with a `ready-for-native-runtime-decision`
or `not-ready` verdict.

ChessReD2K is CC BY-NC-SA 4.0, so it is an internal evaluation source only. It
must not be used for commercial training, app assets, or redistributed output
without separate permission. The exact setup and commands are in
[`training/README.md`](../../training/README.md).

## Initial natural-photo smoke evidence

On 2026-07-22 the existing `chess-piece-v1` checkpoint ran on CUDA 12.8 using
an RTX 3050 Ti against the public-domain Commons photograph
[`Xadrez inicial 3.jpg`](https://commons.wikimedia.org/wiki/File:Xadrez_inicial_3.jpg).
The photo's source declares a complete official-size starting position, and
the run used manually reviewed full-frame corners. It is intentionally a smoke
case rather than the release benchmark.

The result was not ready: 22 wrong squares, 0 exact placement boards, 0.211
piece-only macro F1, one structural-invalid prediction, and 29 of 64 squares
below 0.80 confidence. Occupancy recall was 0.969, showing why detection of
empty squares must not be used to imply piece-identity accuracy. The report
remains private at `training/output/real-photo-smoke/report.json`.

## Stockfish boundary

The native hook starts Stockfish with UCI, requests `MultiPV 3`, waits for
`readyok`, then searches the corrected FEN at depth 14. The parser accepts
newline-stripped native callbacks and returns ranks 1-3 only. It reuses that
ready UCI session for later positions instead of repeatedly tearing down the
native worker; a position change sends UCI `stop` for an in-flight search.
Invalid or uncorrected boards cannot start a search.

During the Android emulator smoke test, Stockfish returned ranked lines at
depth 14, but the third-party bridge crashed when its native worker was torn
down and restarted for a second search. The hook now keeps one ready UCI
session and has a regression test proving later FENs reuse it. The existing
release checklist still requires a fresh two-search Android and iOS device
smoke before a store build is accepted.
