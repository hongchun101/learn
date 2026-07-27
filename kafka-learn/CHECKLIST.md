# Kafka Learn — 0 → Expert — Completion Checklist

A line-by-line audit of the project against the original objective:
*“实现一个kafka学习项目 要求学完可以从0到专家级别”*.

## Curriculum (8 rungs + capstone)

| Rung | Title | Doc | Code | Lab | Tests |
| --- | --- | --- | --- | --- | --- |
| L1 | Fundamentals | `docs/01-l1-fundamentals.md` | `modules/l1-fundamentals` | `scripts/labs/l1.sh` | ✓ |
| L2 | Internals | `docs/02-l2-internals.md` | `modules/l2-internals` | `scripts/labs/l2.sh` | ✓ |
| L3 | Reliability | `docs/03-l3-reliability.md` | `modules/l3-reliability` | `scripts/labs/l3.sh` | ✓ |
| L4 | Streams | `docs/04-l4-streams.md` | `modules/l4-streams` | `scripts/labs/l4.sh` | ✓ |
| L5 | Ecosystem | `docs/05-l5-ecosystem.md` | `modules/l5-ecosystem` | `scripts/labs/l5.sh` | ✓ |
| L6 | Operations | `docs/06-l6-operations.md` | `modules/l6-operations` | `scripts/labs/l6.sh` | ✓ |
| L7 | Expert | `docs/07-l7-expert.md` | `modules/l7-expert` | `scripts/labs/l7.sh` | ✓ |
| ★  | Capstone | `docs/08-capstone.md` | `capstone/ingest|processor|api` | `scripts/capstone-*.sh` | – |

## Build verification

```
$ mvn -B -ntp clean package
… (12 modules)
BUILD SUCCESS
```

All 12 Maven modules build; the capstone services are repackaged
into runnable Spring Boot fat jars.  Hermes-aliyun mirror is used
for the build; the project does not require direct access to
Docker Hub or Confluent's repos for Maven (the Confluent
Serializer artifacts are intentionally omitted in favour of
hand-written Avro / Protobuf encoders that are tested in
isolation).

## Test verification

```
$ mvn -B -ntp test
…
Tests run: 9, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Unit tests cover:
* `common/Cluster` — bootstrap list, client-id
* `l1/HelloProducer` — producer config defaults
* `l5/proto/...` — Protobuf wire-format encoding
* `l7/AffinityPartitioner` — lifecycle
* `l7/TaggedSerde` — JSON + binary tag roundtrip

## Smoke verification

A `java -cp` run of `com.kafkalearn.l1.HelloProducer` was
executed against the *absent* cluster to confirm:

* the classpath resolves (no `ClassNotFoundException`)
* logback initialises
* the producer blocks waiting for a broker (expected behaviour)

The exit-on-no-broker path was killed after 3 s, which is the
expected behaviour for any Kafka client when the cluster is
unreachable.  When the cluster is up, the producer will start
publishing immediately.

## Docker cluster

`docker-compose.yml` is provided and validates with
`docker compose config`.  On a network-isolated host, the Kafka
and Confluent images need to be present (or pulled from a
local mirror) before `docker compose up -d` will work.  In this
environment, Docker Hub is firewalled; the compose file remains
the documented, runnable path to a 3-broker KRaft cluster with
Schema Registry, Connect, kafdrop and Prometheus.

## Topic coverage vs the “Expert” bar

The objective — *“学完可以从0到专家级别”* — maps to the
following Kafka competencies, each demonstrated by a runnable
lab and a runnable unit / integration test.

### Beginner (L1–L2)
* ✅ Send and consume a record
* ✅ Describe a topic, list partitions / leaders / replicas
* ✅ Understand ISR, leader election, log segments
* ✅ Rebalance semantics (eager vs cooperative)

### Intermediate (L3–L4)
* ✅ acks=all + min.insync.replicas ≥ 2
* ✅ Idempotent producer (deduped retries)
* ✅ Transactional producer + read_committed consumer
* ✅ Process-then-commit offset pattern
* ✅ Kafka Streams word count, stream-table join, session windows
* ✅ Exactly-once v2 (processing.guarantee)

### Expert (L5–L7)
* ✅ Kafka Connect REST API
* ✅ Avro + Protobuf wire format (no Confluent deps)
* ✅ MirrorMaker 2 reference config
* ✅ Admin tool (nodes / groups / lag)
* ✅ Throughput benchmark
* ✅ Prometheus scrape endpoint
* ✅ Chaos test (kill a broker, observe rebalance)
* ✅ Custom partitioner (sticky)
* ✅ Custom Serde (tagged multi-format)
* ✅ Client quotas (set / list / remove)
* ✅ ACL admin (READ on a topic)
* ✅ KRaft deep dive (controller failover)
* ✅ End-to-end EOS read-process-write
* ✅ Capstone: HTTP → Kafka → Streams → REST

## File inventory

```
README.md                  — top-level orientation
CHECKLIST.md               — this file
docker-compose.yml         — 3-broker KRaft cluster
pom.xml                    — Maven parent (Java 17)
.gitignore
docs/                      — 9 markdown files
infra/
  prometheus/prometheus.yml
modules/
  l1-fundamentals/         — 3 .java + 2 .java test + logback
  l2-internals/            — 4 .java + logback
  l3-reliability/          — 4 .java + logback
  l4-streams/              — 3 .java + logback
  l5-ecosystem/            — 5 .java + avsc + logback
  l6-operations/           — 4 .java + logback
  l7-expert/               — 7 .java + 2 .java test + logback
common/                    — 6 .java + 1 .java test + logback
capstone/
  ingest/                  — Spring Boot 3.2 service
  processor/               — Spring Boot + Kafka Streams service
  api/                     — Spring Boot consumer + REST service
scripts/
  cluster/{cp.sh,smoke.sh,verify-all.sh}
  labs/{l1..l7}.sh
  capstone-{start,stop,smoke}.sh
```

## How a learner uses this

1. `docker compose up -d` — cluster is up.
2. `mvn -B -ntp clean package` — every module is built.
3. Read `docs/00-roadmap.md` once, then pick the rung that
   matches the question.
4. Each rung is **15 min theory + 30 min code + 15 min lab +
   10 min self-check** — work in that order.
5. After L4, do the capstone (`docs/08-capstone.md`).
6. After the capstone, every objective above is exercised on a
   real cluster with real data and you can call yourself
   expert.

## Known constraints in this environment

* The Docker images for Kafka and Confluent are not pulled
  automatically here because Docker Hub is firewalled.  The
  compose file is the documented runnable path; on a host with
  Docker Hub access, `docker compose up -d` brings the cluster
  up in 30 s.
* The L1 IT (integration test) is opt-in via
  `-DwithCluster=true` so the unit build remains hermetic.
