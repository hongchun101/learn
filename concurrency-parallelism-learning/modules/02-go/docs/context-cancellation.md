# context.Context — cancellation, deadlines, and values

`context.Context` is the standard way to carry cancellation, deadlines,
and request-scoped values across API boundaries in Go.

## The contract

Every blocking operation in the standard library and most third-party
libraries accepts a `context.Context` as its first argument. The
operation:

- Returns early with `ctx.Err()` if the context is cancelled.
- Returns early with `context.DeadlineExceeded` if the deadline
  expires.
- Never blocks longer than the context's deadline.

## Construction

```go
ctx, cancel := context.WithCancel(parent)
defer cancel()              // always defer cancel to release resources
```

Variants:

- `context.WithCancel(parent)` — manual cancellation
- `context.WithTimeout(parent, dur)` — auto-cancels after `dur`
- `context.WithDeadline(parent, t)` — auto-cancels at time `t`
- `context.WithValue(parent, key, val)` — for request-scoped values

## Idioms

### One cancel per scope

```go
func handler(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()
    doWork(ctx)
}
```

### Cancel downstream on error

```go
ctx, cancel := context.WithCancel(parent)
defer cancel()
g, ctx := errgroup.WithContext(ctx)
for _, item := range items {
    item := item
    g.Go(func() error {
        return process(ctx, item)
    })
}
return g.Wait()
```

`errgroup.WithContext` returns a context that is cancelled when any
goroutine returns an error or `Wait` returns.

### Never pass nil context

Use `context.TODO()` or `context.Background()` if you don't have a
parent.

## Values: use sparingly

`context.WithValue` exists for request-scoped data (request IDs, auth
tokens, trace IDs). It is NOT a general-purpose map. Rules:

- The key must be a custom type, not `string` or `int`.
- Values should be request-scoped, not function-arguments.
- If your function needs a value, make it an argument.
