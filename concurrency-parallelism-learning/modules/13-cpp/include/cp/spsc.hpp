#pragma once
#include <array>
#include <atomic>
#include <cstddef>
#include <optional>
#include <vector>

namespace cp {

/* Single-producer / single-consumer lock-free ring.
 * Same algorithm as the C version; expressed in C++ types. */
template <typename T>
class Spsc {
public:
    explicit Spsc(std::size_t requested_capacity) {
        std::size_t cap = 1;
        while (cap < requested_capacity) cap <<= 1;
        slots_.resize(cap);
        capacity_ = cap;
        mask_     = cap - 1;
        head_.store(0, std::memory_order_relaxed);
        tail_.store(0, std::memory_order_relaxed);
    }

    bool push(T v) {
        auto head = head_.load(std::memory_order_relaxed);
        auto tail = tail_.load(std::memory_order_acquire);
        if ((head - tail) >= capacity_) return false;
        slots_[head & mask_] = std::move(v);
        head_.store(head + 1, std::memory_order_release);
        return true;
    }

    std::optional<T> pop() {
        auto tail = tail_.load(std::memory_order_relaxed);
        auto head = head_.load(std::memory_order_acquire);
        if (tail >= head) return std::nullopt;
        std::optional<T> out(std::move(slots_[tail & mask_]));
        tail_.store(tail + 1, std::memory_order_release);
        return out;
    }

private:
    std::vector<T>            slots_;
    std::size_t               capacity_;
    std::size_t               mask_;
    std::atomic<std::size_t>  head_;
    std::atomic<std::size_t>  tail_;
};

}  // namespace cp
