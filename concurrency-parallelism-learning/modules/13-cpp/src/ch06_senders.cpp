#include <iostream>
#include <cassert>

/* Ch06 — std::execution senders/receivers (C++26 / P2300).
 *
 * The full std::execution API is huge; this is the conceptual core:
 * sender describes work, receiver completes it. The runtime composes
 * them. To run, install stdexec (https://github.com/NVIDIA/stdexec)
 * or libunifex.
 *
 * Without a sender library, this is intentionally a compile-time
 * illustration of the shape:
 *   - sender:  produces a value (or an error, or signals stop)
 *   - receiver: consumes the value (or error, or stop)
 *   - operation_state: the link between the two
 */
namespace cp::exec {

template <typename T>
concept sender = requires(T s) {
    { s.template get_completion_signatures() };
};

template <typename R>
concept receiver = requires(R r) {
    r.set_value();
    r.set_error(std::declval<std::exception_ptr>());
    r.set_stopped();
};

}  // namespace cp::exec

void ch06_senders_demo() {
    // The senders model is *value-based*; you compose `just`, `then`,
    // `when_all`, `let_value`, `upon_error`, `stop_when`, etc.
    //
    // We document the conceptual shape here; real use requires a
    // sender library and C++26 toolchain.
    std::cout << "[ch06] senders/receivers: see stdexec for runtime" << std::endl;
}
