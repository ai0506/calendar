package com.ai0506.calendar.ui

import com.ai0506.calendar.data.Tag
import org.junit.Assert.assertEquals
import org.junit.Test

class TagOrderingTest {
    @Test
    fun suggestedTagsComeFirstThenUseSortOrderAndName() {
        val tags = listOf(
            Tag("reading", "Reading", sortOrder = 8),
            Tag("exam", "Exam", sortOrder = 1),
            Tag("assignment", "Assignment", sortOrder = 3),
            Tag("homework", "Homework", sortOrder = 2),
        )

        val ordered = orderedTagsForCategory(tags, setOf("reading", "assignment"))

        assertEquals(listOf("assignment", "reading", "exam", "homework"), ordered.map { it.id })
    }

    @Test
    fun firstSixMatchTheCollapsedWebPicker() {
        val tags = (10 downTo 1).map { number ->
            Tag("tag-$number", "Tag $number", sortOrder = number)
        }

        val collapsed = orderedTagsForCategory(tags, emptySet()).take(6)

        assertEquals(listOf(1, 2, 3, 4, 5, 6), collapsed.map { it.sortOrder })
    }
}
