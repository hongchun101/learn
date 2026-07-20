/*
 * examples/todo-app/TodoApp.kt
 *
 * A 60-line mini version of ch18. Single file, no platforms, no
 * UI; just a ViewModel + state in pure commonMain. Demonstrates
 * that the ch18 architecture is small enough to inline.
 */

@file:JvmName("TodoAppKt")

package examples.todo_app

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.Dispatchers

data class Todo(val id: Long, val title: String, val done: Boolean)

class TodoStore {
    private val state = MutableStateFlow<List<Todo>>(emptyList())
    private var nextId = 1L
    fun add(title: String): Todo = Todo(nextId++, title, false).also { state.value = state.value + it }
    fun toggle(id: Long) { state.value = state.value.map { if (it.id == id) it.copy(done = !it.done) else it } }
    fun delete(id: Long) { state.value = state.value.filter { it.id != id } }
    fun observe(): StateFlow<List<Todo>> = state.asStateFlow()
}

class TodoVM(scope: CoroutineScope, private val store: TodoStore) {
    val state: StateFlow<List<Todo>> = store.observe()
    fun add(t: String) = scope.launch { store.add(t) }
    fun toggle(id: Long) = scope.launch { store.toggle(id) }
    fun delete(id: Long) = scope.launch { store.delete(id) }
}

fun main() = runBlocking {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val vm = TodoVM(scope, TodoStore())
    vm.add("Learn KMP")
    vm.add("Build a TODO")
    delay(10)
    vm.state.value.forEach { println("- #${it.id} ${it.title} ${if (it.done) "[x]" else "[ ]"}") }
    vm.toggle(1)
    delay(10)
    println()
    println("after toggle:")
    vm.state.value.forEach { println("- #${it.id} ${it.title} ${if (it.done) "[x]" else "[ ]"}") }
    vm.delete(2)
    delay(10)
    println()
    println("after delete:")
    vm.state.value.forEach { println("- #${it.id} ${it.title} ${if (it.done) "[x]" else "[ ]"}") }
    scope.cancel()
}
