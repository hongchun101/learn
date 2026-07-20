#pragma once
#include <barrier>
#include <atomic>
#include <cstddef>

namespace cp {

/* Wrapper around C++20 std::barrier (preferred when available) with a
 * small "CountDownLatch" fallback. */
class Barrier {
public:
    explicit Barrier(std::ptrdiff_t n) : bar_(n) {}
    void arrive_and_wait() { bar_.arrive_and_wait(); }
private:
    std::barrier<> bar_;
};

}  // namespace cp
