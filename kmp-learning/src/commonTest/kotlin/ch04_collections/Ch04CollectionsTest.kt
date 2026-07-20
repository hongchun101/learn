package ch04_collections

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class Ch04CollectionsTest {

    // --- Read-only collections --------------------------------------------

    @Test fun `listOf preserves order and duplicates`() {
        val l = listOf(1, 2, 3, 3)
        assertEquals(4, l.size)
        assertEquals(3, l[2])
        assertEquals(3, l[3])
    }

    @Test fun `setOf deduplicates`() {
        val s = setOf("a", "b", "a")
        assertEquals(2, s.size)
        assertTrue("a" in s)
    }

    @Test fun `mapOf maps key to value`() {
        val m = mapOf("a" to 1, "b" to 2)
        assertEquals(1, m["a"])
        assertEquals(2, m["b"])
        assertEquals(null, m["c"])
    }

    // --- Mutable collections ----------------------------------------------

    @Test fun `mutableListOps produces the expected sequence`() {
        assertEquals(listOf(10, 3, 4, 5, 6), mutableListOps())
    }

    // --- Pipeline ---------------------------------------------------------

    @Test fun `pipeline sums by status`() {
        val out = pipeline(listOf(
            Order(1, 10.0, "PAID"),
            Order(2, 20.0, "PENDING"),
            Order(3, 30.0, "PAID"),
        ))
        assertEquals(40.0, out["PAID"])
    }

    // --- Sequence ---------------------------------------------------------

    @Test fun `generateSequence produces an infinite stream`() {
        val out = firstNSquaredEven(3)
        // 1..6 evens: 2, 4, 6 -> squared: 4, 16, 36 -> sum 56
        assertEquals(56, out)
    }

    @Test fun `naturals takes the first 5`() {
        val first5 = naturals().take(5).toList()
        assertEquals(listOf(1, 2, 3, 4, 5), first5)
    }

    // --- Ranges -----------------------------------------------------------

    @Test fun `rangeOps outputs the expected list`() {
        assertEquals(8, rangeOps().size)
        assertEquals("55", rangeOps()[0])
        assertEquals("[1, 3, 5, 7, 9]", rangeOps()[1])
        assertEquals("10", rangeOps()[2])
        assertEquals("26", rangeOps()[3])
        assertEquals("[1, 2, 3, 4]", rangeOps()[4])
    }

    // --- Arrays -----------------------------------------------------------

    @Test fun `arrayOps combines boxed and primitive arrays`() {
        // boxed: [a, b, c]   primitive sum: 6
        val s = arrayOps()
        assertTrue(s.contains("[a, b, c]"))
        assertTrue(s.contains("6"))
    }

    // --- Collection types ------------------------------------------------

    @Test fun `ArrayDeque supports both ends in O1`() {
        val q = ArrayDeque<Int>()
        q.addLast(2); q.addLast(3); q.addFirst(1)
        assertEquals(1, q.first())
        assertEquals(3, q.last())
        assertEquals(1, q.removeFirst())
    }

    @Test fun `sortedSet and sortedMap order their entries`() {
        assertEquals("[1, 2, 3]", sortedSetOf(3, 1, 2).toString())
        assertEquals("{a=1, c=3}", sortedMapOf("c" to 3, "a" to 1).toString())
    }

    // --- Operations catalogue --------------------------------------------

    @Test fun `opsCatalogue pins the standard library output`() {
        val out = opsCatalogue()
        // Spot-check a handful.
        assertEquals("[2, 4, 6]", out[0])
        assertEquals("[1, 4, 9, 16, 25, 36]", out[1])
        assertEquals("21", out[2])
        assertEquals("121", out[3])
        assertEquals("true", out[4])
        assertEquals("true", out[5])
        assertEquals("true", out[6])
        assertEquals("3", out[7])
        assertEquals("([2, 4, 6], [1, 3, 5])", out[8])
        assertEquals("{1=[1, 3, 5], 0=[2, 4, 6]}", out[9])
        assertEquals("[[1, 2], [3, 4], [5, 6]]", out[10])
        assertEquals("[[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6]]", out[11])
    }

    // --- Empty ------------------------------------------------------------

    @Test fun `isEmpty distinguishes empty from non-empty`() {
        assertTrue(isEmpty(emptyList<String>()))
        assertTrue(!isEmpty(listOf(1)))
    }

    // --- Tour --------------------------------------------------------------

    @Test fun `tour produces the expected sequence`() {
        val items = tour()
        assertEquals(10, items.size)
        // Last two items are the isEmpty checks.
        assertEquals("true", items[8])
        assertEquals("false", items[9])
    }
}
