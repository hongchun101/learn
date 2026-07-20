-- Capstone — seed data (deterministic).
SET search_path = shop, public;

INSERT INTO shop.users (email, name, region)
SELECT
    'user' || g || '@example.com',
    'User ' || g,
    (ARRAY['EU','US','APAC'])[1 + (g % 3)]
  FROM generate_series(1, 2000) g;

INSERT INTO shop.products (sku, name, price, inventory)
SELECT 'sku-' || g,
       'Product ' || g,
       (random()*100)::numeric(12,2),
       (50 + (random()*50))::int
  FROM generate_series(1, 1000) g;

INSERT INTO shop.orders (placed_at, user_id, total, status, region)
SELECT
    now() - ((g % 90) || ' days')::interval,
    1 + (g % 2000),
    (random()*200)::numeric(12,2),
    (ARRAY['placed','paid','shipped','cancelled'])[1 + (g % 4)],
    (ARRAY['EU','US','APAC'])[1 + (g % 3)]
  FROM generate_series(1, 10000) g;

INSERT INTO shop.order_items (placed_at, order_id, product_id, qty, unit_price)
SELECT
    o.placed_at,
    o.id,
    1 + (o.id % 1000),
    1 + (o.id % 5),
    p.price
  FROM shop.orders o
  JOIN shop.products p ON p.id = 1 + (o.id % 1000)
 LIMIT 5000;

INSERT INTO shop.reviews (product_id, user_id, body, rating)
SELECT 1 + (g % 1000),
       1 + (g % 2000),
       'Review ' || g || ' ' ||
       (ARRAY['Excellent', 'Decent', 'Poor', 'Solid', 'Great'])[1 + (g % 5)] ||
       ' option at this price point. Highly recommended for daily use.',
       1 + (g % 5)
  FROM generate_series(1, 5000) g;

ANALYZE shop.users;
ANALYZE shop.products;
ANALYZE shop.orders;
ANALYZE shop.order_items;
ANALYZE shop.reviews;
