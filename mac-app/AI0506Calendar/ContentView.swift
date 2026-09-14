import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = CalendarViewModel()
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Divider()
            content
        }
        .frame(minWidth: 900, minHeight: 620)
        .sheet(isPresented: $showSettings) {
            SettingsView {
                viewModel.reset()
                Task { await viewModel.load(force: true) }
            }
        }
        .sheet(isPresented: $viewModel.needsToken) {
            SettingsView {
                viewModel.reset()
                Task { await viewModel.load(force: true) }
            }
        }
        .task { await viewModel.load() }
    }

    // MARK: - 顶栏（控件位置固定，标题用定宽槽位，见 FRONTEND_SPEC §2）

    private var topBar: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                Circle().fill(Color.accentColor).frame(width: 8, height: 8)
                Text("AI0506 Calendar")
                    .font(.system(size: 12, weight: .semibold))
            }
            .frame(width: 170, alignment: .leading)

            Spacer(minLength: 8)

            HStack(spacing: 6) {
                navArrow("chevron.left", direction: -1)
                Text(viewModel.navigationTitle)
                    .font(.system(size: 14, weight: .semibold))
                    .frame(width: 200)          // 定宽槽位：月份名长短不影响箭头位置
                    .lineLimit(1)
                navArrow("chevron.right", direction: 1)

                Button("Today") { viewModel.goToToday() }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .keyboardShortcut("t", modifiers: [])
            }

            Spacer(minLength: 8)

            HStack(spacing: 8) {
                Picker("", selection: viewModeBinding) {
                    ForEach(CalendarViewMode.allCases) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(width: 190)

                Button {
                    Task { await viewModel.load(force: true) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Refresh")
                .disabled(viewModel.isLoading)

                Button {
                    showSettings = true
                } label: {
                    Image(systemName: "gearshape")
                }
                .help("Settings")
            }
            .frame(width: 280, alignment: .trailing)
        }
        .buttonStyle(.borderless)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private var viewModeBinding: Binding<CalendarViewMode> {
        Binding(
            get: { viewModel.viewMode },
            set: { viewModel.setMode($0) }
        )
    }

    private func navArrow(_ systemName: String, direction: Int) -> some View {
        Button {
            viewModel.navigate(direction)
        } label: {
            Image(systemName: systemName)
                .font(.system(size: 11, weight: .semibold))
                .frame(width: 22, height: 22)
                .contentShape(Rectangle())
        }
        .keyboardShortcut(direction < 0 ? .leftArrow : .rightArrow, modifiers: [])
    }

    // MARK: - 主体

    @ViewBuilder
    private var content: some View {
        ZStack {
            switch viewModel.viewMode {
            case .month:
                monthLayout
            case .week, .day:
                TimelineView(viewModel: viewModel)
            }

            if let message = viewModel.errorMessage {
                errorOverlay(message)
            }
        }
    }

    /// 横屏左右分栏、竖屏上下分栏（阈值 1.35，见 FRONTEND_SPEC §3）
    private var monthLayout: some View {
        GeometryReader { geo in
            let isLandscape = geo.size.height > 0 && (geo.size.width / geo.size.height) >= 1.35
            if isLandscape {
                HStack(spacing: 0) {
                    MonthGridView(viewModel: viewModel)
                    Divider()
                    InspectorView(viewModel: viewModel)
                        .frame(width: 280)
                }
            } else {
                VStack(spacing: 0) {
                    MonthGridView(viewModel: viewModel)
                    Divider()
                    InspectorView(viewModel: viewModel)
                        .frame(height: max(200, geo.size.height * 0.38))
                }
            }
        }
    }

    private func errorOverlay(_ message: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 24))
                .foregroundStyle(.orange)
            Text(message)
                .font(.system(size: 12))
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button("重试") {
                Task { await viewModel.load(force: true) }
            }
        }
        .padding(20)
        .frame(maxWidth: 320)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        .shadow(radius: 12)
    }
}

#Preview {
    ContentView()
}
