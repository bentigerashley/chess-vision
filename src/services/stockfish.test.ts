import { EngineSearchOutput, parseEngineInfo, UciLineBuffer } from './stockfish'

describe('Stockfish UCI parsing', () => {
  it('formats centipawn and mate scores into ranked lines', () => {
    expect(parseEngineInfo('info depth 14 multipv 2 score cp -34 pv e2e4 e7e5')).toEqual({
      rank: 2, depth: 14, evaluation: '-0.34', moves: 'e2e4 e7e5',
    })
    expect(parseEngineInfo('info depth 14 multipv 1 score mate 3 pv h7h8q')).toMatchObject({ evaluation: '+M3' })
  })

  it('buffers fragmented callback chunks and keeps only the first three requested principal variations', () => {
    const output = new EngineSearchOutput()
    expect(output.consume('info depth 12 multipv 2 score cp 18 pv d2d4\ninfo depth 12 mul')).toEqual({
      complete: false,
      lines: [{ rank: 2, depth: 12, evaluation: '+0.18', moves: 'd2d4' }],
      protocolLines: ['info depth 12 multipv 2 score cp 18 pv d2d4'],
    })
    const result = output.consume('tipv 1 score cp 21 pv e2e4\ninfo depth 12 multipv 4 score cp 0 pv g1f3\nbestmove e2e4\n')
    expect(result.complete).toBe(true)
    expect(result.lines.map(line => line.rank)).toEqual([1, 2])
    expect(result.protocolLines).toContain('bestmove e2e4')
  })

  it('does not treat incomplete output as a line', () => {
    const buffer = new UciLineBuffer()
    expect(buffer.push('info depth 10')).toEqual([])
    expect(buffer.flush()).toEqual(['info depth 10'])
  })

  it('accepts a terminal bestmove callback even when it follows info output without a final newline', () => {
    const output = new EngineSearchOutput()
    expect(output.consume('info depth 14 multipv 1 score cp 12 pv e2e4\nbestmove e2e4').complete).toBe(true)
  })

  it('handles the native bridge callback contract of one newline-stripped UCI line per event', () => {
    const output = new EngineSearchOutput()
    expect(output.consumeNativeCallback('uciok').protocolLines).toEqual(['uciok'])
    expect(output.consumeNativeCallback('readyok').protocolLines).toEqual(['readyok'])
    expect(output.consumeNativeCallback('info depth 14 multipv 1 score cp 12 pv e2e4').lines).toEqual([
      { rank: 1, depth: 14, evaluation: '+0.12', moves: 'e2e4' },
    ])
    expect(output.consumeNativeCallback('bestmove e2e4').complete).toBe(true)
  })
})
