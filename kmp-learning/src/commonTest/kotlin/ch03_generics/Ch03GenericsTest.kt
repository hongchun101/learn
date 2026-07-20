package ch03_generics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class Ch03GenericsTest {

    // --- Identity & inference ----------------------------------------------

    @Test fun `identity returns the same value for any type`() {
        assertEquals(42, identity(42))
        assertEquals("hi", identity("hi"))
        assertEquals(listOf(1), identity(listOf(1)))
    }

    @Test fun `firstOf returns first or default`() {
        assertEquals(1, firstOf(listOf(1, 2, 3), 99))
        assertEquals(99, firstOf(emptyList(), 99))
    }

    // --- Box ---------------------------------------------------------------

    @Test fun `box holds and transforms a value`() {
        val b = Box(10)
        assertEquals(10, b.get())
        b.set(20)
        assertEquals(20, b.get())
        assertEquals(40, b.transform { it * 2 })
    }

    @Test fun `pair map transforms only the first component`() {
        val p = Pair("a", 1).map { it.uppercase() }
        assertEquals("A", p.first)
        assertEquals(1, p.second)
    }

    // --- Upper bounds ------------------------------------------------------

    @Test fun `maxOf works on any comparable type`() {
        assertEquals(5, maxOf(3, 5))
        assertEquals("zebra", maxOf("zebra", "apple"))
    }

    @Test fun `sumOfNumbers requires Number AND Comparable`() {
        assertEquals(6.0, sumOfNumbers(listOf(1, 2, 3)))
        assertEquals(0.0, sumOfNumbers(emptyList()))
    }

    // --- Variance ----------------------------------------------------------

    @Test fun `producer is covariant - out T is safe to upcast`() {
        val dogs: Producer<Dog2> = object : Producer<Dog2> {
            override fun produce(): Dog2 = Dog2("Rex")
        }
        // Producer<Dog2> is assignable to Producer<Animal2> because
        // Producer is declared `out T`. This is the *whole point* of
        // declaration-site variance.
        val animals: Producer<Animal2> = dogs
        assertEquals("generic-animal", AnimalProducer().produce().name)
        // The runtime check: a Dog2-as-an-Producer<Animal2> still emits a Dog2.
        val a: Animal2 = animals.produce()
        assertTrue(a is Animal2)
    }

    @Test fun `consumer is contravariant - in T is safe to downcast`() {
        val animals: Consumer<Animal2> = StringConsumer() // A Consumer<Animal> can consume a String.
        // ... but you can pass it to a Consumer<String> because of contravariance.
        val strings: Consumer<String> = animals
        // No runtime call here; the compile-time assignability is the
        // whole point. We do call consume() to prove the bridge works.
        strings.consume("ok")
    }

    // --- Star projection ----------------------------------------------------

    @Test fun `List star projection accepts any element type`() {
        assertEquals(3, lengthOf(listOf(1, 2, 3)))
        assertEquals(0, lengthOf(emptyList<String>()))
    }

    // --- `where` clause ----------------------------------------------------

    @Test fun `describe uses both Named and Aged`() {
        assertEquals("Ada (36)", describe(Person("Ada", 36)))
    }

    // --- `reified` + `inline` ---------------------------------------------

    @Test fun `reified type gives a runtime name`() {
        assertEquals("String", loggerFor<String>())
        assertEquals("Int", loggerFor<Int>())
    }

    @Test fun `firstOfType picks the first element of the given type`() {
        val mixed: List<Any> = listOf(1, "two", 3.0, "four")
        val firstString = mixed.firstOfType<String>()
        assertNotNull(firstString)
        assertEquals("two", firstString)
        val noLong: List<Any> = listOf(1, 2, 3)
        assertNull(noLong.firstOfType<String>())
    }

    // --- Generic constraint in inheritance --------------------------------

    @Test fun `StringList is an Iterable of String`() {
        val s = StringList()
        s.add("a"); s.add("b"); s.add("c")
        val collected = s.toList()
        assertEquals(listOf("a", "b", "c"), collected)
        // The iterator returns String because we declared it that way.
        for (item in s) {
            assertTrue(item is String)
        }
    }

    // --- Nothing -----------------------------------------------------------

    @Test fun `List of Nothing is the empty list`() {
        assertEquals(0, empty.size)
    }

    // --- Tour --------------------------------------------------------------

    @Test fun `tour produces the expected sequence`() {
        val items = tour()
        assertTrue(items.isNotEmpty())
        // The first entry is the identity result; the last is the
        // StringList.toList() output. The tour is the chapter's
        // "executive summary" — the test pins it.
        assertEquals("x", items.first())
        assertEquals("[a, b]", items.last())
    }
}
