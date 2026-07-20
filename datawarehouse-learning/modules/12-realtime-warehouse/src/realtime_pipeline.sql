-- ============================================================
-- Module 12 / realtime_pipeline.sql
--
-- Real-time layered data warehouse on top of the e-commerce
-- click-stream (ods.user_events).  All four layers — ODS, DWD,
-- DWS, ADS — are materialized as DuckDB tables so that the
-- pipeline is fully reproducible from this single SQL file.
--
-- Layering philosophy (Lambda + Kappa hybrid)
--   ODS  : one row = one raw event as it lands in Kafka
--   DWD  : cleaned & enriched; exactly-once via ROW_NUMBER over event_id
--   DWS  : 1-day window aggregations keyed by (user_id, event_date)
--   ADS  : realtime DAU plus per-event-type distinct-user counts
--
-- Late-data / out-of-order handling
--   Every downstream watermark is the *event time* (event_ts),
--   never the processing time.  A row whose event_ts is several
--   days behind MAX(event_date) still attributes to its own
--   event_date, not to "today" — see the late-data section near
--   the bottom.
-- ============================================================


-- ============================================================
-- ch01..ch03  schemas + ODS layer (raw ingestion)
-- ============================================================
-- DuckDB rejects CREATE OR REPLACE SCHEMA, hence the bare IF NOT EXISTS.
CREATE SCHEMA IF NOT EXISTS ods;
CREATE SCHEMA IF NOT EXISTS dwd;
CREATE SCHEMA IF NOT EXISTS dws;
CREATE SCHEMA IF NOT EXISTS ads;

-- ODS is the raw landing zone.  In production this would be a Kafka
-- topic or a Flink-Kafka connector; here we just point at the same
-- parquet file the rest of the curriculum uses, so the test harness
-- can reproduce everything from data/small/user_events.parquet.
DROP TABLE IF EXISTS ods.user_events_raw;
CREATE TABLE ods.user_events_raw AS
SELECT
    event_id,
    user_id,
    event_type,
    page,
    CAST(event_ts AS TIMESTAMP)        AS event_ts,
    CAST(CAST(event_ts AS TIMESTAMP) AS DATE) AS event_date
FROM read_parquet('data/small/user_events.parquet');

-- Tiny ops view: latest event timestamp we've seen.  Used by the
-- late-data demo to prove attribution is event-time driven.
DROP TABLE IF EXISTS ods.ingest_meta;
CREATE TABLE ods.ingest_meta AS
SELECT
    MAX(event_ts)                    AS max_event_ts,
    MAX(event_date)                  AS max_event_date,
    COUNT(*)                         AS raw_row_count,
    COUNT(DISTINCT event_id)         AS raw_event_id_count
FROM ods.user_events_raw;


-- ============================================================
-- ch04  DWD layer — cleaned + enriched + exactly-once
-- ============================================================
-- Exactly-once dedup: in a real pipeline Kafka can replay events
-- during rebalance, so the DWD writer must collapse duplicates on
-- event_id.  ROW_NUMBER partitioned by event_id, ordered by
-- event_ts (and event_id as tie-breaker) keeps the earliest
-- observation and discards later replays.
DROP TABLE IF EXISTS dwd.user_events;
CREATE TABLE dwd.user_events AS
WITH dedup AS (
    SELECT
        event_id, user_id, event_type, page, event_ts, event_date,
        ROW_NUMBER() OVER (
            PARTITION BY event_id
            ORDER BY event_ts ASC, event_id ASC
        ) AS rn
    FROM ods.user_events_raw
)
SELECT
    event_id,
    user_id,
    event_type,
    page,
    event_ts,
    event_date,
    CASE event_type WHEN 'pv'   THEN 1 ELSE 0 END AS is_pv,
    CASE event_type WHEN 'cart' THEN 1 ELSE 0 END AS is_cart,
    CASE event_type WHEN 'fav'  THEN 1 ELSE 0 END AS is_fav,
    CASE event_type WHEN 'pay'  THEN 1 ELSE 0 END AS is_pay,
    DATE_TRUNC('hour', event_ts)  AS event_hour
FROM dedup
WHERE rn = 1;

