package llc.lookatwhataicando.codeoba.core.data.mcp

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Data models for MCP tool parameters
 */

@Serializable
data class OpenRepoParams(
    val repoUrl: String,
    val branch: String? = null
)

@Serializable
data class CreateFileParams(
    val path: String,
    val content: String,
    val message: String? = null
)

@Serializable
data class EditFileParams(
    val path: String,
    val content: String,
    val message: String? = null
)

@Serializable
data class CreateBranchParams(
    val branchName: String,
    val fromBranch: String? = null
)

@Serializable
data class CreatePullRequestParams(
    val title: String,
    val body: String,
    val headBranch: String,
    val baseBranch: String = "main"
)

/**
 * MCP tool schema definitions following JSON Schema format
 */
object McpToolSchemas {
    
    fun getOpenRepoSchema(): JsonObject = buildJsonObject {
        put("type", "object")
        putJsonObject("properties") {
            putJsonObject("repoUrl") {
                put("type", "string")
                put("description", "GitHub repository URL (e.g., https://github.com/owner/repo)")
            }
            putJsonObject("branch") {
                put("type", "string")
                put("description", "Optional branch to checkout (defaults to main)")
            }
        }
        put("required", buildJsonArray {
            add(JsonPrimitive("repoUrl"))
        })
    }
    
    fun getCreateFileSchema(): JsonObject = buildJsonObject {
        put("type", "object")
        putJsonObject("properties") {
            putJsonObject("path") {
                put("type", "string")
                put("description", "File path relative to repository root")
            }
            putJsonObject("content") {
                put("type", "string")
                put("description", "File content")
            }
            putJsonObject("message") {
                put("type", "string")
                put("description", "Optional commit message")
            }
        }
        put("required", buildJsonArray {
            add(JsonPrimitive("path"))
            add(JsonPrimitive("content"))
        })
    }
    
    fun getEditFileSchema(): JsonObject = buildJsonObject {
        put("type", "object")
        putJsonObject("properties") {
            putJsonObject("path") {
                put("type", "string")
                put("description", "File path relative to repository root")
            }
            putJsonObject("content") {
                put("type", "string")
                put("description", "New file content")
            }
            putJsonObject("message") {
                put("type", "string")
                put("description", "Optional commit message")
            }
        }
        put("required", buildJsonArray {
            add(JsonPrimitive("path"))
            add(JsonPrimitive("content"))
        })
    }
    
    fun getCreateBranchSchema(): JsonObject = buildJsonObject {
        put("type", "object")
        putJsonObject("properties") {
            putJsonObject("branchName") {
                put("type", "string")
                put("description", "Name of the new branch")
            }
            putJsonObject("fromBranch") {
                put("type", "string")
                put("description", "Optional source branch (defaults to current branch)")
            }
        }
        put("required", buildJsonArray {
            add(JsonPrimitive("branchName"))
        })
    }
    
    fun getCreatePullRequestSchema(): JsonObject = buildJsonObject {
        put("type", "object")
        putJsonObject("properties") {
            putJsonObject("title") {
                put("type", "string")
                put("description", "Pull request title")
            }
            putJsonObject("body") {
                put("type", "string")
                put("description", "Pull request description")
            }
            putJsonObject("headBranch") {
                put("type", "string")
                put("description", "Source branch for the pull request")
            }
            putJsonObject("baseBranch") {
                put("type", "string")
                put("description", "Target branch (defaults to main)")
            }
        }
        put("required", buildJsonArray {
            add(JsonPrimitive("title"))
            add(JsonPrimitive("body"))
            add(JsonPrimitive("headBranch"))
        })
    }
    
    /**
     * Get all tool definitions for MCP server
     */
    fun getAllToolDefinitions(): List<ToolDefinition> = listOf(
        ToolDefinition(
            name = "open_repo",
            description = "Open or clone a GitHub repository",
            inputSchema = getOpenRepoSchema()
        ),
        ToolDefinition(
            name = "create_file",
            description = "Create a new file in the repository",
            inputSchema = getCreateFileSchema()
        ),
        ToolDefinition(
            name = "edit_file",
            description = "Edit an existing file in the repository",
            inputSchema = getEditFileSchema()
        ),
        ToolDefinition(
            name = "create_branch",
            description = "Create a new branch",
            inputSchema = getCreateBranchSchema()
        ),
        ToolDefinition(
            name = "create_pr",
            description = "Create a pull request",
            inputSchema = getCreatePullRequestSchema()
        )
    )
}

@Serializable
data class ToolDefinition(
    val name: String,
    val description: String,
    val inputSchema: JsonObject
)
