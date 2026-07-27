-- Optional ClickHouse tables for the capstone analytics.
-- Mount this directory into a clickhouse-server container at
-- /docker-entrypoint-initdb.d/ to have the schema created on
-- first boot.

CREATE DATABASE IF NOT EXISTS kl;

CREATE TABLE IF NOT EXISTS kl.clicks (
  user_id    String,
  url        String,
  referrer   String,
  session    String,
  ts         DateTime64(3)
) ENGINE = MergeTree
  PARTITION BY toYYYYMM(ts)
  ORDER BY (user_id, ts);

CREATE TABLE IF NOT EXISTS kl.top_users (
  window_start DateTime,
  user_id      String,
  count        UInt64
) ENGINE = SummingMergeTree
  PARTITION BY toYYYYMM(window_start)
  ORDER BY (window_start, user_id);
