import Foundation
import Security

enum KeychainStore {
    private static let service = "com.ai0506.calendar.mac"
    private static let tokenAccount = "api_token"
    private static let baseURLDefaultsKey = "base_url"
    static let defaultBaseURL = "https://calendar.ai0506.com/api"

    static var baseURL: String {
        get { UserDefaults.standard.string(forKey: baseURLDefaultsKey) ?? defaultBaseURL }
        set { UserDefaults.standard.set(newValue, forKey: baseURLDefaultsKey) }
    }

    static func loadToken() -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func saveToken(_ token: String) {
        let data = Data(token.utf8)
        var query = baseQuery()
        let attributes: [String: Any] = [kSecValueData as String: data]

        let status = SecItemCopyMatching(query as CFDictionary, nil)
        if status == errSecSuccess {
            SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        } else {
            query[kSecValueData as String] = data
            SecItemAdd(query as CFDictionary, nil)
        }
    }

    static func clearToken() {
        SecItemDelete(baseQuery() as CFDictionary)
    }

    private static func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: tokenAccount
        ]
    }
}
