package patterns

import (
	"context"
	"testing"
	"time"

	"github.com/learn/cp/internal/barrier"
	"github.com/learn/cp/internal/fanout"
	"github.com/learn/cp/internal/mpmc"
	"github.com/learn/cp/internal/pipeline"
	"github.com/learn/cp/internal/rate"
	"github.com/learn/cp/internal/reduce"
)

func TestFanOutPreservesOrder(t *testing.T) {
	inputs := make([]int, 100)
	for i := range inputs {
		inputs[i] = i
	}
	out := fanout.Run(context.Background(), inputs, 16,
		func(_ context.Context, v int) (int, error) { return v * 2, nil },
		nil)
	for i, v := range out {
		if v != i*2 {
			t.Fatalf("at %d: got %d, want %d", i, v, i*2)
		}
	}
}

func TestPipelineAppliesInOrder(t *testing.T) {
	src := pipeline.NewSource(context.Background(), []int{0, 1, 2, 3})
	stages := []pipeline.Stage[int]{
		func(_ context.Context, x int) (int, error) { return x + 1, nil },
		func(_ context.Context, x int) (int, error) { return x * 2, nil },
		func(_ context.Context, x int) (int, error) { return x - 3, nil },
	}
	sink, get := pipeline.NewSink[int](16)
	if err := pipeline.Run(context.Background(), src, stages, sink); err != nil {
		t.Fatal(err)
	}
	want := []int{-1, 1, 3, 5}
	got := get()
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("at %d: got %d, want %d", i, got[i], want[i])
		}
	}
}

func TestRateLimitProducesInBand(t *testing.T) {
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
	if count < 15 || count > 30 {
		t.Fatalf("expected 15..30, got %d", count)
	}
}

func TestBarrierReleasesAll(t *testing.T) {
	br := barrier.New(4)
	released := make(chan struct{}, 4)
	for i := 0; i < 4; i++ {
		go func() {
			_ = br.ArriveAndWait(context.Background())
			released <- struct{}{}
		}()
	}
	got := 0
	timeout := time.After(time.Second)
	for got < 4 {
		select {
		case <-released:
			got++
		case <-timeout:
			t.Fatalf("only %d/4 released", got)
		}
	}
}

func TestMpmcRoundTrip(t *testing.T) {
	q := mpmc.New[int](4)
	producers, consumers, per := 3, 4, 100
	done := make(chan struct{}, producers+consumers)
	for p := 0; p < producers; p++ {
		go func(p int) {
			for i := 0; i < per; i++ {
				for {
					err := q.EnqueueNow(p*1000 + i)
					if err == nil {
						break
					}
					time.Sleep(time.Microsecond)
				}
			}
			done <- struct{}{}
		}(p)
	}
	total := producers * per
	per_consumer := total / consumers
	for c := 0; c < consumers; c++ {
		go func() {
			received := 0
			for received < per_consumer {
				if _, ok := q.Dequeue(time.Second); ok {
					received++
				}
			}
			done <- struct{}{}
		}()
	}
	for i := 0; i < producers+consumers; i++ {
		<-done
	}
}

func TestParallelReduce(t *testing.T) {
	xs := make([]int, 1000)
	for i := range xs {
		xs[i] = i + 1
	}
	expected := 1000 * 1001 / 2
	for _, p := range []int{1, 2, 4, 8, 16, 32, 100} {
		got, err := reduce.Reduce(context.Background(), xs, p, func(a, b int) int { return a + b }, 0)
		if err != nil {
			t.Fatal(err)
		}
		if got != expected {
			t.Fatalf("p=%d: got %d, want %d", p, got, expected)
		}
	}
}
