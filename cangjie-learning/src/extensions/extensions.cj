// =============================================================================
// 09_extensions - 扩展函数
// =============================================================================
// 覆盖: extend 关键字、为内置类型和自定义类型扩展方法、为枚举扩展
// 注: 仓颉扩展可以给现有类型添加新方法，包括标准库类型和用户类型。
// =============================================================================

package cangjie_learning.extensions

import std.collection.*
import std.math.*
import cangjie_learning.enums.*

/// 扩展演示入口
public func extensionsDemo(): Unit {
    println("[09] 扩展函数演示")

    // ----- 字符串扩展 -----
    let greeting = "Hello, World"
    println("原字符串: ${greeting}")
    println("字符数: ${greeting.chars()}")
    println("反转: ${greeting.reverse()}")
    println("重复 3 次: ${greeting.repeat(3)}")
    println("首字母大写: ${"hello world".capitalize()}")
    println("是否回文: ${"abcba".isPalindrome()}")
    println("单词数: ${"the quick brown fox".wordCount()}")
    println("substring(0,5): ${greeting.substring(0, 5)}")
    println("substring(6): ${greeting.substring(6)}")

    // ----- 数值扩展 -----
    println("5 的阶乘: ${5.factorial()}")
    println("10 是否偶数: ${10.isEven()}")
    println("13 是否质数: ${13.isPrime()}")
    println("16 的平方根: ${16.sqrt()}")
    println("|-7| = ${(-7).abs()}")
    println("100 限制在 [0,10]: ${100.clamped(min: 0, max: 10)}")
    println("|3.14| = ${3.14.abs()}")
    println("2^10 = ${2.0.pow(10.0)}")
    println("3.14 sqrt = ${3.14.sqrt()}")
    println("3.14 clamped [0,2]: ${3.14.clamped(min: 0.0, max: 2.0)}")

    // ----- 数组扩展 -----
    let arr = [3, 1, 4, 1, 5, 9, 2, 6]
    println("原数组: ${arr.toString()}")
    println("排序: ${arr.sorted().toString()}")

    // ----- 列表扩展 -----
    let list = ArrayList<Int64>()
    list.add(10)
    list.add(20)
    list.add(30)
    let joined = list.join("-")
    println("列表转字符串: " + joined)

    let second = list.mySecond()
    match (second) {
        case MaybeOption<Int64>.Some(v) => println("列表第二个元素: ${v}")
        case MaybeOption<Int64>.None => println("列表第二个元素: <无>")
    }
    let last = list.myLast()
    match (last) {
        case MaybeOption<Int64>.Some(v) => println("列表最后一个: ${v}")
        case MaybeOption<Int64>.None => println("列表最后一个: <无>")
    }

    // ----- 自定义类型扩展 -----
    let p = Point(3.0, 4.0)
    println("距离原点: ${p.distanceToOrigin()}")
    println("旋转 90 度: ${p.rotated90().toString()}")
    let pNeg = p.negated()
    println("对称点: (${pNeg.x}, ${pNeg.y})")

    // ----- 枚举扩展 -----
    let direction = Direction.East
    println("${direction.name()} 顺时针下一个: ${direction.clockwise().name()}")
    println("${direction.name()} 逆时针下一个: ${direction.counterClockwise().name()}")
    println("${direction.name()} 对向: ${direction.opposite().name()}")

    // ----- Option 扩展 -----
    let some: MaybeOption<Int64> = MaybeOption<Int64>.Some(42)
    let none: MaybeOption<Int64> = MaybeOption<Int64>.None
    println("Some(42) * 2 = ${some.mapOr(0, { x => x * 2 })}")
    println("None * 2 = ${none.mapOr(0, { x => x * 2 })}")
}

// =============================================================================
// 为 String 扩展
// =============================================================================

