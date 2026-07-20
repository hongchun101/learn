# Channels vs TPL Dataflow

Two production-grade ways to do producer/consumer pipelines in .NET.

## Channels (`System.Threading.Channels`)

A `Channel<T>` is a `Task`-friendly queue with a writer and a reader.
Backed by an internal buffer; the writer and reader communicate via
`async`/`await`.

```csharp
var ch = Channel.CreateBounded<int>(new BoundedChannelOptions(16)
{
    FullMode = BoundedChannelFullMode.Wait,
});

var producer = Task.Run(async () =>
{
    for (var i = 0; i < 1000; i++)
        await ch.Writer.WriteAsync(i);
    ch.Writer.TryComplete();
});

var consumer = Task.Run(async () =>
{
    await foreach (var v in ch.Reader.ReadAllAsync())
        Console.WriteLine(v);
});
```

### When to use

- Async-friendly code: writes and reads are `await`able.
- Producer/consumer with backpressure (`BoundedChannelOptions`).
- The work items are small and homogeneous.

## TPL Dataflow (`System.Threading.Tasks.Dataflow`)

A richer primitive: each block is a `TransformBlock<TInput, TOutput>`,
`ActionBlock<T>`, `BatchBlock<T>`, etc. Blocks can be linked to form
pipelines with backpressure.

```csharp
var block1 = new TransformBlock<int, int>(x => x * 2);
var block2 = new TransformBlock<int, string>(x => x.ToString());
block1.LinkTo(block2);

await block1.SendAsync(1);
await block1.SendAsync(2);
block1.Complete();
await block2.Completion;
```

### When to use

- You need a built-in pipeline of heterogeneous stages.
- You want built-in throttling, batching, joining.
- You want to wire blocks together declaratively (and visualise the
  graph in a debugger).

## Comparison

| Feature               | Channels                | TPL Dataflow              |
|-----------------------|-------------------------|---------------------------|
| Async-friendly        | yes                     | yes                       |
| Backpressure          | yes (bounded)           | yes (built in)            |
| Pipeline composition  | manual                  | declarative (LinkTo)      |
| Batching              | manual                  | `BatchBlock<T>`           |
| Sliding window        | manual                  | `SlidingWindowBlock<T>`   |
| Cancellation          | via `CancellationToken` | via `CancellationToken`   |
| NuGet                 | in-box                  | `System.Threading.Tasks.Dataflow` |

For most modern code, **Channels are the better default**. TPL
Dataflow is the right tool for complex pipelines where you want
declarative composition and the built-in batching/sliding-window
blocks.
