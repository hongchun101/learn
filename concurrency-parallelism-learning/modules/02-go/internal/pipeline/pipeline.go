// Package pipeline implements a generic N-stage streaming pipeline.
package pipeline

import "context"

// Stage is a single transformation in the pipeline.
type Stage[T any] func(context.Context, T) (T, error)

// Source emits the initial values.
type Source[T any] <-chan T

// Sink consumes the final values.
type Sink[T any] func(T) error

// NewSource returns a channel that emits each value of xs and closes
// when done.
func NewSource[T any](ctx context.Context, xs []T) Source[T] {
	ch := make(chan T, len(xs))
	go func() {
		defer close(ch)
		for _, v := range xs {
			select {
			case <-ctx.Done():
				return
			case ch <- v:
			}
		}
	}()
	return ch
}

// NewSink returns a Sink that appends to the given slice (in a
// goroutine-safe way using a channel).
func NewSink[T any](cap int) (Sink[T], func() []T) {
	out := make(chan T, cap)
	done := make(chan struct{})
	var collected []T
	go func() {
		for v := range out {
			collected = append(collected, v)
		}
		close(done)
	}()
	return func(v T) error {
			out <- v
			return nil
		}, func() []T {
			close(out)
			<-done
			return collected
		}
}

// Run wires a source through each stage in order and emits to sink.
func Run[T any](ctx context.Context, src Source[T], stages []Stage[T], sink Sink[T]) error {
	for _, stage := range stages {
		src = runStage(ctx, src, stage)
	}
	for v := range src {
		if err := sink(v); err != nil {
			return err
		}
	}
	return nil
}

func runStage[T any](ctx context.Context, in Source[T], stage Stage[T]) Source[T] {
	out := make(chan T)
	go func() {
		defer close(out)
		for v := range in {
			r, err := stage(ctx, v)
			if err != nil {
				return
			}
			select {
			case <-ctx.Done():
				return
			case out <- r:
			}
		}
	}()
	return out
}
