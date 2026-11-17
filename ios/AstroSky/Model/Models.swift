import Foundation

// MARK: - Input

/// A place of birth or of a return chart. `tz` is an IANA zone, as in the site's city list.
struct Place: Codable, Hashable {
    var name: String
    var country: String?
    var lat: Double
    var lon: Double
    var tz: String
}

/// A person: the date and time are local, as written on a birth certificate.
struct Person: Codable, Hashable, Identifiable {
    var id = UUID()
    var name: String
    var date: String          // YYYY-MM-DD
    var time: String          // HH:MM
    var place: Place
    var offset: Double?       // manual UTC offset in minutes, nil: from the time zone history

    var dateText: String {
        let p = date.split(separator: "-")
        guard p.count == 3, let m = Int(p[1]), let d = Int(p[2]) else { return date }
        return "\(d) \(Fmt.monthsGen[max(0, min(11, m - 1))]) \(p[0])"
    }
}

enum ChartMode: String, Codable, Hashable, CaseIterable {
    case natal, solar, lunar, synastry, composite

    var title: String {
        switch self {
        case .natal: return "Натальная карта"
        case .solar: return "Соляр"
        case .lunar: return "Лунар"
        case .synastry: return "Синастрия"
        case .composite: return "Композит"
        }
    }
}

/// The same switches as the site's natal tab.
struct ChartOptions: Codable, Hashable {
    var house = "P"
    var minor = false
    var nodes = true
    var chiron = true
    var lilith = true
    var fortune = true
    var angles = true
    var asteroids = false
    var asteroids2 = false
    var node = "true"
}

struct SolarRequest: Codable, Hashable {
    var year: Int?
    var place: Place?
}

struct LunarRequest: Codable, Hashable {
    var at: Double?           // ms since 1970: the lunar return in force at this moment, nil: now
    var place: Place?
}

struct ChartRequest: Codable, Hashable {
    var mode: ChartMode
    var person: Person
    var partner: Person?
    var opts: ChartOptions
    var solar: SolarRequest?
    var lunar: LunarRequest?
}

// MARK: - Output

struct Dignity: Codable, Hashable {
    let k: String
    let ru: String
}

struct ChartPoint: Codable, Hashable, Identifiable {
    let id: String
    let ru: String
    let glyph: String
    let color: String?
    let lon: Double
    let lat: Double
    let speed: Double
    let retro: Bool
    let sign: Int
    let house: Int
    let dign: [Dignity]
    let angle: Bool
    let short: Bool
    let planet: Bool
    let noAspects: Bool
    let houseIn: Int?
}

struct ChartAspect: Codable, Hashable {
    let a: String
    let b: String
    let aLon: Double
    let bLon: Double
    let partner: Bool
    let aspect: String
    let angle: Double
    let glyph: String
    let ru: String
    let kind: String
    let major: Bool
    let orb: Double
    let maxOrb: Double
    let applying: Bool?
}

struct ChartData: Codable, Hashable {
    let asc: Double
    let mc: Double
    let cusps: [Double]       // 12 cusps, I to XII
    let houseSystem: String
    let houseSystemRu: String
    let note: String
    let isDay: Bool
    let points: [ChartPoint]
    let angles: [ChartPoint]
    let aspects: [ChartAspect]
    let elements: [Int]
    let crosses: [Int]
    let rulers: [[String]]
}

struct ReadingItem: Codable, Hashable {
    let glyph: String
    let color: String?
    let head: String
    let text: String
    let tone: String?
    let partner: Bool
    let house: Bool
    let indent: Bool
}

struct ReadingSection: Codable, Hashable, Identifiable {
    let key: String
    let title: String
    let note: String?
    let items: [ReadingItem]
    var id: String { key }
}

struct HousePlanet: Codable, Hashable {
    let id: String
    let ru: String
    let glyph: String
    let color: String
    let score: Double?
    let signIn: String
    let retro: Bool
    let label: String?
    let why: [String]
    let key: String?
    let text: String
    let power: String
    let natText: String
}

