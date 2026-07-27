# Capstone — Real-time click-stream analytics

> Goal:  ship a working, end-to-end Kafka pipeline that you could
> deploy on a real cluster tomorrow.

## 1. Architecture

```
        ┌─────────────────┐
        │   mobile / web  │
        └────────┬────────┘
                 │  POST /ingest/click
                 ▼
        ┌─────────────────┐
        │  ingest (8081)  │   Spring Boot, idempotent producer
        └────────┬────────┘
                 │  clicks.raw
                 ▼
        ┌─────────────────┐
        │ processor(8082) │   Kafka Streams, exactly-once_v2
        │                 │
        │ • by-user 1m    │ ──▶  clicks.by-user-1m
        │ • by-url  5m    │ ──▶  clicks.by-url-5m
        │ • session-start │ ──▶  clicks.session-starts
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │   api (8083)    │   Spring Boot, in-memory cache
        └────────┬────────┘
                 │  GET /api/top-users etc.
                 ▼
              dashboard
```

## 2. Run

```bash
# Build everything
mvn -B -ntp -DskipTests package

# Cluster must be up
docker compose up -d

# Boot the three services
bash scripts/capstone-start.sh

# Smoke-test
bash scripts/capstone-smoke.sh

# Tear down
bash scripts/capstone-stop.sh
```

## 3. Endpoints

| Service | URL |
| ------- | --- |
| Ingest  | `POST http://localhost:8081/ingest/click` |
| Ingest health | `http://localhost:8081/actuator/health` |
| Processor health | `http://localhost:8082/actuator/health` |
| API top users | `GET http://localhost:8083/api/top-users?n=10` |
| API top URLs | `GET http://localhost:8083/api/top-urls?n=10` |
| API sessions | `GET http://localhost:8083/api/sessions/total` |

## 4. End-to-end guarantees

* `acks=all` + `enable.idempotence=true` on the producer ⇒ no
  duplicates from the ingest service.
* `processing.guarantee=exactly_once_v2` on Streams ⇒ no duplicates
  from the processor.
* `isolation.level=read_committed` on the API consumer ⇒ no
  half-applied transactions ever reach the cache.

## 5. Where this is bare-bones

The API's `AnalyticsCache` is a `ConcurrentHashMap`.  That is
fine for the demo.  In production:

* Replace the cache with Redis / ClickHouse / Druid.
* Add authentication (OIDC bearer tokens via the SASL_SSL listener).
* Add an admin endpoint to view consumer-group lag.
* Run the processor in a Kubernetes `StatefulSet` with
  `spec.template.spec.containers.resources.requests.memory`
  sized to the state store.

## 6. Runbook

* **Ingest not sending** — check `/actuator/health`; the producer
  uses `kafka.producer.acks=all`, so the upstream service
  immediately sees broker outages.
* **Processor is stuck** — check the state directory; a 90% full
  disk is the most common cause of `KafkaStreams` going to `ERROR`.
* **API is empty** — wait for the smallest window (1 minute) to
  close, then query again.

## 7. Self-check

1. Why does the producer use `enable.idempotence`?  Without it, what
   duplicates appear?
2. Why is the `processor` a single instance, not three replicas?
3. What would you change to make the API truly horizontally
   scalable?
