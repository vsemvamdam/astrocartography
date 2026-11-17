import SwiftUI

@main
struct AstroSkyApp: App {
    @StateObject private var model = AppModel()

    init() {
        let nav = UINavigationBarAppearance()
        nav.configureWithTransparentBackground()
        nav.titleTextAttributes = [.foregroundColor: UIColor(Color.fg)]
        nav.largeTitleTextAttributes = [.foregroundColor: UIColor(Color.fg)]
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
                .tint(Color.brass)
                .task { await model.loadReference() }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        if model.me == nil {
            WelcomeView()
        } else {
            TabView(selection: $model.tab) {
                NavigationStack { ChartScreen(group: .natal) }
                    .tabItem { Label("Натал", systemImage: "sparkles") }.tag(0)
                NavigationStack { ChartScreen(group: .returns) }
                    .tabItem { Label("Прогноз", systemImage: "moon.stars") }.tag(1)
                NavigationStack { ChartScreen(group: .pair) }
                    .tabItem { Label("Пара", systemImage: "heart") }.tag(2)
                NavigationStack { ProfileView() }
                    .tabItem { Label("Профиль", systemImage: "person.crop.circle") }.tag(3)
            }
            .overlay(alignment: .top) {
                if let e = model.engineError {
                    Text(e).font(.footnote).padding(10).background(Color.danger.opacity(0.2), in: RoundedRectangle(cornerRadius: 10)).padding()
                }
            }
        }
    }
}
