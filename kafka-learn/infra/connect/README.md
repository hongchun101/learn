# Kafka Connect — static config

The compose file in the project root brings up a Connect worker
that talks to the local 3-broker cluster.  This directory is
the place to drop additional **connector** configs (sources /
sinks) that you want to register via the Connect REST API:

```bash
# from this directory, after `docker compose up -d`
curl -X PUT http://localhost:18083/connectors/l5-file-source/config \
  -H 'Content-Type: application/json' \
  -d @file-source.json
```

Example connector config (file source) is in
[`docs/05-l5-ecosystem.md`](../../docs/05-l5-ecosystem.md).
