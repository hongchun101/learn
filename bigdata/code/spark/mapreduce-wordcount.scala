/**
 * Spark WordCount with Combiner
 *
 * 演示:对比 *有 Combiner* 与 *无 Combiner* 的 Shuffle 数据量差异。
 * Combiner = Map 端局部聚合,把 Map → Reduce 的 Shuffle 量从 N 降到 N/K(K = Combiner 桶数)。
 *
 * 编译/运行:
 *   spark-submit --master local[4] --class WordCountWithCombiner \
 *     --name WordCountWithCombiner target/wordcount.jar <input> <output>
 */
package bigdata.tutorial.spark

import org.apache.spark.rdd.RDD
import org.apache.spark.{SparkConf, SparkContext}

object WordCountWithCombiner {
  def main(args: Array[String]): Unit = {
    require(args.length == 2, "Usage: WordCountWithCombiner <input> <output>")

    val conf = new SparkConf()
      .setAppName("WordCountWithCombiner")
      // [★ 生产建议] Kryo 序列化:序列化体积减少 2~5×,Shuffle 写盘 IO 同比下降
      .set("spark.serializer", "org.apache.spark.serializer.KryoSerializer")
      .registerKryoClasses(Array(classOf[scala.Tuple2[_, _]]))

    val sc = new SparkContext(conf)
    val input = args(0)
    val output = args(1)

    val raw: RDD[String] = sc.textFile(input)

    // ========================= 路径 1:无 Combiner =========================
    val t1 = System.currentTimeMillis()
    val noCombiner = raw
      .flatMap(_.toLowerCase.split("\\W+").filter(_.nonEmpty))
      .map((_, 1))
      .reduceByKey(_ + _)   // [★ 默认 reduceByKey 会自动加 localCombiner,关闭很难]
      // .groupByKey             // 用 groupByKey 替代 reduceByKey 才能关闭 Combiner
    val c1 = noCombiner.collectAsMap()
    println(s"[No-Combiner] keys=${c1.size} elapsed=${System.currentTimeMillis() - t1} ms")

    // ========================= 路径 2:有 Combiner(等价于两阶段聚合) =========================
    val t2 = System.currentTimeMillis()
    val withCombiner = raw
      .flatMap(_.toLowerCase.split("\\W+").filter(_.nonEmpty))
      .map((_, 1))
      // 局部聚合:等价于 Combiner,Map 端先 +1 然后再 Shuffle
      .combineByKey(
        createCombiner = (v: Int) => v,
        mergeValue = (c: Int, v: Int) => c + v,
        mergeCombiners = (c1: Int, c2: Int) => c1 + c2
      )
    val c2 = withCombiner.collectAsMap()
    println(s"[With-Combiner] keys=${c2.size} elapsed=${System.currentTimeMillis() - t2} ms")

    withCombiner.saveAsTextFile(output)
    sc.stop()
  }
}
