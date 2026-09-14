import SwiftUI

/// 周 / 日视图：完整 24 小时时间轴（FRONTEND_SPEC §4），重叠事件并排显示。
struct TimelineView: View {
    @ObservedObject var viewModel: CalendarViewModel

    private let hourHeight: CGFloat = 44
    private let hourLabelWidth: CGFloat = 52
    private var totalHeight: CGFloat { hourHeight * 24 }

    var body: some View {
        let days = viewModel.visibleDays

        GeometryReader { geo in
            let colWidth = max(1, (geo.size.width - hourLabelWidth) / CGFloat(max(days.count, 1)))
            VStack(spacing: 0) {
                headerRow(days: days, colWidth: colWidth)
                Divider()
                allDayRow(days: days, colWidth: colWidth)
                timeline(days: days, colWidth: colWidth)
            }
        }
    }

    // MARK: - Header

    private func headerRow(days: [Date], colWidth: CGFloat) -> some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: hourLabelWidth)
            ForEach(days, id: \.self) { day in
                let isToday = AppCal.isSameDay(day, Date())
                VStack(spacing: 2) {
                    Text(Fmt.weekdayShort.string(from: day).uppercased())
                        .font(.system(size: 9, weight: .semibold))
                        .tracking(0.6)
                        .foregroundStyle(.secondary)
                    Text(Fmt.dayNumber.string(from: day))
                        .font(.system(size: 13, weight: isToday ? .bold : .medium))
                        .foregroundStyle(isToday ? .white : .primary)
                        .frame(width: 22, height: 22)
                        .background { if isToday { Circle().fill(Color.accentColor) } }
                }
                .frame(width: colWidth)
                .contentShape(Rectangle())
                .onTapGesture { viewModel.select(day: day) }
            }
        }
        .padding(.vertical, 6)
    }

    // MARK: - 全天横幅（不混入小时网格，见 §5）

    @ViewBuilder
    private func allDayRow(days: [Date], colWidth: CGFloat) -> some View {
        let allDayByDay = days.map { day in
            viewModel.items(on: day).filter { $0.isAllDay }
        }
        if allDayByDay.contains(where: { !$0.isEmpty }) {
            HStack(spacing: 0) {
                Text("all-day")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                    .frame(width: hourLabelWidth, alignment: .trailing)
                    .padding(.trailing, 6)
                ForEach(Array(days.enumerated()), id: \.element) { index, _ in
                    VStack(spacing: 2) {
                        ForEach(allDayByDay[index]) { item in
                            let color = Color(hex: viewModel.colorHex(for: item))
                            Text(item.title)
                                .font(.system(size: 10))
                                .lineLimit(1)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(color.opacity(0.16), in: RoundedRectangle(cornerRadius: 3))
                        }
                    }
                    .frame(width: colWidth, alignment: .top)
                    .padding(.horizontal, 1)
                }
            }
            .padding(.vertical, 4)
            Divider()
        }
    }

    // MARK: - 时间轴

    private func timeline(days: [Date], colWidth: CGFloat) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                HStack(alignment: .top, spacing: 0) {
                    hourLabels
                    ForEach(days, id: \.self) { day in
                        dayColumn(day: day, width: colWidth)
                            .frame(width: colWidth, height: totalHeight)
                    }
                }
                .frame(height: totalHeight)
            }
            .onAppear {
                // 打开时定位到早上 7 点，而不是从午夜开始
                proxy.scrollTo(7, anchor: .top)
            }
        }
    }

    private var hourLabels: some View {
        VStack(spacing: 0) {
            ForEach(0..<24, id: \.self) { hour in
                Text(String(format: "%02d:00", hour))
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                    .frame(width: hourLabelWidth, height: hourHeight, alignment: .topTrailing)
                    .padding(.trailing, 6)
                    .id(hour)
            }
        }
    }

    private func dayColumn(day: Date, width: CGFloat) -> some View {
        let positioned = TimelineLayout.layout(items: viewModel.items(on: day))
        let isToday = AppCal.isSameDay(day, Date())

        return ZStack(alignment: .topLeading) {
            // 小时网格线
            VStack(spacing: 0) {
                ForEach(0..<24, id: \.self) { _ in
                    VStack(spacing: 0) {
                        Divider()
                        Spacer(minLength: 0)
                    }
                    .frame(height: hourHeight)
                }
            }

            Divider().frame(width: 1, height: totalHeight)

            ForEach(positioned) { block in
                let slotWidth = (width - 4) / CGFloat(block.columnCount)
                TimelineBlock(
                    item: block.item,
                    colorHex: viewModel.colorHex(for: block.item),
                    isNow: isToday && block.containsNow
                )
                .frame(
                    width: max(slotWidth - 2, 10),
                    height: max((block.endMinutes - block.startMinutes) / 60 * hourHeight - 2, 16)
                )
                .offset(
                    x: 2 + CGFloat(block.column) * slotWidth,
                    y: block.startMinutes / 60 * hourHeight
                )
            }

            if isToday {
                currentTimeIndicator(width: width)
            }
        }
        .frame(width: width, height: totalHeight, alignment: .topLeading)
    }

    private func currentTimeIndicator(width: CGFloat) -> some View {
        let minutes = AppCal.minutesFromStartOfDay(Date())
        return ZStack(alignment: .leading) {
            Rectangle()
                .fill(Color.red)
                .frame(height: 1.5)
            Circle()
                .fill(Color.red)
                .frame(width: 6, height: 6)
                .offset(x: -3)
        }
        .frame(width: width)
        .offset(y: minutes / 60 * hourHeight)
    }
}

