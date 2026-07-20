#include <stdio.h>
#include <stdlib.h>
#include <assert.h>

/* Ch05 — OpenMP: shared-memory data parallelism.
 *
 * Compile with -fopenmp. The runtime creates a team of threads; the
 * iterations of a `for` loop are distributed across them according
 * to the schedule clause.
 */
void ch05_openmp_demo(void) {
    if (1) {
        long sum = 0;
        const int n = 1_000_000;
        int *xs = malloc(sizeof(int) * n);
        for (int i = 0; i < n; i++) xs[i] = i + 1;
        #pragma omp parallel for reduction(+:sum) schedule(static)
        for (int i = 0; i < n; i++) {
            sum += xs[i];
        }
        assert(sum == ((long)n * (n + 1)) / 2);
        free(xs);
    }
}
