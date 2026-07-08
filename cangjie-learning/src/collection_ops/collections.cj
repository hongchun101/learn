// =============================================================================
// 15_collection_ops - 集合操作
// =============================================================================
// 覆盖: Array、ArrayList、HashMap、HashSet、流式操作
// =============================================================================

package cangjie_learning.collection_ops

import std.collection.*
import cangjie_learning.enums.*

/// 集合操作演示入口
public func collectionsDemo(): Unit {
    println("[15] 集合操作演示")

    // ----- Array -----
    println("--- Array ---")
    let arr = [1, 2, 3, 4, 5]
    let arrStr = "原数组: " + arrToString(arr)
    println(arrStr)

    // ----- ArrayList -----
    println("--- ArrayList ---")
    let list = ArrayList<Int64>()
    list.add(10)
    list.add(20)
    list.add(30)
    list.add(40)
    list.add(50)
    println("ArrayList 大小: ${list.size}")
    let first = list[0]
    let last = list[list.size - 1]
    println("第一个: ${first}, 最后一个: ${last}")

    // ----- HashMap -----
    println("--- HashMap ---")
    let map = HashMap<String, Int64>()
    map["Alice"] = 90
    map["Bob"] = 85
    map["Carol"] = 92
    let aliceScore = map["Alice"]
    println("Alice 分数: ${aliceScore}")
    println("Map 大小: ${map.size}")

    // ----- HashSet -----
    println("--- HashSet ---")
    let set = HashSet<Int64>()
    set.add(1)
    set.add(2)
    set.add(3)
    set.add(2)
    println("集合大小: ${set.size}")
    println("包含 2: ${set.contains(2)}")

    // ----- 流式操作 -----
    println("--- 流式操作 ---")
    let numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    let doubled = myMap(numbers, { x => x * 2 })
    println("map(x*2): ${arrToString(doubled)}")

    let evens = myFilter(numbers, { x => x % 2 == 0 })
    println("filter(x%2==0): ${arrToString(evens)}")

    let total = myReduce(numbers, 0, { acc, x => acc + x })
    println("reduce(+): ${total}")

    let firstBig = myFind(numbers, { x => x > 5 })
    println("find(>5): ${firstBig.getOrElse({ => -1 })}")

    let taken = take(numbers, 3)
    println("take(3): ${arrToString(taken)}")

    let skipped = skip(numbers, 5)
    println("skip(5): ${arrToString(skipped)}")

    let hasAny = any(numbers, { x => x > 10 })
    println("any(>10): ${hasAny}")

    let allPositive = all(numbers, { x => x > 0 })
    println("all(>0): ${allPositive}")

    let oddCount = count(numbers, { x => x % 2 != 0 })
    println("count(odd): ${oddCount}")

    // ----- zip -----
    println("--- zip ---")
    let names = ["Alice", "Bob", "Carol"]
    let ages = [30, 25, 35]
    let pairs = zip(names, ages)
    println("zip 大小: ${pairs.size}")

    // ----- partition -----
    println("--- partition ---")
    let (evenArr, oddArr) = partition(numbers, { x => x % 2 == 0 })
    println("偶数: ${arrToString(evenArr)}")
    println("奇数: ${arrToString(oddArr)}")

    // ----- distinct -----
    println("--- distinct ---")
    let dupes = [1, 2, 2, 3, 3, 3, 4, 5, 5]
    let uniq = distinct(dupes)
    println("去重: ${arrToString(uniq)}")

    // ----- sorted -----
    println("--- sorted ---")
    let unsorted = [3, 1, 4, 1, 5, 9, 2, 6]
    let asc = sorted(unsorted)
    let desc = sortedDesc(unsorted)
    println("升序: ${arrToString(asc)}")
    println("降序: ${arrToString(desc)}")

    // ----- 综合示例 -----
    println("--- 学生成绩 ---")
    let alice = Student("Alice", 85, "数学")
    let bob = Student("Bob", 92, "数学")
    let carol = Student("Carol", 78, "物理")
    let david = Student("David", 95, "物理")
    let eve = Student("Eve", 88, "数学")
    let students = [alice, bob, carol, david, eve]

    var totalScore: Int64 = 0
    for (s in students) { totalScore += s.score }
    let avgScore = Float64(totalScore) / Float64(students.size)
    println("平均分: ${avgScore}")

    var mathCount: Int64 = 0
    for (s in students) {
        if (s.subject == "数学" && s.score >= 85) {
            mathCount += 1
        }
    }
    println("数学高分学生数: ${mathCount}")
}

// =============================================================================
// 数组操作函数
// =============================================================================

/// map
public func myMap<T, U>(items: Array<T>, transform: (T) -> U): Array<U> {
    var result = Array<U>(items.size, { _ => throw Exception("init") })
    var i: Int64 = 0
    for (item in items) {
        result[i] = transform(item)
        i += 1
    }
    return result
}

