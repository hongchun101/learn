# errgroup

`golang.org/x/sync/errgroup.Group` is the canonical fan-out primitive
when the work can fail. It builds on `sync.WaitGroup` and
`context.Context`.

## Usage

```go
g, ctx := errgroup.WithContext(parent)
for _, item := range items {
    item := item
    g.Go(func() error {
        return process(ctx, item)
    })
}
if err := g.Wait(); err != nil {
    return err
}
```

## What it does

- `g.Go(f)` spawns a goroutine that runs `f`. If `f` returns a
  non-nil error, the group's context is cancelled and the error is
  stored.
- The first non-nil error is returned by `g.Wait()`. Subsequent
  errors are *not* collected (only the first is reported).
- When the context is cancelled, all running goroutines should
  return (the runtime doesn't kill them — it relies on them
  honouring the context).

## When to use it

- I/O fan-out: many HTTP calls in parallel, any failure should
  cancel the rest.
- Database shard queries: same.
- File processing: many files, first error stops the work.
- Any "best-effort with a deadline" workload.

## When NOT to use it

- When you need to collect *all* errors: use a slice of errors and
  wait manually.
- When you need to limit concurrency: combine with a semaphore
  (`semaphore.NewWeighted`).
- When the work can't fail: `sync.WaitGroup` is enough.
