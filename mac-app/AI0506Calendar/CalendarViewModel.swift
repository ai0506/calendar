import Foundation
import SwiftUI

enum CalendarViewMode: String, CaseIterable, Identifiable {
    case month, week, day
    var id: String { rawValue }
    var label: String {
        switch self {
        case .month: return "Month"
        case .week: return "Week"
        case .day: return "Day"
        }
    }
}

enum DisplayItem: Identifiable, Hashable {
    case event(Event)
    case deadline(Deadline)

    var id: String {
        switch self {
        case .event(let e): return "event-\(e.id)"
        case .deadline(let d): return "deadline-\(d.id)"
        }
    }

    var title: String {
        switch self {
        case .event(let e): return e.title
        case .deadline(let d): return d.title
        }
    }

    var category: String? {
        switch self {
        case .event(let e): return e.category
        case .deadline(let d): return d.category
        }
    }

    var isAllDay: Bool {
        switch self {
        case .event(let e): return e.allDay
        case .deadline(let d): return d.allDay
        }
    }

    var sortDate: Date {
        switch self {
        case .event(let e): return e.startDate ?? .distantPast
        case .deadline(let d): return d.dueDate ?? .distantPast
        }
    }
}

@MainActor
final class CalendarViewModel: ObservableObject {
    @Published var viewMode: CalendarViewMode = .month
    @Published private(set) var anchorDate: Date = Date()
    @Published var selectedDate: Date = AppCal.startOfDay(Date())

    @Published private(set) var itemsByDay: [Date: [DisplayItem]] = [:]
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var needsToken = false

    private var categoryColors: [String: String] = [:]
    private var loadedRange: ClosedRange<Date>?

    // MARK: - Derived state

    var navigationTitle: String {
        switch viewMode {
        case .month:
            return Fmt.monthTitle.string(from: anchorDate)
        case .week:
            let start = AppCal.weekStart(for: anchorDate)
            let end = AppCal.adding(days: 6, to: start)
            if AppCal.isSameMonth(start, end) {
                return "\(Fmt.monthDay.string(from: start)) – \(Fmt.dayNumber.string(from: end))"
            }
            return "\(Fmt.monthDay.string(from: start)) – \(Fmt.monthDay.string(from: end))"
        case .day:
            return Fmt.dayFull.string(from: anchorDate)
        }
    }

    /// 当前视图需要显示的日期区间（月视图为 6×7 网格）。
    var visibleDays: [Date] {
        switch viewMode {
        case .month:
            let start = AppCal.monthGridStart(for: anchorDate)
            return (0..<42).map { AppCal.adding(days: $0, to: start) }
        case .week:
            let start = AppCal.weekStart(for: anchorDate)
            return (0..<7).map { AppCal.adding(days: $0, to: start) }
        case .day:
            return [AppCal.startOfDay(anchorDate)]
        }
    }

    func items(on day: Date) -> [DisplayItem] {
        itemsByDay[AppCal.startOfDay(day)] ?? []
    }

    func colorHex(for item: DisplayItem) -> String {
        switch item {
        case .event(let e):
            return normalized(e.color) ?? categoryColors[e.category ?? ""] ?? "#8e8e93"
        case .deadline(let d):
            return normalized(d.color) ?? categoryColors[d.category ?? ""] ?? "#8e8e93"
        }
    }

    private func normalized(_ color: String?) -> String? {
        guard let color = color, color != "default", !color.isEmpty else { return nil }
        return color
    }

    // MARK: - Navigation

    func navigate(_ direction: Int) {
        switch viewMode {
        case .month:
            anchorDate = AppCal.adding(months: direction, to: anchorDate)
            if !AppCal.isSameMonth(selectedDate, anchorDate) {
                selectedDate = AppCal.firstOfMonth(for: anchorDate)
            }
        case .week:
            anchorDate = AppCal.adding(days: 7 * direction, to: anchorDate)
            selectedDate = AppCal.weekStart(for: anchorDate)
        case .day:
            anchorDate = AppCal.adding(days: direction, to: anchorDate)
            selectedDate = AppCal.startOfDay(anchorDate)
        }
        Task { await load() }
    }

    func goToToday() {
        anchorDate = Date()
        selectedDate = AppCal.startOfDay(Date())
        Task { await load() }
    }

    func setMode(_ mode: CalendarViewMode) {
        guard mode != viewMode else { return }
        viewMode = mode
        // 切换视图时锚定到当前选中日，避免跳到无关区间。
        if mode != .month {
            anchorDate = selectedDate
        }
        Task { await load() }
    }

    func select(day: Date) {
        selectedDate = AppCal.startOfDay(day)
        if viewMode == .month, !AppCal.isSameMonth(day, anchorDate) {
            anchorDate = day
            Task { await load() }
        }
    }

    // MARK: - Loading

    /// 需要覆盖的数据区间（比可视区间多留一周，翻页时少一次请求）。
    private var requiredRange: ClosedRange<Date> {
        let days = visibleDays
        let start = AppCal.adding(days: -7, to: days.first ?? anchorDate)
        let end = AppCal.adding(days: 7, to: days.last ?? anchorDate)
        return start...end
    }

    func load(force: Bool = false) async {
        guard KeychainStore.loadToken() != nil else {
            needsToken = true
            return
        }

        let needed = requiredRange
        if !force, let loaded = loadedRange,
           loaded.contains(needed.lowerBound), loaded.contains(needed.upperBound) {
            return // 已加载的范围已覆盖，无需重复请求
        }

        isLoading = true
        errorMessage = nil
        needsToken = false

        // 一次多取一些，减少翻页请求次数
        let fetchStart = AppCal.adding(days: -21, to: needed.lowerBound)
        let fetchEnd = AppCal.adding(days: 21, to: needed.upperBound)

        do {
            async let eventsTask = APIClient.shared.fetchEvents(from: fetchStart, to: fetchEnd)
            async let deadlinesTask = APIClient.shared.fetchDeadlines(from: fetchStart, to: fetchEnd)
            async let categoriesTask = APIClient.shared.fetchCategories()

            let (events, deadlines, categories) = try await (eventsTask, deadlinesTask, categoriesTask)

            categoryColors = Dictionary(categories.map { ($0.name, $0.color) }) { first, _ in first }

            var buckets: [Date: [DisplayItem]] = [:]
            for event in events {
                guard let start = event.startDate else { continue }
                buckets[AppCal.startOfDay(start), default: []].append(.event(event))
            }
            for deadline in deadlines {
                guard let due = deadline.dueDate else { continue }
                buckets[AppCal.startOfDay(due), default: []].append(.deadline(deadline))
            }
            for key in buckets.keys {
                buckets[key]?.sort { lhs, rhs in
                    // 全天项排在当天最前，其余按时间
                    if lhs.isAllDay != rhs.isAllDay { return lhs.isAllDay }
                    return lhs.sortDate < rhs.sortDate
                }
            }

            itemsByDay = buckets
            loadedRange = fetchStart...fetchEnd
        } catch APIError.unauthorized {
            needsToken = true
            loadedRange = nil
            KeychainStore.clearToken()
        } catch {
            errorMessage = error.localizedDescription
            loadedRange = nil
        }

        isLoading = false
    }

    func reset() {
        loadedRange = nil
        itemsByDay = [:]
    }
}
