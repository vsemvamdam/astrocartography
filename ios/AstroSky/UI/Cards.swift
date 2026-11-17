import SwiftUI

// MARK: - Reading

/// The reading in words. The natal reading is long and goes by tabs; the solar and lunar returns have
/// "Главное", "Важные точки" and "Планеты в домах" (Daragan's houses); a pair is read in one piece.
struct ReadingCard: View {
    let reading: Reading
    let mode: ChartMode
    @State private var tab = ""

    private var tabs: [(String, String)] {
        if reading.houses != nil { return [("main", "Главное"), ("points", "Важные точки"), ("houses", "Планеты в домах")] }
        if mode == .natal { return reading.sections.map { ($0.key, $0.title) } }
        return []
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 4) {
                Text(reading.title).font(.display(24)).foregroundStyle(Color.fg)
                Text(reading.sub).font(.footnote).foregroundStyle(Color.muted)
            }
            if !tabs.isEmpty { Pills(items: tabs, selection: Binding(get: { current }, set: { tab = $0 })) }
            content
        }
    }

    private var current: String { tabs.contains(where: { $0.0 == tab }) ? tab : (tabs.first?.0 ?? "") }

    @ViewBuilder private var content: some View {
        if reading.houses != nil {
            switch current {
            case "points": ItemsList(items: reading.points ?? [])
            case "houses": HousesReading(reading: reading)
            default: ForEach(reading.sections) { SectionView(section: $0, showTitle: true) }
            }
        } else if mode == .natal, let s = reading.sections.first(where: { $0.key == current }) ?? reading.sections.first {
            SectionView(section: s, showTitle: false)
        } else {
            ForEach(reading.sections) { SectionView(section: $0, showTitle: true) }
        }
    }
}

struct SectionView: View {
    let section: ReadingSection
    let showTitle: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if showTitle { Text(section.title).font(.display(19)).foregroundStyle(Color.brass).padding(.top, 6) }
            if let note = section.note { Text(note).font(.footnote).foregroundStyle(Color.muted) }
            ItemsList(items: section.items)
        }
    }
}

struct ItemsList: View {
    let items: [ReadingItem]
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(items.indices, id: \.self) { i in ItemRow(item: items[i]) }
        }
    }
}

struct ItemRow: View {
    let item: ReadingItem
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            GlyphBadge(glyph: item.glyph, color: item.tone.map { Color.aspect($0) } ?? Color(hex: item.color ?? "#D8A4A6"))
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.head).font(.subheadline.weight(.semibold)).foregroundStyle(Color.fg)
                Text(item.text).font(.subheadline).foregroundStyle(Color.fg.opacity(0.86)).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct GlyphBadge: View {
    let glyph: String
    let color: Color
    var size: CGFloat = 20

    var body: some View {
        if glyph == "ASC" || glyph == "MC" || glyph.count > 2 && glyph.unicodeScalars.first!.value < 0x2600 {
            Text(glyph).font(.mono(size * 0.55, weight: .semibold)).foregroundStyle(color)
        } else if let s = glyph.unicodeScalars.first, s.value < 0x2000, glyph.count <= 2, Int(glyph) == nil {
            Text(glyph).font(.system(size: size * 0.7, weight: .semibold)).foregroundStyle(color)
        } else {
            Text(glyphText(glyph)).font(.glyph(size)).foregroundStyle(color)
        }
    }
}

