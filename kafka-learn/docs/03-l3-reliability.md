# L3 — Reliability

> Goal:  understand the producer delivery guarantees (acks,
> idempotence, transactions), the consumer offset-commit patterns
> that turn “at-least-once” into “exactly-once end-to-end”, and the
> failure modes that hide between them.

## 1. Why it matters

Most Kafka “data loss” incidents are configuration mistakes:

* `acks=1` + leader crash = silent loss.
* `enable.idempotence=false` + retried batch = duplicate records.
* `enable.auto.commit=true` + slow processor = skipped records on
  rebalance.

L3 is where you learn to read the contract of *each* of these knobs
and design a producer/consumer that has the guarantee you actually
need — no more, no less.

## 2. Mental model

```
                     ┌────────────────────────┐
   ── client ──►     │  producer              │
                     │  - acks                │
                     │  - retries             │
                     │  - idempotence         │
                     │  - transactional.id    │
                     └──────────┬─────────────┘
                                │   (acks all + min ISR ≥ 2)
                                ▼
                     ┌────────────────────────┐
                     │  broker                │
                     │  __consumer_offsets    │
                     └──────────┬─────────────┘
                                │
                                ▼
                     ┌────────────────────────┐
                     │  consumer              │
                     │  - isolation.level     │
                     │  - enable.auto.commit  │
                     │  - commitSync          │
                     └────────────────────────┘
```

## 3. Code walkthrough

### `AcksDemo`

* Iterates `acks = 0, 1, all` and reports ms-per-record and error
  count for 1000 sends.
* `acks=all` requires `min.insync.replicas ≥ 1` (≥ 2 in real life);
  the docker-compose cluster sets it to 2 so writes succeed.

### `IdempotentProducer`

* `enable.idempotence=true` is on by default since 3.0 — it is
  listed explicitly so you can see what it changes:
  * sets `acks=all` (forces the safe value)
  * sets `retries=Integer.MAX_VALUE` (no data loss on retry)
  * sets `max.in.flight.requests.per.connection=5` (ordering preserved)

### `TransactionalTransfer`

* `initTransactions()` registers the transactional.id with the
  transaction coordinator.  The id is durable:  it survives producer
  restarts, allowing fences of zombie producers.
* `isolation.level=read_committed` makes the consumer skip records
  from aborted transactions.

### `ProcessAndCommit`

* The right way to couple offset commits to side effects:  process
  *all* records, then `commitSync(toCommit)`.  If the process
  crashes mid-batch, no offsets are committed; on restart the
  whole batch is re-read.

## 4. Lab

```bash
mvn -B -ntp -DskipTests -pl modules/l3-reliability -am package
bash scripts/labs/l3.sh
```

While the transactional demo is running, look at the topics in
kafdrop and notice the **transaction marker** records Kafka appends
to the partition.

## 5. Production traps

* Setting `enable.idempotence=true` does **not** give you EOS end-to-
  end.  It only removes producer-side duplicates.  To cover consumer
  side you also need a transactional producer in the
  read-process-write loop.
* `max.in.flight.requests.per.connection=5` is only safe *because*
  idempotence is on.  Without it, retries can reorder records.
* `acks=all` does nothing if `min.insync.replicas=1`.  Always set
  the topic with `min.insync.replicas=2` (or 3) for safety.
* A transactional producer *must* call `close()` to release the
  transactional id.  Forget it and the next producer with the same
  id is fenced.

## 6. Check yourself

1. What does idempotence protect against, and what does it not?
2. Why do we need `min.insync.replicas=2` even when `acks=all` is set?
3. What is a “zombie” producer and how does `transactional.id` fence it?
4. Why is `process-then-commit` the only safe offset pattern for
   consumers that have side effects?

## 7. Further reading

* KIP-98 / KIP-129 — idempotence + transactions.
* “Exactly-Once Semantics Are Possible: Here’s How Kafka Does It” —
  Neha Narkhede, O’Reilly.
