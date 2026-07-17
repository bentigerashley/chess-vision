export type Piece = 'P'|'N'|'B'|'R'|'Q'|'K'|'p'|'n'|'b'|'r'|'q'|'k'
export type Board = Record<string, Piece | null>
export const files = ['a','b','c','d','e','f','g','h'] as const
export const ranks = [8,7,6,5,4,3,2,1] as const
export const pieces: Piece[] = ['P','N','B','R','Q','K','p','n','b','r','q','k']
export const pieceGlyph: Record<Piece, string> = { P:'♙',N:'♘',B:'♗',R:'♖',Q:'♕',K:'♔',p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚' }
export const emptyBoard = (): Board => Object.fromEntries(ranks.flatMap(rank => files.map(file => [`${file}${rank}`, null]))) as Board
export function toFen(board: Board, turn: 'w'|'b') { const rows = ranks.map(rank => { let run=0; let row=''; for(const file of files){ const p=board[`${file}${rank}`]; if(p) { if(run) row+=run; run=0; row+=p } else run++ } return row+(run||'') }); return `${rows.join('/')} ${turn} - - 0 1` }
export function validBoard(board: Board) { return (Object.values(board).filter(p=>p==='K').length === 1 && Object.values(board).filter(p=>p==='k').length === 1) }
export function boardFromFen(fen: string): Board { const board=emptyBoard(); let rank=8,file=0; for(const token of fen.split(' ')[0]){ if(token==='/'){rank--;file=0}else if(/\d/.test(token)){file+=Number(token)}else{board[`${files[file]}${rank}`]=token as Piece;file++} } return board }
export function seededPosition(seed: number) { const board=emptyBoard(); const back: Piece[]=['r','n','b','q','k','b','n','r']; files.forEach((f,i)=>{board[`${f}8`]=back[i];board[`${f}7`]='p';board[`${f}2`]='P';board[`${f}1`]=back[i].toUpperCase() as Piece}); let x=seed||1; for(let i=0;i<8;i++){ x=(x*1664525+1013904223)>>>0; if(x%3===0){const from=`${files[x%8]}${x%2?2:7}`,to=`${files[(x>>>3)%8]}${x%2?3:6}`;board[to]=board[from];board[from]=null}} return board }
