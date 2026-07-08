package com.learning.`03_classes_traits`

/**
 * Scala 2 包对象 —— 旧机制,提供包级共享类型/值/隐式。
 *
 * Scala 3 完全移除此机制,改用顶级定义 + `export`。
 */
package object v2 {
  type StringMap = Map[String, String]
  val Empty: StringMap = Map.empty
  implicit val defaultGreeting: String = "Hello"
}
