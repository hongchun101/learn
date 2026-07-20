-- Module 01 — Types and Tables
-- Models the data layer: numeric, text, temporal, jsonb, arrays, ranges,
-- composite, enum, domain.
\echo === Module 01: Types and Tables ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS t_text_demo CASCADE;
DROP TYPE  IF EXISTS mood CASCADE;
DROP TYPE  IF EXISTS audit_t CASCADE;
DROP DOMAIN IF EXISTS http_status CASCADE;

-- 1.7 ENUM definition
CREATE TYPE mood AS ENUM ('happy', 'sad', 'angry', 'jubilant', 'pensive');

-- 1.8 Composite type
CREATE TYPE audit_t AS (
    created_by    text,
    created_at    timestamptz,
    notes         text
);

-- 1.9 DOMAIN over integer
CREATE DOMAIN http_status AS integer
    CHECK (VALUE BETWEEN 100 AND 599);

-- 1.1+ Base types + 1.2 temporal + 1.3 json + 1.4 arrays + 1.5 network + 1.6 range + 1.7/1.8/1.9
CREATE TABLE t_text_demo (
    id              bigserial PRIMARY KEY,
    fixed_text      char(8)              NOT NULL,
    name            text                 NOT NULL,
    count           integer              NOT NULL CHECK (count > 0),
    price           numeric(12, 2)       NOT NULL,
    exchange_rate   double precision,
    is_active       boolean              NOT NULL DEFAULT true,
    created_at      timestamptz          NOT NULL DEFAULT now(),
    on_date         date                 NOT NULL,
    open_time       time                 NOT NULL,
    during_window   tstzrange            NOT NULL,
    metadata        jsonb                NOT NULL DEFAULT '{}'::jsonb,
    tags            text[]               NOT NULL DEFAULT '{}',
    ip              inet                 NOT NULL,
    subnet          cidr                 NOT NULL,
    active_window   daterange            NOT NULL,
    mood            mood                 NOT NULL,
    audit           audit_t              NOT NULL,
    status_code     http_status          NOT NULL DEFAULT 200
);

INSERT INTO t_text_demo (
    fixed_text, name, count, price, exchange_rate, created_at, on_date, open_time,
    during_window, metadata, tags, ip, subnet, active_window, mood, audit, status_code
) VALUES
('A0001', 'Alpha product', 5, 19.99, 1.0876, now(), '2025-12-01', '09:30:00',
 tstzrange('2025-12-01 09:30:00+00', '2025-12-01 17:00:00+00'),
 '{"origin":"eu","score":0.42}'::jsonb,
 ARRAY['sale','featured'],
 '10.0.0.1'::inet,
 '10.0.0.0/24'::cidr,
 daterange('2025-12-01', '2025-12-31', '[]'),
 'happy',
 ROW('alice', now(), 'first row'),
 200),
('A0002', 'Beta product',  1, 4.99, 1.0876, now(), '2025-12-02', '09:30:00',
 tstzrange('2025-12-02 09:30:00+00', '2025-12-02 17:00:00+00'),
 '{"origin":"us","flags":{"red":true}}'::jsonb,
 ARRAY['clearance'],
 '192.168.1.5'::inet,
 '192.168.1.0/24'::cidr,
 daterange('2025-12-02', '2026-01-02', '[)'),
 'sad',
 ROW('bob', now(), 'second row'),
 404);

SELECT id, name,
       metadata -> 'origin'  AS origin_text,
       metadata ->> 'origin' AS origin_unquoted
  FROM t_text_demo;

SELECT id FROM t_text_demo WHERE metadata @> '{"origin":"eu"}'::jsonb;
SELECT id FROM t_text_demo WHERE metadata ? 'flags';

SELECT id, name
  FROM t_text_demo
 WHERE 'featured' = ANY(tags);

SELECT id, name, array_length(tags, 1) AS tag_count
  FROM t_text_demo;

SELECT id, name, active_window
  FROM t_text_demo
 WHERE active_window @> current_date;

SELECT name, mood, mood > 'happy' AS happier_than_happy
  FROM t_text_demo
 ORDER BY mood DESC;

\echo === Module 01 complete ===
