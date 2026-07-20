#ifndef CP_BARRIER_H
#define CP_BARRIER_H

#include <pthread.h>

typedef pthread_barrier_t cp_barrier_t;

static inline int cp_barrier_init(cp_barrier_t *b, unsigned count) {
    return pthread_barrier_init(b, NULL, count);
}

static inline int cp_barrier_wait(cp_barrier_t *b) {
    return pthread_barrier_wait(b);
}

static inline int cp_barrier_destroy(cp_barrier_t *b) {
    return pthread_barrier_destroy(b);
}

#endif
