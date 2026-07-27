# Roadmap — Kafka 0 → Expert in ~30 h

This is the master map.  Each `docs/0N-*.md` is one rung; each `modules/lN-…`
is the runnable companion.  The capstone (★) ties every rung together.

## The 8 rungs

| Rung | Title | Theory doc | Module | Skill unlocked |
| ---- | ----- | ---------- | ------ | -------------- |
| L1 | Fundamentals | `01-l1-fundamentals.md` | `modules/l1-fundamentals` | Send / receive messages, navigate topics |
| L2 | Internals | `02-l2-internals.md` | `modules/l2-internals` | Understand replication & leader election |
| L3 | Reliability | `03-l3-reliability.md` | `modules/l3-reliability` | Guarantee no-loss / no-dup delivery |
| L4 | Streams | `04-l4-streams.md` | `modules/l4-streams` | Stateful stream processing |
| L5 | Ecosystem | `05-l5-ecosystem.md` | `modules/l5-ecosystem` | Connect, schemas, cross-DC |
| L6 | Operations | `06-l6-operations.md` | `modules/l6-operations` | Run a cluster in production |
| L7 | Expert | `07-l7-expert.md` | `modules/l7-expert` | Hardening, security, internals |
| ★  | Capstone | `08-capstone.md` | `capstone/` | Build & ship a full pipeline |

## How a rung is structured

Every rung follows the same 4-step recipe so the rhythm is automatic.

1. **Theory (15 min)** — read the doc.
2. **Code (30 min)** — open the matching `modules/lN-…` and read the
   `Main` class plus the *one* helper it depends on.
3. **Lab (15 min)** — run the lab script, observe the output, change one
   parameter, re-run.
4. **Self-check (10 min)** — answer the “Check yourself” questions.

## Suggested weekly schedule (4 weeks)

```
Week 1  L1 → L2          Producer/consumer + replication model
Week 2  L3 → L4          Reliability + streams
Week 3  L5 → L6          Connect, Schema Registry, monitoring
Week 4  L7 + Capstone    Security, EOS, full pipeline
```

## What “Expert” means here

By the end you can, without Google:

* Explain the life of a record from `ProducerRecord.send()` to a consumer
  callback, including the role of every broker thread.
* Design a topic layout (partitions, RF, cleanup policy) for a given
  read/write pattern.
* Configure `acks`, `enable.idempotence`, transactional id, and reason
  about the exact delivery guarantee.
* Build a Kafka Streams topology with stateful KTables, joins, and
  windowed aggregations, and reason about rebalances vs restores.
* Operate a cluster: monitor ISR shrink, HW progress, controller
  failover, and run a chaos drill.
* Add security: SASL_SSL, ACLs, quotas, mTLS.
* Discuss KRaft vs ZooKeeper, the role of the metadata log, and what
  happens during a controller election.
* Ship a real-time analytics platform end-to-end (the capstone).

## How to read the docs

Every doc follows this template:

```
# L{N} — <title>
1. Why it matters
2. Mental model
3. Code walkthrough
4. Lab
5. Production traps
6. Check yourself
7. Further reading
```

The labs are *idempotent* — re-running them re-creates the topic, never
duplicates data.

## How to read the code

* `common/` — shared building blocks (config, models, util).
* `modules/l{N}/` — exactly one `Main` per concept, plus the minimal
  helper it needs.  No utility sprawl.
* `capstone/` — production-shaped services (Spring Boot).

## What is *not* covered

* Kafka clients in languages other than Java (Python and Go examples
  live in the `docs/cheatsheet.md` for reference).
* Detailed ZooKeeper internals — KRaft is the modern path and what
  every new cluster uses.
* Kafka KIPs in pre-release — only stable, GA APIs are used.

When you are done with the capstone, you have seen every important
feature of Apache Kafka and Confluent's adjacent tooling.
