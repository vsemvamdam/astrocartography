import SwiftUI
import UIKit

/// The chart as a PDF, like the site's "Скачать PDF": the wheel and the whole reading in words, no tables.
enum PDFBuilder {
    private enum Block {
        case heading(String)
        case note(String)
        case item(glyph: String, color: String?, head: String, text: String, indent: Bool)
        case house(String, String)
    }

    private static let ink = UIColor(Color(hex: "#1B2433"))
    private static let gray = UIColor(Color(hex: "#5E6D86"))
    private static let accent = UIColor(Color(hex: "#A8696C"))

    private static func serif(_ size: CGFloat, bold: Bool = false) -> UIFont {
        let base = UIFont.systemFont(ofSize: size, weight: bold ? .semibold : .regular)
        return UIFont(descriptor: base.fontDescriptor.withDesign(.serif) ?? base.fontDescriptor, size: size)
    }
    private static func sans(_ size: CGFloat, bold: Bool = false) -> UIFont { UIFont.systemFont(ofSize: size, weight: bold ? .semibold : .regular) }
    private static func glyphFont(_ size: CGFloat) -> UIFont { UIFont(name: "DejaVuSans", size: size) ?? sans(size) }

    private static func blocks(_ r: ChartResult) -> [Block] {
        var out: [Block] = []
        for s in r.reading.sections where !s.items.isEmpty {
            out.append(.heading(s.title))
            if let n = s.note { out.append(.note(n)) }
            for it in s.items { out.append(.item(glyph: it.glyph, color: it.tone.map(toneColor) ?? it.color, head: it.head, text: it.text, indent: false)) }
        }
        if let pts = r.reading.points, !pts.isEmpty {
            out.append(.heading("Важные точки"))
            for it in pts { out.append(.item(glyph: it.glyph, color: it.color, head: it.head, text: it.text, indent: false)) }
        }
        if let hs = r.reading.houses, !hs.isEmpty {
            out.append(.heading("Дома \(r.reading.housesGen ?? "")"))
            out.append(.note("Каждый дом — сфера жизни; строка «в натальной карте» показывает, где дела дадут последствия. Угловые дома (I, IV, VII, X) проявляются сильнее всего. Дома: \(r.reading.housesSys ?? "")."))
            for x in hs {
                out.append(.house("\(x.roman) дом — \(x.topic) (\(x.power))", "Куспид в \(x.cuspSignIn). \(x.cuspText) \(x.projText)\(x.planets.isEmpty ? " " + x.empty : "")"))
                for p in x.planets {
                    let sc = p.score.map { v -> String in let i = Int(v.rounded()); return " · сила \(i > 0 ? "+" : i < 0 ? "−" : "")\(abs(i))" } ?? ""
                    let infl = p.label.map { " Влияние планеты: \($0)\(p.why.isEmpty ? "" : " (" + p.why.joined(separator: ", ") + ")")." } ?? ""
                    out.append(.item(glyph: p.glyph, color: p.color, head: "\(p.ru)\(sc) · в \(p.signIn)\(p.retro ? ", ретроградный" : "")",
                                     text: "\(p.key.map { $0 + " " } ?? "")\(p.text) \(p.power) \(p.natText)\(infl)", indent: true))
                }
            }
        }
        return out
    }

    private static func toneColor(_ t: String) -> String { t == "soft" ? "#2E9E7A" : t == "hard" ? "#D9483B" : "#8A7A55" }

    @MainActor private static func wheelImage(_ r: ChartResult) -> UIImage? {
        let view = WheelView(chart: r.chart, outer: r.mode == .synastry ? r.outer : nil, cross: r.mode == .synastry ? r.cross : nil, printMode: true)
            .frame(width: 560, height: 560)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        return renderer.uiImage
    }

    @MainActor static func make(result r: ChartResult) -> URL? {
        let page = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)
        let margin: CGFloat = 50, width = page.width - 2 * margin, bottom = page.height - margin
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [kCGPDFContextTitle as String: "AstroSky — \(r.kind) — \(r.title)", kCGPDFContextCreator as String: "AstroSky"]
        let renderer = UIGraphicsPDFRenderer(bounds: page, format: format)
        let wheel = wheelImage(r)
        let items = blocks(r)

