-- Exercise 01 — Types and Tables
SET search_path = sql_core, public;

DROP TABLE IF EXISTS ex01;
CREATE TABLE ex01 (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title   text NOT NULL,
    tag     text NOT NULL,
    meta    jsonb NOT NULL DEFAULT '{}',
    weight  numeric(10,3) NOT NULL,
    geom    point
);

INSERT INTO ex01(title, tag, meta, weight, geom) VALUES
 ('hello', 'greeting', '{"lang":"en"}', 1.0, point(0,0)),
 ('hola',  'greeting', '{"lang":"es"}', 1.1, point(1,1)),
 ('bye',   'farewell', '{"lang":"en"}', 0.9, point(2,2));

-- Q1: Return (title, weight) ordered by weight desc, only 'greeting'.
-- SELECT ...

-- Q2: Use the @> operator to find rows where meta.lang = 'en'.

-- Q3: Return rows where tag is in ('greeting', 'farewell').
