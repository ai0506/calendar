package com.ai0506.calendar.notifications

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.pm.PackageManager
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.ai0506.calendar.data.CalendarEvent
import com.ai0506.calendar.data.CalendarCache
import com.ai0506.calendar.data.Deadline
import com.ai0506.calendar.data.MonthData
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime

private const val CHANNEL_ID = "calendar_reminders"
private const val ACTION_REMINDER = "com.ai0506.calendar.REMINDER"
private const val EXTRA_TITLE = "title"
private const val EXTRA_BODY = "body"

class ReminderScheduler(private val context: Context) {
    private val alarmManager = context.getSystemService(AlarmManager::class.java)

    fun schedule(events: List<CalendarEvent>, deadlines: List<Deadline>) {
        createChannel()
        events.forEach { event ->
            if (event.reminders != null && event.reminders.isNotEmpty()) {
                if (event.allDay) scheduleAllDay(event) else scheduleTimed(event)
            }
        }
        deadlines.filter { it.completedAt == null }.forEach { deadline ->
            if (deadline.allDay) scheduleAllDay(deadline) else scheduleTimed(deadline)
        }
    }

    /**
     * A web edit can remove an item, disable an Event reminder, or complete a
     * Deadline while this app is not open. Cancel the previous month snapshot
     * first, then rebuild from the server's current answer so stale local
     * alarms cannot survive a cross-device change.
     */
    fun replaceMonth(previous: MonthData?, current: MonthData) {
        previous?.events?.forEach { cancelEvent(it.id) }
        previous?.deadlines?.forEach { cancelDeadline(it.id) }
        schedule(current.events, current.deadlines)
    }

    fun cancelEvent(eventId: String) = cancel("event", eventId, EVENT_KEYS)

    fun cancelDeadline(deadlineId: String) = cancel("deadline", deadlineId, DEADLINE_KEYS)

    private fun cancel(type: String, id: String, keys: List<String>) {
        keys.forEach { key ->
            alarmManager.cancel(pendingIntent(type, id, key, "", ""))
        }
    }

    private fun scheduleTimed(event: CalendarEvent) {
        val start = runCatching { OffsetDateTime.parse(event.startTime).toInstant().toEpochMilli() }.getOrNull() ?: return
        // Older list API responses did not contain this field. In that case we do
        // not guess: a disabled reminder must never become a local notification.
        (event.reminders ?: return).distinct().forEach { minutes ->
            val trigger = start - minutes * 60_000L
            if (trigger <= System.currentTimeMillis()) return@forEach
            scheduleAt(
                trigger,
                pendingIntent("event", event.id, minutes.toString(), event.title, "Starts in $minutes minutes"),
            )
        }
    }

    private fun scheduleAllDay(event: CalendarEvent) {
        val trigger = runCatching {
            ZonedDateTime.of(LocalDate.parse(event.startTime.take(10)).atTime(9, 0), ZoneId.of("Asia/Shanghai"))
                .toInstant().toEpochMilli()
        }.getOrNull() ?: return
        if (trigger > System.currentTimeMillis()) {
            scheduleAt(trigger, pendingIntent("event", event.id, "all-day", event.title, "All-day event today"))
        }
    }

    private fun scheduleTimed(deadline: Deadline) {
        val due = runCatching { OffsetDateTime.parse(deadline.dueTime).toInstant().toEpochMilli() }.getOrNull() ?: return
        deadlineOffsets(deadline.priority).forEach { minutes ->
            val trigger = due - minutes * 60_000L
            if (trigger > System.currentTimeMillis()) {
                scheduleAt(
                    trigger,
                    pendingIntent("deadline", deadline.id, minutes.toString(), deadline.title, dueMessage(minutes)),
                )
            }
        }
        if (due > System.currentTimeMillis()) {
            scheduleAt(due, pendingIntent("deadline", deadline.id, "due", deadline.title, "Due now"))
        }
    }

    private fun scheduleAllDay(deadline: Deadline) {
        val dueDate = runCatching { LocalDate.parse(deadline.dueTime.take(10)) }.getOrNull() ?: return
        deadlineDayOffsets(deadline.priority).forEach { days ->
            val trigger = ZonedDateTime.of(dueDate.minusDays(days.toLong()).atTime(9, 0), ZoneId.of("Asia/Shanghai"))
                .toInstant().toEpochMilli()
            if (trigger > System.currentTimeMillis()) {
                val body = if (days == 0L) "Due today" else dueMessage((days * 24 * 60).toInt())
                scheduleAt(trigger, pendingIntent("deadline", deadline.id, "day-$days", deadline.title, body))
            }
        }
    }

    private fun scheduleAt(triggerAtMillis: Long, pendingIntent: PendingIntent) {
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
    }

    private fun pendingIntent(type: String, id: String, key: String, title: String, body: String): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java)
            .setAction(ACTION_REMINDER)
            .putExtra(EXTRA_TITLE, title)
            .putExtra(EXTRA_BODY, body)
        return PendingIntent.getBroadcast(
            context,
            "$type:$id:$key".hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun deadlineOffsets(priority: String): List<Int> = when (priority) {
        "high" -> listOf(72 * 60, 24 * 60, 2 * 60)
        "low" -> listOf(24 * 60)
        else -> listOf(48 * 60, 2 * 60)
    }

    private fun deadlineDayOffsets(priority: String): List<Long> = when (priority) {
        "high" -> listOf(3, 1, 0)
        "low" -> listOf(1)
        else -> listOf(2, 0)
    }

    private fun dueMessage(minutes: Int): String = when {
        minutes % (24 * 60) == 0 -> "Due in ${minutes / (24 * 60)} day(s)"
        minutes % 60 == 0 -> "Due in ${minutes / 60} hours"
        else -> "Due in $minutes minutes"
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(CHANNEL_ID, "Calendar reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Event reminders from AI0506 Calendar"
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}

/** AlarmManager clears alarms on reboot, so rebuild them from the private calendar cache. */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val cached = CalendarCache(context).allCached()
        ReminderScheduler(context).schedule(cached.events, cached.deadlines)
    }
}

private val EVENT_KEYS = listOf("all-day", "10", "15", "30", "60", "120", "1440")
private val DEADLINE_KEYS = listOf("4320", "2880", "1440", "120", "due", "day-3", "day-2", "day-1", "day-0")

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(intent.getStringExtra(EXTRA_TITLE) ?: "Calendar reminder")
            .setContentText(intent.getStringExtra(EXTRA_BODY) ?: "You have an upcoming calendar item")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }
}
