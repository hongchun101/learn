package ch10_serialization

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class Ch10SerializationTest {

    // --- Basic encode/decode ---------------------------------------------

    @Test fun `round-trip preserves data`() {
        val u = User(1, "Ada", "ada@example.com")
        val enc = encodeUser(u)
        assertTrue(enc.contains("\"id\":1"))
        val dec = decodeUser(enc)
        assertEquals(u, dec)
    }

    @Test fun `decode throws on malformed input`() {
        assertFailsWith<kotlinx.serialization.SerializationException> {
            decodeUser("{not valid json")
        }
    }

    // --- @SerialName ----------------------------------------------------

    @Test fun `SerialName rewrites the wire field name`() {
        val api = ApiUser(2, "Ada", "ada@math.example")
        val enc = json.encodeToString(api)
        assertTrue(enc.contains("display_name"))
        assertTrue(enc.contains("e_mail"))
        assertTrue(!enc.contains("displayName"))
        val dec = json.decodeFromString<ApiUser>(enc)
        assertEquals(api, dec)
    }

    // --- Default values --------------------------------------------------

    @Test fun `Settings uses defaults for missing fields`() {
        val dec = json.decodeFromString<Settings>("{}")
        assertEquals(Settings(), dec)
    }

    @Test fun `Settings encodes defaults when encodeDefaults is true`() {
        val enc = json.encodeToString(Settings())
        assertTrue(enc.contains("system"))
    }

    // --- Sealed polymorphism --------------------------------------------

    @Test fun `sealed hierarchy round-trips through polymorphism`() {
        val env = ApiEnvelope(200, ApiResponse.Ok("hello"))
        val enc = json.encodeToString(env)
        assertTrue(enc.contains("\"type\":\"ok\"") || enc.contains("\"type\":\"err\"") || enc.contains("\"status\":200"))
        val dec = json.decodeFromString<ApiEnvelope>(enc)
        assertEquals(env, dec)
    }

    @Test fun `error branch round-trips`() {
        val env = ApiEnvelope(500, ApiResponse.Error(42, "boom"))
        val enc = json.encodeToString(env)
        val dec = json.decodeFromString<ApiEnvelope>(enc)
        assertEquals(env, dec)
    }

    // --- Lists, maps, nullable -----------------------------------------

    @Test fun `Page round-trips with null cursor`() {
        val page = Page(listOf("a", "b"), mapOf("page" to "1"), null)
        val enc = json.encodeToString(page)
        val dec = json.decodeFromString<Page>(enc)
        assertEquals(page, dec)
    }

    // --- Hand-built JSON ------------------------------------------------

    @Test fun `buildJsonObject constructs a JsonObject`() {
        val obj = handBuilt()
        assertEquals("search", obj["kind"]?.toString()?.trim('"'))
        assertEquals("kotlin multiplatform", obj["q"]?.toString()?.trim('"'))
        assertEquals("10", obj["limit"]?.toString())
    }

    // --- ignoreUnknownKeys ----------------------------------------------

    @Test fun `ignoreUnknownKeys allows extra fields`() {
        val extra = """{"theme":"dark","newField":42}"""
        val dec = json.decodeFromString<Settings>(extra)
        assertEquals("dark", dec.theme)
    }

    // --- Money round-trip -----------------------------------------------

    @Test fun `Money round-trips`() {
        val m = Money(100, "USD")
        val enc = json.encodeToString(m)
        val dec = json.decodeFromString<Money>(enc)
        assertEquals(m, dec)
    }

    // --- Tour ------------------------------------------------------------

    @Test fun `tour produces the expected sequence`() {
        val items = tour()
        assertEquals(10, items.size)
        // First two items are the encode and decode of the same User.
        assertTrue(items[0].contains("\"id\":1"))
        assertTrue(items[1].contains("Ada"))
    }
}
