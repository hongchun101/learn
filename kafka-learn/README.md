# Kafka Learn — 0 → Expert

A hands-on Kafka curriculum.  After working through every lab you should be
able to design, run, monitor and operate production Kafka clusters with
confidence.

```
0 ─ Beginner              : L1 Fundamentals, L2 Internals
        │
        ▼
I ─ Intermediate           : L3 Reliability, L4 Streams
        │
        ▼
E ─ Expert                 : L5 Ecosystem, L6 Operations, L7 Expert
        │
        ▼
Capstone                  : end-to-end real-time analytics
```

| Level | Module | What you build | Time |
| --- | --- | --- | --- |
| L1 | [Fundamentals](docs/01-l1-fundamentals.md) | CLI, producer, consumer | 2-3 h |
| L2 | [Internals](docs/02-l2-internals.md) | Replication, ISR, leader election | 3-4 h |
| L3 | [Reliability](docs/03-l3-reliability.md) | acks, idempotent, transactions, EOS | 4 h |
| L4 | [Streams](docs/04-l4-streams.md) | KStream/KTable, joins, windows | 4 h |
| L5 | [Ecosystem](docs/05-l5-ecosystem.md) | Connect, Schema Registry, MM2 | 3 h |
| L6 | [Operations](docs/06-l6-operations.md) | Tuning, monitoring, chaos | 3 h |
| L7 | [Expert](docs/07-l7-expert.md) | SASL/SSL/ACL, custom code, KRaft deep dive | 4 h |
| ★ | [Capstone](docs/08-capstone.md) | Real-time analytics platform | 6 h |

## Repository layout

```
kafka-learn/
├── README.md                       # this file
├── docker-compose.yml              # 3-broker KRaft cluster + UI + monitoring
├── pom.xml                         # Maven multi-module build
├── common/                         # shared config + models
├── infra/                          # broker/server configs
│   ├── kafka/kraft/                # per-broker server.properties
│   ├── prometheus/                 # scrape configs
│   └── connect/                    # Kafka Connect workers
├── modules/
│   ├── l1-fundamentals/            # 0 → beginner
│   ├── l2-internals/               # beginner
│   ├── l3-reliability/             # intermediate
│   ├── l4-streams/                 # intermediate
│   ├── l5-ecosystem/               # expert
│   ├── l6-operations/              # expert
│   └── l7-expert/                  # expert
├── capstone/                       # ★ end-to-end
│   ├── ingest/                     # Spring Boot producer service
│   ├── processor/                  # Kafka Streams + Flink-style jobs
│   ├── api/                        # Spring Boot consumer + REST
│   └── sql/                        # ksqlDB reference
├── docs/                           # theory + runbooks
└── scripts/                        # helper shell scripts
```

## Quick start

```bash
# 1. Bring up the cluster (3 brokers, KRaft, Schema Registry, kafdrop, Prometheus)
docker compose up -d

# 2. Wait until brokers are healthy
docker compose ps

# 3. Build the Maven reactor (compiles every module)
mvn -B -ntp -DskipTests clean package

# 4. Run your first lab
java -cp modules/l1-fundamentals/target/classes \
     com.kafkalearn.l1.HelloProducer
java -cp modules/l1-fundamentals/target/classes \
     com.kafkalearn.l1.HelloConsumer
```

## Web UIs

| Service | URL | Purpose |
| --- | --- | --- |
| Kafdrop | http://localhost:9000 | Topic / partition / consumer-group inspector |
| Schema Registry UI (L7) | http://localhost:8001 | Subject & version explorer |
| Prometheus | http://localhost:9090 | Metrics |
| Grafana (optional) | http://localhost:3000 | Dashboards |

## Recommended study order

1. Read `docs/00-roadmap.md` for a 30-minute tour.
2. Work each `docs/0N-…` doc alongside the matching `modules/lN-…` code.
3. Run the lab (`scripts/labs/lN-*.sh`) and read its expected output.
4. Answer the “Check yourself” questions at the end of each doc.
5. After L4, build the capstone in `capstone/`.

## Testing & verification

```bash
mvn -B -ntp test                    # unit tests for every module
bash scripts/cluster/smoke.sh       # spins up cluster, runs L1, tears down
bash scripts/cluster/verify-all.sh   # end-to-end (cluster + L1…L7 + capstone)
```

## Conventions

* Java 11 source level (works with JDK 11+; the project was bootstrapped on JDK 17).
* No Spring magic in the level modules — raw `kafka-clients` and `kafka-streams`
  so you can see exactly what is going on.  Spring Boot is reserved for the
  capstone services.
* All lab code is runnable with `java -cp <module>/target/classes <Main>` —
  no `exec-maven-plugin` magic, no embedded servers.
* `common/` is the single source of truth for shared config keys, serializers
  and models.

## License

MIT — see `LICENSE`.
