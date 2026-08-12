// =============================================================================
// tests/operators_test.cj - 操作符重载测试
// =============================================================================

package tests

import cangjie_learning.operator_overloading.*

@Test
public class OperatorsTest {
    @TestCase
    public func testVec2Add(): Unit {
        let v1 = Vec2(1.0, 2.0)
        let v2 = Vec2(3.0, 4.0)
        let sum = v1 + v2
        @Assert(sum.x == 4.0)
        @Assert(sum.y == 6.0)
    }

    @TestCase
    public func testVec2Negate(): Unit {
        let v = Vec2(3.0, -4.0)
        let n = -v
        @Assert(n.x == -3.0)
        @Assert(n.y == 4.0)
    }

    @TestCase
    public func testVec2Index(): Unit {
        let v = Vec2(7.0, 8.0)
        @Assert(v[0] == 7.0)
        @Assert(v[1] == 8.0)
    }

    @TestCase
    public func testComplexAdd(): Unit {
        let c1 = Complex(1.0, 2.0)
        let c2 = Complex(3.0, 4.0)
        let sum = c1 + c2
        @Assert(sum.real == 4.0)
        @Assert(sum.imag == 6.0)
    }

    @TestCase
    public func testComplexMultiply(): Unit {
        let c1 = Complex(1.0, 2.0)
        let c2 = Complex(3.0, 4.0)
        let p = c1 * c2
        // (1+2i)(3+4i) = 3 + 4i + 6i - 8 = -5 + 10i
        @Assert(p.real == -5.0)
        @Assert(p.imag == 10.0)
    }
}
