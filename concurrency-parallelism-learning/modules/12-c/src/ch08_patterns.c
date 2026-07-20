#include "cp_patterns.h"
#include "cp_pool.h"
#include "cp_mpmc.h"
#include "cp_barrier.h"

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <pthread.h>
#include <stdatomic.h>
#include <assert.h>
#include <time.h>
#include <unistd.h>

/* ----- 1. fan-out / fan-in ----- */
typedef struct {
    int   *inputs;
    size_t n;
    int   *outputs;
    cp_pool_t *pool;
} fanout_args_t;

static void fanout_one(void *arg) {
    int *p = arg;
    *p = (*p) * 2;
}

void cp_patterns_fan_out(int *inputs, size_t n, int *outputs, size_t parallelism) {
    cp_pool_t pool;
    cp_pool_init(&pool, parallelism, n);
    for (size_t i = 0; i < n; i++) {
        outputs[i] = inputs[i];
        cp_pool_submit(&pool, fanout_one, &outputs[i]);
    }
    cp_pool_shutdown(&pool);
}

/* ----- 2. pipeline (single-threaded for clarity) ----- */
void cp_patterns_pipeline(int *xs, size_t n, int (*stage1)(int), int (*stage2)(int), int (*stage3)(int)) {
    for (size_t i = 0; i < n; i++) {
        int v = xs[i];
        v = stage1(v);
        v = stage2(v);
        v = stage3(v);
        xs[i] = v;
    }
}

/* ----- 3. rate limit (token bucket) ----- */
void cp_patterns_rate_limit(double rate, int duration_ms, int *out) {
    int produced = 0;
    double interval_us = 1.0e6 / rate;
    struct timespec start, now;
    clock_gettime(CLOCK_MONOTONIC, &start);
    double next = start.tv_sec * 1e6 + start.tv_nsec / 1e3;
    double end  = next + (double)duration_ms * 1000.0;
    while (1) {
        clock_gettime(CLOCK_MONOTONIC, &now);
        double t = now.tv_sec * 1e6 + now.tv_nsec / 1e3;
        if (t >= end) break;
        if (t >= next) {
            produced++;
            next += interval_us;
        } else {
            double sleep_us = next - t;
            usleep((useconds_t)sleep_us);
        }
    }
    *out = produced;
}

/* ----- 4. barrier ----- */
static cp_barrier_t g_bar;
static atomic_int   g_released;

static void *barrier_waiter(void *arg) {
    (void)arg;
    cp_barrier_wait(&g_bar);
    atomic_fetch_add(&g_released, 1);
    return NULL;
}

void cp_patterns_barrier(void) {
    cp_barrier_init(&g_bar, 4);
    atomic_init(&g_released, 0);
    pthread_t tids[4];
    for (int i = 0; i < 4; i++) pthread_create(&tids[i], NULL, barrier_waiter, NULL);
    for (int i = 0; i < 4; i++) pthread_join(tids[i], NULL);
    cp_barrier_destroy(&g_bar);
    assert(atomic_load(&g_released) == 4);
}

/* ----- 5. mpmc queue smoke test ----- */
typedef struct {
    cp_mpmc_t *q;
    int        pid;
    int        n;
} mpmc_prod_t;

typedef struct {
    cp_mpmc_t *q;
    int        cid;
    int        want;
    atomic_int *total;
} mpmc_cons_t;

static void *mpmc_producer(void *arg) {
    mpmc_prod_t *p = arg;
    for (int i = 0; i < p->n; i++) {
        cp_mpmc_enqueue(p->q, (void *)(intptr_t)(p->pid * 1000 + i));
    }
    return NULL;
}

static void *mpmc_consumer(void *arg) {
    mpmc_cons_t *c = arg;
    for (int i = 0; i < c->want; i++) {
        void *v = NULL;
        cp_mpmc_dequeue(c->q, &v, 1000);
        atomic_fetch_add(c->total, 1);
    }
    return NULL;
}

void cp_patterns_mpmc_smoke(atomic_int *total) {
    cp_mpmc_t q;
    cp_mpmc_init(&q, 4);
    pthread_t prods[3], cons[4];
    mpmc_prod_t p0 = { &q, 0, 100 };
    mpmc_prod_t p1 = { &q, 1, 100 };
    mpmc_prod_t p2 = { &q, 2, 100 };
    pthread_create(&prods[0], NULL, mpmc_producer, &p0);
    pthread_create(&prods[1], NULL, mpmc_producer, &p1);
    pthread_create(&prods[2], NULL, mpmc_producer, &p2);
    mpmc_cons_t c0 = { &q, 0, 75, total };
    mpmc_cons_t c1 = { &q, 1, 75, total };
    mpmc_cons_t c2 = { &q, 2, 75, total };
    mpmc_cons_t c3 = { &q, 3, 75, total };
    pthread_create(&cons[0], NULL, mpmc_consumer, &c0);
    pthread_create(&cons[1], NULL, mpmc_consumer, &c1);
    pthread_create(&cons[2], NULL, mpmc_consumer, &c2);
    pthread_create(&cons[3], NULL, mpmc_consumer, &c3);
    for (int i = 0; i < 3; i++) pthread_join(prods[i], NULL);
    for (int i = 0; i < 4; i++) pthread_join(cons[i], NULL);
    cp_mpmc_close(&q);
    cp_mpmc_destroy(&q);
}

/* ----- 6. parallel reduce ----- */
typedef struct {
    int   *chunk;
    size_t n;
    int    out;
} reduce_chunk_t;

static void reduce_worker(void *arg) {
    reduce_chunk_t *c = arg;
    int s = 0;
    for (size_t i = 0; i < c->n; i++) s += c->chunk[i];
    c->out = s;
}

void cp_patterns_parallel_reduce(int *xs, size_t n, size_t parallelism, int *out) {
    cp_pool_t pool;
    cp_pool_init(&pool, parallelism, parallelism);
    size_t chunk_size = (n + parallelism - 1) / parallelism;
    reduce_chunk_t *chunks = calloc(parallelism, sizeof(*chunks));
    for (size_t i = 0; i < parallelism; i++) {
        chunks[i].chunk = xs + i * chunk_size;
        chunks[i].n = (i == parallelism - 1)
            ? (n - i * chunk_size)
            : chunk_size;
        cp_pool_submit(&pool, reduce_worker, &chunks[i]);
    }
    cp_pool_shutdown(&pool);
    int total = 0;
    for (size_t i = 0; i < parallelism; i++) total += chunks[i].out;
    *out = total;
    free(chunks);
}
