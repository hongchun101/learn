#pragma once
#include <algorithm>
#include <chrono>
#include <cstddef>
#include <functional>
#include <future>
#include <numeric>
#include <thread>
#include <vector>

#include "cp/pool.hpp"
#include "cp/mpmc.hpp"
#include "cp/barrier.hpp"

namespace cp::patterns {

/* 1. fan-out / fan-in: N inputs, P workers; output order = input order. */
template <typename I, typename O, typename W>
std::vector<O> fan_out(std::vector<I> inputs,
                       std::size_t parallelism,
                       W work) {
    if (inputs.empty()) return {};
    ThreadPool pool(parallelism);
    std::vector<std::future<O>> futs;
    futs.reserve(inputs.size());
    for (auto& x : inputs) {
        futs.push_back(pool.submit([&work, x] { return work(x); }));
    }
    std::vector<O> out;
    out.reserve(inputs.size());
    for (auto& f : futs) out.push_back(f.get());
    return out;
}

/* 2. pipeline: each element flows through all stages in order. */
template <typename T, typename S>
std::vector<T> pipeline(std::vector<T> source, std::vector<S> stages) {
    for (auto& x : source) {
        for (auto& stage : stages) x = stage(x);
    }
    return source;
}

/* 3. rate limit: token bucket. */
inline std::size_t rate_limit(std::size_t rate_per_sec,
                              std::chrono::milliseconds duration) {
    const auto interval_us =
        std::chrono::microseconds(1'000'000 / rate_per_sec);
    auto start = std::chrono::steady_clock::now();
    auto deadline = start + duration;
    std::size_t produced = 0;
    auto next_allowed = start;
    while (std::chrono::steady_clock::now() < deadline) {
        auto now = std::chrono::steady_clock::now();
        if (now >= next_allowed) {
            ++produced;
            next_allowed += interval_us;
        } else {
            std::this_thread::sleep_for(next_allowed - now);
        }
    }
    return produced;
}

/* 4. barrier. */
inline void barrier(std::size_t parties) {
    cp::Barrier b(parties);
    std::atomic<std::size_t> arrived{0};
    std::atomic<bool> released{false};
    std::vector<std::thread> ts;
    for (std::size_t i = 0; i < parties; ++i) {
        ts.emplace_back([&] {
            if (arrived.fetch_add(1) + 1 == parties) released = true;
            while (!released) std::this_thread::yield();
        });
    }
    for (auto& t : ts) t.join();
}

/* 5. MPMC queue smoke: round-trip a fixed number of items. */
template <typename T>
std::size_t mpmc_roundtrip(std::size_t n_producers,
                           std::size_t n_consumers,
                           std::size_t per_producer) {
    BoundedMpmc<T> q(4);
    std::atomic<std::size_t> total{0};
    std::vector<std::thread> prods, cons;
    for (std::size_t p = 0; p < n_producers; ++p) {
        prods.emplace_back([&, p] {
            for (std::size_t i = 0; i < per_producer; ++i) {
                q.enqueue(static_cast<T>(p * 1000 + i));
            }
        });
    }
    std::size_t per_consumer = (n_producers * per_producer) / n_consumers;
    for (std::size_t c = 0; c < n_consumers; ++c) {
        cons.emplace_back([&] {
            for (std::size_t i = 0; i < per_consumer; ++i) {
                while (!q.dequeue_for(std::chrono::milliseconds(1000))) {}
                total.fetch_add(1, std::memory_order_relaxed);
            }
        });
    }
    for (auto& t : prods) t.join();
    for (auto& t : cons) t.join();
    return total.load();
}

/* 6. parallel reduce: P partitions, sequential reduce per partition,
 * then combine. */
template <typename T, typename Op>
T parallel_reduce(const std::vector<T>& inputs, std::size_t p, Op op) {
    if (inputs.empty()) throw std::invalid_argument("parallel_reduce: empty");
    p = std::max<std::size_t>(1, std::min(p, inputs.size()));
    ThreadPool pool(p);
    std::vector<std::future<T>> futs;
    futs.reserve(p);
    std::size_t chunk = (inputs.size() + p - 1) / p;
    for (std::size_t i = 0; i < p; ++i) {
        std::size_t from = i * chunk;
        std::size_t to   = std::min(from + chunk, inputs.size());
        futs.push_back(pool.submit([&inputs, from, to, &op] {
            return std::reduce(inputs.begin() + from,
                               inputs.begin() + to,
                               T{}, op);
        }));
    }
    T acc = futs[0].get();
    for (std::size_t i = 1; i < p; ++i) acc = op(acc, futs[i].get());
    return acc;
}

}  // namespace cp::patterns