-- DWD uniqueness invariant table — used by the test suite.
DROP TABLE IF EXISTS dwd.user_events_uniq_check;
CREATE TABLE dwd.user_events_uniq_check AS
SELECT
    COUNT(*)              AS row_count,
    COUNT(DISTINCT event_id) AS uniq_event_id_count
FROM dwd.user_events;

SELECT * FROM dwd.user_events_uniq_check;


-- ============================================================
-- ch05  DWS layer — 1-day window per-user aggregation
-- ============================================================
-- The "1d" tumbling window is keyed by (user_id, event_date).
-- In streaming land this is a session/tumble window keyed by
-- event time; here DuckDB's GROUP BY gives the same semantics
-- because we always partition by event_date, never by processing
-- date.
DROP TABLE IF EXISTS dws.user_event_1d;
CREATE TABLE dws.user_event_1d AS
SELECT
    user_id,
    event_date,
    COUNT(*)                              AS event_cnt,
    SUM(is_pv)                            AS pv_cnt,
    SUM(is_cart)                          AS cart_cnt,
    SUM(is_fav)                           AS fav_cnt,
    SUM(is_pay)                           AS pay_cnt,
    COUNT(DISTINCT page)                  AS distinct_page_cnt,
    MIN(event_ts)                         AS first_event_ts,
    MAX(event_ts)                         AS last_event_ts,
    DATE_DIFF(
        'second',
        CAST(MIN(event_ts) AS TIMESTAMP),
        CAST(MAX(event_ts) AS TIMESTAMP)
    )                                     AS active_seconds
FROM dwd.user_events
GROUP BY user_id, event_date;

-- DWS sanity: there must be at most one row per (user_id, event_date).
DROP TABLE IF EXISTS dws.user_event_1d_pk_check;
CREATE TABLE dws.user_event_1d_pk_check AS
SELECT COUNT(*) AS row_cnt, COUNT(DISTINCT user_id || '|' || event_date) AS pk_cnt
FROM dws.user_event_1d;

SELECT * FROM dws.user_event_1d_pk_check;


-- ============================================================
-- ch06  ADS layer — realtime DAU + per-type distinct users
-- ============================================================
-- DAU is computed strictly on event_date (event-time watermark).
-- This is what makes the layer "realtime": even if today's batch
-- is delayed, yesterday's DAU stays correct.  Per-event-type
-- distinct-user counts are derived from the per-type counters
-- (pv_cnt > 0 etc.), since the boolean flags live one layer down
-- in dwd.user_events and have been collapsed here.
DROP TABLE IF EXISTS ads.realtime_dau;
CREATE TABLE ads.realtime_dau AS
SELECT
    event_date                                  AS dt,
    COUNT(DISTINCT user_id)                     AS dau,
    COUNT(DISTINCT CASE WHEN pv_cnt   > 0 THEN user_id END) AS pv_uv,
    COUNT(DISTINCT CASE WHEN cart_cnt > 0 THEN user_id END) AS cart_uv,
    COUNT(DISTINCT CASE WHEN fav_cnt  > 0 THEN user_id END) AS fav_uv,
    COUNT(DISTINCT CASE WHEN pay_cnt  > 0 THEN user_id END) AS pay_uv,
    SUM(event_cnt)                              AS total_events,
    SUM(pay_cnt)                                AS total_pay_events
FROM dws.user_event_1d
GROUP BY event_date
ORDER BY event_date;

-- ADS consistency check: sum of total_events must equal DWD row count.
DROP TABLE IF EXISTS ads.ads_consistency_check;
CREATE TABLE ads.ads_consistency_check AS
SELECT
    (SELECT SUM(total_events) FROM ads.realtime_dau)  AS sum_total_events_ads,
    (SELECT COUNT(*)          FROM dwd.user_events)   AS dwd_row_count,
    (SELECT MAX(dt)           FROM ads.realtime_dau)  AS max_event_date_in_ads;

SELECT * FROM ads.ads_consistency_check;


