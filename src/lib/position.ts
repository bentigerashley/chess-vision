import { Chess, validateFen, type Square } from 'chess.js'

export type Piece = 'P'|'N'|'B'|'R'|'Q'|'K'|'p'|'n'|'b'|'r'|'q'|'k'
export type Board = Record<string, Piece | null>
export const files = ['a','b','c','d','e','f','g','h'] as const
export const ranks = [8,7,6,5,4,3,2,1] as const
export const pieces: Piece[] = ['P','N','B','R','Q','K','p','n','b','r','q','k']
export const pieceGlyph: Record<Piece, string> = { P:'♙',N:'♘',B:'♗',R:'♖',Q:'♕',K:'♔',p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚' }
export const emptyBoard = (): Board => Object.fromEntries(ranks.flatMap(rank => files.map(file => [`${file}${rank}`, null]))) as Board
export function toFen(board: Board, turn: 'w'|'b', castling = '-', enPassant = '-') { const rows = ranks.map(rank => { let run=0; let row=''; for(const file of files){ const p=board[`${file}${rank}`]; if(p) { if(run) row+=run; run=0; row+=p } else run++ } return row+(run||'') }); return `${rows.join('/')} ${turn} ${castling} ${enPassant} 0 1` }
export function validBoard(board: Board) { return (Object.values(board).filter(p=>p==='K').length === 1 && Object.values(board).filter(p=>p==='k').length === 1) }
export type PositionValidation = { valid: true, fen: string } | { valid: false, message: string }

const homePieces: Record<string, [string, Piece]> = {
  K: ['h1', 'R'], Q: ['a1', 'R'], k: ['h8', 'r'], q: ['a8', 'r'],
}

export function validatePosition(board: Board, turn: 'w'|'b', castling = '-', enPassant = '-'): PositionValidation {
  if (!validBoard(board)) return { valid: false, message: 'Place exactly one white king and one black king.' }
  if (ranks.some(rank => files.some(file => ['P', 'p'].includes(board[`${file}${rank}`] ?? '') && (rank === 1 || rank === 8)))) return { valid: false, message: 'Pawns cannot be on the first or eighth rank.' }
  if (castling !== '-' && !/^(K?Q?k?q?)$/.test(castling)) return { valid: false, message: 'Castling rights are malformed.' }
  for (const right of castling === '-' ? [] : castling) {
    const [rookSquare, rook] = homePieces[right]
    const kingSquare = right === right.toUpperCase() ? 'e1' : 'e8'
    const king = right === right.toUpperCase() ? 'K' : 'k'
    if (board[kingSquare] !== king || board[rookSquare] !== rook) return { valid: false, message: 'Castling rights do not match the board.' }
  }
  if (enPassant !== '-' && !/^[a-h][36]$/.test(enPassant)) return { valid: false, message: 'En-passant target is malformed.' }
  if (enPassant !== '-' && ((enPassant.endsWith('6') && turn !== 'w') || (enPassant.endsWith('3') && turn !== 'b'))) return { valid: false, message: 'En-passant target does not match the side to move.' }
  if (enPassant !== '-') {
    const file = enPassant[0]
    const pawnSquare = enPassant.endsWith('3') ? `${file}4` : `${file}5`
    const pawn = enPassant.endsWith('3') ? 'P' : 'p'
    if (board[pawnSquare] !== pawn) return { valid: false, message: 'En-passant target does not match a just-advanced pawn.' }
  }

  const fen = toFen(board, turn, castling, enPassant)
  const fenResult = validateFen(fen)
  if (!fenResult.ok) return { valid: false, message: fenResult.error ?? 'The FEN is invalid.' }

  const chess = new Chess(fen)
  const whiteKing = Object.entries(board).find(([, piece]) => piece === 'K')?.[0]
  const blackKing = Object.entries(board).find(([, piece]) => piece === 'k')?.[0]
  if (!whiteKing || !blackKing) return { valid: false, message: 'Both kings are required.' }
  const whiteInCheck = chess.isAttacked(whiteKing as Square, 'b')
  const blackInCheck = chess.isAttacked(blackKing as Square, 'w')
  if (whiteInCheck && blackInCheck) return { valid: false, message: 'Both kings cannot be in check.' }
  if ((turn === 'w' && blackInCheck) || (turn === 'b' && whiteInCheck)) return { valid: false, message: 'The non-active king cannot be in check.' }
  return { valid: true, fen }
}
export function boardFromFen(fen: string): Board { const board=emptyBoard(); let rank=8,file=0; for(const token of fen.split(' ')[0]){ if(token==='/'){rank--;file=0}else if(/\d/.test(token)){file+=Number(token)}else{board[`${files[file]}${rank}`]=token as Piece;file++} } return board }
export function seededPosition(seed: number) { const board=emptyBoard(); const back: Piece[]=['r','n','b','q','k','b','n','r']; files.forEach((f,i)=>{board[`${f}8`]=back[i];board[`${f}7`]='p';board[`${f}2`]='P';board[`${f}1`]=back[i].toUpperCase() as Piece}); let x=seed||1; for(let i=0;i<8;i++){ x=(x*1664525+1013904223)>>>0; if(x%3===0){const from=`${files[x%8]}${x%2?2:7}`,to=`${files[(x>>>3)%8]}${x%2?3:6}`;board[to]=board[from];board[from]=null}} return board }
