import Foundation
import SwiftUI

/// The app's state: your data, the partner, saved people and the chart settings. Kept in UserDefaults as JSON.
@MainActor
final class AppModel: ObservableObject {
    @Published var me: Person? { didSet { save() } }
    @Published var partner: Person? { didSet { save() } }
    @Published var people: [Person] = [] { didSet { save() } }
    @Published var options = ChartOptions() { didSet { save() } }
    @Published var cities: [City] = []
    @Published var meta: EngineMeta?
    @Published var engineError: String?
    @Published var tab: Int = 0

    private var loading = false
    private let key = "astrosky.state.v1"

    private struct Stored: Codable {
        var me: Person?
        var partner: Person?
        var people: [Person]
        var options: ChartOptions
    }

    init() {
        if let data = UserDefaults.standard.data(forKey: key), let s = try? JSONDecoder().decode(Stored.self, from: data) {
            me = s.me; partner = s.partner; people = s.people; options = s.options
        }
        Demo.apply(to: self)
        AstroEngine.shared.warmUp()
    }

    private func save() {
        guard !Demo.isOn else { return }
        let s = Stored(me: me, partner: partner, people: people, options: options)
        if let data = try? JSONEncoder().encode(s) { UserDefaults.standard.set(data, forKey: key) }
    }

    /// The city list and reference data come from the engine (js/data.js), loaded once.
    func loadReference() async {
        guard cities.isEmpty, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            async let c = AstroEngine.shared.cities()
            async let m = AstroEngine.shared.meta()
            let (list, info) = try await (c, m)
            cities = list
            meta = info
        } catch {
            engineError = error.localizedDescription
        }
    }

    /// Search like the site: names that start with the query first, larger cities first; Russian or English.
    func searchCities(_ query: String, limit: Int = 40) -> [City] {
        let q = City.norm(query)
        guard !q.isEmpty else { return Array(cities.filter { $0.pop >= 1_000_000 }.prefix(limit)) }
        var starts: [City] = [], contains: [City] = []
        for c in cities {
            if c.key.hasPrefix(q) || c.keyEn.hasPrefix(q) { starts.append(c) }
            else if c.key.contains(q) || c.keyEn.contains(q) { contains.append(c) }
        }
        starts.sort { $0.pop > $1.pop }
        contains.sort { $0.pop > $1.pop }
        return Array((starts + contains).prefix(limit))
    }

    func nearestCity(lat: Double, lon: Double) -> City? {
        func km(_ c: City) -> Double {
            let r = Double.pi / 180, dLat = (c.lat - lat) * r, dLon = (c.lon - lon) * r
            let a = sin(dLat / 2) * sin(dLat / 2) + cos(lat * r) * cos(c.lat * r) * sin(dLon / 2) * sin(dLon / 2)
            return 6371 * 2 * atan2(sqrt(a), sqrt(1 - a))
        }
        return cities.min { km($0) < km($1) }
    }

    func savePerson(_ p: Person) {
        if let i = people.firstIndex(where: { $0.id == p.id }) { people[i] = p } else { people.append(p) }
    }

    func deletePeople(at offsets: IndexSet) { people.remove(atOffsets: offsets) }
}

/// Launch arguments for screenshots and tests: `-demo` fills in sample data, `-tab N` opens a tab,
/// `-mode solar|lunar|synastry|composite` picks the chart, `-scroll reading|tables` scrolls to a block.
enum Demo {
    static var args: [String] { ProcessInfo.processInfo.arguments }
    static var isOn: Bool { args.contains("-demo") }
    static func value(_ key: String) -> String? {
        guard let i = args.firstIndex(of: key), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    static let me = Person(name: "Герман", date: "1996-04-11", time: "05:54",
                           place: Place(name: "Воронеж", country: "Россия", lat: 51.67, lon: 39.18, tz: "Europe/Moscow"))
    static let partner = Person(name: "Настя", date: "1997-07-23", time: "14:30",
                                place: Place(name: "Москва", country: "Россия", lat: 55.75, lon: 37.62, tz: "Europe/Moscow"))

    @MainActor static func apply(to m: AppModel) {
        guard isOn else { return }
        m.me = me
        m.partner = partner
        m.people = [me, partner]
        if let t = value("-tab"), let n = Int(t) { m.tab = n }
    }
}
