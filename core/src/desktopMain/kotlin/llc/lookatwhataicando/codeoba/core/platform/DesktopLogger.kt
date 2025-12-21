package llc.lookatwhataicando.codeoba.core.domain

/**
 * Desktop implementation of Logger using println for console output.
 */
class DesktopLogger : Logger {
    override fun v(tag: String, message: String) {
        println("V/$tag: $message")
    }
    
    override fun d(tag: String, message: String) {
        println("D/$tag: $message")
    }
    
    override fun i(tag: String, message: String) {
        println("I/$tag: $message")
    }
    
    override fun w(tag: String, message: String) {
        println("W/$tag: $message")
    }
    
    override fun e(tag: String, message: String, throwable: Throwable?) {
        println("E/$tag: $message")
        throwable?.printStackTrace()
    }
}

/**
 * Platform-specific factory function for Desktop.
 */
actual fun createLogger(): Logger = DesktopLogger()
