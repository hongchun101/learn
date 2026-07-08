package com.learning.`03_classes_traits`.v2

/**
 * Scala 2 类与特质系统：
 *   - 主构造器参数加 `val`/`var` 即为公开字段
 *   - 辅助构造器必须以 `this(...)` 开头,且不能直接调用父类构造器
 *   - 特质可以混合具体方法与抽象方法
 *   - 特质线性化决定 super 调用顺序
 *   - 自身类型 `self: T =>` 约束
 *   - 抽象类型成员：type T
 *   - 包对象 `package object` 持有跨包的共享别名
 */
object ClassSystem {

  // 抽象类型成员示例：容器元素类型由子类决定
  trait Container {
    type T
    def add(elem: T): Unit
    def get(idx: Int): T
  }

  // 具体实现：固定 T = String
  class StringContainer extends Container {
    type T = String
    private var data = Vector.empty[String]
    def add(elem: String): Unit = data = data :+ elem
    def get(idx: Int): String   = data(idx)
  }

  // 自身类型 —— 强制混入其他特质
  trait Persistable { self: Container => // self-type 要求混入 Container
    def save(): String = s"persisting ${get(0)}"
  }

  // 特质线性化：class A extends B with C with D → 解析顺序 D C B A
  trait Logged {
    def log(msg: String): Unit = println(s"[log] $msg")
  }
  trait TimestampLogged extends Logged {
    abstract override def log(msg: String): Unit =
      super.log(s"${System.currentTimeMillis()} $msg")
  }
  trait Audited extends Logged {
    abstract override def log(msg: String): Unit =
      super.log(s"[audit] $msg")
  }
  class Service extends TimestampLogged with Audited {
    def run(): Unit = log("started")
  }
}

