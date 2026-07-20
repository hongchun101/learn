#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include "cp_atomic.h"

/* Ch02 — mutex and rwlocks. The point of this chapter: the right lock
 * makes a "shared counter" correct under contention; the wrong lock
 * (or no lock) makes it racy and the values are non-deterministic.
 */
static cp_counter_t g_counter;

static void *bump(void *arg) {
    (void)arg;
    for (int i = 0; i < 1000; i++) {
        cp_counter_inc(&g_counter);
    }
    return NULL;
}

void ch02_mutex_demo(void) {
    cp_counter_init(&g_counter, 0);
    pthread_t tids[8];
    for (int i = 0; i < 8; i++) {
        pthread_create(&tids[i], NULL, bump, NULL);
    }
    for (int i = 0; i < 8; i++) pthread_join(tids[i], NULL);
    /* relaxed atomics + relaxed increment: on x86 this still gives 8000
     * for the fetch_add op; on weaker architectures it would not, and
     * you would need an explicit memory_order_acq_rel. The point is the
     * *atomicity* of the increment, not the order of unrelated reads. */
    assert(cp_counter_get(&g_counter) == 8000);
}
