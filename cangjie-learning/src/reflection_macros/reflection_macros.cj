// =============================================================================
// 20_reflection_macros - 反射与宏进阶
// =============================================================================
// 覆盖: 编译期函数、注解、JSON 序列化、路由注册、配置框架
// =============================================================================

package cangjie_learning.reflection_macros

import std.collection.*

/// 反射与宏演示入口
public func reflectionMacrosDemo(): Unit {
    println("[20] 反射与宏演示")

    // ----- 1. 编译期函数 -----
    println("--- 编译期函数 ---")
    println("编译期 2^20 = ${constPow2(20)}")
    println("编译期 fib(15) = ${constFib(15)}")
    println("编译期阶乘 = ${constFactorialImpl(6)}")

    // ----- 2. 编译期配置校验 -----
    println("--- 编译期校验 ---")
    println("HTTP 端口合法: ${validatePort(8080)}")
    println("HTTP 端口合法: ${validatePort(70000)}")

    // ----- 3. 注解使用 -----
    println("--- 注解 ---")
    let api = ApiHandler()
    api.handleRequest("GET /api/users")

    // ----- 4. JSON 序列化框架 -----
    println("--- JSON 序列化 ---")
    let u = User("Alice", 30, "alice@example.com")
    let json = JsonSerializer.serialize(u)
    println("User -> JSON: ${json}")

    let p = Product("Widget", 99.99, 100)
    let json2 = JsonSerializer.serialize(p)
    println("Product -> JSON: ${json2}")

    // ----- 5. JSON 解析 -----
    println("--- JSON 解析 ---")
    let input = "{\"name\":\"Bob\",\"age\":25}"
    match (JsonParser.getString(input, "name")) {
        case Some(v) => println("  name = ${v}")
        case None => println("  未找到 name")
    }
    match (JsonParser.getInt(input, "age")) {
        case Some(v) => println("  age = ${v}")
        case None => println("  未找到 age")
    }

    // ----- 6. 简易路由注册 -----
    println("--- 路由注册表 ---")
    let registry = RouteRegistry()
    registry.register("GET", "/users", { req => "列出用户: ${req}" })
    registry.register("POST", "/users", { req => "创建用户: ${req}" })
    registry.register("GET", "/orders", { req => "列出订单: ${req}" })
    match (registry.dispatch("GET", "/users", "id=1")) {
        case Some(resp) => println("  路由匹配: ${resp}")
        case None => println("  无匹配路由")
    }
    match (registry.dispatch("DELETE", "/users", "id=1")) {
        case Some(resp) => println("  路由匹配: ${resp}")
        case None => println("  无匹配路由（未注册）")
    }

    // ----- 7. 应用配置 -----
    println("--- 应用配置 ---")
    let config = AppConfig("cangjie-tutorial", "1.0.0", true, 1000)
    println("应用: ${config.summary()}")

    // ----- 8. 接口与运行时多态 -----
    println("--- 多态 ---")
    let shapes: Array<Shape2> = [Circle2(5.0), Rect2(4.0, 6.0), Circle2(2.5)]
    var totalArea: Float64 = 0.0
    for (s in shapes) {
        totalArea += s.area()
        println("  ${s.name()} 面积: ${s.area()}")
    }
    println("总面积: ${totalArea}")
}

// =============================================================================
// 编译期函数（const）
// =============================================================================

const func constPow2(n: Int64): Int64 {
    if (n == 0) { return 1 }
    return 2 * constPow2(n - 1)
}

const func constFib(n: Int64): Int64 {
    if (n < 2) { return n }
    return constFib(n - 1) + constFib(n - 2)
}

const func constFactorialImpl(n: Int64): Int64 {
    if (n <= 1) { return 1 }
    return n * constFactorialImpl(n - 1)
}

/// 编译期校验端口范围
const func validatePort(p: Int64): Bool {
    return p >= 0 && p <= 65535
}

// =============================================================================
// 注解示例
// =============================================================================

@Deprecated[message: "use newApi instead", since: "1.1.0"]
public func oldApi(): String {
    return "old result"
}

public func newApi(): String {
    return "new result"
}

public class ApiHandler {
    public func handleRequest(req: String): String {
        println("  处理: ${req}")
        return "ok"
    }
}

// =============================================================================
// JSON 序列化框架
// =============================================================================

