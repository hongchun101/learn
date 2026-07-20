-- Solutions 14
SET search_path = sql_core, public;
DROP TABLE IF EXISTS events CASCADE;
CREATE TABLE events (
    id bigint GENERATED ALWAYS AS IDENTITY,
    day date NOT NULL,
    payload text,
    PRIMARY KEY (day, id)
) PARTITION BY RANGE (day);

DO $$
DECLARE i int; d date;
BEGIN
  FOR i IN 0..6 LOOP
    d := (CURRENT_DATE + i);
    EXECUTE format(
      'CREATE TABLE events_p%s PARTITION OF events FOR VALUES FROM (%L) TO (%L)',
      to_char(d,'YYYYMMDD'), d, (d + 1)
    );
  END LOOP;
END $$;

EXPLAIN SELECT count(*) FROM events WHERE day = CURRENT_DATE;
