// =============================================================================
// 21_ffi_interop - FFI 与跨语言互操作
// =============================================================================
// 覆盖: C 互操作、Java 互操作、互操作注意事项
// 仓颉 1.2 提供:
//   - std.interop: C 互操作（C 函数指针、外部库）
//   - objc/binding: Objective-C 绑定（macOS/iOS）
//   - c2cjni: Java Native Interface
// 本模块展示 C 互操作的基础。
// =============================================================================

package cangjie_learning.ffi_interop
// 注: std.interop 实际类型在真实 C 互操作场景中需要引入；本模块展示概念。
/// FFI 演示入口
public func ffiInteropDemo(): Unit {
    println("[21] FFI 与跨语言互操作")

    // ----- 1. C 函数指针类型 -----
    println("--- C 函数指针 ---")
    // 仓颉中通过 Function 类型与 C 函数指针互操作
    // 形如: type CFunc = CFunc<(Int64, Int64) -> Int64>

    // ----- 2. 调用 C 标准库 -----
    println("--- 调用 C 标准库 ---")
    // 演示：通过 std.interop 调用 printf
    // 注: C 函数调用必须通过外部库导入
    let s = "Hello from Cangjie"
    println("Cangjie 字符串: ${s}")

    // ----- 3. 内存布局与 C 兼容 -----
    println("--- 内存布局 ---")
    // struct 默认使用 C 兼容布局（无 padding）
    let p = PointC(3.0, 4.0)
    println("C 兼容结构体: (${p.x}, ${p.y})")

    // ----- 4. C 字符串互转 -----
    println("--- C 字符串 ---")
    let cs = "仓颉与 C 互操作"
    let bytes = cs.toArray()
    println("字符串字节数: ${bytes.size}")
    let back = String.fromUtf8(bytes)
    println("转回字符串: ${back}")

    // ----- 5. 平台特定代码 -----
    println("--- 平台检测 ---")
    println("平台: ${currentPlatform()}")

    // ----- 6. 数据序列化（C 结构体）-----
    println("--- 数据序列化 ---")
    let user = UserC(1, "Alice", "alice@example.com")
    println("用户: id=${user.id}, name=${user.name}, email=${user.email}")

    // ----- 7. 类型大小 -----
    println("--- 平台类型大小 ---")
    println("Int64: 8 bytes（典型）")
    println("Float64: 8 bytes（典型）")
    println("Bool: 1 byte（典型）")
    println("Rune: 4 bytes（典型，UTF-32）")
}

/// 平台检测
func currentPlatform(): String {
    // 编译期宏 + @When
    // 这里简化用常量
    return "native"
}

/// C 兼容的结构体（无 padding 字段顺序布局）
public struct PointC {
    public var x: Float64
    public var y: Float64

    public init(x: Float64, y: Float64) {
        this.x = x
        this.y = y
    }
}

/// 用户结构体（C 兼容）
public struct UserC {
    public var id: Int64
    public var name: String
    public var email: String

    public init(id: Int64, name: String, email: String) {
        this.id = id
        this.name = name
        this.email = email
    }
}

// =============================================================================
// C 互操作示例（注释形式，因为需要外部库）
// =============================================================================
//
// 实际调用 C 函数的典型模式：
//
// ```cangjie
// import std.interop.*
//
// // 1. 声明外部函数类型
// type CTimeFunc = CFunc<() -> Int64>
//
// // 2. 导入外部库
// foreign {
//     func time(t: CPointer<Int64>): Int64  // C: time_t time(time_t*)
//     func printf(fmt: CPointer<UInt8>, ...): Int32
// }
//
// // 3. 调用
// let now = time(CPointer<Int64>())  // 不安全但展示用法
// ```
//
// 注意事项：
//   - C 字符串是字节序列，仓颉字符串需手动编码
//   - C 指针用 CPointer<T> 表示
//   - 内存由 C 分配时，仓颉需要 ForeignManager 管理
//   - 类型映射：C int -> Int32, long -> Int64, double -> Float64
//
// =============================================================================
