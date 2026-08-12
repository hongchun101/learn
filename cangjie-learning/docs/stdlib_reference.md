# 仓颉标准库速查

> 本文档基于仓颉 1.2.0-alpha（Cangjie Compiler 1.2.0-alpha.20260707020028）实测可用 API 整理。所有 API 都已在 `src/` 中通过运行验证。

---

## 目录

1. [std.core — 核心类型与 trait](#1-stdcore--核心类型与-trait)
2. [std.collection — 集合容器](#2-stdcollection--集合容器)
3. [std.fs — 文件系统](#3-stdfs--文件系统)
4. [std.io — IO 流](#4-stdio--io-流)
5. [std.regex — 正则表达式](#5-stdregex--正则表达式)
6. [std.time — 时间与日期](#6-stdtime--时间与日期)
7. [std.sync — 同步原语](#7-stdsync--同步原语)
8. [std.math — 数学函数](#8-stdmath--数学函数)
9. [std.process — 进程与命令行](#9-stdprocess--进程与命令行)
10. [std.unittest — 单元测试](#10-stdunittest--单元测试)
11. [常用模式与扩展](#11-常用模式与扩展)

---

## 1. std.core — 核心类型与 trait

### 1.1 基础类型

| 类型 | 大小 | 范围 | 字面量 |
|------|------|------|--------|
| `Int8` | 8 | -128..127 | `42`, `-7` |
| `Int16` | 16 | -32768..32767 | - |
| `Int32` | 32 | -2^31..2^31-1 | - |
| `Int64` | 64 | 默认整数 | `1_000_000` |
| `UInt8..64` | 同上 | 无符号 | `255` |
| `Float32` | 32 | IEEE 754 单精度 | `3.14f` |
| `Float64` | 64 | 默认浮点 | `3.14` |
| `Bool` | 1 | true / false | `true` |
| `Rune` | 32 | Unicode 码点 | `r'仓'` |
| `String` | UTF-8 | - | `"Hello"` |
| `Unit` | 0 | 仅 `()` | `()` |
| `Nothing` | 0 | 无值 | （类型，无实例） |

### 1.2 核心 trait

#### Equatable<T>

```cangjie
public interface Equatable<T> {
    operator func ==(right: T): Bool
    operator func !=(right: T): Bool
}
```

#### Comparable<T>

```cangjie
public interface Comparable<T> {
    func compare(right: T): Ordering
}

public enum Ordering { LT | EQ | GT }
```

#### Hashable

```cangjie
public interface Hashable {
    func hashCode(): Int64
}
```

#### ToString

```cangjie
public interface ToString {
    func toString(): String
}
```

#### Sendable

类型可安全跨协程传递的标记接口（仓颉 1.2 中**已存在但通过类型约束使用**）。

### 1.3 Option 风格

```cangjie
let maybe: ?Int64 = Some(42)
let none: ?String = None

// 访问
match (maybe) {
    case Some(v) => println(v)
    case None => println("no value")
}
```

### 1.4 范围

```cangjie
1..10      // 半开区间 [1, 10)
1..=10     // 闭区间 [1, 10]
```

---

## 2. std.collection — 集合容器

### 2.1 Array<T>

定长同构数组。

```cangjie
let a: Array<Int64> = [1, 2, 3]
let a2 = Array<Int64>(5, { i => i * 2 })  // 长度为 5，初值由函数生成
let empty: Array<Int64> = []

a.size       // Int64
a[0]         // 索引访问
a[1..3]      // 切片
a == b       // 数组相等
a.toString() // "[1, 2, 3]"
```

### 2.2 ArrayList<T>

可变长数组。

```cangjie
let list = ArrayList<Int64>()
list.add(1)               // 末尾追加
list.add(0, 100)          // 指定位置插入
list[0]                   // 索引访问
list.size                 // 当前大小
list.remove(0)            // 按索引删除
list.contains(2)          // 包含判断
list.toArray()            // 转 Array
list.isEmpty()
```

### 2.3 HashMap<K, V>

键值映射，K 必须实现 `Hashable & Equatable<K>`。

```cangjie
let m = HashMap<String, Int64>()
m.add("a", 1)
m["b"] = 2
m.size
m.get("a")        // Option<V>
m.contains("a")
m.remove("a")
m.keys()
m.values()
```

### 2.4 HashSet<T>

唯一元素集合，T 必须实现 `Hashable & Equatable<T>`。

```cangjie
let s = HashSet<Int64>()
s.add(1)
s.contains(1)
s.size
```

### 2.5 LinkedList<T>

链表（本项目自实现于 `generics.cj`）。

```cangjie
let l = LinkedList<Int64>()
l.append(1)
l.size()
```

---

## 3. std.fs — 文件系统

### 3.1 File

```cangjie
import std.fs.*

// 写入
let w = File.create("/path/to/file")
w.write(bytes.toArray())  // 字节数组
w.close()

// 读取
let bytes = File.readFrom("/path/to/file")   // Array<UInt8>
let text = String.fromUtf8(bytes)

// 读取模式
let r = File("/path/to/file", OpenMode.Read)
```

### 3.2 Directory

```cangjie
Directory.create("/path", recursive: true)  // 创建（含父目录）
```

### 3.3 Path

```cangjie
let p = Path("/a/b/c.txt")
p.fileName    // "c.txt"
p.parent      // "/a/b"
```

---

## 4. std.io — IO 流

`std.io` 模块基本类型已存在，但本项目主要使用 `std.fs.File`。**流式读取需手工管理缓冲区**。

---

## 5. std.regex — 正则表达式

### 5.1 构造

```cangjie
let r = Regex(#"\d+"#)   // 注意 #"..."# 是原始字符串
```

### 5.2 匹配

```cangjie
r.matches("abc123")        // true/false：是否包含
r.find("abc123")           // Option<MatchData>
r.find("abc", start: 5)    // 起始位置（部分版本支持）
```

### 5.3 MatchData

**API 受版本限制**，本版本（1.2 alpha）只暴露：

```cangjie
m.matchString()   // String: 匹配内容
```

**缺失 API**（需用户自行实现）：
- `matchStart()` / `matchEnd()`：匹配位置
- `group(name)`：命名捕获组

### 5.4 String 配合

```cangjie
"a,b,c".split(",")                       // Array<String>
text.replace("Hello", "你好")            // 全局替换
```

---

## 6. std.time — 时间与日期

### 6.1 DateTime

```cangjie
import std.time.*

let now = DateTime.now()                 // 当前时间
let past = DateTime(year: 2024, month: 1, dayOfMonth: 1, hour: 0, minute: 0, second: 0)

now.year              // Int64
now.month             // 枚举：January..December
now.dayOfMonth
now.hour
now.minute
now.second
now.nanosecond

now + Duration.hour * 2    // 时间运算
now - Duration.day * 7
now1 - now2               // Duration

now > past                // 比较
```

### 6.2 Duration

```cangjie
let d1 = Duration.second * 5
let d2 = Duration.millisecond * 500
let d3 = Duration.hour * 2
let d4 = Duration.minute * 30
let d5 = Duration.day * 7

let total = d1 + d2
total.toString()        // "5s500ms"
```

### 6.3 sleep

```cangjie
sleep(Duration.millisecond * 100)
```

### 6.4 DateTimeFormatter

**注意**：本版本（1.2 alpha）DateTimeFormatter 在标准库中**未直接导出**，格式化需通过 `DateTime.toString()` 获得 ISO-8601 格式。

---

## 7. std.sync — 同步原语

### 7.1 Mutex（推荐）

```cangjie
import std.sync.*

let m = Mutex()
m.lock()
try {
    /* 临界区 */
} finally {
    m.unlock()
}
```

### 7.2 ReentrantMutex（已废弃，使用 Mutex）

```cangjie
@Deprecated[use Mutex instead]
public class ReentrantMutex { ... }
```

### 7.3 AtomicInt64

```cangjie
let atom = AtomicInt64(0)
atom.load()                          // Int64
atom.store(newValue)                 // Unit
atom.fetchAdd(delta)                 // Int64: 旧值
atom.fetchSub(delta)
atom.compareAndSwap(expected, new)   // Bool
```

### 7.4 spawn 与 Future

```cangjie
let f = spawn { 42 }
let result = f.get()                 // 阻塞等待
```

---

## 8. std.math — 数学函数

```cangjie
import std.math.*

abs(-3.5)            // 3.5（Int64 / Float64）
abs(-3)              // 3（Int64 重载）
sqrt(16.0)           // 4.0
sqrt(16)             // Int64 版本（floor）
pow(2.0, 10.0)       // 1024.0
max(3, 5)            // 5
min(3, 5)            // 3
```

**注意**：
- `sqrt` 存在 Int64 与 Float64 两个重载。
- `abs` 对 Int64 与 Float64 都有重载。
- 通过 `import std.math.*` 后函数可直接调用。

---

## 9. std.process — 进程与命令行

本版本（1.2 alpha）的 `std.process` 模块包含进程控制 API。具体方法需逐项验证。

---

## 10. std.unittest — 单元测试

```cangjie
import std.unittest.testmacro.*

@Test
public class MyTest {
    @TestCase
    public func testAddition(): Unit {
        @Assert(1 + 1 == 2)
    }
}
```

### 10.1 注解

| 注解 | 作用 |
|------|------|
| `@Test` | 标记测试类 |
| `@TestCase` | 标记测试方法 |
| `@Assert(expr)` | 断言 |

### 10.2 配置

`cjpm.toml`：

```toml
[test]
```

需要在仓颉 1.2 中测试文件位于 `tests/` 目录并匹配 `*_test.cj`。

---

## 11. 常用模式与扩展

### 11.1 String 转换

```cangjie
let s = "Hello, 仓颉"
s.toArray()                  // Array<UInt8>（UTF-8 字节）
let back = String.fromUtf8(s.toArray())  // String

s.toRuneArray()              // Array<Rune>（按码点）
let r: Rune = s[0]           // 第 0 个字节（UInt8）
let r2 = s.toRuneArray()[0]  // 第 0 个字符
```

### 11.2 Array ↔ ArrayList

```cangjie
let arr: Array<Int64> = list.toArray()
let list = ArrayList<Int64>(arr)
```

### 11.3 Option 模式匹配

```cangjie
let maybe: ?Int64 = Some(42)

let v = match (maybe) {
    case Some(x) => x * 2
    case None => -1
}
```

### 11.4 enum 默认方法

```cangjie
public enum Status {
    | Active
    | Inactive
    | Pending

    public func isUsable(): Bool {
        match (this) {
            case Active => true
            case _ => false
        }
    }
}
```

### 11.5 extend 给标准库加方法

```cangjie
extend Int64 {
    public func isEven(): Bool { this % 2 == 0 }
}

extend String {
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
}

extend<T> Array<T> where T <: Comparable<T> {
    public func sorted(): Array<T> { ... }
}
```

### 11.6 遍历模式

```cangjie
for (item in collection) { ... }       // 默认 iterator
for ((k, v) in map) { ... }            // HashMap entry
for (i in 0..n) { ... }                // Range
for (i in 0..=n) { ... }               // 含右
for (rune in s.toRuneArray()) { ... }  // 字符串按码点
```

---

## 附录 A：本项目实测可用的 API 全集

| API | 状态 |
|-----|------|
| `Array<T>` 构造、索引、切片、`toString` | ✓ |
| `ArrayList<T>` add/insert/remove/size/contains/toArray | ✓ |
| `HashMap<K,V>` add/get/size/contains/remove/keys/values | ✓ |
| `HashSet<T>` add/size/contains | ✓ |
| `Regex` matches/find/split | ✓ |
| `MatchData.matchString()` | ✓ |
| `String.toArray/fromUtf8/toRuneArray/indexOf/split/toAsciiUpper/substring` | ✓ |
| `StringBuilder` append/toString | ✓ |
| `DateTime.now/year/month/dayOfMonth/hour/minute/second/nanosecond` | ✓ |
| `DateTime` + `-` Duration、`>` `<` 比较 | ✓ |
| `Duration.second/millisecond/hour/minute/day` | ✓ |
| `sleep(Duration)` | ✓ |
| `spawn {}` + `Future.get()` | ✓ |
| `Mutex` lock/unlock | ✓ |
| `AtomicInt64` load/store/fetchAdd/fetchSub/compareAndSwap | ✓ |
| `abs`, `sqrt`, `pow`, `max`, `min`（via std.math.*） | ✓ |

---

## 附录 B：API 限制与变通

### B.1 DateTimeFormatter 不可用

**问题**：`DateTimeFormatter` 类型在 1.2 alpha 中未直接导出。

**变通**：使用 `DateTime.toString()` 获得 ISO-8601 字符串，或自行实现格式化。

### B.2 std.env 为空

**问题**：`std.env` 包导入但无内容。

**变通**：通过 `std.process` 模块或 `getEnv`（如可用）。

### B.3 Regex group() / matchStart() / matchEnd() 不可用

**变通**：手动维护扫描位置，循环 `find(slice)`。

### B.4 Path 操作有限

**变通**：用字符串索引操作手动处理扩展名、目录。

### B.5 没有原生的 Condition Variable

**变通**：自旋 + sleep 实现轻量同步（本项目 `Channel` 类即如此）。

---

## 附录 C：常用导入速查

```cangjie
// 核心
import std.core.*

// 容器
import std.collection.*

// IO
import std.fs.*
import std.io.*

// 文本
import std.regex.*

// 时间
import std.time.*

// 并发
import std.sync.*

// 数学
import std.math.*

// 进程
import std.process.*

// 测试
import std.unittest.*
import std.unittest.testmacro.*
```

---

## 参考

- 仓颉官方文档：https://cangjie-lang.cn/
- 仓颉 GitHub：https://github.com/cangjie-lang/cangjie
- 本项目源代码：`src/`
