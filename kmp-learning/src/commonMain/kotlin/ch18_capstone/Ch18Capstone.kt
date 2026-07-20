/*
 * ch18_capstone / Ch18Capstone.kt
 *
 * A cross-platform TODO app, in `commonMain` only. The "platform"
 * is the boundary: the leaf source set supplies a UI driver
 * (Compose Multiplatform, SwiftUI, etc.) and an entry point
 * (`main()`).
 *
 * What this file shows:
 *   - A domain model (TodoItem, TodoState).
 *   - A use-case layer (AddTodo, ToggleTodo, DeleteTodo).
 *   - A repository with `expect`/`actual` (the persistence contract).
 *   - A ViewModel that ties it all together with StateFlow.
 *   - A "platform glue" entry point that the leaf set implements.
 *
 * The full app would have UI in a leaf set; the demo runs the
 * ViewModel end-to-end and prints the state.
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch18_capstone

import ch16_sql.InMemoryTodoRepository
import ch16_sql.TodoItem
import ch16_sql.TodoRepository
import ch17_architecture.TodoEffect
import ch17_architecture.TodoIntent
import ch17_architecture.TodoState
import ch17_architecture.TodoViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

// ---------------------------------------------------------------------------
// 1. The domain
// ---------------------------------------------------------------------------

data class Todo(
    val id: Long,
    val title: String,
    val done: Boolean,
    val createdAt: Long,
)

// ---------------------------------------------------------------------------
// 2. The repository bridge
// ---------------------------------------------------------------------------
// The leaf set supplies the actual persistence. The common code only
// sees this contract.

interface TodoStore {
    suspend fun list(): List<Todo>
    suspend fun add(title: String): Todo
    suspend fun setDone(id: Long, done: Boolean): Todo?
    suspend fun delete(id: Long): Boolean
    fun observe(): kotlinx.coroutines.flow.Flow<List<Todo>>
}

// ---------------------------------------------------------------------------
// 3. The use cases
// ---------------------------------------------------------------------------

class AddTodoUC(private val store: TodoStore) {
    suspend operator fun invoke(title: String): Result<Todo> = runCatching {
        val trimmed = title.trim()
        require(trimmed.isNotEmpty()) { "title cannot be blank" }
        require(trimmed.length <= 200) { "title too long" }
        store.add(trimmed)
    }
}

class ToggleTodoUC(private val store: TodoStore) {
    suspend operator fun invoke(id: Long, done: Boolean): Result<Todo?> = runCatching {
        store.setDone(id, done)
    }
}

class DeleteTodoUC(private val store: TodoStore) {
    suspend operator fun invoke(id: Long): Result<Boolean> = runCatching {
        store.delete(id)
    }
}

// ---------------------------------------------------------------------------
// 4. The ViewModel
// ---------------------------------------------------------------------------

class TodoScreenViewModel(
    private val scope: CoroutineScope,
    private val addTodo: AddTodoUC,
    private val toggleTodo: ToggleTodoUC,
    private val deleteTodo: DeleteTodoUC,
    private val store: TodoStore,
) {
    private val _state = MutableStateFlow(TodoState())
    val state: StateFlow<TodoState> = _state.asStateFlow()

    private val _effects = MutableSharedFlow<TodoEffect>(
        extraBufferCapacity = 16,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val effects: SharedFlow<TodoEffect> = _effects.asSharedFlow()

    init {
        scope.launch {
            store.observe().collect { items ->
                _state.update { it.copy(items = items, loading = false) }
            }
        }
        _state.update { it.copy(loading = true) }
    }

    fun add(title: String) = scope.launch {
        val r = addTodo(title)
        r.onSuccess { _effects.emit(TodoEffect.ItemAdded(it.title)) }
        r.onFailure { _state.update { s -> s.copy(error = it.message) } }
    }

    fun toggle(id: Long) = scope.launch {
        val current = _state.value.items.firstOrNull { it.id == id }
        val newDone = !(current?.done ?: false)
        toggleTodo(id, newDone)
            .onFailure { _state.update { s -> s.copy(error = it.message) } }
    }

    fun delete(id: Long) = scope.launch {
        deleteTodo(id)
            .onFailure { _state.update { s -> s.copy(error = it.message) } }
    }

    fun close() { scope.cancel() }
}

// ---------------------------------------------------------------------------
// 5. The platform driver (the contract the leaf set fulfils)
// ---------------------------------------------------------------------------

interface PlatformDriver {
    val name: String
    fun showMessage(text: String)
}

// ---------------------------------------------------------------------------
// 6. The wiring helper
// ---------------------------------------------------------------------------

fun buildViewModel(
    scope: CoroutineScope,
    store: TodoStore,
): TodoScreenViewModel = TodoScreenViewModel(
    scope = scope,
    addTodo = AddTodoUC(store),
    toggleTodo = ToggleTodoUC(store),
    deleteTodo = DeleteTodoUC(store),
    store = store,
)

// ---------------------------------------------------------------------------
// 7. A default in-memory store
// ---------------------------------------------------------------------------
// Useful for tests and for the JVM demo. A real app would replace
// this with a SQLDelight-backed store.

class InMemoryTodoStore : TodoStore {
    private val state = MutableStateFlow<List<Todo>>(emptyList())
    private var nextId = 1L

    override suspend fun list(): List<Todo> = state.value

    override suspend fun add(title: String): Todo {
        val todo = Todo(nextId++, title, false, System.currentTimeMillis())
        state.value = state.value + todo
        return todo
    }

    override suspend fun setDone(id: Long, done: Boolean): Todo? {
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

    override fun observe(): kotlinx.coroutines.flow.Flow<List<Todo>> = state.asStateFlow()
}

// ---------------------------------------------------------------------------
// 8. A no-op PlatformDriver for tests
// ---------------------------------------------------------------------------

class NoopDriver : PlatformDriver {
    override val name: String = "noop"
    override fun showMessage(text: String) { /* no-op */ }
}

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

fun tour(): List<String> = runBlocking {
    val scope = CoroutineScope(SupervisorJob() + kotlinx.coroutines.Dispatchers.Default)
    val store = InMemoryTodoStore()
    val vm = buildViewModel(scope, store)
    val driver = NoopDriver()

    val items = mutableListOf<String>()

    delay(20)
    items += "platform: ${driver.name}"
    items += "initial size: ${vm.state.value.items.size}"

    vm.add("Learn KMP")
    vm.add("Read the docs")
    vm.add("Write a capstone")
    delay(50)
    items += "after adds: ${vm.state.value.items.size}"

    val first = vm.state.value.items.firstOrNull()
    if (first != null) vm.toggle(first.id)
    delay(20)
    items += "first done: ${vm.state.value.items.firstOrNull()?.done}"

    val toDelete = vm.state.value.items.firstOrNull()?.id
    if (toDelete != null) vm.delete(toDelete)
    delay(20)
    items += "after delete: ${vm.state.value.items.size}"

    driver.showMessage("tour complete")
    items += "driver got message"

    vm.close()
    items
}
