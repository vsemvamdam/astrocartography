import SwiftUI

/// Which group of charts a tab shows: the natal chart, the returns (solar, lunar), or a pair.
enum ChartGroup {
    case natal, returns, pair

    var modes: [(ChartMode, String)] {
        switch self {
        case .natal: return [(.natal, "Натальная")]
        case .returns: return [(.solar, "Соляр"), (.lunar, "Лунар")]
        case .pair: return [(.synastry, "Синастрия"), (.composite, "Композит")]
        }
    }
}

/// One chart on screen: header, controls of the mode, the wheel, the reading and the tables.
struct ChartScreen: View {
    let group: ChartGroup
    @EnvironmentObject var model: AppModel

    @State private var mode: ChartMode
    @State private var solarYear: Int?
    @State private var solarPlace: Place?
    @State private var lunarAt: Double?
    @State private var lunarPlace: Place?
    @State private var result: ChartResult?
    @State private var error: String?
    @State private var busy = false
    @State private var highlight: String?
    @State private var zoom = false
    @State private var pickPlace: PlaceTarget?
    @State private var share: ShareItem?
    @State private var editPartner = false

    enum PlaceTarget: String, Identifiable { case solar, lunar; var id: String { rawValue } }

    init(group: ChartGroup) {
        self.group = group
        var m = group.modes[0].0
        if let s = Demo.value("-mode"), let dm = ChartMode(rawValue: s), group.modes.contains(where: { $0.0 == dm }) { m = dm }
        _mode = State(initialValue: m)
    }

