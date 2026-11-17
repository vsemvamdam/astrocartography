import Foundation
import JavaScriptCore

enum EngineError: LocalizedError {
    case noContext
    case missing(String)
    case script(String, String)
    case api(String)
    case decode(String)

    var errorDescription: String? {
        switch self {
        case .noContext: return "Не удалось запустить движок расчётов."
        case .missing(let f): return "В приложении нет файла движка \(f).js."
        case .script(let f, let e): return "Ошибка в \(f).js: \(e)"
        case .api(let e): return "Ошибка расчёта: \(e)"
        case .decode(let e): return "Не удалось прочитать результат расчёта: \(e)"
        }
    }
}

private struct Envelope<T: Decodable>: Decodable {
    let ok: Bool
    let value: T?
    let error: String?
}

/// The site's astrology engine (js/*.js) running in JavaScriptCore. All the calculations are the site's own
/// code, so the app and the site give the same numbers. One JSContext, used from one serial queue.
final class AstroEngine: @unchecked Sendable {
    static let shared = AstroEngine()

    /// Load order: the prelude (window, atob), Astronomy Engine, the site's data and engine files, the bridge.
    static let files = ["prelude", "astronomy.browser.min", "data", "chiron-data", "asteroids-data", "tz-history", "meanings",
                        "acg-core", "natal", "features", "horary", "cycles", "interpret", "bridge"]

    private let queue = DispatchQueue(label: "astrosky.engine", qos: .userInitiated)
    private var context: JSContext?
    private var extraLoaded = false

    private func bundleURL(_ name: String) -> URL? {
        Bundle(for: AstroEngine.self).url(forResource: name, withExtension: "js")
            ?? Bundle.main.url(forResource: name, withExtension: "js")
    }

    private func evaluate(_ name: String, in c: JSContext) throws {
        guard let url = bundleURL(name), let src = try? String(contentsOf: url, encoding: .utf8) else { throw EngineError.missing(name) }
        var failure: String?
        c.exceptionHandler = { _, ex in failure = ex?.toString() ?? "неизвестная ошибка" }
        c.evaluateScript(src, withSourceURL: url)
        c.exceptionHandler = nil
        if let failure { throw EngineError.script(name, failure) }
    }

    private func loaded() throws -> JSContext {
        if let c = context { return c }
        guard let c = JSContext() else { throw EngineError.noContext }
        c.name = "AstroSky engine"
        for name in Self.files { try evaluate(name, in: c) }
        context = c
        return c
    }

    /// Eros, Psyche, Amor, Hygiea and Proserpina: their tables are large and loaded only when asked for.
    private func loadExtraIfNeeded(_ c: JSContext, _ json: String) throws {
        guard !extraLoaded, json.contains("\"asteroids2\":true") else { return }
        try evaluate("asteroids-extra-data", in: c)
        extraLoaded = true
    }

    private func callSync<T: Decodable>(_ fn: String, json: String) throws -> T {
        let c = try loaded()
        try loadExtraIfNeeded(c, json)
        guard let api = c.objectForKeyedSubscript("AstroAPI"), !api.isUndefined,
              let f = api.objectForKeyedSubscript(fn), !f.isUndefined else { throw EngineError.api("нет функции \(fn)") }
        guard let out = f.call(withArguments: [json])?.toString() else { throw EngineError.api("пустой ответ") }
        do {
            let env = try JSONDecoder().decode(Envelope<T>.self, from: Data(out.utf8))
            if env.ok, let v = env.value { return v }
            throw EngineError.api(env.error ?? "неизвестная ошибка")
        } catch let e as EngineError {
            throw e
        } catch {
            throw EngineError.decode(String(describing: error))
        }
    }

    func call<T: Decodable>(_ fn: String, json: String = "null") async throws -> T {
        try await withCheckedThrowingContinuation { cont in
            queue.async {
                do { cont.resume(returning: try self.callSync(fn, json: json)) }
                catch { cont.resume(throwing: error) }
            }
        }
    }

    func call<T: Decodable, A: Encodable>(_ fn: String, _ arg: A) async throws -> T {
        let data = try JSONEncoder().encode(arg)
        return try await call(fn, json: String(decoding: data, as: UTF8.self))
    }

    // MARK: API

    func chart(_ req: ChartRequest) async throws -> ChartResult { try await call("chart", req) }
    func cities() async throws -> [City] { try await call("cities") }
    func meta() async throws -> EngineMeta { try await call("meta") }

    /// Starts the engine in the background, so the first chart is quick.
    func warmUp() { queue.async { _ = try? self.loaded() } }
}
