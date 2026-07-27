# L1 — Fundamentals

> Goal:  send, receive, and inspect a Kafka topic.

## 1. Why it matters

Every higher rung in this curriculum sits on top of the producer / consumer
APIs.  Get these right and the rest is *additive*, not *foreign*.

## 2. Mental model

```
Producer ──► [partition leader] ──► [replica 1] ──► [replica 2]
                  │
                  ▼
              Consumer (group)
```

* A **topic** is an ordered, append-only log, split into **partitions**.
* A **partition** is a sequence of records identified by a monotonically
  increasing **offset** (0, 1, 2, …).
* A **producer** chooses which partition to write to (key hash, explicit,
  or round-robin when no key).
* A **consumer group** is a set of consumers that jointly read a topic;
  each partition is assigned to exactly one consumer in the group.

## 3. Code walkthrough

### `HelloProducer` (`modules/l1-fundamentals/.../HelloProducer.java`)

* `producerProps()` is a single source of truth for the producer
  configuration.  L1 deliberately leaves `acks` and `enable.idempotence`
  at their defaults — L3 will change them.
* `Future<RecordMetadata> f = producer.send(r)` is the asynchronous API.
  Calling `f.get()` is just for the lab to make the log deterministic;
  in production you register a callback instead.
* `RecordMetadata.topic()` / `partition()` / `offset()` are the three
  things you almost always want back from a send.

### `HelloConsumer` (`HelloConsumer.java`)

* `auto.offset.reset = earliest` is critical:  the consumer must start
  from the beginning of the log when no committed offset exists.
* `enable.auto.commit = false` — we will commit explicitly so the lab
  is reproducible.  L3 will revisit this.
* `consumer.subscribe(List.of(topic))` triggers a *group* rebalance;
  the assignment is dynamic.  L2 will contrast this with `assign()`.

### `PartitionExplorer` (`PartitionExplorer.java`)

* `describeTopics()` returns partition metadata.  Run it and look at
  the leader column.  Notice it changes when brokers come and go.

## 4. Lab

```bash
# Cluster must be up
docker compose up -d

# Build the L1 module
mvn -B -ntp -DskipTests -pl modules/l1-fundamentals -am package

# Run the lab
bash scripts/labs/l1.sh
```

Expected output (abbreviated):

```
INFO  ... created topic l1.greetings (p=3, rf=1)
INFO  ... Sending 10 records to l1.greetings
INFO  ... sent key=k0 → l1.greetings-0@0
INFO  ... sent key=k1 → l1.greetings-2@0
...
INFO  ... l1.greetings-0@0 key=k0 value=hello-0
INFO  ... done, received=10 committed
```

## 5. Production traps

* `key=null` ⇒ round-robin partitioning.  Don’t rely on “the same key
  goes to the same partition” if you forget the key.
* `acks=1` (the L1 default) loses data if the leader crashes after
  writing locally but before replicating.  See L3.
* A consumer that commits *before* processing can re-skip records on
  rebalance.  L3 fixes this with `commitSync(offsetsForTimes)` or
  `process-and-commit` patterns.

## 6. Check yourself

1. Why does the partition matter for ordering?
2. What does `enable.auto.commit=true` do, and why is it dangerous?
3. Why is the consumer group name a “subscription key” rather than a
   unique consumer id?
4. How do you seek back to offset 0 from inside a consumer?  (Hint:  look
   at the `pollAt` helper in `HelloConsumer`.)

## 7. Further reading

* Apache Kafka — *The Definitive Guide*, Ch. 3 (Producers) and Ch. 4
  (Consumers).
* KIP-500 — moving to KRaft.