struct HouseReading: Codable, Hashable, Identifiable {
    let h: Int
    let roman: String
    let topic: String
    let power: String
    let cuspSign: Int
    let cuspSignIn: String
    let cuspText: String
    let projText: String
    let empty: String
    let planets: [HousePlanet]
    var id: Int { h }
}

struct Reading: Codable, Hashable {
    let title: String
    let sub: String
    let sections: [ReadingSection]
    let points: [ReadingItem]?
    let houses: [HouseReading]?
    let housesGen: String?
    let housesSys: String?
    let housesKind: String?
}

struct ScorePart: Codable, Hashable {
    let glyph: String
    let color: String
    let label: String
    let neg: Bool
}

struct BestCity: Codable, Hashable {
    let city: Place
    let score: Double
    let parts: [ScorePart]
}

struct SolarInfo: Codable, Hashable {
    let year: Int
    let utc: Double
    let local: String
    let place: Place
    let score: Double
    let parts: [ScorePart]
    let best: [BestCity]
}

struct LunarItem: Codable, Hashable, Identifiable {
    let utc: Double
    let date: String
    let time: String
    let wd: String
    let current: Bool
    var id: Double { utc }
}

struct LunarInfo: Codable, Hashable {
    let utc: Double
    let next: Double
    let local: String
    let nextLocal: String
    let place: Place
    let list: [LunarItem]
}

struct ChartResult: Codable, Hashable {
    let mode: ChartMode
    let kind: String
    let title: String
    let sub: String
    let note: String
    let utc: Double
    let offset: Double
    let offsetSource: String?
    let ambiguous: Bool
    let gap: Bool
    let chart: ChartData
    let reading: Reading
    let solar: SolarInfo?
    let lunar: LunarInfo?
    let outer: [ChartPoint]?
    let outerAngles: [ChartPoint]?
    let cross: [ChartAspect]?
}

// MARK: - Engine reference data

struct BodyMeta: Codable, Hashable {
    let id: String
    let ru: String
    let glyph: String
    let color: String
    let short: Bool
}

struct SignMeta: Codable, Hashable {
    let glyph: String
    let name: String
    let signIn: String
}

struct HouseSystemMeta: Codable, Hashable, Identifiable {
    let id: String
    let ru: String
}

struct EngineMeta: Codable, Hashable {
    let bodies: [BodyMeta]
    let signs: [SignMeta]
    let houseSystems: [HouseSystemMeta]
    let rulers: [[String]]
}

// MARK: - Cities

/// A row of the site's city list (js/data.js): the name in Russian and English, country, coordinates, zone, population.
struct City: Decodable, Hashable, Identifiable {
    let ru: String
    let en: String
    let country: String
    let lat: Double
    let lon: Double
    let tz: String
    let pop: Int
    let key: String
    let keyEn: String

    var id: String { "\(ru)|\(country)|\(lat)|\(lon)" }
    var place: Place { Place(name: ru, country: country, lat: lat, lon: lon, tz: tz) }

    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        ru = try c.decode(String.self)
        en = try c.decode(String.self)
        country = try c.decode(String.self)
        lat = try c.decode(Double.self)
        lon = try c.decode(Double.self)
        tz = try c.decode(String.self)
        pop = Int(try c.decode(Double.self))
        key = City.norm(ru)
        keyEn = City.norm(en)
    }

    /// Like the site: case and diacritics folded (Zurich finds Zürich), ё as е, dashes and dots as spaces.
    static func norm(_ s: String) -> String {
        var t = s.lowercased().replacingOccurrences(of: "ё", with: "е").replacingOccurrences(of: "й", with: "\u{1}")
        t = t.folding(options: [.diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
        t = t.replacingOccurrences(of: "\u{1}", with: "й")
        for (a, b) in [("ø", "o"), ("ß", "ss"), ("æ", "ae"), ("œ", "oe"), ("ł", "l"), ("đ", "d"), ("ı", "i")] {
            t = t.replacingOccurrences(of: a, with: b)
        }
        let seps = CharacterSet(charactersIn: "-‐–—'’`.")
        t = t.components(separatedBy: seps).joined(separator: " ")
        return t.split(whereSeparator: { $0 == " " }).joined(separator: " ")
    }
}
