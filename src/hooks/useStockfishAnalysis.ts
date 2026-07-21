import { useStockfish } from '@udaychauhan/react-native-stockfish'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EngineSearchOutput, type EngineLine } from '../services/stockfish'

export type AnalysisStatus = 'idle' | 'starting' | 'searching' | 'error'

type ActiveSearch = {
  token: number
  fen: string
  phase: 'starting-native' | 'booting' | 'waiting-ready' | 'searching'
  output: EngineSearchOutput
  timeout: ReturnType<typeof setTimeout>
}

const analysisTimeoutMs = 20_000

export function useStockfishAnalysis() {
  const activeSearch = useRef<ActiveSearch | null>(null)
  const token = useRef(0)
  const [status, setStatus] = useState<AnalysisStatus>('idle')
  const [lines, setLines] = useState<EngineLine[]>([])
  const [error, setError] = useState<string>()

  const clearActiveSearch = useCallback(() => {
    if (activeSearch.current) clearTimeout(activeSearch.current.timeout)
    activeSearch.current = null
  }, [])

  const onOutput = useCallback((chunk: string) => {
    const active = activeSearch.current
    if (!active) return
    const result = active.output.consumeNativeCallback(chunk)
    if (result.protocolLines.some(message => message.startsWith('Stockfish ')) && active.phase === 'starting-native') {
      active.phase = 'booting'
      sendCommandRef.current?.('uci')
    }
    if (result.protocolLines.some(message => message.trim() === 'uciok') && active.phase === 'booting') {
      active.phase = 'waiting-ready'
      sendCommandRef.current?.('setoption name MultiPV value 3')
      sendCommandRef.current?.('isready')
    }
    if (result.protocolLines.some(message => message.trim() === 'readyok') && active.phase === 'waiting-ready') {
      active.phase = 'searching'
      setStatus('searching')
      sendCommandRef.current?.(`position fen ${active.fen}`)
      sendCommandRef.current?.('go depth 14')
    }
    if (result.complete && active.phase === 'searching') {
      clearTimeout(active.timeout)
      activeSearch.current = null
      setLines(result.lines)
      setStatus('idle')
      stopRef.current?.()
    }
  }, [])

  const onError = useCallback((nativeError: string) => {
    clearActiveSearch()
    stopRef.current?.()
    setStatus('error')
    setError(nativeError || 'Stockfish could not start on this device.')
  }, [clearActiveSearch])

  const { stockfishLoop, stopStockfish, sendCommandToStockfish } = useStockfish({ onOutput, onError })
  const sendCommandRef = useRef<typeof sendCommandToStockfish | null>(null)
  const stopRef = useRef<typeof stopStockfish | null>(null)
  sendCommandRef.current = sendCommandToStockfish
  stopRef.current = stopStockfish

  const cancel = useCallback(() => {
    if (activeSearch.current) sendCommandToStockfish('stop')
    clearActiveSearch()
    stopStockfish()
    setStatus('idle')
  }, [clearActiveSearch, sendCommandToStockfish, stopStockfish])

  const reset = useCallback(() => {
    cancel()
    setLines([])
    setError(undefined)
  }, [cancel])

  const analyse = useCallback((fen: string) => {
    cancel()
    const nextToken = token.current + 1
    token.current = nextToken
    setLines([])
    setError(undefined)
    setStatus('starting')
    const timeout = setTimeout(() => {
      if (activeSearch.current?.token !== nextToken) return
      stopStockfish()
      activeSearch.current = null
      setStatus('error')
      setError('Stockfish did not finish in time. Try the position again.')
    }, analysisTimeoutMs)
    activeSearch.current = { token: nextToken, fen, phase: 'starting-native', output: new EngineSearchOutput(), timeout }
    stockfishLoop()
  }, [cancel, stockfishLoop, stopStockfish])

  useEffect(() => () => {
    clearActiveSearch()
    stopStockfish()
  }, [clearActiveSearch, stopStockfish])

  return { analyse, cancel, error, lines, reset, status }
}
