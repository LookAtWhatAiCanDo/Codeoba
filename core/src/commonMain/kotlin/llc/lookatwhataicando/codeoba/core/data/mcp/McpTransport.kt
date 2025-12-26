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
        
        logger.d("MCP Transport", "Sending request: method=$method, id=$requestId")
        
        return try {
            val response: HttpResponse = client.post(serverUrl) {
                contentType(ContentType.Application.Json)
                // GitHub MCP server requires both content types in Accept header
                header("Accept", "application/json, text/event-stream")
                header("Authorization", "Bearer $authToken")
                setBody(json.encodeToString(JsonRpcRequest.serializer(), request))
            }
            
            val responseText = response.bodyAsText()
            logger.d("MCP Transport", "Received response: status=${response.status}, body length=${responseText.length}")
            
            // Log first 500 chars of response for debugging
            val preview = if (responseText.length > 500) {
                responseText.take(500) + "... (truncated)"
            } else {
                responseText
            }
            logger.d("MCP Transport", "Response preview: $preview")
            
            // Parse response - could be plain JSON or SSE format
            val jsonResponse = parseResponse(responseText)
            
            if (jsonResponse.error != null) {
                logger.w("MCP Transport", "Error in response: ${jsonResponse.error.message}")
            }
            
            jsonResponse
        } catch (e: Exception) {
            logger.e("MCP Transport", "Request failed: ${e.message}", e)
            throw McpTransportException("Failed to send MCP request: ${e.message}", e)
        }
    }
    
    /**
     * Parse response which may be plain JSON or SSE (Server-Sent Events) format.
     * SSE format looks like:
     * ```
     * event: message
     * data: {"jsonrpc":"2.0",...}
     * ```
     */
    private fun parseResponse(responseText: String): JsonRpcResponse {
        // Check if response is SSE format (starts with "event:" or "data:")
        val trimmed = responseText.trim()
        if (trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
            logger.d("MCP Transport", "Parsing SSE format response")
            return parseSseResponse(responseText)
        }
        
        // Plain JSON response
        logger.d("MCP Transport", "Parsing plain JSON response")
        return json.decodeFromString(JsonRpcResponse.serializer(), responseText)
    }
    
    /**
     * Parse Server-Sent Events (SSE) format response.
     * Extracts JSON from "data:" lines.
     */
    private fun parseSseResponse(sseText: String): JsonRpcResponse {
        val lines = sseText.lines()
        val dataLines = lines.filter { it.startsWith("data:") }
        
        if (dataLines.isEmpty()) {
            throw McpTransportException("No data lines found in SSE response")
        }
        
        // Extract JSON from data lines (remove "data: " prefix)
        val jsonText = dataLines.joinToString("") { line ->
            line.removePrefix("data:").trim()
        }
        
        logger.d("MCP Transport", "Extracted JSON from SSE: ${jsonText.take(200)}...")
        return json.decodeFromString(JsonRpcResponse.serializer(), jsonText)
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
