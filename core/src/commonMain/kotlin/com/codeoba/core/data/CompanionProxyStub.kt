package com.codeoba.core.data

import com.codeoba.core.domain.CompanionCommand
import com.codeoba.core.domain.CompanionNotification
import com.codeoba.core.domain.CompanionProxy
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/**
 * Stub implementation of CompanionProxy for MVP.
 * No-op implementation - future WearOS/watchOS support will be added later.
 */
class CompanionProxyStub : CompanionProxy {
    override val notifications: Flow<CompanionNotification> = emptyFlow()
    
    override suspend fun sendCommand(command: CompanionCommand) {
        // No-op for MVP
    }
}
