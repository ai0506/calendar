import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var token: String = ""
    @State private var baseURL: String = KeychainStore.baseURL
    var onSaved: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("连接到 AI0506 Calendar")
                .font(.title2)
                .bold()

            Text("在网页设置中生成的 API_TOKEN，粘贴到下方即可。")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 4) {
                Text("API Token").font(.caption).foregroundStyle(.secondary)
                SecureField("粘贴 Bearer Token", text: $token)
                    .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Base URL").font(.caption).foregroundStyle(.secondary)
                TextField(KeychainStore.defaultBaseURL, text: $baseURL)
                    .textFieldStyle(.roundedBorder)
            }

            HStack {
                Spacer()
                Button("取消") { dismiss() }
                Button("保存") {
                    let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty else { return }
                    KeychainStore.saveToken(trimmed)
                    let trimmedURL = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
                    KeychainStore.baseURL = trimmedURL.isEmpty ? KeychainStore.defaultBaseURL : trimmedURL
                    onSaved()
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(24)
        .frame(width: 420)
    }
}
