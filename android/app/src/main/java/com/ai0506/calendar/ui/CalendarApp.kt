package com.ai0506.calendar.ui

import android.Manifest
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.VerticalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.ai0506.calendar.CalendarUiState
import com.ai0506.calendar.CalendarTime
import com.ai0506.calendar.CalendarViewModel
import com.ai0506.calendar.CalendarViewMode
import com.ai0506.calendar.DeadlineEditForm
import com.ai0506.calendar.EventEditForm
import com.ai0506.calendar.data.CalendarEvent
import com.ai0506.calendar.data.CalendarNotification
import com.ai0506.calendar.data.Category
import com.ai0506.calendar.data.Deadline
import com.ai0506.calendar.data.Tag
import com.ai0506.calendar.data.dateKey
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private data class DayMark(val title: String, val color: Color, val isDeadline: Boolean = false, val completed: Boolean = false)

/**
 * Native equivalent of the web event modal: a calm, centred sheet with a
 * scrolling content area and an action area that never moves with the form.
 */
@Composable
private fun CalendarModal(
    onDismissRequest: () -> Unit,
    title: @Composable () -> Unit,
    text: @Composable () -> Unit,
    confirmButton: @Composable () -> Unit,
    dismissButton: @Composable () -> Unit,
    showHeader: Boolean = true,
    maxDialogWidth: androidx.compose.ui.unit.Dp = 440.dp,
    separateActions: Boolean = false,
) {
    val configuration = LocalConfiguration.current
    val portrait = configuration.screenWidthDp.toFloat() / configuration.screenHeightDp.coerceAtLeast(1) < 1.35f
    Dialog(onDismissRequest = onDismissRequest, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BoxWithConstraints(
            // Dialog windows on some gesture-navigation devices report a zero
            // navigation-bar inset. Keep the web-style fixed footer one system
            // gesture area above the physical bottom in that case.
            Modifier.fillMaxSize().padding(bottom = if (portrait) 24.dp else 0.dp),
            contentAlignment = if (portrait) Alignment.BottomCenter else Alignment.Center,
        ) {
            val dialogMaxHeight = (maxHeight - 24.dp).coerceAtLeast(260.dp).coerceAtMost(650.dp)
            val fixedChromeHeight = if (showHeader) 116.dp else 59.dp
            val contentMaxHeight = (dialogMaxHeight - fixedChromeHeight).coerceAtLeast(160.dp).coerceAtMost(520.dp)
            Card(
                modifier = (if (portrait) Modifier.fillMaxWidth() else Modifier.widthIn(max = maxDialogWidth).fillMaxWidth()).heightIn(max = dialogMaxHeight),
                shape = if (portrait) RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp) else RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 12.dp),
            ) {
                Column(Modifier.fillMaxWidth()) {
                    if (portrait) Box(Modifier.fillMaxWidth().padding(top = 10.dp), contentAlignment = Alignment.Center) {
                        Box(Modifier.size(width = 38.dp, height = 5.dp).background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f), RoundedCornerShape(3.dp)))
                    }
                    if (showHeader) {
                        Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp)) {
                            title()
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    }
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(max = contentMaxHeight)
                            .padding(horizontal = 20.dp, vertical = 14.dp),
                    ) { text() }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.End,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        dismissButton()
                        Spacer(if (separateActions) Modifier.weight(1f) else Modifier.width(10.dp))
                        confirmButton()
                    }
                }
            }
        }
    }
}

/** Matches the web form field: label above a soft, rounded input surface. */
@Composable
private fun CalendarTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = false,
    minLines: Int = 1,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    placeholder: String? = null,
) {
    Column(modifier) {
        Text(
            label.uppercase(Locale.ENGLISH),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(6.dp))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = singleLine,
            minLines = if (singleLine) 1 else minLines,
            maxLines = if (singleLine) 1 else Int.MAX_VALUE,
            visualTransformation = visualTransformation,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = if (minLines > 1) 70.dp else 43.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(10.dp))
                .padding(horizontal = 11.dp, vertical = 9.dp),
            decorationBox = { innerTextField ->
                Box {
                    if (value.isEmpty() && placeholder != null) {
                        Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    innerTextField()
                }
            },
        )
    }
}

@Composable
private fun ModalActionButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    kind: ModalButtonKind = ModalButtonKind.SECONDARY,
) {
    val background = when (kind) {
        ModalButtonKind.PRIMARY -> MaterialTheme.colorScheme.primary
        ModalButtonKind.DESTRUCTIVE -> MaterialTheme.colorScheme.error
        ModalButtonKind.SECONDARY -> MaterialTheme.colorScheme.surfaceVariant
    }
    val content = if (kind == ModalButtonKind.SECONDARY) MaterialTheme.colorScheme.onSurface else Color.White
    val border = if (kind == ModalButtonKind.SECONDARY) Color.Transparent else background
    TextButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .height(36.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(background)
            .border(1.dp, border, RoundedCornerShape(20.dp)),
        contentPadding = PaddingValues(horizontal = 16.dp),
        colors = ButtonDefaults.textButtonColors(
            contentColor = content,
            disabledContentColor = content.copy(alpha = 0.55f),
        ),
    ) { Text(label, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge) }
}

private enum class ModalButtonKind { PRIMARY, SECONDARY, DESTRUCTIVE }

