/**
 * Spark SQL + Catalyst + AQE + Codegen 综合调优演示
 *
 * 涵盖:
 *   - ANALYZE TABLE(统计信息收集,CBO 基础)
 *   - Cost-Based Optimization
 *   - Whole-Stage Code Generation
 *   - Adaptive Query Execution(AQE)
 *   - Runtime Filter / Bloom Filter
 *   - Join 策略:Hint / 自动选择
 */
package bigdata.tutorial.spark.sql

import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.functions._

object SqlTuningAqe {

  def main(args: Array[String]): Unit = {
    val spark = SparkSession.builder()
      .appName("SqlTuningAqe")
      .config("spark.sql.adaptive.enabled", "true")
      .config("spark.sql.adaptive.skewJoin.enabled", "true")
      .config("spark.sql.adaptive.coalescePartitions.enabled", "true")
      .config("spark.sql.adaptive.localShuffleReader.enabled", "true")
      .config("spark.sql.codegen.wholeStage", "true")
      .config("spark.sql.codegen.fallback", "true")
      .config("spark.sql.cbo.enabled", "true")
      .config("spark.sql.cbo.planStats.enabled", "true")
      // [★ 推荐] 关闭自动 broadcast 倾斜 join,并改用 AQE 拆分
      .config("spark.sql.autoBroadcastJoinThreshold", "104857600") // 100MB
      .getOrCreate()

    // 1) 创建测试表
    spark.sql("""
      CREATE TABLE IF NOT EXISTS user_behavior (
        user_id   BIGINT,
        item_id   BIGINT,
        category  STRING,
        action    STRING,
        ts        TIMESTAMP
      ) USING PARQUET
      PARTITIONED BY (dt STRING)
    """)

    // 2) ANALYZE 统计信息(无统计,CBO 无法选择最优 Join)
    spark.sql("ANALYZE TABLE user_behavior COMPUTE STATISTICS FOR COLUMNS user_id, category")
    spark.sql("ANALYZE TABLE user_behavior COMPUTE STATISTICS NOSCAN")

    // 3) 一次典型查询:Top-10 category 的转化率
    val df = spark.read.parquet("hdfs:///data/user_behavior")

    val result = df
      .filter("dt BETWEEN '2026-08-01' AND '2026-08-12'")
      .groupBy("category")
      .agg(
        countDistinct("user_id").as("uv"),
        sum(when(col("action") === "buy", 1).otherwise(0)).as("buy_cnt")
      )
      .withColumn("conversion", col("buy_cnt") / col("uv"))
      .orderBy(col("conversion").desc)
      .limit(10)

    // 4) 打印执行计划,看 AQE/Codegen/BroadcastExchange
    result.explain(true)
    result.show()

    // 5) 强制指定 Join 策略(SQL Hint)
    spark.sql("""
      SELECT /*+ BROADCAST(small_t) */
             big_t.user_id, small_t.user_name
      FROM big_event_table big_t
      JOIN dim_user small_t ON big_t.user_id = small_t.user_id
    """)

    spark.stop()
  }
}
