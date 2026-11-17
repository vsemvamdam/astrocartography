import SwiftUI

/// The horoscope wheel, drawn like the site's SVG (natal-view.js renderWheel): a 1000×1000 layout in a
/// 1124-unit box, ASC on the left and the zodiac counter-clockwise; the partner's planets on an outer ring.
struct WheelView: View {
    let chart: ChartData
    var outer: [ChartPoint]? = nil
    var cross: [ChartAspect]? = nil
    var highlight: String? = nil
    var printMode = false

    private static let C = 500.0, R_OUT = 490.0, R_ZIN = 420.0, BOX = 1124.0, PAD = 62.0
    private struct Layout { let glyph, deg: Double; let min: Double?; let hout, hin: Double; var oglyph = 0.0, odeg = 0.0, sep = 0.0 }
    private static let lay1 = Layout(glyph: 373, deg: 331, min: 299, hout: 276, hin: 240)
    private static let lay2 = Layout(glyph: 312, deg: 279, min: nil, hout: 258, hin: 224, oglyph: 392, odeg: 359, sep: 338)

    var body: some View {
        Canvas { ctx, size in draw(ctx, size) }
            .aspectRatio(1, contentMode: .fit)
            .accessibilityLabel("Колесо карты")
    }

    // MARK: geometry

    static func houseOf(_ lon: Double, _ cusps: [Double]) -> Int {
        for h in 1...12 {
            let a = cusps[h - 1], b = cusps[h == 12 ? 0 : h]
            let span = Fmt.n360(b - a), d = Fmt.n360(lon - a)
            if d < span || (span == 0 && d == 0) { return h }
        }
        return 1
    }

    struct Slot { let p: ChartPoint; let d: Double; let kg: Double; let kl: Double }

    /// Glyphs stay inside their house; crowded houses shrink them (pool-adjacent-violators, as on the site).
    static func spread(_ points: [ChartPoint], minSep: Double, cusps: [Double]) -> [Slot] {
        var out: [Slot] = []
        let kMin = 0.55
        for h in 1...12 {
            let lo = cusps[h - 1], width = Fmt.n360(cusps[h == 12 ? 0 : h] - lo)
            let list = points.filter { houseOf($0.lon, cusps) == h }
                .map { (p: $0, a: lo + Fmt.n360($0.lon - lo)) }
                .sorted { $0.a < $1.a }
            let n = list.count
            if n == 0 { continue }
            let s = min(minSep, width / Double(n))
            let kg = max(kMin, min(1, s / (0.7 * minSep))), kl = max(kMin, min(1, s / (0.9 * minSep)))
            let from = lo + s / 2, to = lo + width - s / 2 - Double(n - 1) * s
            var blocks: [(v: Double, w: Int)] = []
            for (i, x) in list.enumerated() {
                blocks.append((x.a - Double(i) * s, 1))
                while blocks.count > 1 && blocks[blocks.count - 2].v > blocks[blocks.count - 1].v {
                    let b = blocks.removeLast(), a = blocks.removeLast()
                    blocks.append(((a.v * Double(a.w) + b.v * Double(b.w)) / Double(a.w + b.w), a.w + b.w))
                }
            }
            var i = 0
            for b in blocks {
                let e = min(to, max(from, b.v))
                for _ in 0..<b.w {
                    out.append(Slot(p: list[i].p, d: e + Double(i) * s, kg: kg, kl: kl))
                    i += 1
                }
            }
        }
        return out
    }

    /// A planet colour that stays readable on white: light colours are darkened, keeping their hue.
    static func inkOnPaper(_ hex: String) -> Color {
        var s = hex; if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        var r = Double((v >> 16) & 0xFF) / 255, g = Double((v >> 8) & 0xFF) / 255, b = Double(v & 0xFF) / 255
        let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if lum > 0.55 { let k = 0.55 / lum; r *= k; g *= k; b *= k }
        return Color(red: r, green: g, blue: b)
    }

    // MARK: drawing

