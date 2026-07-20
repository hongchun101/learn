#pragma once
#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <functional>
#include <future>
#include <mutex>
#include <queue>
#include <thread>
#include <type_traits>
#include <vector>

namespace cp {

/* Simple thread pool with a bounded work queue. */
class ThreadPool {
public:
    explicit ThreadPool(std::size_t n_threads,
                        std::size_t queue_capacity = 1024)
        : capacity_(queue_capacity), shutdown_(false) {
        workers_.reserve(n_threads);
        for (std::size_t i = 0; i < n_threads; ++i) {
            workers_.emplace_back([this] { run(); });
        }
    }

    ~ThreadPool() { shutdown(); }

    ThreadPool(const ThreadPool&) = delete;
    ThreadPool& operator=(const ThreadPool&) = delete;

    /* Submit a callable; returns a future for its return value. */
    template <typename F>
    auto submit(F&& f) -> std::future<std::invoke_result_t<F>> {
        using R = std::invoke_result_t<F>;
        std::packaged_task<R()> task(std::forward<F>(f));
        std::future<R> fut = task.get_future();
        {
            std::unique_lock lk(mu_);
            cv_not_full_.wait(lk, [&] { return q_.size() < capacity_ || shutdown_; });
            if (shutdown_) throw std::runtime_error("pool shut down");
            q_.emplace(std::move(task));
        }
        cv_not_empty_.notify_one();
        return fut;
    }

    void shutdown() {
        {
            std::lock_guard lk(mu_);
            if (shutdown_) return;
            shutdown_ = true;
        }
        cv_not_empty_.notify_all();
        for (auto& t : workers_) if (t.joinable()) t.join();
    }

private:
    void run() {
        for (;;) {
            std::packaged_task<void()> task;
            {
                std::unique_lock lk(mu_);
                cv_not_empty_.wait(lk, [&] { return !q_.empty() || shutdown_; });
                if (shutdown_ && q_.empty()) return;
                task = std::move(q_.front());
                q_.pop();
            }
            cv_not_full_.notify_one();
            task();
        }
    }

    std::vector<std::thread>   workers_;
    std::queue<std::packaged_task<void()>> q_;
    std::mutex                 mu_;
    std::condition_variable    cv_not_empty_;
    std::condition_variable    cv_not_full_;
    std::size_t                capacity_;
    bool                       shutdown_;
};

}  // namespace cp
