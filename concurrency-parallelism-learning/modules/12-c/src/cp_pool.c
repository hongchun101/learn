#include "cp_pool.h"
#include <stdlib.h>
#include <string.h>
#include <errno.h>

static void *pool_worker(void *arg) {
    cp_pool_t *p = (cp_pool_t *)arg;
    for (;;) {
        pthread_mutex_lock(&p->mu);
        while (p->size == 0 && !atomic_load(&p->shutdown)) {
            pthread_cond_wait(&p->not_empty, &p->mu);
        }
        if (atomic_load(&p->shutdown) && p->size == 0) {
            pthread_mutex_unlock(&p->mu);
            return NULL;
        }
        cp_pool_task_t *t = p->head;
        p->head = t->next;
        if (p->head == NULL) p->tail = NULL;
        p->size--;
        pthread_cond_signal(&p->not_full);
        pthread_mutex_unlock(&p->mu);
        t->fn(t->arg);
        free(t);
    }
}

int cp_pool_init(cp_pool_t *p, size_t n_threads, size_t queue_capacity) {
    if (n_threads < 1) return EINVAL;
    p->threads = calloc(n_threads, sizeof(pthread_t));
    if (!p->threads) return ENOMEM;
    p->n_threads = n_threads;
    p->capacity  = queue_capacity;
    p->size      = 0;
    p->head      = NULL;
    p->tail      = NULL;
    atomic_init(&p->shutdown, false);
    if (pthread_mutex_init(&p->mu, NULL) != 0) { free(p->threads); return EAGAIN; }
    if (pthread_cond_init(&p->not_empty, NULL) != 0) { pthread_mutex_destroy(&p->mu); free(p->threads); return EAGAIN; }
    if (pthread_cond_init(&p->not_full, NULL) != 0) {
        pthread_cond_destroy(&p->not_empty);
        pthread_mutex_destroy(&p->mu);
        free(p->threads);
        return EAGAIN;
    }
    for (size_t i = 0; i < n_threads; i++) {
        if (pthread_create(&p->threads[i], NULL, pool_worker, p) != 0) {
            return EAGAIN;
        }
    }
    return 0;
}

void cp_pool_shutdown(cp_pool_t *p) {
    atomic_store(&p->shutdown, true);
    pthread_mutex_lock(&p->mu);
    pthread_cond_broadcast(&p->not_empty);
    pthread_mutex_unlock(&p->mu);
    for (size_t i = 0; i < p->n_threads; i++) {
        pthread_join(p->threads[i], NULL);
    }
    free(p->threads);
    pthread_cond_destroy(&p->not_full);
    pthread_cond_destroy(&p->not_empty);
    pthread_mutex_destroy(&p->mu);
}

int cp_pool_submit(cp_pool_t *p, cp_task_fn fn, void *arg) {
    cp_pool_task_t *t = calloc(1, sizeof(*t));
    if (!t) return ENOMEM;
    t->fn = fn;
    t->arg = arg;
    t->next = NULL;
    pthread_mutex_lock(&p->mu);
    while (p->size == p->capacity) {
        pthread_cond_wait(&p->not_full, &p->mu);
    }
    if (p->tail) p->tail->next = t; else p->head = t;
    p->tail = t;
    p->size++;
    pthread_cond_signal(&p->not_empty);
    pthread_mutex_unlock(&p->mu);
    return 0;
}
