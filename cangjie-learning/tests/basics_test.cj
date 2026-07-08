// =============================================================================
// tests/basics_test.cj - 单元测试
// =============================================================================
// 测试模块 01 - 基础语法
// =============================================================================

package tests

@Test
public class BasicsTest {
    @TestCase
    public func testPI(): Unit {
        @Assert(PI == 3.14159265358979)
    }

    @TestCase
    public func testMustBePositive(): Unit {
        let result = mustBePositive(10)
        @Assert(result == 10)
    }

    @TestCase
    public func testTypeAlias(): Unit {
        let id: UserId = 42
        @Assert(id == 42)
    }
}

// =============================================================================
// tests/functions_test.cj - 函数测试
// =============================================================================

@Test
public class FunctionsTest {
    @TestCase
    public func testAdd(): Unit {
        @Assert(add(3, 4) == 7)
    }

    @TestCase
    public func testGreetDefault(): Unit {
        // 仅作演示（无返回值断言）
        greet("仓颉")
    }

    @TestCase
    public func testSumAll(): Unit {
        @Assert(sumAll(values: 1, 2, 3) == 6)
    }

    @TestCase
    public func testFib(): Unit {
        @Assert(fib(10) == 55)
    }
}

// =============================================================================
// tests/enums_test.cj - 枚举测试
// =============================================================================

@Test
public class EnumsTest {
    @TestCase
    public func testShapeCircle(): Unit {
        let s: Shape = Shape.Circle(1.0)
        let a = s.area()
        @Assert(abs(a - 3.14159265) < 0.0001)
    }

    @TestCase
    public func testOptionUnwrapOr(): Unit {
        let some: Option<Int64> = Some(42)
        let none: Option<Int64> = None
        @Assert(some.unwrapOr(0) == 42)
        @Assert(none.unwrapOr(-1) == -1)
    }

    @TestCase
    public func testResultIsOk(): Unit {
        let ok: Result<Int64, String> = Ok(100)
        let err: Result<Int64, String> = Err("fail")
        @Assert(ok.isOk())
        @Assert(!err.isOk())
    }
}

// =============================================================================
// tests/generics_test.cj - 泛型测试
// =============================================================================

@Test
public class GenericsTest {
    @TestCase
    public func testIdentity(): Unit {
        @Assert(identity(42) == 42)
        @Assert(identity("hello") == "hello")
    }

    @TestCase
    public func testBox(): Unit {
        let box = Box<Int64>(100)
        @Assert(box.value == 100)
    }

    @TestCase
    public func testStack(): Unit {
        let stack = Stack<Int64>()
        stack.push(1)
        stack.push(2)
        @Assert(stack.peek() == 2)
        @Assert(stack.pop() == 2)
        @Assert(stack.size() == 1)
    }
}

// =============================================================================
// tests/extensions_test.cj - 扩展测试
// =============================================================================

@Test
public class ExtensionsTest {
    @TestCase
    public func testIntFactorial(): Unit {
        @Assert(5.factorial() == 120)
        @Assert(0.factorial() == 1)
    }

    @TestCase
    public func testIntIsEven(): Unit {
        @Assert(4.isEven())
        @Assert(!5.isEven())
    }

    @TestCase
    public func testIntIsPrime(): Unit {
        @Assert(7.isPrime())
        @Assert(!8.isPrime())
        @Assert(2.isPrime())
    }

    @TestCase
    public func testStringReverse(): Unit {
        @Assert("hello".reverse() == "olleh")
    }
}

// =============================================================================
// tests/collections_test.cj - 集合测试
// =============================================================================

@Test
public class CollectionsTest {
    @TestCase
    public func testMap(): Unit {
        let result = map([1, 2, 3], { x => x * 2 })
        @Assert(result == [2, 4, 6])
    }

    @TestCase
    public func testFilter(): Unit {
        let result = filter([1, 2, 3, 4], { x => x % 2 == 0 })
        @Assert(result == [2, 4])
    }

    @TestCase
    public func testReduce(): Unit {
        let result = reduce([1, 2, 3, 4], 0, { acc, x => acc + x })
        @Assert(result == 10)
    }
}