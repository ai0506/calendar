package com.ai0506.calendar.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ApiEnvelope<T>(
    val ok: Boolean,
    val data: T? = null,
    val error: ApiError? = null,
)

@Serializable
data class ApiError(
    val code: String,
    val message: String,
)

@Serializable
data class LoginRequest(val password: String)

@Serializable
data class AuthStatus(val authenticated: Boolean)

@Serializable
data class CalendarEvent(
    val id: String,
    val title: String,
    val description: String? = null,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("all_day") val allDay: Boolean = false,
    val category: String? = null,
    val color: String? = null,
    @SerialName("group_title") val groupTitle: String? = null,
    @SerialName("series_id") val seriesId: String? = null,
    @SerialName("original_start_time") val originalStartTime: String? = null,
    val reminders: List<Int>? = null,
    val tags: List<Tag> = emptyList(),
)

@Serializable
data class Deadline(
    val id: String,
    val title: String,
    val description: String? = null,
    @SerialName("due_time") val dueTime: String,
    @SerialName("all_day") val allDay: Boolean = false,
    val category: String? = null,
    val color: String? = null,
    val priority: String = "default",
    val status: String? = null,
    @SerialName("is_overdue") val isOverdue: Boolean = false,
    @SerialName("completed_at") val completedAt: String? = null,
    val tags: List<Tag> = emptyList(),
)

@Serializable
data class Category(
    val id: String,
    val name: String,
    val color: String,
    @SerialName("sort_order") val sortOrder: Int = 0,
)

@Serializable
data class Tag(
    val id: String,
    val name: String,
    val color: String? = null,
    @SerialName("sort_order") val sortOrder: Int = 0,
)

@Serializable
data class CreateEventRequest(
    val title: String,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("all_day") val allDay: Boolean,
    val category: String? = null,
    val description: String? = null,
    val reminders: List<Int>? = null,
    @SerialName("tag_ids") val tagIds: List<String>? = null,
    val source: String = "android",
)

@Serializable
data class CreateDeadlineRequest(
    val title: String,
    @SerialName("due_time") val dueTime: String,
    @SerialName("all_day") val allDay: Boolean,
    val category: String? = null,
    val priority: String = "default",
    val description: String? = null,
    @SerialName("tag_ids") val tagIds: List<String>? = null,
    val source: String = "android",
)

@Serializable
data class UpdateEventRequest(
    val title: String? = null,
    val description: String? = null,
    @SerialName("start_time") val startTime: String? = null,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("all_day") val allDay: Boolean? = null,
    val category: String? = null,
    val reminders: List<Int>? = null,
    @SerialName("tag_ids") val tagIds: List<String>? = null,
)

@Serializable
data class UpdateDeadlineRequest(
    val title: String? = null,
    val description: String? = null,
    @SerialName("due_time") val dueTime: String? = null,
    @SerialName("all_day") val allDay: Boolean? = null,
    val category: String? = null,
    val priority: String? = null,
    @SerialName("tag_ids") val tagIds: List<String>? = null,
)

@Serializable
data class DeleteResult(val id: String, val deleted: Boolean)

@Serializable
data class EventSeriesRequest(
    val title: String,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("all_day") val allDay: Boolean,
    val category: String? = null,
    val reminders: List<Int>? = null,
    @SerialName("tag_ids") val tagIds: List<String>? = null,
    val source: String = "android",
    val frequency: String,
    val interval: Int = 1,
    val weekdays: List<Int>? = null,
    @SerialName("monthly_mode") val monthlyMode: String? = null,
    @SerialName("monthly_day") val monthlyDay: Int? = null,
    @SerialName("start_date") val startDate: String,
    @SerialName("occurrence_count") val occurrenceCount: Int,
    @SerialName("idempotency_key") val idempotencyKey: String,
)

@Serializable
data class EventSeriesSummary(
    @SerialName("series_id") val seriesId: String,
    @SerialName("created_count") val createdCount: Int,
)

@Serializable
data class EventSeriesPatchRequest(
    val title: String? = null,
    val reminders: List<Int>? = null,
    @SerialName("tag_ids") val tagIds: List<String>? = null,
)

@Serializable
data class EventSeriesUpdateResult(
    @SerialName("series_id") val seriesId: String,
    val updated: Boolean,
    @SerialName("created_count") val createdCount: Int,
)

@Serializable
data class SeriesExceptionRequest(@SerialName("original_start_time") val originalStartTime: String)

@Serializable
data class SeriesException(
    val id: String,
    @SerialName("series_id") val seriesId: String,
    @SerialName("original_start_time") val originalStartTime: String,
    val skipped: Boolean = true,
)

@Serializable
data class CalendarNotification(
    val id: String,
    @SerialName("target_type") val targetType: String,
    @SerialName("target_id") val targetId: String,
    val title: String,
    val message: String,
    @SerialName("notification_type") val notificationType: String,
    @SerialName("created_at") val createdAt: String,
    @SerialName("read_at") val readAt: String? = null,
)

@Serializable
data class NotificationFeed(
    val items: List<CalendarNotification>,
    @SerialName("unread_count") val unreadCount: Int,
)

@Serializable
data class ReadNotificationResult(val id: String, val read: Boolean)

@Serializable
data class ReadAllResult(val updated: Int)