    private func draw(_ ctx: GraphicsContext, _ size: CGSize) {
        let k = min(size.width, size.height) / Self.BOX
        let asc = chart.asc
        let L = outer != nil ? Self.lay2 : Self.lay1
        let C = Self.C
        func xy(_ lon: Double, _ r: Double) -> CGPoint {
            let a = (180 + Fmt.n360(lon - asc)) * .pi / 180
            return CGPoint(x: (C + r * cos(a) + Self.PAD) * k, y: (C - r * sin(a) + Self.PAD) * k)
        }
        func circle(_ r: Double) -> Path {
            let c = CGPoint(x: (C + Self.PAD) * k, y: (C + Self.PAD) * k)
            return Path(ellipseIn: CGRect(x: c.x - r * k, y: c.y - r * k, width: 2 * r * k, height: 2 * r * k))
        }
        func line(_ a: CGPoint, _ b: CGPoint, _ color: Color, _ w: Double, dash: [CGFloat] = [], opacity: Double = 1) {
            var p = Path(); p.move(to: a); p.addLine(to: b)
            ctx.stroke(p, with: .color(color.opacity(opacity)), style: StrokeStyle(lineWidth: w * k, lineCap: .round, dash: dash.map { $0 * k }))
        }
        func text(_ s: String, at p: CGPoint, font: Font, color: Color, opacity: Double = 1) {
            ctx.draw(Text(s).font(font).foregroundColor(color.opacity(opacity)), at: p, anchor: .center)
        }

        let ringColor = printMode ? Color(hex: "#B9C2D0") : Color(hex: "#2A3B58")
        let softColor = printMode ? Color(hex: "#D5DBE4") : Color(hex: "#22314A")
        let fg = printMode ? Color(hex: "#1B2433") : Color.fg
        let muted = printMode ? Color(hex: "#5E6D86") : Color.muted
        let brass = printMode ? Color(hex: "#A8696C") : Color.brass
        func pc(_ hex: String?) -> Color { printMode ? Self.inkOnPaper(hex ?? "#D8A4A6") : Color(hex: hex ?? "#D8A4A6") }

        ctx.fill(circle(Self.R_OUT), with: .color(printMode ? .white : Color.panel))
        ctx.stroke(circle(Self.R_OUT), with: .color(ringColor), lineWidth: 1.5 * k)
        ctx.fill(circle(Self.R_ZIN), with: .color(printMode ? .white : Color.ink))

        // signs
        for s in 0..<12 {
            let a0 = Double(s) * 30, el = s % 4
            var sector = Path()
            let steps = 24
            for i in 0...steps {
                let p = xy(a0 + 30 * Double(i) / Double(steps), Self.R_OUT)
                if i == 0 { sector.move(to: p) } else { sector.addLine(to: p) }
            }
            for i in stride(from: steps, through: 0, by: -1) { sector.addLine(to: xy(a0 + 30 * Double(i) / Double(steps), Self.R_ZIN)) }
            sector.closeSubpath()
            ctx.fill(sector, with: .color(Color.element[el].opacity(printMode ? 0.12 : 0.07)))
            line(xy(a0, Self.R_OUT), xy(a0, Self.R_ZIN), ringColor, 1.2)
            text(glyphText(Fmt.signGlyphs[s]), at: xy(a0 + 15, (Self.R_OUT + Self.R_ZIN) / 2), font: .glyph(40 * k), color: Color.element[el])
        }
        ctx.stroke(circle(Self.R_ZIN), with: .color(ringColor), lineWidth: 1.2 * k)

        // degree ticks
        var ticks = Path()
        for d in 0..<360 {
            let len = d % 10 == 0 ? 15.0 : d % 5 == 0 ? 10.0 : 5.0
            ticks.move(to: xy(Double(d), Self.R_ZIN)); ticks.addLine(to: xy(Double(d), Self.R_ZIN - len))
        }
        ctx.stroke(ticks, with: .color(printMode ? Color(hex: "#9AA6B8") : Color(hex: "#3A4D6E")), lineWidth: 1 * k)

        if outer != nil { ctx.stroke(circle(L.sep), with: .color(softColor), lineWidth: 1 * k) }
        ctx.stroke(circle(L.hout), with: .color(softColor), lineWidth: 1 * k)
        ctx.stroke(circle(L.hin), with: .color(softColor), lineWidth: 1 * k)

        // houses
        let cusps = chart.cusps
        if cusps.count == 12 {
            for h in 1...12 {
                let cu = cusps[h - 1], axis = h == 1 || h == 4 || h == 7 || h == 10
                line(xy(cu, L.hin), xy(cu, Self.R_ZIN), axis ? brass : (printMode ? Color(hex: "#9AA6B8") : Color(hex: "#3C5070")), axis ? 2.2 : 1)
                let next = cusps[h == 12 ? 0 : h]
                text("\(h)", at: xy(cu + Fmt.n360(next - cu) / 2, (L.hout + L.hin) / 2), font: .mono(21 * k), color: muted)
            }
        }
        for (lon, lab) in [(chart.asc, "ASC"), (chart.mc, "MC"), (chart.asc + 180, "DSC"), (chart.mc + 180, "IC")] {
            line(xy(lon, Self.R_OUT), xy(lon, Self.R_OUT + 16), brass, 2.2)
            text(lab, at: xy(lon, Self.R_OUT + 36), font: .mono(25 * k, weight: .medium), color: brass)
        }

        // aspects
        let aspects = outer != nil ? (cross ?? []) : chart.aspects
        for x in aspects where x.angle != 0 {
            let dim = highlight != nil && x.a != highlight && x.b != highlight && "B:" + x.b != highlight
            let w = max(0.8, 3 * (1 - x.orb / max(0.01, x.maxOrb))) + (x.kind == "minor" ? 0 : 0.6)
            line(xy(x.aLon, L.hin), xy(x.bLon, L.hin), Color.aspect(x.kind), w, dash: x.kind == "minor" ? [7, 6] : [], opacity: dim ? 0.12 : 0.9)
        }

        func related(_ id: String, _ other: String) -> Bool {
            aspects.contains { ($0.a == id && ($0.b == other || "B:" + $0.b == other)) || (($0.b == id || "B:" + $0.b == id) && $0.a == other) }
        }

        // the chart's own planets
        for slot in Self.spread(chart.points, minSep: outer != nil ? 9 : 8, cusps: cusps) {
            let p = slot.p
            let dim = highlight != nil && highlight != p.id && !related(highlight!, p.id)
            let op = dim ? 0.25 : 1
            let col = pc(p.color)
            let ps = Fmt.pos(p.lon)
            let t1 = outer != nil ? xy(p.lon, L.sep) : xy(p.lon, Self.R_ZIN)
            let t2 = outer != nil ? xy(p.lon, L.sep - 12) : xy(p.lon, Self.R_ZIN - 16)
            line(t1, t2, col, 2.5, opacity: op)
            line(t2, xy(slot.d, L.glyph + 24 * slot.kg), col, 1, opacity: 0.5 * op)
            if highlight == p.id {
                let c = xy(slot.d, L.glyph), r = 28 * slot.kg * k
                ctx.stroke(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)), with: .color(brass), lineWidth: 2 * k)
            }
            let glyphFont: Font = p.short ? .system(size: 30 * slot.kg * k, weight: .semibold) : .glyph(46 * slot.kg * k)
            text(glyphText(p.glyph), at: xy(slot.d, L.glyph), font: glyphFont, color: col, opacity: op)
            if let lmin = L.min {
                text("\(ps.deg)°", at: xy(slot.d, L.deg), font: .mono(23 * slot.kl * k, weight: .medium), color: fg, opacity: op)
                let m = String(format: "%02d′", ps.min)
                if p.retro {
                    let t = Text(m).font(.mono(18 * slot.kl * k)).foregroundColor(muted.opacity(op))
                        + Text("R").font(.mono(18 * slot.kl * k, weight: .semibold)).foregroundColor(Color.danger.opacity(op))
                    ctx.draw(t, at: xy(slot.d, lmin), anchor: .center)
                } else {
                    text(m, at: xy(slot.d, lmin), font: .mono(18 * slot.kl * k), color: muted, opacity: op)
                }
            } else {
                let t = Text("\(ps.deg)°\(String(format: "%02d", ps.min))").font(.mono(19 * slot.kl * k, weight: .medium)).foregroundColor(fg.opacity(op))
                    + Text(p.retro ? "R" : "").font(.mono(19 * slot.kl * k, weight: .semibold)).foregroundColor(Color.danger.opacity(op))
                ctx.draw(t, at: xy(slot.d, L.deg), anchor: .center)
            }
            let e = xy(p.lon, L.hin), r = 3.2 * k
            ctx.fill(Path(ellipseIn: CGRect(x: e.x - r, y: e.y - r, width: 2 * r, height: 2 * r)), with: .color(col.opacity(op)))
        }

        // the partner's planets on the outer ring, inside the houses of your chart
        if let outer {
            for slot in Self.spread(outer, minSep: 8.5, cusps: cusps) {
                let p = slot.p
                let key = "B:" + p.id
                let dim = highlight != nil && highlight != key && !related(highlight!, key)
                let op = dim ? 0.25 : 1
                let col = pc(p.color)
                let ps = Fmt.pos(p.lon)
                line(xy(p.lon, Self.R_ZIN), xy(p.lon, Self.R_ZIN - 10), col, 2.5, opacity: op)
                let glyphFont: Font = p.short ? .system(size: 26 * slot.kg * k, weight: .semibold) : .glyph(38 * slot.kg * k)
                text(glyphText(p.glyph), at: xy(slot.d, L.oglyph), font: glyphFont, color: col, opacity: op)
                let t = Text("\(ps.deg)°\(String(format: "%02d", ps.min))").font(.mono(19 * slot.kl * k, weight: .medium)).foregroundColor(fg.opacity(op))
                    + Text(p.retro ? "R" : "").font(.mono(19 * slot.kl * k, weight: .semibold)).foregroundColor(Color.danger.opacity(op))
                ctx.draw(t, at: xy(slot.d, L.odeg), anchor: .center)
                let e = xy(p.lon, L.hin), r = 3.4 * k
                ctx.stroke(Path(ellipseIn: CGRect(x: e.x - r, y: e.y - r, width: 2 * r, height: 2 * r)), with: .color(col.opacity(op)), lineWidth: 1.6 * k)
            }
        }
    }
}

