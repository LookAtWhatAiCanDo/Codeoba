package llc.lookatwhataicando.codeoba.core.data.mcp

import kotlinx.serialization.Serializable

/**
 * GitHub API client interface for repository operations
 */
interface GitHubApiClient {
    /**
     * Open/clone a repository
     */
    suspend fun openRepository(repoUrl: String, branch: String?): GitHubApiResult<RepositoryInfo>
    
    /**
     * Create a new file in the repository
     */
    suspend fun createFile(
        owner: String,
        repo: String,
        path: String,
        content: String,
        message: String,
        branch: String
    ): GitHubApiResult<FileInfo>
    
    /**
     * Update an existing file in the repository
     */
    suspend fun updateFile(
        owner: String,
        repo: String,
        path: String,
        content: String,
        message: String,
        branch: String,
        sha: String
    ): GitHubApiResult<FileInfo>
    
    /**
     * Get file content and SHA
     */
    suspend fun getFile(
        owner: String,
        repo: String,
        path: String,
        branch: String
    ): GitHubApiResult<FileInfo>
    
    /**
     * Create a new branch
     */
    suspend fun createBranch(
        owner: String,
        repo: String,
        branchName: String,
        fromRef: String
    ): GitHubApiResult<BranchInfo>
    
    /**
     * Create a pull request
     */
    suspend fun createPullRequest(
        owner: String,
        repo: String,
        title: String,
        body: String,
        head: String,
        base: String
    ): GitHubApiResult<PullRequestInfo>
}

/**
 * Result wrapper for GitHub API calls
 */
sealed class GitHubApiResult<out T> {
    data class Success<T>(val data: T) : GitHubApiResult<T>()
    data class Error(val code: Int, val message: String) : GitHubApiResult<Nothing>()
}

/**
 * Data models for GitHub API responses
 */

@Serializable
data class RepositoryInfo(
    val owner: String,
    val repo: String,
    val defaultBranch: String,
    val cloneUrl: String
)

@Serializable
data class FileInfo(
    val path: String,
    val sha: String,
    val content: String? = null
)

@Serializable
data class BranchInfo(
    val name: String,
    val sha: String
)

@Serializable
data class PullRequestInfo(
    val number: Int,
    val title: String,
    val htmlUrl: String
)

/**
 * Helper function to parse GitHub URL
 */
fun parseGitHubUrl(url: String): Pair<String, String>? {
    val regex = Regex("""github\.com[:/]([^/]+)/([^/.]+)(?:\.git)?""")
    val match = regex.find(url) ?: return null
    val owner = match.groupValues[1]
    val repo = match.groupValues[2]
    return owner to repo
}
