#ifndef CP_PATTERNS_H
#define CP_PATTERNS_H

#include "cp_mpmc.h"
#include "cp_pool.h"
#include <stddef.h>

/* The six cross-language tasks. Each function mirrors the contract
 * from ../../src/cross-lang/contracts.ts.
 */

typedef void *(*cp_map_fn)(void *arg);          /* work item -> result */
typedef void *(*cp_combine_fn)(void *a, void *b);

void *cp_patterns_fan_out(void *arg);
void *cp_patterns_pipeline(void *arg);
void *cp_patterns_rate_limit(void *arg);
void *cp_patterns_barrier(void *arg);
void *cp_patterns_parallel_reduce(void *arg);

#endif
