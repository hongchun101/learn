package cp.chapters

import akka.actor.typed.{ActorRef, ActorSystem, Behavior}
import akka.actor.typed.scaladsl.{AbstractBehavior, ActorContext, Behaviors, Routers}

/** Ch03 — Akka Typed.
  *
  * The *typed* Akka API (2.6+) replaces the untyped `Actor` of the past.
  * Every message is part of a sealed protocol; the reply type is encoded
  * in `ActorRef[Response]`. The compiler then prevents the classic "I sent
  * a `Hello` and the actor replied with `World`" bug.
  *
  * Mental model:
  *   - An `ActorSystem[T]` is the root. Spawn children with `Behaviors.same`.
  *   - `Behaviors.receiveMessage { msg => ... }` is the simplest shape.
  *   - `Behaviors.setup { ctx => ... }` gives you the `ActorContext`, used
  *     for spawning children, watching, logging, timers.
  *   - `Behaviors.supervise(...)` attaches a `SupervisorStrategy` so a
  *     crash in a child is handled by its parent — *let it crash*.
  */
object Ch03AkkaTyped:

  // ---- 1. the message protocol ----
  enum Counter:
    case Increment(by: Int, replyTo: ActorRef[Int])
    case Get(replyTo: ActorRef[Int])
    case Reset

  // ---- 2. the behavior ----
  def counterBehavior: Behavior[Counter] =
    Behaviors.receive { (ctx, msg) =>
      msg match
        case Counter.Increment(by, replyTo) =>
          // in real life this would be a counter; for the demo we just echo
          replyTo ! by
          Behaviors.same
        case Counter.Get(replyTo) =>
          replyTo ! 0
          Behaviors.same
        case Counter.Reset =>
          Behaviors.same
    }

  // ---- 3. the supervision tree ----
  // Behaviors.supervise wraps a behavior and decides what to do on failure.
  // Common strategies: .restart, .resume, .stop, .backoff.
  def supervisedCounter: Behavior[Counter] =
    Behaviors.supervise(counterBehavior)
      .onFailure[RuntimeException](akka.actor.typed.SupervisorStrategy.restart)

  // ---- 4. group router: same behavior, pool of actors ----
  def pooledCounter(poolSize: Int): Behavior[Counter] =
    val pool = Routers.pool(poolSize) { counterBehavior }
    Behaviors.setup[Counter] { ctx =>
      val router: ActorRef[Counter] = ctx.spawn(pool, "counter-pool")
      Behaviors.receiveMessage { msg =>
        router ! msg
        Behaviors.same
      }
    }

  // ---- 5. the typical "ask" pattern (request/response) ----
  def demoAsk(): Unit =
    import akka.actor.typed.scaladsl.AskPattern.*
    import scala.concurrent.duration.*
    import scala.concurrent.{Await, Future}
    import scala.util.{Failure, Success}
    import scala.concurrent.ExecutionContext.Implicits.global

    val system: ActorSystem[Counter] = ActorSystem(supervisedCounter, "demo")
    try
      import Counter.*
      val f: Future[Int] = system.ask(ref => Increment(5, ref))
      val result = Await.result(f, 3.seconds)
      assert(result == 5)
    finally
      system.terminate()
      Await.ready(system.whenTerminated, 5.seconds)
