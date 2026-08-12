// =============================================================================
// tests/basics_test.cj - 单元测试
// =============================================================================
// 测试模块 01 - 基础语法
// =============================================================================

package tests

import cangjie_learning.basics.*
import cangjie_learning.enums.*

@Test
public class BasicsTest {
    @TestCase
    public func testPI(): Unit {
        @Assert(PI == 3.14159265358979)
    }

    @TestCase
    public func testMaxRetry(): Unit {
        @Assert(MAX_RETRY == 3)
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

@Test
public class EnumsTest {
    @TestCase
    public func testMaybeOption(): Unit {
        let some: MaybeOption<Int64> = MaybeOption<Int64>.Some(42)
        let none: MaybeOption<Int64> = MaybeOption<Int64>.None
        @Assert(some.unwrapOr(0) == 42)
        @Assert(none.unwrapOr(-1) == -1)
    }

    @TestCase
    public func testEitherResult(): Unit {
        let ok: EitherResult<Int64, String> = EitherResult<Int64, String>.Ok(100)
        let err: EitherResult<Int64, String> = EitherResult<Int64, String>.Err("fail")
        @Assert(ok.isOk())
        @Assert(!err.isOk())
        @Assert(ok.unwrapOr(-1) == 100)
        @Assert(err.unwrapOr(-1) == -1)
    }

    @TestCase
    public func testColor(): Unit {
        let c = Color.Red
        @Assert(c.name() == "红色")
    }

    @TestCase
    public func testShapeArea(): Unit {
        let s: Shape = Shape.Circle(1.0)
        let a = s.area()
        @Assert(a > 3.14 && a < 3.15)
    }

    @TestCase
    public func testBinaryTree(): Unit {
        let tree: BinaryTree<Int64> = BinaryTree<Int64>.Node(
            BinaryTree<Int64>.Leaf(1),
            BinaryTree<Int64>.Leaf(2),
            { a, b => a + b }
        )
        @Assert(evalTree(tree) == 3)
    }
}
