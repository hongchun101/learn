#ifndef CP_MPMC_H
#define CP_MPMC_H

#include <pthread.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stddef.h>

/* Bounded MPMC queue using one mutex and a circular buffer.
 * The same shape appears in every other language module. */
typedef struct cp_mpmc_node_s {
    void                   *value;
    struct cp_mpmc_node_s  *next;
} cp_mpmc_node_t;

typedef struct {
    cp_mpmc_node_t  *head;
    cp_mpmc_node_t  *tail;
    pthread_mutex_t  mu;
    pthread_cond_t   not_empty;
    pthread_cond_t   not_full;
    size_t           size;
    size_t           capacity;
    bool             closed;
} cp_mpmc_t;

int  cp_mpmc_init(cp_mpmc_t *q, size_t capacity);
void cp_mpmc_destroy(cp_mpmc_t *q);
int  cp_mpmc_enqueue(cp_mpmc_t *q, void *v);    /* blocks if full */
int  cp_mpmc_dequeue(cp_mpmc_t *q, void **v, int timeout_ms);
void cp_mpmc_close(cp_mpmc_t *q);

#endif
