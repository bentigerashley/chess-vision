import { useMemo, useRef, useState } from 'react'
import { downloadDataset } from './studio/generator'
import { emptyBoard, files, pieceGlyph, pieces, ranks, toFen, validBoard, type Board, type Piece } from './lib/position'
import { recogniseBoard } from './services/recognition'
import { analysePosition, type EngineLine } from './services/stockfish'

const labels: Record<Piece, string> = { P:'White pawn',N:'White knight',B:'White bishop',R:'White rook',Q:'White queen',K:'White king',p:'Black pawn',n:'Black knight',b:'Black bishop',r:'Black rook',q:'Black queen',k:'Black king' }

export default function App() {
  const [board, setBoard] = useState<Board>(emptyBoard)
  const [turn, setTurn] = useState<'w'|'b'>('w')
  const [selected, setSelected] = useState<Piece|null>('P')
  const [message, setMessage] = useState('Import a board photo or place pieces to begin.')
  const [preview, setPreview] = useState<string>()
  const [lines, setLines] = useState<EngineLine[]>([])
  const [busy, setBusy] = useState(false)
  const [studio, setStudio] = useState(false)
  const [device, setDevice] = useState<'iphone'|'android'>('iphone')
  const input = useRef<HTMLInputElement>(null)
  const fen = useMemo(() => toFen(board, turn), [board, turn])
  const capture = async (file?: File) => { if (!file) return; setPreview(URL.createObjectURL(file)); setBusy(true); setLines([]); const result = await recogniseBoard(file); setBoard(result.board); setMessage(result.message); setBusy(false) }
  const run = async () => { if (!validBoard(board)) { setMessage('Place exactly one white king and one black king before analysis.'); return }; setBusy(true); setMessage('Stockfish is analysing your corrected position…'); try { const result = await analysePosition(board, fen); setLines(result); setMessage(result.length ? 'Analysis ready — principal variations.' : 'This position has no available engine lines.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Analysis failed.') } finally { setBusy(false) } }

  return <main>
    <header><div className="brand"><span>♞</span><strong>chess vision</strong></div><button className="quiet" onClick={() => setStudio(!studio)}>{studio ? 'Back to board' : 'Dataset studio'}</button></header>
    {studio ? <section className="studio"><p className="eyebrow">SYNTHETIC TRAINING DATA</p><h1>Render labelled boards.</h1><p>Create original Three.js board samples and a JSON manifest with FEN, 64-square labels, seed, and scene metadata.</p><div className="studio-actions"><button onClick={() => downloadDataset(8)}>Download 8 samples</button><button className="quiet" onClick={() => downloadDataset(32)}>Download 32 samples</button></div></section> : <div className="layout">
      <section className="workspace"><div className="capture"><div><p className="eyebrow">FROM THE REAL BOARD</p><h1>See the position.<br/><em>Find the line.</em></h1><p>Use a board photo as your draft, then make every square correct before asking the engine.</p></div><div className="capture-actions"><button onClick={() => input.current?.click()}>Import photo</button><button className="quiet" onClick={() => input.current?.click()}>Use camera</button><input ref={input} hidden type="file" accept="image/*" capture="environment" onChange={event => capture(event.target.files?.[0])}/></div></div>
      <div className="device-picker" aria-label="Mobile preview"><span>Mobile view</span><button className={device === 'iphone' ? 'chosen' : ''} onClick={() => setDevice('iphone')}>iPhone</button><button className={device === 'android' ? 'chosen' : ''} onClick={() => setDevice('android')}>Android</button></div>
      {preview && <img className="preview" src={preview} alt="Imported chessboard"/>}<p className="status" aria-live="polite">{busy ? '● ' : ''}{message}</p>
      <div className={`board-wrap ${device}`}><div className="board" role="grid" aria-label="Correctable chess position">{ranks.map((rank, row) => files.map((file, col) => { const square = `${file}${rank}`; const piece = board[square]; return <button key={square} role="gridcell" aria-label={`${square}, ${piece ? labels[piece] : 'empty'}`} className={(row + col) % 2 ? 'dark' : ''} onClick={() => setBoard(value => ({...value, [square]: selected}))}>{piece && pieceGlyph[piece]}{col === 0 && <small className="rank">{rank}</small>}{row === 7 && <small className="file">{file}</small>}</button> }))}</div></div>
      <div className="palette"><button className={!selected ? 'chosen' : ''} onClick={() => setSelected(null)}>Clear</button>{pieces.map(piece => <button key={piece} className={selected === piece ? 'chosen' : ''} aria-label={labels[piece]} onClick={() => setSelected(piece)}>{pieceGlyph[piece]}</button>)}</div></section>
      <aside><p className="eyebrow">POSITION CHECK</p><div className="fen"><span>FEN</span><code>{fen}</code></div><label className="turn">Side to move <select value={turn} onChange={event => setTurn(event.target.value as 'w'|'b')}><option value="w">White</option><option value="b">Black</option></select></label><button className="analyse" disabled={busy} onClick={run}>Analyse position <span>→</span></button><div className="lines"><p className="eyebrow">TOP ENGINE LINES</p>{lines.length ? lines.map(line => <article key={line.rank}><b>#{line.rank}</b><strong>{line.evaluation}</strong><span>depth {line.depth}</span><p>{line.moves}</p></article>) : <div className="empty">Your available principal variations will appear here.</div>}</div></aside>
    </div>}
  </main>
}
