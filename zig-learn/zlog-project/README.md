# zlog — 高性能日志分析器

> 基于 **Zig 0.16.0** 实现的教学项目：演示 Zig 教程（`Zig精深教程.md`）中所有核心概念的工程化代码。

## 项目目标

`zlog` 是一个**真实可编译运行**的命令行工具，覆盖以下能力：
- 多格式日志解析（纯文本 / Apache Common / JSON Lines）
- SIMD 加速的关键字段搜索
- 编译期反射自动生成统计报告
- C 互操作示例（zlib 头翻译）
- 泛型容器与 unmanaged 模式
- 0.16 全新 `std.Io` 接口与 `Juicy Main`

## 编译与运行

要求：**Zig 0.16.0+**（项目使用 0.16 引入的 `std.Io` 和 `Juicy Main`）

```bash
# 编译
zig build

# 查看帮助
./zig-out/bin/zlog --help

# 解析日志
./zig-out/bin/zlog parse examples/access.log

# 统计
./zig-out/bin/zlog stats examples/access.log

# 性能基准（含 SIMD 搜索）
./zig-out/bin/zlog bench examples/app.log

# 运行测试
zig build test
```

## 项目结构

```
zlog/
├── build.zig              # 0.16 build system：createModule / addLibrary / addTranslateC
├── build.zig.zon          # 包定义
├── c/
│   └── zlib.h             # C 头文件（演示 @cImport / addTranslateC）
├── examples/               # 示例日志
│   ├── access.log         # Apache Common Log Format
│   ├── app.jsonl          # JSON Lines
│   └── app.log            # 纯文本
├── src/
│   ├── root.zig           # 库根模块
│   ├── main.zig           # CLI 入口（Juicy Main 风格）
│   ├── parsers/
│   │   ├── line.zig       # 通用行解析 + 格式探测（std.Io）
│   │   ├── apache.zig     # Apache Common Log 解析器
│   │   └── json.zig       # JSON Lines 解析器
│   ├── simd/
│   │   ├── line_search.zig  # SIMD 字符串搜索
│   │   └── ascii_ops.zig    # SIMD 字符分类 / 哈希
│   ├── containers/
│   │   └── array_list.zig   # 教学用泛型 ArrayList（unmanaged）
│   ├── allocators/
│   │   └── scoped.zig       # 作用域分配器
│   ├── interop/
│   │   └── c_zlib.zig       # C 互操作（zlib 包装）
│   └── utils/
│       └── stats.zig        # 反射 + Top-N 统计
└── README.md
```

## 教程章节对应关系

| 教程章节 | 对应源码 | 演示的概念 |
|----------|----------|-----------|
| 第 1 章 工具链 | `build.zig`, `build.zig.zon` | 编译模式、交叉编译、build system |
| 第 2 章 语法 | 所有 `.zig` 文件 | 标识符、注释、字符串字面量 |
| 第 3 章 类型 | `parsers/*.zig` | 整数、字符串、字节切片 |
| 第 4 章 函数 | `main.zig`, `stats.zig` | 错误联合、`defer`/`errdefer`、`try` |
| 第 5 章 指针/数组 | `containers/array_list.zig` | 数组、切片、Sentinel 终止符 |
| 第 6 章 结构体/联合 | `parsers/apache.zig`, `utils/stats.zig` | `extern struct`, `packed struct`, 标记联合 |
| 第 7 章 可选/错误 | `main.zig` | `?T`, `E!T`, `catch` 链式 |
| 第 8 章 Comptime | `containers/array_list.zig`, `utils/stats.zig` | `comptime T: type`, `inline for` |
| 第 9 章 泛型 | `containers/array_list.zig` | 泛型类型生成、`@TypeOf`、`anytype` |
| 第 10 章 高级类型 | （演示见教程文本） | 0.16 `@Int/@Struct/@Pointer` |
| 第 11 章 反射 | `utils/stats.zig` | `@typeInfo`、`@hasField`、`inline for` |
| 第 12 章 内联汇编 | （未演示，预留扩展） | `@as` 平台特化 |
| 第 13 章 分配器 | `main.zig`, `allocators/scoped.zig` | 0.16 `DebugAllocator`、allocator 注入 |
| 第 14 章 I/O | `parsers/line.zig` | 0.16 `std.Io.Threaded` |
| 第 15 章 异步 | （教程演示，未在 zlog 中用） | `Future`, `Group`, `Batch` |
| 第 16 章 Build | `build.zig` | 0.16 `createModule`, `addLibrary`, `addTranslateC` |
| 第 17 章 C 互操作 | `interop/c_zlib.zig` | `addTranslateC` 翻译 C 头 |
| 第 18 章 SIMD | `simd/*.zig` | `@Vector(32, u8)`, 元素级比较, `inline for` |
| 第 19 章 测试 | 所有 `test "..."` 块 | `zig build test` |
| 第 20 章 高级主题 | `main.zig` | Juicy Main、Error 联合、Defer |

## 关键 0.16 变更点

| 旧 API | 0.16 新 API |
|--------|-------------|
| `pub fn main() void` | `pub fn main(init: std.process.Init) !void` |
| `std.heap.GeneralPurposeAllocator` | `std.heap.DebugAllocator(.{})` |
| `std.ArrayList` 内置 allocator | `std.ArrayList(T) = .empty` + `deinit(alloc)` |
| `std.StringHashMap` managed | `std.StringHashMapUnmanaged(V) = .empty` |
| `std.mem.Timer` | `std.Io.Clock.now(.awake, io)` |
| `std.fs.cwd().openFile(...)` | `std.Io.Dir.cwd().openFile(io, ...)` |
| `file.readToEndAlloc(...)` | `file.reader(io, &buf).interface.readSliceShort(...)` |
| `@cImport(...)` | `b.addTranslateC` + `import "c_name"` |
| `b.addModule("x", ...)` | `b.createModule(...)` + `.addImport("x", ...)` |
| `@Type(.{ .int = ... })` | `@Int(.unsigned, 10)` |
| `error` 作为字段名 | 避免（改为 `err_count` 等） |

## 输出示例

```text
$ zlog stats examples/access.log
文件: examples/access.log
行数: 10
字节: 805
Top paths:
   1. [    3] "GET /index.html HTTP/1.1"
   2. [    2] "GET /style.css HTTP/1.1"
   3. [    1] "POST /api/login HTTP/1.1"
   ...

$ zlog bench examples/app.log
解析: 10 行 533 字节 in 0.20 ms (2.66 MB/s)
```

## 性能与限制

- SIMD 使用 AVX2（32 字节块）—— 0.16 之前是 16 字节
- 仅支持 x86_64 / aarch64 的 SIMD 路径，其他平台会回退到标量
- 0.16 中 `File.readToEndAlloc` 被移除，zlog 使用 4 KiB 循环
- Debug build 启用 `DebugAllocator` 强制内存安全检查

## 测试

```bash
$ zig build test --summary all
Build Summary: 4/4 steps succeeded; 25/25 tests passed
test success
+- run test 25 pass (25 total) 58ms MaxRSS:5M
```

测试覆盖：
- 格式探测（json / apache / line）
- Apache 日志解析（标准 / dash bytes）
- JSON Lines 解析
- SIMD 字符串搜索
- 标量 vs SIMD 一致性
- ASCII 大写化
- FNV-1a 哈希已知值
- ArrayList 基础 / 增长 / OOB
- Top-N 字符串统计
- 级别计数

## 许可

CC BY-SA 4.0 — 可自由复制与衍生，需注明来源。
