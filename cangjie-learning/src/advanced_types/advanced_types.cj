// =============================================================================
// 14_advanced_types - 类型别名与高级类型
// =============================================================================
// 覆盖: type 别名、where 子句、协变/逆变、Self 类型
// =============================================================================

package cangjie_learning.advanced_types

import cangjie_learning.enums.*
import std.collection.*

/// 高级类型演示入口
public func advancedTypesDemo(): Unit {
    println("[14] 高级类型演示")

    // ----- 类型别名 -----
    let name: UserName = "Alice"
    let id: UserId = 12345
    println("UserName: ${name}, UserId: ${id}")

    // ----- 复杂类型别名 -----
    let callback: StringCallback = { msg => println("回调: ${msg}") }
    callback("Hello")

    let handler: EventHandler = { event =>
        println("事件: ${event}")
    }
    handler("click")

    // ----- 缓存（泛型类）-----
    let stringCache = Cache<String, Int64>()
    stringCache.put("Alice", 100)
    let aliceScore = stringCache.get("Alice").getOrElse({ => 0 })
    println("缓存: ${aliceScore}")

    // ----- 流畅接口：返回 Self 类型 -----
    let calculator = Calculator(10)
    println("计算: ${calculator.add(5).multiply(2).subtract(3).value}")

    // ----- 类型投影 -----
    let outer = Outer("outer-data")
    let inner = OuterInner("inner-data")
    println("outer: ${outer.data}, inner: ${inner.data}")

    // ----- Phantom 类型 -----
    let rawString: PlainString = wrapPlain("public-data")
    println("明文字符串: ${rawString.value}")
    printPlain(rawString)
}

// =============================================================================
// 类型别名
// =============================================================================

/// 用户名
public type UserName = String
/// 用户 ID
public type UserId = Int64
/// 字符串回调
public type StringCallback = (String) -> Unit
/// 事件处理器
public type EventHandler = (String) -> Unit
/// 结果类型
public type Outcome<T> = MaybeOption<EitherResult<T, String>>

// =============================================================================
// 泛型缓存类
// =============================================================================



/// 泛型缓存
public class Cache<K, V> where K <: Hashable & Equatable<K> {
    private var store: HashMap<K, V>

    public init() {
        this.store = HashMap<K, V>()
    }

    public func put(key: K, value: V): Unit {
        store[key] = value
    }

    public func get(key: K): MaybeOption<V> {
        match (store.get(key)) {
            case Some(v) => MaybeOption<V>.Some(v)
            case None => MaybeOption<V>.None
        }
    }

    public func size(): Int64 {
        return store.size
    }
}

// =============================================================================
// 流畅接口（返回 Self 类型）
// =============================================================================

/// 流畅接口风格的计算器
public class Calculator {
    public var value: Int64

    public init(initial: Int64) {
        this.value = initial
    }

    public func add(n: Int64): Calculator {
        value += n
        return this
    }

    public func subtract(n: Int64): Calculator {
        value -= n
        return this
    }

    public func multiply(n: Int64): Calculator {
        value *= n
        return this
    }
}

// =============================================================================
// 嵌套类型（类型投影）
// =============================================================================

/// 外层类型
public class Outer {
    public var data: String

    public init(data: String) {
        this.data = data
    }


}

/// 内层类型（独立类演示）
public class OuterInner {
    public var data: String
    public init(data: String) {
        this.data = data
    }
}

// =============================================================================
// Phantom 类型（编译期类型安全）
// =============================================================================

/// 明文字符串（仅作类型标记）
public class PlainString {
    public var value: String

    public init(value: String) {
        this.value = value
    }
}

/// 通过 wrapping 函数构造（类型安全保证）
public func wrapPlain(value: String): PlainString {
    return PlainString(value)
}

/// 仅接受 PlainString - 类型安全保证
public func printPlain(s: PlainString): Unit {
    println("[Plain] ${s.value}")
}

// =============================================================================
// 类型约束（where 子句）
// =============================================================================

/// 要求 T 同时实现 Comparable 与 Hashable
public func bothComparable<T>(a: T, b: T): T
    where T <: Comparable<T> & Hashable {
    if (a.compare(b) == Ordering.GT) {
        return a
    }
    return b
}