/// Solar and lunar returns: each house with its cusp, where it falls in the natal chart, and its planets.
struct HousesReading: View {
    let reading: Reading

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Каждый дом \(reading.housesGen ?? "") — сфера жизни \(reading.housesKind == "solar" ? "на этот год" : "на этот месяц"). По Дарагану угловые дома (I, IV, VII, X) проявляются сильнее всего, падающие (III, VI, IX, XII) — слабее. Цифра у планеты — её сила от −3 до +3. Дома: \(reading.housesSys ?? "").")
                .font(.footnote).foregroundStyle(Color.muted)
            ForEach(reading.houses ?? []) { x in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("\(x.roman) дом").font(.headline).foregroundStyle(Color.brass)
                        Text(x.topic).font(.subheadline).foregroundStyle(Color.fg)
                        Spacer()
                        Text(x.power).font(.caption).foregroundStyle(Color.muted)
                    }
                    Text("Куспид в \(x.cuspSignIn). \(x.cuspText)").font(.subheadline).foregroundStyle(Color.fg.opacity(0.9))
                    Text(x.projText).font(.footnote).foregroundStyle(Color.muted)
                    if x.planets.isEmpty {
                        Text(x.empty).font(.footnote).italic().foregroundStyle(Color.faint)
                    }
                    ForEach(x.planets, id: \.id) { p in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 8) {
                                Text(glyphText(p.glyph)).font(.glyph(18)).foregroundStyle(Color(hex: p.color))
                                Text(p.ru).font(.subheadline.weight(.semibold)).foregroundStyle(Color.fg)
                                if let s = p.score { ScoreBadge(score: s) }
                                Text("в \(p.signIn)\(p.retro ? ", ретроградный" : "")").font(.caption).foregroundStyle(Color.muted)
                            }
                            if let label = p.label {
                                Text("Влияние планеты: \(label)\(p.why.isEmpty ? "" : " · " + p.why.joined(separator: ", "))").font(.caption).foregroundStyle(Color.muted)
                            }
                            if let key = p.key { Text(key).font(.subheadline.weight(.medium)).foregroundStyle(Color.fg) }
                            Text(p.text).font(.subheadline).foregroundStyle(Color.fg.opacity(0.86)).fixedSize(horizontal: false, vertical: true)
                            Text("\(p.power) \(p.natText)").font(.caption).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(10)
                        .background(Color.raise.opacity(0.7), in: RoundedRectangle(cornerRadius: 10))
                    }
                }
                .padding(.bottom, 4)
                Divider().overlay(Color.rule)
            }
        }
    }
}

struct ScoreBadge: View {
    let score: Double
    var body: some View {
        let v = Int(score.rounded())
        Text(v > 0 ? "+\(v)" : v < 0 ? "−\(abs(v))" : "0")
            .font(.caption.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 1)
            .foregroundStyle(v > 0 ? Color.good : v < 0 ? Color.aspHard : Color.muted)
            .background((v > 0 ? Color.good : v < 0 ? Color.aspHard : Color.muted).opacity(0.15), in: Capsule())
    }
}

// MARK: - Solar return: the best cities

struct SolarCard: View {
    let info: SolarInfo
    let pick: (BestCity) -> Void

    var body: some View {
        Card(title: "Где встречать день рождения") {
            HStack {
                Text(info.place.name).foregroundStyle(Color.fg)
                Spacer()
                Text(Fmt.score(info.score)).font(.mono(17, weight: .semibold)).foregroundStyle(info.score < 0 ? Color.aspHard : Color.good)
            }
            Chips(parts: info.parts)
            Text("Лучшие города для этого соляра — нажмите, чтобы построить карту на город.").font(.footnote).foregroundStyle(Color.muted)
            let best = max(0.1, info.best.first?.score ?? 1)
            ForEach(info.best.indices, id: \.self) { i in
                let b = info.best[i]
                Button { pick(b) } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Text("\(i + 1)").font(.mono(13)).foregroundStyle(Color.muted).frame(width: 20)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(b.city.name).foregroundStyle(Color.fg)
                                Text(b.city.country ?? "").font(.caption).foregroundStyle(Color.muted)
                            }
                            Chips(parts: b.parts)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            Text(Fmt.score(b.score).replacingOccurrences(of: "+", with: "")).font(.mono(14, weight: .semibold)).foregroundStyle(Color.fg)
                            Capsule().fill(Color.brass).frame(width: max(6, 60 * b.score / best), height: 3)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct Chips: View {
    let parts: [ScorePart]
    var body: some View {
        if parts.isEmpty {
            Text("Нет сильных факторов").font(.caption).foregroundStyle(Color.muted)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(parts.indices, id: \.self) { i in
                        let p = parts[i]
                        HStack(spacing: 3) {
                            Text(glyphText(p.glyph)).font(.glyph(12)).foregroundStyle(Color(hex: p.color))
                            Text(p.label).font(.caption2)
                        }
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .foregroundStyle(p.neg ? Color.aspHard : Color.fg)
                        .background(Color.raise, in: Capsule())
                    }
                }
            }
        }
    }
}

// MARK: - Tables

struct PlanetsCard: View {
    let points: [ChartPoint]
    @Binding var highlight: String?
    var title = "Планеты"

