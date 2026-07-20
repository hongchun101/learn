-- Solutions 04
SET search_path = sql_core, public;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS e CASCADE;

CREATE TABLE tags (id bigint PRIMARY KEY, name text);
INSERT INTO tags VALUES (1,'hot'),(2,'cold');

CREATE TABLE e (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name      text NOT NULL,
    value     numeric(10,2) NOT NULL CHECK (value > 0),
    tag_id    bigint REFERENCES tags(id),
    status    text CHECK (status IN ('ok','review','reject'))
);

-- FK with NOT VALID + VALIDATE
ALTER TABLE e ADD CONSTRAINT e_tag_fk FOREIGN KEY (tag_id) REFERENCES tags(id) NOT VALID;
ALTER TABLE e VALIDATE CONSTRAINT e_tag_fk;
SELECT conname, convalidated FROM pg_constraint WHERE conname='e_tag_fk';
