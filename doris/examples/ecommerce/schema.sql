-- Apache Doris 4.x 电商教程：表结构
-- 单 BE 教学环境使用 replication_num=1；生产必须按故障域设计副本。
-- replication_num=1 + Merge-on-Write 只适合实验：单 BE/磁盘故障可能直接丢失该 Tablet 数据，
-- 且无法体验副本修复。生产先按故障域配置多副本，再评估 MoW 写入与 Compaction 成本。

CREATE DATABASE IF NOT EXISTS doris_lab;
USE doris_lab;

DROP TABLE IF EXISTS dim_user;
CREATE TABLE dim_user (
    user_id        BIGINT NOT NULL,
    user_name      VARCHAR(64) NOT NULL,
    city           VARCHAR(32),
    user_level     TINYINT,
    register_time  DATETIME,
    update_time    DATETIME
)
UNIQUE KEY(user_id)
DISTRIBUTED BY HASH(user_id) BUCKETS 4
PROPERTIES (
    "replication_num" = "1",
    "enable_unique_key_merge_on_write" = "true"
);

DROP TABLE IF EXISTS fact_orders;
CREATE TABLE fact_orders (
    order_id       BIGINT NOT NULL,
    order_date     DATE NOT NULL,
    user_id        BIGINT NOT NULL,
    shop_id        BIGINT NOT NULL,
    order_status   VARCHAR(16) NOT NULL,
    pay_amount     DECIMAL(18, 2) NOT NULL,
    province       VARCHAR(32),
    create_time    DATETIME NOT NULL,
    update_time    DATETIME NOT NULL
)
UNIQUE KEY(order_id, order_date)
PARTITION BY RANGE(order_date) (
    PARTITION p202608 VALUES [('2026-08-01'), ('2026-09-01')),
    PARTITION pmax VALUES [('2026-09-01'), ('9999-12-31'))
)
DISTRIBUTED BY HASH(order_id) BUCKETS 8
PROPERTIES (
    "replication_num" = "1",
    "enable_unique_key_merge_on_write" = "true"
);

DROP TABLE IF EXISTS fact_order_items;
CREATE TABLE fact_order_items (
    order_date      DATE NOT NULL,
    shop_id         BIGINT NOT NULL,
    order_id        BIGINT NOT NULL,
    item_id         BIGINT NOT NULL,
    user_id         BIGINT NOT NULL,
    category_id     INT NOT NULL,
    product_name    VARCHAR(128),
    quantity        INT NOT NULL,
    unit_price      DECIMAL(18, 2) NOT NULL,
    discount_amount DECIMAL(18, 2) NOT NULL DEFAULT "0.00",
    event_time      DATETIME NOT NULL
)
DUPLICATE KEY(order_date, shop_id, order_id)
PARTITION BY RANGE(order_date) (
    PARTITION p202608 VALUES [('2026-08-01'), ('2026-09-01')),
    PARTITION pmax VALUES [('2026-09-01'), ('9999-12-31'))
)
DISTRIBUTED BY HASH(order_id) BUCKETS 8
PROPERTIES ("replication_num" = "1");

DROP TABLE IF EXISTS agg_shop_daily;
CREATE TABLE agg_shop_daily (
    order_date       DATE NOT NULL,
    shop_id          BIGINT NOT NULL,
    category_id      INT NOT NULL,
    gmv              DECIMAL(20, 2) SUM DEFAULT "0.00",
    item_count       BIGINT SUM DEFAULT "0",
    order_bitmap     BITMAP BITMAP_UNION,
    buyer_hll        HLL HLL_UNION
)
AGGREGATE KEY(order_date, shop_id, category_id)
PARTITION BY RANGE(order_date) (
    PARTITION p202608 VALUES [('2026-08-01'), ('2026-09-01')),
    PARTITION pmax VALUES [('2026-09-01'), ('9999-12-31'))
)
DISTRIBUTED BY HASH(shop_id) BUCKETS 4
PROPERTIES ("replication_num" = "1");
