-- Module 01 / ch04 — SCD-2 (slowly changing dimension, type 2)
-- Run with: duckdb < modules/01-concepts/src/ex04_scd2.sql

-- ============================================================
-- (1) Initial load
-- ============================================================
CREATE OR REPLACE TABLE dim_user_scd2 (
  user_id      BIGINT,
  user_name    VARCHAR,
  level        VARCHAR,
  valid_from   DATE,
  valid_to     DATE,
  is_current   BOOLEAN,
  PRIMARY KEY (user_id, valid_from)
);

INSERT INTO dim_user_scd2
SELECT
  user_id, user_name, level,
  DATE '2024-01-01'      AS valid_from,
  DATE '9999-12-31'      AS valid_to,
  TRUE                   AS is_current
FROM read_parquet('data/small/users.parquet')
WHERE user_id <= 100;

-- ============================================================
-- (2) "Source update": some users changed level
-- ============================================================
CREATE OR REPLACE TABLE src_user_changes AS
SELECT * FROM (VALUES
  (1,  'user_00000001', 'platinum',  DATE '2024-06-01'),
  (2,  'user_00000002', 'silver',    DATE '2024-06-15'),
  (3,  'user_00000003', 'gold',      DATE '2024-07-01')
) AS t(user_id, user_name, level, effective_dt);

-- ============================================================
-- (3) SCD-2 merge (one row at a time):
--     3a. close the current row whose level actually changed
--     3b. insert a new row valid from effective_dt
-- ============================================================
-- 3a. close
UPDATE dim_user_scd2
SET valid_to = s.effective_dt - INTERVAL 1 DAY,
    is_current = FALSE
FROM src_user_changes s
WHERE dim_user_scd2.user_id   = s.user_id
  AND dim_user_scd2.is_current
  AND (dim_user_scd2.level   <> s.level
    OR dim_user_scd2.user_name <> s.user_name);

-- 3b. insert new
INSERT INTO dim_user_scd2
SELECT
  s.user_id, s.user_name, s.level,
  s.effective_dt,
  DATE '9999-12-31',
  TRUE
FROM src_user_changes s
WHERE NOT EXISTS (
  SELECT 1 FROM dim_user_scd2 d
  WHERE d.user_id = s.user_id AND d.is_current
);

-- ============================================================
-- (4) Verify
-- ============================================================
-- one current row per user
SELECT user_id, COUNT(*) AS current_rows
FROM dim_user_scd2
WHERE is_current
GROUP BY user_id
HAVING current_rows > 1;
-- expect 0 rows

-- point-in-time query: "what was user 1's level on 2024-05-01?"
SELECT user_id, level
FROM dim_user_scd2
WHERE user_id = 1
  AND DATE '2024-05-01' BETWEEN valid_from AND valid_to;
-- expect: bronze

-- "what was user 1's level on 2024-07-01?"
SELECT user_id, level
FROM dim_user_scd2
WHERE user_id = 1
  AND DATE '2024-07-01' BETWEEN valid_from AND valid_to;
-- expect: platinum
