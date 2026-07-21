import { act, renderHook } from '@testing-library/react-native'
import { useStockfishAnalysis } from './useStockfishAnalysis'

const mockStockfishLoop = jest.fn()
const mockStopStockfish = jest.fn()
const mockSendCommandToStockfish = jest.fn()
let mockEmitOutput: (line: string) => void = () => undefined
let mockEmitError: (message: string) => void = () => undefined

jest.mock('@udaychauhan/react-native-stockfish', () => ({
  useStockfish: ({ onOutput, onError }: { onOutput: (line: string) => void; onError: (message: string) => void }) => {
    mockEmitOutput = onOutput
    mockEmitError = onError
    return { stockfishLoop: mockStockfishLoop, stopStockfish: mockStopStockfish, sendCommandToStockfish: mockSendCommandToStockfish }
  },
}))

describe('useStockfishAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('drives the native bridge through UCI readiness, search, and completion', () => {
    const { result } = renderHook(() => useStockfishAnalysis())

    act(() => result.current.analyse('8/8/8/8/8/8/8/K6k w - - 0 1'))
    expect(mockStockfishLoop).toHaveBeenCalledTimes(1)
    expect(mockSendCommandToStockfish).not.toHaveBeenCalled()

    act(() => mockEmitOutput('Stockfish 17'))
    expect(mockSendCommandToStockfish).toHaveBeenLastCalledWith('uci')
    act(() => mockEmitOutput('uciok'))
    expect(mockSendCommandToStockfish).toHaveBeenCalledWith('setoption name MultiPV value 3')
    expect(mockSendCommandToStockfish).toHaveBeenCalledWith('isready')

    act(() => mockEmitOutput('readyok'))
    expect(mockSendCommandToStockfish).toHaveBeenCalledWith('position fen 8/8/8/8/8/8/8/K6k w - - 0 1')
    expect(mockSendCommandToStockfish).toHaveBeenCalledWith('go depth 14')
    expect(result.current.status).toBe('searching')

    act(() => mockEmitOutput('info depth 14 multipv 1 score cp 12 pv a1a2'))
    act(() => mockEmitOutput('bestmove a1a2'))
    expect(result.current.lines).toEqual([{ rank: 1, depth: 14, evaluation: '+0.12', moves: 'a1a2' }])
    expect(result.current.status).toBe('idle')
    expect(mockStopStockfish).toHaveBeenCalled()
  })

  it('stops the native engine and surfaces a bridge error', () => {
    const { result } = renderHook(() => useStockfishAnalysis())
    act(() => result.current.analyse('8/8/8/8/8/8/8/K6k w - - 0 1'))
    act(() => mockEmitError('native bridge unavailable'))
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('native bridge unavailable')
    expect(mockStopStockfish).toHaveBeenCalled()
  })
})
