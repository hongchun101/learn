package cp.chapters

import zio.*
import zio.test.*
import zio.test.Assertion.*

/** ZIO versions of the seven cross-language scenarios. */
object Ch06ZioPatternsTest extends ZIOSpecDefault:

  def spec = suite("Ch06ZioPatterns — cross-language tasks in ZIO")(

    test("fan-out preserves order"):
      for
        out <- Ch06ZioPatterns.fanOut((0 until 100).toList, 16, (i: Int) =>
               ZIO.succeed(i * 2))
      yield assert(out)(equalTo((0 until 100).toList.map(_ * 2)))
  ,

    test("pipeline applies every stage in order"):
      val stages: List[Int => UIO[Int]] = List(
        (x: Int) => ZIO.succeed(x + 1),
        (x: Int) => ZIO.succeed(x * 2),
        (x: Int) => ZIO.succeed(x - 3)
      )
      for
        out <- Ch06ZioPatterns.pipeline(List(0, 1, 2, 3), stages)
      yield assert(out)(equalTo(List(-1, 1, 3, 5)))
  ,

    test("barrier blocks until N parties have arrived"):
      for
        _    <- Ch06ZioPatterns.barrier(4)
      yield assertCompletes
  ,

    test("parallel reduce equals sequential reduce for an associative op"):
      val inputs = (1 to 1000).toList
      val sum    = (a: Int, b: Int) => a + b
      val seq    = inputs.reduce(sum)
      for
        got <- Ch06ZioPatterns.parallelReduce(inputs, sum, 8)
      yield assert(got)(equalTo(seq))
  ,

    test("MPMC queue round-trips"):
      for
        q    <- Ch06ZioPatterns.mpmcQueue[Int](4)
        _    <- ZIO.foreachDiscard((0 until 50).toList)(i => q.offer(i))
        got  <- ZIO.foreach((0 until 50).toList)(_ => q.take)
      yield assert(got)(equalTo((0 until 50).toList))
  )