// MARK: - 重叠布局

struct PositionedItem: Identifiable {
    let id: String
    let item: DisplayItem
    let startMinutes: CGFloat
    let endMinutes: CGFloat
    let column: Int
    let columnCount: Int

    var containsNow: Bool {
        let now = AppCal.minutesFromStartOfDay(Date())
        return now >= startMinutes && now <= endMinutes
    }
}

enum TimelineLayout {
    /// 把当天的定时项分簇，簇内贪心分列，使重叠事件并排而不互相遮挡。
    static func layout(items: [DisplayItem]) -> [PositionedItem] {
        struct Span {
            let item: DisplayItem
            let start: CGFloat
            let end: CGFloat
        }

        let spans: [Span] = items.compactMap { item in
            guard !item.isAllDay else { return nil }
            switch item {
            case .event(let event):
                guard let start = event.startDate else { return nil }
                let end = event.endDate ?? start.addingTimeInterval(3600)
                let startMin = CGFloat(AppCal.minutesFromStartOfDay(start))
                var endMin = CGFloat(AppCal.minutesFromStartOfDay(end))
                // 跨天事件在当天截到 24:00
                if endMin <= startMin { endMin = 1440 }
                return Span(item: item, start: max(0, startMin), end: min(1440, endMin))
            case .deadline(let deadline):
                guard let due = deadline.dueDate else { return nil }
                let startMin = CGFloat(AppCal.minutesFromStartOfDay(due))
                return Span(item: item, start: max(0, startMin), end: min(1440, startMin + 30))
            }
        }
        .sorted { $0.start < $1.start }

        var result: [PositionedItem] = []
        var cluster: [Span] = []
        var clusterEnd: CGFloat = -1

        func flush() {
            guard !cluster.isEmpty else { return }
            var columnEnds: [CGFloat] = []
            var assigned: [(Span, Int)] = []

            for span in cluster {
                var placed = false
                for index in columnEnds.indices where columnEnds[index] <= span.start {
                    columnEnds[index] = span.end
                    assigned.append((span, index))
                    placed = true
                    break
                }
                if !placed {
                    columnEnds.append(span.end)
                    assigned.append((span, columnEnds.count - 1))
                }
            }

            let count = max(columnEnds.count, 1)
            for (span, column) in assigned {
                result.append(
                    PositionedItem(
                        id: span.item.id,
                        item: span.item,
                        startMinutes: span.start,
                        endMinutes: span.end,
                        column: column,
                        columnCount: count
                    )
                )
            }
            cluster = []
            clusterEnd = -1
        }

        for span in spans {
            if span.start >= clusterEnd, !cluster.isEmpty {
                flush()
            }
            cluster.append(span)
            clusterEnd = max(clusterEnd, span.end)
        }
        flush()

        return result
    }
}

private struct TimelineBlock: View {
    let item: DisplayItem
    let colorHex: String
    let isNow: Bool

    var body: some View {
        let color = Color(hex: colorHex)
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 3) {
                if case .deadline = item {
                    Image(systemName: "flag.fill").font(.system(size: 7))
                }
                Text(item.title)
                    .font(.system(size: 10, weight: .medium))
                    .lineLimit(1)
                if isNow {
                    Text("NOW")
                        .font(.system(size: 7, weight: .bold))
                        .padding(.horizontal, 3)
                        .background(Color.red.opacity(0.85), in: Capsule())
                        .foregroundStyle(.white)
                }
            }
            if let time = timeText {
                Text(time)
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 2)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(color.opacity(0.18), in: RoundedRectangle(cornerRadius: 4))
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2)
                .fill(color)
                .frame(width: 2.5)
                .padding(.vertical, 1)
        }
        .overlay {
            if isNow {
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(Color.red.opacity(0.7), lineWidth: 1.2)
            }
        }
    }

    private var timeText: String? {
        switch item {
        case .event(let event):
            guard let start = event.startDate else { return nil }
            if let end = event.endDate {
                return "\(Fmt.time.string(from: start)) – \(Fmt.time.string(from: end))"
            }
            return Fmt.time.string(from: start)
        case .deadline(let deadline):
            guard let due = deadline.dueDate else { return nil }
            return "Due \(Fmt.time.string(from: due))"
        }
    }
}
