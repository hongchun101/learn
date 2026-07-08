// =============================================================================
// 01_basics - 基础语法
// =============================================================================
// 覆盖: 变量声明、基础类型、控制流、字符串、Nothing/Unit
// =============================================================================

package cangjie_learning.basics
import std.collection.*

// 顶层常量
public const PI: Float64 = 3.14159265358979
public const MAX_RETRY: Int64 = 3

// 类型别名
public type UserId = Int64
public type Callback<T> = (T) -> Unit

// 全局可变变量
public var globalCounter: Int64 = 0

/// 基础类型展示
public func basicsDemo(): Unit {
    println("[01] 基础语法演示")

    // ----- 变量声明 -----
    let immutable: Int64 = 42
    var mutable: Int64 = 10
    mutable = 20

    // 类型推导
    let inferred = "仓颉"
    let inferredInt = 100

    println("不可变值: ${immutable}")
    println("可变值: ${mutable}")
    println("类型推导字符串: ${inferred}")

    // ----- 基础类型 -----
    let intVal: Int64 = 1_000_000
    let floatVal: Float64 = 3.14
    let boolVal: Bool = true
    let charVal: Rune = '仓'
    let stringVal: String = "Hello, 仓颉"

    println("Int64: ${intVal}")
    println("Float64: ${floatVal}")
    println("Bool: ${boolVal}")
    println("Rune: ${charVal}")
    println("String: ${stringVal}")

    // ----- 字符串模板 -----
    let name = "世界"
    let greeting = "你好, ${name}! 数字: ${1 + 2}"
    println(greeting)

    // ----- 控制流 -----
    let sign = if (intVal > 0) {
        "正数"
    } else if (intVal < 0) {
        "负数"
    } else {
        "零"
    }
    println("sign = ${sign}")

    // ----- 循环 -----
    var sum: Int64 = 0
    var i = 1
    while (i <= 10) {
        sum += i
        i += 1
    }
    println("1+2+...+10 = ${sum}")

    // for-in 遍历区间
    var factorial: Int64 = 1
    for (n in 1..=5) {
        factorial *= n
    }
    println("5! = ${factorial}")

    // for-in 遍历数组
    let fruits = ["苹果", "香蕉", "橘子"]
    var idx: Int64 = 0
    for (fruit in fruits) {
        println("  ${idx}: ${fruit}")
        idx += 1
    }

    // ----- Unit -----
    let u: Unit = ()
    let alwaysPositive: Int64 = mustBePositive(5)
    println("Unit: ${u}")
    println("mustBePositive: ${alwaysPositive}")

    // ----- 顶层变量修改 -----
    globalCounter += 1
    println("globalCounter = ${globalCounter}")

    typeAliasesDemo()
}

/// Nothing: 抛出异常的函数
public func mustBePositive(n: Int64): Int64 {
    if (n <= 0) {
        throw IllegalArgumentException("必须为正数")
    }
    return n
}

/// 自定义异常
public class IllegalArgumentException <: Exception {
    public init(message: String) {
        super(message)
    }
}

/// 类型别名演示
public func typeAliasesDemo(): Unit {
    let userId: UserId = 10001
    let callback: Callback<String> = { value => println("回调收到: ${value}") }
    callback("Hello")
    println("UserId: ${userId}")
}