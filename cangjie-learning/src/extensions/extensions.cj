// =============================================================================
// 09_extensions - 扩展函数
// =============================================================================
// 覆盖: extend 关键字、为内置类型和自定义类型扩展方法、为枚举扩展
// =============================================================================

package cangjie_learning.extensions

import std.collection.*
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
    println("统计单词: ${"the quick brown fox".wordCount()}")

    // ----- 数值扩展 -----
    println("5 的阶乘: ${5.factorial()}")
    println("10 是否偶数: ${10.isEven()}")
    println("13 是否质数: ${13.isPrime()}")
    println("16 的平方根: ${16.sqrt()}")

    // ----- 数组扩展 -----
    let arr = [3, 1, 4, 1, 5, 9, 2, 6]
    println("原数组: ${arr}")
    println("排序: ${arr.sorted()}")
    println("去重: ${arr}")
    println("分块(每3个): ${arr}")
    // ----- 列表扩展 -----
    let list = ArrayList<Int64>()
    list.add(10)
    list.add(20)
    list.add(30)
    println("列表: ${list}")
    let joined = list.join("-"); println("列表转字符串: " + joined)
    println("列表第二个元素: ${list.mySecond().getOrElse({ => -1 })}")
    println("列表最后一个: ${list.myLast().getOrElse({ => -1 })}")

    // ----- 自定义类型扩展 -----
    let p = Point(3.0, 4.0)
    println("列表第二个元素: ${list.mySecond()}")
    println("列表最后一个: ${list.myLast()}")
    let pNeg = p.negated()
    println("对称点: (${pNeg.x}, ${pNeg.y})")

    // ----- 枚举扩展 -----
    let direction = Direction.East
    println("${direction} 顺时针下一个: ${direction.clockwise()}")
    println("${direction} 逆时针下一个: ${direction.counterClockwise()}")

    // ----- Option 扩展（使用 enums.Option）-----
    let some: MaybeOption<Int64> = MaybeOption<Int64>.Some(42)
    let none: MaybeOption<Int64> = MaybeOption<Int64>.None
    println("Some(42) * 2 = ${some.mapOr(0, { x => x * 2 })}")
    println("None * 2 = ${none.mapOr(0, { x => x * 2 })}")
}

// =============================================================================
// 为 String 扩展
// =============================================================================

extend String {
    /// 字符数
    public func chars(): Int64 {
        return this.size
    }

    /// 反转
    public func reverse(): String {
        var result = ""
        let chars = this.toRuneArray()
        var i = chars.size - 1
        while (i >= 0) {
            result += chars[i].toString()
            i -= 1
        }
        return result
    }

    /// 重复
    public func repeat(times: Int64): String {
        var result = ""
        var i = 0
        while (i < times) {
            result += this
            i += 1
        }
        return result
    }

    /// 首字母大写
    public func capitalize(): String {
        if (this.isEmpty()) {
            return this
        }
        let first = this[0].toString().toUpperAscii()
        return first + this.substring(1)
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
        for (c in this) {
            if (c == r' ') {
                count += 1
            }
        }
        return count
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
}

extend Float64 {
    /// 平方根
    public func sqrt(): Float64 {
        if (this < 0.0) { throw Exception("负数无平方根") }
        // 牛顿迭代法
        if (this == 0.0) { return 0.0 }
        var x = this
        var y = (x + 1.0) / 2.0
        var iter = 0
        while (iter < 50) {
            let newY = (y + x / y) / 2.0
            if ((newY - y).abs() < 0.0000001) { break }
            y = newY
            iter += 1
        }
        return y
    }
}

// =============================================================================
// 数组扩展
// =============================================================================

extend<T> Array<T> where T <: Comparable<T> {
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

// 删除 Array<T> where T <: Additive<T> 扩展（Cangjie 此版本不支持 Additive 接口）

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
        return sqrt(x * x + y * y)
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
}

// =============================================================================
// ArrayList 扩展
// =============================================================================

extend<T> ArrayList<T> {
    public func join(separator: String): String {
        if (this.isEmpty()) { return "" }
        var result = this[0].toString()
        for (i in 1..this.size) {
            result += separator + this[i].toString()
        }
        return result
    }

    public func mySecond(): MaybeOption<T> {
        if (this.size < 2) { return MaybeOption<T>.None }
        return MaybeOption<T>.Some(this[1])
    }

    public func myLast(): MaybeOption<T> {
        if (this.isEmpty()) { return MaybeOption<T>.None }
        return MaybeOption<T>.Some(this[this.size - 1])
    }
}

// =============================================================================
// enums.Option 扩展（在 extensions 模块中添加便利方法）
// =============================================================================

extend<T> MaybeOption<T> {
    public func mapOr<U>(defaultValue: U, transform: (T) -> U): U {
        match (this) {
            case MaybeOption<T>.Some(v) => transform(v)
            case MaybeOption<T>.None => defaultValue
        }
    }
}

// =============================================================================
// Direction 扩展 - ToString
// =============================================================================

extend Direction <: ToString {
    public func toString(): String {
        match (this) {
            case Direction.North => "North"
            case Direction.East => "East"
            case Direction.South => "South"
            case Direction.West => "West"
        }
    }
}

// =============================================================================
// MaybeOption 扩展 - ToString
// =============================================================================

extend<T> MaybeOption<T> where T <: ToString {
    public func toString(): String {
        match (this) {
            case MaybeOption<T>.Some(v) => "Some(${v})"
            case MaybeOption<T>.None => "None"
        }
    }
}


