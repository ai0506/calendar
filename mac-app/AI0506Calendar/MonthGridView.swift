import SwiftUI

struct MonthGridView: View {
    @ObservedObject var viewModel: CalendarViewModel

    private let weekdaySymbols = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    var body: some View {
        VStack(spacing: 0) {
            weekdayHeader
            Divider()
            grid
        }
    }

    private var weekdayHeader: some View {
        HStack(spacing: 0) {
            ForEach(weekdaySymbols, id: \.self) { symbol in
                Text(symbol.uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.6)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, 8)
    }

    private var grid: some View {
        let days = viewModel.visibleDays
        return GeometryReader { geo in
            let rowHeight = geo.size.height / 6
            VStack(spacing: 0) {
                ForEach(0..<6, id: \.self) { row in
                    HStack(spacing: 0) {
                        ForEach(0..<7, id: \.self) { col in
                            let index = row * 7 + col
                            if index < days.count {
                                DayCell(
                                    day: days[index],
                                    viewModel: viewModel,
                                    height: rowHeight
                                )
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                            }
                        }
                    }
                    .frame(height: rowHeight)
                }
            }
        }
    }
}

private struct DayCell: View {
    let day: Date
    @ObservedObject var viewModel: CalendarViewModel
    let height: CGFloat

    private var isToday: Bool { AppCal.isSameDay(day, Date()) }
    private var isSelected: Bool { AppCal.isSameDay(day, viewModel.selectedDate) }
    private var isCurrentMonth: Bool {
        viewModel.viewMode != .month || AppCal.isSameMonth(day, viewModel.anchorDate)
    }

    /// 依据格子高度算出能放下几个 chip，避免溢出裁切。
    private var chipCapacity: Int {
        max(0, Int((height - 26) / 17))
    }

    var body: some View {
        let items = viewModel.items(on: day)
        let visible = Array(items.prefix(chipCapacity))
        let hidden = items.count - visible.count

        VStack(alignment: .leading, spacing: 2) {
            dayNumber
            ForEach(visible) { item in
                EventChip(item: item, colorHex: viewModel.colorHex(for: item))
            }
            if hidden > 0 {
                Text("+\(hidden) more")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.secondary)
                    .padding(.leading, 4)
            }
            Spacer(minLength: 0)
        }
        .padding(4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(cellBackground)
        .overlay(alignment: .topLeading) {
            Rectangle()
                .fill(Color.primary.opacity(0.07))
                .frame(height: 1)
        }
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Color.primary.opacity(0.07))
                .frame(width: 1)
        }
        .overlay {
            if isSelected {
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(Color.accentColor.opacity(0.8), lineWidth: 1.5)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { viewModel.select(day: day) }
    }

    private var dayNumber: some View {
        Text(Fmt.dayNumber.string(from: day))
            .font(.system(size: 11, weight: isToday ? .bold : .medium))
            .foregroundStyle(numberColor)
            .frame(width: 18, height: 18)
            .background {
                if isToday {
                    Circle().fill(Color.accentColor)
                }
            }
            .padding(.leading, 2)
    }

    private var numberColor: Color {
        if isToday { return .white }
        return isCurrentMonth ? .primary : .secondary.opacity(0.5)
    }

    @ViewBuilder
    private var cellBackground: some View {
        if isSelected {
            Color.accentColor.opacity(0.06)
        } else if !isCurrentMonth {
            Color.primary.opacity(0.025)
        } else {
            Color.clear
        }
    }
}

private struct EventChip: View {
    let item: DisplayItem
    let colorHex: String

    var body: some View {
        let color = Color(hex: colorHex)
        HStack(spacing: 3) {
            if case .deadline = item {
                Image(systemName: "flag.fill")
                    .font(.system(size: 7))
                    .foregroundStyle(color)
            } else {
                Circle()
                    .fill(color)
                    .frame(width: 5, height: 5)
            }
            Text(chipText)
                .font(.system(size: 10))
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 1.5)
        .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 3))
    }

    private var chipText: String {
        switch item {
        case .event(let event):
            guard !event.allDay, let start = event.startDate else { return event.title }
            return "\(Fmt.time.string(from: start)) \(event.title)"
        case .deadline(let deadline):
            guard !deadline.allDay, let due = deadline.dueDate else { return deadline.title }
            return "\(Fmt.time.string(from: due)) \(deadline.title)"
        }
    }
}
