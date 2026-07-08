// =============================================================================
// 06_generics - 泛型
// =============================================================================
// 覆盖: 泛型函数、泛型类型、上界约束、多约束、泛型接口
// =============================================================================

package cangjie_learning.generics

import std.collection.*
import cangjie_learning.enums.*

/// 泛型演示入口
public func genericsDemo(): Unit {
    println("[06] 泛型演示")

    // ----- 泛型函数 -----
    let intResult = identity(42)
    let strResult = identity("仓颉")
    println("identity(42) = ${intResult}")
    println("identity(仓颉) = ${strResult}")

    // ----- 多类型参数 -----
    let pair = Pair(first: 1, second: "one")
    println("pair = (${pair.first}, ${pair.second})")

    // ----- 上界约束 -----
    let largestInt = maxOf(3, 7)
    println("max(3, 7) = ${largestInt}")

    // ----- 容器泛型类型 -----
    let box = Box<Int64>(value: 100)
    println("Box 内容: ${box.value}")

    // ----- 栈 -----
    let stack = Stack<Int64>()
    stack.push(1)
    stack.push(2)
    stack.push(3)
    println("栈顶: ${stack.peek()}")
    println("弹出: ${stack.pop()}")
    println("栈大小: ${stack.size()}")

    // ----- 类型约束 -----
    let people = [Person("Alice", 30), Person("Bob", 25), Person("Carol", 35)]
    let sorted = sortBy(people, { p => p.age })
    for (p in sorted) {
        println("  ${p.name}: ${p.age}")
    }

    // ----- 链表 -----
    let list = LinkedList<Int64>()
    list.append(1)
    list.append(2)
    list.append(3)
    println("链表大小: ${list.size()}")
}

// =============================================================================
// 泛型函数
// =============================================================================

/// 恒等函数
public func identity<T>(value: T): T {
    return value
}

/// 二元组
public struct Pair<A, B> {
    public var first: A
    public var second: B

    public init(first!: A, second!: B) {
        this.first = first
        this.second = second
    }
}

// 上界约束
// =============================================================================

/// 取两个值中较大的，要求实现 Comparable
public func maxOf<T>(a: T, b: T): T where T <: Comparable<T> {
    if (a.compare(b) == Ordering.GT) {
        return a
    }
    return b
}

// =============================================================================
// 泛型容器类型
// =============================================================================

/// 泛型 Box 容器
public class Box<T> {
    public var value: T
    public init(value!: T) {
        this.value = value
    }
}

/// 泛型栈
public class Stack<T> {
    private var elements: ArrayList<T>

    public init() {
        this.elements = ArrayList<T>()
    }

    public func push(item: T): Unit {
        elements.add(item)
    }

    public func pop(): T {
        if (elements.isEmpty()) {
            throw Exception("栈为空")
        }
        let lastIdx = elements.size - 1
        let value = elements[lastIdx]
        elements = cloneWithoutLast(elements)
        return value
    }

    public func peek(): T {
        if (elements.isEmpty()) {
            throw Exception("栈为空")
        }
        return elements[elements.size - 1]
    }

    public func size(): Int64 {
        return elements.size
    }

    public func isEmpty(): Bool {
        return elements.isEmpty()
    }
}

/// 克隆去掉最后一个元素的列表
func cloneWithoutLast<T>(list: ArrayList<T>): ArrayList<T> {
    let result = ArrayList<T>()
    var i: Int64 = 0
    while (i < list.size - 1) {
        result.add(list[i])
        i += 1
    }
    return result
}

// =============================================================================
// 泛型接口
// =============================================================================

/// 键值存储接口
public interface Cache<K, V> {
    func put(key: K, value: V): Unit
    func get(key: K): MaybeOption<V>
    func remove(key: K): Unit
}

/// 简化的缓存实现（不要求 K 实现 Equatable）
public class SimpleCache<K, V> <: Cache<K, V> where K <: Equatable<K> {
    private var entries: ArrayList<(K, V)>

    public init() {
        this.entries = ArrayList<(K, V)>()
    }

    public func put(key: K, value: V): Unit {
        for ((k, _) in entries) {
            if (k == key) {
                return
            }
        }
        entries.add((key, value))
    }

    public func get(key: K): MaybeOption<V> {
        for ((k, v) in entries) {
            if (k == key) {
                return MaybeOption<V>.Some(v)
            }
        }
        return MaybeOption<V>.None
    }

    public func remove(key: K): Unit {
        let newEntries = ArrayList<(K, V)>()
        var i: Int64 = 0
        while (i < entries.size) {
            let (k, v) = entries[i]
            if (k != key) {
                newEntries.add((k, v))
            }
            i += 1
        }
        entries = newEntries
    }
}

/// 基于 HashMap 的缓存实现
public class HashMapCache<K, V> <: Cache<K, V> where K <: Hashable & Equatable<K> {
    private var store: HashMap<K, V>

    public init() {
        this.store = HashMap<K, V>()
    }

    public func put(key: K, value: V): Unit {
        store[key] = value
    }

    public func get(key: K): MaybeOption<V> {
        match (store.get(key)) {
            case Some(v) => MaybeOption<V>.Some(v)
            case None => MaybeOption<V>.None
        }
    }

    public func remove(key: K): Unit {
        store.remove(key)
    }
}

// =============================================================================
// 类型约束示例
// =============================================================================

/// 人员
public class Person {
    public let name: String
    public var age: Int64

    public init(name: String, age: Int64) {
        this.name = name
        this.age = age
    }
}

/// 按指定键排序 - 要求键可比较
public func sortBy<T, K>(items: Array<T>, keyFn: (T) -> K): Array<T>
    where K <: Comparable<K> {
    var arr = items
    let n = arr.size
    var i: Int64 = 0
    while (i < n - 1) {
        var j: Int64 = 0
        while (j < n - 1 - i) {
            if (keyFn(arr[j]).compare(keyFn(arr[j + 1])) == Ordering.GT) {
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

// =============================================================================
// 链表
// =============================================================================

/// 链表节点
public enum ListNode<T> {
    | Cons(T, ListNode<T>)
    | Nil
}

/// 链表
public class LinkedList<T> {
    private var head: ListNode<T>
    private var count: Int64

    public init() {
        this.head = ListNode<T>.Nil
        this.count = 0
    }

    public func append(value: T): Unit {
        head = appendHelper(head, value)
        count += 1
    }

    private func appendHelper(node: ListNode<T>, value: T): ListNode<T> {
        match (node) {
            case ListNode<T>.Nil => ListNode<T>.Cons(value, ListNode<T>.Nil)
            case ListNode<T>.Cons(v, next) => ListNode<T>.Cons(v, appendHelper(next, value))
        }
    }

    public func size(): Int64 {
        return count
    }
}