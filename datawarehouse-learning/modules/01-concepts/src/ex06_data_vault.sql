-- Module 01 / ch06 — Data Vault 2.0 (hub / link / satellite)
-- Run with: duckdb < modules/01-concepts/src/ex06_data_vault.sql

-- Hub: business key
CREATE OR REPLACE TABLE hub_user (
  user_id       BIGINT PRIMARY KEY,
  load_dts      TIMESTAMP,
  record_source VARCHAR
);

-- Satellite: descriptive attrs (append-only, versioned by load_dts)
CREATE OR REPLACE TABLE sat_user (
  user_id       BIGINT,
  load_dts      TIMESTAMP,
  hash_diff     VARCHAR,
  user_name     VARCHAR,
  level         VARCHAR,
  PRIMARY KEY (user_id, load_dts)
);

-- Link: many-to-many
CREATE OR REPLACE TABLE link_order (
  order_id      BIGINT,
  user_id       BIGINT,
  load_dts      TIMESTAMP,
  record_source VARCHAR,
  PRIMARY KEY (order_id, load_dts)
);

-- ============================================================
-- Load: idempotent append
-- ============================================================
INSERT INTO hub_user
SELECT user_id, CURRENT_TIMESTAMP, 'ods.users'
FROM read_parquet('data/small/users.parquet')
WHERE user_id NOT IN (SELECT user_id FROM hub_user);

INSERT INTO sat_user
SELECT
  user_id,
  CURRENT_TIMESTAMP,
  md5(concat_ws('|', user_name, level)),
  user_name, level
FROM read_parquet('data/small/users.parquet');

INSERT INTO link_order
SELECT
  order_id, user_id, CURRENT_TIMESTAMP, 'ods.orders'
FROM read_parquet('data/small/orders.parquet');

-- ============================================================
-- Query: PIT (point-in-time) join to reconstruct "current" entity
-- ============================================================
WITH latest_sat AS (
  SELECT s.*, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY load_dts DESC) rn
  FROM sat_user s
)
SELECT
  h.user_id, s.user_name, s.level
FROM hub_user h
JOIN latest_sat s ON h.user_id = s.user_id AND s.rn = 1
LIMIT 5;

-- ============================================================
-- Query: link expansion
-- ============================================================
SELECT COUNT(DISTINCT l.user_id) AS active_users
FROM link_order l;
