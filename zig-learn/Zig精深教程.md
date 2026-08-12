# Zig 精深教程：从入门到技术专家

> **目标读者**：已掌握至少一门系统级语言（C/C++/Rust/Go），希望系统、深入地掌握 Zig 0.16.x（2026 年 4 月发布）的工程师
> **目标深度**：学完后能在生产环境中独立设计并交付 Zig 项目，能阅读和修改 Zig 标准库源码，能精确解释 Zig 各语言特性的 ABI 与类型系统含义，能就 Zig 的设计取舍与同行展开专业讨论
> **范围**：编译器 0.16.0 及以上、官方标准库 `std`、构建系统、并发模型、SIMD、内联汇编、C 互操作、调试与性能
> **风格**：每一章都给出"为什么这样设计 + 怎样用 + 常见陷阱 + 专家级心智模型"，并配以可运行/可编译的代码片段

---

## 目录

- [第 0 章 前言与学习路线图](#第-0-章-前言与学习路线图)
- [第 1 章 工具链与第一个程序](#第-1-章-工具链与第一个程序)
- [第 2 章 语法骨架与词法结构](#第-2-章-语法骨架与词法结构)
- [第 3 章 值、类型与内存模型](#第-3-章-值类型与内存模型)
- [第 4 章 函数、错误与控制流](#第-4-章-函数错误与控制流)
- [第 5 章 指针、数组、切片与字符串](#第-5-章-指针数组切片与字符串)
- [第 6 章 结构体、联合、枚举与标记联合](#第-6-章-结构体联合枚举与标记联合)
- [第 7 章 可选类型、错误联合与错误集合](#第-7-章-可选类型错误联合与错误集合)
- [第 8 章 编译期与元编程](#第-8-章-编译期与元编程)
- [第 9 章 泛型编程与类型擦除](#第-9-章-泛型编程与类型擦除)
- [第 10 章 高级类型操作](#第-10-章-高级类型操作)
- [第 11 章 反射：`@typeInfo` 与内置函数全解](#第-11-章-反射typeinfo-与内置函数全解)
- [第 12 章 内联汇编与原子操作](#第-12-章-内联汇编与原子操作)
- [第 13 章 分配器与内存管理](#第-13-章-分配器与内存管理)
- [第 14 章 文件系统与 I/O 接口](#第-14-章-文件系统与-io-接口)
- [第 15 章 网络与异步 I/O](#第-15-章-网络与异步-io)
- [第 16 章 构建系统与包管理](#第-16-章-构建系统与包管理)
- [第 17 章 与 C 互操作](#第-17-章-与-c-互操作)
- [第 18 章 SIMD 向量化编程](#第-18-章-simd-向量化编程)
- [第 19 章 测试、调试与性能分析](#第-19-章-测试调试与性能分析)
- [第 20 章 高级主题与惯用法](#第-20-章-高级主题与惯用法)
- [附录 A 内置函数速查](#附录-a-内置函数速查)
- [附录 B 错误集合与常见错误码](#附录-b-错误集合与常见错误码)
- [附录 C `std.builtin` 关键结构体参考](#附录-c-stdbuiltin-关键结构体参考)
- [附录 D 术语表 / 索引](#附录-d-术语表--索引)

---

## 第 0 章 前言与学习路线图

### 0.1 Zig 是什么

Zig 是一门**通用系统编程语言及配套工具链**，由 Zig Software Foundation（501(c)(3) 非营利组织）主导开发。它的目标是打造"健壮（Robust）、最优（Optimal）、可复用（Reusable）"的软件 —— 简言之 ROR 原则。Zig 同时具备：

- **明确的手动内存管理**：无隐藏分配、无 GC 暂停、无引用计数。分配器是显式注入的接口。
- **编译期求值（comptime）**：类型与值在同一阶段被求值，可以读写 AST、生成新类型、解析任意输入。
- **一等公民的 C 互操作**：可以直接 `extern` C 头、用 C 调用约定导出符号、无 FFI 包装层。
- **小巧但精密的类型系统**：可选类型、错误联合、标记联合与切片共同构成强表达力的代数数据类型。
- **跨平台工具链**：`zig cc`、`zig c++` 可作为 drop-in 替代 Clang，并自带 libc、glibc、musl、MinGW。

### 0.2 为什么 Zig 与众不同

把 Zig 放在坐标系里看：

| 维度 | C | C++ | Rust | Go | **Zig** |
|------|---|-----|------|----|----|
| 内存管理 | 手动 | 手动/智能指针 | 所有权 + 借用 | GC | 显式分配器（依赖注入） |
| 元编程 | 宏/模板 | 模板/constexpr | 过程宏 | go generate | comptime（执行任意 Zig 代码） |
| 类型安全 | 弱 | 中 | 强 | 强 | 强（无隐式转换） |
| 隐藏控制流 | 无 | RAII/dtor | Drop | goroutine | 无（`defer` 显式且本地） |
| 编译到机器码 | 是 | 是 | 是 | 否 | 是 |
| C 互操作 | 自身 | 自身 | FFI | cgo | **与 C 同 ABI** |
| 编译速度 | 快 | 慢 | 慢 | 中 | 中（增量编译可用） |

Zig 拒绝"零成本抽象 + 隐式机制"的双重套路：它把控制流、内存、错误三件事全部显式化，再用 `comptime` 让你能写"看起来像运行时"的代码，但被静态求值。

### 0.3 学习路线图

按心智模型分阶段，建议每阶段耗时：

```mermaid
flowchart LR
  A[阶段 1<br>语法与值类型<br>1-2 天] --> B[阶段 2<br>指针/切片/字符串<br>1-2 天]
  B --> C[阶段 3<br>错误/可选/联合<br>1-2 天]
  C --> D[阶段 4<br>comptime 元编程<br>3-5 天]
  D --> E[阶段 5<br>分配器与 I/O<br>2-3 天]
  E --> F[阶段 6<br>构建系统与 C 互操作<br>2-3 天]
  F --> G[阶段 7<br>SIMD/汇编/原子<br>2-3 天]
  G --> H[阶段 8<br>阅读 std 源码<br>持续]
```

每个阶段末尾有"自检问题"清单；只有全部答出才能进入下一阶段。

### 0.4 本教程约定的 Zig 版本

- 编译器：**Zig 0.16.0**（2026 年 4 月 14 日发布，引入 `std.Io` 接口、`@Type` 拆分为 `@Int/@Struct/@Pointer/...` 等）
- 标准库：`std` HEAD 与 0.16.0 对齐
- 平台：默认 `x86_64-linux-gnu`（Tier 1）；大部分代码可在 Tier 2 目标上直接编译

本教程不会规避 0.16 的破坏性变更。如果某段代码明确依赖 0.15 行为，会注明。

### 0.5 阅读方式

代码片段中会使用以下约定：

```zig
// 行内注释
const x: u32 = 42;  // 示例如常量
```

⚠️ **陷阱标记**：描述常见但隐蔽的踩坑；
🧠 **专家心智模型**：高度概括以建立直觉；
✅ **OK 习惯** 与 ❌ **反模式** 标记推荐与不推荐写法。

---

## 第 1 章 工具链与第一个程序

### 1.1 安装

Zig 0.16 提供官方二进制：`zig-linux-x86_64-0.16.0.tar.xz` 等。下载后解压即可使用，无需 root：

```bash
wget https://ziglang.org/download/0.16.0/zig-linux-x86_64-0.16.0.tar.xz
tar xf zig-linux-x86_64-0.16.0.tar.xz
export PATH=$PWD/zig-linux-x86_64-0.16.0:$PATH
zig version      # 0.16.0
```

`zig` 单文件既是编译器、链接器、汇编器、C 编译器、文档生成器，也是构建脚本解释器。

### 1.2 第一个程序

新建 `hello.zig`：

```zig
const std = @import("std");

pub fn main() void {
    std.debug.print("Hello, {s}!\n", .{"world"});
}
```

```bash
zig run hello.zig
# Hello, world!
```

**逐行解读**：

- `const std = @import("std");` —— `@import` 是编译期内置函数；"标准库"也是一个普通 Zig 源文件，由编译器通过特殊路径解析。
- `pub fn main() void` —— `main` 是约定的入口点；签名必须是 `fn() void` 或 `fn() !void`（0.16 也支持 `fn(std.process.Init) !void`，见 14 章）。
- `std.debug.print` —— 把格式化字符串写入 `stderr`（仿真 `dbg` 风格，与 `std.Io.Writer` 无关）。
- `.{"world"}` —— **匿名结构体字面量（tuple-like）**，可作为可变参数传入，因为 `print` 的最后一个参数是 `anytype`（即类型推导参数）。

### 1.3 编译模型

`zig run` 把"编译 → 链接 → 运行"一步完成；调试时用 `zig build-exe hello.zig && ./hello` 反而更快。常用子命令：

| 子命令 | 用途 |
|--------|------|
| `zig run FILE` | 编译运行单个 Zig 源（含裸 main） |
| `zig build-exe FILE` | 编译为可执行文件 |
| `zig build-lib FILE` | 编译为静态/动态库 |
| `zig build-obj FILE` | 编译为目标文件 |
| `zig test FILE` | 运行文件中所有 `test "..."` 块 |
| `zig fmt FILE` | 格式化 |
| `zig ast-check FILE` | 仅做语法检查，不做语义分析 |
| `zig zen` | 打印禅（隐喻） |
| `zig targets` | 列出所有支持目标 |
| `zig cc` | 作为 Clang 替代品 |
| `zig c++` | 作为 Clang++ 替代品 |
| `zig build` | 跑 `build.zig`，执行内含 step |
| `zig build test` | 跑测试 step |
| `zig build install` | 安装到 `--prefix` |
| `zig build uninstall` | 卸载 |
| `zig build run` | 跑 run step |

### 1.4 编译模式（Optimize）

默认 build-exe 是 `Debug`。Zig 有四种 build mode：

| Mode | 优化 | 安全检查 | 用途 |
|------|------|----------|------|
| `Debug` | 关闭 | 全开 | 开发 |
| `ReleaseSafe` | 开 | 开 | 优化但保留安全 |
| `ReleaseFast` | 开 | 关 | 极致性能 |
| `ReleaseSmall` | 体积优先 | 关 | 嵌入式/Wasm |

```bash
zig build-exe -O ReleaseFast hello.zig
```

🧠 **专家心智模型**：Zig 的运行时安全检查（整数溢出、切片越界、断言）只在 *Release* 之外开启；调试时 0.16 还会把未初始化内存填 `0xaa`（heap 上的未初始化字节），让你能在调试器里一眼看出"野指针"。

### 1.5 交叉编译

Zig 最强大的特性之一：任意 target 之间的交叉编译**不需要额外工具链**。

```bash
zig build-exe -target aarch64-macos hello.zig
zig build-exe -target wasm32-freestanding hello.zig
zig build-exe -target x86_64-windows-gnu hello.zig
```

格式是 `-target <arch>-<os>-<abi>`。可用 `zig targets` 查看完整矩阵。

✅ **OK 习惯**：在 CI 中构建多平台产物时只用 `zig build -Dtarget=...`，不要在不同平台安装不同工具链。

### 1.6 编辑器

最成熟的是 **ZLS**（Zig Language Server）：

```bash
# 在 build.zig.zon 里
.dependencies = .{
    .zls = .{ .url = "https://github.com/zigtools/zls/archive/refs/tags/0.16.0.tar.gz", .hash = "..." },
},
```

构建：`zig build zls_exe`。ZLS 把 `zig ast-check` 暴露成 LSP 后端，所有 IDE 都能用。

### 1.7 本章自检

1. `zig run` 与 `zig build-exe` + 执行的区别是什么？性能差异为何？
2. 四种 build mode 在哪些场景使用？
3. 为什么 Zig 内置 libc/musl 就能交叉编译？

---

## 第 2 章 语法骨架与词法结构

### 2.1 词法基础

Zig 源文件是 UTF-8 文本。词法记号：

- **标识符**：必须以字母或下划线开头，后续可含字母、数字、下划线。**不区分大小写**标识符（如 `@cImport` 与 `@cimport` 视为同一）。
- **关键字**：`const`、`var`、`fn`、`if`、`else`、`for`、`while`、`switch`、`return`、`break`、`continue`、`defer`、`errdefer`、`try`、`catch`、`throw`、`async`、`await`、`suspend`、`resume`、`cancel`、`unreachable`、`asm`、`test`、`pub`、`usingnamespace`、`export`、`extern`、`inline`、`noinline`、`comptime`、`noalias`、`volatile`、`allowzero`、`linksection`、`callconv`、`orelse`。
- **字符串字面量**：`"hello"`（普通）、`\\hello`（多行）、`\\<tag>\\hello`（带 tag 的多行）。
- **字符字面量**：用单引号，如 `'A'`（在 0.16 中字符字面量就是 `u8`）。
- **数字字面量**：`123` 是 `comptime_int`；`123_u8`、`0xFF_u16`、`0b1010`、`0o777`、`1_000_000` 都可。
- **注释**：`//` 行内、`/* ... */` 块、`///` 文档（被 `zig build` 收集）、`//!` 模块级文档。

### 2.2 文件结构

```zig
//! 模块级文档

const std = @import("std");
const Allocator = std.mem.Allocator;

const internal = @import("internal.zig");  // 相对路径

pub const VERSION: u32 = 0x0010_0000;

pub fn main() !void {
    try std.io.getStdOut().writeAll("ok\n");
}

test "smoke" {
    try std.testing.expect(true);
}
```

要点：
- `pub` 控制可见性，**默认私有**。
- 顶层声明顺序无所谓（Zig 是按 **decl 依赖图** 求值，而非像 C 那样按行）。
- `test` 块是顶层声明，像函数一样可被 `zig test` 发现。

### 2.3 表达式与语句

Zig 几乎没有"语句 vs 表达式"的区分 —— 所有表达式都有值（`if`、`switch`、`block` 都返回最后一个表达式的值）：

```zig
const x: u32 = if (cond) 1 else 2;
const y = blk: {
    const a = 1;
    const b = 2;
    break :blk a + b;  // named block
};
```

🧠 **专家心智模型**：Zig 的"block 表达式"是它消除 C++ 中大量 `IIFE`（立即调用表达式）的关键武器——任何你需要临时局部作用域的地方都可以 `blk: { ...; break :blk value; }`。

### 2.4 标识符与命名

Zig 推荐 `snake_case` 用于变量/函数，`PascalCase` 用于类型，`SCREAMING_SNAKE_CASE` 用于编译期常量。私有声明（无 `pub`）可以用下划线开头表示"故意未使用"。

### 2.5 编译期包导入

`@import` 既能导入文件、目录（取 `mod.zig` 或者 `package.zig`），也能导入"build artifact"（来自 `build.zig` 的 module）。这是动态模块化机制：

```zig
const build_mod = @import("build_options");  // 由 build.zig 通过 --mod 生成
```

### 2.6 本章自检

1. 为什么 `if` 可以作为右值？
2. `///` 文档注释与 `//` 普通注释在工具链中分别起什么作用？
3. Zig 与 C 在源文件求值顺序上有什么根本差异？

---

## 第 3 章 值、类型与内存模型

### 3.1 值的两大类：编译期 vs 运行时

Zig 把所有值分为：

- **编译期已知值（comptime-known）**：类型、整数字面量、字符串字面量、`@import` 的结果等。
- **运行时值**：函数参数、运行时变量、`alloc` 出来的内存等。

```zig
const x: comptime_int = 5;            // 编译期
var y: u32 = 5;                        // 运行时
const z = comptime blk: {              // 强制求值
    break :blk fib(20);                // fib 必须在编译期可求值
};
```

🧠 **专家心智模型**：Zig 没有"两种语言"（C++ 模板与运行时），但**有两条求值路径**：一条编译期，一条运行期。`comptime` 关键字是两者之间的桥梁。

### 3.2 类型

Zig 类型分为：

| 类别 | 示例 |
|------|------|
| 整数 | `u8`, `i64`, `usize` |
| 浮点 | `f16`, `f32`, `f64`, `f80`, `f128` |
| 布尔 | `bool` |
| 指针 | `*T`, `*const T`, `*volatile T`, `*[N]T` |
| 数组 | `[N]T`, `[N:sentinel]T` |
| 切片 | `[]T`, `[]const T` |
| 字符串 | `[]const u8`（字面量类型） |
| 元组 | `struct { u32, f64 }` |
| 结构体 | `struct { ... }` |
| 标记联合 | `union(enum) { ... }` |
| 裸联合 | `union { ... }` |
| 枚举 | `enum { ... }` |
| 可选 | `?T` |
| 错误联合 | `E!T` |
| 错误集合 | `error{A, B}` |
| 函数 | `fn(T) U` |
| void | `void` |
| noreturn | `noreturn` |
| 类型 | `type` |
| comptime | `comptime_int`, `comptime_float` |
| 任意 | `anytype` |

⚠️ **陷阱**：Zig 中**没有隐式数值转换**。`u8` 不能直接赋给 `u16`；`u32` 也不能直接和 `enum` 比。所有转换必须显式使用 `@as`、`@intCast` 等。

### 3.3 整数

Zig 的整数类型：

| 类型 | 范围 |
|------|------|
| `u8`/`i8` | 0..255 / -128..127 |
| `u16`/`i16` | 0..65535 / -32768..32767 |
| `u32`/`i32` | 32-bit |
| `u64`/`i64` | 64-bit |
| `u128`/`i128` | 128-bit |
| `usize`/`isize` | 平台相关（64-bit 平台 8 字节） |
| `c_int`/`c_uint` | 平台 C int（通常是 32 位） |
| `c_long`/`c_ulong` | 平台 C long |
| `comptime_int` | 任意精度整数（仅编译期） |

🧠 **专家心智模型**：把 `usize` 看作"指针同宽无符号整数"——任何表示"长度、索引、字节计数"的量都应该是 `usize`。`u32` 等定宽类型用于协议字段、外设寄存器、文件格式。

### 3.4 浮点

`f16`、`f32`、`f64`、`f80`、`f128`、`c_longdouble`（平台相关）。无半精度算术运算时 `f16` 自动提升为 `f32`。

### 3.5 布尔

`true` 和 `false`，内存中 1 字节。判断 `if (x)` 只接受 `bool`（不接受 `i32`）—— 这避免了大量 C 中的赋值笔误（如 `if (x = 5)`）。

### 3.6 Void 与 Noreturn

- `void` —— "无值"，例如 `fn() void`。
- `noreturn` —— "永不返回"，例如 `unreachable`、`while (true) {}`。

```zig
fn fail() noreturn {
    @panic("unreachable");
}
```

🧠 **专家心智模型**：`noreturn` 类型与 `void` 不能互换；`noreturn` 表示"控制流终止"，用它驱动编译器去掉死代码、做更激进优化。

### 3.7 变量：const vs var

```zig
const PI: f32 = 3.14159;     // 不可变
var counter: u32 = 0;        // 可变
counter += 1;                // OK
```

**`const` 不代表"不可变数据"**，它代表"绑定的指针不能换"。`const slice: []u32 = ...; slice[0] = 1;` 完全合法，因为 `slice` 本身没变。

### 3.8 内存布局：值、指针、堆

Zig 没有隐藏的 stack vs heap 区分——值住在哪里，由你**拿到的指针的来源**决定：

- **栈**：`var x: u32 = 0;` `x` 的地址在栈上。
- **静态**：`const ANSWER: u32 = 42;` 编译器放在 `.rodata`（或 `.data`）。
- **堆**：`allocator.create(u32)` 返回的指针。

```zig
const std = @import("std");
const a = std.heap.page_allocator;

pub fn main() !void {
    var n: u32 = 42;                     // 栈
    const p = try a.create(u32);          // 堆
    defer a.destroy(p);
    p.* = 5;
    std.debug.print("n={} *p={}\n", .{ n, p.* });
}
```

### 3.9 本章自检

1. `comptime_int` 与 `usize` 有什么本质区别？
2. 为什么 `if (x = 5)` 在 Zig 里直接报错？
3. `const` 与"不可变"是否等价？为什么？
4. `noreturn` 与 `void` 的类型论本质是什么？

---

## 第 4 章 函数、错误与控制流

### 4.1 函数签名

```zig
fn add(a: i32, b: i32) i32 {           // 命名返回
    return a + b;
}

fn swap(a: anytype, b: anytype) struct { @TypeOf(a), @TypeOf(b) } {
    return .{ b, a };
}

// 错误联合返回
fn parse(s: []const u8) !u32 {
    return std.fmt.parseInt(u32, s, 10);
}

// 命名参数
fn record(name: []const u8, comptime id: u32) void {
    std.debug.print("id={d} name={s}\n", .{ id, name });
}
```

要点：
- 参数列表必须标注类型（不像 Rust 能推断）。
- `anytype` 是"调用现场推断参数"的语法糖——函数体内部则像普通参数使用。
- 返回类型可以放 `!T`（错误联合）或 `?T`（可选）。

### 4.2 `defer` 与 `errdefer`

`defer` 在作用域退出时执行；多层时按 LIFO：

```zig
fn read() !void {
    const f = try std.fs.cwd().openFile("data.txt", .{});
    defer f.close();                  // 退出函数时关闭

    var buf: [4096]u8 = undefined;
    const n = try f.read(&buf);
    // ...
}
```

`errdefer` 仅在返回错误时执行——是资源分配的"回滚"：

```zig
fn setup() !*Resource {
    const r = try allocator.create(Resource);
    errdefer allocator.destroy(r);
    r.* = .{ .state = try allocator.alloc(u8, 1024) };
    errdefer allocator.free(r.state);
    try r.init();
    return r;
}
```

🧠 **专家心智模型**：`defer` 不会捕获 `return` 值。如果你想在 `return` 之前修改返回值（比如包装错误），使用 `errdefer |err| { ... }`。

### 4.3 错误传播：`try`

```zig
fn a() !void {
    try b();          // b() 失败立即把错误返回
}

// 等价展开：
if (b()) |_| {} else |err| return err;
```

`try` 只能用于返回 `error_union` 的表达式。

### 4.4 `catch` 与 `orelse`

```zig
const v1 = parseInt(...) catch 0;             // 错误 → 默认值
const v2 = parseInt(...) catch |err| {
    std.log.warn("failed: {s}", .{@errorName(err)});
    return err;
};

const x: ?u32 = @as(?u32, null);
const y = x orelse 0;                           // null → 默认值
```

### 4.5 `if` / `else if` / `else`

```zig
if (cond) {
    // ...
} else if (other) {
    // ...
} else {
    // ...
}

// 作为表达式
const label = if (score > 90) "A" else if (score > 80) "B" else "C";
```

⚠️ **陷阱**：Zig 没有"truthy"概念。条件必须是 `bool`。

### 4.6 `while` 与 `for`

```zig
var i: u32 = 0;
while (i < 10) : (i += 1) {
    if (i == 5) continue;
    if (i == 8) break;
}

// 标签块
countdown: {
    var i: i32 = 10;
    while (i > 0) {
        if (i == 3) break :countdown;
        i -= 1;
    }
}
```

`for` 遍历切片、数组、范围：

```zig
const items = [_]u32{ 1, 2, 3 };
for (items) |item| {
    std.debug.print("{d}\n", .{item});
}

// 带索引
for (items, 0..) |item, i| {
    std.debug.print("[{d}]={d}\n", .{ i, item });
}

// 多个切片并行
const a = [_]u32{ 1, 2, 3 };
const b = [_]u32{ 10, 20, 30 };
for (a, b) |x, y| {
    std.debug.print("{d}+{d}={d}\n", .{ x, y, x + y });
}
```

### 4.7 `switch` 表达式

```zig
const Color = enum { red, green, blue };

fn hex(c: Color) u8 {
    return switch (c) {
        .red => 0xFF0000,
        .green => 0x00FF00,
        .blue => 0x0000FF,
    };
}

// 范围与多值
switch (n) {
    0 => {},
    1...9 => {},
    else => {},
}

// 捕获
const x: u32 = switch (payload) {
    .small => |v| v,
    .big => |v| v / 2,
};

// 错误联合
switch (result) {
    .ok => |v| ...,
    error.FileNotFound => ...,
    else => |err| ...,
}
```

⚠️ **陷阱 0.16**：switch 必须穷尽。

### 4.8 标签与 `break :label`

```zig
const val = blk: {
    if (cond) break :blk 100;
    break :blk 200;
};
```

🧠 **专家心智模型**：命名块是 Zig 表达复杂控制流最干净的工具。

### 4.9 函数调用约定

```zig
fn fast(x: u32) callconv(.fast) u32 { ... }
extern fn c_func(x: c_int) callconv(.c) c_int;
pub export fn entry() callconv(.c) void { ... }
```

常用 callconv：`.auto`、`.c`、`.x86_64_sysv`、`.x86_64_windows`、`.fast`、`.naked`。

### 4.10 链接可见性

```zig
pub fn public_api() void { ... }
extern "c" fn c_symbol(argc: c_int) c_int;
pub export fn zig_symbol() void { ... }
pub export fn renamed("_alt") myFunc() void {}
```

### 4.11 `inline` 与 `noinline`

```zig
inline fn helper(x: u32) u32 { x + 1 }
noinline fn big(x: u32) u32 { ... }
```

🧠 **专家心智模型**：`inline` 不仅改变代码体积，还**改变函数体语义**——体内 `comptime` 分支根据调用现场求值。

### 4.12 本章自检

1. `defer` 与 `errdefer` 的执行顺序？
2. `try`、`catch`、`orelse` 处理什么类型？
3. 为什么 switch 必须穷尽？
4. `inline` 在 Zig 中不仅是优化还是语义的一部分，这话怎么理解？

---

## 第 5 章 指针、数组、切片与字符串

### 5.1 指针分类

```zig
*T         // 指向单个 T
*const T   // 不可通过该指针写
*volatile T // 防止编译器优化掉访问
*align(N) T // 对齐到 N 字节
*[N]T      // 指向 N 元素数组
*[]T       // 指向切片
*allowzero T // 允许 0 地址
```

```zig
var x: u32 = 42;
const p: *u32 = &x;
p.* = 100;
const q: *const u32 = &x;
// q.* = 0;  // 编译错误
```

### 5.2 数组

```zig
const arr: [5]u32 = .{ 1, 2, 3, 4, 5 };
const arr2 = [_]u32{ 1, 2, 3 };
const zeros = [_]u32{0} ** 100;
```

数组是**值类型**。

### 5.3 Sentinel 终止符

```zig
const buf: [4:0]u8 = .{ 'a', 'b', 'c', 0 };  // C 字符串
const s: [:0]const u8 = "hello";
```

🧠 **专家心智模型**：Sentinel 让 Zig 在数组/切片中携带"边界信息"而无显式长度。

### 5.4 切片

```zig
const a: [5]u32 = .{ 1, 2, 3, 4, 5 };
const s: []const u32 = &a;
var mut: [5]u32 = undefined;
const s3: []u32 = &mut;
```

### 5.5 字符串

Zig **没有专门的字符串类型**——字符串就是 `[]const u8` 或 `[:0]const u8`：

```zig
const a: []const u8 = "hello";             // 5 字节
const b: [:0]const u8 = "hello";           // 6 字节，含 0
const c: *const [5:0]u8 = "hello";         // 数组指针
```

### 5.6 切片操作

```zig
const s: []const u8 = "Hello, 世界";
std.debug.print("len={}\n", .{s.len});
const sub = s[7..];                          // "世界"
```

⚠️ **陷阱**：切片是字节索引，UTF-8 需要解码。

### 5.7 指针算术

```zig
var arr = [_]i32{ 10, 20, 30 };
var p: [*]i32 = &arr;
p[0] = 1;
p += 1;
std.debug.print("{}", .{p[0]});
```

🧠 **专家心智模型**：`[*]T` 是"多元素指针但无运行时长度"——与 C 的 `T*` 一致。

### 5.8 越界检查

```zig
fn get(s: []u32, i: usize) u32 {
    return s[i];   // Debug 模式会检查
}
```

### 5.9 字符串拼接

```zig
var buf: [256]u8 = undefined;
const out = try std.fmt.bufPrint(&buf, "x={d} y={s}", .{ 42, "hi" });
```

### 5.10 切片与边界安全的 API

Zig 标准库偏好"传入切片+长度+容量"而不是裸指针。

✅ **OK 习惯**：写自己的库时模仿这种风格。

### 5.11 本章自检

1. `[]T` 与 `*[N]T` 的根本区别？
2. Sentinel 数组 `[N:0]u8` 与 C 字符串的关系？
3. 为什么 Zig 没有"字符串类型"？这给 FFI 带来什么好处？
4. `[*]T` 是什么？何时使用？


---

## 第 6 章 结构体、联合、枚举与标记联合

### 6.1 结构体

```zig
const Point = struct {
    x: f32,
    y: f32,
    z: f32 = 0,                 // 默认值

    pub fn origin() Point {
        return .{ .x = 0, .y = 0, .z = 0 };
    }

    pub fn length(self: Point) f32 {
        return std.math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z);
    }
};

const p = Point{ .x = 1, .y = 2, .z = 3 };
const p2 = Point{ .x = 1, .y = 2 };  // z 默认 0
```

字段可以是 `comptime`（编译期已知）：

```zig
const Config = struct {
    name: []const u8,
    max_conn: comptime_int = 100,
};
```

### 6.2 命名空间即结构体

在 Zig 中结构体**就是**命名空间——给 `Point` 添加常量就是 `Point.origin` 风格的"静态方法"。也可用 `usingnamespace` 混入其他模块：

```zig
const Math = struct {
    pub usingnamespace @import("math_ops.zig");
};
```

⚠️ **0.16 变更**：`usingnamespace` 在 0.16 仍然支持，但官方鼓励改用 `pub const Mixin = @import("...");` 显式重导出。

### 6.3 内存布局

```zig
const Abc = struct {
    a: u32,
    b: u8,
    c: u16,
};
// 默认布局：自动对齐，可能产生 4 字节填充

// 紧密布局
const Packed = packed struct {
    a: u3,
    b: u5,
    c: u8,
};  // 总共 16 位，2 字节

// C 兼容
const Extern = extern struct {
    a: c_int,
    b: [*c]u8,
};
```

| 布局 | 含义 |
|------|------|
| `auto` | 默认，编译器可重排、填充 |
| `extern` | C 兼容：字段顺序与 ABI 严格 |
| `packed` | 位级精确布局 |

### 6.4 匿名结构体 / 元组

```zig
const t = .{ 1, 2.0, "hi" };  // 类型：struct { comptime_int, comptime_float, *const [3:0]u8 }
const a = t[0];               // 1
const b = t[1];               // 2.0

// 命名访问
const pair = .{ .x = 1, .y = 2 };
std.debug.print("{}", .{pair.x});
```

🧠 **专家心智模型**：函数的可变参数 `anytype` 本质上就是匿名元组。`std.debug.print("...", .{ arg1, arg2, arg3 })` 的 `.{}` 是一个 tuple。

### 6.5 枚举

```zig
const Color = enum { red, green, blue };

const c: Color = .red;
std.debug.print("{}", .{@intFromEnum(c)});   // 0

// 自定义整型
const Status = enum(u8) { ok = 200, not_found = 404, error = 500 };

// 显式 backend
const F = enum(u2) { a, b, c, d };   // 2 位
```

枚举的整型后备类型：默认 `c_int`（0.16 之前是 `u2` 推断最优），可以用 `enum(usize)` 等显式指定。

### 6.6 裸联合

```zig
const U = union {
    i: i32,
    f: f32,
};  // 默认 `auto` 布局

var u: U = .{ .i = 42 };
// u.i 与 u.f 共享内存
std.debug.print("as float = {}\n", .{@as(*f32, @ptrCast(&u.i)).*});
```

⚠️ **陷阱**：裸联合同一时间只能安全读最后写入的字段。读其他字段是 UB。

### 6.7 标记联合

Zig 的杀手锏：

```zig
const Value = union(enum) {
    int: i32,
    float: f32,
    text: []const u8,
    none,

    pub fn format(self: Value, w: *std.Io.Writer) std.Io.Writer.Error!void {
        switch (self) {
            .int => |v| try w.print("{d}", .{v}),
            .float => |v| try w.print("{any}", .{v}),
            .text => |v| try w.writeAll(v),
            .none => try w.writeAll("none"),
        }
    }
};

const v: Value = .{ .int = 42 };
switch (v) {
    .int => |i| std.debug.print("int={d}\n", .{i}),
    .float => |f| std.debug.print("float={d}\n", .{f}),
    .text => |s| std.debug.print("text={s}\n", .{s}),
    .none => {},
}
```

🧠 **专家心智模型**：标记联合 = `enum` + `union`。它带来：
1. 类型安全（不能错用字段）；
2. 内存紧凑（无 padding）；
3. 自动穷尽（switch 必须覆盖所有 tag）。

### 6.8 Packed 结构 与 Packed Union

```zig
const Ip = packed struct {
    version: u4,
    ihl: u4,
    tos: u8,
    total_len: u16,
    // ...
};
```

```zig
const P = packed union(u2) {
    a: i2,
    b: u2,
};
```

⚠️ **0.16 变更**：packed union 字段如果没用满位，编译器会强制你显式 `=> comptime unreachable` 处理 unused bits。

### 6.9 Extern 枚举

```zig
const Errno = extern enum(c_int) {    // C ABI 兼容
    SUCCESS = 0,
    PERM = 1,
    NOENT = 2,
};
```

### 6.10 嵌套与前置引用

Zig 的类型解析是按 **decl 依赖图**，所以能前向引用：

```zig
const A = struct {
    b: ?B = null,           // 编译期可解析
};

const B = struct {
    a: *A,
};
```

### 6.11 本章自检

1. `auto`、`extern`、`packed` 三种布局在实际代码中的取舍？
2. 标记联合相对裸联合的核心收益？
3. 元组字面量在 Zig 里如何被推导类型？
4. `usingnamespace` 在 0.16 的推荐替代方案？

---

## 第 7 章 可选类型、错误联合与错误集合

### 7.1 可选类型（Optional）

```zig
const maybe: ?u32 = null;
const also: ?u32 = 42;

// 解包
const v = maybe orelse 0;

if (maybe) |v| {
    std.debug.print("got {d}\n", .{v});
} else {
    std.debug.print("null\n", .{});
}

// 指针
var p: ?*u32 = null;
const ref = &(p orelse return);
```

🧠 **专家心智模型**：可选类型在内存里和 `u32` 一样紧凑——它要么是 `u32` 值，要么全 0（被编译器识别为 `null`）。无 NaN boxing 等优化技巧。

### 7.2 错误联合（Error Union）

```zig
const Result = anyerror!u32;
const Result2 = error{NotFound, PermissionDenied}![]u8;

fn find() error{NotFound}![]u8 {
    return error.NotFound;
}

// 使用
const buf = find() catch &[_]u8{};
```

错误集合是**子类型关系**：

```zig
fn callsFind() error{NotFound, OutOfMemory}!void {
    try find();  // 错误集合可以扩展
}
```

### 7.3 错误集合的构造

```zig
const E = error{A, B, C};
const E2 = E || error{D};             // 合并
const any = anyerror;                  // 任意错误

// 私有错误集合
const MyErr = error{NotFound};
```

### 7.4 推断错误集合

```zig
fn mayFail() !u32 { ... }              // 推断为函数体内所有错误

fn withAny() anyerror!void {
    try mayFail();
}
```

⚠️ **陷阱**：推断错误集合只有函数对调用方可见时才能扩展。如果返回 `anyerror!T`，推断集合会丢失。

### 7.5 错误处理模式

```zig
// 1. 传播
try mayFail();

// 2. 兜底
const v = mayFail() catch default;

// 3. 转换
const v = mayFail() catch |err| switch (err) {
    error.NotFound => 0,
    error.OutOfMemory => return err,
    else => unreachable,
};

// 4. 断言
const v = mayFail() catch unreachable;

// 5. 重新抛
return mayFail();
```

### 7.6 错误返回 vs 抛出

Zig 没有真正的 `throw`——错误就是普通返回值。这给调试带来优势：跟普通函数调用一样可观察。

### 7.7 错误的不可忽略性

⚠️ **关键陷阱**：`must_use` 在 0.16 生效，错误联合必须被 `try`/`catch` 消耗，否则编译错误。

### 7.8 错误码与错误名

```zig
return error.NotFound;

const name: []const u8 = @errorName(err);  // "NotFound"
switch (err) {
    error.OutOfMemory => ...,
    else => ...,
}
```

### 7.9 错误集合的内存表示

```zig
// 任何错误集合都可以用 `u16` 等底层整数表示
const code: u16 = @errorCast(err);
```

### 7.10 本章自检

1. 可选类型 `?T` 的内存布局？
2. 错误联合与异常的本质区别？
3. 推断错误集合与显式错误集合各适用什么场景？
4. Zig 为何要求错误联合必须被消费？

---

## 第 8 章 编译期与元编程

### 8.1 Comptime 是什么

`comptime` 关键字标记的代码在编译期强制求值。Zig 让"编译期"和"运行时"调用同一种语言——只有代码在编译期上下文里求值时才属于"编译期"。

```zig
const x: comptime_int = 10;
const y = comptime (x * 2);  // 编译期求值
```

### 8.2 编译期参数

```zig
fn max(comptime T: type, a: T, b: T) T {
    return if (a > b) a else b;
}

const a = max(u32, 10, 20);
const b = max(f64, 1.5, 0.3);
```

🧠 **专家心智模型**：除 `comptime` 参数外，函数体内部遇到 `comptime` 块、`if (comptime_known)`、`@TypeOf` 等也会触发编译期求值。

### 8.3 编译期变量

```zig
comptime var n: u32 = 0;
inline for (0..100) |i| {
    n += 1;
}
// 编译期 n = 100
```

### 8.4 类型即值

```zig
const T: type = u32;        // `type` 是类型
const types = [_]type { u8, u16, u32 };
```

### 8.5 编译期控制流

```zig
comptime {
    var i: u32 = 0;
    while (i < 10) : (i += 1) {
        if (i == 5) break;
    }
}

inline for (0..10) |i| {
    // 每次 i 在编译期已知
}
```

### 8.6 `inline` 与 `inline else`/`inline for`/`inline while`

```zig
inline for (items) |item| {
    // 整个循环在调用现场被展开
}

inline while (cond) |x| {
    // ...
}
```

🧠 **专家心智模型**：`inline for` 与 `for` 的区别是——`inline for` 强制在编译期展开，并且 `for` 的迭代变量必须是 `comptime` 已知。

### 8.7 编译期字符串解析

```zig
const builtin = @import("builtin");

comptime {
    if (builtin.os.tag == .linux) {
        // 条件编译
    }
}
```

参数化：

```zig
fn prove(comptime n: u32) void {
    comptime var fib: u64 = 1;
    comptime var i: u32 = 0;
    inline while (i < n) : (i += 1) {
        fib *= @as(u64, i + 1);
    }
    _ = fib;
}
```

### 8.8 类型生成

```zig
fn Doubler(comptime T: type) type {
    return struct {
        value: T,
        pub fn doubled(self: @This()) T {
            return self.value * 2;
        }
    };
}

const D = Doubler(u32);
const d = D{ .value = 21 };
std.debug.print("{d}\n", .{d.doubled()});
```

### 8.9 编译期反射

```zig
const S = struct { x: u32, y: u32 };
comptime {
    const info = @typeInfo(S);
    _ = info;  // type: std.builtin.Type.Struct
}
```

详见第 11 章。

### 8.10 编译期内存分配

```zig
comptime {
    var buf: [4]u32 = [_]u32{ 1, 2, 3, 4 };
    _ = buf;
}
```

Comptime 内存分配器：

```zig
comptime {
    var list: std.ArrayList(u32) = .empty;
    defer list.deinit(std.testing.allocator);
    list.append(std.testing.allocator, 1) catch unreachable;  // 0.16 之前
    // 0.16 之后 ArrayList 改为 unmanaged
    list.append(1);
}
```

### 8.11 Comptime 错误处理

```zig
fn must(comptime expr: anytype) @TypeOf(expr) {
    return expr orelse @compileError("must not be null");
}

const x = must(@as(?u32, 42));
```

### 8.12 `@compileLog`、`@compileError`

```zig
if (mode != .fast and mode != .safe) {
    @compileError("unsupported mode");
}

comptime {
    @compileLog("debug build");
}
```

### 8.13 本章自检

1. `comptime` 关键字的目标？
2. `inline for` 与 `for` 的区别？
3. `comptime` 错误能用普通 try/catch 处理吗？
4. `Doubler` 这种函数为何能用作"类型生成器"？

---

## 第 9 章 泛型编程与类型擦除

### 9.1 泛型函数

Zig 没有专门的 `generic` 关键字——所有"泛型"都是 `comptime` 函数：

```zig
fn identity(comptime T: type, value: T) T {
    return value;
}

const a = identity(u32, 42);
const b = identity([]const u8, "hi");
```

### 9.2 `anytype` 语法糖

```zig
fn identity(value: anytype) @TypeOf(value) {
    return value;
}
```

ⓘ `anytype` 自动产生 `comptime T: type` 形参与 `@TypeOf` 推导。

### 9.3 约束（Constraints）

Zig 不强制约束，但你可以用 `@hasDecl` 等反射函数自定义：

```zig
fn addLike(comptime T: type, a: T, b: T) T {
    if (!@hasDecl(T, "add")) {
        @compileError("type " ++ @typeName(T) ++ " missing add");
    }
    return a.add(b);
}
```

### 9.4 类型擦除：`anyopaque` 与 `*anyopaque`

```zig
const Node = opaque {
    fn next(self: *Node) *Node { ... }
};

const OpaquePtr = *anyopaque;  // 类似 void*
```

🧠 **专家心智模型**：Zig 把 `anyopaque` 看作"未声明方法的 opaque 类型"——你只能在其指针间转换，但指针保留类型信息以助调试。

### 9.5 容器内部的泛型

```zig
fn List(comptime T: type) type {
    return struct {
        const Self = @This();
        items: []T,
        len: usize = 0,

        pub fn push(self: *Self, x: T) !void {
            if (self.len == self.items.len) {
                self.items = try allocator.realloc(self.items, self.items.len * 2);
            }
            self.items[self.len] = x;
            self.len += 1;
        }
    };
}

var int_list = List(u32){ .items = &[_]u32{} };
```

### 9.6 泛型 vs 动态分派

Zig 不支持运行时多态（无 vtable 开箱即用）。你需要：
1. **编译期单态化**（推荐）：每种类型编译一份代码。
2. **`anyopaque` + 函数指针**：手工 vtable。
3. **Tagged union**：封闭类型集合。

### 9.7 抽象数据类型的最佳实践

✅ **OK 习惯**：
- 当集合类型固定时，优先用 tagged union。
- 当集合开放时，写泛型容器。
- 当 ABI 兼容性比类型安全更重要时，用 `*anyopaque`。

### 9.8 递归类型

```zig
const List = struct {
    head: ?*Node,
};

const Node = struct {
    value: i32,
    next: ?*Node,
};
```

⚠️ **0.16 简化**：`List` 不再直接持有 `Node` 的字段值（依赖环），实际上 zig 0.16 改进了依赖环规则。

### 9.9 本章自检

1. `anytype` 与 `comptime T: type` 的等价关系？
2. Zig 没有"运行时多态"——遇到运行时多态需求时怎么选？
3. `*anyopaque` 与 C 中的 `void*` 区别？
4. 递归类型在 Zig 中如何表达？

---

## 第 10 章 高级类型操作

### 10.1 0.16 重大变化：`@Type` 重新设计

0.16 之前只有一个 `@Type(.{ .int = ... })` 巨型 API。0.16 拆分为独立 builtin：

| 旧用法 | 新用法 |
|--------|--------|
| `@Type(.{ .int = .{ .signedness = .unsigned, .bits = 10 } })` | `@Int(.unsigned, 10)` |
| `@Type(.{ .@"enum" = ... })` | `@Enum(...)` |
| `@Type(.{ .@"struct" = ... })` | `@Struct(...)` |
| `@Type(.{ .@"union" = ... })` | `@Union(...)` |
| `@Type(.{ .pointer = ... })` | `@Pointer(...)` |
| `@Type(.{ .@"fn" = ... })` | `@Fn(...)` |
| `@Type(.{ .array = ... })` | `@Array(...)`（新） |
| `@Type(.{ .vector = ... })` | `@Vector(...)`（新） |
| `@Type(.{ .@"enum_literal" = ... })` | `@EnumLiteral()` |
| `@Type(.{ .tuple = ... })` | `@Tuple(...)` |

🧠 **专家心智模型**：原来的 `@Type` 把"类型构造函数"和"AST 表示"耦合——可读性差、错误信息啰嗦。新的独立 builtin 把"构造类型"这一职责单点化。

### 10.2 `@Int`

```zig
const T = @Int(.unsigned, 10);   // u10
const S = @Int(.signed, 7);     // i7
```

### 10.3 `@Pointer`

```zig
const P = @Pointer(.one, .{}, u32, null);              // *u32
const C = @Pointer(.one, .{ .@"const" = true }, u32, null);  // *const u32
const M = @Pointer(.many, .{}, u64, 0);               // [*]u64 with sentinel 0
```

### 10.4 `@Struct`

```zig
const S = @Struct(
    .auto,
    null,                                     // 无 backing
    &.{ "x", "y" },                           // 字段名
    &.{ f32, f32 },                           // 字段类型
    &@splat(.{ .@"align" = 1 }),             // 字段属性
);
```

新"struct of arrays"风格：

```zig
const T = @Struct(.auto, null, &.{"k"}, &.{u32}, &.{.{ .default_value_ptr = &@as(u32, 0) }});
```

### 10.5 `@Union`

```zig
const U = @Union(
    .auto,
    MyEnum,                                   // tag type
    &.{"a", "b"},
    &.{ i32, f32 },
    &.{ .{}, .{} },
);
```

### 10.6 `@Enum`

```zig
const E = @Enum(
    u8,
    .nonexhaustive,
    &.{ "a", "b" },
    &.{ 1, 2 },
);
```

### 10.7 `@Fn`

```zig
const F = @Fn(
    &.{ u32, u32 },
    &@splat(.{}),
    u32,
    .{ .@"callconv" = .c },
);
```

### 10.8 `@Tuple`

```zig
const T = @Tuple(&.{ u32, f64, []const u8 });
```

### 10.9 `@Array`

```zig
const A = @Array(u32, 16);                       // [16]u32
const B = @Array(u32, 16, .@"const");            // *const [16]u32
```

### 10.10 `@Vector`

```zig
const V = @Vector(4, f32);                       // SIMD vector
```

### 10.11 显式对齐指针区别

0.16 之前 `*align(1) u8` 与 `*u8` 是同一种类型。0.16 之后它们是**两个不同类型**但可相互强转：

```zig
const A: *u8 = undefined;
const B: *align(1) u8 = @ptrCast(A);
```

### 10.12 向量与数组不再内存强转

0.16 之前 `@Vector(4, u32)` 与 `[4]u32` 可以强制互转。0.16 之后必须显式 `@as`。

> [INFERENCE: 0.16 拆掉隐式转换以减少 footgun，与 Rust 显式转换思路一致。]

### 10.13 本章自检

1. `@Type` 重构的核心动机是什么？
2. 解释 `&@splat(.{})` 在 0.16 的用意。
3. 显式对齐指针分离的好处？
4. `@Array` 与 `[N]T` 的关系？

---

## 第 11 章 反射：`@typeInfo` 与内置函数全解

### 11.1 `@typeInfo`

```zig
const info: std.builtin.Type = @typeInfo(u32);
switch (info) {
    .int => |i| std.debug.print("int({d})-bit {s}\n", .{ i.bits, @tagName(i.signedness) }),
    else => {},
}
```

`std.builtin.Type` 是 sum type：

```zig
pub const Type = union(enum) {
    type: void,
    void: void,
    bool: void,
    noreturn: void,
    int: Int,
    float: Float,
    pointer: Pointer,
    array: Array,
    @"struct": Struct,
    comptime_float: void,
    comptime_int: void,
    undefined: void,
    null: void,
    optional: Optional,
    error_union: ErrorUnion,
    error_set: ErrorSet,
    @"enum": Enum,
    @"union": Union,
    @"fn": Fn,
    @"opaque": Opaque,
    frame: Frame,
    @"anyframe": AnyFrame,
    vector: Vector,
    @"enum_literal": void,
};
```

### 11.2 反射实战

```zig
fn fields(comptime T: type) []const []const u8 {
    return switch (@typeInfo(T)) {
        .@"struct" => |s| blk: {
            var names: [s.fields.len][]const u8 = undefined;
            for (s.fields, 0..) |f, i| names[i] = f.name;
            break :blk &names;
        },
        else => @compileError("not a struct"),
    };
}
```

### 11.3 `@hasDecl`、`@hasField`

```zig
if (@hasDecl(T, "clone")) {
    return obj.clone();
}

if (@hasField(T, "value")) {
    return obj.value;
}
```

### 11.4 `@typeName`

```zig
comptime var buf: [256]u8 = undefined;
const name = std.fmt.bufPrint(&buf, "{s}", .{@typeName(T)}) catch "";
```

### 11.5 `@typeInfo(Pointer).Pointer.size`

```zig
switch (@typeInfo(*u32).pointer.size) {
    .one => ...,
    .many => ...,
    .slice => ...,
    .c => ...,
}
```

### 11.6 反射的代价

编译期反射在编译时消解，无运行时成本。但要小心：

1. 不要在热路径里调用 `@typeName` 等（编译期 OK）。
2. 反射出来的字段名 `[]const u8`，可以传给运行时函数做日志，但不能用于条件分支（除非 inline）。

### 11.7 反射与序列化

```zig
fn toJson(comptime T: type, value: T, w: *std.Io.Writer) !void {
    switch (@typeInfo(T)) {
        .int => |i| try w.print("{d}", .{@as(i.signedness, value)}),
        .float => try w.print("{d}", .{value}),
        .@"struct" => |s| {
            try w.writeAll("{");
            inline for (s.fields, 0..) |f, i| {
                if (i != 0) try w.writeAll(",");
                try w.print("\"{s}\":", .{f.name});
                try toJson(f.type, @field(value, f.name), w);
            }
            try w.writeAll("}");
        },
        else => @compileError("unsupported type"),
    }
}
```

🧠 **专家心智模型**：Zig 的反射是**自动化展开**——`inline for` + `@field` 让编译器在每个字段上展开，避免运行时 dispatch。

### 11.8 本章自检

1. `@typeInfo` 返回什么类型？
2. 如何判断 `T` 是否有 `clone` 方法？
3. 反射 + `inline for` 是怎么"自动化生成代码"的？
4. 反射在 Zig 里仅限编译期吗？

---

## 第 12 章 内联汇编与原子操作

### 12.1 内联汇编

Zig 的内联汇编与 LLVM 完全对齐：

```zig
pub fn cpuidLeaf(leaf: u32) struct { eax: u32, ebx: u32, ecx: u32, edx: u32 } {
    var eax: u32 = undefined;
    var ebx: u32 = undefined;
    var ecx: u32 = undefined;
    var edx: u32 = undefined;
    asm volatile ("cpuid"
        : +{eax}"={eax}"(eax),
          "={ebx}"(ebx),
          "={ecx}"(ecx),
          "={edx}"(edx),
        : "{eax}"(leaf),
        : "ebx", "ecx", "edx"
    );
    return .{ .eax = eax, .ebx = ebx, .ecx = ecx, .edx = edx };
}
```

asm 格式：
```zig
asm [volatile] (assembly
    : [outputs]
    : [inputs]
    : [clobbers]
);
```

约束：
```zig
"{eax}"        // 固定寄存器
"r"            // 任意通用寄存器
"m"            // 内存
"i"            // 立即数
"={rax}"       // 输出
"+{rax}"       // 输入+输出
```

### 12.2 系统调用

```zig
const std = @import("std");
const builtin = @import("builtin");

fn exit(code: usize) noreturn {
    switch (builtin.os.tag) {
        .linux => {
            asm volatile ("syscall"
                :
                : [num] "{rax}" (60),    // SYS_exit
                  [arg1] "{rdi}" (code),
                : "rcx", "r11", "memory"
            );
        },
        .windows => {
            // ...
        },
        else => @compileError("unsupported"),
    }
    unreachable;
}
```

### 12.3 内存屏障

```zig
asm volatile ("mfence" ::: "memory");
asm volatile ("dmb ish" ::: "memory");   // ARM
```

### 12.4 原子操作

Zig 的 `std.atomic` 模块包装了 LLVM 原子：

```zig
var counter: std.atomic.Value(u32) = .init(0);

// 读
const v = counter.load(.acquire);

// 写
counter.store(1, .release);

// 增
const old = counter.fetchAdd(1, .acq_rel);

// CAS
if (counter.cmpxchgWeak(old, old + 1, .acq_rel, .acquire)) |new| {
    // 成功
} else |actual| {
    // 失败，actual 是当前值
}
```

顺序：
- `.unordered` —— 无顺序
- `.monotonic` —— 单线程一致
- `.acquire` / `.release` —— 跨线程同步
- `.acq_rel` —— 双向
- `.seq_cst` —— 全序

🧠 **专家心智模型**：Zig 的原子顺序映射到 C++20 的 `memory_order`，设计一一对应。`fetchAdd` 实现 release 语义能把 HAPPENS-BEFORE 关系传播到外部观察者。

### 12.5 锁

```zig
var mutex: std.Thread.Mutex = .{};
mutex.lock();
defer mutex.unlock();
// 临界区
```

Mutex 0.16 之前有 `Recursive` 变体，0.16 已删除。

### 12.6 信号量与原子等待

```zig
var sem: std.atomic.Sema = .{};
sem.post();
sem.wait();                  // 阻塞
sem.timedWait(timeout);      // 0.16+
```

### 12.7 条件变量

```zig
var cond: std.Thread.Condition = .{};
cond.wait(&mutex);
cond.signal();
cond.broadcast();
```

### 12.8 关键字 `linksection`

```zig
var boot_stack: [4096]u8 align(16) linksection(".bss.stack") = undefined;
```

### 12.9 本章自检

1. `asm volatile` 中 `volatile` 的作用？
2. 内存序 `.release` 与 `.acquire` 的成对使用？
3. `fetchAdd` 的返回值是什么？
4. `linksection` 适用场景？

---

## 第 13 章 分配器与内存管理

### 13.1 分配器接口

Zig 用 `std.mem.Allocator` 作为统一接口：

```zig
pub const Allocator = opaque {
    pub fn alloc(self: Allocator, n: usize, alignment: Alignment) [...]u8;
    pub fn resize(self: Allocator, old_mem: []u8, new_n: usize, alignment: Alignment) bool;
    pub fn remap(self: Allocator, old_mem: []u8, new_n: usize, alignment: Alignment) []u8;
    pub fn free(self: Allocator, old_mem: []u8, alignment: Alignment) void;
};
```

🧠 **专家心智模型**：0.16 引入了 `remap`——允许分配器实现原地扩展（如 `realloc` 在原指针上调大），这是高性能分配器的关键。比如 `mmap` 的 `MREMAP` 可以直接扩展底层映射。

### 13.2 标准分配器

```zig
const std = @import("std");

// 1. 通用带调试分配器
const debug = std.heap.debug_allocator;

// 2. 一般用途（轻量）
const gpa = std.heap.GeneralPurposeAllocator(.{}){};

// 3. Arena（一次性释放）
var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
defer arena.deinit();
const a_alloc = arena.allocator();

// 4. 固定缓冲区（栈）
var buf: [4096]u8 = undefined;
var fixed = std.heap.FixedBufferAllocator.init(&buf);
const f_alloc = fixed.allocator();

// 5. 页分配器（直接 mmap）
const page = std.heap.page_allocator;
```

### 13.3 0.16 线程安全更新

0.16 起 `ArenaAllocator` 线程安全且无锁。`ThreadSafeAllocator` 已被删除。

### 13.4 分配与释放

```zig
fn process(alloc: std.mem.Allocator) !void {
    const buf = try alloc.alloc(u8, 1024);
    defer alloc.free(buf);

    const str = try alloc.dupe(u8, "hello");
    defer alloc.free(str);

    const list = try alloc.alloc(u32, 10);
    defer alloc.free(list);
}
```

### 13.5 Unmanaged 容器

0.16 起大多数容器变为 `unmanaged`：它们自身不带分配器，每次操作传 allocation parameter：

```zig
var list: std.ArrayList(u32) = .empty;
defer list.deinit(allocator);

try list.append(allocator, 42);
try list.appendSlice(allocator, &.{ 1, 2, 3 });

var map: std.StringHashMap(u32) = .empty;
defer map.deinit(allocator);
try map.put(allocator, "key", 42);
```

⚠️ **0.16 迁移**：把旧 `std.ArrayList` 替换为 `unmanaged` 模式，并显式传 `allocator`。

### 13.6 分配器模式选择

🧠 **专家心智模型**：

| 场景 | 推荐 |
|------|------|
| 短命一次性的解析 | Arena |
| 长期多线程 | GPA + 锁 |
| 嵌入式/无堆 | FixedBuffer |
| 测试 | debug_allocator |
| 高性能生产 | 自己实现 slab 分配器 |

### 13.7 自定义分配器

```zig
const PoolAllocator = struct {
    chunks: [N][4096]u8,
    used: [N]bool,
    mutex: std.Thread.Mutex,

    pub fn allocator(self: *PoolAllocator) std.mem.Allocator {
        return .{ .ptr = self, .vtable = &.{
            .alloc = alloc,
            .resize = resize,
            .remap = remap,
            .free = free,
        } };
    }

    fn alloc(ctx: *anyopaque, n: usize, alignment: std.mem.Alignment) ?[*]u8 {
        const self: *PoolAllocator = @ptrCast(@alignCast(ctx));
        // ...
    }
    // ...
};
```

### 13.8 调试技巧

```zig
// 检测泄漏
const gpa = std.heap.GeneralPurposeAllocator(.{ .safety = true }){};
defer {
    const leaked = gpa.deinit();
    if (leaked) std.log.err("memory leaked", .{});
}
```

⚠️ **0.16 差异**：构造 API 略有变化，需要查当前文档。

### 13.9 本章自检

1. `Allocator` 接口的四个核心方法？
2. `remap` 与 "free + alloc" 的区别？
3. 何时选 Arena / GPA / FixedBuffer？
4. 0.16 unmanaged 容器带来的核心收益？

---

## 第 14 章 文件系统与 I/O 接口

### 14.1 0.16 大重构：`std.Io`

0.16 引入了 `std.Io` 接口，它把所有 I/O 抽象成"接口"形式：

```zig
const std = @import("std");
const Io = std.Io;

pub fn main(init: std.process.Init) !void {
    const gpa = init.gpa;
    const io = init.io;
    // io 是 std.Io 实例
}
```

主要实现：
- `Io.Threaded` —— 基于线程（默认）
- `Io.Uring` —— 基于 io_uring（实验）
- `Io.Evented` —— 基于 io_uring 兼容（实验）
- `Io.Dispatch` —— macOS GCD
- `Io.failing` —— 模拟失败

### 14.2 Juicy Main

0.16 引入新的 main 签名：

```zig
pub fn main(init: std.process.Init) !void {
    const gpa = init.gpa;
    const io = init.io;
    const args = try init.minimal.args.toSlice(init.arena.allocator());
    // ...
}
```

`std.process.Init` 包含：
- `gpa: Allocator` —— 通用分配器
- `arena: ArenaAllocator` —— 短期 arena
- `io: Io` —— I/O 接口

向后兼容：
```zig
pub fn main() void {            // 旧 main 仍可用
    // 自动从 std.process.Init 构造
}
```

> [INFERENCE: 0.16 推荐使用 new "juicy main" 形式，但旧 `fn main()` 仍可用作便捷封装。]

### 14.3 文件与目录

```zig
const cwd = std.fs.cwd();
const home = std.fs.openDirAbsolute("/home", .{});

// 旧风格（0.16 仍可用）
const f = try cwd.openFile("foo.txt", .{});
defer f.close();

// 0.16 推荐
const io = ...;
const f = try cwd.openFile(io, "foo.txt", .{});
defer f.close(io);
```

### 14.4 读取与写入

```zig
const buf: [4096]u8 = ...;
const n = try f.read(&buf);

// 全部读到末尾
const content = try f.readToEndAlloc(gpa, max_size);
defer gpa.free(content);
```

### 14.5 `Io.Writer` / `Io.Reader`

```zig
var buf: [4096]u8 = undefined;
var w: Io.Writer = .fixed(&buf);

try w.print("Hello, {s}!\n", .{"world"});
try w.flush();
```

特色：
- `w.print(...)` 替代 `std.fmt.format`
- `w.writeAll(...)` 替代 `f.write(...)`
- `w.flush()` 强制 flush

### 14.6 时间与超时

```zig
const now: Io.Clock.Timestamp = try .now();
const deadline = now.addDuration(.fromSeconds(5));

try io.sleep(.fromSeconds(1), .awake);
```

### 14.7 内存映射

```zig
const file = try cwd.openFile("big.bin", .{});
const mmap = try file.memoryMap(io, .{ .mode = .read_only });
defer mmap.unmap(io);

// mmap.bytes 切片
```

⚠️ **0.16 变更**：`File.memoryMap` 现接 `Io` 参数。

### 14.8 路径处理

```zig
const p = try std.fs.path.join(allocator, &.{ "usr", "local", "bin" });
defer allocator.free(p);
```

### 14.9 进程与子进程

```zig
var child: std.process.Child = .init(&.{ "ls", "-l" }, std.heap.page_allocator);
defer child.deinit();
try child.spawnAndWait();
```

### 14.10 本章自检

1. `std.Io` 接口的核心动机？
2. `std.process.Init` 包含哪几个字段？
3. `Io.Writer.fixed` 的用途？
4. `Io.Threaded` 与 `Io.Uring` 的区别？
5. `memoryMap` 何时优于 `readToEndAlloc`？

---

## 第 15 章 网络与异步 I/O

### 15.1 0.16 异步模型重设

0.16 中，所有异步操作通过 `std.Io` 接口的 `io.async` / `io.concurrent` 启动：

```zig
pub fn main(init: std.process.Init) !void {
    const io = init.io;

    var fut = io.async(slowTask, .{ io, "data" });
    defer if (fut.cancel(io)) |r| r.deinit() else |_| {};

    const result = try fut.await(io);
    std.debug.print("{s}\n", .{result});
}

fn slowTask(io: Io, in: []const u8) ![]u8 {
    try io.sleep(.fromSeconds(1), .awake);
    return try std.fmt.allocPrint(std.heap.page_allocator, "done: {s}", .{in});
}
```

🧠 **专家心智模型**：基于 `Io` 的异步是**类型状态（type-state）**实现的——`Future(T)` 内部封装了任务状态，`.await` 是状态机转移。这种风格比 Rust 的 `async fn` 简单（无栈帧），但缺少数组合子。

### 15.2 `Future` 与 `Group`

```zig
var group: Io.Group = .init;
defer group.cancel(io);

for (data) |d| {
    group.async(io, processItem, .{ io, d });
}
try group.await(io);
```

🧠 **专家心智模型**：`Group` 在内部共享任务存储，避免每次 `Future` 单独分配——`io.async` 适合一次性任务，`Group` 适合"批量并行"。

### 15.3 `Batch`

更低层抽象，操作层级：

```zig
var batch: Io.Batch = .init;
defer batch.cancel(io);

const op = batch.add(io, FileReadStreaming, .{ .fd = fd, .buf = buf });
// ... 批量启动
try batch.await(io);
```

### 15.4 `Select`

```zig
var sel: Io.Select = .init;
defer sel.cancel(io);

const f1 = sel.async(io, f1, .{});
const f2 = sel.async(io, f2, .{});

try sel.await(io);
```

ⓘ `Select` 与 `Group` 区别：`Select` 只等待第一个完成，而 `Group` 等待全部。

### 15.5 取消语义

```zig
{
    var fut = io.async(mayFail, .{});
    defer if (fut.cancel(io)) |r| r.deinit() else |_| {};
    try fut.await(io);
}
```

`cancel` 的语义：
1. 阻止后续 await 重复；
2. 释放 task 内存；
3. 如果已完成，把结果移交；
4. 否则请求取消。

🧠 **专家心智模型**：取消是协作式的——库函数必须主动检查 `io.checkCancel()` 才能响应。0.16 大多数 I/O 函数内建了取消点。

### 15.6 Recancel

```zig
fn handler(io: Io) !void {
    try doStuff() catch |err| switch (err) {
        error.Canceled => {
            io.recancel();        // 重新武装取消
            return err;
        },
        else => return err,
    };
}
```

### 15.7 HTTP 客户端示例

```zig
fn fetch(io: Io, gpa: Allocator, url: []const u8) ![]u8 {
    var client: std.http.Client = .{ .allocator = gpa, .io = io };
    defer client.deinit();

    var req = try client.request(.GET, .{
        .scheme = "http",
        .host = .{ .percent_encoded = "example.com" },
        .port = 80,
        .path = .{ .percent_encoded = "/" },
    }, .{});
    defer req.deinit();

    try req.sendBodiless();
    var buf: [4096]u8 = undefined;
    const resp = try req.receiveHead(&buf);
    // ...
}
```

### 15.8 DNS 解析

```zig
const host = try Io.net.HostName.init("example.com");
const addrs = try Io.net.getAddressList(io, gpa, host, 80);
defer gpa.free(addrs);
```

### 15.9 Socket 编程

```zig
const sock = try Io.net.Socket.create(.tcp, .ipv4);
try sock.connect(io, addr);
try sock.writeAll(io, "GET / HTTP/1.0\r\n\r\n");
```

### 15.10 0.16 异步的优势

1. **统一 API**：同步/异步切只换 `Io` 实现。
2. **取消语义**：内置 `error.Canceled` 而不是裸线程被杀。
3. **可移植**：抽象掉 `io_uring` / `IOCP` / 线程池差异。

### 15.11 本章自检

1. `io.async` 与 `io.concurrent` 的区别？
2. `Future.cancel` 的四个语义？
3. `Group` 与 `Select` 的使用场景？
4. 0.16 异步为何读起来比 Rust 简单？

---

## 第 16 章 构建系统与包管理

### 16.1 `build.zig` 与 `build.zig.zon`

0.16 中两个核心文件：

- `build.zig` —— 构建脚本（一个普通 Zig 程序，但只能调用 `std.Build`）
- `build.zig.zon` —— 包定义（依赖、版本）

### 16.2 `build.zig.zon` 格式

```zig
.{
    .name = .my_project,
    .version = "0.1.0",
    .fingerprint = 0x...,         // 64-bit hash
    .minimum_zig_version = "0.16.0",
    .paths = .{ "" },
    .dependencies = .{
        .zls = .{
            .url = "https://github.com/zigtools/zls/archive/refs/tags/0.16.0.tar.gz",
            .hash = "1220...",     // 由 `zig build --build-runner` 生成
        },
    },
}
```

### 16.3 `build.zig` 模板

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const lib_mod = b.createModule(.{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });

    const exe = b.addExecutable(.{
        .name = "myapp",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    b.installArtifact(exe);

    // 测试
    const lib_tests = b.addTest(.{
        .root_module = lib_mod,
    });
    const run_lib_tests = b.addRunArtifact(lib_tests);
    const test_step = b.step("test", "Run tests");
    test_step.dependOn(&run_lib_tests.step);
}
```

### 16.4 常用 build API

```zig
// 模块
const mod = b.createModule(.{
    .root_source_file = b.path("src/foo.zig"),
    .target = target,
    .optimize = optimize,
    .imports = &.{
        .{ .name = "dep", .module = dep_mod },
    },
});

// 可执行
const exe = b.addExecutable(.{
    .name = "app",
    .root_module = mod,
});
b.installArtifact(exe);

// 静态库
const lib = b.addStaticLibrary(.{
    .name = "mylib",
    .root_module = mod,
});

// 测试
const tests = b.addTest(.{ .root_module = mod });
const run_tests = b.addRunArtifact(tests);

// 步骤
const my_step = b.step("gen", "Generate code");
const run_gen = b.addSystemCommand(&.{ "tool", "--out", "src/gen.zig" });
my_step.dependOn(&run_gen.step);
```

### 16.5 0.16 变更点

0.16 移除了 `addModule` 旧 API，改为统一 `createModule` + `.imports` 数组：

```zig
// 0.16 之前
b.addModule("foo", .{ ... });

// 0.16
const foo_mod = b.createModule(.{ ... });
// 在使用方：
const exe = b.addExecutable(.{
    .root_module = b.createModule(.{
        .imports = &.{
            .{ .name = "foo", .module = foo_mod },
        },
    }),
});
```

### 16.6 C 翻译

```zig
const translate_c = b.addTranslateC(.{
    .root_source_file = b.path("src/c.h"),
    .target = target,
    .optimize = optimize,
});
translate_c.linkSystemLibrary("glfw");
const c_mod = translate_c.createModule();

const exe = b.addExecutable(.{
    .root_module = b.createModule(.{
        .imports = &.{
            .{ .name = "c", .module = c_mod },
        },
    }),
});
```

### 16.7 依赖覆盖

```zig
// build.zig.zon
.dependencies = .{
    .zlib = .{ .path = "vendor/zlib" },
},
```

调试某一依赖时常用 `.path` 覆盖。

### 16.8 交叉编译步骤

```bash
$ zig build -Dtarget=aarch64-linux-gnu
$ zig build -Dtarget=wasm32-freestanding
```

输出路径：`./zig-out/bin/...`

### 16.9 常用 build 命令

```bash
zig build                       # 默认 step
zig build test                  # 测试
zig build run                   # 跑
zig build install --prefix /usr/local
zig build -Doptimize=ReleaseFast
zig build -Dtarget=x86_64-windows-gnu
zig build -Dcpu=baseline        # 特定 CPU
zig build -Dstrip=true          # 剥离
zig build -Dno-bin              # 跳过二进制
zig build --build-file alt.zig  # 自定义 build 脚本
zig build --build-runner        # 重新生成 hash
```

### 16.10 本章自检

1. `build.zig.zon` 与 `build.zig` 的职责分工？
2. 0.16 移除 `addModule` 用什么替代？
3. `addTranslateC` 的最新用法？
4. 什么是 `fingerprint`？为何需要它？

---

## 第 17 章 与 C 互操作

### 17.1 Zig 调用 C 函数

```zig
const c = @cImport(@cInclude("stdio.h"));

pub fn main() void {
    _ = c.printf("hello, %d\n", @as(c_int, 42));
}
```

⚠️ **0.16 变更**：0.16 已弃用 `@cImport`，推荐通过 `build.zig` 的 `addTranslateC` 翻译。

### 17.2 0.16 推荐做法

`src/c.h`：

```c
#include <stdio.h>
#include <stdlib.h>
```

`build.zig`：

```zig
const translate_c = b.addTranslateC(.{
    .root_source_file = b.path("src/c.h"),
    .target = target,
    .optimize = optimize,
});
const c_mod = translate_c.createModule();

const exe = b.addExecutable(.{
    .root_module = b.createModule(.{
        .imports = &.{
            .{ .name = "c", .module = c_mod },
        },
    }),
});
```

`src/main.zig`：

```zig
const c = @import("c");
pub fn main() void {
    _ = c.printf("hello, %d\n", @as(c_int, 42));
}
```

### 17.3 几乎无缝的 C 兼容

|Zig 类型 | C 类型 |
|---------|--------|
| `c_int` | `int` |
| `c_uint` | `unsigned int` |
| `c_longlong` | `long long` |
| `c_ulonglong` | `unsigned long long` |
| `c_char` | `char` |
| `c_float` | `float` |
| `c_double` | `double` |
| `*c_void` | `void*` |
| `[*c]T` | `T*` |
| `[*c]const T` | `const T*` |
| `[*:0]c_char` | `char*` （NULL 结尾） |
| `opaque {}` | `struct Foo`（无字段） |
| `extern struct {...}` | `struct {...}` |

### 17.4 双向互操作

```zig
// C 调用 Zig 函数
export fn add(a: c_int, b: c_int) c_int {
    return a + b;
}

// Zig 调用 C 函数
extern "c" fn strlen(s: [*:0]const c_char) usize;

pub fn main() void {
    const len = strlen("hello");
    std.debug.print("{d}\n", .{len});  // 5
}
```

### 17.5 结构体与内存布局

```zig
const CPoint = extern struct {
    x: f32,
    y: f32,
};

extern "c" fn process(p: *CPoint) void;
```

注意：必须用 `extern struct` 才能与 C 兼容。

### 17.6 回调与函数指针

```zig
const Callback = *const fn (c_int) c_int;

extern "c" fn set_callback(cb: Callback) void;

fn myCallback(x: c_int) c_int {
    return x * 2;
}

export fn setup() void {
    set_callback(myCallback);
}
```

### 17.7 C 头文件翻译的限制

`translate-c` 不支持：
1. C++ 名字空间
2. C++ 模板
3. C 宏（常量被替换为值；函数宏无效）
4. 部分 GCC 扩展

⚠️ **常见做法**：C 头文件尽量保持 K&R 风格。

### 17.8 链接静态库

```zig
// build.zig
const lib = b.addStaticLibrary(.{
    .name = "mylib",
    .target = target,
    .optimize = optimize,
});
lib.linkLibC();
```

或者直接链接外部 C 库：

```zig
exe.linkSystemLibrary("z");
exe.linkSystemLibrary("ssl");
```

### 17.9 编译 C 源码

```zig
const lib = b.addObject(.{ .name = "third_party", .target = target, .optimize = optimize });
lib.addCSourceFile(.{ .file = b.path("third_party/foo.c"), .flags = &.{} });
exe.linkObject(lib);
```

### 17.10 复杂 C 互操作：OpenGL

```zig
const gl = @cImport(@cInclude("GL/gl.h"));
const glfw = @cImport(@cInclude("GLFW/glfw3.h"));

pub fn main() !void {
    if (glfw.glfwInit() != glfw.GLFW_TRUE) return error.InitFailed;
    defer glfw.glfwTerminate();

    glfw.glfwWindowHint(glfw.GLFW_CONTEXT_VERSION_MAJOR, 3);
    // ...
}
```

### 17.11 把 C 库封装为 Zig 风格

```zig
// 原始 C: FILE *, fopen, fread, fclose
// Zig 包装：
pub const File = struct {
    inner: *c.FILE,

    pub fn open(path: [:0]const u8) !File {
        const f = c.fopen(path, "r") orelse return error.OpenFailed;
        return .{ .inner = f };
    }
    pub fn close(self: *File) void {
        _ = c.fclose(self.inner);
    }
    // ...
};
```

### 17.12 ABI 兼容的指针

```zig
extern "c" fn cfunc(p: [*c]u8) void;       // C 期望 *uint8_t
var buf: [16]u8 = undefined;
cfunc(&buf);                                // 自动转为 *uint8_t
```

### 17.13 vtable / ucontext 替代

```zig
const VTable = struct {
    read: *const fn (*anyopaque, []u8) anyerror!usize,
    write: *const fn (*anyopaque, []const u8) anyerror!usize,
};

const Stream = struct {
    ptr: *anyopaque,
    vt: *const VTable,

    pub fn read(self: Stream, buf: []u8) !usize {
        return self.vt.read(self.ptr, buf);
    }
};
```

### 17.14 `zig cc` 与 `zig c++`

```bash
$ zig cc foo.c -o foo
$ zig c++ foo.cpp -o foo
```

`zig cc` 是 drop-in 替代 clang/gcc 的 C 编译器，自带 libc/musl/glibc。

### 17.15 本章自检

1. `@cImport` 在 0.16 是否还能用？替代方案？
2. `extern struct` 与 `struct` 的本质区别？
3. `[*c]T` 与 `*T` 的区别？
4. `zig cc` 相对 GCC 的优势？

---

## 第 18 章 SIMD 向量化编程

### 18.1 什么是 SIMD

SIMD（Single Instruction Multiple Data）让一条指令处理多个数据。Zig 用 `@Vector(N, T)` 类型抽象：

```zig
const V = @Vector(4, f32);
const a: V = .{ 1.0, 2.0, 3.0, 4.0 };
const b: V = .{ 5.0, 6.0, 7.0, 8.0 };
const c = a + b;                  // 元素级
```

### 18.2 标量到向量的转换

```zig
const arr = [_]f32{ 1, 2, 3, 4, 5, 6, 7, 8 };
const v: @Vector(4, f32) = arr[0..4].*;
```

⚠️ **0.16 变更**：向量与数组不再内存强转。

```zig
// 0.16 显式
const v: @Vector(4, f32) = @bitCast(@Vector(4, u32), arr[0..4].*);
// 或更简单：
const v = @shuffle(f32, undefined, &[_]@Vector(2, f32){ .{1, 2}, .{3, 4} }, @as(@Vector(4, i32), .{ 0, 1, 2, 3 }));
```

### 18.3 元素级运算

```zig
const a: @Vector(4, f32) = .{ 1, 2, 3, 4 };
const b: @Vector(4, f32) = .{ 10, 20, 30, 40 };
const sum = a + b;       // SIMD 加
const prod = a * b;
// 所有支持的操作：+ - * / % ^ | & << >> ==  != < > <= >= and or
```

### 18.4 规约（Reduce）

```zig
// @reduce 接受操作符与向量，返回标量
const v: @Vector(4, f32) = .{ 1, 2, 3, 4 };
const total = @reduce(.Add, v);     // 10
const mx = @reduce(.Max, v);        // 4
const mn = @reduce(.Min, v);        // 1
```

### 18.5 平台 SIMD 长度

```zig
const builtin = @import("builtin");

fn maxVector(comptime T: type) usize {
    return @max(builtin.target.cpu.arch.advancedVectorExtensions(), 1);
}

// x86_64 baseline SSE: 4 * f32
// AVX2: 8 * f32
// NEON: 4 * f32
```

### 18.6 实战：数组求和

```zig
fn sumVectorized(s: []const f32) f32 {
    const Vec = @Vector(4, f32);
    var i: usize = 0;
    var acc: Vec = @splat(0.0);
    while (i + 4 <= s.len) : (i += 4) {
        const v: Vec = s[i..][0..4].*;
        acc += v;
    }
    var result = @reduce(.Add, acc);
    while (i < s.len) : (i += 1) result += s[i];
    return result;
}
```

### 18.7 实战：字符串搜索

```zig
fn findChar(haystack: []const u8, needle: u8) ?usize {
    const Vec = @Vector(16, u8);
    const n_v: Vec = @splat(needle);
    var i: usize = 0;
    while (i + 16 <= haystack.len) : (i += 16) {
        const chunk: Vec = haystack[i..][0..16].*;
        const eq = chunk == n_v;
        if (@reduce(.Or, eq)) {
            // 找到，继续找精确位置
            for (0..16) |j| if (haystack[i + j] == needle) return i + j;
        }
    }
    while (i < haystack.len) : (i += 1) {
        if (haystack[i] == needle) return i;
    }
    return null;
}
```

### 18.8 平台特定 intrinsics

```zig
// 跨平台
const dot = @reduce(.Add, a * b);

// 平台调用
if (builtin.cpu.arch == .x86_64) {
    const a = @as(*const [4]f32, @ptrCast(&v));
    // ...
}
```

### 18.9 编译期自动向量化

有时不需要手写 `@Vector`——编译器会自动向量化标量循环：

```zig
fn sumSimple(s: []const f32) f32 {
    var acc: f32 = 0;
    for (s) |x| acc += x;
    return acc;
}
```

Release 模式下 LLVM 通常会向量化。

### 18.10 SIMD 与对齐

```zig
const aligned = std.mem.bytesAsSlice(f32, &aligned_buf);
```

⚠️ **关键**：SIMD 指令通常要求 16/32 字节对齐。

### 18.11 本章自检

1. `@Vector` 与 `[N]T` 的核心区别？
2. `@reduce` 的作用？
3. 什么时候手写 SIMD 而不是依赖编译优化？
4. SIMD 对齐为何重要？

---

## 第 19 章 测试、调试与性能分析

### 19.1 测试块

```zig
const std = @import("std");

test "basic" {
    try std.testing.expect(true);
    try std.testing.expectEqual(@as(i32, 42), 42);
    try std.testing.expectEqualStrings("hello", "hello");
    try std.testing.expectError(error.NotFound, failing());
}
```

### 19.2 测试运行

```bash
$ zig test foo.zig
$ zig build test
```

### 19.3 测试过滤器

```bash
$ zig test --test-filter "basic" foo.zig
$ zig test --test-filter "basic.*" foo.zig
```

### 19.4 测试分配器

```zig
test "leak check" {
    const a = std.testing.allocator;
    const buf = try a.alloc(u8, 100);
    defer a.free(buf);
    // 如果泄漏，测试失败
}
```

### 19.5 Doc 测试

```zig
/// Add two numbers.
///
/// ```
/// const std = @import("std");
/// try std.testing.expectEqual(@as(i32, 5), add(2, 3));
/// ```
pub fn add(a: i32, b: i32) i32 {
    return a + b;
}
```

Doc 测试在 `zig build` 生成文档时自动运行。

### 19.6 标准测试工具

```zig
const std = @import("std");
test "all" {
    try std.testing.refAllDecls(@This());  // 触发所有顶层 test
}
```

### 19.7 调试

```bash
$ zig build -Doptimize=Debug
$ gdb ./zig-out/bin/myapp
(gdb) b main
(gdb) r
(gdb) p foo
(gdb) n
```

Zig 生成完整 DWARF 调试信息。LLDB / VS Code 都能直接 attach。

### 19.8 运行时断言

```zig
std.debug.assert(x > 0);          // Debug 开启
std.debug.panic("oops", .{});      // 总是 panic
unreachable;                       // 编译期未穷尽时
```

### 19.9 性能分析

```bash
# perf
$ perf record ./myapp
$ perf report

# Instruments (macOS)
# vtune (Linux)
```

### 19.10 火焰图

```bash
$ perf record -F 99 -p $(pgrep myapp) -g
$ perf script | stackcollapse-perf | flamegraph.pl > flame.svg
```

### 19.11 缓存分析

```zig
# Hot loop
for (0..1000) |i| {
    for (0..1000) |j| {
        a[j] = a[j] + b[j];
    }
}
```

打开 `perf stat ./myapp` 看 cache-miss 比例。

### 19.12 时间测量

```zig
const Io = std.Io;
const start = try Io.Clock.Timestamp.now();
try doWork();
const end = try Io.Clock.Timestamp.now();
const elapsed = end.since(start);
std.debug.print("elapsed: {}\n", .{elapsed});
```

### 19.13 模糊测试

```zig
const builtin = @import("builtin");

pub fn main() !void {
    var gpa: std.heap.GeneralPurposeAllocator(.{}){} = .{};
    defer _ = gpa.deinit();

    try std.testing.fuzz(&.{
        .input = "seed",
        .corpus = &.{"a", "b", "c"},
    }, fuzzTarget, .{});
}

fn fuzzTarget(input: []const u8) anyerror!void {
    _ = input;
}
```

0.16 引入 AST Smith 增强的 fuzz：

```bash
$ zig build fuzz -- --help
```

### 19.14 静态分析

```bash
$ zig ast-check foo.zig
```

### 19.15 本章自检

1. `std.testing.allocator` 的失败语义？
2. Doc 测试如何运行？
3. Debug 模式的关键检查项？
4. 如何用 perf 看 cache miss？

---

## 第 20 章 高级主题与惯用法

### 20.1 类型驱动开发

Zig 的强大在于"用类型表达约束"。例如：

```zig
// 整数 N 必须 > 0
fn NonZero(comptime n: comptime_int) type {
    if (n <= 0) @compileError("must be > 0");
    return @Int(.unsigned, @bitSizeOf(@TypeOf(n)));
}

const Dist = NonZero(100);
```

### 20.2 RAII 替代：`defer` 模式

```zig
const R = struct {
    data: []u8,

    fn init(alloc: Allocator, size: usize) !R {
        return .{ .data = try alloc.alloc(u8, size) };
    }
    fn deinit(self: *R, alloc: Allocator) void {
        alloc.free(self.data);
    }
};

var r = try R.init(allocator, 100);
defer r.deinit(allocator);
```

### 20.3 自定义格式

```zig
const Point = struct {
    x: f32,
    y: f32,
    pub fn format(self: Point, w: *std.Io.Writer) std.Io.Writer.Error!void {
        try w.print("({d}, {d})", .{ self.x, self.y });
    }
};

const p = Point{ .x = 1, .y = 2 };
try w.print("{f}", .{p});  // 需要 std.fmt.Alt
```

### 20.4 公开 API 与不透明类型

```zig
// 库导出
const Handle = opaque {
    fn create() *Handle { ... }
    fn destroy(self: *Handle) void { ... }
};
```

### 20.5 类型转换集合

```zig
@as(T, value)               // 显式转换
@intCast(value)             // 整数宽度
@floatCast(value)           // 浮点宽度
@ptrCast(ptr)               // 指针类型
@alignCast(ptr)             // 对齐
@bitCast(value)             // 位级转换
@enumFromInt(value)         // 整数生成枚举
@intFromEnum(value)         // 枚举转整数
@truncate(value)            // 截断
@as(T, @bitCast(value))     // 强制
```

### 20.6 内存安全标记

```zig
fn safeRead(buf: []const u8, idx: usize) u8 {
    if (idx >= buf.len) return 0;    // 边界检查
    return buf[idx];
}
```

### 20.7 编译期解析

读取并编译期解析文件（自定义语言）：

```zig
const source = @embedFile("config.txt");
const parsed = comptime parseConfig(source);
```

### 20.8 编译期字符串生成

```zig
const v = std.fmt.comptimePrint("version {d}.{d}", .{ 0, 16 });
```

### 20.9 错误聚合

```zig
const Errors = error{A, B} || error{C, D};
```

### 20.10 性能惯用法

✅ **OK 习惯**：
1. 优先用栈/数组
2. `Allocator` 注入避免隐藏分配
3. 对内层循环使用 SIMD
4. 关键路径 `noinline` 让 LLVM 已知
5. 避免 `catch |err| return err` 模式（直接 `try`）

### 20.11 资源获取即初始化（RAII）替代

Zig 没有 `Drop` 特质，但 `defer` 模式与 std.builtin.DefaultPrimitives 已被 `std.Io` 收编。

### 20.12 库设计原则

1. **公开类型用 `opaque`**（强制 ABI 稳定）
2. **接收 `Allocator` 而不是用全局**
3. **错误集合尽量精确**
4. **API 文档嵌入代码（`///`）**
5. **构造器命名 `init`**
6. **释放器命名 `deinit`**
7. **避免 `sentinel` 字段除非必要**
8. **优先用 `pub usingnamespace` 暴露子模块**

### 20.13 跨平台代码

```zig
const builtin = @import("builtin");
if (builtin.os.tag == .windows) {
    // Windows 特定
} else {
    // POSIX
}

if (builtin.cpu.arch == .x86_64) {
    // x86_64 特定
}
```

### 20.14 综合作业：实现一个简单 HTTP 服务器

```zig
// 0.16 风格
const std = @import("std");
const Io = std.Io;

pub fn main(init: std.process.Init) !void {
    const io = init.io;
    const gpa = init.gpa;

    var server = try Io.net.Socket.create(.tcp, .ipv4);
    defer server.close(io);

    try server.bind(.{ .port = 8080 });
    try server.listen(128);
    std.debug.print("listening on :8080\n", .{});

    while (true) {
        var conn = try server.accept(io);
        var fut = io.async(handleConn, .{ io, gpa, conn });
        defer if (fut.cancel(io)) |c| c.close(io) else |_| {};
        _ = try fut.await(io);
    }
}

fn handleConn(io: Io, gpa: Allocator, conn: Io.net.Socket) !void {
    defer conn.close(io);
    var buf: [4096]u8 = undefined;
    const req = try conn.read(io, &buf);
    _ = req;
    try conn.writeAll(io,
        \\HTTP/1.1 200 OK\r\n
        \\Content-Type: text/plain\r\n
        \\Content-Length: 5\r\n
        \\Connection: close\r\n
        \\\r\n
        \\hello
    );
}
```

### 20.15 进阶阅读

学完本教程后，建议继续：
1. 读 `std` 源码（特别是 `std/Io.zig`、`std/Build.zig`、`std/mem/Allocator.zig`）
2. 实现一个小型 DSL（`comptime` 解析）
3. 写一个分配器（slab / bump）
4. 写一个 OS 内核（参考 `Zig Osborne` 系列）
5. 提交一个 PR 给 `ziglang/zig`

### 20.16 本章自检

1. Zig 的"RAII 替代"是什么？
2. 库对外暴露的类型为何用 `opaque`？
3. `comptime` 解析能与运行时解析共用算法吗？
4. 跨平台代码的组织建议？


---

## 附录 A 内置函数速查

### A.1 类型与值

| 内置 | 用途 | 0.16 状态 |
|------|------|-----------|
| `@as(T, v)` | 显式转换类型 | ✅ |
| `@intCast(v)` | 整数宽度收窄 | ✅ |
| `@floatCast(v)` | 浮点宽度收窄 | ✅ |
| `@ptrCast(p)` | 指针类型转换 | ✅ |
| `@alignCast(p)` | 对齐转换 | ✅ |
| `@bitCast(v)` | 位级转换（大小必须相同） | ✅ |
| `@intFromEnum(e)` | 枚举 → 整数 | ✅ |
| `@enumFromInt(i)` | 整数 → 枚举 | ✅ |
| `@floatFromInt(i)` | 整数 → 浮点 | ✅ |
| `@intFromFloat(f)` | 浮点 → 整数 | ✅ |
| `@truncate(v)` | 整数截断 | ✅ |
| `@errSetCast(e)` | 错误集合 cast | ✅ |
| `@errorFromInt(i)` | 整数 → 错误 | ✅ |
| `@intFromError(e)` | 错误 → 整数 | ✅ |
| `@ptrFromInt(i)` | 整数 → 指针 | ✅ |
| `@intFromPtr(p)` | 指针 → 整数 | ✅ |

### A.2 类型生成

| 内置 | 用途 |
|------|------|
| `@Type(t)` | 旧 API，已废弃 |
| `@Int(s, n)` | 整数类型 |
| `@Float(n)` | 浮点类型 |
| `@Pointer(s, a, c, sent)` | 指针类型 |
| `@Array(t, n, ...)` | 数组类型 |
| `@Vector(n, t)` | SIMD 向量类型 |
| `@Struct(layout, bi, names, types, attrs)` | 结构体 |
| `@Union(layout, tag, names, types, attrs)` | 联合 |
| `@Enum(tag, mode, names, values)` | 枚举 |
| `@Fn(params, attrs, ret, attrs)` | 函数类型 |
| `@Tuple(types)` | 元组 |
| `@EnumLiteral()` | 枚举字面量类型 |
| `@type(T)` | 汇编量构造 |

### A.3 运行时

| 内置 | 用途 |
|------|------|
| `@typeName(T)` | 类型名 |
| `@typeInfo(T)` | 类型信息 |
| `@sizeOf(T)` | 大小（字节） |
| `@alignOf(T)` | 对齐 |
| `@bitSizeOf(T)` | 位大小 |
| `@hasDecl(T, name)` | 是否有声明 |
| `@hasField(T, name)` | 是否有字段 |
| `@FieldType(T, n)` | 字段类型 |
| `@typeOf(v)` | 表达式类型 |
| `@embedFile(path)` | 嵌入文件内容 |
| `@src()` | 当前源码位置 |
| `@panic(msg)` | 触发 panic |
| `@trap()` | 触发不可恢复陷阱 |
| `@branchHint(c)` | 告诉编译器分支偏向 |
| `@atomicLoad(ptr, order)` | 原子读 |
| `@atomicStore(ptr, val, order)` | 原子写 |
| `@cmpxchgWeak(...)` | CAS weak |
| `@cmpxchgStrong(...)` | CAS strong |
| `@fence(order)` | 内存屏障 |
| `@abs(v)` | 绝对值 |
| `@min(a, b)` | 最小 |
| `@max(a, b)` | 最大 |
| `@clz(v)` | 前导零 |
| `@ctz(v)` | 尾随零 |
| `@popCount(v)` | 1 位数 |
| `@byteSwap(v)` | 字节交换 |
| `@bitReverse(v)` | 位反转 |
| `@divFloor(a, b)` | 向下取整除 |
| `@divTrunc(a, b)` | 截断除 |
| `@mod(a, b)` | 模 |
| `@rem(a, b)` | 余 |
| `@shlExact(a, b)` | 精确左移 |
| `@shrExact(a, b)` | 精确右移 |
| `@rotateLeft(a, b)` | 循环左移 |
| `@rotateRight(a, b)` | 循环右移 |
| `@mulAdd(a, b, c)` | 乘加 |
| `@sqrt(v)` | 平方根 |
| `@sin(v)` | 正弦 |
| `@cos(v)` | 余弦 |
| `@tan(v)` | 正切 |
| `@exp(v)` | 指数 |
| `@exp2(v)` | 2 的幂 |
| `@log(v)` | 自然对数 |
| `@log2(v)` | 二进制对数 |
| `@log10(v)` | 十进制对数 |
| `@floor(v)` | 向下取整 |
| `@ceil(v)` | 向上取整 |
| `@round(v)` | 四舍五入 |
| `@trunc(v)` | 截断 |
| `@subOverflow(a, b)` | 检查减法溢出 |
| `@addOverflow(a, b)` | 检查加法溢出 |
| `@mulOverflow(a, b)` | 检查乘法溢出 |
| `@shlWithOverflow(a, b)` | 检查左移溢出 |
| `@unionInit(T, n, v)` | 联合初始化 |
| `@externOptions` | 外部选项 |
| `@prefetch(...)` | 预取 |
| `@call(.never_inline, f, args)` | 控制内联 |
| `@compileError(msg)` | 编译期错误 |
| `@compileLog(...)` | 编译期日志 |
| `@breakpoint()` | 断点 |
| `@import(path)` | 导入 |
| `@export(decl, name)` | 导出 |
| `@extern(T, opts)` | 外部符号 |
| `@Frame(comptime)` | 帧类型 |
| `@cInclude(...)` | C include |
| `@cDefine(...)` | C define |
| `@cImport(...)` | C import |
| `@hasFn(T, name)` | 是否有函数 |
| `@inComptime()` | 是否在编译期 |
| `@offsetOf(T, f)` | 字段偏移 |
| `@splat(v)` | 广播到向量 |
| `@shuffle(...)` | 向量洗牌 |
| `@reduce(op, v)` | 向量规约 |
| `@select(cond, a, b)` | 向量选择 |
| `@errorName(e)` | 错误名 |
| `@errorToInt(e)` | 错误 → 整数 |
| `@intToError(i)` | 整数 → 错误 |
| `@tagName(t)` | 枚举值名 |
| `@errorReturnTrace()` | 错误回溯 |
| `@frameSize(f)` | 帧大小 |
| `@frame()` | 当前帧 |
| `@frameAddress()` | 帧地址 |
| `@returnAddress()` | 返回地址 |
| `@constCast` | const cast |
| `@volatileCast` | volatile cast |
| `@errSetCast` | 错误集合强制 |
| `@alignLog2` | 对齐的对数 |
| `@divExact` | 精确除 |
| `@include` | 包含文件 |

> [INFERENCE: 附录 A 列出 0.16 仍保留/重命名的核心内置函数；其余可能已 deprecated 或重命名。生产代码请参考最新 release notes。]

### A.4 编译期专用

| 内置 | 用途 |
|------|------|
| `@typeInfo(T)` | 仅编译期 |
| `@typeName(T)` | 仅编译期 |
| `@hasDecl(T, name)` | 仅编译期 |
| `@hasField(T, name)` | 仅编译期 |
| `@FieldType(T, name)` | 仅编译期 |
| `@typeOf(v)` | 编译期与运行时均可 |
| `@embedFile(path)` | 编译期 |
| `@src()` | 编译期 |
| `@compileError` | 编译期 |
| `@compileLog` | 编译期 |

### A.5 关键字总览

| 类别 | 关键字 |
|------|--------|
| 声明 | `const`, `var`, `fn`, `test`, `usingnamespace` |
| 控制流 | `if`, `else`, `switch`, `while`, `for`, `break`, `continue`, `return` |
| 错误 | `try`, `catch`, `throw`, `errdefer` |
| 异步 | `async`, `await`, `cancel`, `suspend`, `resume` |
| 类型 | `anytype`, `noreturn`, `void`, `comptime` |
| 编译 | `inline`, `noinline`, `comptime`, `callconv` |
| 内存 | `volatile`, `allowzero`, `linksection` |
| 可见 | `pub`, `export`, `extern` |
| 别 | `opaque`, `packed`, `extern` |
| 终止 | `unreachable`, `defer`, `errdefer` |
| 其他 | `asm`, `or` |

### A.6 标准类型对照

| Zig | C 头文件 |
|-----|----------|
| `c_int` | `<stdint.h>` |
| `c_long` | `<stdint.h>` |
| `c_longlong` | `<stdint.h>` |
| `c_ulonglong` | `<stdint.h>` |
| `c_char` | `<stdint.h>` |
| `c_float` | `<float.h>` |
| `c_double` | `<float.h>` |
| `c_longdouble` | `<float.h>` |
| `c_void` | `<stddef.h>` |
| `usize` | `<stddef.h>` |
| `isize` | `<stddef.h>` |
| `NULL` | `<stddef.h>` |

---

## 附录 B 错误集合与常见错误码

### B.1 通用错误

```zig
error.OutOfMemory,
error.FileNotFound,
error.AccessDenied,
error.InvalidArgument,
error.IO,
error.Unexpected,
error.SystemResources,
error.OperationAborted,
error.BrokenPipe,
error.ConnectionResetByPeer,
error.ConnectionRefused,
error.NotOpenForReading,
error.NotOpenForWriting,
error.EndOfStream,
error.UnexpectedEndOfFile,
error.WouldBlock,
error.TimedOut,
error.IsDir,
error.NotDir,
error.FileTooBig,
error.NoSpaceLeft,
error.NameTooLong,
error.PathAlreadyExists,
error.FileExists,
error.FileBusy,
error.PathNotFound,
error.Unreachable,
```

### B.2 子系统错误

`std.fs.File.OpenError`:

```zig
error{NotFound, AccessDenied, IsDir, NotDir, NameTooLong, BadPathName, FileBusy, SymLinkLoop, ProcessFdQuotaExceeded, SystemFdQuotaExceeded, SystemResources, NoSpaceLeft, FileTooBig, DeviceBusy, InvalidUtf8, FileLocksNotSupported, WouldBlock, DeadlineExceeded, Canceled}
```

`std.posix.ReadError`:

```zig
error{InputOutput, IsDir, BrokenPipe, Overflow, SystemResources, WasInterrupted, Unexpected, Canceled, WouldBlock}
```

### B.3 0.16 错误重命名

0.16 重命名了多个错误：

| 旧 | 新 |
|----|----|
| `error.RenameAcrossMountPoints` | `error.CrossDevice` |
| `error.NotSameFileSystem` | `error.CrossDevice` |
| `error.SharingViolation` | `error.FileBusy` |
| `error.EnvironmentVariableNotFound` | `error.EnvironmentVariableMissing` |
| `error.PathAlreadyExists` (Dir.rename) | `error.DirNotEmpty` |

---

## 附录 C `std.builtin` 关键结构体参考

### C.1 `Type`

```zig
pub const Type = union(enum) {
    type: void,
    void: void,
    bool: void,
    noreturn: void,
    int: Int,
    float: Float,
    pointer: Pointer,
    array: Array,
    @"struct": Struct,
    comptime_float: void,
    comptime_int: void,
    undefined: void,
    null: void,
    optional: Optional,
    error_union: ErrorUnion,
    error_set: ErrorSet,
    @"enum": Enum,
    @"union": Union,
    @"fn": Fn,
    @"opaque": Opaque,
    frame: Frame,
    @"anyframe": AnyFrame,
    vector: Vector,
    @"enum_literal": void,
};
```

### C.2 `Type.Int`

```zig
pub const Int = struct {
    signedness: Signedness,
    bits: u16,
};

pub const Signedness = enum { signed, unsigned };
```

### C.3 `Type.Pointer`

```zig
pub const Pointer = struct {
    size: Size,
    is_const: bool,
    is_volatile: bool,
    alignment: u16,
    address_space: AddressSpace,
    child: type,
    is_allowzero: bool,
    sentinel_ptr: ?*const anyopaque,
};

pub const Size = enum { one, many, slice, c };
```

### C.4 `Type.Array`

```zig
pub const Array = struct {
    len: u64,
    child: type,
    sentinel_ptr: ?*const anyopaque,
};
```

### C.5 `Type.Struct`

```zig
pub const Struct = struct {
    layout: ContainerLayout,
    backing_integer: ?type,
    fields: []const StructField,
    decls: []const Decl,
    is_tuple: bool,
};
```

### C.6 `Type.Union`

```zig
pub const Union = struct {
    layout: ContainerLayout,
    tag_type: ?type,
    fields: []const UnionField,
    decls: []const Decl,
};
```

### C.7 `Type.Enum`

```zig
pub const Enum = struct {
    tag_type: type,
    fields: []const EnumField,
    decls: []const Decl,
    is_exhaustive: bool,
};
```

### C.8 `Type.Fn`

```zig
pub const Fn = struct {
    calling_convention: CallingConvention,
    is_generic: bool,
    is_var_args: bool,
    return_type: type,
    params: []const Param,
};
```

### C.9 `Type.Optional`

```zig
pub const Optional = struct {
    child: type,
};
```

### C.10 `Type.ErrorUnion`

```zig
pub const ErrorUnion = struct {
    error_set: type,
    payload: type,
};
```

### C.11 `Type.ErrorSet`

```zig
pub const ErrorSet = struct {
    fields: []const Error,
};
```

### C.12 `CallingConvention`

```zig
pub const CallingConvention = enum {
    auto,
    c,
    naked,
    async,
    @"x86_64_sysv",
    @"x86_64_windows",
    @"x86_64_vector",
    @"x86_interrupt",
    @"x86_16",
    @"x86_fast",
    @"aarch64_aapcs",
    @"aarch64_aapcs_darwin",
    @"aarch64_vfabi",
    @"aarch64_windows",
    @"arm_aapcs",
    @"arm_aapcs_vfp",
    @"arm_interrupt",
    @"avr_gnu",
    @"riscv64_lp64",
    @"riscv32",
    @"wasm_mvp",
};
```

---

## 附录 D 术语表 / 索引

### D.1 术语

- **ABI** —— Application Binary Interface，调用约定、结构体布局、符号命名等。
- **Allocation** —— 内存分配。
- **Allocator** —— 分配器接口。
- **Arena** —— 一次性释放所有内存的分配器。
- **Build mode** —— `Debug`, `ReleaseSafe`, `ReleaseFast`, `ReleaseSmall`。
- **Builtin function** —— `@xxx` 形式由编译器解释的函数。
- **C ABI** —— C 调用约定 + 布局。
- **Comptime** —— 编译期。
- **Container Layout** —— `auto`, `extern`, `packed`。
- **Error set** —— 错误集合。
- **Error union** —— `E!T`。
- **Extern** —— C 兼容布局。
- **fingerprint** —— 包唯一标识。
- **Function pointer** —— 函数指针。
- **Generic** —— 泛型。
- **Inline assembly** —— 内联汇编。
- **Io** —— 0.16 引入的 I/O 接口。
- **M:N threading** —— 协程。
- **main** —— 入口函数。
- **Opaque** —— 不透明类型。
- **Optional** —— `?T`。
- **packed** —— 位级精确布局。
- **Packed struct** —— 紧凑布局结构体。
- **Packed union** —— 紧凑布局联合。
- **Pointer** —— 指针。
- **Sentinel** —— 数组终止符。
- **Slice** —— `[]T`。
- **Source location** —— 源码位置。
- **Tagged union** —— 标记联合。
- **Target** —— 编译目标。
- **Vtable** —— 虚函数表。
- **Zig Software Foundation** —— ZSF，Zig 非营利组织。
- **ZON** —— Zig Object Notation，包定义格式。

### D.2 主题索引

- **异步 I/O**：第 15 章
- **原子操作**：第 12.4 节
- **并发**：第 15 章
- **测试**：第 19 章
- **分配器**：第 13 章
- **SIMD**：第 18 章
- **泛型**：第 9 章
- **C 互操作**：第 17 章
- **构建系统**：第 16 章
- **编译期**：第 8 章
- **内存模型**：第 3, 5 章
- **错误处理**：第 7 章
- **类型系统**：第 3, 6, 10 章
- 字符串：第 5.5 节
- 文件 I/O：第 14 章
- 网络：第 15.7 节
- 性能：第 18, 19 章
- 反射：第 11 章
- 调试：第 19.7 节
- 打包：第 16 章
- 模块化：第 9, 16 章
- 跨平台：第 1.5, 20.13 节
- 惯用法：第 20 章

### D.3 速查小贴士

```zig
// 文件开头的常用 import
const std = @import("std");
const builtin = @import("builtin");
const mem = std.mem;
const Allocator = mem.Allocator;
const Io = std.Io;

// 调试输出
std.debug.print("x={d} s={s}\n", .{ x, s });

// 错误冒泡
try risky();

// 通用分配器
var gpa: std.heap.GeneralPurposeAllocator(.{}){} = .{};
const alloc = gpa.allocator();
defer _ = gpa.deinit();

// 数组字面量
const xs = [_]u32{ 0, 1, 2 };

// 切片
const sl = xs[0..];

// 字符串
const s: []const u8 = "hello";

// 编译期断言
comptime assert(x > 0);

// 编译期 for
inline for (xs) |x| { _ = x; }

// 数组与向量
const V = @Vector(4, u32);
const v: V = .{ 1, 2, 3, 4 };
```

### D.4 常见陷阱（速查）

1. 0.16 起 `@cImport` 已 deprecated，迁移到 `build.zig`。
2. `*align(1) u8` 与 `*u8` 0.16 起是不同类型。
3. packed union 字段未用满位需要 `=> comptime unreachable`。
4. 错误联合必须被消费（否则 `must_use` 编译错误）。
5. `ArrayList` 0.16 起是 unmanaged，操作要传 `allocator`。
6. `std.process.Init` 提供 `gpa`/`arena`/`io`，不再用全局。
7. `ArenaAllocator` 0.16 起线程安全。
8. `ThreadSafeAllocator` 0.16 已删除。
9. `Recursive` mutex 0.16 已删除。
10. `meta.declList`, `SegmentedList` 等 0.16 已删除。
11. `Io.GenericReader`, `Io.AnyWriter`, `FixedBufferStream` 0.16 已删除。
12. `fmt.Formatter` 0.16 重命名为 `Alt`。
13. `fmt.format` 0.16 重命名为 `std.Io.Writer.print`。
14. `fmt.bufPrintZ` 0.16 重命名为 `bufPrintSentinel`。
15. `fmt.FormatOptions` 0.16 重命名为 `Options`。
16. `BitSet`, `EnumSet` 0.16 起使用 decl literal 替代 `initEmpty`/`initFull`。
17. 0.16 起 `dynLib` Windows 支持已移除。
18. `std.posix` 与 `std.os.windows` 0.16 起不再直接暴露，所有 I/O 通过 `std.Io`。
19. `Thread.Pool` 0.16 起已被删除。
20. `Builtin.subsystem` 0.16 已删除；改用 `zig.Subsystem`。

### D.5 Zig 哲学一句话

> "Make every feature redundant."

> —— Andrew Kelley，Zig 作者

这意味着：每一种能力都有多种实现方式（手动内存管理、显式控制流、显式错误传播），用户可以根据需要取舍，而不是被迫接受某一种"惯用风格"。

---

## 终章：成为 Zig 专家的路径

恭喜完成本教程。要成为 Zig 技术专家：

1. **每日阅读 `std` 源码 30 分钟** —— 选一个模块深入。
2. **每周写一个小型项目** —— 用 Zig 解决自己的实际问题。
3. **每月向 `ziglang/zig` 提一个 PR** —— 即使只是文档 typo。
4. **每季度跟一次 release notes** —— 0.16 后还会有 0.17/0.18/1.0。
5. **精通相关的底层** —— 链接器、ABI、操作系统、汇编。

Zig 仍是一个年轻语言，正处于"定义 1.0"的阶段。**学完这门语言，意味着你能在它最终定型之前就深度参与**——这是其他系统语言都不具备的机会。

祝你在 Zig 之旅中收获"简单 + 强大"的双重体验。

---

> **本教程版本**：基于 Zig 0.16.0（2026 年 4 月 14 日正式发布）编写。
> **最后更新**：2026 年 8 月 1 日。
> **许可**：CC BY-SA 4.0（可自由复制与衍生，需注明来源）。

---
