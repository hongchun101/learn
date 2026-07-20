#ifndef CP_SPSC_H
#define CP_SPSC_H

#include <stdatomic.h>
#include <stddef.h>
#include <stdbool.h>
#include <stdint.h>

/* Single-producer single-consumer lock-free ring buffer.
 *
 * Capacity must be a power of two so we can mask the head/tail.
 * head is owned by the producer; tail by the consumer.
 * The memory_order pairs are:
 *   producer:  load(tail, acquire)  /  store(head, release)
 *   consumer:  load(head, acquire)  /  store(tail, release)
 *
 * The reason: the producer must observe the consumer's updates to
 * tail *before* overwriting a slot, and the consumer must observe the
 * producer's updates to head *before* reading a slot.
 */
typedef struct {
    void           **slots;       /* [capacity], owned slot pointers */
    atomic_size_t    head;        /* next slot to write, producer-local */
    atomic_size_t    tail;        /* next slot to read,  consumer-local */
    size_t           capacity;    /* power of two */
    size_t           mask;
} cp_spsc_t;

int  cp_spsc_init(cp_spsc_t *q, size_t capacity);
void cp_spsc_destroy(cp_spsc_t *q);
bool cp_spsc_push(cp_spsc_t *q, void *item);
bool cp_spsc_pop(cp_spsc_t *q, void **out);

#endif
