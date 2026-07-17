import { useMemo, useRef, useState } from 'react'
import { BoardCalibration } from './components/BoardCalibration'
import { emptyBoard, files, pieceGlyph, pieces, ranks, toFen, validatePosition, type Board, type Piece } from './lib/position'
import { recogniseBoard, type CalibratedCapture } from './services/recognition'
import { analysePosition, type EngineLine } from './services/stockfish'

const labels: Record<Piece, string> = { P:'White pawn',N:'White knight',B:'White bishop',R:'White rook',Q:'White queen',K:'White king',p:'Black pawn',n:'Black knight',b:'Black bishop',r:'Black rook',q:'Black queen',k:'Black king' }

export default function App() {
  const [board, setBoard] = useState<Board>(emptyBoard)
  const [turn, setTurn] = useState<'w'|'b'>('w')
  const [castling, setCastling] = useState('-')
  const [enPassant, setEnPassant] = useState('-')
  const [selected, setSelected] = useState<Piece|null>('P')
  const [message, setMessage] = useState('Start with a complete photo of the real board.')
  const [pendingPhoto, setPendingPhoto] = useState<File>()
  const [calibratedCapture, setCalibratedCapture] = useState<CalibratedCapture>()
  const [lines, setLines] = useState<EngineLine[]>([])
  const [busy, setBusy] = useState(false)
  const [device, setDevice] = useState<'iphone'|'android'>('iphone')
  const importInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const fen = useMemo(() => toFen(board, turn, castling, enPassant), [board, castling, enPassant, turn])

  const choosePhoto = (file?: File) => {
    if (!file) return
    setPendingPhoto(file)
    setCalibratedCapture(undefined)
    setBoard(emptyBoard())
    setLines([])
    setMessage('Mark all four outer board corners before recognition can start.')
  }

  const completeCalibration = async (capture: CalibratedCapture) => {
    setPendingPhoto(undefined)
    setCalibratedCapture(capture)
    setBusy(true)
    setLines([])
    try {
      const result = await recogniseBoard(capture)
      setBoard(result.board)
      setMessage(result.message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Recognition could not start. You can still correct the board manually.')
    } finally {
      setBusy(false)
    }
  }

  const retake = () => {
    setPendingPhoto(undefined)
    setCalibratedCapture(undefined)
    setBoard(emptyBoard())
    setLines([])
    setMessage('Choose a complete board photo to begin again.')
  }

  const run = async () => {
    if (!calibratedCapture) {
      setMessage('Calibrate a complete board photo before analysis.')
      return
    }
    const validation = validatePosition(board, turn, castling, enPassant)
    if (!validation.valid) {
      setMessage(validation.message)
      return
    }
    setBusy(true)
    setMessage('Stockfish is analysing your corrected position…')
    try {
      const result = await analysePosition(board, validation.fen)
      setLines(result)
      setMessage(result.length ? 'Analysis ready — principal variations.' : 'This position has no available engine lines.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Analysis failed.')
    } finally {
      setBusy(false)
    }
  }

  return <main>
    <header><div className="brand"><span>♞</span><strong>chess vision</strong></div></header>
    <div className="layout">
      <section className="workspace">
        <div className="capture">
          <div><p className="eyebrow">FROM THE REAL BOARD</p><h1>See the position.<br/><em>Find the line.</em></h1><p>Start with a complete board photo. Calibrate its outer edges, then correct every square before asking the engine.</p></div>
          <div className="capture-actions">
            <button onClick={() => importInput.current?.click()}>Import photo</button>
            <button className="quiet" onClick={() => cameraInput.current?.click()}>Use camera</button>
            <input ref={importInput} hidden type="file" accept="image/*" onChange={event => { choosePhoto(event.target.files?.[0]); event.currentTarget.value = '' }} />
            <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={event => { choosePhoto(event.target.files?.[0]); event.currentTarget.value = '' }} />
          </div>
        </div>
        <div className="device-picker" aria-label="Mobile preview"><span>Mobile view</span><button className={device === 'iphone' ? 'chosen' : ''} onClick={() => setDevice('iphone')}>iPhone</button><button className={device === 'android' ? 'chosen' : ''} onClick={() => setDevice('android')}>Android</button></div>
        {pendingPhoto && <BoardCalibration file={pendingPhoto} onCalibrated={completeCalibration} onCancel={retake} />}
        {calibratedCapture && !pendingPhoto && <div className="calibrated-capture"><strong>Full board calibrated.</strong><span>The model receives a rectified, white-at-bottom 8×8 board.</span><button type="button" className="quiet" onClick={retake}>Retake photo</button></div>}
        <p className="status" aria-live="polite">{busy ? '● ' : ''}{message}</p>
        <div className={`board-wrap ${device}`}><div className="board" role="grid" aria-label="Correctable chess position">{ranks.map((rank, row) => files.map((file, col) => { const square = `${file}${rank}`; const piece = board[square]; return <button key={square} role="gridcell" aria-label={`${square}, ${piece ? labels[piece] : 'empty'}`} className={(row + col) % 2 ? 'dark' : ''} onClick={() => setBoard(value => ({...value, [square]: selected}))}>{piece && pieceGlyph[piece]}{col === 0 && <small className="rank">{rank}</small>}{row === 7 && <small className="file">{file}</small>}</button> }))}</div></div>
        <div className="palette"><button className={!selected ? 'chosen' : ''} onClick={() => setSelected(null)}>Clear</button>{pieces.map(piece => <button key={piece} className={selected === piece ? 'chosen' : ''} aria-label={labels[piece]} onClick={() => setSelected(piece)}>{pieceGlyph[piece]}</button>)}</div>
      </section>
      <aside><p className="eyebrow">POSITION CHECK</p><div className="fen"><span>FEN</span><code>{fen}</code></div><label className="turn">Side to move <select value={turn} onChange={event => setTurn(event.target.value as 'w'|'b')}><option value="w">White</option><option value="b">Black</option></select></label><div className="position-fields"><label>Castling rights <input value={castling} onChange={event => setCastling(event.target.value || '-')} placeholder="- or KQkq" aria-describedby="history-help" /></label><label>En-passant target <input value={enPassant} onChange={event => setEnPassant(event.target.value || '-')} placeholder="- or e3" aria-describedby="history-help" /></label><small id="history-help">Set only what the board photo makes known; use “-” when it does not.</small></div><button className="analyse" disabled={busy || !calibratedCapture} onClick={run}>Analyse position <span>→</span></button>{!calibratedCapture && <p className="analysis-gate">A confirmed full-board photo is required before engine analysis.</p>}<div className="lines"><p className="eyebrow">TOP ENGINE LINES</p>{lines.length ? lines.map(line => <article key={line.rank}><b>#{line.rank}</b><strong>{line.evaluation}</strong><span>depth {line.depth}</span><p>{line.moves}</p></article>) : <div className="empty">Your available principal variations will appear here.</div>}</div></aside>
    </div>
  </main>
}
