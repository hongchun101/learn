// =============================================================================
// tests/extensions_test.cj - 扩展测试
// =============================================================================

package tests

import cangjie_learning.extensions.*

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
        @Assert(!1.isPrime())
        @Assert(!0.isPrime())
    }

    @TestCase
    public func testIntClamped(): Unit {
        @Assert(100.clamped(min: 0, max: 10) == 10)
        @Assert((-5).clamped(min: 0, max: 10) == 0)
        @Assert(5.clamped(min: 0, max: 10) == 5)
    }

    @TestCase
    public func testStringReverse(): Unit {
        @Assert("hello".reverse() == "olleh")
    }

    @TestCase
    public func testStringIsPalindrome(): Unit {
        @Assert("abcba".isPalindrome())
        @Assert(!"hello".isPalindrome())
    }

    @TestCase
    public func testStringCapitalize(): Unit {
        @Assert("hello".capitalize() == "Hello")
    }

    @TestCase
    public func testStringWordCount(): Unit {
        @Assert("the quick brown fox".wordCount() == 4)
    }
}
