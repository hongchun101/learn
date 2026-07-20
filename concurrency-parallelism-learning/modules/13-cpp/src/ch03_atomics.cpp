#include <atomic>
#include <cassert>
#include <iostream>
#include <thread>

#include "cp/atomic_counter.hpp"

/* Ch03 — atomics: release/acquire pattern, the same as the C version. */
namespace {
std::atomic<int>  payload{0};
std::atomic<int>  ready{0};

void writer() {
    payload.store(42, std::memory_order_relaxed);
    ready.store(1, std::memory_order_release);
}

int reader() {
    while (ready.load(std::memory_order_acquire) == 0) {}
    return payload.load(std::memory_order_relaxed);
}
}  // namespace

void ch03_atomics_demo() {
    std::thread w(writer);
    int v = reader();
    w.join();
    assert(v == 42);
    std::cout << "[ch03] payload observed = " << v << std::endl;
}
