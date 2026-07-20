# Go memory model

The Go memory model is a *contract* between the language, the runtime,
and the programmer. It says: "given this sequence of operations, the
runtime is required to behave as if they happened in this order; you
are guaranteed to see this state." Anything *not* covered by the model
is undefined behaviour.

The official spec is at <https://go.dev/ref/mem>. This document quotes
its most important parts and explains what they mean in practice.

## The happens-before relation

The Go memory model defines a partial order called *happens-before* on
goroutine events. Reads and writes happen on goroutines; the rules
below establish edges in the happens-before graph.

### Rule 1 — creation

> "The `go` statement that starts a new goroutine happens before the
> goroutine's execution begins."

What this means: any data the parent goroutine wrote *before* `go f()`
is visible to `f`. The parent does not need a fence or a channel send
to "publish" data to a fresh goroutine. This is the one piece of
synchronisation that is *free* in Go.

```go
var x int
x = 42
go func() { fmt.Println(x) }()   // guaranteed to print 42
```

### Rule 2 — channel send/receive

> "A send on a channel happens before the corresponding receive from
> that channel completes."

This is the *most* important rule in the model. Any data written
before the send is visible to the receiver after the receive returns.
This is the canonical "message passing" synchronisation.

```go
ch := make(chan int)
var x int
x = 42
ch <- x               // send synchronises-with receive
v := <-ch             // v is guaranteed to be 42
```

A *buffered* channel with capacity > 0 is interesting: the send
completes immediately (succeeds if buffer has room) and the receive
reads the value. The happens-before edge is established at the *send*
and at the *receive* — when both are matched, the data flows.

### Rule 3 — channel close

> "The closing of a channel happens before a receive that returns a
> zero value because the channel is closed."

This is why a range over a channel terminates cleanly: the close
synchronises-with the receive that observes the zero value.

### Rule 4 — lock

> "For any `sync.Mutex` or `sync.RWMutex` variable `l` and `n < m`,
> call `n` of `l.Unlock()` happens before call `m` of `l.Lock()`
> returns."

This is the same rule Java's `synchronized` block has. Anything
written before `Unlock` is visible after the next `Lock` returns.

### Rule 5 — `sync.WaitGroup`

> "Calls to `wg.Add` that happen before a call to `wg.Wait` may
> happen at any time; the `wg.Done` call that unblocks `wg.Wait`
> happens before `wg.Wait` returns."

The "Add" and "Wait" can race in the same goroutine; you call `Add`
first, then `Wait`. The `Done` synchronises-with the return of
`Wait`.

### Rule 6 — `once`

> "A single call to `f` from `once.Do(f)` happens before any other
> call to `once.Do(f)` returns."

This is the implementation guarantee behind `sync.OnceValue` (Go 1.21+)
and `sync.OnceFunc`.

## What the model does NOT say

The model is intentionally small. It does NOT say:

- Anything about non-atomic reads/writes to shared variables across
  goroutines *without* synchronisation. Such accesses are racy.
- Anything about memory ordering of `int` reads/writes from
  different goroutines without synchronisation. The runtime / CPU
  may reorder these freely.
- Anything about `unsafe.Pointer`. The Go memory model explicitly
  excludes `unsafe` — you are on your own.

This is why `-race` exists. The race detector instruments every
read/write and reports any two unsynchronised accesses to the same
memory location from different goroutines. A clean `-race` run is a
*necessary* condition for correctness; it is not sufficient (it does
not prove all pairs of accesses were synchronised, just that the ones
that ran were).

## The pragmatic rules

In production Go code, the four things to internalise are:

1. **Use channels for ownership transfer.** When goroutine A sends a
   value to goroutine B, all data A owned before the send is owned by
   B after the receive. This is the strongest, cleanest synchronisation.

2. **Use `sync.Mutex` for protecting shared state.** A short critical
   section is fine; long sections waste parallelism. Use `RWMutex`
   only if your workload is genuinely read-mostly.

3. **Use `atomic` only for single-word values where CAS is the right
   algorithm.** Don't reach for `atomic.Int64` where a `Mutex` is
   clearer.

4. **Use `context.Context` for cancellation.** Any operation that
   might block should accept a context, and any goroutine that might
   leak should `select` on `ctx.Done()`.

## Common pitfalls

### Loop variable capture (pre-Go 1.22)

```go
for _, v := range xs {
    go func() { fmt.Println(v) }()  // all goroutines may see the SAME v
}
```

Fixed by `go func(v int) { ... }(v)` or by upgrading to Go 1.22+,
which gives each iteration its own variable.

### Map race

```go
go func() { m["a"] = 1 }()
go func() { _ = m["a"] }()       // race; runtime will throw
```

Always protect maps with a mutex, or use `sync.Map`.

### Slice append

```go
go func() { xs = append(xs, 1) }()  // race; the slice header is shared
```

Send the slice (or a copy) over a channel, or take a lock.

### Goroutine leak

```go
go func() {
    val := <-ch           // never returns if no one sends
}()
```

Every `go` must have an exit path. Use `context.Context`, `select
default`, or a sentinel close.

## A short worked example

```go
var (
    mu      sync.Mutex
    counter int
)

func worker() {
    for i := 0; i < 1000; i++ {
        mu.Lock()
        counter++           // synchronised by the mutex
        mu.Unlock()
    }
}

func main() {
    var wg sync.WaitGroup
    for i := 0; i < 8; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            worker()
        }()
    }
    wg.Wait()                // synchronises-with all Done calls
    fmt.Println(counter)     // guaranteed to be 8000
}
```

Every `counter++` is inside `mu.Lock()/Unlock()`, so any pair of
accesses from different goroutines is ordered. `wg.Wait()` returns
after all 8 `Done` calls, so reading `counter` after `Wait` is safe.

The same code without the mutex would race. The race detector would
flag every `counter++` and every read.
