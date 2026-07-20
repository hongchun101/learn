// Package barrier implements a reusable N-party rendezvous.
package barrier

import (
	"context"
	"sync"
)

// Barrier is a reusable N-party rendezvous. ArriveAndWait blocks
// until N callers have arrived, then releases all of them. The same
// Barrier value can serve many rounds.
type Barrier struct {
	mu      sync.Mutex
	n       int
	arrived int
	release chan struct{}
}

// New returns a Barrier for `n` parties.
func New(n int) *Barrier {
	return &Barrier{n: n, release: make(chan struct{})}
}

// ArriveAndWait blocks until N parties have arrived.
func (b *Barrier) ArriveAndWait(ctx context.Context) error {
	b.mu.Lock()
	b.arrived++
	if b.arrived == b.n {
		close(b.release)
		ch := make(chan struct{})
		b.release = ch
		b.arrived = 0
		b.mu.Unlock()
		// Waiters will block on the new channel. Notify them by closing it.
		close(ch)
		return nil
	}
	rel := b.release
	b.mu.Unlock()
	select {
	case <-rel:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
