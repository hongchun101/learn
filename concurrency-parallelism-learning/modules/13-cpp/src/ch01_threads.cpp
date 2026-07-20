#include <thread>
#include <vector>
#include <iostream>
#include <cassert>

#include "cp/atomic_counter.hpp"

void ch01_threads_demo() {
    cp::AtomicCounter c;
    std::vector<std::thread> ts;
    for (int i = 0; i < 8; ++i) {
        ts.emplace_back([&c] { for (int j = 0; j < 1000; ++j) c.inc(); });
    }
    for (auto& t : ts) t.join();
    assert(c.get() == 8000);
    std::cout << "[ch01] counter = " << c.get() << std::endl;
}
