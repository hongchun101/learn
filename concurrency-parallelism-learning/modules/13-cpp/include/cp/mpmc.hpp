#pragma once
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <mutex>
#include <optional>
#include <queue>

namespace cp {

/* Bounded MPMC queue. Same shape as the C version. */
template <typename T>
class BoundedMpmc {
public:
    explicit BoundedMpmc(std::size_t capacity) : capacity_(capacity) {}
    ~BoundedMpmc() { close(); }

    void enqueue(T v) {
        std::unique_lock lk(mu_);
        cv_not_full_.wait(lk, [&] { return q_.size() < capacity_ || closed_; });
        if (closed_) throw std::runtime_error("queue closed");
        q_.push(std::move(v));
        cv_not_empty_.notify_one();
    }

    std::optional<T> dequeue_for(std::chrono::milliseconds d) {
        std::unique_lock lk(mu_);
        if (!cv_not_empty_.wait_for(lk, d, [&] { return !q_.empty() || closed_; })) {
            return std::nullopt;
        }
        if (q_.empty()) return std::nullopt;  // closed and empty
        T v = std::move(q_.front());
        q_.pop();
        cv_not_full_.notify_one();
        return v;
    }

    void close() {
        std::lock_guard lk(mu_);
        closed_ = true;
        cv_not_empty_.notify_all();
        cv_not_full_.notify_all();
    }

private:
    std::size_t              capacity_;
    std::mutex               mu_;
    std::condition_variable  cv_not_empty_;
    std::condition_variable  cv_not_full_;
    std::queue<T>            q_;
    bool                     closed_ = false;
};

}  // namespace cp
