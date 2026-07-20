// Package fanout implements generic, order-preserving fan-out / fan-in.
package fanout

import (
	"context"
	"sync"
)

// Run distributes inputs across at most `workers` goroutines and
// returns outputs in input order. The first worker error is reported
// via onError and cancels the remaining workers.
func Run[I, O any](ctx context.Context, inputs []I, workers int, work func(context.Context, I) (O, error), onError func(error)) []O {
	if len(inputs) == 0 {
		return []O{}
	}
	if workers < 1 {
		workers = 1
	}
	if workers > len(inputs) {
		workers = len(inputs)
	}
	out := make([]O, len(inputs))
	sem := make(chan struct{}, workers)
	errCh := make(chan error, 1)
	var wg sync.WaitGroup
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	for i, v := range inputs {
		select {
		case <-ctx.Done():
			return out
		default:
		}
		i, v := i, v
		sem <- struct{}{}
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			select {
			case <-ctx.Done():
				return
			default:
			}
			r, err := work(ctx, v)
			if err != nil {
				select {
				case errCh <- err:
				default:
				}
				cancel()
				return
			}
			out[i] = r
		}()
	}
	wg.Wait()
	select {
	case e := <-errCh:
		if onError != nil {
			onError(e)
		}
	default:
	}
	return out
}
