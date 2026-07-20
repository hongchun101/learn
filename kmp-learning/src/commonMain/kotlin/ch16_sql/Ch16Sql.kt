/*
 * ch16_sql / Ch16Sql.kt
 *
 * The persistence contract for a KMP module. The lesson:
 *   - Real apps use SQLDelight, Room, or Realm for typed SQL.
 *   - For learning, a simple key-value store implemented via
 *     `expect`/`actual` over a flat file is enough.
 *   - The contract is what matters: a typed query, a typed result, a
 *     transactional boundary.
 *
 * This file shows the contract; the JVM actual is in jvmMain.
 * A real project would replace the file-based store with SQLDelight:
 *   - Define the schema in a `.sq` file.
 *   - The plugin generates typed queries.
 *   - The generated code targets every platform's preferred driver.
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch16_sql

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

// ---------------------------------------------------------------------------
// 1. The schema
// ---------------------------------------------------------------------------

data class TodoItem(
    val id: Long,
    val title: String,
    val done: Boolean,
    val createdAt: Long,
)

// ---------------------------------------------------------------------------
// 2. The repository contract
// ---------------------------------------------------------------------------
// A repository is a typed query interface. The leaf source sets
// provide the implementation; the common code only sees the contract.

interface TodoRepository {
    suspend fun list(): List<TodoItem>
    suspend fun byId(id: Long): TodoItem?
    suspend fun add(title: String): TodoItem
    suspend fun setDone(id: Long, done: Boolean): TodoItem?
    suspend fun delete(id: Long): Boolean
    fun observe(): Flow<List<TodoItem>>
}

// ---------------------------------------------------------------------------
// 3. The in-memory implementation
// ---------------------------------------------------------------------------
// Used in tests and as a fallback when the platform store is not
// available. State is held in a `MutableStateFlow` so `observe()`
// emits whenever the data changes.

class InMemoryTodoRepository : TodoRepository {
    private val state = MutableStateFlow<List<TodoItem>>(emptyList())
    private var nextId = 1L

    override suspend fun list(): List<TodoItem> = state.value

    override suspend fun byId(id: Long): TodoItem? =
        state.value.firstOrNull { it.id == id }

    override suspend fun add(title: String): TodoItem {
        val item = TodoItem(nextId++, title, false, System.currentTimeMillis())
        state.value = state.value + item
        return item
    }

    override suspend fun setDone(id: Long, done: Boolean): TodoItem? {
        val current = state.value
        val idx = current.indexOfFirst { it.id == id }
        if (idx < 0) return null
        val updated = current.toMutableList().also { it[idx] = it[idx].copy(done = done) }
        state.value = updated
        return updated[idx]
    }

    override suspend fun delete(id: Long): Boolean {
        val current = state.value
        val filtered = current.filter { it.id != id }
        if (filtered.size == current.size) return false
        state.value = filtered
        return true
    }

    override fun observe(): Flow<List<TodoItem>> = state.asStateFlow()
}

// ---------------------------------------------------------------------------
// 4. The "SQL-flavored" mental model
// ---------------------------------------------------------------------------
// Even with the in-memory store, the operations are written in a
// SQL-like style so the transition to SQLDelight is one-to-one:
//
//   list()                  -> SELECT * FROM todo
//   byId(id)                -> SELECT * FROM todo WHERE id = ?
//   add(title)              -> INSERT INTO todo (title) VALUES (?)
//   setDone(id, done)       -> UPDATE todo SET done = ? WHERE id = ?
//   delete(id)              -> DELETE FROM todo WHERE id = ?
//   observe()               -> SELECT * FROM todo (Flow, every change)
//
// The contract is the same; the implementation moves from in-memory
// to SQLite without changing the call site.

// ---------------------------------------------------------------------------
// 5. Migrations
// ---------------------------------------------------------------------------
// When the schema changes, write a migration. SQLDelight generates
// them from the schema diff; here we keep the contract but add a
// versioned `Schema` object that the implementation honours.

data class Schema(val version: Int) {
    companion object {
        val V1 = Schema(1)
        val V2 = Schema(2)  // adds a `priority` column
    }
}

interface MigratableRepository : TodoRepository {
    val schema: Schema
    suspend fun migrate(from: Schema, to: Schema)
}

// ---------------------------------------------------------------------------
// 6. Transactional boundary
// ---------------------------------------------------------------------------
// A repository may compose multiple operations into a single
// transaction. The contract makes this explicit.

interface TransactionalRepository : TodoRepository {
    suspend fun <T> transaction(block: suspend (TodoRepository) -> T): T
}

// ---------------------------------------------------------------------------
// 7. The tour
// ---------------------------------------------------------------------------

suspend fun tour(repo: TodoRepository): List<String> {
    val items = mutableListOf<String>()
    items += repo.list().size.toString()
    val a = repo.add("Learn KMP")
    val b = repo.add("Read the docs")
    val c = repo.add("Write a capstone")
    items += a.title
    items += b.title
    items += c.title
    items += repo.list().size.toString()
    repo.setDone(a.id, true)
    items += repo.byId(a.id)?.done.toString()
    repo.delete(b.id)
    items += repo.list().size.toString()
    items += repo.list().map { it.title }.toString()
    return items
}
