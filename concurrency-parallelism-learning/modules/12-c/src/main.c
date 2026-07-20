#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <stdatomic.h>

#include "cp_atomic.h"
#include "cp_barrier.h"
#include "cp_spsc.h"
#include "cp_mpmc.h"
#include "cp_pool.h"
#include "cp_patterns.h"

extern void ch01_pthreads_demo(void);
extern void ch02_mutex_demo(void);
extern void ch03_condvar_demo(void);
extern void ch04_atomics_demo(void);
extern void ch05_openmp_demo(void);
extern void ch06_lockfree_demo(void);
extern void ch07_pool_demo(void);

static int stage_inc(int x)  { return x + 1; }
static int stage_mul(int x)  { return x * 2; }
static int stage_sub(int x)  { return x - 3; }

int main(int argc, char **argv) {
    int run_tests = argc > 1 && strcmp(argv[1], "--test") == 0;

    ch01_pthreads_demo();
    ch02_mutex_demo();
    ch03_condvar_demo();
    ch04_atomics_demo();
    ch05_openmp_demo();
    ch06_lockfree_demo();
    ch07_pool_demo();

    /* cross-language scenarios */
    {
        int inputs[100];
        for (int i = 0; i < 100; i++) inputs[i] = i;
        int outputs[100];
        cp_patterns_fan_out(inputs, 100, outputs, 16);
        for (int i = 0; i < 100; i++) assert(outputs[i] == i * 2);
    }
    {
        int xs[4] = { 0, 1, 2, 3 };
        cp_patterns_pipeline(xs, 4, stage_inc, stage_mul, stage_sub);
        assert(xs[0] == -1 && xs[1] == 1 && xs[2] == 3 && xs[3] == 5);
    }
    {
        int produced = 0;
        cp_patterns_rate_limit(200.0, 100, &produced);
        assert(produced >= 15 && produced <= 30);
    }
    cp_patterns_barrier();
    {
        atomic_int total;
        atomic_init(&total, 0);
        cp_patterns_mpmc_smoke(&total);
        assert(atomic_load(&total) == 300);
    }
    {
        int xs[1000];
        for (int i = 0; i < 1000; i++) xs[i] = i + 1;
        int out = 0;
        cp_patterns_parallel_reduce(xs, 1000, 8, &out);
        assert(out == (1000 * 1001) / 2);
    }

    if (run_tests) puts("ALL TESTS PASSED");
    return 0;
}
