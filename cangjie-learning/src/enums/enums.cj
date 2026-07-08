// =============================================================================
// 04_enums - 枚举与代数数据类型
// =============================================================================
// 覆盖: 简单枚举、带负载枚举（sum type）、递归枚举、Option 风格、Result 风格
// =============================================================================

package cangjie_learning.enums

import std.collection.*

/// 枚举演示入口
public func enumsDemo(): Unit {
    println("[04] 枚举与代数数据类型演示")

    // ----- 简单枚举 -----
    let color: Color = Color.Red
    let colorName = color.name()
    println("颜色: ${colorName}, 名称: ${colorName}")

    // ----- 带负载枚举 -----
    let shape: Shape = Shape.Circle(5.0)
    let shape2: Shape = Shape.Rectangle(4.0, 6.0)
    let shape3: Shape = Shape.Triangle(3.0, 4.0, 5.0)
    println("圆形面积: ${describeShape(shape)}")
    println("矩形面积: ${describeShape(shape2)}")
    println("三角形面积: ${describeShape(shape3)}")

    // ----- 递归枚举（树结构）-----
    // 用 lambda 替代运算符引用
    let addInts = { a: Int64, b: Int64 => a + b }
    let tree: BinaryTree<Int64> = BinaryTree.Node(
        BinaryTree.Node(BinaryTree.Leaf(1), BinaryTree.Leaf(2), addInts),
        BinaryTree.Node(BinaryTree.Leaf(3), BinaryTree.Leaf(4), addInts),
        addInts
    )
    println("树求值: ${evalTree(tree)}")

    // ----- Option 风格 -----
    let someValue: MaybeOption<Int64> = MaybeOption<Int64>.Some(42)
    let noneValue: MaybeOption<Int64> = MaybeOption<Int64>.None
    println("some = ${someValue.unwrapOr(0)}")
    println("none = ${noneValue.unwrapOr(-1)}")

    // ----- Result 风格 -----
    let ok: EitherResult<Int64, String> = EitherResult<Int64, String>.Ok(100)
    let err: EitherResult<Int64, String> = EitherResult<Int64, String>.Err("出错了")
    println("ok = ${ok.unwrapOr(-1)}")
    println("err = ${err.unwrapOr(-1)}")

    // ----- 业务枚举：订单状态 -----
    let pending = OrderStatus.Pending
    let paid = OrderStatus.Paid(99.99, "信用卡")
    let shipped = OrderStatus.Shipped("SF123456")
    let delivered = OrderStatus.Delivered("2026-01-15")
    let cancelled = OrderStatus.Cancelled("用户取消")

    for (status in [pending, paid, shipped, delivered, cancelled]) {
        println(orderStatusDescription(status))
    }
}

// =============================================================================
// 简单枚举
// =============================================================================

/// 颜色枚举
public enum Color {
    | Red
    | Green
    | Blue
    | Yellow
    | Black

    /// 自定义方法
    public func name(): String {
        match (this) {
            case Red => "红色"
            case Green => "绿色"
            case Blue => "蓝色"
            case Yellow => "黄色"
            case Black => "黑色"
        }
    }
}

// =============================================================================
// 带负载枚举（Sum Type）
// =============================================================================

/// 形状枚举：每种变体携带不同数据
public enum Shape {
    | Circle(Float64)
    | Rectangle(Float64, Float64)
    | Triangle(Float64, Float64, Float64)
    | Empty

    /// 计算面积
    public func area(): Float64 {
        match (this) {
            case Circle(r) => return 3.14159265 * r * r
            case Rectangle(w, h) => return w * h
            case Triangle(a, b, c) =>
                // 海伦公式（自实现平方根）
                let s = (a + b + c) / 2.0
                return mySqrt(s * (s - a) * (s - b) * (s - c))
            case Empty => return 0.0
        }
    }
}

/// 描述形状
public func describeShape(s: Shape): String {
    let a = s.area()
    match (s) {
        case Circle(r) => "圆形, 半径=${r}, 面积=${a}"
        case Rectangle(w, h) => "矩形, 宽=${w}, 高=${h}, 面积=${a}"
        case Triangle(a, b, c) => "三角形, 边长=${a},${b},${c}, 面积=${a}"
        case Empty => "空形状"
    }
}

/// 自实现平方根（牛顿迭代法）
func mySqrt(x: Float64): Float64 {
    if (x <= 0.0) { return 0.0 }
    var y = x
    var iter: Int64 = 0
    while (iter < 50) {
        y = (y + x / y) / 2.0
        iter += 1
    }
    return y
}

