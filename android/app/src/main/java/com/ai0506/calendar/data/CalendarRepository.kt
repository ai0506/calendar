package com.ai0506.calendar.data

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.time.LocalDate
import java.time.YearMonth

data class TagMetadata(
    val tags: List<Tag>,
    val suggestions: Map<String, List<String>>,
)

class CalendarRepository(
    private val api: CalendarApi = ApiProvider.api,
    private val cache: CalendarCache? = null,
) {
    suspend fun login(password: String): Result<Unit> = request {
        api.login(LoginRequest(password)).requireData()
        Unit
    }

    suspend fun checkSession(): Boolean = runCatching {
        api.authStatus().data?.authenticated == true
    }.getOrDefault(false)

    suspend fun logout() {
        runCatching { api.logout() }
        ApiProvider.cookieJar.clear()
        cache?.clear()
    }

    suspend fun loadMonth(month: YearMonth): Result<MonthData> {
        val cached = cache?.read(month)
        val online = request {
            val fromDate = month.atDay(1)
            val toDate = month.atEndOfMonth()
            val from = "${fromDate}T00:00:00+08:00"
            val to = "${toDate}T23:59:59+08:00"
            coroutineScope {
                val events = async { api.events(from, to).requireData() }
                val deadlines = async { api.deadlines(fromDate.toString(), toDate.toString()).requireData() }
                val categories = async { api.categories().requireData() }
                MonthData(
                    events = events.await(),
                    deadlines = deadlines.await(),
                    categories = categories.await(),
                    tags = cached?.tags.orEmpty(),
                    tagSuggestions = cached?.tagSuggestions.orEmpty(),
                )
            }
        }
        online.onSuccess { cache?.save(month, it) }
        return online.exceptionOrNull()?.let { error -> cache?.read(month)?.let { Result.success(it) } ?: Result.failure(error) } ?: online
    }

    suspend fun loadTagMetadata(): Result<TagMetadata> = request {
        coroutineScope {
            val tags = async { api.tags().requireData() }
            val suggestions = async { api.categoryTagSuggestions().requireData() }
            TagMetadata(tags.await(), suggestions.await())
        }
    }

    suspend fun createEvent(request: CreateEventRequest): Result<CalendarEvent> = request { api.createEvent(request).requireData() }

    suspend fun event(id: String): Result<CalendarEvent> = request { api.event(id).requireData() }

    suspend fun createEventSeries(request: EventSeriesRequest): Result<EventSeriesSummary> = request { api.createEventSeries(request).requireData() }

    suspend fun updateEventSeries(id: String, request: EventSeriesPatchRequest, idempotencyKey: String): Result<EventSeriesUpdateResult> = request {
        api.updateEventSeries(id, idempotencyKey, request).requireData()
    }

    suspend fun updateEvent(id: String, request: UpdateEventRequest): Result<CalendarEvent> = request { api.updateEvent(id, request).requireData() }

    suspend fun deleteEvent(id: String): Result<DeleteResult> = request { api.deleteEvent(id).requireData() }

    suspend fun skipSeriesOccurrence(seriesId: String, originalStartTime: String): Result<SeriesException> = request {
        api.skipSeriesOccurrence(seriesId, SeriesExceptionRequest(originalStartTime)).requireData()
    }

    suspend fun deleteEventSeries(id: String): Result<DeleteResult> = request { api.deleteEventSeries(id).requireData() }

    suspend fun createDeadline(request: CreateDeadlineRequest): Result<Deadline> = request { api.createDeadline(request).requireData() }

    suspend fun deadline(id: String): Result<Deadline> = request { api.deadline(id).requireData() }

    suspend fun updateDeadline(id: String, request: UpdateDeadlineRequest): Result<Deadline> = request { api.updateDeadline(id, request).requireData() }

    suspend fun deleteDeadline(id: String): Result<DeleteResult> = request { api.deleteDeadline(id).requireData() }

    suspend fun completeDeadline(id: String): Result<Deadline> = request { api.completeDeadline(id).requireData() }

    suspend fun reopenDeadline(id: String): Result<Deadline> = request { api.reopenDeadline(id).requireData() }

    suspend fun notifications(): Result<NotificationFeed> = request { api.notifications().requireData() }

    suspend fun markNotificationRead(id: String): Result<ReadNotificationResult> = request { api.markNotificationRead(id).requireData() }

    suspend fun markAllNotificationsRead(): Result<ReadAllResult> = request { api.markAllNotificationsRead().requireData() }
}

private fun <T> ApiEnvelope<T>.requireData(): T {
    if (!ok || data == null) throw IllegalStateException(error?.message ?: "The calendar service returned an empty response.")
    return data
}

private suspend fun <T> request(block: suspend () -> T): Result<T> = try {
    Result.success(block())
} catch (error: Throwable) {
    Result.failure(error)
}

fun CalendarEvent.dateKey(): LocalDate = LocalDate.parse(startTime.take(10))
fun Deadline.dateKey(): LocalDate = LocalDate.parse(dueTime.take(10))
