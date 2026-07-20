cmake_minimum_required(VERSION 3.20)
project(cp_cxx LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

add_compile_options(-Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wno-sign-conversion
                    -pthread)
add_link_options(-pthread)

# ---- library: cross-language task implementations ----
add_library(cp_patterns INTERFACE)
target_include_directories(cp_patterns INTERFACE
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# ---- demo binary ----
add_executable(cp_main
  src/ch01_threads.cpp
  src/ch02_mutex.cpp
  src/ch03_atomics.cpp
  src/ch04_par_stl.cpp
  src/ch05_coroutines.cpp
  src/ch06_senders.cpp
  src/ch07_lockfree.cpp
  src/main.cpp
)
target_link_libraries(cp_main PRIVATE cp_patterns)

# ---- tests ----
option(CP_BUILD_TESTS "Build unit tests" ON)
if(CP_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
