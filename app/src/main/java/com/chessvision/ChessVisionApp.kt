package com.chessvision

import android.app.Application

/**
 * Application class. OpenCV native libraries are loaded by the
 * org.opencv:opencv AAR at runtime. No explicit OpenCVLoader needed
 * for the Maven Central build; if you use the full OpenCV Android SDK
 * you can call OpenCVLoader.initLocal() here.
 */
class ChessVisionApp : Application()
