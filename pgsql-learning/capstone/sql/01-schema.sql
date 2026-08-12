-- Capstone — schema for a small e-commerce backend with users, orders,
-- products, reviews, and pgvector semantic search over reviews.
--
-- The whole script is idempotent: a second run produces the same
-- end state.
SET search_path = public, pg_catalog;

-- citext may have been installed by an earlier module into a
-- non-public schema. We want it in public for this capstone. If it
-- is already installed in public, this is a no-op; otherwise we
-- install it now.
DO $citext$
BEGIN
    BEGIN
        EXECUTE 'CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public';
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            EXECUTE 'CREATE EXTENSION IF NOT EXISTS citext';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'citext setup: %', SQLERRM;
        END;
    END;
END
$citext$;

-- Drop and recreate the schema wholesale. This makes the script
-- idempotent and guarantees a clean state for the rest.
DROP SCHEMA IF EXISTS shop CASCADE;
CREATE SCHEMA shop;

-- email column: citext if available, text otherwise. The DO block
-- only handles "no citext" (undefined_object); duplicate_table is
-- caught by the IF NOT EXISTS below.
CREATE TABLE shop.users (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       text UNIQUE,
    name        text NOT NULL,
    region      text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

DO $citext_fix$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type t
                JOIN pg_namespace n ON n.oid = t.typnamespace
               WHERE t.typname = 'citext') THEN
        -- We have citext somewhere in the search_path. Convert the
        -- email column to citext if it is still plain text.
        BEGIN
            ALTER TABLE shop.users
                ALTER COLUMN email TYPE citext USING email::citext;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'citext conversion skipped: %', SQLERRM;
        END;
    END IF;
END
$citext_fix$;

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
          'CREATE TABLE IF NOT EXISTS shop.orders_%s PARTITION OF shop.orders FOR VALUES FROM (%L) TO (%L)',
          to_char(d,'YYYYMM'),
          date_trunc('month', d),
          (date_trunc('month', d) + interval '1 month')
        );
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS orders_user_idx      ON shop.orders (user_id);
CREATE INDEX IF NOT EXISTS orders_region_status ON shop.orders (region, status);

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

CREATE INDEX IF NOT EXISTS reviews_product_idx ON shop.reviews (product_id);
CREATE INDEX IF NOT EXISTS reviews_rating_idx  ON shop.reviews (rating);
