package llc.lookatwhataicando.codeoba.core.domain

import android.util.Log

/**
 * Android implementation of Logger using Android's LogCat system.
 */
class AndroidLogger : Logger {
    override fun v(tag: String, message: String) {
        Log.v(tag, message)
    }
    
    override fun d(tag: String, message: String) {
        Log.d(tag, message)
    }
    
    override fun i(tag: String, message: String) {
        Log.i(tag, message)
    }
    
    override fun w(tag: String, message: String) {
        Log.w(tag, message)
    }
    
    override fun e(tag: String, message: String, throwable: Throwable?) {
        if (throwable != null) {
            Log.e(tag, message, throwable)
        } else {
            Log.e(tag, message)
        }
    }
}

/**
 * Platform-specific factory function for Android.
 */
actual fun createLogger(): Logger = AndroidLogger()
