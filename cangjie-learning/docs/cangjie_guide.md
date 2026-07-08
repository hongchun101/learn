# 仓颉（Cangjie）编程语言 - 高级语法指南

仓颉是华为于 2024 年正式发布的下一代通用编程语言，设计目标是面向全场景智能应用。本指南配合本项目的代码示例，系统梳理其高级语法特性。

## 1. 类型系统

### 1.1 基础类型

| 类型 | 描述 | 示例 |
|------|------|------|
| `Int8`/`Int16`/`Int32`/`Int64` | 有符号整数 | `let n: Int64 = 42` |
| `UInt8`/`UInt16`/`UInt32`/`UInt64` | 无符号整数 | `let n: UInt32 = 100` |
| `Float32`/`Float64` | 浮点数 | `let f: Float64 = 3.14` |
| `Bool` | 布尔 | `let b: Bool = true` |
| `Rune` | Unicode 码点 | `let c: Rune = '仓'` |
| `String` | 字符串 | `let s: String = "hello"` |
| `Unit` | 无值（等价于 `void`） | `let u: Unit = ()` |
| `Nothing` | 永不返回 | 用于抛出异常或死循环 |

### 1.2 复合类型

- **数组**：`Array<T>`、`ArrayList<T>`
- **元组**：`(Int64, String)`
- **区间**：`1..10`（不含右）、`1..=10`（含右）
- **Option**：可空值
- **Result**：带错误的返回值

## 2. 变量与常量

```cangjie
// 不可变变量（推荐）
let name: String = "仓颉"

// 可变变量
var counter: Int64 = 0

// 编译期常量
const MAX: Int64 = 100

// 类型推导
let inferred = 42       // 推导为 Int64
```

## 3. 函数

### 3.1 默认参数与命名参数

```cangjie
func greet(name: String, greeting: String = "Hello", punctuation: String = "!"): Unit {
    println("${greeting}, ${name}${punctuation}")
}

greet("仓颉")                           // 使用默认参数
greet("仓颉", greeting: "Hi")           // 命名参数
```

### 3.2 可变参数

```cangjie
func sumAll(prefix!: String = "", values!: Int64...): Int64 {
    var total: Int64 = 0
    for (v in values) { total += v }
    return total
}
```

### 3.3 Lambda 与闭包

```cangjie
// Lambda
let add = { a: Int64, b: Int64 => a + b }

// 闭包捕获
func makeCounter(): () -> Int64 {
    var n: Int64 = 0
    return { => n += 1; n }
}
```

## 4. 结构体与类

### 4.1 结构体（值类型）

```cangjie
struct Point {
    var x: Float64
    var y: Float64

    init(x: Float64, y: Float64) {
        this.x = x
        this.y = y
    }
}
```

### 4.2 类（引用类型）

```cangjie
class User {
    let username: String       // 不可变字段
    var email: String          // 可变字段

    init(username: String, email: String) {
        this.username = username
        this.email = email
    }
}
```

## 5. 枚举（代数数据类型）

```cangjie
// 简单枚举
enum Color { Red | Green | Blue }

// 带负载枚举
enum Shape {
    | Circle(Float64)
    | Rectangle(Float64, Float64)
    | Triangle(Float64, Float64, Float64)
}

// 递归枚举
enum BinaryTree<T> {
    | Leaf(T)
    | Node(BinaryTree<T>, BinaryTree<T>, (T, T) -> T)
}
```

## 6. 接口与扩展

### 6.1 接口

```cangjie
interface Drawable {
    func draw(): Unit
}

// 多接口
class Rectangle <: Drawable & Serializable { ... }

// 默认实现
interface Animal {
    func name(): String
    func speak(): Unit
}

extend Animal {
    public func introduce(): Unit {
        println("我是 ${name()}")
    }
}
```

### 6.2 类型扩展

