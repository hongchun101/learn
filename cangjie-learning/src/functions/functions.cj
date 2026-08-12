// =============================================================================
// 02_functions - 函数特性
// =============================================================================
// 覆盖: 默认参数、命名参数、可变参数、嵌套函数、函数类型、闭包
// 注: 仓颉参数默认值通过 `paramName!: Type = value` 语法标记
// =============================================================================

package cangjie_learning.functions

/// 演示函数特性
public func functionsDemo(): Unit {
    println("[02] 函数演示")

    // ----- 默认参数（使用命名参数）-----
    greet("仓颉")
    greet("仓颉", greeting: "你好")
    greet("仓颉", punctuation: "!")
    greet("世界", greeting: "Hi", punctuation: "...")

    // ----- 数组作为可变参数的替代 -----
    let total = sumAll([1, 2, 3, 4, 5])
    println("sumAll(1..5) = ${total}")

    let total2 = sumAll([10, 20, 30])
    println("sumAll(10,20,30) = ${total2}")

    // ----- 函数作为值 -----
    let op: (Int64, Int64) -> Int64 = add
    println("op(3,4) = ${op(3, 4)}")

    // ----- 嵌套函数 -----
    println("嵌套阶乘: ${outerFactorial(5)}")

    // ----- 闭包 -----
    let counter = makeCounter()
    println("counter() = ${counter()}")
    println("counter() = ${counter()}")
    println("counter() = ${counter()}")

    // ----- 递归函数 -----
    println("斐波那契 fib(10) = ${fib(10)}")

    // ----- 函数引用 -----
    let addRef = add
    let result = apply(addRef, 5, 6)
    println("apply(addRef, 5, 6) = ${result}")
}

/// 带默认参数的函数 - 使用 `!` 标记命名参数与默认参数
public func greet(name: String, greeting!: String = "Hello", punctuation!: String = "!"): Unit {
    println("${greeting}, ${name}${punctuation}")
}

/// 计算数组元素之和（替代变长参数）
public func sumAll(values: Array<Int64>): Int64 {
    var total: Int64 = 0
    for (v in values) {
        total += v
    }
    return total
}

/// 二元运算函数
public func add(a: Int64, b: Int64): Int64 {
    return a + b
}

/// 嵌套函数定义
public func outerFactorial(n: Int64): Int64 {
    func helper(k: Int64, acc: Int64): Int64 {
        if (k <= 1) {
            return acc
        }
        return helper(k - 1, acc * k)
    }
    return helper(n, 1)
}

/// 闭包：使用可变引用包装实现捕获
public func makeCounter(): () -> Int64 {
    let cell = Cell(0)
    return { =>
        cell.value += 1
        cell.value
    }
}

/// 可变引用单元（用于 lambda 捕获）
public class Cell<T> {
    public var value: T
    public init(value: T) { this.value = value }
}
/// 斐波那契（递归版）
public func fib(n: Int64): Int64 {
    if (n < 2) {
        return n
    }
    return fib(n - 1) + fib(n - 2)
}

/// 高阶函数：接受函数参数
public func apply(f: (Int64, Int64) -> Int64, x: Int64, y: Int64): Int64 {
    return f(x, y)
}