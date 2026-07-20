-- Capstone — schema for a small e-commerce backend with users, orders,
-- products, reviews, and pgvector semantic search over reviews.
SET search_path = public;

CREATE EXTENSION IF NOT EXISTS citext;
DROP SCHEMA IF EXISTS shop CASCADE;
CREATE SCHEMA shop;

CREATE TABLE shop.users (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       citext UNIQUE,
    name        text NOT NULL,
    region      text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop.products (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku         text NOT NULL UNIQUE,
    name        text NOT NULL,
    price       numeric(12,2) NOT NULL CHECK (price >= 0),
    inventory   integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- RANGE partitioning by month; 24 partitions centred on today.
CREATE TABLE shop.orders (
    id          bigint GENERATED ALWAYS AS IDENTITY,
    placed_at   timestamptz NOT NULL DEFAULT now(),
    user_id     bigint NOT NULL REFERENCES shop.users(id),
    total       numeric(12,2) NOT NULL,
    status      text NOT NULL DEFAULT 'placed' CHECK (status IN ('placed','paid','shipped','cancelled')),
    region      text NOT NULL,
    PRIMARY KEY (placed_at, id)
) PARTITION BY RANGE (placed_at);

DO $$
DECLARE d date; m int;
BEGIN
    FOR m IN 0..23 LOOP
        d := (current_date - interval '12 months' + (m * interval '1 month'))::date;
        EXECUTE format(
          'CREATE TABLE shop.orders_%s PARTITION OF shop.orders FOR VALUES FROM (%L) TO (%L)',
          to_char(d,'YYYYMM'),
          date_trunc('month', d),
          (date_trunc('month', d) + interval '1 month')
        );
    END LOOP;
END $$;

CREATE INDEX orders_user_idx      ON shop.orders (user_id);
CREATE INDEX orders_region_status ON shop.orders (region, status);

CREATE TABLE shop.order_items (
    placed_at   timestamptz NOT NULL,
    order_id    bigint      NOT NULL,
    product_id  bigint      NOT NULL REFERENCES shop.products(id),
    qty         integer     NOT NULL CHECK (qty > 0),
    unit_price  numeric(12,2) NOT NULL,
    PRIMARY KEY (placed_at, order_id, product_id),
    FOREIGN KEY (placed_at, order_id) REFERENCES shop.orders(placed_at, id) ON DELETE CASCADE
);

CREATE TABLE shop.reviews (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id  bigint NOT NULL REFERENCES shop.products(id),
    user_id     bigint REFERENCES shop.users(id),
    body        text NOT NULL,
    rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reviews_product_idx ON shop.reviews (product_id);
CREATE INDEX reviews_rating_idx  ON shop.reviews (rating);
