/**
 * Flink CDC MySQL → Doris 实时同步
 *
 * 演示:
 *  - Flink CDC(基于 Debezium)整库快照 + binlog 增量
 *  - Doris Stream Load + Two-Phase Commit 实现 Exactly-Once
 *  - 通过 Flink Checkpoint + Database Snapshot 机制保证端到端一致性
 */
package bigdata.tutorial.flink.cdc

import org.apache.flink.api.common.eventtime.WatermarkStrategy
import org.apache.flink.connector.kafka.source.KafkaSource
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer
import org.apache.flink.streaming.api.environment.CheckpointConfig
import org.apache.flink.streaming.api.scala._
import org.apache.flink.table.api.bridge.scala._
import org.apache.flink.table.api._

object CdcMysqlToDoris {

  def main(args: Array[String]): Unit = {
    val env = StreamExecutionEnvironment.getExecutionEnvironment
    env.setParallelism(4)
    env.enableCheckpointing(60000)   // 每 60s 一次 Checkpoint

    val tEnv = StreamTableEnvironment.create(env)
    tEnv.getConfig.set("execution.checkpointing.interval", "60s")
    tEnv.getConfig.set("execution.checkpointing.mode", "EXACTLY_ONCE")

    // ========================= 1. MySQL CDC 源表 =========================
    tEnv.executeSql(s"""
      CREATE TABLE mysql_orders (
        id          BIGINT PRIMARY KEY NOT ENFORCED,
        user_id     BIGINT,
        sku_id      BIGINT,
        amount      DECIMAL(10,2),
        status      STRING,
        create_time TIMESTAMP(3),
        update_time TIMESTAMP(3)
      ) WITH (
        'connector' = 'mysql-cdc',
        'hostname'  = 'mysql.host',
        'port'      = '3306',
        'username'  = 'repl_user',
        'password'  = '${sys.env.getOrElse("MYSQL_PWD", "")}',
        'database-name' = 'shop',
        'table-name'    = 'orders',
        'scan.startup.mode' = 'initial',          -- 全量快照 + 增量
        'debezium.snapshot.mode' = 'initial',
        'debezium.chunk.size' = '16384'
      )
    """)

    // ========================= 2. Doris 目标表(主键模型,UPSERT) =========================
    tEnv.executeSql(s"""
      CREATE TABLE doris_orders (
        id          BIGINT,
        user_id     BIGINT,
        sku_id      BIGINT,
        amount      DECIMAL(10,2),
        status      STRING,
        create_time TIMESTAMP(3),
        update_time TIMESTAMP(3),
        PRIMARY KEY (id) NOT ENFORCED
      ) WITH (
        'connector' = 'doris',
        'fenodes'   = '127.0.0.1:8030',
        'table.identifier' = 'shop.orders',
        'username'  = 'root',
        'password'  = '',
        'sink.enable-2pc' = 'true',             -- Two-Phase Commit,Exactly-Once
        'sink.use.replay' = 'true',
        'sink.buffer.size' = '1024',
        'sink.buffer.flush.interval' = '10s'
      )
    """)

    // ========================= 3. 同步作业 + ETL 处理 =========================
    tEnv.executeSql("""
      INSERT INTO doris_orders
      SELECT
        id, user_id, sku_id, amount, status,
        create_time, update_time
      FROM mysql_orders
    """)

    // env.execute("CdcMysqlToDoris")  // Table API 自带 execute
  }
}
