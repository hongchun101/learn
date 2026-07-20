#include <algorithm>
#include <cassert>
#include <execution>
#include <iostream>
#include <numeric>
#include <vector>

/* Ch04 — parallel STL. */
void ch04_par_stl_demo() {
    std::vector<int> xs(1'000'000);
    std::iota(xs.begin(), xs.end(), 1);
    auto sum = std::reduce(std::execution::par, xs.begin(), xs.end(), 0LL);
    assert(sum == 500'000'500'000LL);
    std::cout << "[ch04] parallel sum = " << sum << std::endl;
}
