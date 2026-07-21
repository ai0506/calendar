package com.ai0506.calendar

import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** Date/time conversion shared by create and edit flows. Timed API values use Shanghai +08:00. */
object CalendarTime {
    private val shanghaiOffset = ZoneOffset.ofHours(8)

    fun isValidDate(value: String): Boolean = runCatching { LocalDate.parse(value) }.isSuccess

    fun isValidTime(value: String): Boolean = runCatching { LocalTime.parse(value) }.isSuccess

    fun eventRange(dateText: String, allDay: Boolean, startText: String, endText: String): Pair<String, String>? {
        val date = runCatching { LocalDate.parse(dateText) }.getOrNull() ?: return null
        if (allDay) return date.toString() to date.toString()
        val start = runCatching { LocalTime.parse(startText) }.getOrNull() ?: return null
        val end = runCatching { LocalTime.parse(endText) }.getOrNull() ?: return null
        if (!end.isAfter(start)) return null
        return date.atTime(start).atOffset(shanghaiOffset).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME) to
            date.atTime(end).atOffset(shanghaiOffset).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
    }

    fun deadlineValue(dateText: String, allDay: Boolean, dueText: String): String? {
        val date = runCatching { LocalDate.parse(dateText) }.getOrNull() ?: return null
        if (allDay) return date.toString()
        val due = runCatching { LocalTime.parse(dueText) }.getOrNull() ?: return null
        return date.atTime(due).atOffset(shanghaiOffset).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
    }
}
