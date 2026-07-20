-- Module 11 / Flink SQL CDC — simulation in DuckDB.
--
-- In real Flink this would be:
--   CREATE TABLE source (...) WITH ('connector'='mysql-cdc', ...);
--   CREATE TABLE sink   (...) WITH ('connector'='paimon', ...);
--   INSERT INTO sink SELECT * FROM source;
--
-- We simulate by maintaining a "versioned source" (mirror table with
-- _op='I'/'U'/'D' and _ts) and a "snapshot" (current state). Updates
-- close the current row, insert a new one; deletes close the current
-- row only.

CREATE SCHEMA IF NOT EXISTS cdc;
CREATE SCHEMA IF NOT EXISTS cdc_out;

-- (1) versioned source — every change is a new row
DROP TABLE IF EXISTS cdc.user_cdc;
CREATE TABLE cdc.user_cdc (
  user_id     BIGINT,
  user_name   VARCHAR,
  level       VARCHAR,
  _op         CHAR(1),   -- I/U/D
  _ts         TIMESTAMP
);

INSERT INTO cdc.user_cdc VALUES
  (1, 'alice', 'bronze',   'I', TIMESTAMP '2024-01-01 00:00:00'),
  (2, 'bob',   'silver',   'I', TIMESTAMP '2024-01-01 00:00:00'),
  (1, 'alice', 'gold',     'U', TIMESTAMP '2024-03-01 00:00:00'),
  (3, 'carol', 'bronze',   'I', TIMESTAMP '2024-02-15 00:00:00'),
  (2, 'bob',   NULL,       'D', TIMESTAMP '2024-04-01 00:00:00'),
  (1, 'alice', 'platinum', 'U', TIMESTAMP '2024-06-01 00:00:00');

-- (2) current snapshot — only one row per user, latest non-deleted.
-- A user whose last op is 'D' must NOT appear in the snapshot at all.
DROP TABLE IF EXISTS cdc_out.user_current;
CREATE TABLE cdc_out.user_current AS
WITH last_op AS (
  SELECT user_id, _op, MAX(_ts) AS last_ts
  FROM cdc.user_cdc
  GROUP BY user_id, _op
),
alive AS (
  -- users whose last op is not D
  SELECT user_id
  FROM cdc.user_cdc
  GROUP BY user_id
  HAVING MAX(_ts) <> MAX(CASE WHEN _op='D' THEN _ts END)
     OR SUM(CASE WHEN _op='D' THEN 1 ELSE 0 END) = 0
),
latest AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY _ts DESC) AS rn
  FROM cdc.user_cdc
  WHERE _op <> 'D'
)
SELECT l.user_id, l.user_name, l.level, l._ts AS last_update_ts
FROM latest l
WHERE l.rn = 1
  AND l.user_id IN (SELECT user_id FROM alive);

-- (3) verify
SELECT * FROM cdc_out.user_current ORDER BY user_id;

-- (4) late-arriving data: change arrives out-of-order
INSERT INTO cdc.user_cdc VALUES
  (1, 'alice', 'silver',   'U', TIMESTAMP '2024-02-01 00:00:00');

-- After applying late data, the "current" state should still be
-- the highest-ts non-deleted row (platinum), but the SCD-2
-- dimension will have more history.
DROP TABLE IF EXISTS cdc_out.user_current_v2;
CREATE TABLE cdc_out.user_current_v2 AS
WITH last_op AS (
  SELECT user_id, MAX(_ts) AS last_ts,
         MAX(CASE WHEN _op='D' THEN _ts END) AS last_d_ts
  FROM cdc.user_cdc
  GROUP BY user_id
),
alive AS (
  SELECT user_id FROM last_op
  WHERE last_d_ts IS NULL OR last_ts <> last_d_ts
),
latest AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY _ts DESC) AS rn
  FROM cdc.user_cdc
  WHERE _op <> 'D'
)
SELECT l.user_id, l.user_name, l.level, l._ts AS last_update_ts
FROM latest l
WHERE l.rn = 1
  AND l.user_id IN (SELECT user_id FROM alive);
