# Go — concurrency & parallelism (Ch02)

Go 1.22. The Go story is "goroutines + channels", the canonical CSP
model, with a memory model that says "send on ch happens-before receive
on ch". Plus `sync.Mutex`, `sync.WaitGroup`, `context.Context`, and
`golang.org/x/sync` (`errgroup`, `singleflight`, `semaphore`).

## What an expert can do after this module

- Reason about goroutine leaks: every `go` must have an exit path; the
  compiler cannot tell you this.
- Use `context.Context` everywhere cancellation matters; the convention
  is `ctx, cancel := context.WithCancel(parent)` followed by `defer cancel()`.
- Use `errgroup.Group` for fan-out-with-error-aggregation: any error
  cancels the others.
- Run `go test -race` to surface data races; a race-free build is
  *required* for production services.
- Read and write the Go memory model by heart.
- Use `sync.Once`, `sync.OnceValue`, `atomic.Pointer[T]`, `sync/atomic.Int64`,
  `sync.RWMutex`, `sync.Cond`, `sync.Pool`, `golang.org/x/sync/semaphore`,
  `golang.org/x/sync/singleflight`.

## Layout

```
modules/02-go/
├── go.mod
├── go.sum
├── Makefile
├── README.md
├── cmd/
│   ├── fanout/main.go
│   ├── pipeline/main.go
│   └── patterns/main.go          (runs the six cross-language tasks)
├── internal/
│   ├── fanout/fanout.go
│   ├── pipeline/pipeline.go
│   ├── rate/rate.go
│   ├── barrier/barrier.go
│   ├── mpmc/mpmc.go
│   ├── reduce/reduce.go
│   └── patterns/
│       ├── patterns.go
│       └── patterns_test.go
└── docs/
    ├── memory-model.md           (≥200 lines, quotes the official Go memory model)
    ├── context-cancellation.md
    ├── select-vs-channels.md
    ├── errgroup.md
    └── data-races.md
```

## How to run

```bash
cd modules/02-go
go vet ./...
go test -race ./...
```

The local build host does not have Go installed. The code is reviewed
by inspection. Install: `https://go.dev/dl/`

## Cross-language task implementations

`internal/patterns/patterns.go` and `internal/patterns/patterns_test.go`
implement the six tasks in idiomatic Go and assert the same properties
as the TypeScript reference.

## Memory model

Read `docs/memory-model.md` in full. The two rules you will use most:

- "A send on a channel happens-before the corresponding receive from
  that channel completes."
- "The `go` statement that starts a new goroutine happens-before the
  goroutine's execution begins."

These two rules mean: messages you send before `go f()` are visible to
`f`, and messages you send to a channel are visible to the receiver.
Everything else needs explicit synchronisation (`sync.Mutex`,
`atomic.Load/Store`, etc.).
