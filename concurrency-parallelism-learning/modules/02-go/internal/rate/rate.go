// Package rate implements a token-bucket rate limiter.
package rate

import (
	"context"
	"sync"
	"time"
)

// Limiter is a token-bucket rate limiter.
//
// bucket capacity = burst; refill rate = rate per second.
type Limiter struct {
	mu       sync.Mutex
	rate     float64
	burst    float64
	tokens   float64
	last     time.Time
	notifier chan struct{}
}

// New returns a Limiter that allows `rate` tokens per second and
// bursts of at most `burst` tokens.
func New(rate, burst float64) *Limiter {
	return &Limiter{
		rate:     rate,
		burst:    burst,
		tokens:   burst,
		last:     time.Now(),
		notifier: make(chan struct{}, 1),
	}
}

func (l *Limiter) refill(now time.Time) {
	elapsed := now.Sub(l.last).Seconds()
	l.tokens += elapsed * l.rate
	if l.tokens > l.burst {
		l.tokens = l.burst
	}
	l.last = now
}

// Allow returns true if a token is immediately available.
func (l *Limiter) Allow() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.refill(time.Now())
	if l.tokens >= 1 {
		l.tokens--
		return true
	}
	return false
}

// Wait blocks until a token is available or ctx is cancelled.
func (l *Limiter) Wait(ctx context.Context) error {
	for {
		l.mu.Lock()
		l.refill(time.Now())
		if l.tokens >= 1 {
			l.tokens--
			l.mu.Unlock()
			return nil
		}
		// time until next token
		deficit := 1 - l.tokens
		wait := time.Duration(deficit / l.rate * float64(time.Second))
		l.mu.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
	}
}
