# Kafka Cheatsheet

Single-page reference covering every concept in this repo.

## Topics

| Task | CLI |
| --- | --- |
| Create | `kafka-topics --create --topic t --partitions 6 --replication-factor 3` |
| List | `kafka-topics --list` |
| Describe | `kafka-topics --describe --topic t` |
| Alter partitions | `kafka-topics --alter --topic t --partitions 12` |
| Delete | `kafka-topics --delete --topic t` |
| Config | `kafka-configs --describe --entity-type topics --entity-name t` |

## Producers

| Config | Default | When to change |
| --- | --- | --- |
| `acks` | `all` (since 3.0) | only for fire-and-forget (0) or benchmark (1) |
| `enable.idempotence` | `true` | keep on; turns off only to study acks |
| `max.in.flight.requests.per.connection` | `5` | keep on for batching |
| `compression.type` | `none` | `lz4` for most workloads |
| `linger.ms` | `0` | `5-50` for batching |
| `delivery.timeout.ms` | `120_000` | increase for cross-DC |

## Consumers

| Config | Default | Notes |
| --- | --- | --- |
| `enable.auto.commit` | `true` | **turn off** for at-least-once |
| `auto.offset.reset` | `latest` | `earliest` for replay |
| `isolation.level` | `read_uncommitted` | `read_committed` for txns |
| `max.poll.records` | `500` | tune for processing time |
| `session.timeout.ms` | `45_000` | higher for batch jobs |
| `partition.assignment.strategy` | `range,roundrobin` | `CooperativeStickyAssignor` |

## Streams

| Config | Notes |
| --- | --- |
| `processing.guarantee` | `at_least_once` (default) or `exactly_once_v2` |
| `num.stream.threads` | = partitions of the source topic |
| `cache.max.bytes.buffering` | default 10 MB |
| `state.dir` | local disk, sized to your state |

## Brokers

| Config | Notes |
| --- | --- |
| `min.insync.replicas` | **always ≥ 2** for safety |
| `unclean.leader.election.enable` | `false` unless you can lose data |
| `replica.lag.time.max.ms` | ≥ 30 s |
| `log.segment.bytes` | 1-2 GB is a good default |
| `log.retention.hours` / `bytes` | one, never both |
| `num.partitions` | per-topic; default cluster-wide is 1 |

## KRaft (3.6+)

* `KAFKA_PROCESS_ROLES=broker,controller` — combined mode (no ZK).
* `KAFKA_CONTROLLER_QUORUM_VOTERS=1@h1:9093,2@h2:9093,3@h3:9093`.
* `KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER`.
* `CLUSTER_ID=MkU3OEVBNTcwNTJENDM2Qk` — any 16-byte base64 works for dev.

## Schema Registry

| Action | URL |
| --- | --- |
| List subjects | `GET /subjects` |
| Latest schema | `GET /subjects/{s}/versions/latest` |
| Compatibility check | `POST /compatibility/subjects/{s}/versions` |
| Set global compatibility | `PUT /config` |

## Kafka Connect

| Action | URL |
| --- | --- |
| List | `GET /connectors` |
| Create | `PUT /connectors/{name}/config` |
| Status | `GET /connectors/{name}/status` |
| Pause | `PUT /connectors/{name}/pause` |
| Resume | `PUT /connectors/{name}/resume` |

## Consumer group admin

```
kafka-consumer-groups --bootstrap-server $BS --list
kafka-consumer-groups --bootstrap-server $BS --describe --group $G
kafka-consumer-groups --bootstrap-server $BS --reset-offsets --to-earliest --topic $T --group $G --execute
```

## Python / Go one-liner (for quick experiments)

```python
# pip install confluent-kafka
from confluent_kafka import Producer
p = Producer({"bootstrap.servers": "localhost:19092"})
p.produce("l1.greetings", value=b"hello")
p.flush()
```

```go
// go get github.com/segmentio/kafka-go
w := &kafka.Writer{Addr: kafka.TCP("localhost:19092"), Topic: "l1.greetings"}
w.WriteMessages(ctx, kafka.Message{Value: []byte("hello")})
```

## Metrics cheat sheet

* `kafka_server_BrokerTopicMetrics_TotalProduceRequestsPerSec` — load.
* `kafka_server_ReplicaManager_UnderReplicatedPartitions` — **alert if > 0**.
* `kafka_controller_ActiveControllerCount` — exactly 1 in a healthy cluster.
* `kafka_server_Purgatory_Size` — high = stuck requests (often ISR).
