// =============================================================================
// 17_regex_string - 正则与字符串处理
// =============================================================================
// 覆盖: 正则匹配、查找、字符串构造、Unicode 处理
// 标准库: std.regex
// 注: MatchData 在本版本中仅暴露 matchString() 一个方法
// =============================================================================

package cangjie_learning.regex_string

import std.regex.*

/// 正则与字符串演示入口
public func regexStringDemo(): Unit {
    println("[17] 正则与字符串演示")

    // ----- 1. 简单匹配 -----
    println("--- 简单匹配 ---")
    let r1 = Regex(#"\d+"#)
    println("\"abc123def\" 包含数字: ${r1.matches("abc123def")}")
    println("\"abc\" 包含数字: ${r1.matches("abc")}")

    // ----- 2. 完全匹配 -----
    println("--- 完全匹配 ---")
    let r2 = Regex(#"^[a-zA-Z]+$"#)
    println("\"hello\" 是纯字母: ${r2.matches("hello")}")
    println("\"hello123\" 是纯字母: ${r2.matches("hello123")}")

    // ----- 3. 查找 -----
    println("--- 查找 ---")
    let r3 = Regex(#"\d+"#)
    match (r3.find("abc123def456")) {
        case Some(m) => println("首次数字: ${m.matchString()}")
        case None => println("无数字")
    }

    // ----- 4. 邮箱验证 -----
    println("--- 邮箱验证 ---")
    let emailRe = Regex(#"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"#)
    let emails = ["alice@example.com", "bob@", "@example.com", "charlie@x.cn"]
    for (e in emails) {
        let ok = emailRe.matches(e)
        println("  ${e}: ${ok}")
    }

    // ----- 5. 字符串分割 -----
    println("--- 字符串分割 ---")
    let csv = "apple,banana,cherry,date"
    let parts = csv.split(",")
    println("分割结果: ${parts.size} 段")
    for (p in parts) {
        println("  ${p}")
    }

    // ----- 6. Unicode 处理 -----
    println("--- Unicode 处理 ---")
    let chinese = "仓颉语言"
    println("字符串: ${chinese}")
    println("字节数: ${chinese.size}")
    let runes = chinese.toRuneArray()
    println("码点数: ${runes.size}")
    for (r in runes) {
        println("  ${r}")
    }

    // ----- 7. 字符串构建器模式 -----
    println("--- 字符串构建 ---")
    var sb = StringBuilder()
    sb.append("姓名: ")
    sb.append("仓颉")
    sb.append(", 年龄: ")
    sb.append(30)
    sb.append(", 语言: Cangjie")
    let profile = sb.toString()
    println("构建结果: ${profile}")

    // ----- 8. URL 提取 -----
    println("--- URL 提取 ---")
    let text = "访问 https://cangjie-lang.cn 或 http://example.com 获取更多信息"
    let urlRe = Regex(#"https?://[^\s]+"#)
    match (urlRe.find(text)) {
        case Some(m) => println("  首个 URL: ${m.matchString()}")
        case None => println("  无 URL")
    }

    // ----- 9. 重复查找演示 -----
    println("--- 多次匹配 ---")
    let numRe2 = Regex(#"\d+"#)
    // 用完整字符串演示连续两次 find（首次匹配 + 末尾匹配）
    match (numRe2.find("abc123")) {
        case Some(m) => println("  首次匹配: ${m.matchString()}")
        case None => println("  无匹配")
    }
    match (numRe2.find("xyz789")) {
        case Some(m) => println("  首次匹配: ${m.matchString()}")
        case None => println("  无匹配")
    }

    // ----- 10. 字符类型判定 -----
    println("--- 字符类型 ---")
    let samples = "aA1!仓 "
    for (c in samples.toRuneArray()) {
        let s = c.toString()
        let isDigit = Regex(#"^\d$"#).matches(s)
        let isAlpha = Regex(#"^[a-zA-Z]$"#).matches(s)
        let isUpper = Regex(#"^[A-Z]$"#).matches(s)
        println("  ${c}: 数字=${isDigit}, 字母=${isAlpha}, 大写=${isUpper}")
    }
}
