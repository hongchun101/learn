package com.learning.`06_generics`.v2

import org.scalatest.funsuite.AnyFunSuite

class GenericsSpec extends AnyFunSuite {
  import Generics._

  test("协变 List[+A]") {
    val catList: List[Cat]  = Cons(Cat("tom"), Nil)
    val animalList: List[Animal] = catList
    assert(animalList.isInstanceOf[List[_]])
  }

  test("逆变 Printer[-A]") {
    val animalPrinter: Printer[Animal] = (a: Animal) => a.name
    val catPrinter: Printer[Cat] = animalPrinter // 协变反过来
    assert(catPrinter.print(Cat("felix")) == "felix")
  }

  test("上界 + Comparable 找 max") {
    val xs: List[Int] = Cons(3, Cons(1, Cons(4, Cons(1, Cons(5, Cons(9, Cons(2, Cons(6, Nil))))))))
    assert(maxOf(xs) == 9)
  }

  test("高阶类型 Functor") {
    val xs: List[Int] = Cons(1, Cons(2, Cons(3, Nil)))
    val mapped = listFunctor.map(xs)(_ * 10)
    assert(mapped == Cons(10, Cons(20, Cons(30, Nil))))
  }

  test("case classes 辅助") {
    assert(Cat("tom").name == "tom")
  }
}

// 测试用的领域模型
sealed trait Animal { def name: String }
final case class Cat(name: String)    extends Animal
final case class Dog(name: String)    extends Animal
