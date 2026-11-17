import Foundation

/// Formatting shared with the site (natal-view.js): positions truncated like Sotis, Roman house numbers.
enum Fmt {
    static let monthsGen = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
    static let roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
    static let signGlyphs = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"]
    static let signNames = ["Овен", "Телец", "Близнецы", "Рак", "Лев", "Дева", "Весы", "Скорпион", "Стрелец", "Козерог", "Водолей", "Рыбы"]
    static let elements = ["Огонь", "Земля", "Воздух", "Вода"]
    static let crosses = ["Кардинальный", "Фиксированный", "Мутабельный"]

    static func n360(_ x: Double) -> Double { let y = x.truncatingRemainder(dividingBy: 360); return y < 0 ? y + 360 : y }

    struct Pos {
        let sign: Int
        let deg: Int
        let min: Int
        let sec: Int
        var glyph: String { Fmt.signGlyphs[sign] }
        var name: String { Fmt.signNames[sign] }
        var text: String { "\(deg)°\(String(format: "%02d", min))′" }
        var full: String { "\(deg)°\(String(format: "%02d", min))′\(String(format: "%02d", sec))″" }
    }

    /// Degrees, minutes and seconds within the sign, never rounded up into the next sign.
    static func pos(_ lon: Double) -> Pos {
        let l = n360(lon)
        let sign = min(11, Int(floor(l / 30)))
        let total = Int(floor((l - Double(sign) * 30) * 3600 + 1e-6))
        return Pos(sign: sign, deg: total / 3600, min: (total / 60) % 60, sec: total % 60)
    }

    static func orb(_ d: Double) -> String {
        var deg = Int(floor(d)), min = Int(((d - floor(d)) * 60).rounded())
        if min == 60 { deg += 1; min = 0 }
        return "\(deg)°\(String(format: "%02d", min))′"
    }

    static func plural(_ n: Int, _ one: String, _ few: String, _ many: String) -> String {
        let a = n % 10, b = n % 100
        if a == 1 && b != 11 { return one }
        if a >= 2 && a <= 4 && (b < 12 || b > 14) { return few }
        return many
    }

    static func score(_ v: Double) -> String {
        let s = String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",")
        return v > 0 ? "+" + s : s.replacingOccurrences(of: "-", with: "−")
    }

    static func coords(_ p: Place) -> String {
        func dm(_ v: Double) -> String {
            let a = abs(v); var d = Int(floor(a)); var m = Int(((a - floor(a)) * 60).rounded())
            if m == 60 { d += 1; m = 0 }
            return "\(d)°\(String(format: "%02d", m))′"
        }
        var lon = n360(p.lon); if lon > 180 { lon -= 360 }
        return "\(dm(p.lat)) \(p.lat >= 0 ? "с.ш." : "ю.ш.") · \(dm(lon)) \(lon >= 0 ? "в.д." : "з.д.")"
    }
}

/// Dates for the birth form: the date and time are kept as written (local), so they go through UTC components.
enum LocalDate {
    static let utc: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    static func date(from ymd: String, time: String = "12:00") -> Date {
        let d = ymd.split(separator: "-").compactMap { Int($0) }, t = time.split(separator: ":").compactMap { Int($0) }
        var c = DateComponents()
        c.year = d.count > 0 ? d[0] : 2000; c.month = d.count > 1 ? d[1] : 1; c.day = d.count > 2 ? d[2] : 1
        c.hour = t.count > 0 ? t[0] : 12; c.minute = t.count > 1 ? t[1] : 0
        return utc.date(from: c) ?? Date()
    }

    static func ymd(_ date: Date) -> String {
        let c = utc.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 2000, c.month ?? 1, c.day ?? 1)
    }

    static func hm(_ date: Date) -> String {
        let c = utc.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", c.hour ?? 12, c.minute ?? 0)
    }

    static let range: ClosedRange<Date> = date(from: "1800-01-01", time: "00:00")...date(from: "2100-12-31", time: "23:59")
}
