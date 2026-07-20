#include <cassert>
#include <chrono>
#include <iostream>
#include <numeric>
#include <vector>

#include "cp/atomic_counter.hpp"
#include "cp/mpmc.hpp"
#include "cp/patterns.hpp"
#include "cp/pool.hpp"
#include "cp/spsc.hpp"

int main() {
    using namespace std::chrono_literals;

    /* atomic counter */
    cp::AtomicCounter c;
    std::vector<std::thread> ts;
    for (int i = 0; i < 4; ++i) ts.emplace_back([&c] { for (int j = 0; j < 1000; ++j) c.inc(); });
    for (auto& t : ts) t.join();
    assert(c.get() == 4000);

    /* SPSC */
    cp::Spsc<int> q(16);
    for (int i = 0; i < 16; ++i) assert(q.push(i));
    for (int i = 0; i < 16; ++i) { auto v = q.pop(); assert(v && *v == i); }

    /* MPMC */
    cp::BoundedMpmc<int> mq(4);
    mq.enqueue(1); mq.enqueue(2); mq.enqueue(3);
    assert(mq.dequeue_for(100ms).value() == 1);
    assert(mq.dequeue_for(100ms).value() == 2);
    assert(mq.dequeue_for(100ms).value() == 3);

    /* cross-language scenarios */
    std::vector<int> xs(100); std::iota(xs.begin(), xs.end(), 0);
    auto fo = cp::patterns::fan_out<int>(xs, 8, [](int i) { return i * 2; });
    for (size_t i = 0; i < xs.size(); ++i) assert(fo[i] == static_cast<int>(i) * 2);

    std::vector<int> src{0, 1, 2, 3};
    std::vector<std::function<int(int)>> stages{
        [](int x){ return x + 1; },
        [](int x){ return x * 2; },
        [](int x){ return x - 3; }
    };
    auto pl = cp::patterns::pipeline(src, stages);
    assert((pl == std::vector<int>{-1, 1, 3, 5}));

    auto n = cp::patterns::rate_limit(200, 100ms);
    assert(n >= 15 && n <= 30);

    cp::patterns::barrier(4);

    auto total = cp::patterns::mpmc_roundtrip<int>(3, 4, 100);
    assert(total == 300);

    std::vector<int> inputs(1000);
    std::iota(inputs.begin(), inputs.end(), 1);
    auto expected = std::accumulate(inputs.begin(), inputs.end(), 0);
    for (size_t p : {1, 2, 4, 8, 16, 32, 100}) {
        auto got = cp::patterns::parallel_reduce(inputs, p, std::plus<>{});
        assert(got == expected);
    }

    std::cout << "OK" << std::endl;
    return 0;
}
