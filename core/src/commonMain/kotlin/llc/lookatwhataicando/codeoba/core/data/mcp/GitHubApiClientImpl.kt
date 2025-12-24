package llc.lookatwhataicando.codeoba.core.data.mcp

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

/**
 * Implementation of GitHubApiClient using Ktor HTTP client
 */
class GitHubApiClientImpl(
    private val token: String,
    private val httpClient: HttpClient = createDefaultHttpClient()
) : GitHubApiClient {
    
    companion object {
        private const val GITHUB_API_BASE = "https://api.github.com"
        
        fun createDefaultHttpClient() = HttpClient {
            install(ContentNegotiation) {
                json(Json {
                    ignoreUnknownKeys = true
                    prettyPrint = true
                    isLenient = true
                })
            }
            install(HttpTimeout) {
                requestTimeoutMillis = 30000
                connectTimeoutMillis = 10000
            }
        }
    }
    
    override suspend fun openRepository(repoUrl: String, branch: String?): GitHubApiResult<RepositoryInfo> {
        val (owner, repo) = parseGitHubUrl(repoUrl) 
            ?: return GitHubApiResult.Error(400, "Invalid GitHub URL: $repoUrl")
        
        return try {
            val response = httpClient.get("$GITHUB_API_BASE/repos/$owner/$repo") {
                bearerAuth(token)
                header("Accept", "application/vnd.github+json")
                header("X-GitHub-Api-Version", "2022-11-28")
            }
            
            if (response.status.isSuccess()) {
                val repoData = response.body<GitHubRepository>()
                GitHubApiResult.Success(
                    RepositoryInfo(
                        owner = repoData.owner.login,
                        repo = repoData.name,
                        defaultBranch = branch ?: repoData.defaultBranch,
                        cloneUrl = repoData.cloneUrl
                    )
                )
            } else {
                GitHubApiResult.Error(response.status.value, response.bodyAsText())
            }
        } catch (e: Exception) {
            GitHubApiResult.Error(500, "Failed to open repository: ${e.message}")
        }
    }
    
    @OptIn(ExperimentalEncodingApi::class)
    override suspend fun createFile(
        owner: String,
        repo: String,
        path: String,
        content: String,
        message: String,
        branch: String
    ): GitHubApiResult<FileInfo> {
        return try {
            val encodedContent = Base64.encode(content.encodeToByteArray())
            val response = httpClient.put("$GITHUB_API_BASE/repos/$owner/$repo/contents/$path") {
                bearerAuth(token)
                header("Accept", "application/vnd.github+json")
                header("X-GitHub-Api-Version", "2022-11-28")
                contentType(ContentType.Application.Json)
                setBody(GitHubCreateFileRequest(
                    message = message,
                    content = encodedContent,
                    branch = branch
                ))
            }
            
            if (response.status.isSuccess()) {
                val fileData = response.body<GitHubFileResponse>()
                GitHubApiResult.Success(
                    FileInfo(
                        path = fileData.content.path,
                        sha = fileData.content.sha
                    )
                )
            } else {
                GitHubApiResult.Error(response.status.value, response.bodyAsText())
            }
        } catch (e: Exception) {
            GitHubApiResult.Error(500, "Failed to create file: ${e.message}")
        }
    }
    
    @OptIn(ExperimentalEncodingApi::class)
    override suspend fun updateFile(
        owner: String,
        repo: String,
        path: String,
        content: String,
        message: String,
        branch: String,
        sha: String
    ): GitHubApiResult<FileInfo> {
        return try {
            val encodedContent = Base64.encode(content.encodeToByteArray())
            val response = httpClient.put("$GITHUB_API_BASE/repos/$owner/$repo/contents/$path") {
                bearerAuth(token)
                header("Accept", "application/vnd.github+json")
                header("X-GitHub-Api-Version", "2022-11-28")
                contentType(ContentType.Application.Json)
                setBody(GitHubUpdateFileRequest(
                    message = message,
                    content = encodedContent,
                    sha = sha,
                    branch = branch
                ))
            }
            
            if (response.status.isSuccess()) {
                val fileData = response.body<GitHubFileResponse>()
                GitHubApiResult.Success(
                    FileInfo(
                        path = fileData.content.path,
                        sha = fileData.content.sha
                    )
                )
            } else {
                GitHubApiResult.Error(response.status.value, response.bodyAsText())
            }
        } catch (e: Exception) {
            GitHubApiResult.Error(500, "Failed to update file: ${e.message}")
        }
    }
    
    @OptIn(ExperimentalEncodingApi::class)
    override suspend fun getFile(
        owner: String,
        repo: String,
        path: String,
        branch: String
    ): GitHubApiResult<FileInfo> {
        return try {
            val response = httpClient.get("$GITHUB_API_BASE/repos/$owner/$repo/contents/$path") {
                bearerAuth(token)
                header("Accept", "application/vnd.github+json")
                header("X-GitHub-Api-Version", "2022-11-28")
                parameter("ref", branch)
            }
            
            if (response.status.isSuccess()) {
                val fileData = response.body<GitHubFileContent>()
                val decodedContent = fileData.content?.let { 
                    Base64.decode(it.replace("\n", "")).decodeToString()
                }
                GitHubApiResult.Success(
                    FileInfo(
                        path = fileData.path,
                        sha = fileData.sha,
                        content = decodedContent
                    )
                )
            } else {
                GitHubApiResult.Error(response.status.value, response.bodyAsText())
            }
        } catch (e: Exception) {
            GitHubApiResult.Error(500, "Failed to get file: ${e.message}")
        }
    }
    
    override suspend fun createBranch(
        owner: String,
        repo: String,
        branchName: String,
        fromRef: String
    ): GitHubApiResult<BranchInfo> {
        return try {
            // First, get the SHA of the source ref
            val refResponse = httpClient.get("$GITHUB_API_BASE/repos/$owner/$repo/git/ref/heads/$fromRef") {
                bearerAuth(token)
                header("Accept", "application/vnd.github+json")
                header("X-GitHub-Api-Version", "2022-11-28")
            }
            
            if (!refResponse.status.isSuccess()) {
                return GitHubApiResult.Error(refResponse.status.value, "Source branch not found")
            }
            
            val refData = refResponse.body<GitHubRef>()
            val sha = refData.`object`.sha
            
            // Create the new branch
            val createResponse = httpClient.post("$GITHUB_API_BASE/repos/$owner/$repo/git/refs") {
                bearerAuth(token)
                header("Accept", "application/vnd.github+json")
                header("X-GitHub-Api-Version", "2022-11-28")
                contentType(ContentType.Application.Json)
                setBody(GitHubCreateRefRequest(
                    ref = "refs/heads/$branchName",
                    sha = sha
                ))
            }
            
            if (createResponse.status.isSuccess()) {
                val branchData = createResponse.body<GitHubRef>()
                GitHubApiResult.Success(
                    BranchInfo(
                        name = branchName,
                        sha = branchData.`object`.sha
                    )
                )
            } else {
                GitHubApiResult.Error(createResponse.status.value, createResponse.bodyAsText())
            }
        } catch (e: Exception) {
            GitHubApiResult.Error(500, "Failed to create branch: ${e.message}")
        }
    }
    
    override suspend fun createPullRequest(
        owner: String,
        repo: String,
        title: String,
        body: String,
        head: String,
        base: String
    ): GitHubApiResult<PullRequestInfo> {
        return try {
            val response = httpClient.post("$GITHUB_API_BASE/repos/$owner/$repo/pulls") {
                bearerAuth(token)
                header("Accept", "application/vnd.github+json")
                header("X-GitHub-Api-Version", "2022-11-28")
                contentType(ContentType.Application.Json)
                setBody(GitHubCreatePullRequestRequest(
                    title = title,
                    body = body,
                    head = head,
                    base = base
                ))
            }
            
            if (response.status.isSuccess()) {
                val prData = response.body<GitHubPullRequest>()
                GitHubApiResult.Success(
                    PullRequestInfo(
                        number = prData.number,
                        title = prData.title,
                        htmlUrl = prData.htmlUrl
                    )
                )
            } else {
                GitHubApiResult.Error(response.status.value, response.bodyAsText())
            }
        } catch (e: Exception) {
            GitHubApiResult.Error(500, "Failed to create pull request: ${e.message}")
        }
    }
}