    private var request: ChartRequest? {
        guard let me = model.me else { return nil }
        if (mode == .synastry || mode == .composite) && model.partner == nil { return nil }
        return ChartRequest(mode: mode, person: me, partner: model.partner, opts: model.options,
                            solar: mode == .solar ? SolarRequest(year: solarYear, place: solarPlace) : nil,
                            lunar: mode == .lunar ? LunarRequest(at: lunarAt, place: lunarPlace) : nil)
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if group.modes.count > 1 {
                        Pills(items: group.modes, selection: $mode)
                    }
                    if group == .pair && model.partner == nil {
                        partnerPrompt
                    } else if let r = result {
                        header(r)
                        controls(r)
                        wheel(r)
                        ReadingCard(reading: r.reading, mode: r.mode).id("reading")
                        if let s = r.solar { SolarCard(info: s) { solarPlace = $0.city } }
                        tables(r).id("tables")
                    } else if let error {
                        Card(title: "Не получилось") { Text(error).foregroundStyle(Color.danger) }
                    } else {
                        ProgressView("Считаем карту…").tint(Color.brass).foregroundStyle(Color.muted)
                            .frame(maxWidth: .infinity, minHeight: 300)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .onChange(of: result) { _, new in
                guard new != nil, let target = Demo.value("-scroll") else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { proxy.scrollTo(target, anchor: .top) }
            }
        }
        .astroScreen()
        .navigationTitle(result?.kind ?? mode.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { makePDF() } label: {
                    if busy { ProgressView() } else { Label("PDF", systemImage: "square.and.arrow.up") }
                }
                .disabled(result == nil || busy)
            }
        }
        .task(id: request) { await compute() }
        .sheet(isPresented: $zoom) { if let r = result { ZoomWheel(result: r) } }
        .sheet(item: $pickPlace) { target in
            CityPicker(title: target == .solar ? "Где вы на день рождения" : "Где вы в момент лунара") { place in
                if target == .solar { solarPlace = place } else { lunarPlace = place }
            }
        }
        .sheet(item: $share) { item in ShareSheet(items: [item.url]) }
        .sheet(isPresented: $editPartner) {
            PersonEditor(title: "Партнёр", person: model.partner) { p in model.partner = p; model.savePerson(p) }
        }
    }

    private func compute() async {
        guard let req = request else { result = nil; return }
        do {
            let r = try await AstroEngine.shared.chart(req)
            if Task.isCancelled { return }
            result = r
            error = nil
            if let h = highlight, !r.chart.points.contains(where: { $0.id == h }) && !(r.outer ?? []).contains(where: { "B:" + $0.id == h }) { highlight = nil }
        } catch {
            if Task.isCancelled { return }
            self.error = error.localizedDescription
        }
    }

    private func makePDF() {
        guard let r = result else { return }
        busy = true
        Task { @MainActor in
            defer { busy = false }
            if let url = PDFBuilder.make(result: r) { share = ShareItem(url: url) }
        }
    }

    // MARK: blocks

    private var partnerPrompt: some View {
        Card(title: "Добавьте партнёра") {
            Text("Синастрия сравнивает две карты, композит строит одну карту пары по средним точкам. Нужны дата, время и место рождения второго человека.")
                .foregroundStyle(Color.muted)
            Button { editPartner = true } label: {
                Label("Данные партнёра", systemImage: "person.badge.plus").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).tint(Color.brass).foregroundStyle(Color.brassInk)
        }
    }

    private func header(_ r: ChartResult) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Kicker(text: r.kind)
            Text(r.title).font(.display(26)).foregroundStyle(Color.fg).fixedSize(horizontal: false, vertical: true)
            Text(r.sub).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            if r.gap || r.ambiguous {
                Text(r.gap ? "В этот день часы переводили вперёд, и такого времени не было: взято время по смещению до перевода."
                           : "В этот день часы переводили назад, и это время было дважды: взято первое.")
                    .font(.footnote).foregroundStyle(Color.danger)
            }
            if !r.chart.note.isEmpty { Text(r.chart.note).font(.footnote).foregroundStyle(Color.danger) }
        }
        .padding(.top, 4)
    }

    @ViewBuilder private func controls(_ r: ChartResult) -> some View {
        if r.mode == .solar, let s = r.solar {
            Card {
                HStack {
                    Button { solarYear = s.year - 1 } label: { Image(systemName: "chevron.left") }
                    Spacer()
                    VStack(spacing: 2) {
                        Text("Соляр \(String(s.year))").font(.headline).foregroundStyle(Color.fg)
                        Text(s.local).font(.caption).foregroundStyle(Color.muted)
                    }
                    Spacer()
                    Button { solarYear = s.year + 1 } label: { Image(systemName: "chevron.right") }
                }
                .tint(Color.brass)
                placeRow(s.place, home: solarPlace == nil, target: .solar) { solarPlace = nil }
            }
        } else if r.mode == .lunar, let l = r.lunar {
            Card {
                HStack {
                    Button { lunarAt = l.utc - 60_000 } label: { Image(systemName: "chevron.left") }
                    Spacer()
                    VStack(spacing: 2) {
                        Text(l.local).font(.headline).foregroundStyle(Color.fg)
                        Text("до \(l.nextLocal)").font(.caption).foregroundStyle(Color.muted)
                    }
                    Spacer()
                    Button { lunarAt = l.next + 3_600_000 } label: { Image(systemName: "chevron.right") }
                }
                .tint(Color.brass)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(l.list) { it in
                            Button { lunarAt = it.utc + 3_600_000 } label: {
                                VStack(spacing: 2) {
                                    Text(it.date).font(.caption.weight(.semibold))
                                    Text("\(it.wd), \(it.time)").font(.caption2)
                                }
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .foregroundStyle(it.current ? Color.brassInk : Color.fg)
                                .background(it.current ? Color.brass : Color.raise, in: RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                HStack {
                    placeRow(l.place, home: lunarPlace == nil, target: .lunar) { lunarPlace = nil }
                    if lunarAt != nil {
                        Button("Сейчас") { lunarAt = nil }.font(.footnote).tint(Color.brass)
                    }
                }
            }
        }
    }

    private func placeRow(_ place: Place, home: Bool, target: PlaceTarget, reset: @escaping () -> Void) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "mappin.and.ellipse").foregroundStyle(Color.brass)
            VStack(alignment: .leading, spacing: 1) {
                Text(place.name).foregroundStyle(Color.fg)
                Text(home ? "место рождения" : (place.country ?? "")).font(.caption).foregroundStyle(Color.muted)
            }
            Spacer()
            if !home { Button("Дом", action: reset).font(.footnote).tint(Color.brass) }
            Button("Изменить") { pickPlace = target }.font(.footnote).tint(Color.brass)
        }
    }

    private func wheel(_ r: ChartResult) -> some View {
        WheelView(chart: r.chart, outer: r.mode == .synastry ? r.outer : nil, cross: r.mode == .synastry ? r.cross : nil, highlight: highlight)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
            .onTapGesture { zoom = true }
            .overlay(alignment: .bottomTrailing) {
                Image(systemName: "arrow.up.left.and.arrow.down.right").font(.caption).foregroundStyle(Color.muted)
                    .padding(8).background(Color.raise.opacity(0.8), in: Circle())
            }
    }

    @ViewBuilder private func tables(_ r: ChartResult) -> some View {
        PlanetsCard(points: r.chart.points + (model.options.angles ? r.chart.angles : []), highlight: $highlight,
                    title: r.mode == .synastry ? "Ваши планеты" : "Планеты")
        if r.mode == .synastry, let outer = r.outer {
            PartnerCard(points: outer, name: model.partner?.name ?? "Партнёр", highlight: $highlight)
        }
        if r.mode != .synastry { HousesCard(chart: r.chart) }
        AspectsCard(aspects: r.mode == .synastry ? (r.cross ?? []) : r.chart.aspects, points: r.chart.points + r.chart.angles,
                    outer: r.outer ?? [], partnerName: model.partner?.name ?? "Партнёр", cross: r.mode == .synastry, highlight: $highlight)
        if r.mode != .synastry { BalanceCard(chart: r.chart) }
    }
}

struct ShareItem: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}
