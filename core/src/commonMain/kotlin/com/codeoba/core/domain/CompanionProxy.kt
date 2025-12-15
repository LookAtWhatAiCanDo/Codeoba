package com.codeoba.core.domain

import kotlinx.coroutines.flow.Flow

/**
 * Interface for companion device communication (WearOS/watchOS).
 * Allows companion devices to proxy mic control and receive notifications.
 * MVP: Stub implementations (no-op) with real implementations coming later.
 */
interface CompanionProxy {
    val notifications: Flow<CompanionNotification>
    
    suspend fun sendCommand(command: CompanionCommand)
}

sealed class CompanionCommand {
    data class ShowStatus(val text: String) : CompanionCommand()
    data class ShowError(val text: String) : CompanionCommand()
    data class ShowRepoEvent(val summary: String) : CompanionCommand()
}

sealed class CompanionNotification {
    data class MicToggleRequest(val fromDeviceId: String) : CompanionNotification()
    data class ConnectRequest(val fromDeviceId: String) : CompanionNotification()
}
