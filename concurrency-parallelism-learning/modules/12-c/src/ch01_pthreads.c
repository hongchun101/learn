#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include "cp_atomic.h"

/* Ch01 — pthreads: spawn, join, return value. */
static void *worker(void *arg) {
    (void)arg;
    static __thread int tls = 0;
    tls++;
    return (void *)(intptr_t)tls;
}

void ch01_pthreads_demo(void) {
    pthread_t tids[4];
    for (int i = 0; i < 4; i++) {
        int rc = pthread_create(&tids[i], NULL, worker, NULL);
        assert(rc == 0);
    }
    for (int i = 0; i < 4; i++) {
        void *rv = NULL;
        pthread_join(tids[i], &rv);
        assert((intptr_t)rv == 1);
    }
}
