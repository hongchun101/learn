-- Capstone — functions, triggers, RLS.
SET search_path = shop, public;

CREATE OR REPLACE FUNCTION shop.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.created_at := NEW.created_at;       -- pass-through (created_at not touched here)
    RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION shop.make_review_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('review_posted',
        json_build_object('product_id', NEW.product_id, 'rating', NEW.rating)::text);
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS reviews_notify_trg ON shop.reviews;
CREATE TRIGGER reviews_notify_trg
    AFTER INSERT ON shop.reviews
    FOR EACH ROW EXECUTE FUNCTION shop.make_review_audit();

DROP TABLE IF EXISTS shop.audit_log CASCADE;
DROP TABLE IF EXISTS shop.session_token CASCADE;

CREATE TABLE shop.audit_log (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at         timestamptz NOT NULL DEFAULT clock_timestamp(),
    actor      text NOT NULL DEFAULT current_user,
    txid       bigint NOT NULL DEFAULT txid_current(),
    action     text NOT NULL,
    row_pk     text,
    payload    jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE shop.session_token (
    token       text PRIMARY KEY,
    user_id     bigint NOT NULL REFERENCES shop.users(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION shop.current_actor() RETURNS bigint
LANGUAGE plpgsql STABLE AS $$
DECLARE v text;
BEGIN
    v := current_setting('app.actor_token', true);
    IF v IS NULL OR v = '' THEN
        RETURN NULL;
    END IF;
    RETURN (SELECT user_id FROM shop.session_token WHERE token = v);
END
$$;

ALTER TABLE shop.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop.order_items ENABLE ROW LEVEL SECURITY;

-- Grants: app_reader can SELECT; app_writer can do anything.
GRANT USAGE ON SCHEMA shop TO app_reader, app_writer;
GRANT SELECT ON shop.orders, shop.order_items, shop.products,
                shop.users, shop.reviews TO app_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON shop.orders, shop.order_items,
                shop.products, shop.users, shop.reviews TO app_writer;
DROP POLICY IF EXISTS orders_self ON shop.orders;
DROP POLICY IF EXISTS order_items_self ON shop.order_items;
CREATE POLICY orders_self ON shop.orders USING (user_id = shop.current_actor());
CREATE POLICY order_items_self ON shop.order_items
    USING (EXISTS (SELECT 1 FROM shop.orders o
                    WHERE o.placed_at = order_items.placed_at
                      AND o.id = order_items.order_id
                      AND o.user_id = shop.current_actor()));
