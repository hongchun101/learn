package com.learning.`06_generics`.v3

import org.scalatest.funsuite.AnyFunSuite

class GenericsSpec extends AnyFunSuite {
  import Generics.*

  test("协变 List[+A]") {
    val catList: List[Cat]  = List.Cons(Cat("tom"), List.Nil)
    val animalList: List[Animal] = catList
    assert(animalList.isInstanceOf[List[?]])
  }

  test("逆变 Printer[-A]") {
    val animalPrinter: Printer[Animal] = (a: Animal) => a.name
    val catPrinter: Printer[Cat] = animalPrinter
    assert(catPrinter.print(Cat("felix")) == "felix")
  }

  test("上界 + Comparable 找 max") {
    val xs: List[Int] = List.Cons(3, List.Cons(1, List.Cons(4, List.Cons(1, List.Cons(5, List.Cons(9, List.Cons(2, List.Cons(6, List.Nil))))))))
    assert(maxOf(xs) == 9)
  }

  test("高阶类型 Functor") {
    val xs: List[Int] = List.Cons(1, List.Cons(2, List.Cons(3, List.Nil)))
    val mapped = summon[Functor[List]].map(xs)(_ * 10)
    assert(mapped == List.Cons(10, List.Cons(20, List.Cons(30, List.Nil))))
  }
}

sealed trait Animal { def name: String }
final case class Cat(name: String)    extends Animal
final case class Dog(name: String)    extends Animal