// =============================================================================
// 递归枚举：二叉树
// =============================================================================

/// 通用二叉树
public enum BinaryTree<T> {
    | Leaf(T)
    | Node(BinaryTree<T>, BinaryTree<T>, (T, T) -> T)
}

/// 递归求值
public func evalTree<T>(tree: BinaryTree<T>): T {
    match (tree) {
        case Leaf(v) => v
        case Node(left, right, op) => op(evalTree(left), evalTree(right))
    }
}

// =============================================================================
// MaybeOption<T>
// =============================================================================

public enum MaybeOption<T> {
    | Some(T)
    | None

    public func isSome(): Bool {
        match (this) {
            case Some(_) => true
            case None => false
        }
    }

    public func unwrapOr(defaultValue: T): T {
        match (this) {
            case Some(v) => v
            case None => defaultValue
        }
    }

    public func map<U>(transform: (T) -> U): MaybeOption<U> {
        match (this) {
            case Some(v) => Some(transform(v))
            case None => None
        }
    }

    public func getOrElse(defaultFn: () -> T): T {
        match (this) {
            case Some(v) => v
            case None => defaultFn()
        }
    }
}

// =============================================================================
// EitherResult<T, E>
// =============================================================================

public enum EitherResult<T, E> {
    | Ok(T)
    | Err(E)

    public func isOk(): Bool {
        match (this) {
            case Ok(_) => true
            case Err(_) => false
        }
    }

    public func unwrapOr(defaultValue: T): T {
        match (this) {
            case Ok(v) => v
            case Err(_) => defaultValue
        }
    }
}

// =============================================================================
// MaybeOption 扩展
// =============================================================================

extend<T> MaybeOption<T> {
    /// 取出值或抛出异常
    public func unwrap(): T {
        match (this) {
            case MaybeOption<T>.Some(v) => v
            case MaybeOption<T>.None => throw Exception("MaybeOption 为 None")
        }
    }

    /// 扁平化映射
    public func andThen<U>(transform: (T) -> MaybeOption<U>): MaybeOption<U> {
        match (this) {
            case MaybeOption<T>.Some(v) => transform(v)
            case MaybeOption<T>.None => MaybeOption<U>.None
        }
    }

    /// 过滤（通过谓词匹配）
    public func keepIf(predicate: (T) -> Bool): MaybeOption<T> {
        match (this) {
            case MaybeOption<T>.Some(v) =>
                if (predicate(v)) { MaybeOption<T>.Some(v) } else { MaybeOption<T>.None }
            case MaybeOption<T>.None => MaybeOption<T>.None
        }
    }
}

// =============================================================================
// EitherResult 扩展
// =============================================================================

extend<T, E> EitherResult<T, E> {
    /// 取出值或抛出异常
    public func unwrap(): T {
        match (this) {
            case EitherResult<T, E>.Ok(v) => v
            case EitherResult<T, E>.Err(_) => throw Exception("EitherResult 为 Err")
        }
    }

    /// 错误映射
    public func mapErr<F>(transform: (E) -> F): EitherResult<T, F> {
        match (this) {
            case EitherResult<T, E>.Ok(v) => EitherResult<T, F>.Ok(v)
            case EitherResult<T, E>.Err(e) => EitherResult<T, F>.Err(transform(e))
        }
    }

    /// 处理 Result
    public func handle(handler: (T) -> Unit, errHandler: (E) -> Unit): Unit {
        match (this) {
            case EitherResult<T, E>.Ok(v) => handler(v)
            case EitherResult<T, E>.Err(e) => errHandler(e)
        }
    }
}

// =============================================================================
// 业务场景：订单状态机
// =============================================================================

/// 订单状态（状态机）
public enum OrderStatus {
    | Pending
    | Paid(Float64, String)                  // 金额, 支付方式
    | Shipped(String)                        // 运单号
    | Delivered(String)                      // 签收时间
    | Cancelled(String)                      // 取消原因

    /// 是否处于终态
    public func isTerminal(): Bool {
        match (this) {
            case Delivered(_) | Cancelled(_) => true
            case _ => false
        }
    }
}

/// 订单状态描述
public func orderStatusDescription(status: OrderStatus): String {
    match (status) {
        case Pending => "[订单] 待支付"
        case Paid(amount, method) => "[订单] 已支付 ${amount} 元 (${method})"
        case Shipped(tracking) => "[订单] 已发货, 运单号: ${tracking}"
        case Delivered(at) => "[订单] 已签收于 ${at}"
        case Cancelled(reason) => "[订单] 已取消: ${reason}"
    }
}