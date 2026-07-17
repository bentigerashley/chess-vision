import { Chess } from 'chess.js'

/** Deterministically derives 50 legal mid-game positions without redistributing third-party puzzle data. */
export function legalPuzzlePositions(count = 50): string[] {
  const positions: string[] = []
  for (let seed = 1; positions.length < count; seed += 1) {
    const chess = new Chess(); let state = seed
    for (let ply = 0; ply < 18 + seed % 24; ply += 1) {
      const moves = chess.moves(); if (!moves.length) break
      state = (state * 1664525 + 1013904223) >>> 0
      chess.move(moves[state % moves.length])
    }
    if (!chess.isGameOver() && chess.moves().length > 2) positions.push(chess.fen())
  }
  return positions
}
