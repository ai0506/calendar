import SwiftUI

/// 右侧「当日详情」检查器（FRONTEND_SPEC §3 Split Inspector）。
struct InspectorView: View {
    @ObservedObject var viewModel: CalendarViewModel

    var body: some View {
        let items = viewModel.items(on: viewModel.selectedDate)

        VStack(alignment: .leading, spacing: 0) {
            header(count: items.count)
            Divider()

            if items.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "calendar.day.timeline.left")
                        .font(.system(size: 22))
                        .foregroundStyle(.tertiary)
                    Text("No events")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(items) { item in
                            InspectorRow(item: item, colorHex: viewModel.colorHex(for: item))
                        }
                    }
                    .padding(12)
                }
            }
        }
    }

    private func header(count: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(Fmt.weekdayShort.string(from: viewModel.selectedDate).uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.8)
                .foregroundStyle(.secondary)
            Text(Fmt.monthDayYear.string(from: viewModel.selectedDate))
                .font(.system(size: 17, weight: .semibold))
            // 固定高度，事件数变化不推动下方内容（§2 界面稳定）
            Text(count == 1 ? "1 item" : "\(count) items")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .frame(height: 14, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
    }
}

struct InspectorRow: View {
    let item: DisplayItem
    let colorHex: String

    var body: some View {
        let color = Color(hex: colorHex)
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 2)
                .fill(color)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    Text(item.title)
                        .font(.system(size: 13, weight: .medium))
                        .lineLimit(2)
                    if isHighPriority {
                        Text("HIGH")
                            .font(.system(size: 8, weight: .bold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color.red.opacity(0.14), in: Capsule())
                            .foregroundStyle(.red)
                    }
                    if isNow {
                        Text("NOW")
                            .font(.system(size: 8, weight: .bold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color.red.opacity(0.14), in: Capsule())
                            .foregroundStyle(.red)
                    }
                }

                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundStyle(isOverdue ? Color.red : Color.secondary)

                if let category = item.category, !category.isEmpty {
                    Text(category)
                        .font(.system(size: 10))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1.5)
                        .background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 3))
                        .foregroundStyle(color)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 6))
    }

    private var isHighPriority: Bool {
        if case .deadline(let d) = item { return d.priority == "high" }
        return false
    }

    private var isOverdue: Bool {
        if case .deadline(let d) = item { return d.isOverdue ?? false }
        return false
    }

    /// 当前时间是否落在该事件区间内（FRONTEND_SPEC §5「正在进行」）。
    private var isNow: Bool {
        guard case .event(let event) = item, !event.allDay, let start = event.startDate else { return false }
        let end = event.endDate ?? start.addingTimeInterval(3600)
        let now = Date()
        return now >= start && now <= end
    }

    private var subtitle: String {
        switch item {
        case .event(let event):
            if event.allDay { return "All day" }
            guard let start = event.startDate else { return "" }
            var text = Fmt.time.string(from: start)
            if let end = event.endDate {
                text += " – " + Fmt.time.string(from: end)
            }
            return text
        case .deadline(let deadline):
            let prefix = (deadline.isOverdue ?? false) ? "Overdue · " : "Deadline · "
            if deadline.allDay { return prefix + "All day" }
            guard let due = deadline.dueDate else { return prefix + deadline.dueTime }
            return prefix + Fmt.time.string(from: due)
        }
    }
}
