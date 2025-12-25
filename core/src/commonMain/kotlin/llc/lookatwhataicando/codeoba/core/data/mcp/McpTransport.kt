package llc.lookatwhataicando.codeoba.core.data.mcp

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.*
import llc.lookatwhataicando.codeoba.core.domain.Logger
import llc.lookatwhataicando.codeoba.core.log
import kotlin.random.Random

/**
 * HTTP transport layer for MCP communication.
 * Handles JSON-RPC request/response serialization and HTTP communication.
 */
class McpTransport(
    private val serverUrl: String,
    private val authToken: String,
    private val logger: Logger
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        prettyPrint = false
    }
    
    private val client = HttpClient {
        install(ContentNegotiation) {
            json(json)
        }
    }
    
    /**
     * Send a JSON-RPC request to the MCP server.
     */
    suspend fun sendRequest(method: String, params: JsonObject? = null): JsonRpcResponse {
        val requestId = generateRequestId()
        val request = JsonRpcRequest(
            method = method,
            params = params,
            id = requestId
        )
        
        logger.log("MCP Transport", "Sending request: method=$method, id=$requestId")
        
        return try {
            val response: HttpResponse = client.post(serverUrl) {
                contentType(ContentType.Application.Json)
                header("Authorization", "Bearer $authToken")
                setBody(json.encodeToString(JsonRpcRequest.serializer(), request))
            }
            
            val responseText = response.bodyAsText()
            logger.log("MCP Transport", "Received response: status=${response.status}, body length=${responseText.length}")
            
            val jsonResponse = json.decodeFromString(JsonRpcResponse.serializer(), responseText)
            
            if (jsonResponse.error != null) {
                logger.log("MCP Transport", "Error in response: ${jsonResponse.error.message}")
            }
            
            jsonResponse
        } catch (e: Exception) {
            logger.log("MCP Transport", "Request failed: ${e.message}")
            throw McpTransportException("Failed to send MCP request: ${e.message}", e)
        }
    }
    
    /**
     * Generate a unique request ID for JSON-RPC.
     * Uses a simple random hex string for multiplatform compatibility.
     */
    private fun generateRequestId(): String {
        val bytes = Random.nextBytes(16)
        return bytes.joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Close the HTTP client.
     */
    fun close() {
        client.close()
    }
}

/**
 * Exception thrown when MCP transport fails.
 */
class McpTransportException(message: String, cause: Throwable? = null) : Exception(message, cause)
