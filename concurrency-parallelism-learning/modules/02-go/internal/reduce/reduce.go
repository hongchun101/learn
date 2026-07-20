// Package reduce implements generic parallel reduce.
package reduce

import (
	"context"
	"sync"
)

// Reduce splits inputs into p chunks, reduces each sequentially, then
// combines the partials in order. For an associative op, the result
// equals the sequential reduce.
func Reduce[T any](ctx context.Context, inputs []T, p int, combine func(a, b T) T, seed T) (T, error) {
	if len(inputs) == 0 {
		return seed, nil
	}
	if p < 1 {
		p = 1
	}
	if p > len(inputs) {
		p = len(inputs)
	}
	chunkSize := (len(inputs) + p - 1) / p
	partials := make([]T, p)
	var wg sync.WaitGroup
	errCh := make(chan error, p)
	for i := 0; i < p; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			from := i * chunkSize
			to := from + chunkSize
			if to > len(inputs) {
				to = len(inputs)
			}
			if from >= to {
				partials[i] = seed
				return
			}
			acc := inputs[from]
			for j := from + 1; j < to; j++ {
				select {
				case <-ctx.Done():
					errCh <- ctx.Err()
					return
				default:
				}
				acc = combine(acc, inputs[j])
			}
			partials[i] = acc
		}()
	}
	wg.Wait()
	close(errCh)
	for e := range errCh {
		if e != nil {
			var zero T
			return zero, e
		}
	}
	acc := partials[0]
	for i := 1; i < p; i++ {
		acc = combine(acc, partials[i])
	}
	return acc, nil
}
