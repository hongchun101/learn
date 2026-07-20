# Elixir — concurrency & parallelism (Ch11)

Elixir 1.16+ on the BEAM VM. Elixir is a syntax layer over Erlang/OTP that
makes the actor model productive. The runtime is the same; the abstractions
are friendlier (`GenServer`, `Supervisor`, `Task`, `Agent`, `Registry`).

## What an expert can do after this module

- Build fault-tolerant services with `Supervisor` + `GenServer` and reason
  about the *restart strategy* you chose (`:one_for_one`, `:one_for_all`,
  `:rest_for_one`, `:simple_one_for_one`).
- Use `Task.Supervisor` and `Task.async`/`Task.await` for one-off concurrent
  work without managing a long-lived server.
- Use `Agent` for *simple* stateful processes (a server holding a value).
  Prefer `GenServer` for anything more than "set, get, update".
- Use `Registry` to discover processes by name; use `Process.send_after/3`
  for delayed messages (the Elixir-idiomatic timer).
- Use `Phoenix.PubSub` (when working in Phoenix) for fan-out of events.
- Use `Flow` (from the `flow` package) for GenStage-based parallel
  pipelines with backpressure; the natural fit for "produce N items,
  transform them with M workers, collect".
- Use `Broadway` for production data ingestion pipelines.
- Write property-based tests with `StreamData` that exercise concurrent
  state machines.
- Use `:telemetry` + `:telemetry_poller` for metrics, and LiveDashboard
  for in-process observability.

## Layout

```
modules/11-elixir/
├── README.md
├── mix.exs
├── lib/
│   ├── cp.ex                    — main module
│   ├── cp/
│   │   ├── ch01_processes.ex    — spawn, send, receive, link, monitor
│   │   ├── ch02_gen_server.ex   — GenServer callbacks
│   │   ├── ch03_supervisor.ex   — supervision tree
│   │   ├── ch04_agent.ex        — Agent state
│   │   ├── ch05_task.ex         — Task, Task.Supervisor, async/await
│   │   ├── ch06_registry.ex     — process registry
│   │   ├── ch07_flow.ex         — Flow / GenStage pipelines
│   │   └── ch08_patterns.ex     — the six cross-language tasks
│   └── cp/application.ex        — OTP application
├── test/
│   └── (ExUnit tests, one per chapter)
└── docs/
    └── beamscheduler.md
```

## How to run

```bash
cd modules/11-elixir
mix deps.get
mix test
mix run -e "Cp.Ch08Patterns.fan_out()"
```

The local build host does not have Elixir installed; the code is
reviewed by inspection.

## Cross-language task implementations

`Cp.Ch08Patterns` contains the six tasks in idiomatic Elixir. The tests
assert the same properties as the TypeScript reference.

## Memory model

Same as Erlang (see Ch10). Processes are isolated; no shared mutable
state across processes; the only way to share is to send a message.
