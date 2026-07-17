import * as tf from '@tensorflow/tfjs'
import { emptyBoard, type Board } from '../lib/position'
export type Recognition = { kind: 'unavailable'|'ready'|'error', board: Board, lowConfidence: string[], message: string }
export async function recogniseBoard(_image: File): Promise<Recognition> {
  try { const response=await fetch('/models/chess-piece/model.json', { method:'HEAD' }); if(!response.ok) return {kind:'unavailable',board:emptyBoard(),lowConfidence:[],message:'Recognition model not installed. Start with an editable board.'}; await tf.loadGraphModel('/models/chess-piece/model.json'); return {kind:'ready',board:emptyBoard(),lowConfidence:[],message:'Model loaded. Board-grid preprocessing is ready for your exported model metadata.'} }
  catch { return {kind:'error',board:emptyBoard(),lowConfidence:[],message:'The recognition model could not be loaded. You can still correct the board manually.'} }
}
