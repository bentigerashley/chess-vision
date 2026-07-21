import { emptyBoard, toFen, validatePosition, validBoard } from './position'

describe('position helpers', () => {
  it('serialises an empty board to FEN', () => expect(toFen(emptyBoard(), 'w')).toBe('8/8/8/8/8/8/8/8 w - - 0 1'))
  it('requires exactly one king of each colour', () => {
    const board = emptyBoard()
    board.e1 = 'K'
    board.e8 = 'k'
    expect(validBoard(board)).toBe(true)
  })

  it('serialises explicit position history fields', () => {
    const board = emptyBoard()
    board.e1 = 'K'
    board.e8 = 'k'
    board.a1 = 'R'
    board.h1 = 'R'
    expect(toFen(board, 'w', 'KQ', '-')).toContain(' w KQ - 0 1')
  })

  it('rejects positions where the non-active king is in check', () => {
    const board = emptyBoard()
    board.e1 = 'K'
    board.e8 = 'k'
    board.e7 = 'R'
    expect(validatePosition(board, 'w')).toMatchObject({ valid: false })
  })

  it('rejects impossible castling rights and pawn back-ranks', () => {
    const castling = emptyBoard()
    castling.e1 = 'K'
    castling.e8 = 'k'
    expect(validatePosition(castling, 'w', 'K')).toMatchObject({ valid: false })

    const pawn = emptyBoard()
    pawn.e1 = 'K'
    pawn.e8 = 'k'
    pawn.a1 = 'P'
    expect(validatePosition(pawn, 'w')).toMatchObject({ valid: false })
  })

  it('requires a matching pawn for a claimed en-passant target', () => {
    const board = emptyBoard()
    board.e1 = 'K'
    board.e8 = 'k'
    expect(validatePosition(board, 'b', '-', 'e3')).toMatchObject({ valid: false })
    board.e4 = 'P'
    expect(validatePosition(board, 'b', '-', 'e3')).toMatchObject({ valid: true })
  })
})
