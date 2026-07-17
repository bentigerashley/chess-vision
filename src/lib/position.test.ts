import { describe, expect, it } from 'vitest'
import { emptyBoard, seededPosition, toFen, validBoard } from './position'

describe('position helpers', () => {
  it('serialises an empty board to FEN', () => expect(toFen(emptyBoard(), 'w')).toBe('8/8/8/8/8/8/8/8 w - - 0 1'))
  it('requires exactly one king of each colour', () => expect(validBoard(seededPosition(1))).toBe(true))
})