extend String {
    /// 字符数（按字节计）
    public func chars(): Int64 {
        return this.size
    }

    /// 反转（按 Unicode 码点）
    public func reverse(): String {
        let runes = this.toRuneArray()
        var result = ""
        var i = runes.size - 1
        while (i >= 0) {
            result += runes[i].toString()
            i -= 1
        }
        return result
    }

    /// 重复
    public func repeat(times: Int64): String {
        var result = ""
        var i: Int64 = 0
        while (i < times) {
            result += this
            i += 1
        }
        return result
    }

    /// 首字母大写（ASCII）
    public func capitalize(): String {
        if (this.isEmpty()) {
            return this
        }
        let runes = this.toRuneArray()
        let firstUpper = runes[0].toString().toAsciiUpper()
        if (runes.size == 1) {
            return firstUpper
        }
        return firstUpper + this.substring(1)
    }

    /// 是否回文
    public func isPalindrome(): Bool {
        return this == this.reverse()
    }

    /// 单词数（按空格分隔）
    public func wordCount(): Int64 {
        if (this.isEmpty()) {
            return 0
        }
        var count: Int64 = 1
        let space: Rune = r' '
        for (c in this.toRuneArray()) {
            if (c == space) {
                count += 1
            }
        }
        return count
    }

    /// 切片（从 start 到末尾）
    public func substring(start: Int64): String {
        return this[start..this.size]
    }

    /// 切片（从 start 到 end，不含 end）
    public func substring(start: Int64, end: Int64): String {
        return this[start..end]
    }
}

// =============================================================================
// 为数值类型扩展
// =============================================================================

extend Int64 {
    /// 阶乘
    public func factorial(): Int64 {
        if (this <= 1) { return 1 }
        var result: Int64 = 1
        var i: Int64 = 2
        while (i <= this) {
            result *= i
            i += 1
        }
        return result
    }

    /// 是否偶数
    public func isEven(): Bool {
        return this % 2 == 0
    }

    /// 是否质数
    public func isPrime(): Bool {
        if (this < 2) { return false }
        if (this == 2) { return true }
        if (this % 2 == 0) { return false }
        var i: Int64 = 3
        while (i * i <= this) {
            if (this % i == 0) { return false }
            i += 2
        }
        return true
    }

    /// 整数平方根（向下取整）
    public func sqrt(): Int64 {
        if (this < 0) { throw Exception("负数无平方根") }
        if (this == 0) { return 0 }
        var x = this
        var y = (x + 1) / 2
        while (y < x) {
            x = y
            y = (x + this / x) / 2
        }
        return x
    }

    /// 限制在 [min, max] 范围内
    public func clamped(min!: Int64, max!: Int64): Int64 {
        if (this < min) { return min }
        if (this > max) { return max }
        return this
    }

    /// 取绝对值
    public func abs(): Int64 {
        if (this < 0) { return -this }
        return this
    }
}

extend Float64 {
    /// 平方根
    public func sqrt(): Float64 {
        return std_math_sqrt(this)
    }

    /// 绝对值
    public func abs(): Float64 {
        return std_math_abs(this)
    }

    /// 幂
    public func pow(exp: Float64): Float64 {
        return std_math_pow(this, exp)
    }

    /// 限制在 [min, max] 范围内
    public func clamped(min!: Float64, max!: Float64): Float64 {
        if (this < min) { return min }
        if (this > max) { return max }
        return this
    }
}

// =============================================================================
// 数组扩展（要求元素可比较）
// =============================================================================

