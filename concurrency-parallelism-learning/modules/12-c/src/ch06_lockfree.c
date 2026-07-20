#include "cp_spsc.h"
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdatomic.h>
#include <assert.h>

/* Ch06 — SPSC queue smoke test. Producer pushes N items, consumer pops
 * N items; verify every item round-trips exactly once.
 */
typedef struct {
    cp_spsc_t *q;
    int        n;
    atomic_int *errors;
} spsc_args_t;

static void *producer_fn(void *arg) {
    spsc_args_t *a = arg;
    for (int i = 0; i < a->n; i++) {
        while (!cp_spsc_push(a->q, (void *)(intptr_t)(i + 1))) {
            /* busy-wait until consumer drains */
        }
    }
    return NULL;
}

static void *consumer_fn(void *arg) {
    spsc_args_t *a = arg;
    int seen = 0;
    for (int i = 0; i < a->n; i++) {
        void *v = NULL;
        while (!cp_spsc_pop(a->q, &v)) {
            /* spin */
        }
        if ((intptr_t)v != i + 1) {
            atomic_fetch_add(a->errors, 1);
        }
        seen++;
    }
    return NULL;
}

void ch06_lockfree_demo(void) {
    cp_spsc_t q;
    assert(cp_spsc_init(&q, 1024) == 0);
    atomic_int errors;
    atomic_init(&errors, 0);
    spsc_args_t args = { .q = &q, .n = 10_000, .errors = &errors };
    pthread_t p, c;
    pthread_create(&p, NULL, producer_fn, &args);
    pthread_create(&c, NULL, consumer_fn, &args);
    pthread_join(p, NULL);
    pthread_join(c, NULL);
    assert(atomic_load(&errors) == 0);
    cp_spsc_destroy(&q);
}
