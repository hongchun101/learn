-- ksqlDB reference statements for the capstone.  These can be
-- pasted into the ksqlDB CLI after `docker compose up -d` of a
-- ksqlDB service (or run against a Confluent Cloud cluster).
--
-- Streams:

CREATE STREAM clicks_raw (
  user_id  STRING,
  url      STRING,
  referrer STRING,
  session  STRING
) WITH (
  KAFKA_TOPIC = 'clicks.raw',
  VALUE_FORMAT = 'JSON',
  PARTITIONS   = 6
);

-- Continuous query: clicks per minute per user
CREATE TABLE clicks_per_user_per_minute
  WITH (KAFKA_TOPIC = 'clicks.by-user-1m-ksql', PARTITIONS = 3) AS
  SELECT user_id,
         COUNT(*) AS clicks
  FROM clicks_raw
  WINDOW TUMBLING (SIZE 1 MINUTE)
  GROUP BY user_id
  EMIT CHANGES;
