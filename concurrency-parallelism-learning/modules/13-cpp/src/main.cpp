#include <cassert>
#include <iostream>
#include <numeric>
#include <vector>

#include "cp/patterns.hpp"

extern void ch01_threads_demo();
extern void ch02_mutex_demo();
extern void ch03_atomics_demo();
extern void ch04_par_stl_demo();
extern void ch05_coroutines_demo();
extern void ch06_senders_demo();
extern void ch07_lockfree_demo();

int main() {
    ch01_threads_demo();
    ch02_mutex_demo();
    ch03_atomics_demo();
    ch04_par_stl_demo();
    ch05_coroutines_demo();
    ch06_senders_demo();
    ch07_lockfree_demo();

    /* Cross-language scenarios */
    {
        std::vector<int> inputs(100);
        std::iota(inputs.begin(), inputs.end(), 0);
        auto out = cp::patterns::fan_out<int>(
            inputs, 16, [](int i) { return i * 2; });
        for (size_t i = 0; i < inputs.size(); ++i)
            assert(out[i] == static_cast<int>(i) * 2);
    }
    {
        std::vector<int> src{0, 1, 2, 3};
        std::vector<std::function<int(int)>> stages{
            [](int x) { return x + 1; },
            [](int x) { return x * 2; },
            [](int x) { return x - 3; }
        };
        auto out = cp::patterns::pipeline(src, stages);
        assert((out == std::vector<int>{-1, 1, 3, 5}));
    }
    {
        auto n = cp::patterns::rate_limit(200, std::chrono::milliseconds(100));
        assert(n >= 15 && n <= 30);
    }
    cp::patterns::barrier(4);
    {
        auto total = cp::patterns::mpmc_roundtrip<int>(3, 4, 100);
        assert(total == 300);
    }
    {
        std::vector<int> inputs(1000);
        std::iota(inputs.begin(), inputs.end(), 1);
        auto expected = std::accumulate(inputs.begin(), inputs.end(), 0);
        for (size_t p : {1, 2, 4, 8, 16, 32, 100}) {
            auto got = cp::patterns::parallel_reduce(inputs, p, std::plus<>{});
            assert(got == expected);
        }
    }

    std::cout << "ALL TESTS PASSED" << std::endl;
    return 0;
}