```cangjie
// 为内置类型扩展
extend String {
    public func reverse(): String { ... }
}

extend Int64 {
    public func isEven(): Bool { return this % 2 == 0 }
}
```

## 7. 泛型

```cangjie
// 泛型函数
func identity<T>(value: T): T { return value }

// 上界约束
func maxOf<T>(a: T, b: T): T where T <: Comparable<T> {
    return if (a.compare(b) > 0) a else b
}

// 多约束
func process<T>(item: T) where T <: Comparable<T> & Hashable { ... }
```

## 8. 模式匹配

```cangjie
// 字面量
match (n) {
    case 0 => "零"
    case 1 => "一"
    case _ => "其他"
}

// 守卫
match (n) {
    case x if x < 0 => "负数"
    case 0 => "零"
    case x if x < 10 => "个位数"
    case x => "其他"
}

// 解构
match (shape) {
    case Circle(r) => "圆形，半径=${r}"
    case Rectangle(w, h) => "矩形 ${w}x${h}"
    case _ => "未知"
}
```

## 9. 错误处理

### 9.1 异常

```cangjie
try {
    let result = divide(10, 0)
} catch (e: DivisionByZeroException) {
    println(e.message)
} finally {
    println("清理")
}
```

### 9.2 Option

```cangjie
enum Option<T> {
    | Some(T)
    | None
}
```

### 9.3 Result

```cangjie
enum Result<T, E> {
    | Ok(T)
    | Err(E)
}
```

## 10. 操作符重载

```cangjie
struct Vec2 {
    var x: Float64
    var y: Float64

    operator func +(other: Vec2): Vec2 {
        return Vec2(x + other.x, y + other.y)
    }

    operator func *(scalar: Float64): Vec2 {
        return Vec2(x * scalar, y * scalar)
    }
}
```

## 11. 并发

```cangjie
// 启动协程
let future = spawn {
    return expensiveCompute()
}

// 等待结果
let result = future.get()

// Channel
let ch = Channel<String>()
spawn { ch.send("hello") }
let msg = ch.receive()
```

## 12. 宏

```cangjie
// 自定义宏
macro Builder(input: Tokens): Tokens {
    return input
}

// 使用宏
@Builder
struct Person {
    var name: String
    var age: Int64
}
```

## 13. 类型别名

```cangjie
typealias UserId = Int64
typealias Callback<T> = (T) -> Unit
typealias Result<T> = std.collection.Result<T, String>
```

## 14. 高级类型特性

### 14.1 ThisType

```cangjie
class Calculator {
    var value: Int64 = 0

    func add(n: Int64): this {        // 返回 this 类型
        value += n
        return this
    }
}

// 链式调用
Calculator(10).add(5).multiply(2).value
```

### 14.2 协变与逆变

```cangjie
// 协变：out T
class List<out T> { ... }

// 逆变：in T
interface Consumer<in T> {
    func consume(item: T): Unit
}
```

## 15. 集合操作

```cangjie
let arr = [1, 2, 3, 4, 5]

arr.map({ x => x * 2 })
arr.filter({ x => x % 2 == 0 })
arr.reduce(0, { acc, x => acc + x })
arr.find({ x => x > 3 })
arr.take(3)
arr.skip(2)
arr.groupBy({ x => x % 2 })
arr.distinct()
arr.sorted()
```

## 16. 设计哲学

仓颉的设计融合了多种现代语言的优点：

- **类型安全**：静态强类型 + 编译期类型检查
- **表达力**：代数数据类型 + 模式匹配
- **内存安全**：自动内存管理，无需手动 GC
- **并发友好**：原生协程、Channel、结构化并发
- **原生智能**：内置 AI 算子与自动微分支持
- **全场景**：服务端、客户端、嵌入式统一

## 参考

- [仓颉语言官方文档](https://cangjie-lang.cn/)
- [仓颉 GitHub 仓库](https://github.com/cangjie-lang/cangjie)