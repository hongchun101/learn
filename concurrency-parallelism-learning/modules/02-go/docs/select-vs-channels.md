# `select` and channels

`select` is Go's primitive for racing multiple channel operations.

## Basic shape

```go
select {
case v := <-ch1:
    process(v)
case ch2 <- x:
    // sent
case <-ctx.Done():
    return ctx.Err()
}
```

The runtime picks a *random* ready case. If multiple are ready, the
choice is non-deterministic. If none are ready and no `default`, the
goroutine blocks until one becomes ready.

## Common patterns

### First to respond

```go
select {
case v := <-fast:
    return v
case v := <-slow:
    return v
}
```

### Cancellation / timeout

```go
select {
case v := <-work:
    return v
case <-time.After(5 * time.Second):
    return errors.New("timeout")
}
```

The `time.After` leaks a `time.Timer` until it fires; for long-lived
goroutines use `time.NewTimer` and `Stop`.

### Non-blocking send / receive

```go
select {
case ch <- v:
    // sent
default:
    // channel was full; drop or queue
}
```

### `nil` channel case

A `nil` channel blocks forever. Useful for disabling a case:

```go
var ch chan int  // nil
select {
case v := <-ch:        // never fires
    fmt.Println(v)
case <-ctx.Done():
    return
}
```

## Why `select` exists

Without `select`, the runtime would have to poll all channels. With
`select`, the runtime *parks* the goroutine on all channels at once
and wakes it when *any* becomes ready. This is efficient even for
hundreds of channels.

## Pitfalls

### Starvation

`select` with `default` and a busy channel: if the channel is always
ready, the `default` is never taken. Easy to write a tight loop.

### For-loop over channels

```go
for {
    select {
    case v := <-ch:
        process(v)
    case <-ctx.Done():
        return
    }
}
```

This is fine, but consider that `process(v)` is inside the select's
critical section — no other case can fire. If `process` is slow, the
select is blocked. Move the processing to a goroutine if needed.

### Closing closed channels

Closing an already-closed channel panics. Use `sync.Once` to make
close idempotent.
