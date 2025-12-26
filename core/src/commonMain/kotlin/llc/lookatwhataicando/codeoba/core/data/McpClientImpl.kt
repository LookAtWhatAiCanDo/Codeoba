package llc.lookatwhataicando.codeoba.core.data

import kotlinx.serialization.json.*
import llc.lookatwhataicando.codeoba.core.data.mcp.*
import llc.lookatwhataicando.codeoba.core.domain.Logger
import llc.lookatwhataicando.codeoba.core.domain.McpClient
import llc.lookatwhataicando.codeoba.core.domain.McpResult
import llc.lookatwhataicando.codeoba.core.log

/**
 * Implementation of McpClient that connects to GitHub's MCP server.
 * Uses JSON-RPC 2.0 over HTTP to communicate with the MCP server.
 * 
 * @param githubToken GitHub Personal Access Token or OAuth token
 * @param mcpServerUrl MCP server endpoint URL (defaults to GitHub's MCP server)
 * @param logger Logger instance for debugging
 */
class McpClientImpl(
    private val githubToken: String,
    private val mcpServerUrl: String = "https://api.githubcopilot.com/mcp/",
    private val logger: Logger
) : McpClient {
    
    private lateinit var transport: McpTransport
    private var isInitialized = false
    private val toolsCache = mutableMapOf<String, ToolDefinition>()
    
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    
    /**
     * Initialize connection to the MCP server and discover available tools.
     */
    override suspend fun connect() {
        if (isInitialized) {
            logger.d("MCP Client", "Already initialized")
            return
        }
        
        try {
            transport = McpTransport(mcpServerUrl, githubToken, logger)
            
            // Step 1: Initialize connection with server
            logger.i("MCP Client", "Initializing connection to $mcpServerUrl")
            val initParams = buildJsonObject {
                put("protocolVersion", "2024-11-05")
                put("capabilities", buildJsonObject {})
                put("clientInfo", buildJsonObject {
                    put("name", "Codeoba")
                    put("version", "1.0.0")
                })
            }
            
            val initResponse = transport.sendRequest("initialize", initParams)
            
            if (initResponse.error != null) {
                throw McpClientException("Initialization failed: ${initResponse.error.message}")
            }
            
            logger.i("MCP Client", "Connection initialized successfully")
            
            // Step 2: Discover available tools
            discoverTools()
            
            isInitialized = true
        } catch (e: Exception) {
            logger.e("MCP Client", "Failed to connect: ${e.message}", e)
            throw McpClientException("Failed to connect to MCP server: ${e.message}", e)
        }
    }
    
    /**
     * Discover and cache available tools from the MCP server.
     */
    private suspend fun discoverTools() {
        logger.d("MCP Client", "Discovering available tools")
        
        val response = transport.sendRequest("tools/list")
        
        if (response.error != null) {
            throw McpClientException("Failed to list tools: ${response.error.message}")
        }
        
        val result = response.result ?: throw McpClientException("No result in tools/list response")
        
        try {
            val toolsListResult = json.decodeFromJsonElement<ToolsListResult>(result)
            toolsCache.clear()
            toolsListResult.tools.forEach { tool ->
                toolsCache[tool.name] = tool
                logger.d("MCP Client", "Discovered tool: ${tool.name}")
            }
            logger.i("MCP Client", "Discovered ${toolsCache.size} tools")
        } catch (e: Exception) {
            throw McpClientException("Failed to parse tools list: ${e.message}", e)
        }
    }
    
    /**
     * Execute a tool call via the MCP server.
     */
    override suspend fun handleToolCall(name: String, argsJson: String): McpResult {
        // Ensure we're initialized
        if (!isInitialized) {
            try {
                connect()
            } catch (e: Exception) {
                return McpResult.Failure("MCP client not initialized: ${e.message}")
            }
        }
        
        // Check if tool exists
        if (!toolsCache.containsKey(name)) {
            logger.w("MCP Client", "Unknown tool: $name")
            return McpResult.Failure("Unknown tool: $name. Available tools: ${toolsCache.keys.joinToString()}")
        }
        
        logger.d("MCP Client", "Executing tool: $name with args: $argsJson")
        
        try {
            // Parse arguments JSON
            val arguments = json.parseToJsonElement(argsJson) as? JsonObject
                ?: throw McpClientException(
                    "Expected JSON object for tool arguments, got: ${argsJson.take(100)}${if (argsJson.length > 100) "..." else ""}"
                )
            
            // Build tool call params
            val params = buildJsonObject {
                put("name", name)
                put("arguments", arguments)
            }
            
            // Execute tool call
            val response = transport.sendRequest("tools/call", params)
            
            if (response.error != null) {
                logger.w("MCP Client", "Tool call failed: ${response.error.message}")
                return McpResult.Failure("Tool execution failed: ${response.error.message}")
            }
            
            val result = response.result ?: throw McpClientException("No result in tool call response")
            val toolCallResult = json.decodeFromJsonElement<ToolCallResult>(result)
            
            // Check if tool reported an error
            if (toolCallResult.isError == true) {
                val errorMessage = toolCallResult.content.firstOrNull()?.text 
                    ?: "Tool reported an error"
                logger.w("MCP Client", "Tool returned error: $errorMessage")
                return McpResult.Failure(errorMessage)
            }
            
            // Extract success result
            val summary = toolCallResult.content
                .mapNotNull { it.text }
                .joinToString("\n")
                .ifBlank { "Tool executed successfully" }
            
            logger.i("MCP Client", "Tool executed successfully: $summary")
            return McpResult.Success(summary)
            
        } catch (e: McpTransportException) {
            logger.e("MCP Client", "Transport error: ${e.message}", e)
            return McpResult.Failure("Network error: ${e.message}")
        } catch (e: Exception) {
            logger.e("MCP Client", "Unexpected error: ${e.message}", e)
            return McpResult.Failure("Failed to execute tool: ${e.message}")
        }
    }
    
    /**
     * Close the MCP connection.
     */
    fun disconnect() {
        if (::transport.isInitialized) {
            transport.close()
        }
        isInitialized = false
        toolsCache.clear()
        logger.d("MCP Client", "Disconnected")
    }
}

/**
 * Exception thrown when MCP client operations fail.
 */
class McpClientException(message: String, cause: Throwable? = null) : Exception(message, cause)
