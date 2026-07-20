/*
 * ch14_di / Ch14Di.kt
 *
 * Hand-rolled dependency injection. The lesson: DI is a *pattern*,
 * not a *framework*. A 60-line container can replace a 60-MB
 * framework. The mental model:
 *
 *   - The container is a map of `Key -> Provider`.
 *   - A provider is a function that builds the dependency on demand.
 *   - Resolution is by type, by tag, or by `reified` key.
 *   - Scopes (singleton, factory) are properties of the provider.
 *
 * When to graduate to a framework:
 *   - You need component scanning / annotation processing.
 *   - You need compile-time validation of the graph.
 *   - You have more than 30 services and the team is large.
 *
 * Until then, this is enough.
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch14_di

import kotlin.reflect.KClass

// ---------------------------------------------------------------------------
// 1. The simplest possible container
// ---------------------------------------------------------------------------

class Container {
    private val providers = mutableMapOf<Key<*>, () -> Any>()

    fun <T : Any> registerSingleton(type: KClass<T>, instance: T) {
        providers[Key(type)] = { instance }
    }

    fun <T : Any> registerSingleton(type: KClass<T>, factory: () -> T) {
        val lazy = lazy(factory)
        providers[Key(type)] = { lazy.value }
    }

    fun <T : Any> registerFactory(type: KClass<T>, factory: () -> T) {
        providers[Key(type)] = factory
    }

    @Suppress("UNCHECKED_CAST")
    fun <T : Any> resolve(type: KClass<T>): T {
        val provider = providers[Key(type)]
            ?: throw IllegalStateException("No provider for ${type.simpleName}")
        return provider() as T
    }

    inline fun <reified T : Any> registerSingleton(instance: T) =
        registerSingleton(T::class, instance)
    inline fun <reified T : Any> registerSingleton(noinline factory: () -> T) =
        registerSingleton(T::class, factory)
    inline fun <reified T : Any> registerFactory(noinline factory: () -> T) =
        registerFactory(T::class, factory)
    inline fun <reified T : Any> resolve(): T = resolve(T::class)
}

private data class Key<T>(val type: KClass<T>)

// ---------------------------------------------------------------------------
// 2. The "DI-friendly" type
// ---------------------------------------------------------------------------
// A class that pulls its dependencies from the container in its
// constructor. **The container is passed in by the test, the entry
// point, or a factory.**

class Logger2(private val name: String) {
    fun log(message: String) = println("[$name] $message")
}

class Database2(private val log: Logger2) {
    private val rows = mutableListOf<String>()
    fun insert(row: String) { rows.add(row); log.log("inserted $row") }
    fun all(): List<String> = rows.toList()
}

class UserService2(private val db: Database2, private val log: Logger2) {
    fun add(name: String) { db.insert(name); log.log("added $name") }
    fun list(): List<String> = db.all()
}

// ---------------------------------------------------------------------------
// 3. A "module" — a function that registers related services
// ---------------------------------------------------------------------------
// Group registrations by domain. Each module is a function on the
// container; the entry point runs them in order.

fun Container.installCore(): Container = apply {
    registerSingleton<Logger2>(Logger2("core"))
    registerSingleton<Database2> { Database2(resolve<Logger2>()) }
    registerSingleton<UserService2> { UserService2(resolve<Database2>(), resolve<Logger2>()) }
}

// ---------------------------------------------------------------------------
// 4. Scope: a function that builds a graph of related objects
// ---------------------------------------------------------------------------
// A scope is a sub-container that shares the parent's providers but
// can override some. Useful for "test scope" vs "production scope".

fun Container.withTestOverride(name: String): Container = apply {
    registerSingleton<Logger2>(Logger2("test-$name"))
    registerSingleton<Database2> { Database2(resolve<Logger2>()) }
    registerSingleton<UserService2> { UserService2(resolve<Database2>(), resolve<Logger2>()) }
}

// ---------------------------------------------------------------------------
// 5. Avoiding cycles
// ---------------------------------------------------------------------------
// The container cannot detect cycles by itself. Two common ways to
// break them:
//   1. Use `Provider<T>` (a deferred reference) instead of `T`.
//   2. Construct the cycle's nodes in a separate step.
//
// `Provider<T>` example:
class Provider<T : Any>(private val container: Container, private val type: KClass<T>) {
    val value: T by lazy { container.resolve(type) }
    inline fun <reified S : T> upcast(): Provider<S> = Provider(container, S::class) as Provider<S>
}

// ---------------------------------------------------------------------------
// 6. Why hand-rolled?
// ---------------------------------------------------------------------------
// - The container is 60 lines. You can read it.
// - The graph is explicit. You can reason about it.
// - Tests are easy: build the container, resolve the service,
//   inject a fake. No annotation processing, no kapt, no codegen.
// - Multiplatform: no JVM-only reflection, no compiler-plugin dance.
// - You can graduate to Koin or kotlin-inject later if the graph
//   grows past what is comfortable in plain Kotlin.

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

fun tour(): List<String> {
    val prod = Container().installCore()
    val users = prod.resolve<UserService2>()
    users.add("Ada")
    users.add("Boris")

    val test = Container().withTestOverride("user-svc")
    val testUsers = test.resolve<UserService2>()
    testUsers.add("test-user")

    return listOf(
        users.list().toString(),
        testUsers.list().toString(),
    )
}
