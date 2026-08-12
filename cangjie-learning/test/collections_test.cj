// =============================================================================
// tests/collections_test.cj - 集合操作测试
// =============================================================================

package tests

import cangjie_learning.lambdas.*
import cangjie_learning.collection_ops.*

@Test
public class LambdasTest {
    @TestCase
    public func testMap(): Unit {
        let result = map([1, 2, 3], { x => x * 2 })
        @Assert(result.size == 3)
        @Assert(result[0] == 2)
        @Assert(result[1] == 4)
        @Assert(result[2] == 6)
    }

    @TestCase
    public func testFilter(): Unit {
        let result = filter([1, 2, 3, 4], { x => x % 2 == 0 })
        @Assert(result.size == 2)
        @Assert(result[0] == 2)
        @Assert(result[1] == 4)
    }

    @TestCase
    public func testReduce(): Unit {
        let result = reduce([1, 2, 3, 4], 0, { acc, x => acc + x })
        @Assert(result == 10)
    }

    @TestCase
    public func testCurry(): Unit {
        let curriedAdd = curry({ a: Int64, b: Int64 => a + b })
        let add5 = curriedAdd(5)
        @Assert(add5(3) == 8)
    }
}

@Test
public class CollectionOpsTest {
    @TestCase
    public func testMyMap(): Unit {
        let result = myMap([1, 2, 3], { x => x + 10 })
        @Assert(result.size == 3)
        @Assert(result[0] == 11)
    }

    @TestCase
    public func testMyFilter(): Unit {
        let result = myFilter([1, 2, 3, 4], { x => x > 2 })
        @Assert(result.size == 2)
    }

    @TestCase
    public func testMyFind(): Unit {
        let r = myFind([1, 2, 3, 4, 5], { x => x > 3 })
        match (r) {
            case MaybeOption<Int64>.Some(v) => @Assert(v == 4)
            case MaybeOption<Int64>.None => @Assert(false)
        }
    }

    @TestCase
    public func testSorted(): Unit {
        let arr = [3, 1, 4, 1, 5]
        let s = sorted(arr)
        @Assert(s[0] == 1)
        @Assert(s[4] == 5)
    }
}
