#include "cp_mpmc.h"
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <errno.h>

/* Sentinel head/tail nodes. The queue is the segment between them. */
static cp_mpmc_node_t *node_new(void *v) {
    cp_mpmc_node_t *n = calloc(1, sizeof(*n));
    if (!n) return NULL;
    n->value = v;
    n->next  = NULL;
    return n;
}

int cp_mpmc_init(cp_mpmc_t *q, size_t capacity) {
    if (capacity < 1) return EINVAL;
    cp_mpmc_node_t *sentinel = node_new(NULL);
    if (!sentinel) return ENOMEM;
    q->head     = sentinel;
    q->tail     = sentinel;
    q->size     = 0;
    q->capacity = capacity;
    q->closed   = false;
    if (pthread_mutex_init(&q->mu, NULL) != 0) { free(sentinel); return EAGAIN; }
    if (pthread_cond_init(&q->not_empty, NULL) != 0) {
        pthread_mutex_destroy(&q->mu);
        free(sentinel);
        return EAGAIN;
    }
    if (pthread_cond_init(&q->not_full, NULL) != 0) {
        pthread_cond_destroy(&q->not_empty);
        pthread_mutex_destroy(&q->mu);
        free(sentinel);
        return EAGAIN;
    }
    return 0;
}

void cp_mpmc_destroy(cp_mpmc_t *q) {
    /* Drain. */
    cp_mpmc_node_t *n = q->head;
    while (n) {
        cp_mpmc_node_t *next = n->next;
        free(n);
        n = next;
    }
    pthread_cond_destroy(&q->not_full);
    pthread_cond_destroy(&q->not_empty);
    pthread_mutex_destroy(&q->mu);
}

int cp_mpmc_enqueue(cp_mpmc_t *q, void *v) {
    pthread_mutex_lock(&q->mu);
    while (q->size == q->capacity && !q->closed) {
        pthread_cond_wait(&q->not_full, &q->mu);
    }
    if (q->closed) {
        pthread_mutex_unlock(&q->mu);
        return -1;
    }
    cp_mpmc_node_t *n = node_new(v);
    if (!n) {
        pthread_mutex_unlock(&q->mu);
        return ENOMEM;
    }
    q->tail->next = n;
    q->tail = n;
    q->size++;
    pthread_cond_signal(&q->not_empty);
    pthread_mutex_unlock(&q->mu);
    return 0;
}

static void add_ms_to_timespec(struct timespec *ts, int ms) {
    ts->tv_sec  += ms / 1000;
    ts->tv_nsec += (long)(ms % 1000) * 1000000L;
    if (ts->tv_nsec >= 1000000000L) {
        ts->tv_sec  += ts->tv_nsec / 1000000000L;
        ts->tv_nsec %= 1000000000L;
    }
}

int cp_mpmc_dequeue(cp_mpmc_t *q, void **v, int timeout_ms) {
    struct timespec deadline;
    clock_gettime(CLOCK_REALTIME, &deadline);
    add_ms_to_timespec(&deadline, timeout_ms);

    pthread_mutex_lock(&q->mu);
    while (q->size == 0 && !q->closed) {
        int rc = pthread_cond_timedwait(&q->not_empty, &q->mu, &deadline);
        if (rc == ETIMEDOUT) {
            pthread_mutex_unlock(&q->mu);
            return -1;
        }
    }
    if (q->size == 0) {
        pthread_mutex_unlock(&q->mu);
        return -1;        /* closed and empty */
    }
    cp_mpmc_node_t *first = q->head->next;
    *v = first->value;
    q->head->next = first->next;
    if (q->tail == first) q->tail = q->head;
    free(first);
    q->size--;
    pthread_cond_signal(&q->not_full);
    pthread_mutex_unlock(&q->mu);
    return 0;
}

void cp_mpmc_close(cp_mpmc_t *q) {
    pthread_mutex_lock(&q->mu);
    q->closed = true;
    pthread_cond_broadcast(&q->not_empty);
    pthread_cond_broadcast(&q->not_full);
    pthread_mutex_unlock(&q->mu);
}
