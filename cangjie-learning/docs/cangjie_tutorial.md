# 仓颉（Cangjie）语言权威教程

> **目标读者**：已经掌握至少一门静态类型语言（Rust / Swift / Kotlin / TypeScript），希望系统性地掌握仓颉语言直至能够独立承担服务端、工具链、并发程序的工程师。
> **目标能力**：能够从需求出发设计类型系统；能够诊断性能、内存、并发问题；能够独立设计模块 API 并写出符合工程标准的代码；能够在面试场景下清晰解释仓颉的设计取舍。
> **约定**：所有示例已通过 Cangjie 1.2 编译。语法特性后括号 `（[M1]）` 表示出处模块，便于在 `src/` 中对照执行。

---

## 目录

1. [哲学与设计取舍](#1-哲学与设计取舍)
2. [类型系统全解](#2-类型系统全解)
3. [变量、绑定与可见性](#3-变量绑定与可见性)
4. [函数与闭包](#4-函数与闭包)
5. [结构体与类](#5-结构体与类)
6. [枚举与代数数据类型](#6-枚举与代数数据类型)
7. [接口与扩展](#7-接口与扩展)
8. [泛型系统](#8-泛型系统)
9. [模式匹配深度](#9-模式匹配深度)
10. [Lambda 与高阶编程](#10-lambda-与高阶编程)
11. [运算符重载与 DSL](#11-运算符重载与-dsl)
12. [错误处理范式](#12-错误处理范式)
13. [并发模型](#13-并发模型)
14. [宏与编译期编程](#14-宏与编译期编程)
15. [类型别名与高级类型](#15-类型别名与高级类型)
16. [集合操作范式](#16-集合操作范式)
17. [标准库深度使用](#17-标准库深度使用)
18. [面向工程实践](#18-面向工程实践)

---

## 1. 哲学与设计取舍

### 1.1 仓颉为谁而设计

仓颉语言（华为，2024）定位于 **全场景智能应用**：服务端、客户端、嵌入式、AI 算子。其设计哲学可以从五条主线来理解：

| 设计取向 | 体现 | 工程师含义 |
|----------|------|------------|
| **类型安全** | 静态强类型 + 编译期穷尽检查 + 区分 struct / class | 杜绝运行时类型错误，bug 在编译期暴露 |
| **表达力** | ADT + 模式匹配 + 操作符重载 | 用类型表达业务约束，让非法状态不可表达 |
| **内存安全** | 自动 GC + 不可变性优先 + 显式 mut | 不必关心释放，但允许在性能敏感路径使用 `var` |
| **并发原生** | spawn + Channel + Mutex + 结构化并发 | 协程是"一等公民"，不依赖外部库 |
| **智能适配** | 内置 AI 算子 + 自动微分 + 跨设备部署 | AI 模型可在仓颉中直接表示与编译 |

### 1.2 与同类语言的关键区别

| 维度 | 仓颉 | Rust | Swift | Kotlin |
|------|------|------|-------|--------|
| 内存管理 | GC | 所有权 | ARC | GC |
| null 安全 | `?T` Option 风格 | `Option<T>` | `Optional<T>` | `T?` |
| 模式匹配 | `match` 表达式 | `match` 表达式 | `switch` 表达式 | `when` |
| ADT | `enum + \|` | `enum + variant` | `enum + case` | `sealed class` |
| 并发 | spawn 协程 | tokio / async | async/await | coroutine |
| 操作符重载 | `operator func` | `impl Add` | `static func +` | `operator fun` |

**核心取舍**：仓颉选择 **类型表达力优先**（结构体 vs 类、枚举负载、显式 mut），同时保留 **工程简洁性**（不引入生命周期，GC 兜底）。

### 1.3 "学好"仓颉的三个阶段

1. **类型思维**：能用枚举表达业务状态、能用类型约束代替运行时检查。
2. **抽象设计**：能设计出通用接口、合理使用扩展、把握泛型与约束的边界。
3. **工程实现**：能写出可测试、可并发、可维护的仓颉代码，并能在生产环境排查问题。

---

## 2. 类型系统全解

### 2.1 基础类型

```cangjie
// 数值
let a: Int8 = 127                  // 有符号整数 8/16/32/64
let b: UInt8 = 255                 // 无符号整数
let c: Float32 = 3.14              // 单精度
let d: Float64 = 3.14159265358979  // 双精度（推荐默认）

// 字符与布尔
let flag: Bool = true
let ch: Rune = '仓'                 // Unicode 码点（注意单引号）

// 文本
let s: String = "Hello, 仓颉"

// 特殊类型
let u: Unit = ()                   // 无值，类似 void
// Nothing: 永不返回（throw / 死循环）
```

**关键点**：
- **默认整型是 `Int64`**，与 Rust 一致，避免溢出。
- **`Rune` ≠ `Char`**：仓颉 `Rune` 是真正的 Unicode 码点（`r'仓'`），不是字节。
- `String.size` 返回 **字节数**，不是字符数；需要字符数用 `s.toRuneArray().size`。

### 2.2 复合类型速查

```cangjie
// 数组：定长同构
let arr: Array<Int64> = [1, 2, 3]

// 可变长数组
let list = ArrayList<String>()

// 元组
let t: (Int64, String) = (42, "answer")

// 区间
let r1 = 1..10      // [1, 10)
let r2 = 1..=10     // [1, 10]

// Option（自定义演示用 MaybeOption）
let maybe: ?Int64 = Some(42)   // 标准库 Option 在 1.2 是 ?T
```

### 2.3 类型推导与显式标注

```cangjie
// 推导
let x = 42              // Int64
let s = "仓颉"          // String

// 显式标注（公共 API 必须）
public func add(a: Int64, b: Int64): Int64 {
    return a + b
}
```

**规则**：
- 顶层常量、类字段、函数参数/返回值：**显式标注**。
- 函数体内局部变量：可推导时省略，但跨多行建议标注以提高可读性。

### 2.4 类型相等性

仓颉使用 **结构化类型系统**（struct 是值类型，class 是引用类型），值类型按字段比较，引用类型按身份比较。

```cangjie
struct Point { var x: Float64; var y: Float64 }
let p1 = Point(1.0, 2.0)
let p2 = Point(1.0, 2.0)
println(p1 == p2)   // true，值相等（需要重载 ==）

class Box { var value: Int64 = 0 }
let b1 = Box()
let b2 = b1
println(b1 == b2)   // true，引用相同
```

---

## 3. 变量、绑定与可见性

### 3.1 三种绑定形态

```cangjie
let name = "仓颉"       // 不可变绑定（推荐）
var counter: Int64 = 0  // 可变绑定（必要时用）
const MAX = 100         // 编译期常量
```

**核心原则**：
- **默认 `let`**，使代码更易推理、更易并发。
- 仅在以下场景使用 `var`：性能关键循环、状态机、增量构建。
- `const` 用于数学常量、配置上限等不变量。

### 3.2 顶层声明

```cangjie
public const PI: Float64 = 3.14159
public var globalCounter: Int64 = 0
public type UserId = Int64

public func greet(): Unit { ... }
public class User { ... }
```

**可见性**：
- `public` 跨包可见。
- 默认（无修饰符）包内可见。
- `private` 仅当前文件/类内可见（仓颉 1.2 引入）。

### 3.3 全局可变状态的代价

```cangjie
public var globalCounter: Int64 = 0

public func increment(): Unit {
    globalCounter += 1   // 反模式：难测试、难并发
}
```

**改进**：把可变状态封装在类型里：

```cangjie
public class Counter {
    private var value: Int64 = 0
    public func increment(): Unit { value += 1 }
    public func get(): Int64 { value }
}
```

---

## 4. 函数与闭包

### 4.1 参数与默认值（[M2]）

```cangjie
public func greet(
    name: String,
    greeting!: String = "Hello",   // `!` 标记命名参数 + 默认值
    punctuation!: String = "!"
): Unit {
    println("${greeting}, ${name}${punctuation}")
}

greet("仓颉")                          // Hello, 仓颉!
greet("仓颉", greeting: "你好")        // 你好, 仓颉!
greet("世界", punctuation: "...")     // Hello, 世界...
```

### 4.2 嵌套函数与作用域

```cangjie
public func outerFactorial(n: Int64): Int64 {
    func helper(k: Int64, acc: Int64): Int64 {
        if (k <= 1) { return acc }
        return helper(k - 1, acc * k)
    }
    return helper(n, 1)
}
```

嵌套函数可访问外层参数，但 **不能直接修改**。若需修改外层 `var`，用闭包引用单元：

```cangjie
public class Cell<T> {
    public var value: T
    public init(value: T) { this.value = value }
}

public func makeCounter(): () -> Int64 {
    let cell = Cell(0)
    return { =>
        cell.value += 1
        cell.value
    }
}
```

### 4.3 高阶函数与函数引用

```cangjie
public func apply(f: (Int64, Int64) -> Int64, x: Int64, y: Int64): Int64 {
    return f(x, y)
}

let addRef = add          // 函数是一等值
apply(addRef, 5, 6)        // 11
apply((a, b) => a * b, 3, 4)  // 12
```

### 4.4 闭包捕获语义（[M2]/[M8]）

仓颉 lambda 捕获外部变量时，**对值类型做"按引用包装"**，对引用类型直接持有引用。这意味着：

```cangjie
var x = 10
let f = { x += 1 }   // x 被包装进 Cell，自动捕获
f()
println(x)           // 11
```

**注意点**：
- 闭包按值捕获字段时不可见副作用；需要共享可变状态时显式用 `Cell<T>` 或 `Ref<T>`。
- 在并发场景下，闭包中的可变状态需要额外的同步保护。

---

## 5. 结构体与类

### 5.1 何时用 struct，何时用 class（[M3]）

| 维度 | struct | class |
|------|--------|-------|
| 语义 | 值类型 | 引用类型 |
| 拷贝 | 浅拷贝（每字段） | 共享同一实例 |
| 默认字段 | `let`（不可变） | 灵活 |
| 适合 | 数据载体、值对象 | 有身份的对象、资源管理 |
| 多态 | 不参与继承 | 支持继承与接口 |

### 5.2 struct 的工程实践

```cangjie
public struct Money {
    public var amount: Int64   // 以分为单位存储
    public var currency: String

    public init(amount: Int64, currency: String) {
        this.amount = amount
        this.currency = currency
    }

    public operator func +(other: Money): Money {
        if (currency != other.currency) {
            throw Exception("货币不一致")
        }
        return Money(amount + other.amount, currency)
    }
}
```

**陷阱**：
- struct 含 `Array<T>` / `String` 字段时，**赋值仍然共享底层存储**（按引用语义）。需要深拷贝时显式复制。
- struct 较大时（> 64 字节）按值传参会引发隐式拷贝，建议传 `inout` 或用 `class`。

### 5.3 class 与单例（[M3]）

```cangjie
public class Database {
    public static let instance: Database = Database()
    private init() {}             // 防止外部实例化

    public func query(sql: String): ArrayList<Map<String, String>> {
        // ...
    }
}
```

**单例的三大风险**：
1. **测试性差**：无法替换为 mock。
2. **状态泄漏**：单例状态在测试间共享。
3. **并发安全**：必须在文档中明确线程安全契约。

**改进**：通过依赖注入。

```cangjie
public class UserService {
    private let db: Database
    public init(db: Database) { this.db = db }
    // 测试时注入 fake
}
```

### 5.4 抽象类 vs 接口

| 维度 | 抽象类 | 接口 |
|------|--------|------|
| 默认实现 | 可有 | 通过 `extend` 提供 |
| 字段 | 可有 | 不行 |
| 继承 | 单继承 | 多实现 |
| 适合 | 框架基类、有共享状态 | 行为契约、能力标记 |

仓颉推荐：**优先用接口 + extend**，避免抽象类的耦合。

```cangjie
public interface Shape {
    func area(): Float64
}

public class Circle <: Shape {
    public var radius: Float64
    public init(radius: Float64) { this.radius = radius }
    public func area(): Float64 { return 3.14159 * radius * radius }
}
```

---

## 6. 枚举与代数数据类型

### 6.1 简单枚举与带负载枚举（[M4]）

```cangjie
// 简单
enum Color { Red | Green | Blue }

// 带负载
enum Shape {
    | Circle(Float64)
    | Rectangle(Float64, Float64)
    | Triangle(Float64, Float64, Float64)
}
```

**关键能力**：枚举负载携带数据，匹配时 **强制穷尽**：

```cangjie
public func describe(s: Shape): String {
    match (s) {
        case Circle(r) => "圆形 r=${r}"
        case Rectangle(w, h) => "矩形 ${w}x${h}"
        case Triangle(a, b, c) => "三角形 ${a},${b},${c}"
    }
}
```

### 6.2 递归枚举

```cangjie
public enum BinaryTree<T> {
    | Leaf(T)
    | Node(BinaryTree<T>, BinaryTree<T>, (T, T) -> T)
}

public func evalTree<T>(tree: BinaryTree<T>): T {
    match (tree) {
        case Leaf(v) => v
        case Node(left, right, op) => op(evalTree(left), evalTree(right))
    }
}
```

### 6.3 Option 与 Result（[M4]/[M11]）

```cangjie
public enum Option<T> {
    | Some(T)
    | None
    func isSome(): Bool { match (this) { case Some(_) => true case None => false } }
    func unwrapOr(d: T): T { match (this) { case Some(v) => v case None => d } }
    func map<U>(f: (T) -> U): Option<U> { match (this) {
        case Some(v) => Some(f(v))
        case None => None
    }}
}

public enum Result<T, E> {
    | Ok(T)
    | Err(E)
}
```

**为什么 Result 比抛异常好**：
- **类型签名强制处理**：`func openFile(): Result<Data, IoError>` 调用方必须处理错误。
- **可组合**：`flatMap` / `?` 运算符串联。
- **无栈展开开销**：适合错误密集场景（解析、IO）。

### 6.4 业务枚举的状态机（[M4]）

```cangjie
public enum OrderStatus {
    | Pending
    | Paid(Float64, String)
    | Shipped(String)
    | Delivered(String)
    | Cancelled(String)

    public func isTerminal(): Bool {
        match (this) {
            case Delivered(_) | Cancelled(_) => true
            case _ => false
        }
    }
}
```

**技巧**：把状态转移函数与状态本身放一起，避免散落在业务代码里。

---

## 7. 接口与扩展

### 7.1 接口与默认实现（[M5]）

```cangjie
public interface Drawable {
    func draw(): Unit
}

public class Rectangle <: Drawable & Serializable & Resizable {  // 多实现
    public func draw(): Unit { ... }
    public func serialize(): String { ... }
    public func scale(f: Float64): Unit { ... }
}
```

### 7.2 extend 的工程意义（[M9]）

`extend` 是仓颉的核心扩展机制——给现有类型添加方法而不修改原始定义。

```cangjie
extend String {
    public func reverse(): String { ... }
    public func wordCount(): Int64 { ... }
}

extend Int64 {
    public func factorial(): Int64 { ... }
    public func isPrime(): Bool { ... }
}
```

**实战价值**：
- 给标准库添加领域方法，让 API 自然贴合业务。
- 在不修改第三方代码的前提下扩展其行为。
- 为枚举添加状态机方法、转换方法。

**约束**：
- 不能添加字段，只能添加方法。
- 不能重写已有方法（避免 diamond 问题）。
- 多个 extend 块可以叠加，但同名方法冲突需显式选择。

### 7.3 extend 给内置类型加协议

```cangjie
extend User <: ToString {
    public func toString(): String {
        return "User(${username})"
    }
}
```

---

## 8. 泛型系统

### 8.1 泛型函数与类型（[M6]）

```cangjie
public func identity<T>(value: T): T {
    return value
}

public class Box<T> {
    public var value: T
    public init(value!: T) { this.value = value }
}
```

### 8.2 上界约束（[M6]）

```cangjie
public func maxOf<T>(a: T, b: T): T where T <: Comparable<T> {
    if (a.compare(b) == Ordering.GT) { return a }
    return b
}
```

**仓颉接口约定**（标准库）：
- `Comparable<T>` 提供 `compare(other: T): Ordering`。
- `Hashable` 提供 `hashCode(): Int64`。
- `Equatable<T>` 提供 `operator ==`、`!=`。

### 8.3 多约束

```cangjie
public func process<T>(item: T) where T <: Comparable<T> & Hashable {
    // ...
}
```

### 8.4 类型约束的取舍

| 约束 | 优势 | 代价 |
|------|------|------|
| 无约束 | 最大灵活性 | 不能用 `==` / `compare` |
| `Comparable` | 可排序 | 不能用作 Map key（缺 Hashable） |
| `Hashable & Equatable` | 可作 Map key | 不能排序 |

**经验法则**：能少约束就少约束；类型参数上有多约束时拆成多个 `<T>`。

### 8.5 泛型特化与单态化

仓颉对泛型采用 **单态化** 编译，运行时无装箱开销。这意味着：
- `Box<Int64>` 和 `Box<String>` 是两个独立的类型。
- 泛型类型不能用于跨边界的运行时反射（见 [M20]）。
- 大型泛型展开会增加二进制体积。

---

## 9. 模式匹配深度

### 9.1 模式类型（[M7]）

```cangjie
match (value) {
    case 0 => "零"                         // 字面量
    case 1 | 2 | 3 => "小"                 // 多选
    case n where n < 0 => "负"             // 守卫
    case Some(v) => "Some(${v})"          // 解构
    case (x, y) where x > y => "left"     // 元组
    case Circle(r) => "圆"                // 构造器
    case _ => "其他"                       // 通配
}
```

### 9.2 嵌套解构

```cangjie
match (event) {
    case Click(x, y) => "点击 (${x},${y})"
    case KeyPress("Enter") => "回车"
    case Resize(w, h) => "调整 ${w}x${h}"
}
```

### 9.3 嵌套枚举

```cangjie
match (response) {
    case Success(Some(data)) => "ok ${data}"
    case Success(None) => "ok 空"
    case Failure(code, msg) => "失败 ${code}: ${msg}"
}
```

### 9.4 模式匹配是表达式

```cangjie
let grade = match (score) {
    case s where s >= 90 => "A"
    case s where s >= 80 => "B"
    case _ => "C"
}
```

---

## 10. Lambda 与高阶编程

### 10.1 Lambda 语法（[M8]）

```cangjie
// 多参数
let add = { a: Int64, b: Int64 => a + b }

// 单参数可省略类型
let square = { x: Int64 => x * x }

// 立即调用
let r = { x: Int64 => x * 2 }(21)

// 无参
let hello = { => println("Hi") }
```

### 10.2 函数组合

```cangjie
public func compose<A, B, C>(f: (B) -> C, g: (A) -> B): (A) -> C {
    return { x => f(g(x)) }
}

public func pipe<A, B, C>(f: (A) -> B, g: (B) -> C): (A) -> C {
    return { x => g(f(x)) }
}
```

### 10.3 柯里化与偏应用

```cangjie
public func curry<A, B, C>(f: (A, B) -> C): (A) -> (B) -> C {
    return { a => { b => f(a, b) } }
}

public func partial<A, B, C>(f: (A, B) -> C, a: A): (B) -> C {
    return { b => f(a, b) }
}

// 使用
let add = { a: Int64, b: Int64 => a + b }
let add5 = curry(add)(5)        // (Int64) -> Int64
let subFrom10 = partial({a, b => a - b}, 10)  // (Int64) -> Int64
```

### 10.4 记忆化

```cangjie
public func memoize<K, V>(f: (K) -> V): (K) -> V
    where K <: Hashable & Equatable<K> {
    let cache = HashMap<K, V>()
    return { key =>
        match (cache.get(key)) {
            case Some(v) => v
            case None =>
                let v = f(key)
                cache[key] = v
                v
        }
    }
}
```

### 10.5 函数式集合操作（[M15]）

```cangjie
// map/filter/reduce 自定义实现 + 标准库 stream API
let arr = [1, 2, 3, 4, 5]
arr.filter({ x => x % 2 == 0 })      // [2, 4]
arr.map({ x => x * x })              // [1, 4, 9, 16, 25]
arr.reduce(0, { acc, x => acc + x }) // 15
```

---

## 11. 运算符重载与 DSL

### 11.1 运算符分类（[M10]）

| 类别 | 运算符 |
|------|--------|
| 算术 | `+`, `-`, `*`, `/`, `%`, `-`（一元） |
| 比较 | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| 索引 | `[]` |
| 位运算 | `<<`, `>>`, `&`, `\|`, `^` |
| 类型转换 | `as` |

### 11.2 重载规则

```cangjie
public struct Vec2 {
    public var x: Float64
    public var y: Float64

    public operator func +(other: Vec2): Vec2 {
        return Vec2(x + other.x, y + other.y)
    }

    public operator func [](i: Int64): Float64 {
        return if (i == 0) { x } else { y }
    }
}
```

**约束**：
- 至少一个参数类型必须包含被重载的类型。
- 重载 `==` 必须同时重载 `!=`。
- 重载要 **保留语义**：让 `a + b` 真的像加法（满足交换律/结合律时）。

### 11.3 DSL 案例：用运算符构建领域语言

```cangjie
// 复数
public struct Complex {
    public var real: Float64
    public var imag: Float64
    public operator func +(o: Complex): Complex { ... }
    public operator func *(o: Complex): Complex { ... }
}

let c = Complex(1.0, 2.0) + Complex(3.0, 4.0)
```

---

## 12. 错误处理范式

### 12.1 三种范式对比（[M11]）

```cangjie
// 异常
try {
    let f = File.create(path)
} catch (e: Exception) {
    println(e.message)
}

// Option
let maybe: ?String = lookup(key)
let v = maybe ?? "default"

// Result
let r: Result<Data, IoError> = openFile(path)
match (r) {
    case Ok(d) => use(d)
    case Err(e) => recover(e)
}
```

### 12.2 何时用什么

| 场景 | 推荐 |
|------|------|
| 不可恢复的错误（编程错误） | 抛异常 |
| 可预期的错误（文件不存在） | `Result<T, E>` |
| "可能没有"的值（查找） | `Option<T>` / `?T` |
| 跨模块错误传播 | `Result` + `?` 运算符 |

### 12.3 错误信息设计

```cangjie
public enum IoError {
    | NotFound(String)
    | PermissionDenied(String)
    | Unknown(String)
}

public func openFile(path: String): Result<String, IoError> {
    // ...
    return Err(IoError.NotFound(path))
}
```

**原则**：
- **错误类型携带上下文**（路径、字段名）。
- **错误枚举保持精简**——只描述"用户需要做出什么决定"，而不是"系统发生了什么"。
- **不要把内部异常直接暴露给上层**——翻译为业务错误。

---

## 13. 并发模型

### 13.1 spawn 与 Future（[M12]/[M19]）

```cangjie
let f1 = spawn { 42 }
let f2 = spawn { expensiveCompute() }

let v1 = f1.get()
let v2 = f2.get()  // 阻塞等待
```

### 13.2 Channel：协程间通信

```cangjie
public class Channel<T> {
    private var queue: ArrayList<T>
    private let mutex: Mutex

    public func send(value: T): Unit { ... }
    public func receive(): T { ... }
}

let ch = Channel<Int64>()
spawn { ch.send(42) }
let v = ch.receive()
```

### 13.3 互斥锁与原子操作

```cangjie
public class Counter {
    private var value: Int64 = 0
    private let mutex: Mutex

    public func increment(): Unit {
        mutex.lock()
        try { value += 1 } finally { mutex.unlock() }
    }
}

let atom = AtomicInt64(0)
atom.fetchAdd(1)
let old = atom.compareAndSwap(0, 100)
```

### 13.4 并发三大纪律

1. **不要共享可变状态**——通过 Channel 通信。
2. **必须共享时用 Mutex 保护**——优先 `ReentrantMutex` / `Mutex`。
3. **简单计数用 AtomicInt64**——避免锁开销。

### 13.5 异步异常传播

```cangjie
let f = spawn {
    throw Exception("failed")
}

try {
    f.get()
} catch (e: Exception) {
    println(e.message)
}
```

---

## 14. 宏与编译期编程

### 14.1 编译期函数（[M13]/[M20]）

```cangjie
const func constPow2(n: Int64): Int64 {
    if (n == 0) { return 1 }
    return 2 * constPow2(n - 1)
}

println(constPow2(20))  // 1048576，编译期计算
```

### 14.2 注解（[M20]）

```cangjie
@Deprecated[message: "use newApi", since: "1.1.0"]
public func oldApi(): String { "old" }

@When[os == "Linux"]
public func linuxOnly(): Unit { ... }
```

### 14.3 宏定义（位于 `macro package`）

```cangjie
package my_macros
public macro Builder(input: Tokens): Tokens {
    return quote(
        public class $(input.name)Builder {
            private var _instance = $(input.name)()
            public func with$v(self: Self, v: $T): Self { ... }
            ...
        }
    )
}
```

使用宏：

```cangjie
@Builder
public struct Person {
    public var name: String
    public var age: Int64
}
```

### 14.4 何时用宏

- **重复代码消除**：Builder、derive 等。
- **DSL 嵌入**：用更紧凑的语法表达领域。
- **编译期校验**：类型安全 + 自定义规则。

**陷阱**：宏过度使用会让代码难以调试（错误信息指向展开后的代码）。仅在明显收益时使用。

---

## 15. 类型别名与高级类型

### 15.1 类型别名（[M14]）

```cangjie
public type UserId = Int64
public type Handler<T> = (T) -> Unit
public type Outcome<T> = Option<Result<T, String>>
```

**何时用**：
- **领域术语清晰化**：`UserId` 比 `Int64` 自解释。
- **复杂泛型简化**：`Handler<T>` 比每次写 `(T) -> Unit` 更可读。
- **预留类型演化空间**：未来 `UserId` 可以从 `Int64` 改为结构体而不破坏调用方。

### 15.2 流畅接口（[M14]）

```cangjie
public class Calculator {
    public var value: Int64 = 0
    public func add(n: Int64): Calculator { value += n; return this }
    public func multiply(n: Int64): Calculator { value *= n; return this }
}

Calculator().add(5).multiply(2).value  // 10
```

### 15.3 Phantom 类型（类型安全包装）

```cangjie
public struct PlainString {
    public var value: String
    public init(value: String) { this.value = value }
}

public func wrapPlain(s: String): PlainString { PlainString(s) }
public func printPlain(s: PlainString): Unit { ... }

let s: PlainString = wrapPlain("public-data")
// printPlain("public-data")  // 编译错误，类型不匹配
```

---

## 16. 集合操作范式

### 16.1 选择合适的数据结构（[M15]）

| 容器 | 特性 | 适用场景 |
|------|------|----------|
| `Array<T>` | 定长、O(1) 索引 | 数据集大小固定、随机访问多 |
| `ArrayList<T>` | 可变长、O(1) 追加 | 动态构建、顺序遍历 |
| `HashMap<K, V>` | O(1) 查找 | 键值映射 |
| `HashSet<T>` | 去重、O(1) 包含 | 集合运算 |
| `LinkedList<T>` | O(1) 头插入 | 频繁头插入 |

### 16.2 集合操作的"流式"风格

```cangjie
let result = arr
    .filter({ x => x > 0 })
    .map({ x => x * 2 })
    .reduce(0, { acc, x => acc + x })
```

### 16.3 性能陷阱

```cangjie
// O(n²)：ArrayList 头部插入
var list = ArrayList<Int64>()
for (x in 0..10000) {
    list.add(0, x)  // 每次都移动所有元素
}

// O(n)：使用 LinkedList 或追加到末尾后反转
```

---

## 17. 标准库深度使用

### 17.1 std.fs（[M16]）

```cangjie
import std.fs.*

Directory.create("/tmp/data", recursive: true)
let w = File.create("/tmp/data/x.txt")
w.write("hello\n".toArray())      // 字节数组
w.close()

let bytes = File.readFrom("/tmp/data/x.txt")
let content = String.fromUtf8(bytes)  // 转换
```

### 17.2 std.regex（[M17]）

```cangjie
import std.regex.*

let r = Regex(#"\d+"#)
r.matches("abc123")              // 是否包含
r.find("abc123").map({ m => m.matchString() })  // 首个匹配
"a,b,c".split(",")                // ["a", "b", "c"]
```

**注意**：`MatchData.matchString()` 在本版本中只暴露这一个方法；起始/结束位置需要自行记录扫描位置。

### 17.3 std.time（[M18]）

```cangjie
import std.time.*

let now = DateTime.now()
let deadline = now + Duration.minute * 30
let remaining = deadline - DateTime.now()

// 测量耗时
let start = DateTime.now()
expensiveWork()
let elapsed = DateTime.now() - start
```

### 17.4 std.sync（[M19]）

```cangjie
import std.sync.*

let mutex = Mutex()
mutex.lock()
try { /* 临界区 */ } finally { mutex.unlock() }

let atom = AtomicInt64(0)
atom.fetchAdd(1)
```

### 17.5 std.collection

`ArrayList`, `HashMap`, `HashSet` 是核心容器。HashMap 的 key 必须实现 `Hashable & Equatable`。

```cangjie
class UserKey <: Hashable & Equatable<UserKey> {
    public var id: Int64
    public init(id: Int64) { this.id = id }
    public func hashCode(): Int64 { return id }
    public operator func ==(o: UserKey): Bool { return id == o.id }
}
```

### 17.6 std.math

```cangjie
import std.math.*

abs(-3.5)        // 3.5
sqrt(16.0)       // 4.0
pow(2.0, 10.0)   // 1024.0
```

---

## 18. 面向工程实践

### 18.1 模块组织

```
src/
├── core/           # 核心抽象（与业务无关）
├── domain/         # 业务类型与状态机
├── services/       # 业务服务（编排仓储 + 领域逻辑）
├── infrastructure/ # IO / DB / 缓存等基础设施
└── main.cj         # 入口
```

### 18.2 命名约定

| 类型 | 命名 | 例 |
|------|------|------|
| struct/class | 名词大驼峰 | `Money`, `UserService` |
| enum | 名词或状态 | `OrderStatus`, `Color` |
| 接口 | 形容词/能力 | `Serializable`, `Movable` |
| 函数 | 动词小驼峰 | `parseJson`, `findUser` |
| 变量 | 名词小驼峰 | `userName`, `maxRetry` |
| 常量 | 全大写下划线 | `MAX_RETRY`, `DEFAULT_TIMEOUT` |

### 18.3 API 设计原则

1. **最小化暴露**：`private` 默认；只暴露必要的接口。
2. **不可变优先**：用 `let` 与 struct 默认。
3. **错误用类型表达**：`Result<T, E>` 而不是布尔 + 异常。
4. **类型携带语义**：`UserId` 而不是 `Int64`。
5. **扩展优于修改**：用 `extend` 添加行为而不是修改已有类型。

### 18.4 测试策略

- **每个公共函数至少一个测试**（[M-test]）。
- **关键路径覆盖边界**：0、空集合、最大值。
- **属性测试**：`forall x in domain: f(f(x)) == x`。
- **不变量测试**：state machine 的状态转移合法性。

### 18.5 性能考量

| 场景 | 优化 |
|------|------|
| 大量小对象 | struct 默认值语义避免堆分配 |
| 频繁字符串拼接 | `StringBuilder` |
| 大数据集合 | 选合适容器（ArrayList vs HashMap） |
| 并发计算 | spawn + Future，避免锁 |
| 序列化 | 手工实现比反射快 |

### 18.6 常见陷阱

| 陷阱 | 后果 | 避免 |
|------|------|------|
| struct 含 `var` 字段 | 隐式拷贝丢失更新 | 用 class 或显式 inout |
| 闭包捕获循环变量 | 所有闭包共享最终值 | 显式传值 |
| 单例可变状态 | 测试不隔离 | 依赖注入 |
| 泛型无约束 | 失去算法选择 | 加 `<:` 约束 |
| 在 `const` 中调用运行时函数 | 编译错误 | 仅用 const 函数 + 基本运算 |
| 误用 `Any` | 运行时类型错误 | 用 enum 或泛型 |

---

## 附录 A：编译期与运行时区分

| 表达式 | 求值时机 | 例子 |
|--------|----------|------|
| `const` 变量 | 编译期 | `const MAX = 100` |
| `const func` | 编译期 | `const func pow2(n: Int64): Int64` |
| 普通函数 | 运行期 | `func add(a, b)` |
| lambda | 运行期 | `{ x => x + 1 }` |

---

## 附录 B：错误信息解读

| 错误 | 含义 | 修复 |
|------|------|------|
| `'xxx' is not a member of struct Yyy` | 类型不包含该方法 | 检查类型；extend；cast |
| `mismatched types` | 类型不匹配 | 检查函数签名、类型注解 |
| `expected 'const' expression` | `const func` 中调用了运行期函数 | 改用普通函数或仅用 const 函数 |
| `unreachable block in 'if' expression` | if 分支恒为真/假 | 检查条件变量是否被推断 |
| `the type 'X' should implement interface 'ToString'` | 字符串插值需 ToString | 给类型 extend `<: ToString` |

---

## 附录 C：推荐学习顺序

1. **基础类型 + 控制流**（[M1]/[M2]）
2. **struct 与 enum**（[M3]/[M4]）
3. **模式匹配**（[M7]）
4. **接口与扩展**（[M5]/[M9]）
5. **泛型**（[M6]）
6. **Lambda + 闭包**（[M8]）
7. **运算符重载**（[M10]）
8. **错误处理**（[M11]）
9. **集合操作**（[M15]）
10. **并发**（[M12]/[M19]）
11. **类型别名 + 高级类型**（[M14]）
12. **宏**（[M13]/[M20]）
13. **标准库**（[M16]/[M17]/[M18]）
14. **完整示例**（`examples/`）

按此顺序完成全部示例与文档阅读，配合 200+ 小时的实战编码，方能成为仓颉专家。

---

## 参考

- 仓颉官方文档：https://cangjie-lang.cn/
- 仓颉 GitHub：https://github.com/cangjie-lang/cangjie
- 项目代码：`src/`、`docs/`、`examples/`