@Composable
private fun CalendarChoiceChip(label: String, selected: Boolean, onClick: () -> Unit, enabled: Boolean = true) {
    Box(
        modifier = Modifier.height(32.dp).clip(RoundedCornerShape(16.dp))
            .background(if (selected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 11.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun CalendarToggle(checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Box(
        modifier = Modifier.size(width = 38.dp, height = 22.dp).clip(RoundedCornerShape(12.dp))
            .background(if (checked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline)
            .clickable { onCheckedChange(!checked) }
            .padding(2.dp),
    ) {
        Box(
            Modifier.size(18.dp).align(if (checked) Alignment.CenterEnd else Alignment.CenterStart)
                .clip(CircleShape).background(Color.White),
        )
    }
}

@Composable
fun CalendarApp(state: CalendarUiState, viewModel: CalendarViewModel) {
    when {
        state.checkingSession -> SplashScreen()
        !state.authenticated -> LoginScreen(loading = state.loading, error = state.message, onLogin = viewModel::login)
        else -> CalendarScreen(state = state, viewModel = viewModel)
    }
}

@Composable
private fun SplashScreen() = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
    Text("AI0506 Calendar", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun LoginScreen(loading: Boolean, error: String?, onLogin: (String) -> Unit) {
    var password by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Card(modifier = Modifier.widthIn(max = 440.dp).fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.padding(28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("AI0506 Calendar", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
                Text("你的私人日历", color = MaterialTheme.colorScheme.onSurfaceVariant)
                CalendarTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = "Password",
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (error != null) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                ModalActionButton(
                    label = if (loading) "Signing in…" else "Sign In",
                    onClick = { onLogin(password) },
                    enabled = password.isNotBlank() && !loading,
                    modifier = Modifier.fillMaxWidth(),
                    kind = ModalButtonKind.PRIMARY,
                )
            }
        }
    }
}

@Composable
private fun CalendarScreen(state: CalendarUiState, viewModel: CalendarViewModel) {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    // Follow the web layout rule: aspect ratio, rather than device type, decides
    // whether this is the stacked phone layout or the split inspector layout.
    val portraitLayout = configuration.screenWidthDp.toFloat() / configuration.screenHeightDp.coerceAtLeast(1) < 1.35f
    // A portrait phone needs a slim header, but it still has enough height for
    // normal-sized calendar dates and dots. Only genuinely short windows use the
    // dense content treatment.
    val compactHeight = configuration.screenHeightDp < 700
    val compactChrome = portraitLayout
    LaunchedEffect(portraitLayout) {
        // The web phone layout is intentionally month-only. Returning to a
        // narrow window must not leave a tablet Week/Day selection trapped
        // behind controls that the phone header does not expose.
        if (portraitLayout && state.viewMode != CalendarViewMode.MONTH) {
            viewModel.setViewMode(CalendarViewMode.MONTH)
        }
    }
    var showCreateDialog by remember { mutableStateOf(false) }
    var showNotifications by remember { mutableStateOf(false) }
    var selectedEvent by remember { mutableStateOf<CalendarEvent?>(null) }
    var selectedDeadline by remember { mutableStateOf<Deadline?>(null) }
    var canNotify by remember {
        mutableStateOf(Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
    }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> canNotify = granted }
    Scaffold(containerColor = MaterialTheme.colorScheme.background) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            CalendarTopBar(
                month = state.month,
                selectedDate = state.selectedDate,
                onPrevious = viewModel::previousPeriod,
                onNext = viewModel::nextPeriod,
                onToday = viewModel::today,
                onLogout = viewModel::logout,
                unreadNotifications = state.unreadNotifications,
                onNotifications = {
                    if (!canNotify && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    } else {
                        showNotifications = true
                    }
                },
                viewMode = state.viewMode,
                onViewMode = viewModel::setViewMode,
                onNewItem = { showCreateDialog = true },
                compact = compactChrome,
            )
            Column(
                Modifier.fillMaxSize().padding(
                    horizontal = if (portraitLayout) 0.dp else 24.dp,
                    vertical = if (portraitLayout) 0.dp else 14.dp,
                ),
            ) {
            if (state.message != null) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                ) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(state.message, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer)
                        TextButton(onClick = viewModel::clearMessage) { Text("Close") }
                    }
                }
            }
            // Categories remain available when editing an item and through their
            // colors in the calendar. They are deliberately not a permanent
            // top-level control: the web reference keeps that area quiet.
            Spacer(Modifier.height(if (portraitLayout) 0.dp else 6.dp))
            val visibleState = state.withCategoryFilter()
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val wide = !portraitLayout && maxWidth >= 720.dp
                if (wide) {
                    Row(Modifier.fillMaxSize()) {
                        CalendarPanel(
                            visibleState,
                            viewModel,
                            Modifier.weight(1f).fillMaxHeight().padding(end = 18.dp),
                            onEventClick = { selectedEvent = it },
                            onDeadlineClick = { selectedDeadline = it },
                            compact = compactHeight,
                            showViewToggle = false,
                            detailedMonth = true,
                        )
                        VerticalDivider(Modifier.fillMaxHeight(), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.8f))
                        DayInspector(
                            state = visibleState,
                            modifier = Modifier.width(328.dp).fillMaxHeight().padding(horizontal = 22.dp, vertical = 6.dp),
                            onEventClick = { selectedEvent = it },
                            onDeadlineClick = { selectedDeadline = it },
                            portrait = false,
                            categoryFilter = state.categoryFilter,
                            onShowAllCategories = viewModel::showAllCategories,
                            onToggleCategory = viewModel::toggleCategory,
                            tagFilter = state.tagFilter,
                            onToggleTag = viewModel::toggleTag,
                        )
                    }
                } else {
                    Column(Modifier.fillMaxSize()) {
                        CalendarPanel(
                            visibleState,
                            viewModel,
                            Modifier.fillMaxWidth().weight(if (portraitLayout) 0.72f else 1f).padding(horizontal = 12.dp, vertical = 8.dp),
                            onEventClick = { selectedEvent = it },
                            onDeadlineClick = { selectedDeadline = it },
                            compact = compactHeight,
                            showViewToggle = false,
                            detailedMonth = false,
                        )
                        DayInspector(
                            state = visibleState,
                            modifier = Modifier.fillMaxWidth().weight(if (portraitLayout) 1.28f else 0.85f)
                                .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                                .background(MaterialTheme.colorScheme.surface)
                                .padding(top = 16.dp),
                            onEventClick = { selectedEvent = it },
                            onDeadlineClick = { selectedDeadline = it },
                            portrait = true,
                            categoryFilter = state.categoryFilter,
                            onShowAllCategories = viewModel::showAllCategories,
                            onToggleCategory = viewModel::toggleCategory,
                            tagFilter = state.tagFilter,
                            onToggleTag = viewModel::toggleTag,
                        )
                    }
                }
            }
            }
        }
    }
    if (showCreateDialog) {
        CreateItemDialog(
            date = state.selectedDate,
            categories = state.categories,
            tags = state.tags,
            tagSuggestions = state.tagSuggestions,
            onDismiss = { showCreateDialog = false },
            onCreateEvent = { title, itemDate, allDay, category, reminders, startTime, endTime, frequency, count, tagIds ->
                showCreateDialog = false
                viewModel.createEvent(title, itemDate, allDay, category, reminders, startTime, endTime, frequency, count, tagIds)
            },
            onCreateDeadline = { title, itemDate, allDay, category, priority, dueTime, tagIds ->
                showCreateDialog = false
                viewModel.createDeadline(title, itemDate, allDay, category, priority, dueTime, tagIds)
            },
        )
    }
    if (showNotifications) {
        NotificationDialog(
            items = state.notifications,
            onDismiss = { showNotifications = false },
            onItemClick = { notification ->
                showNotifications = false
                viewModel.openNotification(notification)
            },
            onMarkAllRead = viewModel::markAllNotificationsRead,
        )
    }
    selectedEvent?.let { event ->
        EventDetailDialog(
            event = event,
            categories = state.categories,
            tags = state.tags,
            tagSuggestions = state.tagSuggestions,
            onDismiss = { selectedEvent = null },
            onSave = { form -> selectedEvent = null; viewModel.updateEvent(event, form) },
            onDelete = { selectedEvent = null; viewModel.deleteEvent(event.id) },
            onSkipOccurrence = event.seriesId?.let { seriesId -> { selectedEvent = null; viewModel.skipSeriesOccurrence(seriesId, event.originalStartTime ?: event.startTime) } },
            onEditSeries = event.seriesId?.let { seriesId -> { title, reminders, tagIds -> selectedEvent = null; viewModel.updateEventSeries(seriesId, title, reminders, tagIds) } },
            onDeleteSeries = event.seriesId?.let { seriesId -> { selectedEvent = null; viewModel.deleteEventSeries(seriesId) } },
        )
    }
    selectedDeadline?.let { deadline ->
        DeadlineDetailDialog(
            deadline = deadline,
            categories = state.categories,
            tags = state.tags,
            tagSuggestions = state.tagSuggestions,
            onDismiss = { selectedDeadline = null },
            onSave = { form -> selectedDeadline = null; viewModel.updateDeadline(deadline, form) },
            onDelete = { selectedDeadline = null; viewModel.deleteDeadline(deadline.id) },
            onComplete = { selectedDeadline = null; viewModel.completeDeadline(deadline.id) },
            onReopen = { selectedDeadline = null; viewModel.reopenDeadline(deadline.id) },
        )
    }
}

@Composable
private fun CategoryStrip(
    categories: List<Category>,
    selected: Set<String>,
    onShowAll: () -> Unit,
    onToggle: (String) -> Unit,
    compact: Boolean,
) {
    val stripHeight = if (compact) 38.dp else 48.dp
    Box(Modifier.fillMaxWidth().height(stripHeight)) {
        if (categories.isEmpty()) {
            // Project categories are seeded. Reserve the finished strip from the
            // first frame so loading never pushes the calendar downward.
            Row(
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                listOf(42.dp, 64.dp, 48.dp, 92.dp).forEach { width ->
                    Box(
                        Modifier.width(width).height(if (compact) 26.dp else 30.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f)),
                    )
                }
            }
        } else {
            LazyRow(
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                item {
                    FilterChip(selected = selected.isEmpty(), onClick = onShowAll, label = { Text("All") }, modifier = Modifier.height(if (compact) 30.dp else 34.dp))
                }
                items(categories, key = { it.id }) { category ->
                    FilterChip(
                        selected = category.name in selected,
                        onClick = { onToggle(category.name) },
                        label = {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                Box(Modifier.size(6.dp).background(parseColor(category.color), CircleShape))
                                Text(category.name, maxLines = 1)
                            }
                        },
                        modifier = Modifier.height(if (compact) 30.dp else 34.dp),
                    )
                }
            }
        }
    }
}

private fun CalendarUiState.withCategoryFilter(): CalendarUiState {
    if (categoryFilter.isEmpty() && tagFilter.isEmpty()) return this
    return copy(
        events = events.filter { event ->
            (categoryFilter.isEmpty() || event.category in categoryFilter) &&
                (tagFilter.isEmpty() || event.tags.any { it.id in tagFilter })
        },
        deadlines = deadlines.filter { deadline ->
            (categoryFilter.isEmpty() || deadline.category in categoryFilter) &&
                (tagFilter.isEmpty() || deadline.tags.any { it.id in tagFilter })
        },
    )
}

@Composable
private fun CalendarTopBar(
    month: YearMonth,
    selectedDate: LocalDate,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
    onLogout: () -> Unit,
    unreadNotifications: Int,
    onNotifications: () -> Unit,
    viewMode: CalendarViewMode,
    onViewMode: (CalendarViewMode) -> Unit,
    onNewItem: () -> Unit,
    compact: Boolean,
) {
    val navigationTitle = calendarNavigationTitle(month, selectedDate, viewMode)
    Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface.copy(alpha = 0.82f))) {
        if (compact) {
            Row(
                Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                TopNavArrow("‹", onPrevious)
                Text(
                    navigationTitle,
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                )
                TopNavArrow("›", onNext)
                TopTodayButton(onToday, compact = true)
                NotificationButton(unreadNotifications, onNotifications)
                AddButton(compact = true, onClick = onNewItem)
            }
        } else {
            Row(
                Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 22.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    Modifier.width(150.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                ) {
                    Box(Modifier.size(16.dp).background(MaterialTheme.colorScheme.secondaryContainer, CircleShape), contentAlignment = Alignment.Center) {
                        Box(Modifier.size(8.dp).background(MaterialTheme.colorScheme.primary, CircleShape))
                    }
                    Text("AI0506 Calendar", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
                Row(
                    Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    TopNavArrow("‹", onPrevious)
                    Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                        Text(
                            navigationTitle,
                            fontWeight = FontWeight.SemiBold,
                            style = MaterialTheme.typography.titleMedium,
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                        )
                    }
                    TopNavArrow("›", onNext)
                    TopTodayButton(onToday, compact = false)
                }
                Spacer(Modifier.width(12.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ViewModeToggle(viewMode, onViewMode)
                    NotificationButton(unreadNotifications, onNotifications)
                    AddButton(compact = false, onClick = onNewItem)
                }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
    }
}

private fun calendarNavigationTitle(month: YearMonth, selectedDate: LocalDate, viewMode: CalendarViewMode): String = when (viewMode) {
    CalendarViewMode.MONTH -> month.format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH))
    CalendarViewMode.DAY -> selectedDate.format(DateTimeFormatter.ofPattern("EEEE, MMMM d, yyyy", Locale.ENGLISH))
    CalendarViewMode.WEEK -> {
        val start = selectedDate.minusDays((selectedDate.dayOfWeek.value % 7).toLong())
        val end = start.plusDays(6)
        when {
            start.year != end.year -> "${start.format(DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH))} - ${end.format(DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH))}"
            start.month != end.month -> "${start.format(DateTimeFormatter.ofPattern("MMM d", Locale.ENGLISH))} - ${end.format(DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH))}"
            else -> "${start.format(DateTimeFormatter.ofPattern("MMM d", Locale.ENGLISH))} - ${end.format(DateTimeFormatter.ofPattern("d, yyyy", Locale.ENGLISH))}"
        }
    }
}

@Composable
private fun TopNavArrow(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(30.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.bodyLarge) }
}

