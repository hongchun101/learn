// =============================================================================
// 16_io_filesystem - 文件系统与 IO
// =============================================================================
// 覆盖: 文件读写、目录创建、路径操作、字符串与字节转换、错误传播
// 标准库: std.fs
// =============================================================================

package cangjie_learning.io_filesystem

import std.fs.*

/// IO 与文件系统演示入口
public func ioFilesystemDemo(): Unit {
    println("[16] IO 与文件系统演示")

    let tempDir = "/tmp/cangjie_tutorial"

    // ----- 1. 目录创建 -----
    println("--- 目录操作 ---")
    try {
        Directory.create(tempDir, recursive: true)
        println("已创建目录: ${tempDir}")
    } catch (e: Exception) {
        println("目录创建失败: ${e.message}")
    }

    // ----- 2. 文件写入（字节数组）-----
    println("--- 文件写入 ---")
    let filePath = "${tempDir}/sample.txt"
    try {
        let writer = File.create(filePath)
        let content = "第一行: Hello, 仓颉!\n第二行: 文件 IO 演示\n第三行: 中文字符串支持\n"
        writer.write(content.toArray())
        writer.close()
        println("写入完成: ${filePath}")
    } catch (e: Exception) {
        println("写入失败: ${e.message}")
    }

    // ----- 3. 文件读取 -----
    println("--- 文件读取 ---")
    try {
        let bytes = File.readFrom(filePath)
        // bytes 是 Array<UInt8>，需要转 String
        let content = String.fromUtf8(bytes)
        println("内容:")
        println(content)
    } catch (e: Exception) {
        println("读取失败: ${e.message}")
    }

    // ----- 4. 路径操作 -----
    println("--- 路径操作 ---")
    let p = Path("/home/user/data/file.txt")
    println("fileName: ${p.fileName}")
    println("parent: ${p.parent}")

    let p2 = Path("relative/path/file.cj")
    println("相对路径 fileName: ${p2.fileName}")

    // ----- 5. 字符串与字节互转 -----
    println("--- 字符串 ↔ 字节 ---")
    let s = "Hello, 仓颉"
    let bytes = s.toArray()
    println("字符串 -> 字节: size=${bytes.size}")
    let back = String.fromUtf8(bytes)
    println("字节 -> 字符串: ${back}")

    // ----- 6. 错误传播模式 -----
    println("--- 错误处理: 文件不存在 ---")
    let missing = "${tempDir}/not_exists.txt"
    try {
        let _ = File.readFrom(missing)
    } catch (e: Exception) {
        println("捕获异常: ${e.message}")
    }

    // ----- 7. CSV 写入与回读 -----
    println("--- CSV 写入 ---")
    let csvPath = "${tempDir}/data.csv"
    try {
        let csvWriter = File.create(csvPath)
        csvWriter.write("name,age,city\n".toArray())
        csvWriter.write("Alice,30,Beijing\n".toArray())
        csvWriter.write("Bob,25,Shanghai\n".toArray())
        csvWriter.write("Carol,35,Shenzhen\n".toArray())
        csvWriter.close()
        println("CSV 已写入: ${csvPath}")

        let csvBytes = File.readFrom(csvPath)
        let csvContent = String.fromUtf8(csvBytes)
        println("回读内容:")
        println(csvContent)
    } catch (e: Exception) {
        println("CSV 操作失败: ${e.message}")
    }

    // ----- 8. 多文件批量处理 -----
    println("--- 多文件批量 ---")
    for (i in 1..=3) {
        let p = "${tempDir}/file_${i}.txt"
        try {
            let w = File.create(p)
            w.write("文件 ${i} 内容\n".toArray())
            w.close()
            println("  已写入: ${p}")
        } catch (e: Exception) {
            println("  写入 ${p} 失败: ${e.message}")
        }
    }
}
