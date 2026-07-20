# TPL Dataflow

TPL Dataflow is a `.NET` library (`System.Threading.Tasks.Dataflow`)
that provides actor-style "blocks" you link into pipelines. Each
block is a self-contained unit of work with an input and an output.

## The blocks

- `ActionBlock<T>`: input only. Runs an action for each item.
- `TransformBlock<TInput, TOutput>`: input + output. Runs a function.
- `TransformManyBlock<TInput, TOutput>`: input + many outputs. Like
  `SelectMany`.
- `BatchBlock<T>`: collects items into a batch of N, then emits an
  array.
- `JoinBlock<T1, T2, ...>`: waits for one of each, emits a tuple.
- `BatchedJoinBlock<T1, T2, ...>`: like `JoinBlock` but batched.
- `BufferBlock<T>`: a queue. Read/write on either end.
- `BroadcastBlock<T>`: every consumer sees every item.
- `WriteOnceBlock<T>`: only the first write succeeds; others are
  ignored.

## Wiring blocks

```csharp
var buffer = new BufferBlock<int>();
var transform1 = new TransformBlock<int, int>(x => x * 2);
var transform2 = new TransformBlock<int, string>(x => x.ToString());
var action = new ActionBlock<string>(s => Console.WriteLine(s));

buffer.LinkTo(transform1);
transform1.LinkTo(transform2);
transform2.LinkTo(action);
```

## Completion

```csharp
buffer.Complete();                  // no more inputs
await action.Completion;            // wait for the last block to finish
```

## Backpressure

`BoundedCapacity` on a block sets a buffer size. Once full, the
upstream block's `SendAsync` blocks (or, with
`BoundedCapacity = 1`, propagates back-pressure through the whole
pipeline).

## When to use

- Heterogeneous stages: each block has a different type signature.
- You want declarative composition: `LinkTo`.
- You need built-in batching, joining, sliding windows.

## When NOT to use

- You only need a queue between two coroutines: use `Channel<T>`.
- You need a *single* type of work: use `Parallel.ForEachAsync`.
- You need actor-like message passing with state: use `Akka.NET`.
