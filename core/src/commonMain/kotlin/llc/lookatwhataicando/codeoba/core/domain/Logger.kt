package llc.lookatwhataicando.codeoba.core.domain

/**
 * Platform-agnostic logging interface.
 * Platform-specific implementations will route to appropriate logging system.
 */
interface Logger {
    /**
     * Log a verbose message.
     * @param tag Identifies the source of a log message
     * @param message The message to log
     */
    fun v(tag: String, message: String)
    
    /**
     * Log a debug message.
     * @param tag Identifies the source of a log message
     * @param message The message to log
     */
    fun d(tag: String, message: String)
    
    /**
     * Log an info message.
     * @param tag Identifies the source of a log message
     * @param message The message to log
     */
    fun i(tag: String, message: String)
    
    /**
     * Log a warning message.
     * @param tag Identifies the source of a log message
     * @param message The message to log
     */
    fun w(tag: String, message: String)
    
    /**
     * Log an error message.
     * @param tag Identifies the source of a log message
     * @param message The message to log
     * @param throwable Optional throwable to log
     */
    fun e(tag: String, message: String, throwable: Throwable? = null)
}

/**
 * Factory function to create platform-specific logger instance.
 * Implemented by each platform.
 */
expect fun createLogger(): Logger
