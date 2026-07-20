#include "cp_spsc.h"
#include <stdlib.h>
#include <string.h>
#include <assert.h>

static size_t next_pow2(size_t n) {
    size_t p = 1;
    while (p < n) p <<= 1;
    return p;
}

int cp_spsc_init(cp_spsc_t *q, size_t capacity) {
    capacity = next_pow2(capacity);
    if (capacity < 2) capacity = 2;
    q->slots    = calloc(capacity, sizeof(void *));
    if (!q->slots) return -1;
    q->capacity = capacity;
    q->mask     = capacity - 1;
    atomic_init(&q->head, 0);
    atomic_init(&q->tail, 0);
    return 0;
}

void cp_spsc_destroy(cp_spsc_t *q) {
    free(q->slots);
    q->slots = NULL;
}

bool cp_spsc_push(cp_spsc_t *q, void *item) {
    size_t head = atomic_load_explicit(&q->head, memory_order_relaxed);
    size_t tail = atomic_load_explicit(&q->tail, memory_order_acquire);
    if ((head - tail) >= q->capacity) return false;
    q->slots[head & q->mask] = item;
    atomic_store_explicit(&q->head, head + 1, memory_order_release);
    return true;
}

bool cp_spsc_pop(cp_spsc_t *q, void **out) {
    size_t tail = atomic_load_explicit(&q->tail, memory_order_relaxed);
    size_t head = atomic_load_explicit(&q->head, memory_order_acquire);
    if (tail >= head) return false;
    *out = q->slots[tail & q->mask];
    atomic_store_explicit(&q->tail, tail + 1, memory_order_release);
    return true;
}
