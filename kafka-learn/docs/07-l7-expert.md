# L7 — Expert

> Goal:  the last 20% of Kafka — custom partitioners and serdes,
> client quotas, ACLs, EOS end-to-end, KRaft.

## 1. Why it matters

Anyone can ship a default producer/consumer.  *Expert* Kafka work is
the *configuration and code* that protects the cluster from bad
clients, enforces contracts between services, and is the difference
between a system that *mostly works* and one that *cannot lose
data*.

## 2. Mental model

```
                  ┌─────────────────────────┐
                  │     security boundary   │
                  │  SASL_SSL + ACLs        │
                  │  + client quotas        │
                  └────────────┬────────────┘
                               │
            ┌──────────────────┼────────────────────┐
            │                  │                    │
       producers          transactions           consumers
   (idempotent + tx)   (read-process-write)   (read_committed)
            │                  │                    │
            └────────┐  ┌──────┴────────┐  ┌────────┘
                     ▼  ▼               ▼  ▼
                    Kafka brokers (KRaft, RF≥3)
                          ▲
                          │ JMX
                          ▼
                    Prometheus / Grafana
```

## 3. Code walkthrough

### `AffinityPartitioner`

* Routes keys starting with `A:`/`B:`/`C:` to a fixed partition.  This
  is the “sticky partition” trick used to keep a hot tenant on a
  single consumer thread.

### `TaggedSerde`

* One-byte tag + payload.  Lets you mix JSON and a binary format on
  the same topic.  Use it when you have legacy and modern clients
  that need to coexist.

### `QuotaEnforcer`

* `alterClientQuotas` — sets a 1 MB/s limit on user `evil`; the
  broker throttles that user even if the rest of the cluster is
  idle.

### `AclAdmin`

* `createAcls` + `describeAcls` — minimal READ grant for
  `User:alice` on a topic.

### `EosEndToEnd`  ← the centerpiece

* `producer.initTransactions()` once.
* Each poll → `beginTransaction()` → process → `sendOffsetsToTransaction()` →
  `commitTransaction()`.  Consumer offsets and produced records
  commit **atomically**:  a crash between them aborts the whole
  transaction; the next instance re-reads the same records.

### `KRaftDeepDive`

* Polls the controller every 2 s.  Stop one of the brokers and
  watch the controller column jump to a surviving voter (assuming
  quorum is still ≥ 2).

## 4. Lab

```bash
mvn -B -ntp -DskipTests -pl modules/l7-expert -am package
bash scripts/labs/l7.sh
```

## 5. Production traps

* **Custom partitioners change downstream semantics.**  Once a
  key can map to a partition by your rule, consumers may break if
  you change the rule.  Document and version them.
* **Transactions are not free.**  Each transactional producer opens
  a TCP session to the transaction coordinator.  Don’t enable
  transactions on every producer — only on the ones that need EOS.
* **Quotas are enforced at the broker.**  A misbehaving client gets
  *throttled*, not killed.  Pair quotas with a back-pressure
  protocol (or it will buffer forever in the client).
* **KRaft in pre-3.3 has known bugs in unclean shutdowns.**  Always
  use 3.6+.

## 6. Check yourself

1. Why is `sendOffsetsToTransaction` the linchpin of EOS?
2. What is the difference between a custom `Partitioner` and a
   custom `Serde`?
3. What is a KRaft voter, and what is the smallest healthy
   configuration?
4. Why would you combine *quota* and *ACL* on the same client?

## 7. Further reading

* *I Heart Logs* — Jay Kreps (the Kafka / Samza / KRaft paper).
* KIP-500 (KRaft) and KIP-447 (transactions EOS in Streams).