/// filter
public func myFilter<T>(items: Array<T>, predicate: (T) -> Bool): Array<T> {
    var result = ArrayList<T>()
    for (item in items) {
        if (predicate(item)) {
            result.add(item)
        }
    }
    return result.toArray()
}

/// reduce
public func myReduce<T>(items: Array<T>, initial: T, op: (T, T) -> T): T {
    var acc = initial
    for (item in items) {
        acc = op(acc, item)
    }
    return acc
}

/// fold
public func fold<T, U>(items: Array<T>, initial: U, op: (U, T) -> U): U {
    var acc = initial
    for (item in items) {
        acc = op(acc, item)
    }
    return acc
}

/// foldLeft
public func foldLeft<T, U>(items: Array<T>, initial: U, op: (U, T) -> U): U {
    return fold(items, initial, op)
}

/// foldRight
public func foldRight<T, U>(items: Array<T>, initial: U, op: (T, U) -> U): U {
    var acc = initial
    var i = items.size - 1
    while (i >= 0) {
        acc = op(items[i], acc)
        i -= 1
    }
    return acc
}

/// find
public func myFind<T>(items: Array<T>, predicate: (T) -> Bool): MaybeOption<T> {
    for (item in items) {
        if (predicate(item)) {
            return MaybeOption<T>.Some(item)
        }
    }
    return MaybeOption<T>.None
}

/// take
public func take<T>(items: Array<T>, n: Int64): Array<T> {
    let actual = if (n < items.size) { n } else { items.size }
    return Array<T>(actual, { i => items[i] })
}

/// skip
public func skip<T>(items: Array<T>, n: Int64): Array<T> {
    if (n >= items.size) { return Array<T>(0, { _ => throw Exception("unreachable") }) }
    let newSize = items.size - n
    return Array<T>(newSize, { i => items[n + i] })
}

/// any
public func any<T>(items: Array<T>, predicate: (T) -> Bool): Bool {
    for (item in items) {
        if (predicate(item)) {
            return true
        }
    }
    return false
}

/// all
public func all<T>(items: Array<T>, predicate: (T) -> Bool): Bool {
    for (item in items) {
        if (!predicate(item)) {
            return false
        }
    }
    return true
}

/// count
public func count<T>(items: Array<T>, predicate: (T) -> Bool): Int64 {
    var c: Int64 = 0
    for (item in items) {
        if (predicate(item)) {
            c += 1
        }
    }
    return c
}

/// zip
public func zip<A, B>(a: Array<A>, b: Array<B>): Array<(A, B)> {
    let size = if (a.size < b.size) { a.size } else { b.size }
    return Array<(A, B)>(size, { i => (a[i], b[i]) })
}

/// partition
public func partition<T>(items: Array<T>, predicate: (T) -> Bool): (Array<T>, Array<T>) {
    var matched = ArrayList<T>()
    var unmatched = ArrayList<T>()
    for (item in items) {
        if (predicate(item)) {
            matched.add(item)
        } else {
            unmatched.add(item)
        }
    }
    return (matched.toArray(), unmatched.toArray())
}

/// distinct
public func distinct<T>(items: Array<T>): Array<T> where T <: Equatable<T> & Hashable {
    var seen = HashSet<T>()
    var result = ArrayList<T>()
    for (item in items) {
        if (!seen.contains(item)) {
            seen.add(item)
            result.add(item)
        }
    }
    return result.toArray()
}

/// sorted
public func sorted<T>(items: Array<T>): Array<T> where T <: Comparable<T> {
    var arr = items
    let n = arr.size
    var i: Int64 = 0
    while (i < n - 1) {
        var j: Int64 = 0
        while (j < n - 1 - i) {
            if (arr[j].compare(arr[j + 1]) == Ordering.GT) {
                let tmp = arr[j]
                arr[j] = arr[j + 1]
                arr[j + 1] = tmp
            }
            j += 1
        }
        i += 1
    }
    return arr
}

/// sortedDesc
public func sortedDesc<T>(items: Array<T>): Array<T> where T <: Comparable<T> {
    var arr = items
    let n = arr.size
    var i: Int64 = 0
    while (i < n - 1) {
        var j: Int64 = 0
        while (j < n - 1 - i) {
            if (arr[j].compare(arr[j + 1]) == Ordering.LT) {
                let tmp = arr[j]
                arr[j] = arr[j + 1]
                arr[j + 1] = tmp
            }
            j += 1
        }
        i += 1
    }
    return arr
}

/// 数组转字符串
func arrToString<T>(arr: Array<T>): String where T <: ToString {
    var s = "["
    for (i in 0..arr.size) {
        if (i > 0) { s += ", " }
        s += arr[i].toString()
    }
    s += "]"
    return s
}

// =============================================================================
// 学生类
// =============================================================================

public class Student {
    public let name: String
    public var score: Int64
    public let subject: String

    public init(name: String, score: Int64, subject: String) {
        this.name = name
        this.score = score
        this.subject = subject
    }
}