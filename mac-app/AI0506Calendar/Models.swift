import Foundation

struct Category: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let color: String
    let sortOrder: Int?

    enum CodingKeys: String, CodingKey {
        case id, name, color
        case sortOrder = "sort_order"
    }
}

struct Tag: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let color: String?
}

struct Event: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let description: String?
    let startTime: String
    let endTime: String?
    let allDay: Bool
    let category: String?
    let color: String?
    let groupTitle: String?
    let tags: [Tag]?

    enum CodingKeys: String, CodingKey {
        case id, title, description, category, color, tags
        case startTime = "start_time"
        case endTime = "end_time"
        case allDay = "all_day"
        case groupTitle = "group_title"
    }

    var startDate: Date? { CalendarDateParsing.parse(startTime) }
    var endDate: Date? { endTime.flatMap { CalendarDateParsing.parse($0) } }
}

struct Deadline: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let description: String?
    let dueTime: String
    let allDay: Bool
    let category: String?
    let color: String?
    let priority: String?
    let status: String?
    let isOverdue: Bool?
    let tags: [Tag]?

    enum CodingKeys: String, CodingKey {
        case id, title, description, category, color, priority, status, tags
        case dueTime = "due_time"
        case allDay = "all_day"
        case isOverdue = "is_overdue"
    }

    var dueDate: Date? { CalendarDateParsing.parse(dueTime) }
    var isCompleted: Bool { status == "completed" }
}

enum CalendarDateParsing {
    private static let withTimeFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let withTimeFormatterNoFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let dateOnlyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "Asia/Shanghai")
        return f
    }()

    static func parse(_ value: String) -> Date? {
        if value.count == 10, let d = dateOnlyFormatter.date(from: value) {
            return d
        }
        return withTimeFormatter.date(from: value) ?? withTimeFormatterNoFraction.date(from: value)
    }
}
