package llc.lookatwhataicando.codeoba.core.data.mcp

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.random.Random

/**
 * Manages approval requests for sensitive MCP operations
 */
class ApprovalManager {
    
    private val _approvalRequests = MutableSharedFlow<ApprovalRequest>(replay = 0, extraBufferCapacity = 10)
    val approvalRequests: SharedFlow<ApprovalRequest> = _approvalRequests.asSharedFlow()
    
    private val pendingApprovals = mutableMapOf<String, ApprovalState>()
    private val mutex = Mutex()
    
    /**
     * Request approval for a sensitive operation
     * @return Approval request ID
     */
    suspend fun requestApproval(
        toolName: String,
        arguments: String,
        requiresApproval: Boolean = true
    ): String {
        if (!requiresApproval) {
            // Auto-approve for non-sensitive operations
            return "auto-approved"
        }
        
        // Generate random ID using multiplatform-compatible approach
        val requestId = generateRequestId()
        
        mutex.withLock {
            pendingApprovals[requestId] = ApprovalState.Pending
        }
        
        _approvalRequests.emit(
            ApprovalRequest(
                requestId = requestId,
                toolName = toolName,
                arguments = arguments
            )
        )
        
        return requestId
    }
    
    /**
     * Generate a unique request ID using multiplatform-compatible approach
     */
    private fun generateRequestId(): String {
        val timestamp = System.currentTimeMillis()
        val random = Random.nextInt(100000, 999999)
        return "approval-$timestamp-$random"
    }
    
    /**
     * Wait for approval response
     * @return True if approved, false if denied
     */
    suspend fun waitForApproval(requestId: String, timeoutMs: Long = 30000): ApprovalResult {
        if (requestId == "auto-approved") {
            return ApprovalResult.Approved
        }
        
        val startTime = System.currentTimeMillis()
        
        while (System.currentTimeMillis() - startTime < timeoutMs) {
            val state = mutex.withLock {
                pendingApprovals[requestId]
            }
            
            when (state) {
                is ApprovalState.Approved -> {
                    mutex.withLock {
                        pendingApprovals.remove(requestId)
                    }
                    return ApprovalResult.Approved
                }
                is ApprovalState.Denied -> {
                    val reason = state.reason
                    mutex.withLock {
                        pendingApprovals.remove(requestId)
                    }
                    return ApprovalResult.Denied(reason)
                }
                ApprovalState.Pending, null -> {
                    kotlinx.coroutines.delay(100)
                }
            }
        }
        
        mutex.withLock {
            pendingApprovals.remove(requestId)
        }
        
        return ApprovalResult.Timeout
    }
    
    /**
     * Respond to an approval request
     */
    suspend fun respondToApproval(requestId: String, approve: Boolean, reason: String? = null) {
        mutex.withLock {
            if (pendingApprovals.containsKey(requestId)) {
                pendingApprovals[requestId] = if (approve) {
                    ApprovalState.Approved
                } else {
                    ApprovalState.Denied(reason ?: "Denied by user")
                }
            }
        }
    }
}

data class ApprovalRequest(
    val requestId: String,
    val toolName: String,
    val arguments: String
)

sealed class ApprovalState {
    object Pending : ApprovalState()
    object Approved : ApprovalState()
    data class Denied(val reason: String) : ApprovalState()
}

sealed class ApprovalResult {
    object Approved : ApprovalResult()
    data class Denied(val reason: String) : ApprovalResult()
    object Timeout : ApprovalResult()
}

/**
 * Determines which operations require approval
 */
object ApprovalPolicy {
    
    /**
     * Check if a tool operation requires user approval
     */
    fun requiresApproval(toolName: String): Boolean {
        return when (toolName) {
            "create_file" -> true
            "edit_file" -> true
            "create_branch" -> true
            "create_pr" -> true
            "open_repo" -> false // Read-only operation
            else -> true // Default to requiring approval for unknown tools
        }
    }
}