extend<T> Array<T> where T <: Comparable<T> {
    /// 升序排序（冒泡排序示例）
    public func sorted(): Array<T> {
        var arr = this
        let n = arr.size
        var i: Int64 = 0
        while (i < n - 1) {
            var j: Int64 = 0
            while (j < n - 1 - i) {
                if (arr[j].compare(arr[j + 1]) == Ordering.GT) {
                    let tmp = arr[j]
                    arr[j] = arr[j + 1]
                    arr[j + 1] = tmp
                }
                j += 1
            }
            i += 1
        }
        return arr
    }

    /// 最大值（数组为空时返回默认值）
    public func maxOrDefault(defaultValue: T): T {
        if (this.isEmpty()) { return defaultValue }
        var max = this[0]
        for (i in 1..this.size) {
            if (this[i].compare(max) == Ordering.GT) {
                max = this[i]
            }
        }
        return max
    }

    /// 最小值（数组为空时返回默认值）
    public func minOrDefault(defaultValue: T): T {
        if (this.isEmpty()) { return defaultValue }
        var min = this[0]
        for (i in 1..this.size) {
            if (this[i].compare(min) == Ordering.LT) {
                min = this[i]
            }
        }
        return min
    }
}

// =============================================================================
// 自定义类型扩展
// =============================================================================

public struct Point {
    public var x: Float64
    public var y: Float64
    public init(x: Float64, y: Float64) {
        this.x = x
        this.y = y
    }
}

extend Point {
    /// 到原点距离
    public func distanceToOrigin(): Float64 {
        return std_math_sqrt(x * x + y * y)
    }

    /// 旋转 90 度（逆时针）
    public func rotated90(): Point {
        return Point(-y, x)
    }

    /// 对称点
    public func negated(): Point {
        return Point(-x, -y)
    }
}

extend Point <: ToString {
    public func toString(): String {
        return "Point(${x}, ${y})"
    }
}

// =============================================================================
// 枚举扩展
// =============================================================================

public enum Direction {
    | North
    | East
    | South
    | West
}

extend Direction {
    public func clockwise(): Direction {
        match (this) {
            case Direction.North => Direction.East
            case Direction.East => Direction.South
            case Direction.South => Direction.West
            case Direction.West => Direction.North
        }
    }

    public func counterClockwise(): Direction {
        match (this) {
            case Direction.North => Direction.West
            case Direction.West => Direction.South
            case Direction.South => Direction.East
            case Direction.East => Direction.North
        }
    }

    public func opposite(): Direction {
        match (this) {
            case Direction.North => Direction.South
            case Direction.South => Direction.North
            case Direction.East => Direction.West
            case Direction.West => Direction.East
        }
    }

    public func name(): String {
        match (this) {
            case Direction.North => "North"
            case Direction.East => "East"
            case Direction.South => "South"
            case Direction.West => "West"
        }
    }
}

// =============================================================================
// ArrayList 扩展
// =============================================================================

extend<T> ArrayList<T> where T <: ToString {
    /// 拼接为字符串
    public func join(separator: String): String {
        if (this.isEmpty()) { return "" }
        var result = this[0].toString()
        for (i in 1..this.size) {
            result += separator + this[i].toString()
        }
        return result
    }

    /// 取第二个元素（不足时返回 None）
    public func mySecond(): MaybeOption<T> {
        if (this.size < 2) { return MaybeOption<T>.None }
        return MaybeOption<T>.Some(this[1])
    }

    /// 取最后一个元素（空时返回 None）
    public func myLast(): MaybeOption<T> {
        if (this.isEmpty()) { return MaybeOption<T>.None }
        return MaybeOption<T>.Some(this[this.size - 1])
    }
}

// =============================================================================
// MaybeOption 扩展
// =============================================================================

extend<T> MaybeOption<T> {
    /// 当 Some 时应用 transform，否则返回 defaultValue
    public func mapOr<U>(defaultValue: U, transform: (T) -> U): U {
        match (this) {
            case MaybeOption<T>.Some(v) => transform(v)
            case MaybeOption<T>.None => defaultValue
        }
    }
}

// =============================================================================
// 内部：std.math 函数别名（避免在表达式中重复限定）
// =============================================================================

func std_math_sqrt(x: Float64): Float64 {
    return sqrt(x)
}

func std_math_abs(x: Float64): Float64 {
    return abs(x)
}

func std_math_pow(x: Float64, y: Float64): Float64 {
    return pow(x, y)
}
