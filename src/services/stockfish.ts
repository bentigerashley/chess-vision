import type { Board } from '../lib/position'

export type EngineLine = { rank:number, evaluation:string, depth:number, moves:string }

export function analysePosition(_board: Board, fen: string): Promise<EngineLine[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/engine/stockfish-18-lite-single.js')
    const timer = window.setTimeout(() => { worker.terminate(); reject(new Error('Stockfish did not respond in time.')) }, 20_000)
    const lines = new Map<number, EngineLine>()
    worker.onmessage = (event: MessageEvent<string>) => {
      const output = event.data
      const match = /info depth (\d+).*?multipv (\d+).*?score (cp|mate) (-?\d+).*? pv (.+)/.exec(output)
      if (match) lines.set(Number(match[2]), { rank:Number(match[2]), depth:Number(match[1]), evaluation:match[3] === 'mate' ? `#${match[4]}` : `${Number(match[4]) >= 0 ? '+' : ''}${(Number(match[4])/100).toFixed(2)}`, moves:match[5] })
      if (output.startsWith('bestmove')) { window.clearTimeout(timer); worker.terminate(); resolve([...lines.values()].sort((a,b)=>a.rank-b.rank)) }
    }
    worker.onerror = () => { window.clearTimeout(timer); worker.terminate(); reject(new Error('Stockfish could not start in this browser.')) }
    worker.postMessage('uci'); worker.postMessage('setoption name MultiPV value 3'); worker.postMessage(`position fen ${fen}`); worker.postMessage('go depth 14')
  })
}
