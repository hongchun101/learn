// Package mpmc implements a bounded MPMC queue wrapping a buffered channel.
package mpmc

import (
	"context"
	"errors"
	"sync/atomic"
	"time"
)

// ErrClosed is returned by Enqueue / Dequeue when the queue is closed.
var ErrClosed = errors.New("queue closed")

// ErrTimeout is returned by Dequeue when the timeout expires.
var ErrTimeout = errors.New("dequeue timeout")

// Queue is a bounded MPMC queue.
type Queue[T any] struct {
	ch     chan T
	closed atomic.Bool
}

// New returns a queue with the given capacity.
func New[T any](capacity int) *Queue[T] {
	if capacity < 1 {
		capacity = 1
	}
	return &Queue[T]{ch: make(chan T, capacity)}
}

// Enqueue blocks until there is room or the queue is closed.
func (q *Queue[T]) Enqueue(ctx context.Context, v T) error {
	if q.closed.Load() {
		return ErrClosed
	}
	defer func() {
		// Drain a panic if it happens after closed
		_ = recover()
	}()
	select {
	case q.ch <- v:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// EnqueueNow is non-blocking.
func (q *Queue[T]) EnqueueNow(v T) error {
	if q.closed.Load() {
		return ErrClosed
	}
	select {
	case q.ch <- v:
		return nil
	default:
		return ErrTimeout
	}
}

// Dequeue returns an item or ok=false if timeout / closed.
func (q *Queue[T]) Dequeue(timeout time.Duration) (T, bool) {
	if timeout <= 0 {
		select {
		case v, ok := <-q.ch:
			return v, ok
		default:
			var zero T
			return zero, false
		}
	}
	t := time.NewTimer(timeout)
	defer t.Stop()
	select {
	case v, ok := <-q.ch:
		return v, ok
	case <-t.C:
		var zero T
		return zero, false
	}
}

// Close prevents further Enqueues; Dequeue drains.
func (q *Queue[T]) Close() {
	q.closed.Store(true)
}

// Len returns the current number of queued items.
func (q *Queue[T]) Len() int { return len(q.ch) }

// Cap returns the capacity.
func (q *Queue[T]) Cap() int { return cap(q.ch) }
