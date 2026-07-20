/*
 * ch17_architecture / Ch17Architecture.kt
 *
 * MVI / MVVM in KMP. The mental model:
 *
 *   - State: the immutable snapshot the UI renders.
 *   - Intent: a user action or external event.
 *   - Effect: a side effect the UI must execute (navigate, toast,
 *     play a sound). One-shot, not part of the state.
 *   - ViewModel: a class that takes Intent -> State, possibly emits
 *     Effects, and is itself dependency-injected.
 *
 * The implementation uses `StateFlow` for state and a
 * `MutableSharedFlow` for effects. The ViewModel is a coroutine
 * scope; the UI launches in it and cancels on `onCleared()`.
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch17_architecture

import ch16_sql.InMemoryTodoRepository
import ch16_sql.TodoItem
import ch16_sql.TodoRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.BufferOverflow
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
// 1. The MVI triad
// ---------------------------------------------------------------------------

sealed interface TodoIntent {
    data class Add(val title: String) : TodoIntent
    data class Toggle(val id: Long) : TodoIntent
    data class Delete(val id: Long) : TodoIntent
    object Refresh : TodoIntent
}

sealed interface TodoEffect {
    data class ShowError(val message: String) : TodoEffect
    data class ItemAdded(val title: String) : TodoEffect
}

data class TodoState(
    val items: List<TodoItem> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)

// ---------------------------------------------------------------------------
// 2. The reducer
// ---------------------------------------------------------------------------
// A pure function from (state, intent) -> state. Effects are
// computed separately; the reducer never has side effects.

fun reduce(state: TodoState, intent: TodoIntent): TodoState = when (intent) {
    is TodoIntent.Add -> state.copy(loading = true, error = null)
    is TodoIntent.Toggle -> state.copy(loading = true)
    is TodoIntent.Delete -> state.copy(loading = true)
    TodoIntent.Refresh -> state.copy(loading = true, error = null)
}

// ---------------------------------------------------------------------------
// 3. The ViewModel
// ---------------------------------------------------------------------------

class TodoViewModel(
    private val scope: CoroutineScope,
    private val repo: TodoRepository,
) {
    private val _state = MutableStateFlow(TodoState())
    val state: StateFlow<TodoState> = _state.asStateFlow()

    private val _effects = MutableSharedFlow<TodoEffect>(extraBufferCapacity = 16)
    val effects: SharedFlow<TodoEffect> = _effects.asSharedFlow()

    init {
        scope.launch { observeRepo() }
        scope.launch { dispatch(TodoIntent.Refresh) }
    }

    private suspend fun observeRepo() {
        repo.observe().collect { items ->
            _state.update { it.copy(items = items) }
        }
    }

    fun dispatch(intent: TodoIntent) {
        scope.launch { handle(intent) }
    }

    private suspend fun handle(intent: TodoIntent) {
        _state.update { reduce(it, intent) }
        try {
            when (intent) {
                is TodoIntent.Add -> {
                    val item = repo.add(intent.title)
                    _effects.emit(TodoEffect.ItemAdded(item.title))
                }
                is TodoIntent.Toggle -> repo.setDone(intent.id, true)
                is TodoIntent.Delete -> repo.delete(intent.id)
                TodoIntent.Refresh -> { /* observe handles it */ }
            }
        } catch (e: Exception) {
            _state.update { it.copy(loading = false, error = e.message) }
            _effects.emit(TodoEffect.ShowError(e.message ?: "unknown"))
            return
        }
        _state.update { it.copy(loading = false) }
    }

    fun close() { scope.cancel() }
}

// ---------------------------------------------------------------------------
// 4. The UseCase pattern
// ---------------------------------------------------------------------------
// A UseCase is a single-purpose business action. Use it for "share
// this code between multiple screens" and "test in isolation".

class AddTodoUseCase(private val repo: TodoRepository) {
    suspend operator fun invoke(title: String): Result<TodoItem> = runCatching {
        require(title.isNotBlank()) { "title cannot be blank" }
        repo.add(title.trim())
    }
}

class ToggleTodoUseCase(private val repo: TodoRepository) {
    suspend operator fun invoke(id: Long): Result<TodoItem?> = runCatching {
        repo.setDone(id, true)
    }
}

// ---------------------------------------------------------------------------
// 5. The Repository-as-UseCase composition
// ---------------------------------------------------------------------------
// A real ViewModel takes UseCases, not the repository. The UseCase
// is the place to add validation, caching, error mapping, etc.

class TodoViewModelV2(
    private val scope: CoroutineScope,
    private val addTodo: AddTodoUseCase,
    private val toggleTodo: ToggleTodoUseCase,
    private val repo: TodoRepository,
) {
    private val _state = MutableStateFlow(TodoState())
    val state: StateFlow<TodoState> = _state.asStateFlow()

    init {
        scope.launch { repo.observe().collect { items -> _state.update { it.copy(items = items) } } }
    }

    fun add(title: String) {
        scope.launch {
            val r = addTodo(title)
            r.onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }

    fun toggle(id: Long) {
        scope.launch {
            val r = toggleTodo(id)
            r.onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }
}

// ---------------------------------------------------------------------------
// 6. The test-friendly scope
// ---------------------------------------------------------------------------
// A `TestScope` is a `CoroutineScope` you control in tests. Use it
// to inject a `TestDispatcher` and verify state transitions.

fun todoViewModelForTest(scope: CoroutineScope, repo: TodoRepository): TodoViewModel =
    TodoViewModel(scope, repo)

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

fun tour(): List<String> = runBlocking {
    val scope = CoroutineScope(kotlinx.coroutines.Dispatchers.Default)
    val repo = InMemoryTodoRepository()
    val vm = TodoViewModel(scope, repo)

    val items = mutableListOf<String>()

    // Wait for the initial refresh
    kotlinx.coroutines.delay(50)
    items += vm.state.value.items.size.toString()

    vm.dispatch(TodoIntent.Add("Learn MVI"))
    vm.dispatch(TodoIntent.Add("Read the docs"))
    kotlinx.coroutines.delay(50)
    items += vm.state.value.items.size.toString()

    val first = vm.state.value.items.firstOrNull()
    if (first != null) vm.dispatch(TodoIntent.Toggle(first.id))
    kotlinx.coroutines.delay(50)
    items += vm.state.value.items.firstOrNull()?.done.toString()

    vm.dispatch(TodoIntent.Delete(vm.state.value.items.firstOrNull()?.id ?: -1))
    kotlinx.coroutines.delay(50)
    items += vm.state.value.items.size.toString()

    // UseCases
    val addTodo = AddTodoUseCase(repo)
    val r = addTodo("UseCases are nice")
    items += r.toString()

    vm.close()
    items
}
