// =============================================================================
// 11_error_handling - 错误处理
// =============================================================================
// 覆盖: try/catch 异常、MaybeOption<T>、EitherResult<T, E>、自定义异常、defer
// =============================================================================

package cangjie_learning.error_handling

import std.collection.*
import cangjie_learning.enums.*

/// 错误处理演示入口
public func errorsDemo(): Unit {
    println("[11] 错误处理演示")

    // ----- 异常处理 -----
    println("--- try/catch ---")
    try {
        let result = divide(10, 0)
        println("结果: ${result}")
    } catch (e: DivisionByZeroException) {
        println("捕获异常: ${e.message}")
    } catch (e: Exception) {
        println("其他异常: ${e.message}")
    } finally {
        println("finally 块执行")
    }

    // ----- Option 链式操作 -----
    println("--- Option 链式 ---")
    let look1 = safeLookup(1).unwrapOr("默认")
    let look99 = safeLookup(99).unwrapOr("默认")
    println("lookup(1) = ${look1}")
    println("lookup(99) = ${look99}")

    let result = safeLookup(2)
        .map({ v: String => v + v })
        .map({ v: String => v + "_end" })
    let resultStr = match (result) { case MaybeOption<String>.Some(v) => v case MaybeOption<String>.None => "None" }
    println("链式结果: ${resultStr}")
    // ----- Result 类型 -----
    println("--- Result 类型 ---")
    let dr1: EitherResult<Int64, String> = safeDivide(10, 2)
    let dr2: EitherResult<Int64, String> = safeDivide(10, 0)

    handleResult(dr1)
    handleResult(dr2)

    // ----- defer 模式 -----
    println("--- defer 模式 ---")
    processFile("test.txt")
}

/// 除法（抛异常版本）
public func divide(a: Int64, b: Int64): Int64 {
    if (b == 0) {
        throw DivisionByZeroException("除数不能为零")
    }
    return a / b
}

/// 除零异常
public class DivisionByZeroException <: Exception {
    public init(message: String) {
        super(message)
    }
}

/// 自定义业务异常
public class BusinessException <: Exception {
    public let code: Int64

    public init(code: Int64, message: String) {
        super(message)
        this.code = code
    }
}

/// 模拟资源管理（演示 defer 语义）
public func processFile(path: String): Unit {
    println("  [打开文件] ${path}")
    // defer 在 Cangjie 中需要用 try-finally 模拟
    let cleanup: () -> Unit = {
        => println("  [清理] 释放文件资源")
    }
    cleanup()
    println("  [处理文件] ${path}")

    if (path.isEmpty()) {
        throw BusinessException(404, "文件不存在: ${path}")
    }

    println("  [处理完成]")
}

/// 模拟数据库查找（返回 Option）
public func safeLookup(id: Int64): MaybeOption<String> {
    let db = HashMap<Int64, String>()
    db[1] = "Alice"
    db[2] = "Bob"
    db[3] = "Carol"
    match (db.get(id)) {
        case Some(v) => MaybeOption<String>.Some(v)
        case None => MaybeOption<String>.None
    }
}

/// 安全除法（Result 风格）
public func safeDivide(a: Int64, b: Int64): EitherResult<Int64, String> {
    if (b == 0) {
        return EitherResult<Int64, String>.Err("除数不能为零")
    }
    return EitherResult<Int64, String>.Ok(a / b)
}

/// 处理 Result 示例
public func handleResult(r: EitherResult<Int64, String>): Unit {
    r.handle(
        { v => println("成功: ${v}") },
        { e => println("失败: ${e}") }
    )
}