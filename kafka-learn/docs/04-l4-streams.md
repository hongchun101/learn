# L4 — Streams

> Goal:  build stateful stream-processing topologies with Kafka
> Streams — `KStream`, `KTable`, joins, and session windows.

## 1. Why it matters

Kafka Streams is the *embeddable* stream-processing library that lives
inside your service JVM.  It has no separate cluster, scales
horizontally with the consumers of the input topic, and persists its
state in a Kafka-backed changelog.  Most pipelines in production
are exactly this:  a `kstream → table → sink` topology.

## 2. Mental model

```
KStream<userId, click> ──── map ──── filter ───┐
                                                ├── join
KTable<userId, profile> ────────────────────────┘   ▼
                                            KStream<userId, enriched>
                                                  │
                                                  ▼
                                          output topic
```

* `KStream` — unbounded sequence of records.
* `KTable` — changelog stream, the latest value per key.
* `KGroupedStream` → `KTable` is the unit of *state*.
* `SessionWindows` / `TimeWindows` / `SlidingWindows` are the unit of
  *time*.

## 3. Code walkthrough

### `WordCountStream`

* The most-asked example.  Notice the `processing.guarantee=exactly_once_v2`
  — every record of the input is counted exactly once, and the
  output topic is written transactionally.
* The `KTable` is materialized as the compacted topic
  `l4-word-counts-<appId>-changelog`.  Look for it in kafdrop.

### `ClickStreamEnrichment`

* Stream-table join:  the *click* stream is enriched by the *profile*
  table.  Stream-table joins are non-windowed; the latest profile
  value is always used.
* This is the canonical “side-data enrichment” pattern.

### `SessionWindowedStream`

* `SessionWindows.of(inactivityGap).until(maxLength)` — sessions are
  split by 1 minute of silence, capped at 5 minutes total.  Used
  for *user session* analytics.

## 4. Lab

```bash
mvn -B -ntp -DskipTests -pl modules/l4-streams -am package
bash scripts/labs/l4.sh
```

While the word-count is running, in another shell:

```bash
echo "hello world hello kafka" | kafka-console-producer \
  --bootstrap-server localhost:19092 --topic l4.lines
```

Then check `l4.word-counts`:

```bash
kafka-console-consumer --bootstrap-server localhost:19092 \
  --topic l4.word-counts --from-beginning \
  --property print.key=true --property key.separator=' = '
```

## 5. Production traps

* Streams threads (`num.stream.threads`) should generally equal the
  number of input partitions.  More threads than partitions just sit
  idle; fewer threads reduce throughput.
* Every `KTable` / windowed aggregation creates a state store.  Size
  it with `cache.max.bytes.buffering` and the on-disk
  `state.dir`.
* Cooperative rebalancing (`upgrade.from=...` then upgrade) is
  required if you are upgrading from a pre-2.4 topology.
* `processing.guarantee=exactly_once_v2` requires
  `replication.factor ≥ 3` for the changelog topics; otherwise the
  topology refuses to start.

## 6. Check yourself

1. Why is a `KTable` a *changelog* and not just a map?
2. What is the difference between a stream-table join and a
   stream-stream join?
3. Why is `SessionWindows` the right window for “user session”
   analytics?
4. When would you pick `TimeWindows` over `SessionWindows`?

## 7. Further reading

* *Kafka Streams in Action* — William P. Bejeck Jr. (Manning).
* KIP-129 — streams EOS.
