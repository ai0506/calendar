package com.ai0506.calendar

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ai0506.calendar.data.CalendarEvent
import com.ai0506.calendar.data.CalendarNotification
import com.ai0506.calendar.data.CalendarCache
import com.ai0506.calendar.data.CalendarRepository
import com.ai0506.calendar.data.Category
import com.ai0506.calendar.data.CreateDeadlineRequest
import com.ai0506.calendar.data.CreateEventRequest
import com.ai0506.calendar.data.Deadline
import com.ai0506.calendar.data.EventSeriesRequest
import com.ai0506.calendar.data.EventSeriesPatchRequest
import com.ai0506.calendar.data.UpdateDeadlineRequest
import com.ai0506.calendar.data.UpdateEventRequest
import com.ai0506.calendar.data.Tag
import com.ai0506.calendar.data.dateKey
import com.ai0506.calendar.notifications.ReminderScheduler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth
import java.util.UUID

data class CalendarUiState(
    val checkingSession: Boolean = true,
    val authenticated: Boolean = false,
    val loading: Boolean = false,
    val viewMode: CalendarViewMode = CalendarViewMode.MONTH,
    val month: YearMonth = YearMonth.now(),
    val selectedDate: LocalDate = LocalDate.now(),
    val events: List<CalendarEvent> = emptyList(),
    val deadlines: List<Deadline> = emptyList(),
    val categories: List<Category> = emptyList(),
    val tags: List<Tag> = emptyList(),
    val tagSuggestions: Map<String, List<String>> = emptyMap(),
    val categoryFilter: Set<String> = emptySet(),
    val tagFilter: Set<String> = emptySet(),
    val notifications: List<CalendarNotification> = emptyList(),
    val unreadNotifications: Int = 0,
    val message: String? = null,
)

enum class CalendarViewMode { MONTH, WEEK, DAY }

data class EventEditForm(
    val title: String,
    val date: String,
    val allDay: Boolean,
    val startTime: String,
    val endTime: String,
    val category: String?,
    val description: String,
    val reminders: List<Int>,
    val tagIds: List<String>,
)

data class DeadlineEditForm(
    val title: String,
    val date: String,
    val allDay: Boolean,
    val dueTime: String,
    val category: String?,
    val description: String,
    val priority: String,
    val tagIds: List<String>,
)

