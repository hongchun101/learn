// =============================================================================
// 10_operator_overloading - 操作符重载
// =============================================================================
// 覆盖: 算术、比较、索引运算符重载
// =============================================================================

package cangjie_learning.operator_overloading

/// 操作符重载演示入口
public func operatorsDemo(): Unit {
    println("[10] 操作符重载演示")

    // ----- 向量运算 -----
    let v1 = Vec2(3.0, 4.0)
    let v2 = Vec2(1.0, 2.0)
    let v1Str = v1.toString()
    let v2Str = v2.toString()
    let vSum = (v1 + v2).toString()
    let vDiff = (v1 - v2).toString()
    let vScaled = (v1 * 2.0).toString()
    let vNeg = (-v1).toString()

    println("v1 = ${v1Str}")
    println("v2 = ${v2Str}")
    println("v1 + v2 = ${vSum}")
    println("v1 - v2 = ${vDiff}")
    println("v1 * 2.0 = ${vScaled}")
    println("-v1 = ${vNeg}")

    // 比较运算
    println("v1 == v2: ${v1 == v2}")
    println("v1 != v2: ${v1 != v2}")

    // 索引
    println("v1[0] = ${v1[0]}")
    println("v1[1] = ${v1[1]}")

    // ----- 复数 -----
    let c1 = Complex(1.0, 2.0)
    let c2 = Complex(3.0, 4.0)
    println("c1 = ${c1.toString()}")
    println("c2 = ${c2.toString()}")
    println("c1 + c2 = ${(c1 + c2).toString()}")
    println("c1 * c2 = ${(c1 * c2).toString()}")
    println("|c1| = ${c1.magnitude()}")

    // ----- 区间 -----
    let r1 = Range(start: 0, end: 10)
    let r2 = Range(start: 5, end: 15)
    println("r1 = ${r1.toString()}")
    println("r2 = ${r2.toString()}")
    println("5 in r1: ${r1.contains(5)}")
    println("15 in r1: ${r1.contains(15)}")

    // ----- 金额 -----
    let price1 = Money(99, "USD")
    let price2 = Money(50, "USD")
    println("price1 = ${price1.toString()}")
    println("price2 = ${price2.toString()}")
    let sum = price1 + price2
    println("price1 + price2 = ${sum.toString()}")
    println("price1 > price2: ${price1 > price2}")
}

// =============================================================================
// 二维向量 + 操作符重载
// =============================================================================

public struct Vec2 {
    public var x: Float64
    public var y: Float64

    public init(x: Float64, y: Float64) {
        this.x = x
        this.y = y
    }

    public operator func -(): Vec2 {
        return Vec2(-x, -y)
    }

    public operator func +(other: Vec2): Vec2 {
        return Vec2(x + other.x, y + other.y)
    }

    public operator func -(other: Vec2): Vec2 {
        return Vec2(x - other.x, y - other.y)
    }

    public operator func *(scalar: Float64): Vec2 {
        return Vec2(x * scalar, y * scalar)
    }

    public operator func /(scalar: Float64): Vec2 {
        return Vec2(x / scalar, y / scalar)
    }

    public operator func ==(other: Vec2): Bool {
        return x == other.x && y == other.y
    }

    public operator func !=(other: Vec2): Bool {
        return !(this == other)
    }

    public operator func [](index: Int64): Float64 {
        match (index) {
            case 0 => return x
            case 1 => return y
            case _ => throw Exception("Vec2 索引越界: ${index}")
        }
    }
}

extend Vec2 <: ToString {
    public func toString(): String {
        return "Vec2(${x}, ${y})"
    }
}

// =============================================================================
// 复数
// =============================================================================

public struct Complex {
    public var real: Float64
    public var imag: Float64

    public init(real: Float64, imag: Float64) {
        this.real = real
        this.imag = imag
    }

    public operator func +(other: Complex): Complex {
        return Complex(real + other.real, imag + other.imag)
    }

    public operator func -(other: Complex): Complex {
        return Complex(real - other.real, imag - other.imag)
    }

    public operator func *(other: Complex): Complex {
        return Complex(
            real * other.real - imag * other.imag,
            real * other.imag + imag * other.real
        )
    }

    public operator func ==(other: Complex): Bool {
        return real == other.real && imag == other.imag
    }

    public func magnitude(): Float64 {
        let r = real * real + imag * imag
        return mySqrt(r)
    }
}

extend Complex <: ToString {
    public func toString(): String {
        if (imag >= 0.0) {
            return "${real} + ${imag}i"
        } else {
            return "${real} - ${-imag}i"
        }
    }
}

// =============================================================================
// 区间类型
// =============================================================================

public struct Range {
    public var start: Int64
    public var end: Int64
    public init(start!: Int64, end!: Int64) {
        this.start = start
        this.end = end
    }

    public operator func +(other: Range): Range {
        let newStart = if (this.start < other.start) { this.start } else { other.start }
        let newEnd = if (this.end > other.end) { this.end } else { other.end }
        return Range(start: newStart, end: newEnd)
    }

    public func contains(value: Int64): Bool {
        return value >= start && value < end
    }

    public operator func ==(other: Range): Bool {
        return this.start == other.start && this.end == other.end
    }
}

extend Range <: ToString {
    public func toString(): String {
        return "[${start}, ${end})"
    }
}

// =============================================================================
// 金额类型
// =============================================================================

public struct Money {
    public var amount: Int64
    public var currency: String

    public init(amount: Int64, currency: String) {
        this.amount = amount
        this.currency = currency
    }

    public operator func +(other: Money): Money {
        if (currency != other.currency) {
            throw Exception("货币类型不一致")
        }
        return Money(amount + other.amount, currency)
    }

    public operator func -(other: Money): Money {
        if (currency != other.currency) {
            throw Exception("货币类型不一致")
        }
        return Money(amount - other.amount, currency)
    }

    public operator func >(other: Money): Bool {
        if (currency != other.currency) { throw Exception("货币类型不一致") }
        return amount > other.amount
    }

    public operator func <(other: Money): Bool {
        if (currency != other.currency) { throw Exception("货币类型不一致") }
        return amount < other.amount
    }
}

extend Money <: ToString {
    public func toString(): String {
        return "${amount / 100}.${amount % 100} ${currency}"
    }
}

// =============================================================================
// 辅助函数
// =============================================================================

func mySqrt(x: Float64): Float64 {
    if (x <= 0.0) { return 0.0 }
    var y = x
    var iter: Int64 = 0
    while (iter < 50) {
        y = (y + x / y) / 2.0
        iter += 1
    }
    return y
}