import { useStockfish } from '@udaychauhan/react-native-stockfish'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EngineSearchOutput, type EngineLine } from '../services/stockfish'

export type AnalysisStatus = 'idle' | 'starting' | 'searching' | 'error'

type ActiveSearch = {
  token: number
  fen: string
  phase: 'starting-native' | 'booting' | 'waiting-ready' | 'searching' | 'stopping'
  output: EngineSearchOutput
  timeout: ReturnType<typeof setTimeout>
  discardResult: boolean
}

const analysisTimeoutMs = 20_000

export function useStockfishAnalysis() {
  const activeSearch = useRef<ActiveSearch | null>(null)
  // The current native bridge tears down its coroutine before the Stockfish
  // worker has completely returned. Restarting it after every `bestmove` can
  // therefore race the native worker and terminate the app. A UCI engine is
  // designed to receive many `position` / `go` commands in one process, so
  // keep a ready session alive and only stop an in-flight UCI search.
  const nativeReady = useRef(false)
  const pendingFen = useRef<string | undefined>(undefined)
  const startSearchRef = useRef<((fen: string) => void) | undefined>(undefined)
  const token = useRef(0)
  const [status, setStatus] = useState<AnalysisStatus>('idle')
  const [lines, setLines] = useState<EngineLine[]>([])
  const [error, setError] = useState<string>()

  const clearActiveSearch = useCallback(() => {
    if (activeSearch.current) clearTimeout(activeSearch.current.timeout)
    activeSearch.current = null
  }, [])

  const settleActiveSearch = useCallback((active: ActiveSearch, lines?: EngineLine[]) => {
    if (activeSearch.current !== active) return
    clearTimeout(active.timeout)
    activeSearch.current = null
    const nextFen = pendingFen.current
    pendingFen.current = undefined
    if (!active.discardResult && lines) setLines(lines)
    if (nextFen) {
      startSearchRef.current?.(nextFen)
    } else {
      setStatus('idle')
    }
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
      nativeReady.current = true
      if (active.discardResult) {
        settleActiveSearch(active)
        return
      }
      active.phase = 'searching'
      setStatus('searching')
      sendCommandRef.current?.(`position fen ${active.fen}`)
      sendCommandRef.current?.('go depth 14')
    }
    if (result.complete && (active.phase === 'searching' || active.phase === 'stopping')) {
      settleActiveSearch(active, result.lines)
    }
  }, [settleActiveSearch])

  const onError = useCallback((nativeError: string) => {
    clearActiveSearch()
    pendingFen.current = undefined
    nativeReady.current = false
    setStatus('error')
    setError(nativeError || 'Stockfish could not start on this device.')
  }, [clearActiveSearch])

  const { stockfishLoop, sendCommandToStockfish } = useStockfish({ onOutput, onError })
  const sendCommandRef = useRef<typeof sendCommandToStockfish | null>(null)
  sendCommandRef.current = sendCommandToStockfish

  const cancel = useCallback(() => {
    pendingFen.current = undefined
    const active = activeSearch.current
    if (active) {
      active.discardResult = true
      if (active.phase === 'searching') {
        active.phase = 'stopping'
        sendCommandToStockfish('stop')
      }
    }
    setStatus('idle')
  }, [sendCommandToStockfish])

  const reset = useCallback(() => {
    cancel()
    setLines([])
    setError(undefined)
  }, [cancel])

  const startSearch = useCallback((fen: string) => {
    const nextToken = token.current + 1
    token.current = nextToken
    setLines([])
    setError(undefined)
    setStatus('starting')
    const timeout = setTimeout(() => {
      const active = activeSearch.current
      if (!active || active.token !== nextToken) return
      active.discardResult = true
      if (active.phase === 'searching') {
        active.phase = 'stopping'
        sendCommandToStockfish('stop')
      }
      setStatus('error')
      setError('Stockfish did not finish in time. Try the position again.')
    }, analysisTimeoutMs)
    const phase = nativeReady.current ? 'searching' : 'starting-native'
    activeSearch.current = { token: nextToken, fen, phase, output: new EngineSearchOutput(), timeout, discardResult: false }
    if (nativeReady.current) {
      setStatus('searching')
      sendCommandToStockfish(`position fen ${fen}`)
      sendCommandToStockfish('go depth 14')
      return
    }
    stockfishLoop()
  }, [sendCommandToStockfish, stockfishLoop])
  startSearchRef.current = startSearch

  const analyse = useCallback((fen: string) => {
    const active = activeSearch.current
    if (!active) {
      startSearch(fen)
      return
    }
    pendingFen.current = fen
    active.discardResult = true
    if (active.phase === 'searching') {
      active.phase = 'stopping'
      sendCommandToStockfish('stop')
    }
    setLines([])
    setError(undefined)
    setStatus('starting')
  }, [sendCommandToStockfish, startSearch])

  useEffect(() => () => {
    pendingFen.current = undefined
    clearActiveSearch()
  }, [clearActiveSearch])

  return { analyse, cancel, error, lines, reset, status }
}
