import SwiftUI

/// The site's palette (index.html :root) and fonts: dark night sky, dusty-rose accent.
extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        if s.count == 3 {
            let r = (v >> 8) & 0xF, g = (v >> 4) & 0xF, b = v & 0xF
            self.init(red: Double(r * 17) / 255, green: Double(g * 17) / 255, blue: Double(b * 17) / 255)
        } else {
            self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
        }
    }

    static let ink = Color(hex: "#070C16")
    static let panel = Color(hex: "#0A1322")
    static let raise = Color(hex: "#111C30")
    static let rule = Color(hex: "#1B2940")
    static let fg = Color(hex: "#E6ECF4")
    static let muted = Color(hex: "#93A1B7")
    static let faint = Color(hex: "#5E6D86")
    static let brass = Color(hex: "#D8A4A6")
    static let brassInk = Color(hex: "#2A1419")
    static let danger = Color(hex: "#FF8A7A")
    static let aspHard = Color(hex: "#FF6A5C")
    static let aspSoft = Color(hex: "#5C9DFF")
    static let aspMinor = Color(hex: "#7FD3A6")
    static let element = [Color(hex: "#F0805E"), Color(hex: "#9CC77A"), Color(hex: "#E6CB72"), Color(hex: "#62A9EF")]
    static let good = Color(hex: "#7FD3A6")

    static func aspect(_ kind: String) -> Color {
        switch kind {
        case "hard": return .aspHard
        case "soft": return .aspSoft
        case "minor": return .aspMinor
        default: return .brass
        }
    }
}

extension Font {
    static func display(_ size: CGFloat) -> Font { .system(size: size, weight: .regular, design: .serif) }
    /// Astrological glyphs: DejaVu Sans has all of them (♈…♓, ☉…♇, ⚳⚴⚵⚶⚷⚸) and never turns them into emoji.
    static func glyph(_ size: CGFloat) -> Font { .custom("DejaVuSans", size: size) }
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight, design: .monospaced) }
}

/// Text presentation selector: keeps ☉ ♈ and the like from being drawn as emoji.
func glyphText(_ s: String) -> String {
    guard let first = s.unicodeScalars.first, first.value >= 0x2600 else { return s }
    return s + "\u{FE0E}"
}

struct Card<Content: View>: View {
    var title: String?
    var trailing: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                HStack(alignment: .firstTextBaseline) {
                    Text(title).font(.display(22)).foregroundStyle(Color.fg)
                    Spacer()
                    if let trailing { Text(trailing).font(.footnote).foregroundStyle(Color.muted) }
                }
            }
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.panel.opacity(0.88), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.rule, lineWidth: 1))
    }
}

struct Kicker: View {
    let text: String
    var body: some View {
        Text(text.uppercased()).font(.system(size: 12, weight: .semibold)).tracking(1.6).foregroundStyle(Color.brass)
    }
}

/// A segmented choice in the site's style: rose pill on the selected one.
struct Pills<T: Hashable>: View {
    let items: [(T, String)]
    @Binding var selection: T

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items.indices, id: \.self) { i in
                    let item = items[i]
                    let on = item.0 == selection
                    Button { selection = item.0 } label: {
                        Text(item.1).font(.subheadline.weight(on ? .semibold : .regular))
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .foregroundStyle(on ? Color.brassInk : Color.fg)
                            .background(on ? Color.brass : Color.raise, in: Capsule())
                            .overlay(Capsule().stroke(on ? Color.clear : Color.rule, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 1)
        }
    }
}

/// The night sky behind every screen: stars from a fixed seed, so they don't jump between redraws.
struct StarField: View {
    var body: some View {
        Canvas { ctx, size in
            var rng = SeededRandom(seed: 20261117)
            let n = Int(size.width * size.height / 1800)
            for _ in 0..<n {
                let x = rng.next() * size.width, y = rng.next() * size.height
                let r = 0.3 + pow(rng.next(), 3) * 1.4
                let a = 0.25 + rng.next() * 0.6
                ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)), with: .color(.white.opacity(a)))
            }
        }
        .background(
            LinearGradient(colors: [Color(hex: "#0B1730"), Color.ink, Color(hex: "#05080F")], startPoint: .top, endPoint: .bottom)
        )
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

struct SeededRandom {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> Double {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return Double((state >> 11) & 0xFFFFFFFFFFFFF) / Double(0x10000000000000)
    }
}

extension View {
    /// The sky background and the dark look of the site.
    func astroScreen() -> some View {
        self.scrollContentBackground(.hidden)
            .background(StarField())
            .toolbarBackground(Color.ink.opacity(0.9), for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
    }
}