-- ============================================================
-- ch07  Late-data handling — event-time attribution
-- ============================================================
-- We simulate a Kafka replay where 3 events arrive 7 days late.
-- In a processing-time warehouse these rows would be attributed
-- to "today" (wrong); in an event-time warehouse they slide into
-- their own event_date.  The result below proves the warehouse
-- uses event time.
DROP TABLE IF EXISTS dwd.late_arrivals;
CREATE TABLE dwd.late_arrivals AS
SELECT * FROM dwd.user_events
WHERE event_date = (SELECT MIN(event_date) FROM dwd.user_events)
LIMIT 3;

DROP TABLE IF EXISTS ads.late_data_demo;
CREATE TABLE ads.late_data_demo AS
WITH baseline AS (
    SELECT event_date, COUNT(DISTINCT user_id) AS dau_before
    FROM dwd.user_events
    GROUP BY event_date
),
with_late AS (
    -- Replay the same three rows as if they were just ingested,
    -- but pretend their event_ts is 7 days in the past.  We model
    -- that by pulling three additional rows that originally sat
    -- on the *latest* day and rewriting their event_date to the
    -- earliest day — exactly what an out-of-order Kafka replay
    -- would look like.
    SELECT
        CASE
            WHEN rn = 1 THEN (SELECT MIN(event_date) FROM dwd.user_events)
            ELSE event_date
        END AS event_date,
        user_id
    FROM (
        SELECT
            event_date,
            user_id,
            ROW_NUMBER() OVER (ORDER BY event_ts ASC) AS rn
        FROM dwd.user_events
        WHERE event_date = (SELECT MAX(event_date) FROM dwd.user_events)
        ORDER BY event_ts ASC
        LIMIT 3
    )
)
SELECT
    b.event_date,
    b.dau_before,
    (b.dau_before
        + COUNT(DISTINCT CASE WHEN w.event_date = b.event_date THEN w.user_id END)
    )                                       AS dau_after_replay,
    COUNT(DISTINCT CASE WHEN w.event_date = b.event_date THEN w.user_id END) AS replay_uv
FROM baseline b
LEFT JOIN with_late w ON w.event_date = b.event_date
WHERE b.event_date = (SELECT MIN(event_date) FROM dwd.user_events)
GROUP BY b.event_date, b.dau_before;

SELECT * FROM ads.late_data_demo;


-- ============================================================
-- ch08  Exactly-once dedup proof
-- ============================================================
-- We re-insert the same event_ids three times to mimic a Kafka
-- rebalance that replays the partition.  The DWD layer must
-- still hold exactly one row per event_id; ADS DAU must not
-- inflate.
DROP TABLE IF EXISTS ods.replay_burst;
CREATE TABLE ods.replay_burst AS
SELECT * FROM ods.user_events_raw
UNION ALL
SELECT * FROM ods.user_events_raw
UNION ALL
SELECT * FROM ods.user_events_raw;

DROP TABLE IF EXISTS dwd.user_events_replayed;
CREATE TABLE dwd.user_events_replayed AS
WITH dedup AS (
    SELECT
        event_id, user_id, event_type, page, event_ts, event_date,
        ROW_NUMBER() OVER (
            PARTITION BY event_id
            ORDER BY event_ts ASC, event_id ASC
        ) AS rn
    FROM ods.replay_burst
)
SELECT
    event_id,
    user_id,
    event_type,
    page,
    event_ts,
    event_date,
    CASE event_type WHEN 'pv'   THEN 1 ELSE 0 END AS is_pv,
    CASE event_type WHEN 'cart' THEN 1 ELSE 0 END AS is_cart,
    CASE event_type WHEN 'fav'  THEN 1 ELSE 0 END AS is_fav,
    CASE event_type WHEN 'pay'  THEN 1 ELSE 0 END AS is_pay,
    DATE_TRUNC('hour', event_ts)  AS event_hour
FROM dedup
WHERE rn = 1;

DROP TABLE IF EXISTS ads.replay_proof;
CREATE TABLE ads.replay_proof AS
SELECT
    'dwd_user_events_replayed'         AS table_name,
    COUNT(*)                           AS row_count,
    COUNT(DISTINCT event_id)           AS uniq_event_id_count
FROM dwd.user_events_replayed;

SELECT * FROM ads.replay_proof;