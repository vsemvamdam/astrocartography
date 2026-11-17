import XCTest
@testable import AstroSky

/// The engine in JavaScriptCore must give exactly the site's numbers. The expected values come from the
/// same js/*.js files run in Node (ios/scripts/expected.js), so any difference means the iOS runtime
/// (time zones, Intl, number formatting) behaves differently from the browser's.
final class EngineTests: XCTestCase {
    private func person(_ date: String, _ time: String, _ name: String, _ lat: Double, _ lon: Double, _ tz: String) -> Person {
        Person(name: "", date: date, time: time, place: Place(name: name, country: nil, lat: lat, lon: lon, tz: tz))
    }

    private func natal(_ p: Person, _ opts: ChartOptions = ChartOptions()) async throws -> ChartResult {
        try await AstroEngine.shared.chart(ChartRequest(mode: .natal, person: p, partner: nil, opts: opts, solar: nil, lunar: nil))
    }

    private func lon(_ r: ChartResult, _ id: String) -> Double { r.chart.points.first { $0.id == id }?.lon ?? .nan }

    func testNatalVoronezhMatchesSite() async throws {
        let r = try await natal(person("1996-04-11", "05:54", "Воронеж", 51.67, 39.18, "Europe/Moscow"))
        XCTAssertEqual(r.utc, 829187640000)
        XCTAssertEqual(r.offset, 240)
        XCTAssertEqual(r.chart.asc, 353.370998, accuracy: 1e-5)
        XCTAssertEqual(r.chart.mc, 267.473459, accuracy: 1e-5)
        XCTAssertEqual(lon(r, "Sun"), 21.464135, accuracy: 1e-5)
        XCTAssertEqual(lon(r, "Moon"), 292.735674, accuracy: 1e-5)
        XCTAssertEqual(lon(r, "Chiron"), 190.358512, accuracy: 1e-5)
        XCTAssertEqual(r.chart.aspects.count, 29)
        XCTAssertEqual(r.chart.cusps.count, 12)
        XCTAssertEqual(r.reading.sections.count, 4)
        XCTAssertEqual(Fmt.pos(lon(r, "Sun")).text, "21°27′")
    }

    /// Time zone history before 1970 (js/tz-history.js) and summer time.
    func testTimeZones() async throws {
        let oslo = try await natal(person("1950-06-15", "10:30", "Осло", 59.91, 10.75, "Europe/Oslo"))
        XCTAssertEqual(oslo.utc, -616861800000)
        XCTAssertEqual(oslo.chart.asc, 159.089479, accuracy: 1e-5)
        XCTAssertEqual(lon(oslo, "Moon"), 80.735033, accuracy: 1e-5)

        let moscow = try await natal(person("1985-08-01", "23:15", "Москва", 55.75, 37.62, "Europe/Moscow"))
        XCTAssertEqual(moscow.utc, 491771700000)
        XCTAssertEqual(moscow.offset, 240)
        XCTAssertEqual(moscow.chart.mc, 276.157588, accuracy: 1e-5)

        let ny = try await natal(person("1975-11-03", "07:05", "Нью-Йорк", 40.71, -74.01, "America/New_York"))
        XCTAssertEqual(ny.utc, 184248300000)
        XCTAssertEqual(ny.offset, -300)
        XCTAssertEqual(lon(ny, "Sun"), 220.446065, accuracy: 1e-5)
    }

    func testSolarLunarSynastry() async throws {
        let me = person("1996-04-11", "05:54", "Воронеж", 51.67, 39.18, "Europe/Moscow")
        let solar = try await AstroEngine.shared.chart(ChartRequest(mode: .solar, person: me, partner: nil, opts: ChartOptions(), solar: SolarRequest(year: 2027, place: nil), lunar: nil))
        XCTAssertEqual(solar.solar?.utc ?? 0, 1807452040447, accuracy: 1000)
        XCTAssertEqual(solar.chart.asc, 179.235210, accuracy: 1e-4)
        XCTAssertEqual(solar.solar?.best.first?.city.name, "Майами")
        XCTAssertEqual(solar.reading.houses?.count, 12)

        let lunar = try await AstroEngine.shared.chart(ChartRequest(mode: .lunar, person: me, partner: nil, opts: ChartOptions(), solar: nil, lunar: LunarRequest(at: 1794873600000, place: nil)))
        XCTAssertEqual(lunar.lunar?.utc ?? 0, 1794681505995, accuracy: 1000)
        XCTAssertEqual(lunar.lunar?.next ?? 0, 1797038302763, accuracy: 1000)
        XCTAssertEqual(lunar.chart.asc, 125.824146, accuracy: 1e-4)

        var her = person("1997-07-23", "14:30", "Москва", 55.75, 37.62, "Europe/Moscow")
        her.name = "Настя"
        let syn = try await AstroEngine.shared.chart(ChartRequest(mode: .synastry, person: me, partner: her, opts: ChartOptions(), solar: nil, lunar: nil))
        XCTAssertEqual(syn.cross?.count, 50)
        XCTAssertEqual(syn.reading.sections.count, 6)
        let comp = try await AstroEngine.shared.chart(ChartRequest(mode: .composite, person: me, partner: her, opts: ChartOptions(), solar: nil, lunar: nil))
        XCTAssertFalse(comp.reading.sections.isEmpty)
    }

    /// Eros and the other small asteroids load their own table on demand.
    func testExtraAsteroids() async throws {
        var o = ChartOptions()
        o.asteroids2 = true
        let r = try await natal(person("1996-04-11", "05:54", "Воронеж", 51.67, 39.18, "Europe/Moscow"), o)
        XCTAssertTrue(r.chart.points.contains { $0.id == "Eros" })
    }

    func testCities() async throws {
        let list = try await AstroEngine.shared.cities()
        XCTAssertGreaterThan(list.count, 7000)
        XCTAssertTrue(list.contains { $0.ru == "Воронеж" })
        XCTAssertEqual(City.norm("Zürich"), "zurich")
        XCTAssertEqual(City.norm("Ростов-на-Дону"), "ростов на дону")
    }

    @MainActor func testPDF() async throws {
        let r = try await natal(person("1996-04-11", "05:54", "Воронеж", 51.67, 39.18, "Europe/Moscow"))
        let url = try XCTUnwrap(PDFBuilder.make(result: r))
        let size = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int ?? 0
        XCTAssertGreaterThan(size, 20_000)
    }
}
