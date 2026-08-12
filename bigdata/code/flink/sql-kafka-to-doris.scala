/**
 * Flink SQL:Kafka → Doris 实时数仓分层(ODS → DWD → DWS)
 *
 * 演示:
 *  - MiniBatch(Local-Global)聚合
 *  - Lookup Join 维表(MySQL)
 *  - Retraction 流(Exactly-Once)
 */
package bigdata.tutorial.flink.sql

import org.apache.flink.streaming.api.scala.StreamExecutionEnvironment
import org.apache.flink.table.api.bridge.scala._
import org.apache.flink.table.api._

object KafkaToDorisRealtime {

  def main(args: Array[String]): Unit = {
    val env = StreamExecutionEnvironment.getExecutionEnvironment
    env.enableCheckpointing(60000)
    env.getCheckpointConfig.setCheckpointingMode(CheckpointingMode.EXACTLY_ONCE)

    val tEnv = StreamTableEnvironment.create(env)
    // [★ MiniBatch 配置] MiniBatch 适合秒级聚合场景,降低 State 访问压力
    tEnv.getConfig.set("table.exec.mini-batch.enabled", "true")
    tEnv.getConfig.set("table.exec.mini-batch.allow-latency", "5s")
    tEnv.getConfig.set("table.exec.mini-batch.size", "1000")
    // [★ Local-Global 聚合] 两阶段聚合,缓解数据倾斜
    tEnv.getConfig.set("table.optimizer.agg-phase-strategy", "AUTO")

    // ===================== ODS =====================
    tEnv.executeSql("""
      CREATE TABLE ods_order_kafka (
        order_id  BIGINT,
        user_id   BIGINT,
        sku_id    BIGINT,
        amount    DECIMAL(10,2),
        event_ts  TIMESTAMP(3) METADATA FROM 'timestamp'
      ) WITH (
        'connector' = 'kafka',
        'topic'     = 'orders',
        'properties.bootstrap.servers' = 'kafka:9092',
        'format'    = 'json',
        'scan.startup.mode' = 'earliest'
      )
    """)

    // ===================== DIM 维表(MySQL)=====================
    tEnv.executeSql("""
      CREATE TABLE dim_user (
        user_id    BIGINT,
        user_name  STRING,
        vip_level  STRING,
        PRIMARY KEY (user_id) NOT ENFORCED
      ) WITH (
        'connector' = 'mysql-cdc',
        'hostname'  = 'mysql.host',
        'port'      = '3306',
        'username'  = 'repl_user',
        'password'  = '${sys.env.getOrElse("MYSQL_PWD", "")}',
        'database-name' = 'shop',
        'table-name'    = 'user',
        'scan.startup.mode' = 'latest-offset'
      )
    """)

    // ===================== DWD =====================
    tEnv.executeSql("""
      CREATE VIEW dwd_order AS
      SELECT
        o.order_id,
        o.user_id,
        u.user_name,
        u.vip_level,
        o.amount,
        o.event_ts
      FROM ods_order_kafka o
      JOIN dim_user    FOR SYSTEM_TIME AS OF o.proc_time AS u
        ON o.user_id = u.user_id
    """)

    // ===================== DWS(MiniBatch + Local-Global)=====================
    tEnv.executeSql("""
      CREATE VIEW dws_user_gmv_1min AS
      SELECT
        TUMBLE_START(event_ts, INTERVAL '1' MINUTE) AS window_start,
        user_id,
        SUM(amount) AS gmv
      FROM dwd_order
      GROUP BY TUMBLE(event_ts, INTERVAL '1' MINUTE), user_id
    """)

    tEnv.executeSql("""
      CREATE TABLE dws_sink_kafka (
        window_start TIMESTAMP(3),
        user_id      BIGINT,
        gmv          DECIMAL(20,2)
      ) WITH ('connector' = 'print')
    """)

    tEnv.executeSql("INSERT INTO dws_sink_kafka SELECT * FROM dws_user_gmv_1min")

    // env.execute("KafkaToDorisRealtime")
  }
}
