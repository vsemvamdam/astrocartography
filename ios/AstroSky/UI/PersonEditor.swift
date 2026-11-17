import SwiftUI
import CoreLocation

/// Birth data: name, local date and time as written, the place from the site's city list.
struct PersonEditor: View {
    let title: String
    let onSave: (Person) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var id: UUID
    @State private var name: String
    @State private var date: Date
    @State private var time: Date
    @State private var place: Place?
    @State private var manual: Bool
    @State private var offset: Int
    @State private var picking = false

    init(title: String, person: Person?, onSave: @escaping (Person) -> Void) {
        self.title = title
        self.onSave = onSave
        _id = State(initialValue: person?.id ?? UUID())
        _name = State(initialValue: person?.name ?? "")
        _date = State(initialValue: LocalDate.date(from: person?.date ?? "1990-01-01"))
        _time = State(initialValue: LocalDate.date(from: "2000-01-01", time: person?.time ?? "12:00"))
        _place = State(initialValue: person?.place)
        _manual = State(initialValue: person?.offset != nil)
        _offset = State(initialValue: Int(person?.offset ?? 180))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Имя", text: $name).textInputAutocapitalization(.words)
                }
                Section {
                    DatePicker("Дата рождения", selection: $date, in: LocalDate.range, displayedComponents: .date)
                    DatePicker("Время", selection: $time, displayedComponents: .hourAndMinute)
                } footer: {
                    Text("Местное время по свидетельству о рождении. Если время неизвестно, поставьте 12:00 — дома и углы будут неточными.")
                }
                .environment(\.timeZone, TimeZone(identifier: "UTC")!)
                .environment(\.locale, Locale(identifier: "ru_RU"))
                Section("Место рождения") {
                    Button { picking = true } label: {
                        HStack {
                            Image(systemName: "mappin.and.ellipse").foregroundStyle(Color.brass)
                            if let place {
                                VStack(alignment: .leading) {
                                    Text(place.name).foregroundStyle(Color.fg)
                                    Text("\(place.country ?? "") · \(Fmt.coords(place))").font(.caption).foregroundStyle(Color.muted)
                                }
                            } else {
                                Text("Выбрать город").foregroundStyle(Color.brass)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Color.faint)
                        }
                    }
                }
                Section {
                    Toggle("Смещение от UTC вручную", isOn: $manual).tint(Color.brass)
                    if manual {
                        Stepper(value: $offset, in: -720...840, step: 15) {
                            Text(offsetText).font(.mono(16))
                        }
                    }
                } footer: {
                    Text("Обычно не нужно: летнее и декретное время, переходы 1991, 2011 и 2014 годов и местное среднее время до введения поясов учитываются сами, как на сайте.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(StarField())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Готово") {
                        guard let place else { return }
                        onSave(Person(id: id, name: name.trimmingCharacters(in: .whitespaces), date: LocalDate.ymd(date), time: LocalDate.hm(time),
                                      place: place, offset: manual ? Double(offset) : nil))
                        dismiss()
                    }
                    .disabled(place == nil)
                }
            }
            .sheet(isPresented: $picking) { CityPicker(title: "Место рождения") { place = $0 } }
        }
        .tint(Color.brass)
        .preferredColorScheme(.dark)
    }

    private var offsetText: String {
        let a = abs(offset)
        return String(format: "UTC%@%02d:%02d", offset < 0 ? "−" : "+", a / 60, a % 60)
    }
}

/// City search over the site's 7 300 cities, in Russian or English; or the current location.
struct CityPicker: View {
    let title: String
    let onPick: (Place) -> Void
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @StateObject private var locator = Locator()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        locator.request()
                    } label: {
                        Label(locator.busy ? "Определяем место…" : "Где я сейчас", systemImage: "location")
                    }
                    if let e = locator.error { Text(e).font(.footnote).foregroundStyle(Color.danger) }
                }
                Section(query.isEmpty ? "Крупные города" : "Найдено") {
                    ForEach(model.searchCities(query)) { c in
                        Button {
                            onPick(c.place); dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(c.ru).foregroundStyle(Color.fg)
                                Text("\(c.country) · \(c.en)").font(.caption).foregroundStyle(Color.muted)
                            }
                        }
                    }
                    if model.cities.isEmpty { ProgressView() }
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Город на русском или английском")
            .scrollContentBackground(.hidden)
            .background(StarField())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } } }
            .onChange(of: locator.location) { _, loc in
                guard let loc else { return }
                let lat = loc.coordinate.latitude, lon = loc.coordinate.longitude
                let near = model.nearestCity(lat: lat, lon: lon)
                let dist = near.map { CLLocation(latitude: $0.lat, longitude: $0.lon).distance(from: loc) / 1000 } ?? 9999
                let name = near != nil && dist < 40 ? near!.ru : String(format: "%.2f°, %.2f°", lat, lon)
                onPick(Place(name: name, country: near?.country, lat: lat, lon: lon, tz: near?.tz ?? TimeZone.current.identifier))
                dismiss()
            }
        }
        .tint(Color.brass)
        .preferredColorScheme(.dark)
    }
}

/// One location fix for "Где я сейчас".
@MainActor
final class Locator: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var location: CLLocation?
    @Published var busy = false
    @Published var error: String?
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func request() {
        error = nil
        busy = true
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            busy = false
            error = "Нет доступа к геопозиции: разрешите его в Настройках или выберите город."
        default: manager.requestLocation()
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            guard self.busy else { return }
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
            case .denied, .restricted:
                self.busy = false
                self.error = "Нет доступа к геопозиции: разрешите его в Настройках или выберите город."
            default: break
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            self.busy = false
            self.location = locations.last
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.busy = false
            self.error = "Не удалось определить место. Выберите город из списка."
        }
    }
}
