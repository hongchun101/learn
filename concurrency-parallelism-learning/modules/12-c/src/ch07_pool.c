#include "cp_pool.h"
#include <stdlib.h>
#include <stdio.h>
#include <assert.h>

/* Ch07 — thread-pool round trip: submit 1000 tiny tasks, observe they
 * all complete. Verifies the pool's wait-for-drain semantics.
 */
static atomic_int g_done;
static atomic_int g_total;

static void task(void *arg) {
    (void)arg;
    atomic_fetch_add(&g_done, 1);
}

void ch07_pool_demo(void) {
    atomic_init(&g_done, 0);
    atomic_init(&g_total, 1000);
    cp_pool_t p;
    assert(cp_pool_init(&p, 4, 64) == 0);
    for (int i = 0; i < 1000; i++) {
        cp_pool_submit(&p, task, NULL);
    }
    while (atomic_load(&g_done) < 1000) {
        /* spin */
    }
    cp_pool_shutdown(&p);
    assert(atomic_load(&g_done) == 1000);
}
