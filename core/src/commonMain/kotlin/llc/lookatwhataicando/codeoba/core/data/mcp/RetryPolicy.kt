package llc.lookatwhataicando.codeoba.core.data.mcp

import kotlinx.coroutines.delay

/**
 * Retry policy for transient failures in GitHub API calls
 */
object RetryPolicy {
    
    /**
     * Execute an operation with retry logic for transient failures
     * @param maxAttempts Maximum number of attempts (default: 3)
     * @param initialDelayMs Initial delay between retries in milliseconds (default: 1000)
     * @param maxDelayMs Maximum delay between retries in milliseconds (default: 10000)
     * @param factor Exponential backoff factor (default: 2.0)
     * @param retryOn Predicate to determine if error is retryable (default: retries on 5xx and network errors)
     * @param operation The operation to execute
     * @return Result of the operation
     */
    suspend fun <T> executeWithRetry(
        maxAttempts: Int = 3,
        initialDelayMs: Long = 1000,
        maxDelayMs: Long = 10000,
        factor: Double = 2.0,
        retryOn: (Exception) -> Boolean = ::isRetryableError,
        operation: suspend () -> GitHubApiResult<T>
    ): GitHubApiResult<T> {
        var currentDelay = initialDelayMs
        var lastError: Exception? = null
        
        repeat(maxAttempts) { attempt ->
            try {
                val result = operation()
                
                // Check if result is an error that should be retried
                if (result is GitHubApiResult.Error) {
                    val shouldRetry = isRetryableHttpError(result.code)
                    
                    if (shouldRetry && attempt < maxAttempts - 1) {
                        delay(currentDelay)
                        currentDelay = (currentDelay * factor).toLong().coerceAtMost(maxDelayMs)
                        return@repeat
                    }
                }
                
                return result
            } catch (e: Exception) {
                lastError = e
                
                if (retryOn(e) && attempt < maxAttempts - 1) {
                    delay(currentDelay)
                    currentDelay = (currentDelay * factor).toLong().coerceAtMost(maxDelayMs)
                } else {
                    throw e
                }
            }
        }
        
        // If we exhausted all retries, throw the last error
        throw lastError ?: Exception("Operation failed after $maxAttempts attempts")
    }
    
    /**
     * Check if an exception is retryable
     */
    private fun isRetryableError(e: Exception): Boolean {
        val message = e.message?.lowercase() ?: ""
        
        return when {
            // Network errors
            message.contains("timeout") -> true
            message.contains("connection") -> true
            message.contains("socket") -> true
            message.contains("network") -> true
            
            // Other transient errors
            message.contains("rate limit") -> true
            message.contains("too many requests") -> true
            
            else -> false
        }
    }
    
    /**
     * Check if HTTP status code is retryable
     */
    private fun isRetryableHttpError(code: Int): Boolean {
        return when (code) {
            // 429 - Too Many Requests (rate limit)
            429 -> true
            
            // 5xx - Server errors
            in 500..599 -> true
            
            // 408 - Request Timeout
            408 -> true
            
            // Other codes are not retryable
            else -> false
        }
    }
}

/**
 * Extension function to add retry logic to GitHub API operations
 */
suspend fun <T> GitHubApiClient.withRetry(
    operation: suspend GitHubApiClient.() -> GitHubApiResult<T>
): GitHubApiResult<T> {
    return RetryPolicy.executeWithRetry {
        operation()
    }
}
