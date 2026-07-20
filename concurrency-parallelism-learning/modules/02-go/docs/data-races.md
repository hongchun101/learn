# Data races in Go

A *data race* is two or more goroutines accessing the same memory
location, at least one of which is a write, with no synchronisation
between them. Data races are bugs; the Go race detector finds them.

## Running the race detector

```bash
go test -race ./...
go run -race main.go
go build -race
```

The `-race` flag instruments every memory access with bookkeeping
that records the goroutine ID and the access time. At sync points
(lock unlock, channel send/receive, etc.) the detector checks for
unsynchronised concurrent access to the same address. The cost is
~2-20x slowdown and ~5-10x memory, so it's not for production but
*is* for every test, every CI run, every fuzz session.

## Common races

### 1. Loop variable (pre-Go 1.22)

```go
for _, v := range items {
    go func() { fmt.Println(v) }()  // race
}
```

Fix: pass the variable explicitly, or upgrade to Go 1.22+.

### 2. Map mutation

```go
go func() { m["a"] = 1 }()
go func() { _ = m["b"] }()         // race
```

Fix: protect with a `sync.Mutex`, or use `sync.Map`.

### 3. Slice append

```go
go func() { xs = append(xs, 1) }()  // race on slice header
```

Fix: pre-allocate, then fill in a critical section; or send over a
channel.

### 4. `time.After` in a hot loop

```go
for {
    select {
    case <-time.After(time.Second):  // allocates a Timer each iter
    case <-done:
    }
}
```

`time.After` allocates a new `Timer` on every call. The timer
goroutine keeps it alive until it fires. For long-running loops, use
`time.NewTicker` and `ticker.Stop()`.

## What `-race` does NOT find

The race detector is dynamic: it only finds races that actually
happen during the run. To find more races:

- Test with `-race` enabled.
- Use `go test -race -count=10` to run multiple times.
- Run under high load with realistic workloads.
- Use `go test -race -cpu=1,2,4,8` to vary GOMAXPROCS.
- For deeper coverage, use the race detector with `go test -race -short=false -v`.

The race detector also doesn't reason about logic errors. A
synchronisation primitive can be present but used incorrectly, and
the detector won't tell you.

## Production guidance

- Run every test with `-race` in CI.
- Run your fuzz tests with `-race` (Go 1.18+).
- For very hot paths, instrument with `runtime/trace` to see *what*
  the goroutines did. The trace view shows every goroutine's state
  transitions and every channel/lock event.
- For post-mortem debugging, capture `SIGQUIT` to dump every
  goroutine's stack: `kill -QUIT $pid`.
