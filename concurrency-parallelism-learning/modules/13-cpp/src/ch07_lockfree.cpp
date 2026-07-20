#include <cassert>
#include <iostream>
#include <thread>
#include <vector>

#include "cp/lockfree_stack.hpp"

void ch07_lockfree_demo() {
    cp::LockFreeStack<int> s;
    std::vector<std::thread> ts;
    for (int t = 0; t < 4; ++t) {
        ts.emplace_back([&s, t] {
            for (int i = 0; i < 1000; ++i) s.push(new int(t * 1000 + i));
        });
    }
    for (auto& t : ts) t.join();
    // Count remaining
    int count = 0;
    while (auto* v = s.pop()) { delete v; ++count; }
    assert(count == 4000);
    std::cout << "[ch07] lock-free stack drained = " << count << std::endl;
}
