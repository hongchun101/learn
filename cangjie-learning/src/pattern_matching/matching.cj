// =============================================================================
// 07_pattern_matching - 模式匹配
// =============================================================================
// 覆盖: 字面量/绑定/类型/枚举/嵌套模式、守卫、范围、列表、JSON 解构
// =============================================================================

package cangjie_learning.pattern_matching

import std.collection.*

/// 模式匹配演示入口
public func matchingDemo(): Unit {
    println("[07] 模式匹配演示")

    // ----- 字面量模式 -----
    println("classify(0) = ${classify(0)}")
    println("classify(5) = ${classify(5)}")
    println("classify(-3) = ${classify(-3)}")

    // ----- 守卫 -----
    println("category(15) = ${category(15)}")
    println("category(8) = ${category(8)}")
    println("category(150) = ${category(150)}")
    println("category(-1) = ${category(-1)}")

    // ----- 元组模式 -----
    let point = (3, 4)
    println("quadrant(3,4) = ${quadrant(point)}")
    println("quadrant(-2,5) = ${quadrant((-2, 5))}")

    // ----- 列表大小模式 -----
    println("listDescription([]) = ${listDescription([])}")
    println("listDescription([1]) = ${listDescription([1])}")
    println("listDescription([1, 2]) = ${listDescription([1, 2])}")
    println("listDescription([1, 2, 3, 4]) = ${listDescription([1, 2, 3, 4])}")

    // ----- JSON 风格数据解构 -----
    let entries = ArrayList<(String, JsonValue)>()
    entries.add(("name", JsonValue.JString("Alice")))
    entries.add(("age", JsonValue.JNumber(30.0)))
    entries.add(("active", JsonValue.JBoolean(true)))
    let jsonUser: JsonValue = JsonValue.JObject(entries)
    println(formatJson(jsonUser))

    // ----- 嵌套枚举模式 -----
    let events: Array<Event> = [
        Event.Click(10, 20),
        Event.KeyPress("Enter"),
        Event.Scroll(0.5),
        Event.Resize(1920, 1080),
        Event.Custom("loaded")
    ]
    for (e in events) {
        println(handleEvent(e))
    }

    // ----- 范围模式 -----
    println("toGrade(95) = ${toGrade(95)}")
    println("toGrade(72) = ${toGrade(72)}")
    println("toGrade(45) = ${toGrade(45)}")
}

// =============================================================================
// 字面量模式与守卫
// =============================================================================

/// 数字分类
public func classify(n: Int64): String {
    match (n) {
        case 0 => "零"
        case 1 => "一"
        case 2 => "二"
        case -1 => "负一"
        case _ => "其他: ${n}"
    }
}

/// 带守卫的分类
public func category(n: Int64): String {
    match (n) {
        case x where x < 0 => "负数: ${x}"
        case 0 => "零"
        case x where x < 10 => "个位数: ${x}"
        case x where x < 100 => "两位数: ${x}"
        case x => "大数: ${x}"
    }
}

// =============================================================================
// 元组模式
// =============================================================================

/// 判断点位于哪个象限
public func quadrant(p: (Int64, Int64)): String {
    match (p) {
        case (0, 0) => "原点"
        case (_, 0) => "X 轴上"
        case (0, _) => "Y 轴上"
        case (x, y) where x > 0 && y > 0 => "第一象限 (${x}, ${y})"
        case (x, y) where x < 0 && y > 0 => "第二象限 (${x}, ${y})"
        case (x, y) where x < 0 && y < 0 => "第三象限 (${x}, ${y})"
        case (x, y) => "第四象限 (${x}, ${y})"
    }
}

// =============================================================================
// 列表大小模式
// =============================================================================

/// 描述列表结构
public func listDescription(items: Array<Int64>): String {
    match (items.size) {
        case 0 => "空列表"
        case 1 => "单元素: ${items[0]}"
        case 2 => "二元组: (${items[0]}, ${items[1]})"
        case _ => "长度为 ${items.size} 的列表"
    }
}

// =============================================================================
// JSON 风格的代数数据类型 + 模式匹配
// =============================================================================

/// JSON 值（递归枚举）
public enum JsonValue {
    | JNull
    | JBoolean(Bool)
    | JNumber(Float64)
    | JString(String)
    | JArray(ArrayList<JsonValue>)
    | JObject(ArrayList<(String, JsonValue)>)
}

public func formatJson(value: JsonValue, indent!: Int64 = 0): String {
    let pad = repeatStr("  ", indent)
    let _padUsed = pad
    _padUsed.size
    match (value) {
        case JsonValue.JNull => "null"

        case JsonValue.JBoolean(b) => "${b}"
        case JsonValue.JNumber(n) => "${n}"
        case JsonValue.JString(s) => "\"${s}\""
        case JsonValue.JArray(arr) => "[${arr.size} items]"
        case JsonValue.JObject(entries) => "{${entries.size} entries}"
    }
}

/// 字符串重复
func repeatStr(s: String, times: Int64): String {
    var result = ""
    var i: Int64 = 0
    while (i < times) {
        result += s
        i += 1
    }
    return result
}
// 嵌套枚举模式
// =============================================================================

/// UI 事件
public enum Event {
    | Click(Int64, Int64)
    | KeyPress(String)
    | Scroll(Float64)
    | Resize(Int64, Int64)
    | Custom(String)
}

/// 事件处理
public func handleEvent(event: Event): String {
    match (event) {
        case Click(x, y) => "[点击] 坐标(${x}, ${y})"
        case KeyPress("Enter") => "[键盘] 回车键"
        case KeyPress("Escape") => "[键盘] ESC 键"
        case KeyPress(key) => "[键盘] 其他键: ${key}"
        case Scroll(d) where d > 0.0 => "[滚动] 向下 ${d}"
        case Scroll(d) => "[滚动] 向上 ${-d}"
        case Resize(w, h) => "[调整大小] ${w}x${h}"
        case Custom(name) => "[自定义] ${name}"
    }
}

// =============================================================================
// 范围模式
// =============================================================================

/// 成绩等级
public func toGrade(score: Int64): String {
    match (score) {
        case s where s >= 90 && s <= 100 => "A (优秀)"
        case s where s >= 80 && s < 90 => "B (良好)"
        case s where s >= 70 && s < 80 => "C (中等)"
        case s where s >= 60 && s < 70 => "D (及格)"
        case s where s >= 0 && s < 60 => "F (不及格)"
        case _ => "无效分数"
    }
}