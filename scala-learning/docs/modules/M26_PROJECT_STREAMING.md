# M26 项目:实时流处理管道

> Phase 3 实战。fs2 入门必做。
> 时长:6-8 小时。

## 1. 项目目标

构建一个实时事件流处理管道:
1. 模拟事件源(Kafka / HTTP / 定时器)
2. 解析、过滤、转换
3. 写回数据库或文件
4. 监控指标(throughput / latency)

**技术栈**:
- Scala 3.3
- cats-effect 3.5
- fs2 3.x
- fs2-kafka(可选)
- circe 0.14

## 2. 领域

```scala
package com.example.stream.domain

import java.time.Instant

// 原始事件
case class RawEvent(
  timestamp: Long,
  source: String,
  payload: String
)

// 解析后的事件
enum EventKind:
  case Click, View, Purchase, Search

case class Event(
  timestamp: Instant,
  userId: String,
  kind: EventKind,
  value: BigDecimal
)
```

## 3. 数据源

### 内存数据源(学习用)

```scala
import cats.effect.*
import fs2.*
import scala.concurrent.duration.*

def inMemorySource: Stream[IO, RawEvent] =
  Stream.unfoldEval(0L) { i =>
    IO {
      val event = RawEvent(
        timestamp = System.currentTimeMillis(),
        source = "demo",
        payload = s"""{"user":"u$i","action":"click"}"""
      )
      (i + 1, event)
    }
  }
  .metered[IO](10.millis)  // 每 10ms 一个事件
```

### 真实 Kafka 数据源(生产)

```scala
import fs2.kafka.*
import cats.effect.*

def kafkaConsumer(config: KafkaConsumerConfig): Stream[IO, RawEvent] =
  KafkaConsumer
    .stream(consumerSettings(config))
    .subscribeTo("events")
    .records
    .map(rec => parseJson(rec.value))
```

## 4. 解析

```scala
import io.circe.*
import io.circe.parser.*

def parseEvent(raw: RawEvent): Either[ParseError, Event] =
  for
    json <- parse(raw.payload).left.map(e => ParseError(raw, e.message))
    e <- json.as[Event].left.map(e => ParseError(raw, e.message))
  yield e

case class ParseError(raw: RawEvent, reason: String)
```

## 5. 处理管道

```scala
import cats.effect.*
import fs2.*
import fs2.concurrent.*
import com.example.stream.domain.*

def pipeline(
  source: Stream[IO, RawEvent],
  metrics: Metrics
): Stream[IO, Event] =
  source
    .evalTap(_ => metrics.incReceived)
    .map(parseEvent)
    .evalTap {
      case Right(_)  => metrics.incParsed
      case Left(err) => metrics.incFailed
    }
    .collect { case Right(e) => e }   // 丢弃错误
    .filter(_.value > 0)              // 过滤
    .map(annotateWithKind)            // 增强
    .groupWithin(100, 1.second)       // 100 个或 1s 一个 chunk
    .evalMap(batch => processBatch(batch) >> metrics.batchSize(batch.size))
    .flatMap(Stream.emits)             // 展开

def processBatch(events: Chunk[Event]): IO[Unit] =
  for
    _ <- IO.sleep(50.millis)  // 模拟 DB 写
    _ <- metrics.recordLatency(50.millis)
  yield ()
```

## 6. 指标

```scala
import cats.effect.*
import fs2.concurrent.*

class Metrics:
  val received  = SignallingRef[IO, Long](0)
  val parsed    = SignallingRef[IO, Long](0)
  val failed    = SignallingRef[IO, Long](0)
  val batchSize = SignallingRef[IO, Int](0)

  def incReceived: IO[Unit] = received.update(_ + 1)
  def incParsed: IO[Unit]   = parsed.update(_ + 1)
  def incFailed: IO[Unit]   = failed.update(_ + 1)
  def batchSize(s: Int): IO[Unit] = batchSize.set(s)
  def recordLatency(d: FiniteDuration): IO[Unit] = IO.unit

  def report: IO[Unit] =
    for
      r <- received.get
      p <- parsed.get
      f <- failed.get
      _ <- IO.println(s"received=$r parsed=$p failed=$f")
    yield ()
```

## 7. 错误处理

```scala
// 死信队列:失败的 RawEvent 写到文件,人工处理
def pipelineWithDLQ(
  source: Stream[IO, RawEvent],
  metrics: Metrics,
  dlqPath: String
): Stream[IO, Event] =
  source
    .map(parseEvent)
    .divert {
      case Left(err) =>
        IO {
          // 写到 DLQ
          appendToFile(dlqPath, err.raw.payload)
          ().asRight
        }
      case Right(e) => IO(().asRight)
    }
    // ...
```

或者用 `attempt`:

```scala
source
  .evalMap(raw => parseEvent(raw).attempt)
  .flatMap {
    case Right(Right(e)) => Stream.emit(e)
    case Right(Left(_))  => Stream.empty
    case Left(_)         => Stream.empty
  }
```

## 8. 背压(Backpressure)

fs2 自动背压:下游慢,上游就不会发。

```scala
// 限制并发数
source
  .mapAsync(8) { event =>
    processOne(event)  // 最多 8 个并发
  }
```

## 9. 取消与资源

```scala
import cats.effect.*

def runWithShutdown: IO[Unit] =
  for
    metrics <- IO(Metrics())
    cancel <- pipeline(inMemorySource, metrics)
      .onFinalize(metrics.report)
      .compile
      .drain
      .start
    _ <- IO.sleep(10.seconds)
    _ <- cancel
  yield ()
```

## 10. 测试

```scala
import munit.CatsEffectSuite
import fs2.*

class PipelineSpec extends CatsEffectSuite:
  test("filters out zero-value events") {
    val events = List(
      RawEvent(0, "s", """{"user":"u1","kind":"Click","value":0}"""),
      RawEvent(0, "s", """{"user":"u1","kind":"Click","value":10}""")
    )
    val source = Stream.emits(events).covary[IO]
    val result = pipeline(source, Metrics()).compile.toList.unsafeRunSync()
    assert(result.length == 1)
    assert(result.head.value == BigDecimal(10))
  }
```

## 11. 进阶练习

1. **限流** —— 用 `Stream.fixedRate` 限制每秒最多 N 个
2. **聚合** —— 用 `groupWithin` 做 1 分钟的窗口统计
3. **去重** —— 用 `fs2-cache` 缓存最近 1 小时的事件
4. **多数据源合并** —— `Stream.merge` Kafka + HTTP + 文件
5. **死信队列** —— 写失败的 JSON 到磁盘
6. **Prometheus 指标** —— 暴露 `/metrics` 给 Prometheus 抓取
7. **Kafka 输出** —— `fs2-kafka` 写回

## 12. 检查清单

- [ ] 写出完整的管道
- [ ] 解释 fs2 的流模型
- [ ] 解释背压的工作机制
- [ ] 解释 `chunk` / `chunkMin` / `groupWithin` 的差异
- [ ] 解释 `evalMap` 与 `map` 的差异
- [ ] 解释为什么用 `Resource` 管理流
- [ ] 解释 fs2 与 Akka Streams 的差异