public interface JsonSerializable {
    func toJson(): String
}

public class User <: JsonSerializable {
    public var name: String
    public var age: Int64
    public var email: String

    public init(name: String, age: Int64, email: String) {
        this.name = name
        this.age = age
        this.email = email
    }

    public func toJson(): String {
        return "{\"name\":\"${name}\",\"age\":${age},\"email\":\"${email}\"}"
    }
}

public class Product <: JsonSerializable {
    public var name: String
    public var price: Float64
    public var stock: Int64

    public init(name: String, price: Float64, stock: Int64) {
        this.name = name
        this.price = price
        this.stock = stock
    }

    public func toJson(): String {
        return "{\"name\":\"${name}\",\"price\":${price},\"stock\":${stock}}"
    }
}

public class JsonSerializer {
    public static func serialize(value: JsonSerializable): String {
        return value.toJson()
    }
}

// =============================================================================
// JSON 解析（最简实现）
// =============================================================================

public class JsonParser {
    /// 提取字符串字段值
    public static func getString(json: String, key: String): ?String {
        let keyStr = "\"${key}\":\""
        let idx = indexOfString(json, keyStr)
        if (idx < 0) { return None }
        let start = idx + keyStr.size
        match (json.indexOf("\"", start)) {
            case Some(e) => return json[start..e]
            case None => return None
        }
    }

    /// 提取数字字段值
    public static func getInt(json: String, key: String): ?Int64 {
        let keyStr = "\"${key}\":"
        let idx = indexOfString(json, keyStr)
        if (idx < 0) { return None }
        let start = idx + keyStr.size
        var end = start
        while (end < json.size) {
            let c = json[end]
            if (c < UInt8(48) || c > UInt8(57)) { break }
            end += 1
        }
        if (end == start) { return None }
        let numStr = json[start..end]
        return parseIntHelper(numStr)
    }

    static func indexOfString(haystack: String, needle: String): Int64 {
        if (needle.size > haystack.size) { return -1 }
        var i: Int64 = 0
        while (i + needle.size <= haystack.size) {
            var matched = true
            var j: Int64 = 0
            while (j < needle.size) {
                if (haystack[i + j] != needle[j]) {
                    matched = false
                    break
                }
                j += 1
            }
            if (matched) { return i }
            i += 1
        }
        return -1
    }

    static func parseIntHelper(s: String): ?Int64 {
        var result: Int64 = 0
        for (i in 0..s.size) {
            let c = s[i]
            if (c < UInt8(48) || c > UInt8(57)) { return None }
            result = result * 10 + Int64(c - UInt8(48))
        }
        return result
    }
}

// =============================================================================
// 简易路由注册表
// =============================================================================

public class RouteRegistry {
    private var routes: HashMap<String, (String) -> String>

    public init() {
        this.routes = HashMap<String, (String) -> String>()
    }

    public func register(method: String, path: String, handler: (String) -> String): Unit {
        let key = "${method}:${path}"
        routes[key] = handler
    }

    public func dispatch(method: String, path: String, request: String): ?String {
        let key = "${method}:${path}"
        match (routes.get(key)) {
            case Some(handler) => return Some(handler(request))
            case None => return None
        }
    }
}

// =============================================================================
// 应用配置
// =============================================================================

public class AppConfig {
    public let name: String
    public let version: String
    public let debug: Bool
    public let maxConnections: Int64

    public init(name: String, version: String, debug: Bool, maxConnections: Int64) {
        this.name = name
        this.version = version
        this.debug = debug
        this.maxConnections = maxConnections
    }

    public func summary(): String {
        return "${name} v${version} (debug=${debug}, max=${maxConnections})"
    }
}

// =============================================================================
// 多态形状（接口实现）
// =============================================================================

public interface Shape2 {
    func area(): Float64
    func name(): String
}

public class Circle2 <: Shape2 {
    public var radius: Float64
    public init(radius: Float64) {
        this.radius = radius
    }
    public func area(): Float64 {
        return 3.14159265 * radius * radius
    }
    public func name(): String {
        return "圆形"
    }
}

public class Rect2 <: Shape2 {
    public var width: Float64
    public var height: Float64
    public init(width: Float64, height: Float64) {
        this.width = width
        this.height = height
    }
    public func area(): Float64 {
        return width * height
    }
    public func name(): String {
        return "矩形"
    }
}
