#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
#include <cassert>

void ch02_mutex_demo() {
    std::mutex mu;
    int shared = 0;
    std::vector<std::thread> ts;
    for (int i = 0; i < 8; ++i) {
        ts.emplace_back([&] {
            for (int j = 0; j < 1000; ++j) {
                std::lock_guard g(mu);
                shared++;
            }
        });
    }
    for (auto& t : ts) t.join();
    assert(shared == 8000);
    std::cout << "[ch02] shared = " << shared << std::endl;
}
