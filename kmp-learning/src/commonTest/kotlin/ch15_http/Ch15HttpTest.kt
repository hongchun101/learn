package ch15_http

import ch10_serialization.User
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.client.engine.mock.respondOk
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteReadChannel
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class Ch15HttpTest {

    private fun jsonBody(value: String) = ByteReadChannel(value)
    private val json = Json { ignoreUnknownKeys = true }

    // --- Mock client that returns a list of users ------------------------

    @Test fun `listUsers decodes the body into a UserList`() = runTest {
        val client = mockClient { request ->
            assertEquals("/users", request.url.encodedPath)
            respond(
                content = jsonBody("""{"items":[{"id":1,"name":"Ada","email":"ada@example.com"}]}"""),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val out = client.listUsers()
        assertEquals(1, out.items.size)
        assertEquals("Ada", out.items[0].name)
    }

    // --- getUser / getUserOrNull ----------------------------------------

    @Test fun `getUserOrNull returns null on 404`() = runTest {
        val client = mockClient { request ->
            assertTrue(request.url.encodedPath.startsWith("/users/"))
            respondError(HttpStatusCode.NotFound)
        }
        val u = client.getUserOrNull(99)
        assertNull(u)
    }

    @Test fun `getUserOrNull returns the user on 200`() = runTest {
        val client = mockClient { request ->
            respond(
                content = jsonBody("""{"id":7,"name":"Grace","email":"grace@example.com"}"""),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val u = client.getUserOrNull(7)
        assertNotNull(u)
        assertEquals("Grace", u.name)
    }

    // --- createUser -------------------------------------------------------

    @Test fun `createUser posts JSON and decodes the response`() = runTest {
        val client = mockClient { request ->
            assertEquals(HttpMethod.Post, request.method)
            assertTrue(request.headers.contains(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
            respond(
                content = jsonBody("""{"id":2,"name":"Grace","email":"grace@example.com"}"""),
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val created = client.createUser("Grace", "grace@example.com")
        assertEquals("Grace", created.name)
    }

    // --- searchUsers ------------------------------------------------------

    @Test fun `searchUsers includes query parameters`() = runTest {
        val client = mockClient { request ->
            val q = request.url.parameters["q"]
            val page = request.url.parameters["page"]
            assertEquals("ada", q)
            assertEquals("1", page)
            respond(
                content = jsonBody("""{"items":[]}"""),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
            )
        }
        val out = client.searchUsers("ada", page = 1)
        assertEquals(0, out.items.size)
    }

    // --- healthText -------------------------------------------------------

    @Test fun `healthText returns the raw text body`() = runTest {
        val client = mockClient { _ ->
            respondOk(content = "OK")
        }
        assertEquals("OK", client.healthText())
    }

    // --- Tour -------------------------------------------------------------

    @Test fun `tour wires a multi-step scenario`() = runTest {
        var step = 0
        val client = mockClient { request ->
            when {
                request.url.encodedPath == "/users" && request.method == HttpMethod.Get -> {
                    step += 1
                    respond(
                        content = jsonBody("""{"items":[{"id":1,"name":"Ada","email":"ada@example.com"}]}"""),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }
                request.url.encodedPath == "/users/1" -> {
                    step += 1
                    respond(
                        content = jsonBody("""{"id":1,"name":"Ada","email":"ada@example.com"}"""),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }
                request.url.encodedPath == "/users" && request.method == HttpMethod.Post -> {
                    step += 1
                    respond(
                        content = jsonBody("""{"id":2,"name":"Grace","email":"grace@example.com"}"""),
                        status = HttpStatusCode.Created,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }
                request.url.encodedPath == "/users/99" -> {
                    step += 1
                    respondError(HttpStatusCode.NotFound)
                }
                request.url.encodedPath == "/users/search" -> {
                    step += 1
                    respond(
                        content = jsonBody("""{"items":[]}"""),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                    )
                }
                request.url.encodedPath == "/health" -> {
                    step += 1
                    respondOk(content = "OK")
                }
                else -> respondError(HttpStatusCode.NotFound)
            }
        }
        val items = tour(client)
        assertEquals(6, items.size)
        assertEquals("1", items[0])     // users count
        assertEquals("Ada", items[1])   // first user name
        assertEquals("Grace", items[2]) // created
        assertEquals("no-user", items[3]) // 99 -> null -> "no-user"
        assertEquals("0", items[4])     // search empty
        assertEquals("OK", items[5])    // health
        assertTrue(step >= 6, "expected at least 6 mock calls, got $step")
    }
}
