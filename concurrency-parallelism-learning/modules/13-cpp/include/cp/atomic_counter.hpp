#pragma once
#include <atomic>
#include <cstddef>

namespace cp {

class AtomicCounter {
public:
    explicit AtomicCounter(std::size_t init = 0) noexcept : v_(init) {}
    std::size_t inc() noexcept {
        return v_.fetch_add(1, std::memory_order_relaxed) + 1;
    }
    std::size_t get() const noexcept {
        return v_.load(std::memory_order_relaxed);
    }
private:
    std::atomic<std::size_t> v_;
};

}  // namespace cp