@Composable
private fun TopTodayButton(onClick: () -> Unit, compact: Boolean) {
    Box(
        modifier = Modifier
            .height(30.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick)
            .padding(horizontal = if (compact) 12.dp else 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text("Today", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium) }
}

@Composable
private fun NotificationButton(unread: Int, onClick: () -> Unit) {
    TextButton(onClick = onClick, modifier = Modifier.size(36.dp), contentPadding = PaddingValues(0.dp)) {
        Text(if (unread > 0) "🔔" else "🔔", style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun AddButton(compact: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .height(36.dp)
            .width(if (compact) 36.dp else 78.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.primary)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(if (compact) "+" else "+  New", color = Color.White, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun NotificationDialog(
    items: List<CalendarNotification>,
    onDismiss: () -> Unit,
    onItemClick: (CalendarNotification) -> Unit,
    onMarkAllRead: () -> Unit,
) {
    CalendarModal(
        onDismissRequest = onDismiss,
        title = { Text("Notifications") },
        text = {
            if (items.isEmpty()) {
                Text("No notifications", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                LazyColumn(Modifier.heightIn(max = 360.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(items, key = { it.id }) { item ->
                        Card(
                            modifier = Modifier.fillMaxWidth().clickable { onItemClick(item) },
                            colors = CardDefaults.cardColors(containerColor = if (item.readAt == null) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Column(Modifier.padding(10.dp)) {
                                Text(item.title, fontWeight = if (item.readAt == null) FontWeight.SemiBold else FontWeight.Normal)
                                Text(item.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { ModalActionButton("Mark all read", onMarkAllRead, kind = ModalButtonKind.PRIMARY) },
        dismissButton = { ModalActionButton("Close", onDismiss) },
    )
}

@Composable
private fun CalendarPanel(
    state: CalendarUiState,
    viewModel: CalendarViewModel,
    modifier: Modifier = Modifier,
    onEventClick: (CalendarEvent) -> Unit,
    onDeadlineClick: (Deadline) -> Unit,
    compact: Boolean,
    showViewToggle: Boolean,
    detailedMonth: Boolean,
) {
    Column(modifier.fillMaxSize()) {
            if (showViewToggle) {
                ViewModeToggle(state.viewMode, viewModel::setViewMode)
                Spacer(Modifier.height(if (compact) 3.dp else 8.dp))
            }
            when (state.viewMode) {
                CalendarViewMode.MONTH -> MonthGrid(
                    month = state.month,
                    selectedDate = state.selectedDate,
                    events = state.events,
                    deadlines = state.deadlines,
                    categories = state.categories,
                    onSelect = viewModel::selectDate,
                    compact = compact,
                    detailed = detailedMonth,
                )
                CalendarViewMode.WEEK -> WeekView(
                    selectedDate = state.selectedDate,
                    events = state.events,
                    deadlines = state.deadlines,
                    categories = state.categories,
                    onSelect = viewModel::selectDate,
                    onEventClick = onEventClick,
                    onDeadlineClick = onDeadlineClick,
                )
                CalendarViewMode.DAY -> DayTimeline(
                    date = state.selectedDate,
                    events = state.events,
                    deadlines = state.deadlines,
                    categories = state.categories,
                    onEventClick = onEventClick,
                    onDeadlineClick = onDeadlineClick,
                )
            }
    }
}

@Composable
private fun ViewModeToggle(selected: CalendarViewMode, onSelect: (CalendarViewMode) -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        listOf(CalendarViewMode.MONTH to "Month", CalendarViewMode.WEEK to "Week", CalendarViewMode.DAY to "Day").forEach { (mode, label) ->
            TextButton(
                onClick = { onSelect(mode) },
                modifier = Modifier.height(30.dp).clip(RoundedCornerShape(7.dp)).background(if (selected == mode) MaterialTheme.colorScheme.surface else Color.Transparent),
                contentPadding = PaddingValues(horizontal = 11.dp),
            ) { Text(label, style = MaterialTheme.typography.labelMedium, color = if (selected == mode) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
private fun WeekView(
    selectedDate: LocalDate,
    events: List<CalendarEvent>,
    deadlines: List<Deadline>,
    categories: List<Category>,
    onSelect: (LocalDate) -> Unit,
    onEventClick: (CalendarEvent) -> Unit,
    onDeadlineClick: (Deadline) -> Unit,
) {
    val sundayOffset = selectedDate.dayOfWeek.value % 7
    val firstDay = selectedDate.minusDays(sundayOffset.toLong())
    val days = (0..6).map { firstDay.plusDays(it.toLong()) }
    TimelineView(
        days = days,
        selectedDate = selectedDate,
        events = events,
        deadlines = deadlines,
        categories = categories,
        onSelect = onSelect,
        onEventClick = onEventClick,
        onDeadlineClick = onDeadlineClick,
        dayWidth = 88.dp,
    )
}

@Composable
private fun TimelineView(
    days: List<LocalDate>,
    selectedDate: LocalDate,
    events: List<CalendarEvent>,
    deadlines: List<Deadline>,
    categories: List<Category>,
    onSelect: (LocalDate) -> Unit,
    onEventClick: (CalendarEvent) -> Unit,
    onDeadlineClick: (Deadline) -> Unit,
    dayWidth: androidx.compose.ui.unit.Dp,
) {
    val horizontal = rememberScrollState()
    val vertical = rememberScrollState()
    val categoryColors = categories.associate { it.name to parseColor(it.color) }
    val gutterWidth = 52.dp
    val gridWidth = gutterWidth + dayWidth * days.size
    val anyAllDay = days.any { date ->
        events.any { it.allDay && it.dateKey() == date } || deadlines.any { it.allDay && it.dateKey() == date }
    }

    Column(Modifier.fillMaxSize().horizontalScroll(horizontal)) {
        Row(Modifier.width(gridWidth).height(58.dp).border(0.5.dp, Color(0xFFD2D2D7))) {
            Spacer(Modifier.width(gutterWidth))
            days.forEach { date ->
                val today = date == LocalDate.now()
                Column(
                    modifier = Modifier.width(dayWidth).fillMaxHeight()
                        .border(0.5.dp, Color(0xFFD2D2D7))
                        .clickable { onSelect(date) }
                        .padding(top = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (today) Color(0xFF0071E3) else Color(0xFF86868B),
                        fontWeight = if (today) FontWeight.Bold else FontWeight.SemiBold,
                    )
                    Box(
                        Modifier.size(34.dp).clip(CircleShape).background(if (today) Color(0xFF0071E3) else Color.Transparent),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            date.dayOfMonth.toString(),
                            style = MaterialTheme.typography.titleMedium,
                            color = if (today) Color.White else if (date == selectedDate) Color(0xFF0071E3) else Color(0xFF1D1D1F),
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }
        }
        if (anyAllDay) {
            Row(Modifier.width(gridWidth).border(0.5.dp, Color(0xFFD2D2D7))) {
                Text(
                    "All-day",
                    modifier = Modifier.width(gutterWidth).padding(top = 8.dp, end = 7.dp),
                    textAlign = TextAlign.End,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF86868B),
                    fontWeight = FontWeight.SemiBold,
                )
                days.forEach { date ->
                    val allDayEvents = events.filter { it.allDay && it.dateKey() == date }
                    val allDayDeadlines = deadlines.filter { it.allDay && it.dateKey() == date }
                    Column(
                        Modifier.width(dayWidth).border(0.5.dp, Color(0xFFD2D2D7)).padding(horizontal = 4.dp, vertical = 5.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        allDayDeadlines.forEach { deadline ->
                            TimelineAllDayDeadline(deadline, deadlineDisplayColor(deadline, categoryColors), onClick = { onDeadlineClick(deadline) })
                        }
                        allDayEvents.forEach { event ->
                            TimelineAllDayEvent(event, eventDisplayColor(event, categoryColors), onClick = { onEventClick(event) })
                        }
                    }
                }
            }
        }
        Row(Modifier.width(gridWidth).weight(1f).verticalScroll(vertical)) {
            Column(Modifier.width(gutterWidth)) {
                (7..23).forEach { hour ->
                    Text(
                        hourLabel(hour),
                        modifier = Modifier.height(56.dp).fillMaxWidth().padding(top = 1.dp, end = 8.dp),
                        textAlign = TextAlign.End,
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF86868B),
                    )
                }
            }
            days.forEach { date ->
                TimelineDayColumn(
                    date = date,
                    width = dayWidth,
                    events = events.filter { !it.allDay && it.dateKey() == date },
                    deadlines = deadlines.filter { !it.allDay && it.dateKey() == date },
                    categoryColors = categoryColors,
                    onEventClick = onEventClick,
                    onDeadlineClick = onDeadlineClick,
                )
            }
        }
    }
}

@Composable
private fun TimelineAllDayEvent(event: CalendarEvent, color: Color, onClick: () -> Unit) {
    Text(
        event.title,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(5.dp)).background(color.copy(alpha = 0.16f))
            .clickable(onClick = onClick).padding(horizontal = 6.dp, vertical = 3.dp),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        style = MaterialTheme.typography.labelSmall,
        color = color,
        fontWeight = FontWeight.Medium,
    )
}

@Composable
private fun TimelineAllDayDeadline(deadline: Deadline, color: Color, onClick: () -> Unit) {
    val completed = deadline.completedAt != null || deadline.status == "completed"
    Text(
        "⚑ ${deadline.title}",
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(5.dp))
            .background(if (completed) Color(0xFFF1F1F3) else color.copy(alpha = 0.13f))
            .border(1.dp, if (completed) Color(0xFF8E8E93) else color, RoundedCornerShape(5.dp))
            .clickable(onClick = onClick).padding(horizontal = 6.dp, vertical = 3.dp),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        style = MaterialTheme.typography.labelSmall,
        color = if (completed) Color(0xFF86868B) else color,
        textDecoration = if (completed) TextDecoration.LineThrough else TextDecoration.None,
        fontWeight = FontWeight.Medium,
    )
}

private data class TimelineEventPosition(val event: CalendarEvent, val column: Int, val columns: Int)

private fun layoutTimelineEvents(events: List<CalendarEvent>): List<TimelineEventPosition> {
    if (events.isEmpty()) return emptyList()
    val result = mutableListOf<TimelineEventPosition>()
    var cluster = mutableListOf<CalendarEvent>()
    var clusterEnd = Int.MIN_VALUE
    fun placeCluster() {
        if (cluster.isEmpty()) return
        val columnEnds = mutableListOf<Int>()
        val columns = mutableListOf<Int>()
        cluster.forEach { event ->
            val start = timeToMinutes(event.startTime)
            val column = columnEnds.indexOfFirst { it <= start }.takeIf { it >= 0 } ?: columnEnds.size
            if (column == columnEnds.size) columnEnds += timeToMinutes(event.endTime) else columnEnds[column] = timeToMinutes(event.endTime)
            columns += column
        }
        cluster.forEachIndexed { index, event -> result += TimelineEventPosition(event, columns[index], columnEnds.size) }
        cluster = mutableListOf()
        clusterEnd = Int.MIN_VALUE
    }
    events.sortedBy { timeToMinutes(it.startTime) }.forEach { event ->
        val start = timeToMinutes(event.startTime)
        if (cluster.isNotEmpty() && start >= clusterEnd) placeCluster()
        cluster += event
        clusterEnd = maxOf(clusterEnd, timeToMinutes(event.endTime))
    }
    placeCluster()
    return result
}

@Composable
private fun TimelineDayColumn(
    date: LocalDate,
    width: androidx.compose.ui.unit.Dp,
    events: List<CalendarEvent>,
    deadlines: List<Deadline>,
    categoryColors: Map<String, Color>,
    onEventClick: (CalendarEvent) -> Unit,
    onDeadlineClick: (Deadline) -> Unit,
) {
    val totalHeight = 17 * 56
    Box(Modifier.width(width).height(totalHeight.dp).border(0.5.dp, Color(0xFFD2D2D7))) {
        Column(Modifier.fillMaxSize()) {
            repeat(17) { Box(Modifier.fillMaxWidth().height(56.dp).border(0.5.dp, Color(0xFFEEEEEE))) }
        }
        layoutTimelineEvents(events).forEach { positioned ->
            val start = (timeToMinutes(positioned.event.startTime) - 7 * 60).coerceIn(0, totalHeight - 1)
            val duration = (timeToMinutes(positioned.event.endTime) - timeToMinutes(positioned.event.startTime)).coerceAtLeast(26)
            val blockWidth = width / positioned.columns
            TimelineEventBlock(
                event = positioned.event,
                color = eventDisplayColor(positioned.event, categoryColors),
                modifier = Modifier.width(blockWidth).height(duration.coerceAtMost(totalHeight - start).dp)
                    .align(Alignment.TopStart).offset(x = blockWidth * positioned.column, y = start.dp),
                onClick = { onEventClick(positioned.event) },
            )
        }
        deadlines.forEachIndexed { index, deadline ->
            val minute = timeToMinutes(deadline.dueTime) - 7 * 60
            if (minute in 0..totalHeight) {
                TimelineDeadlineMarker(
                    deadline = deadline,
                    color = deadlineDisplayColor(deadline, categoryColors),
                    modifier = Modifier.fillMaxWidth().height(22.dp).align(Alignment.TopStart).offset(y = (minute - 10 + index * 2).dp),
                    onClick = { onDeadlineClick(deadline) },
                )
            }
        }
        val now = java.time.LocalTime.now().let { it.hour * 60 + it.minute } - 7 * 60
        if (date == LocalDate.now() && now in 0..totalHeight) {
            Box(Modifier.fillMaxWidth().height(2.dp).align(Alignment.TopStart).offset(y = now.dp).background(Color(0xFFFF3B30)))
        }
    }
}

@Composable
private fun TimelineEventBlock(event: CalendarEvent, color: Color, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(6.dp)).background(color.copy(alpha = 0.17f)).clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 4.dp),
    ) {
        Text(event.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall, color = color, fontWeight = FontWeight.SemiBold)
        Text(eventTimeRangeLabel(event), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall, color = color.copy(alpha = 0.75f))
    }
}

@Composable
private fun TimelineDeadlineMarker(deadline: Deadline, color: Color, modifier: Modifier, onClick: () -> Unit) {
    val completed = deadline.completedAt != null || deadline.status == "completed"
    Box(modifier.clickable(onClick = onClick)) {
        Box(Modifier.fillMaxWidth().height(1.dp).align(Alignment.CenterStart).background(if (completed) Color(0xFF8E8E93) else color))
        Text(
            "⚑ ${deadline.title}",
            modifier = Modifier.align(Alignment.TopStart).offset(x = 3.dp).clip(RoundedCornerShape(6.dp))
                .background(if (completed) Color(0xFFF1F1F3) else Color.White).border(0.5.dp, if (completed) Color(0xFF8E8E93) else color, RoundedCornerShape(6.dp))
                .padding(horizontal = 6.dp, vertical = 1.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.labelSmall,
            color = if (completed) Color(0xFF86868B) else color,
            textDecoration = if (completed) TextDecoration.LineThrough else TextDecoration.None,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun hourLabel(hour: Int): String = when (hour) {
    12 -> "12 PM"
    in 0..11 -> "$hour AM"
    else -> "${hour - 12} PM"
}

private fun timeToMinutes(value: String?): Int {
    val time = timePart(value, "00:00")
    val parts = time.split(':')
    return (parts.getOrNull(0)?.toIntOrNull() ?: 0) * 60 + (parts.getOrNull(1)?.toIntOrNull() ?: 0)
}

@Composable
private fun DayTimeline(
    date: LocalDate,
    events: List<CalendarEvent>,
    deadlines: List<Deadline>,
    categories: List<Category>,
    onEventClick: (CalendarEvent) -> Unit,
    onDeadlineClick: (Deadline) -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        TimelineView(
            days = listOf(date),
            selectedDate = date,
            events = events,
            deadlines = deadlines,
            categories = categories,
            onSelect = {},
            onEventClick = onEventClick,
            onDeadlineClick = onDeadlineClick,
            dayWidth = (maxWidth - 52.dp).coerceAtLeast(220.dp),
        )
    }
}

@Composable
private fun MonthGrid(
    month: YearMonth,
    selectedDate: LocalDate,
    events: List<CalendarEvent>,
    deadlines: List<Deadline>,
    categories: List<Category>,
    onSelect: (LocalDate) -> Unit,
    compact: Boolean,
    detailed: Boolean,
) {
    val categoryColors = categories.associate { it.name to parseColor(it.color) }
    val firstOffset = month.atDay(1).dayOfWeek.value % 7
    val firstGridDate = month.atDay(1).minusDays(firstOffset.toLong())
    val weekdayLabels = if (detailed) listOf("SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT") else listOf("S", "M", "T", "W", "T", "F", "S")
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth()) {
            weekdayLabels.forEach { label ->
                Text(
                    label,
                    Modifier.weight(1f),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = if (detailed) TextAlign.Start else TextAlign.Center,
                )
            }
        }
        Spacer(Modifier.height(if (compact) 1.dp else 8.dp))
        val gridShape = RoundedCornerShape(14.dp)
        Column(
            Modifier.fillMaxWidth().weight(1f)
                .then(if (detailed) Modifier.clip(gridShape).background(MaterialTheme.colorScheme.surface).border(0.5.dp, MaterialTheme.colorScheme.outline, gridShape) else Modifier),
        ) {
            repeat(6) { rowIndex ->
                Row(Modifier.fillMaxWidth().weight(1f)) {
                    repeat(7) { columnIndex ->
                        val date = firstGridDate.plusDays((rowIndex * 7 + columnIndex).toLong())
                        val inCurrentMonth = YearMonth.from(date) == month
                        val marks = if (inCurrentMonth) {
                            val dayEvents = events.filter { it.dateKey() == date }.sortedBy { it.startTime }
                            val dayDeadlines = deadlines.filter { it.dateKey() == date }.sortedBy { it.dueTime }
                            val eventMarks = dayEvents.map { event -> DayMark(event.title, eventDisplayColor(event, categoryColors)) }
                            val deadlineMarks = dayDeadlines.map { deadline -> DayMark(deadline.title, deadlineDisplayColor(deadline, categoryColors), isDeadline = true, completed = deadline.completedAt != null || deadline.status == "completed") }
                            if (detailed) deadlineMarks + eventMarks else eventMarks + deadlineMarks
                        } else emptyList<DayMark>()
                        DayCell(
                            date = date,
                            inCurrentMonth = inCurrentMonth,
                            selected = date == selectedDate,
                            isToday = date == LocalDate.now(),
                            marks = marks,
                            onClick = { onSelect(date) },
                            modifier = Modifier.weight(1f).fillMaxHeight(),
                            compact = compact,
                            detailed = detailed,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCell(date: LocalDate, inCurrentMonth: Boolean, selected: Boolean, isToday: Boolean, marks: List<DayMark>, onClick: () -> Unit, modifier: Modifier, compact: Boolean, detailed: Boolean) {
    val container = when {
        selected -> MaterialTheme.colorScheme.secondaryContainer
        else -> Color.Transparent
    }
    val cellModifier = if (detailed) {
        modifier
            .background(container)
            .border(if (selected) 1.5.dp else 0.5.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline)
            .clickable(onClick = onClick)
            .padding(7.dp)
    } else {
        modifier
            .padding(if (compact) 1.dp else 2.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(container)
            .border(if (selected) 1.5.dp else 0.dp, if (selected) MaterialTheme.colorScheme.primary else Color.Transparent, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(if (compact) 3.dp else 7.dp)
    }
    Box(
        modifier = cellModifier,
    ) {
        if (detailed) {
            Column(Modifier.fillMaxSize()) {
                CalendarDateNumber(date, isToday, inCurrentMonth, compact = false)
                Spacer(Modifier.height(3.dp))
                val visibleMarks = marks.take(if (compact) 1 else 3)
                visibleMarks.forEach { mark ->
                    Text(
                        text = if (mark.isDeadline) "⚑ ${mark.title}" else mark.title,
                        modifier = Modifier.fillMaxWidth().padding(bottom = 3.dp).clip(RoundedCornerShape(6.dp)).background(mark.color.copy(alpha = if (mark.completed) 0.08f else 0.16f)).padding(horizontal = 5.dp, vertical = 3.dp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (mark.completed) MaterialTheme.colorScheme.onSurfaceVariant else mark.color,
                        textDecoration = if (mark.completed) TextDecoration.LineThrough else TextDecoration.None,
                        fontWeight = FontWeight.Medium,
                    )
                }
                if (marks.size > visibleMarks.size) Text("+${marks.size - visibleMarks.size} more", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            CalendarDateNumber(date, isToday, inCurrentMonth, compact)
            Row(Modifier.align(Alignment.BottomStart), horizontalArrangement = Arrangement.spacedBy(if (compact) 2.dp else 3.dp)) {
                marks.take(4).forEach { mark -> Box(Modifier.size(if (compact) 4.dp else 6.dp).background(mark.color, CircleShape)) }
            }
            if (marks.size > 4 && !compact) Text("+${marks.size - 4}", modifier = Modifier.align(Alignment.BottomEnd), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun CalendarDateNumber(date: LocalDate, isToday: Boolean, inCurrentMonth: Boolean, compact: Boolean) {
    Box(
        modifier = Modifier
            .size(if (compact) 20.dp else 22.dp)
            .clip(CircleShape)
            .background(if (isToday) MaterialTheme.colorScheme.primary else Color.Transparent),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            date.dayOfMonth.toString(),
            fontWeight = if (isToday) FontWeight.SemiBold else FontWeight.Medium,
            style = MaterialTheme.typography.labelMedium,
            color = when {
                isToday -> Color.White
                inCurrentMonth -> MaterialTheme.colorScheme.onSurface
                else -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f)
            },
        )
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun DayInspector(
    state: CalendarUiState,
    modifier: Modifier = Modifier,
    onEventClick: (CalendarEvent) -> Unit,
    onDeadlineClick: (Deadline) -> Unit,
    portrait: Boolean,
    categoryFilter: Set<String>,
    onShowAllCategories: () -> Unit,
    onToggleCategory: (String) -> Unit,
    tagFilter: Set<String>,
    onToggleTag: (String) -> Unit,
) {
    val date = state.selectedDate
    val events = state.events.filter { it.dateKey() == date }
    val deadlines = state.deadlines.filter { it.dateKey() == date }
    val categoryColors = state.categories.associate { it.name to parseColor(it.color) }
    var timeline by remember(date) { mutableStateOf(false) }
    Column(modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = if (portrait) 18.dp else 0.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    if (portrait) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).uppercase(), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                            Text("•  ${events.size} ${if (events.size == 1) "EVENT" else "EVENTS"}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                        }
                        Text(date.format(DateTimeFormatter.ofPattern("MMMM d", Locale.ENGLISH)), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    } else {
                        Text(if (date == LocalDate.now()) "TODAY" else date.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.ENGLISH).uppercase(), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        Text(date.format(DateTimeFormatter.ofPattern("MMMM d", Locale.ENGLISH)), style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                        Text("${events.size} ${if (events.size == 1) "event" else "events"} on this day", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (portrait) Row(
                    Modifier.clip(RoundedCornerShape(9.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(2.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    InspectorTab("Preview", !timeline) { timeline = false }
                    InspectorTab("Timeline", timeline) { timeline = true }
                }
            }
            if (timeline && portrait) {
                Box(Modifier.padding(horizontal = 18.dp, vertical = 10.dp)) {
                    DayTimeline(date, state.events, state.deadlines, state.categories, onEventClick, onDeadlineClick)
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(horizontal = if (portrait) 18.dp else 0.dp, vertical = 12.dp),
                ) {
                    if (deadlines.isNotEmpty()) item { DeadlineRail(deadlines, categoryColors, onDeadlineClick) }
                    items(events, key = { it.id }) { event ->
                        EventRow(event, eventDisplayColor(event, categoryColors), onClick = { onEventClick(event) })
                    }
                    if (events.isEmpty() && deadlines.isEmpty()) item {
                        Box(Modifier.fillParentMaxHeight(0.55f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                            Text("No events for this day", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (!portrait && state.categories.isNotEmpty()) item {
                        CategoryList(state.categories, categoryFilter, onShowAllCategories, onToggleCategory)
                    }
                    if (!portrait && state.tags.isNotEmpty()) item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("TAGS", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                state.tags.forEach { tag ->
                                    CalendarChoiceChip(tag.name, selected = tag.id in tagFilter, onClick = { onToggleTag(tag.id) })
                                }
                            }
                        }
                    }
                }
            }
    }
}

@Composable
private fun InspectorTab(label: String, selected: Boolean, onClick: () -> Unit) {
    TextButton(
        onClick = onClick,
        modifier = Modifier.height(30.dp).clip(RoundedCornerShape(7.dp)).background(if (selected) MaterialTheme.colorScheme.surface else Color.Transparent),
        contentPadding = PaddingValues(horizontal = 9.dp),
    ) { Text(label, style = MaterialTheme.typography.labelMedium, color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant) }
}

@Composable
private fun InspectorLabel(text: String) = Text(text, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)

@Composable
private fun DeadlineRail(deadlines: List<Deadline>, categoryColors: Map<String, Color>, onClick: (Deadline) -> Unit) {
    val completed = deadlines.filter { it.completedAt != null || it.status == "completed" }
    val open = deadlines.filterNot { it in completed }
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("DUE SOON", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                Text("by priority", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
            }
            open.forEach { deadline ->
                DeadlineRow(deadline, deadlineDisplayColor(deadline, categoryColors), onClick = { onClick(deadline) })
            }
            if (completed.isNotEmpty()) {
                Text("▸  ${completed.size} completed", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun CategoryList(categories: List<Category>, selected: Set<String>, onShowAll: () -> Unit, onToggle: (String) -> Unit) {
    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            "CATEGORIES",
            modifier = Modifier.padding(bottom = 8.dp).clickable(onClick = onShowAll),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
        )
        categories.forEach { category ->
            val active = selected.isEmpty() || category.name in selected
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { onToggle(category.name) }.padding(horizontal = 6.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(11.dp),
            ) {
                Box(Modifier.size(10.dp).background(parseColor(category.color).copy(alpha = if (active) 1f else 0.38f), CircleShape))
                Text(category.name, color = MaterialTheme.colorScheme.onSurface.copy(alpha = if (active) 1f else 0.38f), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun EventRow(event: CalendarEvent, color: Color = eventDisplayColor(event, emptyMap()), onClick: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant, contentColor = MaterialTheme.colorScheme.onSurface), shape = RoundedCornerShape(14.dp), modifier = Modifier.clickable(onClick = onClick)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(3.dp).height(44.dp).clip(RoundedCornerShape(2.dp)).background(color))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(event.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                Text(eventTimeRangeLabel(event), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                event.category?.takeIf { it.isNotBlank() }?.let { category ->
                    Text(category, style = MaterialTheme.typography.labelSmall, color = color, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun DeadlineRow(deadline: Deadline, color: Color = deadlineDisplayColor(deadline, emptyMap()), onClick: () -> Unit) {
    val completed = deadline.completedAt != null || deadline.status == "completed"
    val accent = if (completed) Color(0xFF4C7A5A) else color
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(11.dp),
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(3.dp).height(48.dp).clip(RoundedCornerShape(2.dp)).background(accent))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    "⚑ ${deadline.title}",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (completed) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                    textDecoration = if (completed) TextDecoration.LineThrough else TextDecoration.None,
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        deadline.priority.uppercase(),
                        modifier = Modifier.clip(RoundedCornerShape(5.dp)).background(accent.copy(alpha = 0.14f)).padding(horizontal = 5.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = accent,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        when {
                            completed -> "Completed"
                            deadline.isOverdue -> "Overdue"
                            deadline.allDay -> "Due today"
                            else -> "Due ${timePart(deadline.dueTime, "18:00")}" 
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                deadline.category?.takeIf { it.isNotBlank() }?.let { category ->
                    Text(category, style = MaterialTheme.typography.labelSmall, color = accent, fontWeight = FontWeight.SemiBold)
                }
            }
            Text(if (completed) "Reopen" else "Complete", style = MaterialTheme.typography.labelSmall, color = accent, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun CategorySwatches(categories: List<Category>, selected: String?, onSelect: (String) -> Unit) {
    if (categories.isEmpty()) return
    Text("CATEGORY", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        items(categories, key = { it.id }) { item ->
            val active = item.name == selected
            Box(
                Modifier.size(32.dp)
                    .clip(CircleShape)
                    .background(parseColor(item.color))
                    .border(if (active) 3.dp else 1.dp, if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.surface, CircleShape)
                    .clickable { onSelect(item.name) },
            )
        }
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun TagPicker(
    tags: List<Tag>,
    suggestions: Map<String, List<String>>,
    categories: List<Category>,
    categoryName: String?,
    selectedIds: Set<String>,
    onSelectedChange: (Set<String>) -> Unit,
) {
    if (tags.isEmpty()) return
    var expanded by remember { mutableStateOf(false) }
    val categoryId = categories.firstOrNull { it.name == categoryName }?.id
    val suggestedIds = suggestions[categoryId].orEmpty().toSet()
    val ordered = orderedTagsForCategory(tags, suggestedIds)
    val visibleTags = if (expanded) ordered else ordered.take(6)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Text("TAGS", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
        Text("optional, up to 5", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    FlowRow(
        modifier = Modifier.widthIn(max = 296.dp),
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        visibleTags.forEach { tag ->
            val selected = tag.id in selectedIds
            val enabled = selected || selectedIds.size < 5
            val suggested = tag.id in suggestedIds
            Box(
                Modifier.width(94.dp).heightIn(min = 32.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                    .border(
                        1.dp,
                        when {
                            selected -> MaterialTheme.colorScheme.primary
                            suggested -> MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
                            else -> MaterialTheme.colorScheme.outline
                        },
                        RoundedCornerShape(18.dp),
                    )
                    .clickable(enabled = enabled) {
                    onSelectedChange(if (selected) selectedIds - tag.id else selectedIds + tag.id)
                    }
                    .padding(horizontal = 9.dp, vertical = 7.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    tag.name,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelMedium,
                    color = when {
                        !enabled -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                        selected -> Color.White
                        else -> MaterialTheme.colorScheme.onSurface
                    },
                )
            }
        }
    }
    if (ordered.size > 6) {
        TextButton(
            onClick = { expanded = !expanded },
            contentPadding = PaddingValues(horizontal = 1.dp, vertical = 0.dp),
            modifier = Modifier.height(28.dp),
        ) {
            Text(
                if (expanded) "Show less" else "Show more (${ordered.size - 6})",
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

internal fun orderedTagsForCategory(tags: List<Tag>, suggestedIds: Set<String>): List<Tag> =
    tags.sortedWith(
        compareByDescending<Tag> { it.id in suggestedIds }
            .thenBy { it.sortOrder }
            .thenBy { it.name },
    )

@Composable
private fun DatePickerField(value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val selected = runCatching { LocalDate.parse(value) }.getOrElse { LocalDate.now() }
    CalendarPickerField(label = "Date", value = value.replace('-', '/'), onClick = {
            DatePickerDialog(context, { _, year, month, day ->
                onValueChange(LocalDate.of(year, month + 1, day).toString())
            }, selected.year, selected.monthValue - 1, selected.dayOfMonth).show()
        }, modifier = modifier)
}

@Composable
private fun TimePickerField(label: String, value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val time = value.takeIf(::validTime)?.let { java.time.LocalTime.parse(it) } ?: java.time.LocalTime.of(9, 0)
    CalendarPickerField(label = label, value = value, onClick = {
            TimePickerDialog(context, { _, hour, minute -> onValueChange("%02d:%02d".format(hour, minute)) }, time.hour, time.minute, true).show()
        }, modifier = modifier)
}

@Composable
private fun CalendarPickerField(label: String, value: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label.uppercase(Locale.ENGLISH), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        Row(
            Modifier.fillMaxWidth().heightIn(min = 43.dp).clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant).border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(10.dp))
                .clickable(onClick = onClick).padding(horizontal = 11.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(value, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
            Text("⌄", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun InlineValidationMessage(message: String?) {
    Box(Modifier.fillMaxWidth().height(18.dp), contentAlignment = Alignment.CenterStart) {
        message?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
private fun CalendarSelectField(
    value: String,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
) {
    var expanded by remember { mutableStateOf(false) }
    Column(modifier) {
        if (label != null) {
            Text(label.uppercase(Locale.ENGLISH), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
        }
        Box {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 43.dp).clip(RoundedCornerShape(10.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(10.dp))
                    .clickable { expanded = true }.padding(horizontal = 11.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(options.firstOrNull { it.first == value }?.second ?: value, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.bodyMedium)
                Text("⌄", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                options.forEach { (key, text) ->
                    DropdownMenuItem(text = { Text(text) }, onClick = { expanded = false; onSelect(key) })
                }
            }
        }
    }
}

@Composable
private fun CalendarCheckbox(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onCheckedChange(!checked) }.padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Box(
            Modifier.size(18.dp).clip(RoundedCornerShape(3.dp))
                .background(if (checked) MaterialTheme.colorScheme.primary else Color.Transparent)
                .border(1.dp, if (checked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, RoundedCornerShape(3.dp)),
            contentAlignment = Alignment.Center,
        ) { if (checked) Text("✓", color = Color.White, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold) }
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun CreateItemDialog(
    date: LocalDate,
    categories: List<Category>,
    tags: List<Tag>,
    tagSuggestions: Map<String, List<String>>,
    onDismiss: () -> Unit,
    onCreateEvent: (String, LocalDate, Boolean, String?, List<Int>?, String, String, String?, Int, List<String>) -> Unit,
    onCreateDeadline: (String, LocalDate, Boolean, String?, String, String, List<String>) -> Unit,
) {
    var tab by remember { mutableIntStateOf(0) }
    var title by remember { mutableStateOf("") }
    var selectedDate by remember { mutableStateOf(date.toString()) }
    var allDay by remember { mutableStateOf(false) }
    var category by remember { mutableStateOf(categories.firstOrNull()?.name) }
    var priority by remember { mutableStateOf("default") }
    var repeatFrequency by remember { mutableStateOf("none") }
    var occurrenceCount by remember { mutableStateOf("10") }
    var reminderOne by remember { mutableStateOf("60") }
    var reminderTwo by remember { mutableStateOf("10") }
    var startTime by remember { mutableStateOf("09:00") }
    var endTime by remember { mutableStateOf("10:00") }
    var dueTime by remember { mutableStateOf("18:00") }
    var selectedTagIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    val timesValid = allDay || if (tab == 0) validEventTimes(startTime, endTime) else validTime(dueTime)
    val dateValid = runCatching { LocalDate.parse(selectedDate) }.isSuccess
    CalendarModal(
        onDismissRequest = onDismiss,
        title = {},
        text = {
            Column(
                modifier = Modifier.heightIn(max = 500.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                NewItemTypeToggle(selectedTab = tab, onSelect = { tab = it })
                CalendarTextField(value = title, onValueChange = { title = it }, label = "Title", modifier = Modifier.fillMaxWidth(), singleLine = true, placeholder = "e.g. Mechanics past paper")
                CategorySwatches(categories, category) { category = it }
                TagPicker(tags, tagSuggestions, categories, category, selectedTagIds) { selectedTagIds = it }
                if (tab == 1) {
                    Text("PRIORITY", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        listOf("high", "default", "low").forEach { option ->
                            CalendarChoiceChip(option.replaceFirstChar { it.uppercase() }, selected = priority == option, onClick = { priority = option })
                        }
                    }
                }
                DatePickerField(value = selectedDate, onValueChange = { selectedDate = it }, modifier = Modifier.fillMaxWidth())
                if (tab == 0) {
                    CalendarCheckbox("All-day", allDay) { allDay = it }
                    Box(Modifier.fillMaxWidth().height(66.dp)) {
                        if (!allDay) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TimePickerField("Start", startTime, { startTime = it }, Modifier.weight(1f))
                            TimePickerField("End", endTime, { endTime = it }, Modifier.weight(1f))
                        }
                        }
                    }
                    InlineValidationMessage(if (!dateValid) "Choose a valid date" else if (!timesValid) "End time must be later than start time" else null)
                    if (!allDay) {
                        val reminderOptions = listOf(
                            "" to "No reminder", "10" to "10 minutes before", "15" to "15 minutes before",
                            "30" to "30 minutes before", "60" to "1 hour before", "120" to "2 hours before", "1440" to "1 day before",
                        )
                        Text("REMINDERS", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            CalendarSelectField(reminderOne, reminderOptions, { reminderOne = it }, Modifier.weight(1f))
                            CalendarSelectField(reminderTwo, reminderOptions, { reminderTwo = it }, Modifier.weight(1f))
                        }
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Repeat", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        CalendarSelectField(
                            value = repeatFrequency,
                            options = listOf("none" to "Does not repeat", "daily" to "Every day", "weekly" to "Every week", "monthly" to "Every month", "yearly" to "Every year"),
                            onSelect = { repeatFrequency = it },
                            modifier = Modifier.width(180.dp),
                        )
                    }
                    if (repeatFrequency != "none") {
                        CalendarTextField(
                            value = occurrenceCount,
                            onValueChange = { occurrenceCount = it.filter(Char::isDigit).take(3) },
                            label = "Occurrences (1-366)",
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                    }
                } else {
                    Box(Modifier.fillMaxWidth().height(66.dp)) {
                        if (!allDay) TimePickerField("Due time", dueTime, { dueTime = it }, Modifier.fillMaxWidth())
                    }
                    CalendarCheckbox("All-day (due by end of day)", allDay) { allDay = it }
                    InlineValidationMessage(if (!dateValid) "Choose a valid date" else if (!timesValid) "Use a valid due time" else null)
                }
            }
        },
        confirmButton = {
            ModalActionButton(
                label = "Create",
                enabled = title.isNotBlank() && timesValid && dateValid,
                onClick = {
                    val itemDate = LocalDate.parse(selectedDate)
                    val reminders = listOfNotNull(reminderOne.toIntOrNull(), reminderTwo.toIntOrNull()).distinct()
                    if (tab == 0) onCreateEvent(title.trim(), itemDate, allDay, category, if (allDay) null else reminders, startTime, endTime, repeatFrequency.takeUnless { it == "none" }, occurrenceCount.toIntOrNull()?.coerceIn(1, 366) ?: 10, selectedTagIds.toList())
                    else onCreateDeadline(title.trim(), itemDate, allDay, category, priority, dueTime, selectedTagIds.toList())
                },
                kind = ModalButtonKind.PRIMARY,
            )
        },
        dismissButton = { ModalActionButton("Cancel", onDismiss) },
        showHeader = false,
    )
}

@Composable
private fun NewItemTypeToggle(selectedTab: Int, onSelect: (Int) -> Unit) {
    val dark = isSystemInDarkTheme()
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        listOf("Event", "Deadline").forEachIndexed { index, label ->
            val selected = selectedTab == index
            Box(
                modifier = Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(8.dp))
                    .background(if (selected) (if (dark) Color(0xFF636366) else MaterialTheme.colorScheme.surface) else Color.Transparent)
                    .clickable { onSelect(index) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun DetailRow(
    label: String,
    showDivider: Boolean = true,
    content: @Composable () -> Unit,
) {
    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.Top) {
        Text(
            label.uppercase(Locale.ENGLISH),
            modifier = Modifier.width(100.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.SemiBold,
        )
        Box(Modifier.weight(1f)) { content() }
    }
    if (showDivider) HorizontalDivider(color = MaterialTheme.colorScheme.outline)
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun EventDetailDialog(
    event: CalendarEvent,
    categories: List<Category>,
    tags: List<Tag>,
    tagSuggestions: Map<String, List<String>>,
    onDismiss: () -> Unit,
    onSave: (EventEditForm) -> Unit,
    onDelete: () -> Unit,
    onSkipOccurrence: (() -> Unit)? = null,
    onEditSeries: ((String, List<Int>?, List<String>) -> Unit)? = null,
    onDeleteSeries: (() -> Unit)? = null,
) {
    var showEditor by remember(event.id) { mutableStateOf(false) }
    var title by remember(event.id) { mutableStateOf(event.title) }
    var description by remember(event.id) { mutableStateOf(event.description.orEmpty()) }
    var date by remember(event.id) { mutableStateOf(event.dateKey().toString()) }
    var allDay by remember(event.id) { mutableStateOf(event.allDay) }
    var startTime by remember(event.id) { mutableStateOf(timePart(event.startTime, "09:00")) }
    var endTime by remember(event.id) { mutableStateOf(timePart(event.endTime, "10:00")) }
    var category by remember(event.id) { mutableStateOf(event.category) }
    var reminders by remember(event.id) { mutableStateOf(event.reminders ?: listOf(60, 10)) }
    var selectedTagIds by remember(event.id) { mutableStateOf(event.tags.map { it.id }.toSet()) }
    var deleteTarget by remember(event.id) { mutableStateOf<String?>(null) }
    var showSeriesEdit by remember(event.id) { mutableStateOf(false) }
    val timeValid = allDay || validEventTimes(startTime, endTime)
    val dateValid = runCatching { LocalDate.parse(date) }.isSuccess
    if (!showEditor) CalendarModal(
        onDismissRequest = onDismiss,
        title = {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(13.dp).background(parseColor(categories.firstOrNull { it.name == event.category }?.color ?: event.color), CircleShape))
                Text(event.title, modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold)
                TextButton(onClick = { showEditor = true }) { Text("Edit", color = MaterialTheme.colorScheme.primary) }
            }
        },
        text = {
            Column(Modifier.heightIn(max = 500.dp).verticalScroll(rememberScrollState())) {
                DetailRow("Category") {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(9.dp).background(parseColor(categories.firstOrNull { it.name == event.category }?.color ?: event.color), CircleShape))
                        Text(event.category ?: "None")
                    }
                }
                DetailRow("Date") { Text(event.dateKey().format(DateTimeFormatter.ofPattern("EEEE, MMMM d, yyyy", Locale.ENGLISH))) }
                DetailRow("Time") { Text(eventTimeRangeLabel(event)) }
                if (event.tags.isNotEmpty()) DetailRow("Tags") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        event.tags.forEach { tag -> CalendarChoiceChip(tag.name, selected = false, onClick = {}) }
                    }
                }
                if (event.seriesId != null) DetailRow("Repeats") { Text("Part of a repeating series") }
                if (!event.allDay) DetailRow("Reminders") {
                    val values = event.reminders.orEmpty()
                    Text(if (values.isEmpty()) "No reminders" else values.joinToString("\n") { "${reminderLabel(it)} before" }, color = if (values.isEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                }
                DetailRow("Notes", showDivider = false) {
                    Text(event.description?.takeIf { it.isNotBlank() } ?: "None", color = if (event.description.isNullOrBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                }
            }
        },
        confirmButton = { ModalActionButton("Close", onDismiss) },
        dismissButton = { ModalActionButton("Delete", { deleteTarget = "this event" }, kind = ModalButtonKind.DESTRUCTIVE) },
        maxDialogWidth = 400.dp,
        separateActions = true,
    ) else CalendarModal(
        onDismissRequest = { showEditor = false },
        title = { Text("Edit event") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 500.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                CalendarTextField(value = title, onValueChange = { title = it }, label = "Title", modifier = Modifier.fillMaxWidth(), singleLine = true)
                DatePickerField(value = date, onValueChange = { date = it }, modifier = Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("All-day", modifier = Modifier.weight(1f))
                    CalendarToggle(checked = allDay, onCheckedChange = { allDay = it })
                }
                Box(Modifier.fillMaxWidth().height(66.dp)) {
                    if (!allDay) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TimePickerField("Start", startTime, { startTime = it }, Modifier.weight(1f))
                            TimePickerField("End", endTime, { endTime = it }, Modifier.weight(1f))
                        }
                    }
                }
                InlineValidationMessage(if (!dateValid || !timeValid) "Check the date and time" else null)
                CategorySwatches(categories, category) { category = it }
                if (event.seriesId == null) {
                    TagPicker(tags, tagSuggestions, categories, category, selectedTagIds) { selectedTagIds = it }
                } else if (event.tags.isNotEmpty()) {
                    Text("Tags: ${event.tags.joinToString { it.name }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (!allDay && event.seriesId == null) {
                    Text("Reminders (choose up to two)", style = MaterialTheme.typography.labelMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(10, 15, 30, 60, 120, 1440).forEach { minutes ->
                            val selected = reminders.contains(minutes)
                            CalendarChoiceChip(
                                label = reminderLabel(minutes),
                                selected = selected,
                                onClick = {
                                    reminders = when {
                                        selected -> reminders - minutes
                                        reminders.size < 2 -> (reminders + minutes).sortedDescending()
                                        else -> reminders
                                    }
                                },
                                enabled = selected || reminders.size < 2,
                            )
                        }
                    }
                }
                CalendarTextField(value = description, onValueChange = { description = it }, label = "Notes", modifier = Modifier.fillMaxWidth(), minLines = 2)
                if (event.seriesId != null) Text("This changes only this occurrence. Use the series actions below for the whole series.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (onSkipOccurrence != null || onEditSeries != null || onDeleteSeries != null) {
                    HorizontalDivider(color = Color(0xFFD2D2D7))
                    Text("SERIES ACTIONS", style = MaterialTheme.typography.labelSmall, color = Color(0xFF86868B), fontWeight = FontWeight.SemiBold)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (onSkipOccurrence != null) ModalActionButton("Skip this occurrence", onSkipOccurrence)
                        if (onEditSeries != null) ModalActionButton("Edit entire series", { showSeriesEdit = true })
                        if (onDeleteSeries != null) ModalActionButton("Delete entire series", { deleteTarget = "the entire series" }, kind = ModalButtonKind.DESTRUCTIVE)
                    }
                }
                HorizontalDivider(color = Color(0xFFD2D2D7))
                ModalActionButton("Delete this event", { deleteTarget = "this event" }, kind = ModalButtonKind.DESTRUCTIVE)
            }
        },
        confirmButton = {
            ModalActionButton("Save", onClick = {
                onSave(EventEditForm(title.trim(), date, allDay, startTime, endTime, category, description, reminders, selectedTagIds.toList()))
            }, enabled = title.isNotBlank() && dateValid && timeValid, kind = ModalButtonKind.PRIMARY)
        },
        dismissButton = { ModalActionButton("Cancel", { showEditor = false }) },
    )
    deleteTarget?.let { target ->
        CalendarModal(
            onDismissRequest = { deleteTarget = null },
            title = { Text("Delete $target?") },
            text = { Text("This cannot be undone from the app.") },
            confirmButton = {
                ModalActionButton("Delete", onClick = {
                    deleteTarget = null
                    if (target == "the entire series") onDeleteSeries?.invoke() else onDelete()
                }, kind = ModalButtonKind.DESTRUCTIVE)
            },
            dismissButton = { ModalActionButton("Keep", { deleteTarget = null }) },
        )
    }
    if (showSeriesEdit && onEditSeries != null) {
        SeriesEditDialog(
            event = event,
            tags = tags,
            tagSuggestions = tagSuggestions,
            categories = categories,
            onDismiss = { showSeriesEdit = false },
            onSave = { title, seriesReminders, tagIds ->
                showSeriesEdit = false
                onEditSeries(title, seriesReminders, tagIds)
            },
        )
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun SeriesEditDialog(
    event: CalendarEvent,
    tags: List<Tag>,
    tagSuggestions: Map<String, List<String>>,
    categories: List<Category>,
    onDismiss: () -> Unit,
    onSave: (String, List<Int>?, List<String>) -> Unit,
) {
    var title by remember(event.seriesId) { mutableStateOf(event.title) }
    var reminders by remember(event.seriesId) { mutableStateOf(event.reminders ?: listOf(60, 10)) }
    var selectedTagIds by remember(event.seriesId) { mutableStateOf(event.tags.map { it.id }.toSet()) }
    CalendarModal(
        onDismissRequest = onDismiss,
        title = { Text("Edit entire series") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                CalendarTextField(value = title, onValueChange = { title = it }, label = "Title", modifier = Modifier.fillMaxWidth(), singleLine = true)
                if (!event.allDay) {
                    Text("Reminders (choose up to two)", style = MaterialTheme.typography.labelMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(10, 15, 30, 60, 120, 1440).forEach { minutes ->
                            val selected = reminders.contains(minutes)
                            CalendarChoiceChip(
                                label = reminderLabel(minutes),
                                selected = selected,
                                onClick = {
                                    reminders = when {
                                        selected -> reminders - minutes
                                        reminders.size < 2 -> (reminders + minutes).sortedDescending()
                                        else -> reminders
                                    }
                                },
                                enabled = selected || reminders.size < 2,
                            )
                        }
                    }
                }
                TagPicker(tags, tagSuggestions, categories, event.category, selectedTagIds) { selectedTagIds = it }
                Text("Changing the series rebuilds future instances with this title and reminder setting.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = { ModalActionButton("Save series", { onSave(title.trim(), if (event.allDay) null else reminders, selectedTagIds.toList()) }, enabled = title.isNotBlank(), kind = ModalButtonKind.PRIMARY) },
        dismissButton = { ModalActionButton("Cancel", onDismiss) },
    )
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun DeadlineDetailDialog(
    deadline: Deadline,
    categories: List<Category>,
    tags: List<Tag>,
    tagSuggestions: Map<String, List<String>>,
    onDismiss: () -> Unit,
    onSave: (DeadlineEditForm) -> Unit,
    onDelete: () -> Unit,
    onComplete: () -> Unit,
    onReopen: () -> Unit,
) {
    var showEditor by remember(deadline.id) { mutableStateOf(false) }
    var title by remember(deadline.id) { mutableStateOf(deadline.title) }
    var description by remember(deadline.id) { mutableStateOf(deadline.description.orEmpty()) }
    var date by remember(deadline.id) { mutableStateOf(deadline.dateKey().toString()) }
    var allDay by remember(deadline.id) { mutableStateOf(deadline.allDay) }
    var dueTime by remember(deadline.id) { mutableStateOf(timePart(deadline.dueTime, "18:00")) }
    var category by remember(deadline.id) { mutableStateOf(deadline.category) }
    var priority by remember(deadline.id) { mutableStateOf(deadline.priority) }
    var selectedTagIds by remember(deadline.id) { mutableStateOf(deadline.tags.map { it.id }.toSet()) }
    var confirmDelete by remember(deadline.id) { mutableStateOf(false) }
    val completed = deadline.completedAt != null || deadline.status == "completed"
    val dateValid = runCatching { LocalDate.parse(date) }.isSuccess
    val timeValid = allDay || validTime(dueTime)
    if (!showEditor) CalendarModal(
        onDismissRequest = onDismiss,
        title = {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(13.dp).background(parseColor(categories.firstOrNull { it.name == deadline.category }?.color ?: deadline.color), CircleShape))
                Text(deadline.title, modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold)
                TextButton(onClick = { showEditor = true }) { Text("Edit", color = MaterialTheme.colorScheme.primary) }
            }
        },
        text = {
            Column(Modifier.heightIn(max = 500.dp).verticalScroll(rememberScrollState())) {
                DetailRow("Category") {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(9.dp).background(parseColor(categories.firstOrNull { it.name == deadline.category }?.color ?: deadline.color), CircleShape))
                        Text(deadline.category ?: "None")
                    }
                }
                DetailRow("Priority") { CalendarChoiceChip(deadline.priority.replaceFirstChar { it.uppercase() }, selected = true, onClick = {}) }
                DetailRow("Due") {
                    val dateText = deadline.dateKey().format(DateTimeFormatter.ofPattern("EEEE, MMMM d, yyyy", Locale.ENGLISH))
                    Text(if (deadline.allDay) "$dateText · End of day" else "$dateText · ${timePart(deadline.dueTime, "")}")
                }
                if (deadline.tags.isNotEmpty()) DetailRow("Tags") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        deadline.tags.forEach { tag -> CalendarChoiceChip(tag.name, selected = false, onClick = {}) }
                    }
                }
                DetailRow("Status") {
                    val status = when {
                        completed -> "Completed"
                        deadline.isOverdue || deadline.status == "overdue" -> "Overdue"
                        else -> "Open"
                    }
                    Text(status, color = if (status == "Overdue") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold)
                }
                DetailRow("Notes", showDivider = false) {
                    Text(deadline.description?.takeIf { it.isNotBlank() } ?: "None", color = if (deadline.description.isNullOrBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                }
            }
        },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ModalActionButton("Close", onDismiss)
                ModalActionButton(if (completed) "Reopen" else "Complete", if (completed) onReopen else onComplete, kind = ModalButtonKind.PRIMARY)
            }
        },
        dismissButton = { ModalActionButton("Delete", { confirmDelete = true }, kind = ModalButtonKind.DESTRUCTIVE) },
        maxDialogWidth = 400.dp,
        separateActions = true,
    ) else CalendarModal(
        onDismissRequest = { showEditor = false },
        title = { Text(if (completed) "Completed deadline" else "Edit deadline") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 500.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = if (completed) Color(0xFFF1F5F1) else deadlineColor(deadline.priority).copy(alpha = 0.11f)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(if (completed) "✓" else "⚑", color = if (completed) Color(0xFF4C7A5A) else deadlineColor(deadline.priority), fontWeight = FontWeight.Bold)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            when {
                                completed -> "Completed — tap Reopen below to make it active again"
                                deadline.isOverdue -> "Overdue deadline"
                                else -> "Open deadline"
                            },
                            color = if (completed) Color(0xFF365941) else MaterialTheme.colorScheme.onSurface,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
                CalendarTextField(value = title, onValueChange = { title = it }, label = "Title", modifier = Modifier.fillMaxWidth(), singleLine = true)
                DatePickerField(value = date, onValueChange = { date = it }, modifier = Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("All-day", modifier = Modifier.weight(1f))
                    CalendarToggle(checked = allDay, onCheckedChange = { allDay = it })
                }
                Box(Modifier.fillMaxWidth().height(66.dp)) {
                    if (!allDay) TimePickerField("Due time", dueTime, { dueTime = it }, Modifier.fillMaxWidth())
                }
                InlineValidationMessage(if (!dateValid || !timeValid) "Check the date and time" else null)
                Text("Priority", style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("high", "default", "low").forEach { option ->
                        CalendarChoiceChip(option.replaceFirstChar { it.uppercase() }, selected = priority == option, onClick = { priority = option })
                    }
                }
                CategorySwatches(categories, category) { category = it }
                TagPicker(tags, tagSuggestions, categories, category, selectedTagIds) { selectedTagIds = it }
                CalendarTextField(value = description, onValueChange = { description = it }, label = "Notes", modifier = Modifier.fillMaxWidth(), minLines = 2)
                if (deadline.isOverdue) Text("Overdue", color = MaterialTheme.colorScheme.error)
                HorizontalDivider(color = Color(0xFFD2D2D7))
                Text("DEADLINE ACTIONS", style = MaterialTheme.typography.labelSmall, color = Color(0xFF86868B), fontWeight = FontWeight.SemiBold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (!completed) ModalActionButton("Mark complete", onComplete, kind = ModalButtonKind.PRIMARY) else ModalActionButton("Reopen", onReopen)
                    ModalActionButton("Delete", { confirmDelete = true }, kind = ModalButtonKind.DESTRUCTIVE)
                }
            }
        },
        confirmButton = {
            ModalActionButton("Save", onClick = {
                onSave(DeadlineEditForm(title.trim(), date, allDay, dueTime, category, description, priority, selectedTagIds.toList()))
            }, enabled = title.isNotBlank() && dateValid && timeValid, kind = ModalButtonKind.PRIMARY)
        },
        dismissButton = { ModalActionButton("Cancel", { showEditor = false }) },
    )
    if (confirmDelete) {
        CalendarModal(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete this deadline?") },
            text = { Text("This cannot be undone from the app.") },
            confirmButton = { ModalActionButton("Delete", { confirmDelete = false; onDelete() }, kind = ModalButtonKind.DESTRUCTIVE) },
            dismissButton = { ModalActionButton("Keep", { confirmDelete = false }) },
        )
    }
}

private fun eventTimeLabel(event: CalendarEvent): String = if (event.allDay) "All-day" else event.startTime.substringAfter('T').take(5)

private fun eventTimeRangeLabel(event: CalendarEvent): String = if (event.allDay) "All-day" else "${eventTimeLabel(event)} – ${timePart(event.endTime, "")}" 

private fun timePart(value: String?, fallback: String): String = value
    ?.substringAfter('T', "")
    ?.take(5)
    ?.takeIf { it.matches(Regex("\\d{2}:\\d{2}")) }
    ?: fallback

private fun reminderLabel(minutes: Int): String = when (minutes) {
    1440 -> "1 day"
    120 -> "2 hours"
    60 -> "1 hour"
    else -> "$minutes min"
}

private fun validTime(value: String): Boolean = CalendarTime.isValidTime(value)

private fun validEventTimes(start: String, end: String): Boolean = CalendarTime.eventRange("2000-01-01", false, start, end) != null

private fun deadlineColor(priority: String): Color = when (priority) {
    "high" -> Color(0xFFD04949)
    "low" -> Color(0xFF6A7A90)
    else -> Color(0xFF4C72C8)
}

private fun configuredColor(value: String?): Color? = value
    ?.takeIf { it.startsWith("#") && !it.equals("default", ignoreCase = true) }
    ?.let(::parseColor)

private fun eventDisplayColor(event: CalendarEvent, categoryColors: Map<String, Color>): Color =
    configuredColor(event.color) ?: categoryColors[event.category] ?: Color(0xFF6A7A90)

private fun deadlineDisplayColor(deadline: Deadline, categoryColors: Map<String, Color>): Color =
    configuredColor(deadline.color) ?: categoryColors[deadline.category] ?: deadlineColor(deadline.priority)

private fun parseColor(value: String?): Color = runCatching {
    if (value == null || !value.startsWith("#")) Color(0xFF6B7B95) else Color(android.graphics.Color.parseColor(value))
}.getOrDefault(Color(0xFF6B7B95))
