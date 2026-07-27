# L6 — Operations

> Goal:  run a Kafka cluster in production — performance, monitoring,
> admin, and chaos drills.

## 1. Why it matters

The difference between a Kafka cluster that “works in dev” and one
that “works in prod” is the operations layer:  capacity planning,
metrics, alerting, runbooks, drills.  This rung gives you the
minimum toolkit to be the on-call engineer.

## 2. Mental model

```
                            ┌───────────────┐
                            │  Prometheus   │
                            └──────▲────────┘
                                   │  scrape
                                   │
            ┌──────────────┐  ┌─────┴──────┐  ┌──────────────┐
            │  broker JMX  │  │  broker    │  │  Connect JMX │
            └──────▲───────┘  └─────▲──────┘  └──────▲───────┘
                   │                │                │
                   └────────┬───────┴────────────────┘
                            │
                   Kafka cluster (3+ brokers)
                            ▲
                            │
                   ┌────────┴───────┐
                   │  Application   │
                   │  (JVM scrape)  │
                   └────────────────┘
```

## 3. Code walkthrough

### `ThroughputBenchmark`

* Single producer, 200k records.  Measures records-per-second and
  megabytes-per-second.  Use it as a regression check after any
  config change.
* `acks=1` is intentional for the benchmark — it shows the upper
  bound of the cluster, with replication as a separate dimension.

### `PrometheusScrapeEndpoint`

* Boots a `com.sun.net.httpserver.HttpServer` on port 9100 and
  serves the Micrometer Prometheus scrape.  This is the *application*
  metric, not the broker JMX.

### `AdminTool`

* The Java equivalent of every “describe” CLI:
  - `describeCluster().nodes()` → broker list
  - `describeCluster().controller()` → current controller
  - `listConsumerGroups()` → all groups
  - `listConsumerGroupOffsets()` + `listOffsets(latest)` → lag

### `ChaosTest`

* The first thing you should run after `docker compose up`.  Boot
  the consumer, then in another shell:
  ```bash
  docker stop kl-kafka-2 ; sleep 15 ; docker start kl-kafka-2
  ```
  Watch the consumer log:  it should rebalance to the surviving
  brokers, and resume without losing records.

## 4. Lab

```bash
mvn -B -ntp -DskipTests -pl modules/l6-operations -am package
bash scripts/labs/l6.sh
```

## 5. Production traps

* **JMX is the broker's source of truth**, but the Kafka image does
  not expose the JMX exporter by default.  Add a sidecar:
  ```yaml
  jmx-exporter:
    image: sscaling/jmx-prometheus-exporter
    command:
      - "7071"
      - "/opt/jmx_exporter/config.yml"
  ```
* **`min.insync.replicas=1` is meaningless** — a single ISR means a
  single point of failure.  Always ≥ 2.
* **Capacity planning**:  assume you can sustain ~30 MB/s read+write
  per broker on a 1 Gbps NIC.  Disk-bound?  Switch to NVMe and bump
  `num.replica.fetchers`.
* **Quota abuse**:  set `client.quota.bytes.per.second` on the
  cluster to prevent one bad client from saturating the brokers.

## 6. Check yourself

1. What is the difference between *broker* metrics and *client*
   metrics?  Why do you need both?
2. Why is killing a broker a *better* test than restarting the JVM
   with the cluster still up?
3. What is the smallest lag you can engineer?  What determines that
   floor?

## 7. Further reading

* *Kafka: The Definitive Guide* — Ch. 7 (Reliable Data Delivery) and
  Ch. 11 (Monitoring).
* Confluent’s *Monitoring Kafka* white paper.
