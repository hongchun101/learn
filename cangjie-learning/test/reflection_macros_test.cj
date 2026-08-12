// =============================================================================
// tests/reflection_macros_test.cj - 反射/宏测试
// =============================================================================

package tests

import cangjie_learning.reflection_macros.*

@Test
public class CompileTimeTest {
    @TestCase
    public func testConstPow2(): Unit {
        @Assert(constPow2(10) == 1024)
    }

    @TestCase
    public func testConstFib(): Unit {
        @Assert(constFib(10) == 55)
    }

    @TestCase
    public func testConstFactorial(): Unit {
        @Assert(constFactorialImpl(5) == 120)
    }

    @TestCase
    public func testValidatePort(): Unit {
        @Assert(validatePort(8080))
        @Assert(validatePort(0))
        @Assert(validatePort(65535))
        @Assert(!validatePort(70000))
        @Assert(!validatePort(-1))
    }
}

@Test
public class JsonSerializationTest {
    @TestCase
    public func testUserJson(): Unit {
        let u = User("Alice", 30, "alice@example.com")
        let json = JsonSerializer.serialize(u)
        @Assert(json.contains("\"name\":\"Alice\""))
        @Assert(json.contains("\"age\":30"))
    }

    @TestCase
    public func testProductJson(): Unit {
        let p = Product("Widget", 99.99, 100)
        let json = JsonSerializer.serialize(p)
        @Assert(json.contains("\"name\":\"Widget\""))
    }
}

@Test
public class JsonParserTest {
    @TestCase
    public func testGetString(): Unit {
        let s = "{\"name\":\"Alice\",\"age\":30}"
        match (JsonParser.getString(s, "name")) {
            case Some(v) => @Assert(v == "Alice")
            case None => @Assert(false)
        }
    }

    @TestCase
    public func testGetInt(): Unit {
        let s = "{\"name\":\"Alice\",\"age\":30}"
        match (JsonParser.getInt(s, "age")) {
            case Some(v) => @Assert(v == 30)
            case None => @Assert(false)
        }
    }
}
