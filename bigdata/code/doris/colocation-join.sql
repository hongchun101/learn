-- ===================================================================
-- Doris / StarRocks 调优实战
--   涵盖:
--     1) 桶(Bucketed)表 + Colocation Join
--     2) Bitmap Index / 倒排索引
--     3) 自适应 Insert Into Shuffle
--     4) Materialized View / 实时物化视图
-- ===================================================================

-- 1) 创建 桶表(Colocation 必须同 bucket num + 同 cols + 同 distribution hash)
CREATE TABLE IF NOT EXISTS dwd_order (
    order_id     BIGINT      NOT NULL,
    user_id      BIGINT      NOT NULL,
    sku_id       BIGINT      NOT NULL,
    amount       DECIMAL(10,2),
    province     VARCHAR(20),
    dt           DATE        NOT NULL,
    -- Bucketed col 即 Join key,Colocation 让两个桶内同 colocation group
    -- 不需要再 Shuffle 拉数据
    INDEX idx_province (province) USING BITMAP COMMENT 'province bitmap index'
)
DUPLICATE KEY(order_id, dt)
PARTITION BY RANGE(dt) (
  PARTITION p20260801 VALUES [("2026-08-01"), ("2026-08-02")),
  PARTITION p20260802 VALUES [("2026-08-02"), ("2026-08-03")),
  PARTITION p20260803 VALUES [("2026-08-03"), ("2026-08-04"))
)
DISTRIBUTED BY HASH(user_id) BUCKETS 32
PROPERTIES (
    "replication_num"            = "3",
    "enable_colocate_join"       = "true",
    "colocate_with"              = "group_order_user",
    "bucket_size"                = "1073741824",  -- 1GB/bucket,减小文件数
    "storage_medium"             = "SSD",
    "storage_cooldown_time"      = "2026-12-31 00:00:00"
);

CREATE TABLE IF NOT EXISTS dwd_user (
    user_id      BIGINT      NOT NULL,
    user_name    VARCHAR(64),
    vip_level    VARCHAR(20),
    dt           DATE        NOT NULL,
    INDEX idx_vip_level (vip_level) USING BITMAP
)
DUPLICATE KEY(user_id, dt)
PARTITION BY RANGE(dt) (
  PARTITION p20260801 VALUES [("2026-08-01"), ("2026-08-02")),
  PARTITION p20260802 VALUES [("2026-08-02"), ("2026-08-03"))
)
DISTRIBUTED BY HASH(user_id) BUCKETS 32
PROPERTIES (
    "replication_num"        = "3",
    "enable_colocate_join"   = "true",
    "colocate_with"          = "group_order_user"
);

-- 检查 Colocation 关系
SHOW PROC '/colocation/group'

-- 2) Colocation Join(自动,无需 Hint)
EXPLAIN
SELECT /*+ SHUFFLE_NONE(t1) */
       o.order_id, u.user_name, SUM(o.amount)
FROM dwd_order o
JOIN dwd_user  u ON o.user_id = u.user_id AND o.dt = u.dt
WHERE o.dt = '2026-08-01'
GROUP BY o.order_id, u.user_name;

-- 3) 自适应 Shuffle Insert(对历史数据按需并发落桶)
SET enable_insert_strict = false;
SET parallel_fragment_exec_instance_num = 16;
INSERT INTO dwd_order PARTITION(p20260801)
SELECT * FROM stage.ods_order_raw WHERE dt = '2026-08-01';

-- 4) 异步物化视图(实时场景可降低查询延迟)
CREATE MATERIALIZED VIEW mv_user_gmv_1h
BUILD DEFERRED REFRESH COMPLETE ON COMMIT
DISTRIBUTED BY HASH(user_id) BUCKETS 16
AS
SELECT
  DATE_TRUNC('hour', create_time) AS hour_bucket,
  user_id,
  SUM(amount) AS gmv
FROM dwd_order
GROUP BY DATE_TRUNC('hour', create_time), user_id;

-- 5) 查询自动透明命中 MV
EXPLAIN
SELECT user_id, SUM(amount)
FROM dwd_order
WHERE create_time >= '2026-08-12 10:00:00'
GROUP BY user_id;
