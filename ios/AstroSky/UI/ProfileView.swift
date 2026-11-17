import SwiftUI

/// Your data, the partner, saved people and the chart settings (the site's switches).
struct ProfileView: View {
    @EnvironmentObject var model: AppModel
    @State private var editing: Editing?

    enum Editing: Identifiable {
        case me, partner, person(Person), new
        var id: String {
            switch self {
            case .me: return "me"
            case .partner: return "partner"
            case .person(let p): return p.id.uuidString
            case .new: return "new"
            }
        }
    }

    var body: some View {
        List {
            Section("Вы") {
                personRow(model.me, empty: "Добавить свои данные") { editing = .me }
            }
            Section("Партнёр для совместимости") {
                personRow(model.partner, empty: "Добавить партнёра") { editing = .partner }
                if model.partner != nil {
                    Button("Убрать партнёра", role: .destructive) { model.partner = nil }
                }
            }
            Section {
                ForEach(model.people) { p in
                    Menu {
                        Button("Это я") { model.me = p }
                        Button("Партнёр") { model.partner = p }
                        Button("Изменить") { editing = .person(p) }
                    } label: {
                        summary(p)
                    }
                }
                .onDelete { model.deletePeople(at: $0) }
                Button { editing = .new } label: { Label("Добавить человека", systemImage: "plus") }
            } header: {
                Text("Сохранённые карты")
            } footer: {
                Text("Нажмите на человека, чтобы взять его карту как свою или как партнёра.")
            }
            settings
            Section("О приложении") {
                Text("Расчёты — те же, что на сайте AstroSky: эфемериды Astronomy Engine, Хирон и астероиды по таблицам JPL Horizons, история часовых поясов. Положения сверены с программой Сотис.")
                    .font(.footnote).foregroundStyle(Color.muted)
                Link(destination: URL(string: "https://vsemvamdam.github.io/astrocartography/")!) {
                    Label("Открыть сайт AstroSky", systemImage: "safari")
                }
                Text("Версия \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")")
                    .font(.footnote).foregroundStyle(Color.faint)
            }
        }
        .astroScreen()
        .navigationTitle("Профиль")
        .sheet(item: $editing) { e in
            switch e {
            case .me:
                PersonEditor(title: "Ваши данные", person: model.me) { p in model.me = p; model.savePerson(p) }
            case .partner:
                PersonEditor(title: "Партнёр", person: model.partner) { p in model.partner = p; model.savePerson(p) }
            case .person(let person):
                PersonEditor(title: person.name.isEmpty ? "Карта" : person.name, person: person) { p in
                    model.savePerson(p)
                    if model.me?.id == p.id { model.me = p }
                    if model.partner?.id == p.id { model.partner = p }
                }
            case .new:
                PersonEditor(title: "Новая карта", person: nil) { p in model.savePerson(p) }
            }
        }
    }

    private func personRow(_ p: Person?, empty: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            if let p { summary(p) } else { Label(empty, systemImage: "person.badge.plus").foregroundStyle(Color.brass) }
        }
    }

    private func summary(_ p: Person) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(p.name.isEmpty ? "Без имени" : p.name).foregroundStyle(Color.fg)
            Text("\(p.dateText), \(p.time) · \(p.place.name)").font(.caption).foregroundStyle(Color.muted)
        }
    }

    private var settings: some View {
        Section {
            Picker("Система домов", selection: $model.options.house) {
                ForEach(model.meta?.houseSystems ?? [HouseSystemMeta(id: "P", ru: "Плацидус")]) { s in Text(s.ru).tag(s.id) }
            }
            Picker("Лунный узел", selection: $model.options.node) {
                Text("Истинный").tag("true")
                Text("Средний").tag("mean")
            }
            Toggle("Узлы", isOn: $model.options.nodes)
            Toggle("Хирон", isOn: $model.options.chiron)
            Toggle("Лилит", isOn: $model.options.lilith)
            Toggle("Парс Фортуны", isOn: $model.options.fortune)
            Toggle("Церера, Паллада, Юнона, Веста", isOn: $model.options.asteroids)
            Toggle("Эрос, Психея, Амор, Гигея, Прозерпина", isOn: $model.options.asteroids2)
            Toggle("Аспекты к ASC и MC", isOn: $model.options.angles)
            Toggle("Минорные аспекты", isOn: $model.options.minor)
        } header: {
            Text("Настройки карты")
        } footer: {
            Text("Лунар всегда строится в домах Плацидуса — по методу Константина Дарагана, как на сайте.")
        }
        .tint(Color.brass)
    }
}

/// First launch: the emblem and a button to enter your birth data.
struct WelcomeView: View {
    @EnvironmentObject var model: AppModel
    @State private var editing = false

    var body: some View {
        VStack(spacing: 22) {
            Spacer()
            Image("Emblem").resizable().scaledToFit().frame(width: 150, height: 150)
                .clipShape(RoundedRectangle(cornerRadius: 34, style: .continuous))
                .shadow(color: Color.brass.opacity(0.35), radius: 30)
            Text("AstroSky").font(.display(40)).foregroundStyle(Color.fg)
            Text("Натальная карта с расшифровкой, соляр и лунар, совместимость — те же расчёты, что на сайте.")
                .multilineTextAlignment(.center).foregroundStyle(Color.muted).padding(.horizontal, 32)
            Spacer()
            Button { editing = true } label: {
                Text("Ввести мои данные").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent).tint(Color.brass).foregroundStyle(Color.brassInk)
            .padding(.horizontal, 24).padding(.bottom, 30)
        }
        .background(StarField())
        .sheet(isPresented: $editing) {
            PersonEditor(title: "Ваши данные", person: nil) { p in model.me = p; model.savePerson(p) }
        }
    }
}
