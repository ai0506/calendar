package com.ai0506.calendar.data

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.YearMonth

/** A small, private last-known-good cache. The server remains the source of truth. */
class CalendarCache(context: Context) {
    private val preferences = context.getSharedPreferences("calendar_cache", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    fun save(month: YearMonth, data: MonthData) {
        preferences.edit().putString("month:$month", json.encodeToString(MonthData.serializer(), data)).apply()
    }

    fun read(month: YearMonth): MonthData? = preferences.getString("month:$month", null)?.let { encoded ->
        runCatching { json.decodeFromString(MonthData.serializer(), encoded) }.getOrNull()
    }

    /** Used only after a device reboot, when AlarmManager has cleared all alarms. */
    fun allCached(): MonthData {
        val months = preferences.all
            .filterKeys { it.startsWith("month:") }
            .values
            .filterIsInstance<String>()
            .mapNotNull { encoded -> runCatching { json.decodeFromString(MonthData.serializer(), encoded) }.getOrNull() }
        return MonthData(
            events = months.flatMap { it.events }.distinctBy { it.id },
            deadlines = months.flatMap { it.deadlines }.distinctBy { it.id },
            categories = months.flatMap { it.categories }.distinctBy { it.id },
            tags = months.flatMap { it.tags }.distinctBy { it.id },
            tagSuggestions = months.flatMap { it.tagSuggestions.entries }.associate { it.key to it.value },
        )
    }

    fun clear() = preferences.edit().clear().apply()
}

@Serializable
data class MonthData(
    val events: List<CalendarEvent>,
    val deadlines: List<Deadline>,
    val categories: List<Category>,
    val tags: List<Tag> = emptyList(),
    val tagSuggestions: Map<String, List<String>> = emptyMap(),
)
