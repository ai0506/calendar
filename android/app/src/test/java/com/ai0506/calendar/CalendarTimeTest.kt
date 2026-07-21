package com.ai0506.calendar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CalendarTimeTest {
    @Test
    fun timedEventUsesShanghaiOffsetAndPreservesOrder() {
        assertEquals(
            "2026-07-20T09:00:00+08:00" to "2026-07-20T10:30:00+08:00",
            CalendarTime.eventRange("2026-07-20", false, "09:00", "10:30"),
        )
    }

    @Test
    fun allDayEventUsesDateOnlyValues() {
        assertEquals(
            "2026-07-20" to "2026-07-20",
            CalendarTime.eventRange("2026-07-20", true, "", ""),
        )
    }

    @Test
    fun invalidAndReversedTimesAreRejected() {
        assertNull(CalendarTime.eventRange("2026-07-20", false, "10:00", "10:00"))
        assertNull(CalendarTime.deadlineValue("2026-07-20", false, "invalid"))
        assertTrue(CalendarTime.isValidTime("23:59"))
        assertFalse(CalendarTime.isValidDate("2026-02-30"))
    }
}