        let data = renderer.pdfData { ctx in
            var y = margin
            var pageNo = 0
            func footer() {
                let s = NSAttributedString(string: "AstroSky · \(pageNo)", attributes: [.font: sans(8), .foregroundColor: gray])
                s.draw(at: CGPoint(x: margin, y: page.height - margin + 18))
            }
            func newPage() { if pageNo > 0 { footer() }; ctx.beginPage(); pageNo += 1; y = margin }
            func height(_ s: NSAttributedString, _ w: CGFloat) -> CGFloat {
                ceil(s.boundingRect(with: CGSize(width: w, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil).height)
            }
            func put(_ s: NSAttributedString, x: CGFloat = margin, w: CGFloat = width, after: CGFloat = 6) {
                let h = height(s, w)
                if y + h > bottom { newPage() }
                s.draw(with: CGRect(x: x, y: y, width: w, height: h), options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
                y += h + after
            }
            let para: (CGFloat) -> NSMutableParagraphStyle = { spacing in let p = NSMutableParagraphStyle(); p.lineSpacing = spacing; return p }

            newPage()
            put(NSAttributedString(string: r.kind.uppercased(), attributes: [.font: sans(9, bold: true), .foregroundColor: accent, .kern: 1.4]), after: 4)
            put(NSAttributedString(string: r.title, attributes: [.font: serif(22), .foregroundColor: ink]), after: 4)
            put(NSAttributedString(string: r.sub, attributes: [.font: sans(9), .foregroundColor: gray, .paragraphStyle: para(1.5)]), after: 12)
            if let wheel {
                let side = min(width, 400)
                if y + side > bottom { newPage() }
                wheel.draw(in: CGRect(x: (page.width - side) / 2, y: y, width: side, height: side))
                y += side + 16
            }
            put(NSAttributedString(string: r.reading.title, attributes: [.font: serif(18), .foregroundColor: ink]), after: 2)
            put(NSAttributedString(string: r.reading.sub, attributes: [.font: sans(9.5), .foregroundColor: gray]), after: 10)

            for b in items {
                switch b {
                case .heading(let t):
                    if y + 60 > bottom { newPage() }
                    y += 6
                    put(NSAttributedString(string: t, attributes: [.font: serif(15, bold: true), .foregroundColor: accent]), after: 5)
                case .note(let t):
                    put(NSAttributedString(string: t, attributes: [.font: sans(9), .foregroundColor: gray, .paragraphStyle: para(1.5)]), after: 8)
                case .house(let head, let text):
                    let s = NSMutableAttributedString(string: head + "\n", attributes: [.font: sans(11, bold: true), .foregroundColor: ink])
                    s.append(NSAttributedString(string: text, attributes: [.font: sans(10), .foregroundColor: ink, .paragraphStyle: para(2)]))
                    if y + 40 > bottom { newPage() }
                    y += 4
                    put(s, after: 8)
                case .item(let glyph, let color, let head, let text, let indent):
                    let x0 = margin + (indent ? 16 : 0), gw: CGFloat = 20
                    let body = NSMutableAttributedString(string: head + "\n", attributes: [.font: sans(10.5, bold: true), .foregroundColor: ink])
                    body.append(NSAttributedString(string: text, attributes: [.font: sans(10), .foregroundColor: ink, .paragraphStyle: para(2)]))
                    let w = width - (x0 - margin) - gw
                    let h = height(body, w)
                    if y + h > bottom { newPage() }
                    if !glyph.isEmpty {
                        let gs = NSAttributedString(string: glyphText(glyph), attributes: [.font: glyph.count > 2 ? sans(8, bold: true) : glyphFont(12),
                                                                                         .foregroundColor: UIColor(Color(hex: color ?? "#A8696C"))])
                        gs.draw(at: CGPoint(x: x0, y: y))
                    }
                    body.draw(with: CGRect(x: x0 + gw, y: y, width: w, height: h), options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
                    y += h + 9
                }
            }
            footer()
        }

        let name = "AstroSky — \(r.kind) — \(r.title)".replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: ".")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(String(name.prefix(120)) + ".pdf")
        do { try data.write(to: url); return url } catch { return nil }
    }
}
