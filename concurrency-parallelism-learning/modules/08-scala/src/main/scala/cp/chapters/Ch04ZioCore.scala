package cp.chapters

import zio.*

/** Ch04 — ZIO core.
  *
  * `ZIO[R, E, A]` is an effect type: a description of a program that
  * needs an environment `R`, may fail with `E`, and produces `A` on
  * success. Effects are *values* — you can pass them around, compose
  * them, store them. The runtime (`Runtime.default`) interprets them.
  *
  * The crucial distinction from `Future`:
  *   - `Future` is *eager* in failure (the body starts running on creation)
  *     and lazy in success (you observe via callback).
  *   - `ZIO` is *fully lazy* — until you `unsafe.run`, nothing happens.
  *     This means you can describe a complete program before any side
  *     effects occur, which is what makes ZIO tests fast and deterministic.
  *
  * In the next chapter we layer on ZIO's concurrency primitives; here we
  * cover the effect type itself.
  */
object Ch04ZioCore:

  // ---- 1. effects are values ----
  val hello: ZIO[Any, Nothing, String] = ZIO.succeed("hello")

  // ---- 2. the two-channel failure ----
  val mayFail: ZIO[Any, String, Int] =
    ZIO.ifZIO(ZIO.succeed(true))(
      onTrue  = ZIO.succeed(1),
      onFalse = ZIO.fail("nope")
    )

  // ---- 3. composition ----
  val chained: ZIO[Any, String, Int] =
    for
      a <- ZIO.succeed(2)
      b <- ZIO.succeed(3)
      c <- mayFail
    yield a + b + c

  // ---- 4. error recovery ----
  val recovered: ZIO[Any, Nothing, Int] = chained.orElseSucceed(0)

  // ---- 5. the environment ----
  trait Logger:
    def log(s: String): UIO[Unit]

  val liveLogger: ULayer[Logger] = ZLayer.succeed(new Logger:
    override def log(s: String): UIO[Unit] = ZIO.succeed(println(s)))

  def withLogger[R](msg: String): ZIO[R with Logger, Nothing, Unit] =
    ZIO.serviceWithZIO[Logger](_.log(msg))

  // ---- 6. running effects ----
  def runExample(): Unit =
    val prog: ZIO[Logger, Nothing, Unit] = withLogger[Logger]("hi from ZIO")
    val env: UIO[Logger]                 = ZIO.service[Logger]
    val _: IO[Nothing, Unit] = prog.provideLayer(liveLogger).debug
