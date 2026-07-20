/*
 * ch15_http / Ch15Http.kt
 *
 * Ktor HTTP client. The KMP-friendly HTTP client that works on every
 * target. The mental model:
 *
 *   - The client is a Ktor `HttpClient` configured with a *engine*
 *     (CIO on JVM, OkHttp on Android, Darwin on iOS, OkHttp on JS
 *     via the browser fetch API).
 *   - The client is configured with *plugins* (content negotiation,
 *     logging, auth, retry, etc.).
 *   - Requests are typed; responses are decoded via content
 *     negotiation if a `ContentNegotiation` plugin is installed.
 *
 * Topics:
 *  1. The `HttpClient` and the engine choice
 *  2. `HttpRequest` / `HttpResponse` shapes
 *  3. `install(ContentNegotiation) { json() }` for typed responses
 *  4. Headers, query parameters, and body builders
 *  5. Error handling: status codes, exceptions, `expectSuccess`
 *  6. The `MockEngine` for tests
 *  7. The "retry" pattern with `exponentialDelay`
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch15_http

import ch10_serialization.User
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.client.plugins.HttpRequestRetry
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.HttpRequestBuilder
import kotlinx.coroutines.runBlocking
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlinx.serialization.Serializable

// ---------------------------------------------------------------------------
// 1. The HttpClient and the engine choice
// ---------------------------------------------------------------------------
// The client is configured with an engine. The actual engine lives
// in a leaf source set: `jvmMain` uses CIO, `androidMain` uses OkHttp,
// `iosMain` uses Darwin, `jsMain` uses the JS engine. This file
// declares the *contract* of the engine; the engine itself is
// provided by the leaf set.

expect fun platformEngine(): HttpClientEngine

fun newClient(): HttpClient = HttpClient(platformEngine()) {
    install(ContentNegotiation) {
        json(Json {
            ignoreUnknownKeys = true
            isLenient = true
        })
    }
    install(HttpTimeout) {
        requestTimeoutMillis = 30_000
        connectTimeoutMillis = 10_000
        socketTimeoutMillis = 30_000
    }
    install(HttpRequestRetry) {
        maxRetries = 3
        exponentialDelay()
    }
    defaultRequest {
        header(HttpHeaders.UserAgent, "kmp-learning/1.0")
    }
    expectSuccess = true
}

// ---------------------------------------------------------------------------
// 2. Typed requests
// ---------------------------------------------------------------------------

@Serializable
data class NewUser(val name: String, val email: String)

@Serializable
data class UserList(val items: List<User>)

suspend fun HttpClient.listUsers(): UserList =
    get("/users").body()

suspend fun HttpClient.getUser(id: Long): User =
    get("/users/$id").body()

suspend fun HttpClient.createUser(name: String, email: String): User =
    post("/users") {
        contentType(ContentType.Application.Json)
        setBody(NewUser(name, email))
    }.body()

suspend fun HttpClient.deleteUser(id: Long): HttpResponse =
    delete("/users/$id")

// ---------------------------------------------------------------------------
// 3. Query parameters and headers
// ---------------------------------------------------------------------------

suspend fun HttpClient.searchUsers(query: String, page: Int = 1): UserList =
    get("/users/search") {
        parameter("q", query)
        parameter("page", page)
        header("X-Trace-Id", "trace-1")
    }.body()

// ---------------------------------------------------------------------------
// 4. Error handling
// ---------------------------------------------------------------------------
// With `expectSuccess = true`, non-2xx responses throw
// `ClientRequestException` (4xx) or `ServerResponseException` (5xx).
// Catch them and map to a domain error.

suspend fun HttpClient.getUserOrNull(id: Long): User? = try {
    getUser(id)
} catch (e: io.ktor.client.plugins.ClientRequestException) {
    null
} catch (e: io.ktor.client.plugins.ServerResponseException) {
    null
}

// ---------------------------------------------------------------------------
// 5. The MockEngine for tests
// ---------------------------------------------------------------------------

fun mockClient(handler: io.ktor.client.engine.mock.MockRequestHandler): HttpClient =
    HttpClient(MockEngine { handler(this) }) {
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
        expectSuccess = true
    }

// ---------------------------------------------------------------------------
// 6. The "raw" response path
// ---------------------------------------------------------------------------

suspend fun HttpClient.healthText(): String = get("/health").bodyAsText()

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

fun tour(client: HttpClient): List<String> = runBlocking {
    val items = mutableListOf<String>()
    items += client.listUsers().items.size.toString()
    val ada = client.getUser(1)
    items += ada.name
    val created = client.createUser("Grace", "grace@example.com")
    items += created.name
    items += client.getUserOrNull(99)?.name ?: "no-user"
    items += client.searchUsers("ada").items.size.toString()
    items += client.healthText()
    items
}