    var body: some View {
        Card(title: title) {
            VStack(spacing: 0) {
                ForEach(points) { p in
                    PointRow(p: p, house: p.angle ? "" : Fmt.roman[safe: p.house], on: highlight == p.id)
                        .contentShape(Rectangle())
                        .onTapGesture { highlight = highlight == p.id ? nil : p.id }
                    Divider().overlay(Color.rule)
                }
            }
            Text("Нажмите на планету, чтобы выделить её аспекты на колесе.").font(.caption).foregroundStyle(Color.faint)
        }
    }
}

struct PartnerCard: View {
    let points: [ChartPoint]
    let name: String
    @Binding var highlight: String?

    var body: some View {
        Card(title: "Планеты: \(name)", trailing: "свой дом · в ваших") {
            VStack(spacing: 0) {
                ForEach(points) { p in
                    PointRow(p: p, house: "\(Fmt.roman[safe: p.house]) · \(Fmt.roman[safe: p.houseIn ?? 0])", on: highlight == "B:" + p.id, showDignity: false)
                        .contentShape(Rectangle())
                        .onTapGesture { highlight = highlight == "B:" + p.id ? nil : "B:" + p.id }
                    Divider().overlay(Color.rule)
                }
            }
        }
    }
}

struct PointRow: View {
    let p: ChartPoint
    let house: String
    var on = false
    var showDignity = true

    var body: some View {
        let ps = Fmt.pos(p.lon)
        HStack(spacing: 10) {
            GlyphBadge(glyph: p.glyph, color: Color(hex: p.color ?? "#D8A4A6"), size: 20).frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(p.ru).foregroundStyle(Color.fg)
                    if p.retro { Text("R").font(.caption.weight(.bold)).foregroundStyle(Color.danger) }
                }
                if showDignity && !p.dign.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(p.dign, id: \.k) { d in
                            Text(d.ru).font(.caption2)
                                .padding(.horizontal, 6).padding(.vertical, 1)
                                .foregroundStyle(d.k == "domicile" || d.k == "exalt" ? Color.good : Color.aspHard)
                                .background(Color.raise, in: Capsule())
                        }
                    }
                }
            }
            Spacer()
            HStack(spacing: 4) {
                Text(ps.text).font(.mono(14)).foregroundStyle(Color.fg)
                Text(glyphText(ps.glyph)).font(.glyph(15)).foregroundStyle(Color.element[ps.sign % 4])
            }
            Text(house).font(.mono(13)).foregroundStyle(Color.muted).frame(minWidth: 34, alignment: .trailing)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
        .background(on ? Color.brass.opacity(0.14) : Color.clear, in: RoundedRectangle(cornerRadius: 8))
    }
}

struct HousesCard: View {
    let chart: ChartData
    @EnvironmentObject var model: AppModel

    var body: some View {
        Card(title: "Дома", trailing: chart.houseSystemRu) {
            VStack(spacing: 0) {
                ForEach(0..<min(12, chart.cusps.count), id: \.self) { i in
                    let ps = Fmt.pos(chart.cusps[i])
                    HStack {
                        Text(Fmt.roman[i + 1]).font(.mono(14, weight: .semibold)).foregroundStyle(Color.brass).frame(width: 40, alignment: .leading)
                        Text([1: "ASC", 4: "IC", 7: "DSC", 10: "MC"][i + 1] ?? "").font(.caption2).foregroundStyle(Color.muted).frame(width: 32, alignment: .leading)
                        Text(ps.text).font(.mono(14)).foregroundStyle(Color.fg)
                        Text(glyphText(ps.glyph)).font(.glyph(15)).foregroundStyle(Color.element[ps.sign % 4])
                        Spacer()
                        HStack(spacing: 6) {
                            ForEach(rulers(ps.sign), id: \.self) { id in
                                let b = model.meta?.bodies.first(where: { $0.id == id })
                                Text(glyphText(b?.glyph ?? id)).font(.glyph(16)).foregroundStyle(Color(hex: b?.color ?? "#D8A4A6"))
                            }
                        }
                    }
                    .padding(.vertical, 7)
                    Divider().overlay(Color.rule)
                }
            }
        }
    }