// GitHub API response models
@Serializable
private data class GitHubRepository(
    val name: String,
    val owner: GitHubUser,
    @SerialName("default_branch")
    val defaultBranch: String,
    @SerialName("clone_url")
    val cloneUrl: String
)

@Serializable
private data class GitHubUser(
    val login: String
)

@Serializable
private data class GitHubCreateFileRequest(
    val message: String,
    val content: String,
    val branch: String
)

@Serializable
private data class GitHubUpdateFileRequest(
    val message: String,
    val content: String,
    val sha: String,
    val branch: String
)

@Serializable
private data class GitHubFileResponse(
    val content: GitHubFileContent
)

@Serializable
private data class GitHubFileContent(
    val path: String,
    val sha: String,
    val content: String? = null
)

@Serializable
private data class GitHubRef(
    val ref: String,
    @SerialName("object")
    val `object`: GitHubObject
)

@Serializable
private data class GitHubObject(
    val sha: String
)

@Serializable
private data class GitHubCreateRefRequest(
    val ref: String,
    val sha: String
)

@Serializable
private data class GitHubCreatePullRequestRequest(
    val title: String,
    val body: String,
    val head: String,
    val base: String
)

@Serializable
private data class GitHubPullRequest(
    val number: Int,
    val title: String,
    @SerialName("html_url")
    val htmlUrl: String
)
