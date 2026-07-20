# Erlang — concurrency & parallelism (Ch10)

OTP 26 / Erlang/OTP 26. Erlang's concurrency model is the *original*
actor-style system that influenced Akka, Elixir, and many others. Every
"thread" in Erlang is a **process** — not an OS thread, not a goroutine.
A process is a lightweight, isolated unit with its own heap, scheduled
by the BEAM virtual machine. They communicate *only* by message passing.

## What an expert can do after this module

- Reason about *millions* of processes: the BEAM scheduler is built for
  this scale. Compare to OS-thread models where 1k threads is "a lot".
- Use `gen_server` for stateful services: a process with a synchronous
  request/reply loop, with optional `handle_call`/`handle_cast`/`handle_info`
  callbacks. The canonical "long-lived actor".
- Build a **supervision tree**: parents restart children on crash with
  a configurable `restart strategy` (one_for_one, one_for_all, rest_for_one,
  simple_one_for_one). The Erlang philosophy: "let it crash", and have a
  supervisor decide what to do about it.
- Use `gen_statem` (replaces `gen_fsm`) for state machines; `gen_event` for
  pub-sub; `supervisor` for trees.
- Hot code loading: the VM lets you upgrade a module while it is running,
  with old and new versions co-existing for the duration of a migration.
- Use ETS (in-memory key/value) and DETS (on-disk) for shared state
  *without* a process; read the consistency story (read/write, not
  transactional, the runtime can give "lost updates" if used naively).
- Use the **process registry** (`global`, `gproc`, `syn`) for service
  discovery: a name that follows the process even if it restarts.
- Trace with `dbg`, profile with `cprof`/`fprof`/`eper`, observe the
  scheduler with `observer`.

## Layout

```
modules/10-erlang/
├── README.md
├── rebar.config
├── src/
│   ├── cp.app.src
│   ├── cp_app.erl            — application behaviour
│   ├── cp_sup.erl            — root supervisor
│   ├── cp_ch01_processes.erl  — spawn, ! (send), receive, link, monitor
│   ├── cp_ch02_gen_server.erl — gen_server callbacks, timeouts
│   ├── cp_ch03_supervisor.erl — supervisor behaviour, restart strategies
│   ├── cp_ch04_gen_statem.erl — state machine
│   ├── cp_ch05_ets.erl        — ETS tables, named tables, Mnesia preview
│   ├── cp_ch06_otp_patterns.erl — the six cross-language tasks
│   └── cp_ch07_distribution.erl  — node(), rpc, net_kernel
├── test/
│   └── (eunit tests, one per chapter)
└── docs/
    └── beam-scheduler.md     — long-form notes
```

## How to run

```bash
cd modules/10-erlang
rebar3 eunit
# or, in an erl shell:
rebar3 shell --eval "cp_ch06_otp_patterns:fan_out()."
```

The local build host does not have Erlang installed; the code is
reviewed by inspection.

## Cross-language task implementations

`cp_ch06_otp_patterns.erl` re-implements the six tasks using only the
primitives available in pure Erlang (processes, message passing, monitors):

- **Fan-out/Fan-in** — `lists:map` of `spawn`s; collect with `receive`
  using a tag-encoded reply message.
- **Pipeline** — a list of registered worker processes; each forwards
  the next stage.
- **Rate limiter** — process that receives a `tick` message on a timer.
- **Barrier** — coordinator process that counts arrivals and broadcasts
  release.
- **MPMC queue** — a `gen_server` wrapping a list (or, more efficiently,
  a queue).
- **Parallel reduce** — coordinator partitions, spawns workers, joins.

## Memory model

Erlang's "memory model" is *no shared memory*. Each process has its own
heap; the only way to share is to send a message (which is *copied*, not
shared, except for binaries >64 bytes which are reference-counted in a
shared heap). This eliminates the entire class of data races. The
trade-off is that you cannot do "shared mutable state" the way Java or
C++ do; you build it from processes and ETS, and the cost of going
through a process boundary is one order of magnitude higher than a lock
acquire on the JVM.
