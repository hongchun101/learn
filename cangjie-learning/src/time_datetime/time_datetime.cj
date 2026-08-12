// =============================================================================
// 18_time_datetime - 时间与日期
// =============================================================================
// 覆盖: DateTime、Duration、时间运算、测量耗时
// 标准库: std.time
// =============================================================================

package cangjie_learning.time_datetime

import std.time.*

/// 时间与日期演示入口
public func timeDatetimeDemo(): Unit {
    println("[18] 时间与日期演示")

    // ----- 1. 当前时间 -----
    println("--- 当前时间 ---")
    let now = DateTime.now()
    println("当前: ${now}")

    // ----- 2. 时间分量 -----
    println("--- 时间分量 ---")
    println("年: ${now.year}")
    println("月: ${now.month}")
    println("日: ${now.dayOfMonth}")
    println("时: ${now.hour}")
    println("分: ${now.minute}")
    println("秒: ${now.second}")

    // ----- 3. Duration -----
    println("--- Duration ---")
    let d1: Duration = Duration.second * 5
    let d2: Duration = Duration.millisecond * 500
    let d3 = d1 + d2
    println("5 秒 + 500 毫秒 = ${d3}")

    let dHour = Duration.hour * 2
    println("2 小时 = ${dHour}")

    // ----- 4. 时间运算 -----
    println("--- 时间运算 ---")
    let future = now + Duration.hour * 2
    println("2 小时后: ${future}")
    let past = now - Duration.day * 7
    println("7 天前: ${past}")

    // ----- 5. 时间比较 -----
    println("--- 时间比较 ---")
    let t1 = DateTime.now()
    sleep(Duration.millisecond * 10)
    let t2 = DateTime.now()
    println("t2 > t1: ${t2 > t1}")
    println("差值: ${t2 - t1}")

    // ----- 6. 测量耗时 -----
    println("--- 测量耗时 ---")
    let start = DateTime.now()
    var sum: Int64 = 0
    for (i in 0..1000000) {
        sum += i
    }
    let elapsed = DateTime.now() - start
    println("求和 0..999999 = ${sum}")
    println("耗时: ${elapsed}")

    // ----- 7. 定时器 -----
    println("--- 定时器 ---")
    let deadline = DateTime.now() + Duration.millisecond * 100
    var tick: Int64 = 0
    while (DateTime.now() < deadline) {
        tick += 1
    }
    println("100ms 内的循环次数: ${tick}")

    // ----- 8. 月份天数 -----
    println("--- 月份天数 ---")
    println("2026 年 1 月: ${daysInMonth(2026, 1)} 天")
    println("2026 年 2 月: ${daysInMonth(2026, 2)} 天")
    println("2024 年 2 月: ${daysInMonth(2024, 2)} 天（闰年）")

    // ----- 9. 时间范围 -----
    println("--- 时间范围 ---")
    let begin = DateTime.now()
    let end = begin + Duration.minute * 30
    println("会议开始: ${begin}")
    println("会议结束: ${end}")
    let diff = end - begin
    println("会议时长: ${diff}")
}

/// 判断月份天数（简化版，不考虑复杂历法）
func daysInMonth(year: Int64, month: Int64): Int64 {
    if (month == 2) {
        let isLeap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
        return if (isLeap) { 29 } else { 28 }
    }
    if (month == 4 || month == 6 || month == 9 || month == 11) {
        return 30
    }
    return 31
}
