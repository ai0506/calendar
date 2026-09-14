import SwiftUI

/// 全项目统一使用上海时区，与后端存储/网页端保持一致。
enum AppCal {
    static let timeZone = TimeZone(identifier: "Asia/Shanghai") ?? .current

    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        c.firstWeekday = 1 // 与网页端一致：周日开头
        return c
    }()

    static func startOfDay(_ date: Date) -> Date {
        calendar.startOfDay(for: date)
    }

    static func isSameDay(_ a: Date, _ b: Date) -> Bool {
        calendar.isDate(a, inSameDayAs: b)
    }

    static func adding(days: Int, to date: Date) -> Date {
        calendar.date(byAdding: .day, value: days, to: date) ?? date
    }

    static func adding(months: Int, to date: Date) -> Date {
        calendar.date(byAdding: .month, value: months, to: date) ?? date
    }

    static func firstOfMonth(for date: Date) -> Date {
        let comps = calendar.dateComponents([.year, .month], from: date)
        return calendar.date(from: comps) ?? startOfDay(date)
    }

    /// 月视图 6×7 网格的起始日（含上月补位）。
    static func monthGridStart(for date: Date) -> Date {
        weekStart(for: firstOfMonth(for: date))
    }

    static func weekStart(for date: Date) -> Date {
        let day = startOfDay(date)
        let weekday = calendar.component(.weekday, from: day)
        let offset = (weekday - calendar.firstWeekday + 7) % 7
        return adding(days: -offset, to: day)
    }

    static func isSameMonth(_ a: Date, _ b: Date) -> Bool {
        calendar.isDate(a, equalTo: b, toGranularity: .month)
    }

    /// 距当天 00:00 的分钟数，用于时间轴定位。
    static func minutesFromStartOfDay(_ date: Date) -> Double {
        let day = startOfDay(date)
        return date.timeIntervalSince(day) / 60
    }
}

enum Fmt {
    private static func make(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.dateFormat = format
        f.timeZone = AppCal.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }

    static let time = make("HH:mm")
    static let monthTitle = make("MMMM yyyy")
    static let dayFull = make("EEEE, MMMM d")
    static let weekdayShort = make("EEE")
    static let monthDay = make("MMM d")
    static let monthDayYear = make("MMM d, yyyy")
    static let dayNumber = make("d")
    static let apiDate = make("yyyy-MM-dd")
}

extension Color {
    init(hex: String) {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        value = value.replacingOccurrences(of: "#", with: "")
        var rgb: UInt64 = 0
        Scanner(string: value).scanHexInt64(&rgb)

        if value.count == 6 {
            self = Color(
                red: Double((rgb & 0xFF0000) >> 16) / 255,
                green: Double((rgb & 0x00FF00) >> 8) / 255,
                blue: Double(rgb & 0x0000FF) / 255
            )
        } else {
            self = Color.gray
        }
    }
}