class CalendarViewModel(
    application: Application,
) : AndroidViewModel(application) {
    private val cache = CalendarCache(application.applicationContext)
    private val repository = CalendarRepository(cache = cache)
    private val reminderScheduler = ReminderScheduler(application.applicationContext)
    private val _state = MutableStateFlow(CalendarUiState())
    val state: StateFlow<CalendarUiState> = _state.asStateFlow()
    private var tagMetadataLoading = false

    init {
        viewModelScope.launch {
            val authenticated = repository.checkSession()
            _state.update { it.copy(checkingSession = false, authenticated = authenticated) }
            if (authenticated) {
                loadMonth()
                loadTagMetadata()
            }
        }
    }

    fun login(password: String) = viewModelScope.launch {
        _state.update { it.copy(loading = true, message = null) }
        repository.login(password).onSuccess {
            _state.update { it.copy(authenticated = true, loading = false) }
            loadMonth()
            loadTagMetadata()
        }.onFailure { error ->
            _state.update { it.copy(loading = false, message = loginFailureMessage(error)) }
        }
    }

    fun logout() = viewModelScope.launch {
        repository.logout()
        tagMetadataLoading = false
        _state.value = CalendarUiState(checkingSession = false)
    }

    fun previousPeriod() = movePeriod(-1)

    fun nextPeriod() = movePeriod(1)

    private fun movePeriod(direction: Long) {
        val before = _state.value
        val targetDate = when (before.viewMode) {
            CalendarViewMode.MONTH -> before.month.plusMonths(direction).atDay(1)
            CalendarViewMode.WEEK -> before.selectedDate.plusWeeks(direction)
            CalendarViewMode.DAY -> before.selectedDate.plusDays(direction)
        }
        val targetMonth = YearMonth.from(targetDate)
        _state.update { it.copy(month = targetMonth, selectedDate = targetDate) }
        if (targetMonth != before.month) loadMonth()
    }

    fun today() {
        _state.update { it.copy(month = YearMonth.now(), selectedDate = LocalDate.now()) }
        loadMonth()
    }

    fun selectDate(date: LocalDate) {
        val targetMonth = YearMonth.from(date)
        val monthChanged = targetMonth != _state.value.month
        _state.update { it.copy(month = targetMonth, selectedDate = date) }
        if (monthChanged) loadMonth()
    }

    fun setViewMode(viewMode: CalendarViewMode) = _state.update { it.copy(viewMode = viewMode) }

    fun showAllCategories() = _state.update { it.copy(categoryFilter = emptySet()) }

    fun toggleCategory(name: String) = _state.update { state ->
        val selected = state.categoryFilter
        when {
            selected.isEmpty() -> state.copy(categoryFilter = setOf(name))
            name in selected -> state.copy(categoryFilter = selected - name)
            else -> state.copy(categoryFilter = selected + name)
        }
    }

    fun toggleTag(id: String) = _state.update { state ->
        state.copy(tagFilter = if (id in state.tagFilter) state.tagFilter - id else state.tagFilter + id)
    }

    fun clearMessage() = _state.update { it.copy(message = null) }

    fun loadNotifications() = viewModelScope.launch {
        repository.notifications().onSuccess { feed ->
            _state.update { it.copy(notifications = feed.items, unreadNotifications = feed.unreadCount) }
        }
    }

    fun markNotificationRead(id: String) = viewModelScope.launch {
        repository.markNotificationRead(id).onSuccess {
            _state.update { state ->
                val items = state.notifications.map { if (it.id == id) it.copy(readAt = it.readAt ?: "now") else it }
                state.copy(notifications = items, unreadNotifications = (state.unreadNotifications - 1).coerceAtLeast(0))
            }
        }
    }

    fun openNotification(notification: CalendarNotification) = viewModelScope.launch {
        repository.markNotificationRead(notification.id).onSuccess {
            _state.update { state ->
                val items = state.notifications.map { if (it.id == notification.id) it.copy(readAt = it.readAt ?: "now") else it }
                state.copy(notifications = items, unreadNotifications = (state.unreadNotifications - if (notification.readAt == null) 1 else 0).coerceAtLeast(0))
            }
        }
        val date = when (notification.targetType) {
            "event" -> repository.event(notification.targetId).getOrNull()?.dateKey()
            "deadline" -> repository.deadline(notification.targetId).getOrNull()?.dateKey()
            else -> null
        } ?: return@launch
        _state.update { it.copy(month = YearMonth.from(date), selectedDate = date) }
        loadMonth()
    }

    fun markAllNotificationsRead() = viewModelScope.launch {
        repository.markAllNotificationsRead().onSuccess {
            _state.update { state ->
                state.copy(notifications = state.notifications.map { it.copy(readAt = it.readAt ?: "now") }, unreadNotifications = 0)
            }
        }
    }

    fun loadMonth(showLoading: Boolean = true) = viewModelScope.launch {
        val month = _state.value.month
        val previousCachedMonth = cache.read(month)
        // Show the last successful answer immediately. The online result below
        // remains authoritative, but this avoids reopening the app to a blank
        // calendar while the network request is in flight.
        if (showLoading) previousCachedMonth?.let { cached ->
            _state.update {
                it.copy(
                    events = cached.events,
                    deadlines = cached.deadlines,
                    categories = cached.categories,
                    // Adjacent-month prefetches can predate the optional Tag
                    // metadata request. Never make an already-loaded picker
                    // disappear while switching months.
                    tags = cached.tags.ifEmpty { it.tags },
                    tagSuggestions = cached.tagSuggestions.ifEmpty { it.tagSuggestions },
                )
            }
        }
        if (showLoading) _state.update { it.copy(loading = true, message = null) }
        repository.loadMonth(month).onSuccess { data ->
            reminderScheduler.replaceMonth(previousCachedMonth, data)
            _state.update { it.copy(loading = false, events = data.events, deadlines = data.deadlines, categories = data.categories) }
            loadNotifications()
            prefetchAdjacentMonths(month)
        }.onFailure { error ->
            if (showLoading) _state.update { it.copy(loading = false, message = error.message ?: "Unable to load calendar") }
        }
    }

    private fun loadTagMetadata() {
        if (tagMetadataLoading) return
        tagMetadataLoading = true
        viewModelScope.launch {
            val result = repository.loadTagMetadata()
            tagMetadataLoading = false
            result.onSuccess { metadata ->
                _state.update { it.copy(tags = metadata.tags, tagSuggestions = metadata.suggestions) }
                val month = _state.value.month
                cache.read(month)?.let { cached ->
                    cache.save(month, cached.copy(tags = metadata.tags, tagSuggestions = metadata.suggestions))
                }
            }
            // Tags are optional metadata. A failure must not replace a usable
            // calendar with an error state; the next login/app start retries.
        }
    }

    /** Apply a confirmed server mutation immediately, then quietly reconcile it. */
    private fun finishMutation(transform: (CalendarUiState) -> CalendarUiState) {
        _state.update { transform(it).copy(loading = false, message = null) }
        loadMonth(showLoading = false)
    }

    /** Restore the authoritative month quietly if an optimistic local change fails. */
    private fun recoverMutation(error: Throwable) {
        _state.update { it.copy(loading = false, message = error.message ?: "Unable to save changes") }
        loadMonth(showLoading = false)
    }

    /** Keep adjacent months warm so normal month navigation feels immediate. */
    private fun prefetchAdjacentMonths(month: YearMonth) = viewModelScope.launch {
        listOf(month.minusMonths(1), month.plusMonths(1)).forEach { adjacent ->
            repository.loadMonth(adjacent)
        }
    }

    fun createEvent(
        title: String,
        date: LocalDate,
        allDay: Boolean,
        category: String?,
        reminders: List<Int>?,
        startTime: String,
        endTime: String,
        repeatFrequency: String? = null,
        occurrenceCount: Int = 10,
        tagIds: List<String> = emptyList(),
    ) = viewModelScope.launch {
        val range = CalendarTime.eventRange(date.toString(), allDay, startTime, endTime)
        if (range == null) {
            _state.update { it.copy(message = "End time must be later than start time") }
            return@launch
        }
        val (start, end) = range
        _state.update { it.copy(loading = true) }
        if (repeatFrequency == null) {
            repository.createEvent(
                CreateEventRequest(title = title, startTime = start, endTime = end, allDay = allDay, category = category, reminders = reminders, tagIds = tagIds),
            ).onSuccess { event ->
                reminderScheduler.schedule(listOf(event), emptyList())
                finishMutation { state -> state.copy(events = (state.events.filterNot { it.id == event.id } + event).sortedBy { it.startTime }) }
            }.onFailure { error ->
                _state.update { it.copy(loading = false, message = error.message ?: "Unable to create event") }
            }
        } else {
            val weeklyDay = date.dayOfWeek.value % 7
            repository.createEventSeries(
                EventSeriesRequest(
                    title = title,
                    startTime = start,
                    endTime = end,
                    allDay = allDay,
                    category = category,
                    reminders = reminders,
                    tagIds = tagIds,
                    frequency = repeatFrequency,
                    weekdays = if (repeatFrequency == "weekly") listOf(weeklyDay) else null,
                    monthlyMode = if (repeatFrequency == "monthly") "day-of-month" else null,
                    monthlyDay = if (repeatFrequency == "monthly") date.dayOfMonth else null,
                    startDate = date.toString(),
                    occurrenceCount = occurrenceCount.coerceIn(1, 366),
                    idempotencyKey = UUID.randomUUID().toString(),
                ),
            ).onSuccess {
                loadMonth()
            }.onFailure { error ->
                _state.update { it.copy(loading = false, message = error.message ?: "Unable to create event") }
            }
        }
    }

    fun createDeadline(title: String, date: LocalDate, allDay: Boolean, category: String?, priority: String, dueTime: String, tagIds: List<String> = emptyList()) = viewModelScope.launch {
        val due = CalendarTime.deadlineValue(date.toString(), allDay, dueTime)
        if (due == null) {
            _state.update { it.copy(message = "Enter time as HH:mm") }
            return@launch
        }
        _state.update { it.copy(loading = true) }
        repository.createDeadline(CreateDeadlineRequest(title = title, dueTime = due, allDay = allDay, category = category, priority = priority, tagIds = tagIds))
            .onSuccess { deadline ->
                finishMutation { state -> state.copy(deadlines = (state.deadlines.filterNot { it.id == deadline.id } + deadline).sortedBy { it.dueTime }) }
            }
            .onFailure { error -> _state.update { it.copy(loading = false, message = error.message ?: "Unable to create deadline") } }
    }

    fun updateEvent(event: CalendarEvent, form: EventEditForm) = viewModelScope.launch {
        val range = CalendarTime.eventRange(form.date, form.allDay, form.startTime, form.endTime)
        if (range == null) {
            _state.update { it.copy(message = "Check the event date and time") }
            return@launch
        }
        val (startValue, endValue) = range
        val request = UpdateEventRequest(
            title = form.title,
            description = form.description,
            startTime = startValue,
            endTime = endValue,
            allDay = form.allDay,
            category = form.category,
            // A recurring occurrence inherits this setting from the series and cannot override it.
            reminders = if (event.seriesId == null && !form.allDay) form.reminders else null,
            tagIds = if (event.seriesId == null) form.tagIds else null,
        )
        val optimistic = event.copy(
            title = form.title,
            description = form.description,
            startTime = startValue,
            endTime = endValue,
            allDay = form.allDay,
            category = form.category,
            reminders = if (event.seriesId == null && !form.allDay) form.reminders else event.reminders,
            tags = if (event.seriesId == null) stateTags(form.tagIds) else event.tags,
        )
        _state.update { state -> state.copy(events = (state.events.filterNot { it.id == event.id } + optimistic).sortedBy { it.startTime }, message = null) }
        repository.updateEvent(event.id, request).onSuccess { updated ->
            reminderScheduler.cancelEvent(event.id)
            if (!updated.allDay) reminderScheduler.schedule(listOf(updated), emptyList())
            finishMutation { state -> state.copy(events = (state.events.filterNot { it.id == updated.id } + updated).sortedBy { it.startTime }) }
        }.onFailure(::recoverMutation)
    }

    fun deleteEvent(id: String) = viewModelScope.launch {
        _state.update { state -> state.copy(events = state.events.filterNot { it.id == id }, message = null) }
        repository.deleteEvent(id).onSuccess {
            reminderScheduler.cancelEvent(id)
            finishMutation { state -> state.copy(events = state.events.filterNot { it.id == id }) }
        }.onFailure(::recoverMutation)
    }

    fun skipSeriesOccurrence(seriesId: String, originalStartTime: String) = viewModelScope.launch {
        val removedEventId = _state.value.events.firstOrNull {
            it.seriesId == seriesId && (it.originalStartTime ?: it.startTime) == originalStartTime
        }?.id
        _state.update { state -> state.copy(events = state.events.filterNot { it.seriesId == seriesId && (it.originalStartTime ?: it.startTime) == originalStartTime }, message = null) }
        repository.skipSeriesOccurrence(seriesId, originalStartTime).onSuccess {
            removedEventId?.let(reminderScheduler::cancelEvent)
            finishMutation { state -> state.copy(events = state.events.filterNot { it.seriesId == seriesId && (it.originalStartTime ?: it.startTime) == originalStartTime }) }
        }.onFailure(::recoverMutation)
    }

    fun deleteEventSeries(seriesId: String) = viewModelScope.launch {
        val eventIds = _state.value.events.filter { it.seriesId == seriesId }.map { it.id }
        _state.update { state -> state.copy(events = state.events.filterNot { it.seriesId == seriesId }, message = null) }
        repository.deleteEventSeries(seriesId).onSuccess {
            eventIds.forEach(reminderScheduler::cancelEvent)
            finishMutation { state -> state.copy(events = state.events.filterNot { it.seriesId == seriesId }) }
        }.onFailure(::recoverMutation)
    }

    fun updateEventSeries(seriesId: String, title: String, reminders: List<Int>?, tagIds: List<String>) = viewModelScope.launch {
        _state.update { it.copy(loading = true, message = null) }
        repository.updateEventSeries(
            seriesId,
            EventSeriesPatchRequest(title = title, reminders = reminders, tagIds = tagIds),
            UUID.randomUUID().toString(),
        ).onSuccess {
            _state.value.events.filter { it.seriesId == seriesId }.forEach { reminderScheduler.cancelEvent(it.id) }
            loadMonth()
        }.onFailure { error ->
            _state.update { it.copy(loading = false, message = error.message ?: "Unable to update event series") }
        }
    }

    fun updateDeadline(deadline: Deadline, form: DeadlineEditForm) = viewModelScope.launch {
        val dueValue = CalendarTime.deadlineValue(form.date, form.allDay, form.dueTime)
        if (dueValue == null) {
            _state.update { it.copy(message = "Check the deadline date and time") }
            return@launch
        }
        val optimistic = deadline.copy(
            title = form.title,
            description = form.description,
            dueTime = dueValue,
            allDay = form.allDay,
            category = form.category,
            priority = form.priority,
            tags = stateTags(form.tagIds),
        )
        _state.update { state -> state.copy(deadlines = (state.deadlines.filterNot { it.id == deadline.id } + optimistic).sortedBy { it.dueTime }, message = null) }
        repository.updateDeadline(
            deadline.id,
            UpdateDeadlineRequest(
                title = form.title,
                description = form.description,
                dueTime = dueValue,
                allDay = form.allDay,
                category = form.category,
                priority = form.priority,
                tagIds = form.tagIds,
            ),
        ).onSuccess { updated ->
            reminderScheduler.cancelDeadline(deadline.id)
            finishMutation { state -> state.copy(deadlines = (state.deadlines.filterNot { it.id == updated.id } + updated).sortedBy { it.dueTime }) }
        }.onFailure(::recoverMutation)
    }

    fun deleteDeadline(id: String) = viewModelScope.launch {
        _state.update { state -> state.copy(deadlines = state.deadlines.filterNot { it.id == id }, message = null) }
        repository.deleteDeadline(id).onSuccess {
            reminderScheduler.cancelDeadline(id)
            finishMutation { state -> state.copy(deadlines = state.deadlines.filterNot { it.id == id }) }
        }.onFailure(::recoverMutation)
    }

    fun completeDeadline(id: String) = viewModelScope.launch {
        _state.update { state ->
            state.copy(deadlines = state.deadlines.map { if (it.id == id) it.copy(status = "completed", completedAt = it.completedAt ?: "pending") else it }, message = null)
        }
        repository.completeDeadline(id).onSuccess { completed ->
            reminderScheduler.cancelDeadline(id)
            finishMutation { state -> state.copy(deadlines = (state.deadlines.filterNot { it.id == completed.id } + completed).sortedBy { it.dueTime }) }
        }.onFailure(::recoverMutation)
    }

    fun reopenDeadline(id: String) = viewModelScope.launch {
        _state.update { state ->
            state.copy(deadlines = state.deadlines.map { if (it.id == id) it.copy(status = null, completedAt = null) else it }, message = null)
        }
        repository.reopenDeadline(id).onSuccess { reopened ->
            finishMutation { state -> state.copy(deadlines = (state.deadlines.filterNot { it.id == reopened.id } + reopened).sortedBy { it.dueTime }) }
        }.onFailure(::recoverMutation)
    }

    fun eventsFor(date: LocalDate): List<CalendarEvent> = state.value.events.filter { it.dateKey() == date }
    fun deadlinesFor(date: LocalDate): List<Deadline> = state.value.deadlines.filter { it.dateKey() == date }

    private fun stateTags(ids: List<String>): List<Tag> = _state.value.tags.filter { it.id in ids }
}

private fun loginFailureMessage(error: Throwable): String = when {
    error.message?.contains("401") == true -> "Invalid password."
    else -> "Unable to sign in. Check your connection and try again."
}
