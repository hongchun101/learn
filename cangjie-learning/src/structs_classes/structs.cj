// =============================================================================
// 03_structs_classes - 结构体与类
// =============================================================================
// 覆盖: struct(值类型)/class(引用类型)、构造函数、属性、访问控制、单例
// =============================================================================

package cangjie_learning.structs_classes

import std.collection.*


/// 自实现平方根（牛顿迭代法）
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
/// 结构体演示入口
public func structsDemo(): Unit {
    println("[03] 结构体与类演示")

    let p1 = Point(x: 3.0, y: 4.0)
    let p2 = Point(x: 1.0, y: 2.0)
    let p3 = Point.origin()
    println("p1 = (${p1.x}, ${p1.y}), 距离: ${p1.distanceTo(p2)}")
    println("p2 = (${p2.x}, ${p2.y})")
    println("p3 = (${p3.x}, ${p3.y})")

    // ----- 类（引用类型） -----
    let alice = User("alice", "alice@example.com", 25)
    let bob = User.byName("bob")
    alice.printInfo()
    bob.printInfo()

    let aliceRef = alice
    aliceRef.age = 26
    println("alice age: ${alice.age}, aliceRef age: ${aliceRef.age}")

    println("User 总数: ${User.totalCount}")

    // ----- 抽象类 -----
    let circle: Shape = Circle(5.0)
    let rect: Shape = Rectangle(4.0, 6.0)
    println("圆面积: ${circle.area()}")
    println("矩形面积: ${rect.area()}")

    // ----- 单例 -----
    Logger.instance.info("应用启动完成")
    Logger.instance.warn("内存使用偏高")
}

// =============================================================================
// 结构体（值类型）
// =============================================================================

/// 二维平面点
public struct Point {
    public var x: Float64
    public var y: Float64

    /// 主构造函数 - 使用 `!` 标记为命名参数
    public init(x!: Float64, y!: Float64) {
        this.x = x
        this.y = y
    }

    /// 命名构造函数（工厂方法）
    public static func origin(): Point {
        return Point(x: 0.0, y: 0.0)
    }

    /// 计算到另一点的距离
    public func distanceTo(other: Point): Float64 {
        let dx = x - other.x
        let dy = y - other.y
        return mySqrt(dx * dx + dy * dy)
    }
}

// =============================================================================
// 类（引用类型）
// =============================================================================

/// 用户类
public class User {
    public let username: String
    public var email: String
    public var age: Int64
    public var roles: ArrayList<String>

    /// 静态字段
    public static var totalCount: Int64 = 0

    /// 主构造函数
    public init(username: String, email: String, age: Int64) {
        this.username = username
        this.email = email
        this.age = age
        this.roles = ArrayList<String>()
        User.totalCount += 1
    }

    /// 命名构造函数
    public static func byName(username: String): User {
        return User(username, "${username}@example.com", 0)
    }

    public func printInfo(): Unit {
        println("User(username=${username}, email=${email}, age=${age})")
    }

    public func addRole(role: String): Unit {
        if (!roles.contains(role)) {
            roles.add(role)
        }
    }
}

// =============================================================================
// 抽象类与继承
// =============================================================================

/// 抽象形状
public abstract class Shape {
    public init() {}

    public open func area(): Float64
}

/// 圆形
public class Circle <: Shape {
    public var radius: Float64

    public init(radius: Float64) {
        super()
        this.radius = radius
    }

    public override func area(): Float64 {
        return 3.14159265 * radius * radius
    }
}

/// 矩形
public class Rectangle <: Shape {
    public var width: Float64
    public var height: Float64

    public init(width: Float64, height: Float64) {
        super()
        this.width = width
        this.height = height
    }

    public override func area(): Float64 {
        return width * height
    }
}

// =============================================================================
// 单例（静态实例模式）
// =============================================================================

/// 日志器单例
public class Logger {
    public static let instance: Logger = Logger()

    private init() {}

    public func info(msg: String): Unit {
        println("[INFO] ${msg}")
    }

    public func warn(msg: String): Unit {
        println("[WARN] ${msg}")
    }

    public func error(msg: String): Unit {
        println("[ERROR] ${msg}")
    }
}