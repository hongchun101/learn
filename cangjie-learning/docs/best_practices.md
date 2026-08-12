# 仓颉工程最佳实践

> 适用于希望写出 **可维护、高性能、生产可用** 仓颉代码的工程师。所有规则来自真实项目经验，并在本项目代码中有据可查。

---

## 目录

1. [类型设计原则](#1-类型设计原则)
2. [并发安全](#2-并发安全)
3. [资源管理](#3-资源管理)
4. [错误处理](#4-错误处理)
5. [API 设计](#5-api-设计)
6. [性能工程](#6-性能工程)
7. [可测试性](#7-可测试性)
8. [代码风格](#8-代码风格)
9. [调试与诊断](#9-调试与诊断)

---

## 1. 类型设计原则

### 1.1 让非法状态不可表达

**反例**：

```cangjie
class Order {
    public var status: String = "pending"   // 任意字符串
    public var amount: Float64 = 0.0
    public var paidAt: ?DateTime = None       // pending 时不该有 paidAt
}
```

**改进**：

```cangjie
public enum OrderStatus {
    | Pending
    | Paid(amount: Float64, method: String, at: DateTime)
    | Shipped(tracking: String)
    | Delivered(at: DateTime)
    | Cancelled(reason: String)
}

public class Order {
    public var status: OrderStatus
    // 字段随状态走，pending 时没有 paidAt
}
```

### 1.2 用类型别名表达领域语义

```cangjie
public type UserId = Int64
public type OrderId = Int64

public func getOrder(userId: UserId, orderId: OrderId): ?Order { ... }

// 编译期防止传错
// getOrder(orderId, userId)  // 类型不匹配，编译错误
```

### 1.3 struct vs class 的工程决策树

```
是否需要身份（同一实例在多处共享）？
├─ 是 → class
└─ 否
    ├─ 是否需要继承？
    │   ├─ 是 → class
    │   └─ 否
    │       ├─ 是否含引用类型字段？ → class
    │       └─ 否 → struct（值语义、更安全）
```

### 1.4 枚举负载的命名约定

```cangjie
public enum OrderStatus {
    | Pending
    | Paid(amount: Float64, method: String)   // 命名负载
    | Shipped(trackingNumber: String)          // 清晰
}
```

命名负载让模式匹配更易读：

```cangjie
case Paid(amount, method) =>         // 不清晰
case Paid(amount: a, method: m) =>  // 清晰但冗长
```

---

## 2. 并发安全

### 2.1 "不共享可变状态"原则

```cangjie
// 反例：可变全局计数器
public var globalCounter: Int64 = 0

// 改进：封装在类中
public class Counter {
    private let mutex: Mutex
    private var value: Int64 = 0
    public func increment(): Unit { mutex.lock(); try { value++ } finally { mutex.unlock() } }
}
```

### 2.2 Channel > 共享内存

```cangjie
// 不好
class SharedBuffer {
    private var items: ArrayList<T>
    public func add(item: T): Unit { items.add(item) }   // 需要锁
}

// 好
let ch = Channel<T>()
spawn { ch.send(item) }
let item = ch.receive()
```

### 2.3 Future 异常处理

```cangjie
let f = spawn {
    if (badInput) {
        throw IllegalArgumentException("...")
    }
    return ok()
}

try {
    let result = f.get()
} catch (e: Exception) {
    logError(e)
}
```

**陷阱**：`Future.get()` 不在调用栈上，异常必须显式 `get()` 才能传播。

### 2.4 spawn 的资源生命周期

```cangjie
// 反例：忘记消费
let f = spawn { expensive() }
// 后续代码没调用 f.get()
// 协程可能未被调度

// 改进：要么 get，要么 detach
let f = spawn { expensive() }
// ... 之后必须 f.get() 或显式忽略
```

### 2.5 锁的粒度

```cangjie
// 反例：粗粒度锁，串行化一切
public class Service {
    private let lock: Mutex
    public func doA(): Unit { lock.lock(); ... }
    public func doB(): Unit { lock.lock(); ... }  // 与 doA 互斥
}

// 改进：分锁
public class Service {
    private let lockA: Mutex
    private let lockB: Mutex
}
```

### 2.6 死锁规避清单

- 锁的获取顺序：始终一致（A → B）。
- 不要在持锁时调用用户代码。
- 锁内不要做 IO。
- 优先用 `ReentrantMutex`（可重入）减少风险。

---

## 3. 资源管理

### 3.1 try-finally 模式

```cangjie
let stream = File.create(path)
try {
    stream.write(bytes)
} finally {
    stream.close()
}
```

### 3.2 资源包装类

```cangjie
public class Resource implements AutoCloseable {
    private var closed = false

    public func close(): Unit {
        if (!closed) {
            closed = true
            releaseNativeHandle()
        }
    }
}
```

### 3.3 不要在异常路径上漏资源

```cangjie
// 反例
let w = File.create(path)
w.write(data)
w.close()  // 如果 write 抛异常，close 不会执行

// 改进
let w = File.create(path)
try {
    w.write(data)
} finally {
    w.close()
}
```

---

## 4. 错误处理

### 4.1 自定义错误枚举

```cangjie
public enum ParseError {
    | UnexpectedToken(position: Int64, got: String)
    | UnexpectedEof(expected: String)
    | InvalidNumber(text: String)
}
```

**原则**：
- 错误类型描述 **调用方需要做的决定**，不是底层发生了什么。
- 携带足够上下文（位置、输入）。
- 用 `extend` 提供格式化方法。

### 4.2 错误传播模式

```cangjie
// 自定义 Result + mapErr 链
public func loadConfig(path: String): Result<Config, IoError> {
    let content = readFile(path)?                  // ? 运算符传播 Err
    let parsed = parseJson(content)?
    return Ok(parsed)
}
```

### 4.3 何时抛异常

| 场景 | 推荐 |
|------|------|
| 程序 bug（invariant violated） | 抛 |
| 不可恢复（OOM、stack overflow） | 抛 |
| 业务可预期的失败 | `Result` |
| "可能没有" | `Option` / `?T` |
| 用户输入校验失败 | 抛（带上下文） |

### 4.4 异常类层次

```cangjie
public open class AppException <: Exception {
    public let code: Int64
    public init(code: Int64, message: String) {
        super(message)
        this.code = code
    }
}

public class ValidationException <: AppException { ... }
public class NotFoundException <: AppException { ... }
public class AuthException <: AppException { ... }
```

---

## 5. API 设计

### 5.1 参数顺序：必填 → 命名/可选

```cangjie
public func fetch(
    url: String,                      // 必填
    method!: String = "GET",          // 命名 + 默认
    headers!: Map<String, String> = Map(),  // 命名 + 默认
    timeout!: Duration = Duration.second * 30
): Response { ... }
```

### 5.2 不要在函数中抛"业务异常"

```cangjie
// 反例
public func getUser(id: Int64): User {
    if (!exists(id)) {
        throw UserNotFoundException(...)  // 调用方被迫 try-catch
    }
    return ...
}

// 改进
public func getUser(id: Int64): ?User {  // 返回 Option
    if (!exists(id)) { return None }
    return Some(loadFromDb(id))
}
```

### 5.3 集合返回类型的选择

| API 返回 | 选择 |
|----------|------|
| 0 或 1 个 | `?T` |
| 0 或多个，关心顺序 | `Array<T>` |
| 0 或多个，不重复 | `HashSet<T>` |
| 延迟计算 | `() -> Iterator<T>` |

### 5.4 Builder 与流畅接口

```cangjie
public class RequestBuilder {
    public func url(s: String): RequestBuilder { this.url = s; return this }
    public func method(m: String): RequestBuilder { this.method = m; return this }
    public func header(k: String, v: String): RequestBuilder { ... }
    public func build(): Request { ... }
}

RequestBuilder()
    .url("https://api.example.com")
    .method("POST")
    .header("Content-Type", "application/json")
    .build()
```

### 5.5 扩展点的暴露

```cangjie
public interface Storage {
    func get(key: String): ?String
    func put(key: String, value: String): Unit
}

// 让用户注入自定义实现
public class Service {
    public init(private let storage: Storage) { ... }
}
```

---

## 6. 性能工程

### 6.1 选择合适的容器

| 操作 | Array | ArrayList | HashMap | HashSet |
|------|-------|-----------|---------|---------|
| 索引 | O(1) | O(1) | - | - |
| 末尾添加 | - | O(1) 均摊 | - | - |
| 头部添加 | - | O(n) | - | - |
| 查找 | O(n) | O(n) | O(1) 均摊 | O(1) 均摊 |
| 包含 | O(n) | O(n) | O(1) | O(1) |

### 6.2 字符串构建

```cangjie
// 反例：N 次字符串拼接产生 N 个临时 String
var s = ""
for (i in 0..10000) { s += "${i}" }

// 改进
let sb = StringBuilder()
for (i in 0..10000) { sb.append("${i}") }
let s = sb.toString()
```

### 6.3 避免装箱

```cangjie
// 反例：泛型 + 值类型导致装箱
let list = ArrayList<Any>()
list.add(42)
list.add("hello")

// 改进：单一类型容器
let ints = ArrayList<Int64>()
let strs = ArrayList<String>()
```

### 6.4 并行化热路径

```cangjie
public func processBatch(items: Array<T>): Array<R> {
    let n = items.size
    let chunkSize = (n + 7) / 8   // 8 核
    var futures = ArrayList<Future<Array<R>>>()
    var start = 0
    while (start < n) {
        let end = min(start + chunkSize, n)
        let slice = items[start..end]
        let f = spawn { slice.map(process) }
        futures.add(f)
        start = end
    }
    // 合并
}
```

### 6.5 避免不必要的拷贝

```cangjie
// 反例：传递大 struct
public func process(p: BigStruct): Unit { ... }

// 改进：传引用
public func process(p: BigStruct): Unit { ... }  // class
// 或者使用 inout 参数
```

---

## 7. 可测试性

### 7.1 依赖注入

```cangjie
public class UserService {
    private let db: Database
    private let cache: Cache

    public init(db: Database, cache: Cache) {
        this.db = db
        this.cache = cache
    }

    public func getUser(id: UserId): ?User {
        match (cache.get(id)) {
            case Some(u) => return Some(u)
            case None => return db.findUser(id)
        }
    }
}

// 测试
let fakeDb = FakeDatabase()
let fakeCache = FakeCache()
let service = UserService(fakeDb, fakeCache)
```

### 7.2 避免单例

单例难测试。改用：

```cangjie
// 通过 context 或 init 注入
public class App {
    private let service: UserService
    public init() {
        let db = PostgresDatabase(env("DB_URL"))
        let cache = RedisCache(env("REDIS_URL"))
        this.service = UserService(db, cache)
    }
}
```

### 7.3 测试边界条件

```cangjie
@TestCase func testEmpty() { @Assert(parse("") == empty) }
@TestCase func testSingle() { @Assert(parse("a") == single("a")) }
@TestCase func testMany() { @Assert(parse("a,b,c").size == 3) }
@TestCase func testBoundary() { @Assert(parse(",a,").size == 1) }  // 边界
@TestCase func testInvalid() { /* 异常路径 */ }
```

### 7.4 属性测试（Property-based）

```cangjie
@TestCase func testReverseIdempotent(): Unit {
    for (s in randomStrings(100)) {
        @Assert(s.reverse().reverse() == s)
    }
}
```

---

## 8. 代码风格

### 8.1 命名

| 类型 | 风格 | 例 |
|------|------|------|
| 类型（class/struct/enum/interface） | PascalCase | `UserService`, `OrderStatus` |
| 函数 / 方法 | camelCase | `findUser`, `parseJson` |
| 变量 / 参数 | camelCase | `userName`, `maxRetry` |
| 常量 | SCREAMING_SNAKE | `MAX_RETRY`, `DEFAULT_TIMEOUT` |
| 包 | 全小写 | `cangjie_learning.io_filesystem` |

### 8.2 注释与文档

```cangjie
/// 计算向量点积
///
/// # 参数
/// - `a`: 第一个向量
/// - `b`: 第二个向量
///
/// # 返回
/// 点积结果
///
/// # 示例
/// ```
/// dot(Vec2(1, 2), Vec2(3, 4))  // 11
/// ```
public func dot(a: Vec2, b: Vec2): Float64 {
    return a.x * b.x + a.y * b.y
}
```

### 8.3 缩进与格式

- 4 空格缩进（不要 Tab）。
- 行长 < 120 字符。
- 运算符两侧加空格。
- 逗号后加空格。
- 类型注解与冒号紧贴变量名。

### 8.4 文件组织

```cangjie
// 1. 文件注释
// 2. package 声明
// 3. import（按字母顺序）
// 4. 顶层常量
// 5. 顶层类型定义
// 6. 顶层函数
```

---

## 9. 调试与诊断

### 9.1 结构化日志

```cangjie
public enum LogLevel { Debug | Info | Warn | Error }

public class Logger {
    public func log(level: LogLevel, msg: String, context: Map<String, String>): Unit {
        let ts = DateTime.now().toString()
        let kv = context.toString()
        println("[${ts}] [${level}] ${msg} ${kv}")
    }
}

Logger.log(LogLevel.Info, "user created", {"userId": "123", "source": "api"})
```

### 9.2 性能测量

```cangjie
public func measure<T>(label: String, f: () -> T): T {
    let start = DateTime.now()
    let result = f()
    let elapsed = DateTime.now() - start
    println("${label}: ${elapsed}")
    return result
}
```

### 9.3 断言

```cangjie
public func pop(): T {
    if (isEmpty()) {
        throw IllegalStateException("栈为空")  // 不变量违例
    }
    return ...
}
```

### 9.4 常见运行时问题排查

| 症状 | 可能原因 |
|------|----------|
| 协程卡住 | 死锁 / Channel 空等 |
| 内存增长 | 静态字段累积 / 闭包持有大对象 |
| 性能下降 | 泛型装箱 / 锁竞争 |
| 异常未捕获 | spawn 内 throw 未 .get() |

---

## 附录：反模式速查

| 反模式 | 改进 |
|--------|------|
| `var` 全局变量 | 封装在类中 |
| `class` 当 struct 用 | 改用 struct |
| `Exception` 当控制流 | 用 Result |
| 裸 `Any` | 用 enum + 泛型 |
| 100+ 行函数 | 拆分 |
| 嵌套 4+ 层 | 早返回 / 卫语句 |
| 命名 `data`, `temp`, `x` | 用领域名词 |
| magic number `42` | `const MAX_RETRIES = 42` |
| 单例状态全局可变 | 依赖注入 |
| 闭包捕获循环变量 | 显式传值 |
| `ArrayList` 头部插入 | `LinkedList` 或反转后追加 |
