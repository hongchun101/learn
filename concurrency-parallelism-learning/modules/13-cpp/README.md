# C++ — concurrency & parallelism (Ch13)

C++20. The full story: OS threads, atomics with a memory model, std::async,
thread pools, parallel STL (since C++17), std::execution (C++26, current
P2300 senders/receivers), and the Intel TBB / oneTBB primitives.

## What an expert can do after this module

- Use the C++ memory model (acquire/release, seq_cst, relaxed, consume)
  with the same confidence as the C11 model.
- Build a thread pool with `std::thread` + work-stealing using
  `std::deque` + `std::mutex` (or, with C++26, `std::execution`).
- Use `std::async` correctly: know why `std::launch::async` vs
  `std::launch::deferred` matters; use `std::future`/`std::packaged_task`
  intentionally.
- Use the parallel STL: `std::execution::par`, `std::execution::par_unseq`,
  `std::reduce`, `std::transform_reduce`, `std::for_each`.
- Build on the C++26 senders/receivers model (`std::execution::sender`,
  `std::execution::receiver`, `std::execution::just`, `std::execution::then`,
  `std::execution::when_all`, `std::execution::let_value`, `std::execution::stop_token`).
- Use `std::latch`, `std::barrier`, `std::counting_semaphore`, `std::binary_semaphore`.
- Use `std::atomic` with all memory orders; `std::atomic_ref` for non-atomic
  data; `std::atomic_flag` for the cheapest lock.
- Use `std::condition_variable` and `std::condition_variable_any`.
- Use `co_await`, `co_return`, `co_yield` (C++20) for cooperative
  coroutines: write your own awaitable type, integrate with a runtime
  (cppcoro or libunifex).
- Use `std::jthread` (C++20) which auto-joins on destruction and supports
  cooperative cancellation via `std::stop_token`.

## Layout

```
modules/13-cpp/
├── README.md
├── CMakeLists.txt
├── include/
│   ├── cp/
│   │   ├── atomic_counter.hpp
│   │   ├── mpmc.hpp
│   │   ├── spsc.hpp
│   │   ├── pool.hpp
│   │   ├── barrier.hpp
│   │   ├── async_pool.hpp
│   │   ├── lockfree_stack.hpp
│   │   └── patterns.hpp
├── src/
│   ├── ch01_threads.cpp
│   ├── ch02_mutex.cpp
│   ├── ch03_atomics.cpp
│   ├── ch04_par_stl.cpp
│   ├── ch05_coroutines.cpp
│   ├── ch06_senders.cpp     — std::execution senders/receivers (C++26/P2300)
│   ├── ch07_lockfree.cpp
│   └── main.cpp
└── tests/
    └── (Catch2 or doctest, one per chapter)
```

## How to run

```bash
cd modules/13-cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
./build/cp_tests          # or ./build/cp_main
```

The local build host does not have `g++` installed; the code is reviewed
by inspection. Targets:

- `g++ 13+` or `clang++ 17+`
- C++23 baseline; C++26 for `std::execution` senders
- `-pthread -O2 -Wall -Wextra -Werror -fsanitize=thread`

## Cross-language task implementations

`include/cp/patterns.hpp` and `src/ch08_patterns.cpp` re-implement the
six tasks using modern C++ primitives. The tests assert the same
properties as the TypeScript reference.

## Memory model

C++11 brought the C11 memory model to C++. The five `std::memory_order`
values map 1:1 to C11. `std::atomic<T>` and `std::atomic_ref<T>` are
the building blocks; `volatile` in C++ is *not* an atomicity primitive
(it tells the compiler not to optimise the access away, e.g. for
memory-mapped I/O — *not* what you want for shared state).
