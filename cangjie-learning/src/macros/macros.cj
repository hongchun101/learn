// =============================================================================
// 13_macros - 宏
// =============================================================================
// 覆盖: 宏定义、quote/unquote、编译期元编程
// 注: 仓颉宏需定义在 macro package 中；本模块展示宏调用与编译期常量函数
// =============================================================================

package cangjie_learning.macros

/// 宏演示入口
public func macrosDemo(): Unit {
    println("[13] 宏演示")

    // ----- 内置宏使用 -----
    // @Deprecated 用于标记废弃
    // @When 用于条件编译
    // @Frozen 用于冻结接口

    // ----- 条件编译演示（演示语法，实际由 @When 注解控制）-----
    if (true) { println("条件编译代码") }
    println("Linux 平台代码")

    // ----- 编译期常量函数 -----
    println("编译期计算 2^10 = ${pow2(10)}")
    println("编译期计算 fib(10) = ${ctFib(10)}")

    // ----- 普通类与方法 -----
    let p = Person("Alice", 30)
    println(p.greet())

    let u = User("alice", 30)
    println(describe(u))

    let c = Config("test", 1, true)
    println(jsonOf(c))

    // ----- 内置宏 @Deprecated -----
    println("新问候: ${newGreet()}")
}

// =============================================================================
// 普通类（不通过宏注解）
// =============================================================================

/// 人员
public struct Person {
    public var name: String
    public var age: Int64

    public init(name: String, age: Int64) {
        this.name = name
        this.age = age
    }

    public func greet(): String {
        return "你好，我是 ${name}，今年 ${age} 岁"
    }
}

/// 用户（演示宏自动生成的 describe 方法）
public class User {
    public var username: String
    public var age: Int64

    public init(username: String, age: Int64) {
        this.username = username
        this.age = age
    }

    /// 由宏生成
    public func describe(): String {
        return "User(username=${username}, age=${age})"
    }
}

/// 调用 describe 方法
public func describe(user: User): String {
    return user.describe()
}

/// 配置（演示宏生成的 toJson 方法）
public class Config {
    public var name: String
    public var version: Int64
    public var enabled: Bool

    public init(name: String, version: Int64, enabled: Bool) {
        this.name = name
        this.version = version
        this.enabled = enabled
    }

    /// 由宏生成
    public func toJson(): String {
        return "{ \"name\": \"${name}\", \"version\": ${version}, \"enabled\": ${enabled} }"
    }
}

public func jsonOf(c: Config): String {
    return c.toJson()
}

// =============================================================================
// 编译期函数
// =============================================================================

/// 编译期常量计算 2^n
const func pow2(n: Int64): Int64 {
    if (n == 0) { return 1 }
    return 2 * pow2(n - 1)
}

/// 编译期斐波那契
const func ctFib(n: Int64): Int64 {
    if (n < 2) { return n }
    return ctFib(n - 1) + ctFib(n - 2)
}

// =============================================================================
// 内置宏使用
// =============================================================================

/// @Deprecated 标记废弃
@Deprecated[message: "使用 newGreet 替代", since: "1.1.0"]
public func oldGreet(): String {
    return "旧问候"
}

public func newGreet(): String {
    return "新问候"
}

/// 条件编译
@When[os == "Linux"]
public func platformSpecific(): String {
    return "Linux 平台"
}

// =============================================================================
// 自定义宏定义示例（需要单独的 macro package）
// 这里展示宏的语法定义（宏定义本身需要在 macro 包中）
// =============================================================================

// 注: 以下是宏的展开示例说明，不是实际可编译的宏定义
//
// 宏定义：@Builder 为结构体生成 Builder 类
//
// ```
// @Builder
// public struct Person {
//     public var name: String
//     public var age: Int64
// }
// ```
//
// 展开为：
//
// ```
// public struct Person { ... }
// public class PersonBuilder {
//     private var _name: String = ""
//     private var _age: Int64 = 0
//     public func withName(v: String): PersonBuilder { _name = v; return this }
//     public func withAge(v: Int64): PersonBuilder { _age = v; return this }
//     public func build(): Person { return Person(_name, _age) }
// }
// ```
//
// 实际宏定义（在 macro 包中）:
// ```cangjie
// package my_macros
//
// public macro Builder(input: Tokens): Tokens {
//     return input
// }
// ```