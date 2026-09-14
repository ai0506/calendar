import Foundation

enum APIError: Error, LocalizedError {
    case unauthorized
    case server(String)
    case decoding
    case noToken
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Token 无效或已过期，请重新输入"
        case .server(let message): return message
        case .decoding: return "服务器返回的数据格式无法解析"
        case .noToken: return "尚未设置 API Token"
        case .transport(let error): return "网络请求失败：\(error.localizedDescription)"
        }
    }
}

private struct Envelope<T: Decodable>: Decodable {
    let ok: Bool
    let data: T?
    let error: EnvelopeError?
}

private struct EnvelopeError: Decodable {
    let code: String
    let message: String
}

final class APIClient {
    static let shared = APIClient()

    private let session: URLSession = .shared
    private let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    func fetchEvents(from: Date, to: Date) async throws -> [Event] {
        var query = [URLQueryItem(name: "from", value: isoFormatter.string(from: from))]
        query.append(URLQueryItem(name: "to", value: isoFormatter.string(from: to)))
        return try await request(path: "/events", query: query)
    }

    func fetchDeadlines(from: Date, to: Date, includeCompleted: Bool = false) async throws -> [Deadline] {
        let query = [
            URLQueryItem(name: "from", value: Fmt.apiDate.string(from: from)),
            URLQueryItem(name: "to", value: Fmt.apiDate.string(from: to)),
            URLQueryItem(name: "include_completed", value: includeCompleted ? "true" : "false")
        ]
        return try await request(path: "/deadlines", query: query)
    }

    func fetchCategories() async throws -> [Category] {
        try await request(path: "/categories", query: [])
    }

    private func request<T: Decodable>(path: String, query: [URLQueryItem]) async throws -> T {
        guard let token = KeychainStore.loadToken(), !token.isEmpty else {
            throw APIError.noToken
        }
        guard var components = URLComponents(string: KeychainStore.baseURL + path) else {
            throw APIError.server("无效的 Base URL")
        }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else {
            throw APIError.server("无法构造请求 URL")
        }

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.server("无效的响应")
        }
        if http.statusCode == 401 {
            throw APIError.unauthorized
        }

        let decoder = JSONDecoder()
        guard let envelope = try? decoder.decode(Envelope<T>.self, from: data) else {
            throw APIError.decoding
        }
        if envelope.ok, let payload = envelope.data {
            return payload
        }
        throw APIError.server(envelope.error?.message ?? "未知服务器错误")
    }
}
