-- Module 04 — DDL and Constraints
\echo === Module 04: DDL and Constraints ===
SET search_path = sql_core, public;

DROP TABLE IF EXISTS orders, customers, addresses, line_items, big_orders, legs, measured, old_measurement CASCADE;

-- 4.1 IDENTITY vs serial
CREATE TABLE customers (
    id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- IDENTITY conforms to the SQL standard; serial is legacy shorthand.
    email text   NOT NULL UNIQUE,
    name  text   NOT NULL
);

-- 4.2 FK with ON DELETE / ON UPDATE behaviour
CREATE TABLE addresses (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  bigint NOT NULL REFERENCES customers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    line         text   NOT NULL
);
-- ON DELETE CASCADE: addresses follow customers into oblivion.
-- ON DELETE SET NULL/SET DEFAULT/RESTRICT/NO ACTION: each does what it says.

-- 4.3 CHECK constraints
CREATE TABLE orders (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  bigint NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    status       text   NOT NULL CHECK (status IN ('pending','paid','shipped','cancelled')),
    total        numeric(12,2) NOT NULL CHECK (total >= 0),
    -- Compound CHECK:
    CONSTRAINT orders_total_status CHECK (
        (status = 'pending' AND total = 0)
        OR  status <> 'pending'
    ),
    placed_at    timestamptz NOT NULL DEFAULT now(),
    -- Constraint uses both columns; ANSI calls this row-level CHECK.
    -- We can also defer some checks; here, no DEFERRABLE clause is fine because they're immediate.
    CONSTRAINT orders_customer_status_uniq UNIQUE (customer_id, status)
);

-- 4.4 GENERATED columns
CREATE TABLE line_items (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    qty           integer   NOT NULL CHECK (qty > 0),
    unit_price    numeric(12,2) NOT NULL CHECK (unit_price >= 0),
    line_total    numeric(12,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
    -- STORED columns are computed at insert/update and stored on disk.
    -- VIRTUAL is the SQL standard but PostgreSQL does not yet support it.
    sku           text      NOT NULL
);

-- 4.5 Partial unique index for soft-deletes (we'll create the index in M11).

-- 4.6 Inheritance is deprecated and not recommended — we mention it only to
-- not be surprised when we see it.
DROP TABLE IF EXISTS measured CASCADE;
DROP TABLE IF EXISTS old_measurement CASCADE;
CREATE TABLE measured (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- unlike partitioned tables, inheritance creates truly separate tables.
    ts          timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE old_measurement () INHERITS (measured);

-- 4.7 Deferrable constraint (rare but real)
CREATE TABLE legs (
    left_id  integer NOT NULL REFERENCES orders(id) DEFERRABLE INITIALLY IMMEDIATE,
    right_id integer NOT NULL REFERENCES orders(id) DEFERRABLE INITIALLY IMMEDIATE,
    -- DEFERRABLE INITIALLY IMMEDIATE: check now, but allow SET CONSTRAINTS ALL DEFERRED inside the txn.
    CHECK (left_id <> right_id)
);

INSERT INTO customers (email, name) VALUES
 ('a@example.com','Alice'),
 ('b@example.com','Bob');
INSERT INTO addresses (customer_id, line) VALUES (1,'1 Main St'),(1,'2 Oak St');
INSERT INTO orders (customer_id, status, total) VALUES
 (1,'pending', 0),
 (2,'paid', 9.99);
INSERT INTO line_items (qty, unit_price, sku) VALUES (2, 4.99,'SKU-A'),(1, 9.99,'SKU-B');

SELECT * FROM line_items;
SELECT id, customer_id, status, total FROM orders ORDER BY id;

-- 4.8 NOT VALID + VALIDATE CONSTRAINT for large-table FK migrations.
DROP TABLE IF EXISTS big_orders CASCADE;
CREATE TABLE big_orders (LIKE orders);
INSERT INTO big_orders SELECT * FROM orders;

ALTER TABLE big_orders ADD CONSTRAINT big_orders_customer_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;
-- NOT VALID: assume the data is good; do not scan the table.
ALTER TABLE big_orders VALIDATE CONSTRAINT big_orders_customer_fkey;
-- VALIDATE: do the scan, but without holding an ACCESS EXCLUSIVE lock.

\echo === Module 04 complete ===
