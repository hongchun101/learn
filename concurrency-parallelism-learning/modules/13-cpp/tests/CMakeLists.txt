# Test runner using a hand-rolled assert harness (no external dep).
add_executable(cp_tests
  test_main.cpp
)
target_link_libraries(cp_tests PRIVATE cp_patterns)
add_test(NAME cp_tests COMMAND cp_tests)
