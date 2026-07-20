#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <unistd.h>

/* Ch03 — condition variables: the canonical "producer / consumer"
 * with bounded queue.
 */
static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t  not_empty = PTHREAD_COND_INITIALIZER;
static pthread_cond_t  not_full  = PTHREAD_COND_INITIALIZER;
static int             buf[16];
static int             count = 0;
static int             head  = 0;
static int             tail  = 0;

static void put(int v) {
    pthread_mutex_lock(&mu);
    while (count == 16) pthread_cond_wait(&not_full, &mu);
    buf[tail] = v;
    tail = (tail + 1) % 16;
    count++;
    pthread_cond_signal(&not_empty);
    pthread_mutex_unlock(&mu);
}

static int get(void) {
    pthread_mutex_lock(&mu);
    while (count == 0) pthread_cond_wait(&not_empty, &mu);
    int v = buf[head];
    head = (head + 1) % 16;
    count--;
    pthread_cond_signal(&not_full);
    pthread_mutex_unlock(&mu);
    return v;
}

static void *producer(void *arg) {
    (void)arg;
    for (int i = 0; i < 100; i++) put(i);
    return NULL;
}

static void *consumer(void *arg) {
    (void)arg;
    int sum = 0;
    for (int i = 0; i < 100; i++) sum += get();
    return (void *)(intptr_t)sum;
}

void ch03_condvar_demo(void) {
    pthread_t p, c;
    pthread_create(&p, NULL, producer, NULL);
    pthread_create(&c, NULL, consumer, NULL);
    pthread_join(p, NULL);
    void *rv = NULL;
    pthread_join(c, &rv);
    int sum = (int)(intptr_t)rv;
    assert(sum == (99 * 100) / 2);
}
