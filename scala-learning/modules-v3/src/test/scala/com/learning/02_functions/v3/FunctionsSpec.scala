package com.learning.`02_functions`.v3

import org.scalatest.funsuite.AnyFunSuite

class FunctionsSpec extends AnyFunSuite {
  import Functions.*

  test("默认参数 + 命名参数") {
    assert(greet("ada") == "Hello, ada!")
    assert(greet("ada", greeting = "Hi") == "Hi, ada!")
    assert(greet("ada", punctuation = "?") == "Hello, ada?")
  }

  test("变参 sum") {
    assert(sum() == 0)
    assert(sum(1, 2, 3, 4) == 10)
  }

  test("柯里化 + 偏应用") {
    assert(curriedAdd(3)(4) == 7)
    assert(add5(10) == 15)
  }

  test("按名参数 unless 不会求值未触发的 block") {
    var sideEffect = 0
    unless(true) { sideEffect += 1 }
    assert(sideEffect == 0)
    unless(false) { sideEffect += 1 }
    assert(sideEffect == 1)
  }

  test("using Ordering") {
    assert(max(List(3, 1, 4, 1, 5, 9, 2, 6)) == 9)
    assert(max(List("a", "b", "c")) == "c")
  }

  test("end 标记的 if 不改变结果") {
    assert(describe(-1) == "negative")
    assert(describe(0) == "zero")
    assert(describe(1) == "positive")
  }

  test("@targetName 编译期命名") {
    // 运行期即 toJson
    assert(toJson("hi") == "\"hi\"")
  }

  test("控制抽象 when") {
    assert(when(true)(42) == Some(42))
    assert(when(false)(42) == None)
  }
}
