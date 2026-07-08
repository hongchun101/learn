// =============================================================================
// 05_interfaces_traits - 接口与特征
// =============================================================================
// 覆盖: interface 多继承、扩展类型、默认实现、类型组合
// 注: Cangjie 接口只有抽象方法，默认实现通过 extend 提供
// =============================================================================

package cangjie_learning.interfaces_traits

import std.collection.*

/// 接口演示入口
public func traitsDemo(): Unit {
    println("[05] 接口与特征演示")

    // ----- 单接口实现 -----
    let circle = Circle(3.0)
    println("圆形面积: ${circle.area()}")

    // ----- 多接口实现 -----
    let rect = Rectangle(4.0, 5.0)
    rect.draw()
    rect.print()
    rect.resize(2.0)
    println("缩放后: ${rect.area()}")

    // ----- 类型扩展 -----
    let s = "Hello, 仓颉"
    println("字符串长度: ${s.len()}")
    println("重复 3 次: ${s.repeat(3)}")

    let n: Int64 = 42
    println("42 是否偶数: ${n.isEven()}")
    println("42 平方: ${n.squared()}")

    // ----- 接口组合 -----
    let bird = Bird("麻雀")
    let swimmer = Duck("唐老鸭")
    let flyer = Duck("唐老鸭")

    describeMover(bird)
    describeSwimmer(swimmer)
    describeFlyer(flyer)
}

// =============================================================================
// 接口定义
// =============================================================================

/// 可绘制接口
public interface Drawable {
    func draw(): Unit
}

/// 可打印接口
public interface Printable {
    func print(): Unit
}

/// 可缩放接口
public interface Scalable {
    func scale(factor: Float64): Unit
}

/// 可序列化接口
public interface Serializable {
    func serialize(): String
}

// =============================================================================
// 多接口实现
// =============================================================================

/// 矩形实现多个接口
public class Rectangle <: Drawable & Printable & Scalable & Serializable {
    public var width: Float64
    public var height: Float64

    public init(width: Float64, height: Float64) {
        this.width = width
        this.height = height
    }

    public func area(): Float64 {
        return width * height
    }

    public func draw(): Unit {
        println("[Draw] 绘制 ${width}x${height} 矩形")
    }

    public func print(): Unit {
        println("[Print] Rectangle(${width}, ${height})")
    }

    public func scale(factor: Float64): Unit {
        width *= factor
        height *= factor
    }
    public func serialize(): String {
        return "{ \"type\": \"rect\", \"width\": ${width}, \"height\": ${height} }"
    }

    /// 便利方法（与 scale 同义）
    public func resize(factor: Float64): Unit {
        scale(factor)
    }
}

/// 圆形
public class Circle <: Drawable {
    public var radius: Float64

    public init(radius: Float64) {
        this.radius = radius
    }

    public func area(): Float64 {
        return 3.14159265 * radius * radius
    }

    public func draw(): Unit {
        println("[Draw] 绘制半径 ${radius} 的圆")
    }
}

extend String {
    /// 字符串长度
    public func len(): Int64 {
        return this.size
    }

    /// 字符串重复
    public func repeat(times: Int64): String {
        var result = ""
        var i: Int64 = 0
        while (i < times) {
            result += this
            i += 1
        }
        return result
    }
}

extend Int64 {
    public func isEven(): Bool {
        return this % 2 == 0
    }

    public func isOdd(): Bool {
        return !isEven()
    }

    public func squared(): Int64 {
        return this * this
    }

    public func clamped(min!: Int64, max!: Int64): Int64 {
        if (this < min) { return min }
        if (this > max) { return max }
        return this
    }
}

// =============================================================================
// 接口组合（接口继承）
// =============================================================================

/// 移动能力
public interface Movable {
    func move(): Unit
}

/// 游泳能力
public interface Swimmable {
    func swim(): Unit
}

/// 飞行能力
public interface Flyable {
    func fly(): Unit
}

/// 动物接口
public interface Animal {
    func name(): String
    func speak(): Unit
}

public class Dog <: Animal {
    public var dogName: String

    public init(name: String) {
        this.dogName = name
    }
    public func name(): String { return dogName }
    public func speak(): Unit {
        println("${dogName}: 汪汪汪!")
    }
}

public class Cat <: Animal {
    public var catName: String

    public init(name: String) {
        this.catName = name
    }
    public func name(): String { return catName }
    public func speak(): Unit {
        println("${catName}: 喵~")
    }
}

public class Bird <: Movable & Flyable {
    public var birdName: String

    public init(name: String) {
        this.birdName = name
    }
    public func move(): Unit { println("${birdName} 在行走") }
    public func fly(): Unit { println("${birdName} 在飞行") }
}

public class Duck <: Movable & Swimmable & Flyable {
    public var duckName: String

    public init(name: String) {
        this.duckName = name
    }
    public func move(): Unit { println("${duckName} 摇摆走路") }
    public func swim(): Unit { println("${duckName} 在游泳") }
    public func fly(): Unit { println("${duckName} 在飞行") }
}

// 利用类型约束的多态函数
public func describeMover(m: Movable): Unit {
    m.move()
}

public func describeSwimmer(s: Swimmable): Unit {
    s.swim()
}

public func describeFlyer(f: Flyable): Unit {
    f.fly()
}