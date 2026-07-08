// =============================================================================
// 08_lambdas - Lambda 与高阶函数
// =============================================================================
// 覆盖: Lambda 表达式、闭包捕获、函数组合、柯里化、偏应用、记忆化
// =============================================================================

package cangjie_learning.lambdas

import std.collection.*

/// 可变引用单元（用于 lambda 捕获）
public class Ref<T> {
    public var value: T
    public init(value: T) { this.value = value }
}

/// Lambda 演示入口
public func lambdasDemo(): Unit {
    println("[08] Lambda 与高阶函数演示")

    // ----- 基础 Lambda -----
    let add = { a: Int64, b: Int64 => a + b }
    let square = { x: Int64 => x * x }
    println("add(3, 4) = ${add(3, 4)}")
    println("square(5) = ${square(5)}")

    // ----- Lambda 作为参数 -----
    let numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    let sum = reduce(numbers, 0, { acc, x => acc + x })
    println("sum(1..10) = ${sum}")

    // ----- 立即调用 -----
    let result = { x: Int64 => x * 2 }(21)
    println("立即调用 Lambda: ${result}")

    // ----- 闭包捕获 -----
    let multiplier = makeMultiplier(3)
    println("3 * 5 = ${multiplier(5)}")
    println("3 * 7 = ${multiplier(7)}")

    // ----- 函数组合 -----
    let doubleThenInc = compose({ x: Int64 => x + 1 }, { x: Int64 => x * 2 })
    println("(5 * 2) + 1 = ${doubleThenInc(5)}")         // 11

    let incThenDouble = pipe({ x: Int64 => x + 1 }, { x: Int64 => x * 2 })
    println("(5 + 1) * 2 = ${incThenDouble(5)}")         // 12

    // ----- 柯里化 -----
    let addCurried = curry({ a: Int64, b: Int64 => a + b })
    let add5 = addCurried(5)
    println("add5(3) = ${add5(3)}")
    println("add5(10) = ${add5(10)}")

    // ----- 偏应用 -----
    let subtract = { a: Int64, b: Int64 => a - b }
    let subFrom10 = partial(subtract, 10)
    println("subFrom10(3) = ${subFrom10(3)}")

    // ----- 记忆化（缓存） -----
    let memoFib = memoize({ n: Int64 =>
        if (n < 2) { return n }
        // 简化版，不真正递归调用已记忆化的版本
        n * 2
    })
    println("memoFib(5) = ${memoFib(5)}")
    println("memoFib(5) 再次 = ${memoFib(5)}")

    // ----- 高阶函数：filter / map / reduce / forEach -----
    let arr = [1, 2, 3, 4, 5]

    println("原数组: ${arr}")
    println("过滤偶数: ${filter(arr, { x => x % 2 == 0 })}")
    println("平方: ${map(arr, { x => x * x })}")
    println("求和: ${reduce(arr, 0, { a, b => a + b })}")
    print("逐项打印: ")
    forEach(arr, { x => print("${x} ") })
    println("")

    // ----- 链式调用 -----
    let pipeline = map(
        filter(arr, { x => x > 2 }),
        { x => x * 10 }
    )
    println("链式: ${pipeline}")
}

// =============================================================================
// 基础高阶函数
// =============================================================================

/// 映射
public func map<T, U>(items: Array<T>, transform: (T) -> U): Array<U> {
    var result = Array<U>(items.size, { _ => throw Exception("unused") })
    var i = 0
    for (item in items) {
        result[i] = transform(item)
        i += 1
    }
    return result
}

/// 过滤
public func filter<T>(items: Array<T>, predicate: (T) -> Bool): Array<T> {
    var result = ArrayList<T>()
    for (item in items) {
        if (predicate(item)) {
            result.add(item)
        }
    }
    return result.toArray()
}

/// 折叠
public func reduce<T, U>(items: Array<T>, initial: U, op: (U, T) -> U): U {
    var acc = initial
    for (item in items) {
        acc = op(acc, item)
    }
    return acc
}

/// 遍历
public func forEach<T>(items: Array<T>, action: (T) -> Unit): Unit {
    for (item in items) {
        action(item)
    }
}

// =============================================================================
// 闭包工厂
// =============================================================================

/// 创建乘法器
public func makeMultiplier(factor: Int64): (Int64) -> Int64 {
    return { x => x * factor }
}

/// 累加器（使用 Ref 包装实现可变捕获）
public func makeAccumulator(initial: Int64): () -> Int64 {
    let r = Ref<Int64>(initial)
    return { =>
        r.value += 1
        r.value
    }
}
// =============================================================================

/// 函数组合: compose(f, g)(x) = f(g(x))
public func compose<A, B, C>(f: (B) -> C, g: (A) -> B): (A) -> C {
    return { x => f(g(x)) }
}

/// 管道: pipe(f, g)(x) = g(f(x))
public func pipe<A, B, C>(f: (A) -> B, g: (B) -> C): (A) -> C {
    return { x => g(f(x)) }
}

// =============================================================================
// 柯里化与偏应用
// =============================================================================

/// 二元函数柯里化
public func curry<A, B, C>(f: (A, B) -> C): (A) -> (B) -> C {
    return { a => { b => f(a, b) } }
}

/// 偏应用：固定第一个参数
public func partial<A, B, C>(f: (A, B) -> C, a: A): (B) -> C {
    return { b => f(a, b) }
}

// =============================================================================
// 记忆化
// =============================================================================

/// 记忆化包装
public func memoize<K, V>(f: (K) -> V): (K) -> V where K <: Hashable & Equatable<K> {
    let cache = HashMap<K, V>()
    return { key =>
        match (cache.get(key)) {
            case Some(v) => v
            case None =>
                let v = f(key)
                cache[key] = v
                return v
        }
    }
}

// =============================================================================
// 标准库风格扩展
// =============================================================================

/// 在数组上添加流式操作
extend<T> Array<T> {
    public func myMap<U>(transform: (T) -> U): Array<U> {
        return map(this, transform)
    }

    public func myFilter(predicate: (T) -> Bool): Array<T> {
        return filter(this, predicate)
    }

    public func myReduce<U>(initial: U, op: (U, T) -> U): U {
        return reduce(this, initial, op)
    }
}