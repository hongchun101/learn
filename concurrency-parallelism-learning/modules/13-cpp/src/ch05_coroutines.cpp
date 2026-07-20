#include <chrono>
#include <coroutine>
#include <cstddef>
#include <exception>
#include <iostream>
#include <thread>

/* Ch05 — coroutines.
 *
 * A minimal `Task<T>` type that satisfies the C++20 coroutine machinery.
 * A real-world engine would use cppcoro or stdexec; here we illustrate
 * the parts of the contract you must understand to use any of them.
 */
template <typename T>
struct Task {
    struct promise_type;
    using handle_t = std::coroutine_handle<promise_type>;

    struct promise_type {
        T                    value{};
        std::exception_ptr   eptr{};
        Task                 get_return_object() { return Task{handle_t::from_promise(*this)}; }
        std::suspend_never   initial_suspend() noexcept { return {}; }
        std::suspend_always  final_suspend() noexcept { return {}; }
        template <typename U>
        void return_value(U v) { value = std::move(v); }
        void unhandled_exception() { eptr = std::current_exception(); }
    };

    handle_t h;
    T take() {
        if (h.promise().eptr) std::rethrow_exception(h.promise().eptr);
        T v = std::move(h.promise().value);
        h.destroy();
        return v;
    }
};

static Task<int> compute(int x) {
    co_return x * 2;
}

void ch05_coroutines_demo() {
    auto t = compute(21);
    int v = t.take();
    assert(v == 42);
    std::cout << "[ch05] coroutine result = " << v << std::endl;
}
