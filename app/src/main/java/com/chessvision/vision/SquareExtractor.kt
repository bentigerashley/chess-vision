package com.chessvision.vision

import android.graphics.Bitmap
import android.graphics.Rect

/**
 * Splits a squared board image (from BoardDetector) into 64 square images.
 * Convention: board image has rank 8 at top (row 0), rank 1 at bottom (row 7);
 * file 'a' at left (col 0), file 'h' at right (col 7).
 * Each square is cropped with a small inset to avoid borders.
 */
class SquareExtractor {

    /**
     * Extract 64 square bitmaps in row-major order.
     * Row 0 = 8th rank (black's back rank), Row 7 = 1st rank (white's back rank).
     * Col 0 = a-file, Col 7 = h-file.
     * @param boardBitmap Square bitmap of the full board (e.g. 400x400)
     * @param inset Pixels to trim from each square edge to reduce border noise (default 2)
     */
    fun extractSquares(boardBitmap: Bitmap, inset: Int = 2): List<Bitmap> {
        val w = boardBitmap.width
        val h = boardBitmap.height
        val cellW = w / 8
        val cellH = h / 8
        val list = mutableListOf<Bitmap>()
        for (row in 0 until 8) {
            for (col in 0 until 8) {
                val x = col * cellW + inset
                val y = row * cellH + inset
                val cw = (cellW - 2 * inset).coerceAtLeast(1)
                val ch = (cellH - 2 * inset).coerceAtLeast(1)
                val rect = Rect(x, y, x + cw, y + ch)
                val square = Bitmap.createBitmap(boardBitmap, rect.left, rect.top, rect.width(), rect.height())
                list.add(square)
            }
        }
        return list
    }
}
