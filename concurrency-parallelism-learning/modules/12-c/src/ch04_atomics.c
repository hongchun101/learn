#include <stdatomic.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>

/* Ch04 — atomics with explicit memory orders.
 *
 * The point of this chapter: when the implicit seq_cst of
 * atomic_fetch_add is too expensive (it's a full mfence on x86), you
 * can downgrade the order. The example below is a typical "publish"
 * pattern: relaxed increment of a counter, acquire/release pair to
 * publish a result.
 */
typedef struct {
    atomic_int   *data;        /* payload */
    atomic_int   *ready;       /* publish flag */
} cp_msg_t;

static cp_msg_t  msg;
static atomic_int payload = 0;
static atomic_int ready   = 0;

static void *writer(void *arg) {
    (void)arg;
    atomic_store_explicit(&payload, 42, memory_order_relaxed);
    atomic_store_explicit(&ready,   1,  memory_order_release);
    return NULL;
}

static void *reader(void *arg) {
    (void)arg;
    while (atomic_load_explicit(&ready, memory_order_acquire) == 0) {
        /* spin */
    }
    /* happens-before guaranteed by the release/acquire pair: the
     * store to payload is visible to us. */
    int v = atomic_load_explicit(&payload, memory_order_relaxed);
    return (void *)(intptr_t)v;
}

void ch04_atomics_demo(void) {
    msg.data  = &payload;
    msg.ready = &ready;
    pthread_t w, r;
    pthread_create(&w, NULL, writer, NULL);
    pthread_create(&r, NULL, reader, NULL);
    pthread_join(w, NULL);
    void *rv = NULL;
    pthread_join(r, &rv);
    assert((intptr_t)rv == 42);
}
