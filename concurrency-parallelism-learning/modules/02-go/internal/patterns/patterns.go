// Package patterns bundles idiomatic Go examples for the canonical
// patterns in the cross-language contract.
package patterns

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
	"golang.org/x/sync/semaphore"
	"golang.org/x/sync/singleflight"

	"github.com/learn/cp/internal/barrier"
	"github.com/learn/cp/internal/fanout"
	"github.com/learn/cp/internal/mpmc"
	"github.com/learn/cp/internal/pipeline"
	"github.com/learn/cp/internal/rate"
	"github.com/learn/cp/internal/reduce"
)

// ProducerConsumer is the canonical pattern: a producer goroutine
// writes to a channel; one or more consumers read.
func ProducerConsumer(n int) int {
	ch := make(chan int, 16)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Close()
		defer close(ch)
		for i := 0; i < n; i++ {
			ch <- i
		}
	}()
	var sum int
	var mu sync.Mutex
	for c := 0; c < 4; c++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for v := range ch {
				mu.Lock()
				sum += v
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	return sum
}

// ErrGroupExample shows errgroup.Group: any error cancels the others.
func ErrGroupExample(ctx context.Context, urls []string) ([]string, error) {
	g, gctx := errgroup.WithContext(ctx)
	out := make([]string, len(urls))
	for i, u := range urls {
		i, u := i, u
		g.Go(func() error {
			// simulate work
			select {
			case <-time.After(time.Millisecond):
				out[i] = "ok:" + u
				return nil
			case <-gctx.Done():
				return gctx.Err()
			}
		})
	}
	if err := g.Wait(); err != nil {
		return nil, err
	}
	return out, nil
}

// SingleflightExample shows singleflight.Group: collapse concurrent
// requests for the same key into one.
func SingleflightExample(sf *singleflight.Group, key string) (any, error, bool) {
	v, err, shared := sf.Do(key, func() (any, error) {
		return 42, nil
	})
	return v, err, shared
}

// SemaphoreExample shows golang.org/x/sync/semaphore for a bounded
// concurrency limit.
func SemaphoreExample(ctx context.Context, n int) error {
	sem := semaphore.NewWeighted(4)
	var err error
	for i := 0; i < n; i++ {
		if err = sem.Acquire(ctx, 1); err != nil {
			return err
		}
		go func(i int) {
			defer sem.Release(1)
			time.Sleep(time.Millisecond)
		}(i)
	}
	return nil
}

// CircuitBreaker is a small example.
type CircuitBreaker struct {
	mu              sync.Mutex
	failures        int
	threshold       int
	cooldown        time.Duration
	openUntil       time.Time
}

func (cb *CircuitBreaker) Allow() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	if time.Now().Before(cb.openUntil) {
		return false
	}
	return true
}

func (cb *CircuitBreaker) Record(success bool) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	if success {
		cb.failures = 0
		return
	}
	cb.failures++
	if cb.failures >= cb.threshold {
		cb.openUntil = time.Now().Add(cb.cooldown)
		cb.failures = 0
	}
}

// RunAll runs the six cross-language tasks in one process and returns
// a human-readable report.
func RunAll(ctx context.Context) string {
	var b string
	// 1. fan-out
	fo := fanout.Run(ctx, []int{0, 1, 2, 3, 4}, 2,
		func(_ context.Context, v int) (int, error) { return v * 2, nil },
		func(err error) { b += "fanout-err: " + err.Error() + "\n" })
	b += fmt.Sprintf("1. fan-out: %v\n", fo)

	// 2. pipeline
	src := pipeline.NewSource(ctx, []int{0, 1, 2, 3})
	stages := []pipeline.Stage[int]{
		func(_ context.Context, x int) (int, error) { return x + 1, nil },
		func(_ context.Context, x int) (int, error) { return x * 2, nil },
		func(_ context.Context, x int) (int, error) { return x - 3, nil },
	}
	sink, get := pipeline.NewSink[int](16)
	_ = pipeline.Run(ctx, src, stages, sink)
	b += fmt.Sprintf("2. pipeline: %v\n", get())

	// 3. rate limit
	lim := rate.New(200, 200)
	start := time.Now()
	count := 0
	for time.Since(start) < 100*time.Millisecond {
		if lim.Allow() {
			count++
		} else {
			time.Sleep(time.Microsecond)
		}
	}
	b += fmt.Sprintf("3. rate-limit: %d items in 100ms\n", count)

	// 4. barrier
	br := barrier.New(4)
	var wg sync.WaitGroup
	released := make(chan struct{}, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = br.ArriveAndWait(ctx)
			released <- struct{}{}
		}()
	}
	wg.Wait()
	close(released)
	count = 0
	for range released {
		count++
	}
	b += fmt.Sprintf("4. barrier: %d released\n", count)

	// 5. MPMC
	q := mpmc.New[int](4)
	for i := 0; i < 100; i++ {
		_ = q.EnqueueNow(i)
	}
	collected := 0
	for {
		if v, ok := q.Dequeue(10 * time.Millisecond); ok {
			if v == collected {
				collected++
			} else {
				b += fmt.Sprintf("5. mpmc: ordering broken at %d\n", v)
				break
			}
		} else {
			break
		}
	}
	b += fmt.Sprintf("5. mpmc: %d items in order\n", collected)

	// 6. parallel reduce
	xs := make([]int, 1000)
	for i := range xs {
		xs[i] = i + 1
	}
	got, err := reduce.Reduce(ctx, xs, 8, func(a, b int) int { return a + b }, 0)
	if err != nil && !errors.Is(err, context.Canceled) {
		b += fmt.Sprintf("6. reduce: error %v\n", err)
	} else {
		expected := 1000 * 1001 / 2
		ok := got == expected
		b += fmt.Sprintf("6. reduce: got=%d expected=%d ok=%v\n", got, expected, ok)
	}

	return b
}
