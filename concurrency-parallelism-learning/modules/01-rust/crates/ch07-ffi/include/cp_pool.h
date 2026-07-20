/* cp_pool.h — minimal C API for the ch07 Rust thread pool.
 *
 * Usage:
 *   cp_pool_t *p = cp_pool_new(4);
 *   for (int i = 0; i < 100; i++) cp_pool_submit(p, my_fn, my_arg);
 *   cp_pool_shutdown(p);
 *
 * Threading: my_fn is called on a worker thread. It must be thread-safe.
 * No thread is created after cp_pool_new returns; cp_pool_shutdown
 * joins every worker.
 */
#ifndef CP_POOL_H
#define CP_POOL_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct cp_pool_t cp_pool_t;

cp_pool_t *cp_pool_new(int n_threads);
int         cp_pool_submit(cp_pool_t *pool, void (*fn)(void *), void *arg);
void        cp_pool_shutdown(cp_pool_t *pool);

#ifdef __cplusplus
}
#endif

#endif /* CP_POOL_H */
