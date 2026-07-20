/*
 * ch10_serialization / Ch10Serialization.kt
 *
 * kotlinx-serialization. The KMP-friendly JSON encoder/decoder that
 * works on every target without reflection. The key idea: the
 * `@Serializable` annotation generates the encoder at compile time,
 * so the runtime footprint is tiny and the behaviour is identical
 * across JVM, iOS, JS, and Native.
 *
 * Topics:
 *  1. @Serializable + Json.encodeToString / decodeFromString
 *  2. Built-in support for primitives, lists, maps, sealed types
 *  3. Custom field names: @SerialName
 *  4. Optional fields with default values
 *  5. Polymorphic types with sealed classes
 *  6. Custom serializers
 *  7. Json configuration: ignoreUnknownKeys, prettyPrint, encodeDefaults
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch10_serialization

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// ---------------------------------------------------------------------------
// 1. The default JSON
// ---------------------------------------------------------------------------
// `Json` is the default format. `encodeToString` and
// `decodeFromString` are the two main entry points.

@Serializable
data class User(val id: Long, val name: String, val email: String)

val json = Json {
    prettyPrint = false
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = false
}

fun encodeUser(u: User): String = json.encodeToString(u)

fun decodeUser(s: String): User = json.decodeFromString(s)

// ---------------------------------------------------------------------------
// 2. @SerialName — rename a field for the wire format
// ---------------------------------------------------------------------------

@Serializable
data class ApiUser(
    val id: Long,
    @SerialName("display_name") val displayName: String,
    @SerialName("e_mail") val email: String,
)

// ---------------------------------------------------------------------------
// 3. Default values and optional fields
// ---------------------------------------------------------------------------

@Serializable
data class Settings(
    val theme: String = "system",
    val notifications: Boolean = true,
    val maxItems: Int = 50,
)

// ---------------------------------------------------------------------------
// 4. Sealed polymorphism
// ---------------------------------------------------------------------------
// `Json` decodes a sealed hierarchy when each subclass is annotated
// `@Serializable` and the field is `Polymorphic` or uses the
// `SerializersModule` polymorphism.

@Serializable
sealed class ApiResponse {
    @Serializable
    @SerialName("ok")
    data class Ok(val data: String) : ApiResponse()

    @Serializable
    @SerialName("err")
    data class Error(val code: Int, val message: String) : ApiResponse()
}

@Serializable
data class ApiEnvelope(
    val status: Int,
    val body: ApiResponse,
)

// ---------------------------------------------------------------------------
// 5. Lists, maps, nullable
// ---------------------------------------------------------------------------

@Serializable
data class Page(
    val items: List<String>,
    val meta: Map<String, String>,
    val cursor: String?,
)

// ---------------------------------------------------------------------------
// 6. Custom serializer
// ---------------------------------------------------------------------------
// A `KSerializer<T>` is the type of a serializer. Implement it
// manually when the built-in ones don't fit. The standard library
// ships `PrimitiveSerializers`, `ListSerializer`, `MapSerializer`,
// `SealedClassSerializer`, etc.

@Serializable
@SerialName("Money")
data class Money(val amount: Long, val currency: String)

// ---------------------------------------------------------------------------
// 7. Building JSON by hand
// ---------------------------------------------------------------------------

fun handBuilt(): JsonObject = buildJsonObject {
    put("kind", "search")
    put("q", "kotlin multiplatform")
    put("limit", 10)
}

// ---------------------------------------------------------------------------
// 8. Encoding a round-trip
// ---------------------------------------------------------------------------

data class RoundTrip<T>(val original: T, val encoded: String, val decoded: T)

fun <T> roundTrip(value: T, serializer: kotlinx.serialization.KSerializer<T>): RoundTrip<T> {
    val encoded = json.encodeToString(serializer, value)
    val decoded = json.decodeFromString(serializer, encoded)
    return RoundTrip(value, encoded, decoded)
}

// ---------------------------------------------------------------------------
// 9. The full tour
// ---------------------------------------------------------------------------

fun tour(): List<String> {
    val u = User(1, "Ada", "ada@example.com")
    val encoded = encodeUser(u)
    val decoded = decodeUser(encoded)

    val api = ApiUser(2, "Ada Lovelace", "ada@math.example")
    val apiEnc = json.encodeToString(api)
    val apiDec = json.decodeFromString<ApiUser>(apiEnc)

    val settings = Settings()
    val settingsEnc = json.encodeToString(settings)

    val page = Page(listOf("a", "b"), mapOf("page" to "1"), null)
    val pageEnc = json.encodeToString(page)

    val env = ApiEnvelope(200, ApiResponse.Ok("hello"))
    val envEnc = json.encodeToString(env)
    val envDec = json.decodeFromString<ApiEnvelope>(envEnc)

    val hand = handBuilt().toString()

    val money = Money(100, "USD")
    val moneyEnc = json.encodeToString(money)

    return listOf(
        encoded,
        decoded.toString(),
        apiEnc,
        apiDec.toString(),
        settingsEnc,
        pageEnc,
        envEnc,
        envDec.toString(),
        hand,
        moneyEnc,
    )
}
