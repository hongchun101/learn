#ifndef CP_ATOMIC_H
#define CP_ATOMIC_H

#include <stdatomic.h>
#include <stddef.h>
#include <stdint.h>

/* Spin-loop hint. The CPU may back off. */
#define cp_pause() __builtin_annotate("noop", ) /* placeholder; in real code use _mm_pause() */

/* Acquire fence: every load/store after this stays after. */
static inline void cp_acquire_fence(void) {
    atomic_thread_fence(memory_order_acquire);
}

/* Release fence: every load/store before this stays before. */
static inline void cp_release_fence(void) {
    atomic_thread_fence(memory_order_release);
}

/* Full seq_cst fence. */
static inline void cp_seq_cst_fence(void) {
    atomic_thread_fence(memory_order_seq_cst);
}

/* Atomic counter with relaxed semantics; the increment is the
 * synchronisation itself (only atomicity matters). */
typedef struct {
    atomic_size_t v;
} cp_counter_t;

static inline void cp_counter_init(cp_counter_t *c, size_t init) {
    atomic_init(&c->v, init);
}

static inline size_t cp_counter_inc(cp_counter_t *c) {
    return atomic_fetch_add_explicit(&c->v, 1, memory_order_relaxed) + 1;
}

static inline size_t cp_counter_get(cp_counter_t *c) {
    return atomic_load_explicit(&c->v, memory_order_relaxed);
}

#endif /* CP_ATOMIC_H */