/// Full-screen wheel: pinch to zoom, drag to move, double tap to zoom in and out.
struct ZoomWheel: View {
    let result: ChartResult
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                WheelView(chart: result.chart, outer: result.mode == .synastry ? result.outer : nil, cross: result.mode == .synastry ? result.cross : nil)
                    .frame(width: geo.size.width, height: geo.size.width)
                    .scaleEffect(scale)
                    .offset(offset)
                    .frame(width: geo.size.width, height: geo.size.height)
                    .contentShape(Rectangle())
                    .gesture(
                        MagnifyGesture()
                            .onChanged { v in scale = max(1, min(6, lastScale * v.magnification)) }
                            .onEnded { _ in lastScale = scale; if scale == 1 { offset = .zero; lastOffset = .zero } }
                            .simultaneously(with: DragGesture()
                                .onChanged { v in
                                    guard scale > 1 else { return }
                                    offset = CGSize(width: lastOffset.width + v.translation.width, height: lastOffset.height + v.translation.height)
                                }
                                .onEnded { _ in lastOffset = offset })
                    )
                    .onTapGesture(count: 2) {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            if scale > 1 { scale = 1; offset = .zero } else { scale = 2.5 }
                            lastScale = scale; lastOffset = offset
                        }
                    }
            }
            .astroScreen()
            .navigationTitle(result.kind)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
        }
    }
}
