package com.chessvision.vision

import android.graphics.Bitmap
import org.opencv.android.Utils
import org.opencv.core.Mat
import org.opencv.core.MatOfPoint
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc

/**
 * Detects a chessboard in an image and returns a warped, squared crop of the board
 * using perspective transform. Assumes a clear 8x8 board with visible edges.
 */
class BoardDetector {

    /**
     * Find the board quadrilateral and warp to a square image.
     * @param bitmap Input photo (any orientation)
     * @param outputSize Width/height of the output square (e.g. 400)
     * @return Warped bitmap of the board, or null if detection fails
     */
    fun detectAndWarp(bitmap: Bitmap, outputSize: Int = 400): Bitmap? {
        val mat = Mat()
        Utils.bitmapToMat(bitmap, mat)
        val gray = Mat()
        if (mat.channels() == 4) Imgproc.cvtColor(mat, gray, Imgproc.COLOR_RGBA2GRAY)
        else Imgproc.cvtColor(mat, gray, Imgproc.COLOR_RGB2GRAY)
        val corners = findBoardCorners(gray) ?: run {
            mat.release()
            gray.release()
            return null
        }
        val dstPoints = listOf(
            Point(0.0, 0.0),
            Point(outputSize.toDouble(), 0.0),
            Point(outputSize.toDouble(), outputSize.toDouble()),
            Point(0.0, outputSize.toDouble())
        )
        val srcMat = MatOfPoint2f(*corners.toTypedArray())
        val dstMat = MatOfPoint2f(*dstPoints.toTypedArray())
        val transform = Imgproc.getPerspectiveTransform(srcMat, dstMat)
        val warped = Mat()
        Imgproc.warpPerspective(mat, warped, transform, Size(outputSize.toDouble(), outputSize.toDouble()))
        val result = Bitmap.createBitmap(outputSize, outputSize, Bitmap.Config.ARGB_8888)
        Utils.matToBitmap(warped, result)
        mat.release()
        gray.release()
        srcMat.release()
        dstMat.release()
        transform.release()
        warped.release()
        return result
    }

    /**
     * Find four corners of the board using edge detection and contour approximation.
     * Returns corners in order: top-left, top-right, bottom-right, bottom-left.
     */
    private fun findBoardCorners(gray: Mat): List<Point>? {
        val blurred = Mat()
        Imgproc.GaussianBlur(gray, blurred, Size(5.0, 5.0), 0.0)
        val edges = Mat()
        Imgproc.Canny(blurred, edges, 50.0, 150.0)
        val contours = ArrayList<MatOfPoint>()
        val hierarchy = Mat()
        Imgproc.findContours(edges, contours, hierarchy, Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_SIMPLE)
        blurred.release()
        edges.release()
        hierarchy.release()
        val minArea = gray.rows() * gray.cols() * 0.2
        val candidates = contours
            .filter { Imgproc.contourArea(it) >= minArea }
            .sortedByDescending { Imgproc.contourArea(it) }
            .take(5)
        try {
            for (cnt in candidates) {
                val cnt2f = MatOfPoint2f(*cnt.toArray())
                val approx = MatOfPoint2f()
                val eps = 0.02 * Imgproc.arcLength(cnt2f, true)
                Imgproc.approxPolyDP(cnt2f, approx, eps, true)
                val points = approx.toArray().toList()
                if (points.size == 4) {
                    approx.release()
                    return orderPoints(points)
                }
                approx.release()
            }
            return null
        } finally {
            contours.forEach { it.release() }
        }
    }

    private fun orderPoints(pts: List<Point>): List<Point> {
        val center = Point(
            pts.map { it.x }.average(),
            pts.map { it.y }.average()
        )
        val top = pts.sortedBy { it.y }.take(2)
        val bottom = pts.sortedByDescending { it.y }.take(2)
        val topLeft = top.minByOrNull { it.x }!!
        val topRight = top.maxByOrNull { it.x }!!
        val bottomRight = bottom.maxByOrNull { it.x }!!
        val bottomLeft = bottom.minByOrNull { it.x }!!
        return listOf(topLeft, topRight, bottomRight, bottomLeft)
    }
}
