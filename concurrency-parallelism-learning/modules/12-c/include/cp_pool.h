#ifndef CP_POOL_H
#define CP_POOL_H

#include <pthread.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stddef.h>

/* Simple thread pool with a bounded work queue. The same shape is
 * implemented in every other language module. */
typedef void (*cp_task_fn)(void *arg);

typedef struct cp_pool_task_s {
    cp_task_fn            fn;
    void                 *arg;
    struct cp_pool_task_s *next;
} cp_pool_task_t;

typedef struct {
    pthread_t            *threads;
    size_t                n_threads;

    cp_pool_task_t       *head;          /* producer pushes at tail */
    cp_pool_task_t       *tail;
    pthread_mutex_t       mu;
    pthread_cond_t        not_empty;
    pthread_cond_t        not_full;

    size_t                capacity;
    size_t                size;
    atomic_bool           shutdown;
} cp_pool_t;

int  cp_pool_init(cp_pool_t *p, size_t n_threads, size_t queue_capacity);
void cp_pool_shutdown(cp_pool_t *p);
int  cp_pool_submit(cp_pool_t *p, cp_task_fn fn, void *arg);

#endif
