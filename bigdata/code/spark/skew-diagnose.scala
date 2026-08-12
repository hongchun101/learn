/**
 * Spark 数据倾斜诊断与 AQE + Salt Join 解决方案
 *
 * 覆盖:
 *  1. 用 Spark UI / Metrics 定位 skew Stage
 *  2. AQE 自动 skew join(Spark 3.x 必开)
 *  3. 手动 salt 打散 + 两阶段 join
 *  4. 自适应 partition 合并 + Broadcast 阈值调整
 */
package bigdata.tutorial.spark.skew

import org.apache.spark.sql.{SaveMode, SparkSession}
import org.apache.spark.sql.functions._

object SkewDiagnostics {

  def main(args: Array[String]): Unit = {
    val spark = SparkSession.builder()
      .appName("SkewDiagnostics")
      // [★ 生产必开] Spark 3.x 必开 AQE,实测 30%+ 提升
      .config("spark.sql.adaptive.enabled", "true")
      .config("spark.sql.adaptive.skewJoin.enabled", "true")
      // 倾斜阈值:大于该值(默认 256MB)+ partition 数量满足条件才会拆分
      .config("spark.sql.adaptive.skewJoin.skewedPartitionFactor", "5")
      .config("spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes", "256MB")
      // 合并小 partition
      .config("spark.sql.adaptive.coalescePartitions.enabled", "true")
      // 提高 Broadcast Join 阈值(默认 10MB,可上至 200MB)
      .config("spark.sql.autoBroadcastJoinThreshold", "209715200")  // 200MB
      .getOrCreate()

    import spark.implicits._

    val dfOrder = spark.read.parquet("hdfs:///data/order/order.parquet")
    val dfUser  = spark.read.parquet("hdfs:///data/dim/user.parquet")

    // ============================================================
    // 步骤 1:诊断倾斜
    //   思路:写一个聚合,统计 key 分布,热 key 数量超过平均值的 5× 即判定倾斜
    // ============================================================
    val keyDist = dfOrder.groupBy("user_id").count().orderBy(desc("count"))
    keyDist.show(10, false)

    val total = dfOrder.count()
    val hotKeys = keyDist
      .where(col("count") > total / 100000 * 50)   // 单 key > 平均 50× 视为热 key
      .select("user_id")
      .collect()
      .map(_.getLong(0)).toSet

    println(s"[Diagnostics] hotKey count = ${hotKeys.size}")

    // ============================================================
    // 步骤 2:AQE 自动处理(若是 Spark 3.x,优先依赖此机制,90% 场景无需代码改动)
    // ============================================================
    val joinPlan = dfOrder.join(dfUser, "user_id")
    joinPlan.write.mode(SaveMode.Overwrite).parquet("hdfs:///data/result/aqe")

    // ============================================================
    // 步骤 3:手动 Salt Join(极端倾斜最后退路)
    //   思路:大表的热 key 加随机前缀,扩散到多个 bucket,两阶段 join
    // ============================================================
    val saltNum = 50
    val orderSalt = dfOrder
      .withColumn("salt", (lit(rand(seed = 42) * saltNum)).cast("int"))
      .withColumn("salted_user_id", concat_ws("_", col("user_id"), col("salt")))

    val userBroadcast = broadcast(dfUser).withColumnRenamed("user_id", "user_id2")
    val salted = orderSalt.join(userBroadcast, orderSalt("user_id") === userBroadcast("user_id2"))
    salted.write.mode(SaveMode.Overwrite).parquet("hdfs:///data/result/salted")

    // ============================================================
    // 步骤 4:写一份聚合,把统计信息也写出去,便于复盘
    // ============================================================
    keyDist.write.mode(SaveMode.Overwrite).parquet("hdfs:///data/result/key_dist")

    spark.stop()
  }
}