    private func rulers(_ sign: Int) -> [String] {
        guard let r = model.meta?.rulers, sign < r.count else { return [] }
        return r[sign]
    }
}

struct AspectsCard: View {
    let aspects: [ChartAspect]
    let points: [ChartPoint]
    let outer: [ChartPoint]
    let partnerName: String
    let cross: Bool
    @Binding var highlight: String?

    var body: some View {
        let soft = aspects.filter { $0.kind == "soft" }.count, hard = aspects.filter { $0.kind == "hard" }.count
        Card(title: cross ? "Аспекты между картами" : "Аспекты",
             trailing: "\(aspects.count) \(Fmt.plural(aspects.count, "аспект", "аспекта", "аспектов"))\(cross ? " · гарм. \(soft), напр. \(hard)" : "")") {
            VStack(spacing: 0) {
                ForEach(aspects.indices, id: \.self) { i in
                    let x = aspects[i]
                    let a = points.first(where: { $0.id == x.a })
                    let b = (cross ? outer : points).first(where: { $0.id == x.b })
                    let dim = highlight != nil && x.a != highlight && x.b != highlight && "B:" + x.b != highlight
                    HStack(spacing: 8) {
                        GlyphBadge(glyph: a?.glyph ?? x.a, color: Color(hex: a?.color ?? "#D8A4A6"), size: 17).frame(width: 22)
                        Text(glyphText(x.glyph)).font(.glyph(16)).foregroundStyle(Color.aspect(x.kind)).frame(width: 20)
                        GlyphBadge(glyph: b?.glyph ?? x.b, color: Color(hex: b?.color ?? "#D8A4A6"), size: 17).frame(width: 22)
                        Text("\(a?.ru ?? x.a) — \(cross ? partnerName + ": " : "")\(b?.ru ?? x.b): \(x.ru.lowercased())")
                            .font(.footnote).foregroundStyle(Color.fg).lineLimit(2)
                        Spacer(minLength: 4)
                        Text("\(Fmt.orb(x.orb))\(x.applying == nil ? "" : x.applying! ? " сх" : " рх")").font(.mono(12)).foregroundStyle(Color.muted)
                    }
                    .padding(.vertical, 6)
                    .opacity(dim ? 0.35 : 1)
                    Divider().overlay(Color.rule)
                }
            }
            Text("сх — сходящийся, рх — расходящийся аспект").font(.caption).foregroundStyle(Color.faint)
        }
    }
}

struct BalanceCard: View {
    let chart: ChartData

    var body: some View {
        let planets = chart.points.filter { $0.planet }
        Card(title: "Стихии и кресты") {
            ForEach(0..<4, id: \.self) { i in
                row(Fmt.elements[i], Color.element[i], planets.filter { $0.sign % 4 == i })
            }
            Divider().overlay(Color.rule)
            ForEach(0..<3, id: \.self) { i in
                row(Fmt.crosses[i], Color.fg, planets.filter { $0.sign % 3 == i })
            }
            Text(chart.isDay ? "Дневная карта: Солнце над горизонтом. Считаются 10 планет." : "Ночная карта: Солнце под горизонтом. Считаются 10 планет.")
                .font(.footnote).foregroundStyle(Color.muted)
        }
    }

    private func row(_ name: String, _ color: Color, _ ps: [ChartPoint]) -> some View {
        HStack(spacing: 10) {
            Text(name).foregroundStyle(color).frame(width: 130, alignment: .leading)
            Text("\(ps.count)").font(.mono(15, weight: .semibold)).foregroundStyle(Color.fg).frame(width: 24)
            HStack(spacing: 4) {
                ForEach(ps) { p in Text(glyphText(p.glyph)).font(.glyph(16)).foregroundStyle(Color(hex: p.color ?? "#D8A4A6")) }
            }
            Spacer()
        }
    }
}

extension Array where Element == String {
    subscript(safe i: Int) -> String { indices.contains(i) ? self[i] : "" }
}
