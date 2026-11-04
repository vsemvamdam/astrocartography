"""Builds compact map + city data for the astrocartography page.

Output: data.js defining window.ACG_DATA = {land110, land50, land10, borders50,
borders10, lakes, cities, countries, tzs}.
Rings/lines are Google-polyline encoded (lat,lon) and joined by spaces.
"""
import json, sys, math

NE = sys.argv[1]  # path to natural-earth-vector/geojson
OUT = sys.argv[2]


def load(name):
    with open(f"{NE}/{name}.geojson", encoding="utf-8") as f:
        return json.load(f)["features"]


def rings_of(geom):
    t = geom["type"]
    if t == "Polygon":
        return list(geom["coordinates"])
    if t == "MultiPolygon":
        return [r for poly in geom["coordinates"] for r in poly]
    if t == "LineString":
        return [geom["coordinates"]]
    if t == "MultiLineString":
        return list(geom["coordinates"])
    return []


def dp(points, tol):
    """Iterative Douglas-Peucker."""
    n = len(points)
    if n < 3 or tol <= 0:
        return points
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    t2 = tol * tol
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            if L == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / L
                t = max(0, min(1, t))
                d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d > best:
                best, bi = d, i
        if best > t2:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(points, keep) if k]


def enc_num(v):
    v = ~(v << 1) if v < 0 else (v << 1)
    out = []
    while v >= 0x20:
        out.append(chr((0x20 | (v & 0x1F)) + 63))
        v >>= 5
    out.append(chr(v + 63))
    return "".join(out)


def encode_rings(rings, tol, q, closed, min_extent=0.0):
    parts = []
    npts = 0
    for r in rings:
        if closed and min_extent > 0:
            xs = [p[0] for p in r]
            ys = [p[1] for p in r]
            if max(xs) - min(xs) < min_extent and max(ys) - min(ys) < min_extent:
                continue
        s = dp([(p[0], p[1]) for p in r], tol)
        pts = []
        last = None
        for x, y in s:
            qp = (round(y * q), round(x * q))
            if qp != last:
                pts.append(qp)
                last = qp
        if len(pts) < (4 if closed else 2):
            continue
        out = []
        py = px = 0
        for y, x in pts:
            out.append(enc_num(y - py))
            out.append(enc_num(x - px))
            py, px = y, x
        parts.append("".join(out))
        npts += len(pts)
    return " ".join(parts), npts


res = {}
stats = {}
for key, name, tol, q, closed, mine in [
    ("land110", "ne_110m_land", 0.0, 100, True, 0),
    ("land50", "ne_50m_land", 0.02, 100, True, 0.05),
    ("land10", "ne_10m_land", 0.006, 1000, True, 0.02),
    ("borders50", "ne_50m_admin_0_boundary_lines_land", 0.03, 100, False, 0),
    ("borders10", "ne_10m_admin_0_boundary_lines_land", 0.006, 1000, False, 0),
]:
    rings = [r for f in load(name) for r in rings_of(f["geometry"])]
    s, n = encode_rings(rings, tol, q, closed, mine)
    res[key] = s
    stats[key] = (n, len(s))

# Lakes: only the larger ones (scalerank <= 4 keeps Baikal, Ladoga, Great Lakes, Victoria...)
lake_rings = []
for f in load("ne_50m_lakes"):
    p = f["properties"]
    if (p.get("scalerank") or 9) <= 4:
        lake_rings += rings_of(f["geometry"])
res["lakes"], n = encode_rings(lake_rings, 0.02, 100, True, 0.1)
stats["lakes"] = (n, len(res["lakes"]))

# Countries (Russian names)
cname = {}
for f in load("ne_50m_admin_0_countries"):
    p = f["properties"]
    for k in ("ADM0_A3", "SOV_A3", "ISO_A3", "ADM0_A3_US"):
        if p.get(k) and p.get("NAME_RU"):
            cname.setdefault(p[k], p["NAME_RU"])

# --- Timezone repair -------------------------------------------------------
# Natural Earth's TIMEZONE field is sometimes empty, sometimes coarse (Tomsk listed
# as Krasnoyarsk, Astana as Qyzylorda), and in a few capitals plainly wrong.
# Birth-time conversion depends on the exact IANA zone history, so fix by region.
RU = {
    "Tomsk": "Asia/Tomsk", "Kemerovo": "Asia/Novokuznetsk", "Altay": "Asia/Barnaul",
    "Gorno-Altay": "Asia/Barnaul", "Chita": "Asia/Chita", "Aga Buryat": "Asia/Chita",
    "Ul'yanovsk": "Europe/Ulyanovsk", "Saratov": "Europe/Saratov", "Astrakhan'": "Europe/Astrakhan",
    "Kirov": "Europe/Kirov", "Moskva": "Europe/Moscow", "Maga Buryatdan": "Asia/Magadan",
    "Chukchi Autonomous Okrug": "Asia/Anadyr", "Koryak": "Asia/Kamchatka", "Kamchatka": "Asia/Kamchatka",
    "Evenk": "Asia/Krasnoyarsk", "Taymyr": "Asia/Krasnoyarsk", "Krasnoyarsk": "Asia/Krasnoyarsk",
    "Khakass": "Asia/Krasnoyarsk", "Tuva": "Asia/Krasnoyarsk", "Novosibirsk": "Asia/Novosibirsk",
    "Omsk": "Asia/Omsk", "Khanty-Mansiy": "Asia/Yekaterinburg", "Yamal-Nenets": "Asia/Yekaterinburg",
    "Sverdlovsk": "Asia/Yekaterinburg", "Buryat": "Asia/Irkutsk", "Irkutsk": "Asia/Irkutsk",
    "Ust-Orda Buryat": "Asia/Irkutsk", "Amur": "Asia/Yakutsk", "Primor'ye": "Asia/Vladivostok",
    "Yevrey": "Asia/Vladivostok", "Samara": "Europe/Samara", "Udmurt": "Europe/Samara",
    "Volgograd": "Europe/Volgograd", "Kaliningrad": "Europe/Kaliningrad", "Crimea": "Europe/Simferopol",
}
RU_MOSCOW_DEFAULT = {"Arkhangel'sk", "Nenets", "Komi", "Murmansk", "Penza", "Tatarstan", "Belgorod",
                     "Krasnodar", "Dagestan", "Novgorod"}
KZ = {
    "Almaty": "Asia/Almaty", "Aqmola": "Asia/Almaty", "East Kazakhstan": "Asia/Almaty",
    "North Kazakhstan": "Asia/Almaty", "Pavlodar": "Asia/Almaty", "Qaraghandy": "Asia/Almaty",
    "South Kazakhstan": "Asia/Almaty", "Zhambyl": "Asia/Almaty", "Aqtöbe": "Asia/Aqtobe",
    "Atyrau": "Asia/Atyrau", "Mangghystau": "Asia/Aqtau", "Aqt": "Asia/Aqtau",
    "Qostanay": "Asia/Qostanay", "Qyzylorda": "Asia/Qyzylorda", "West Kazakhstan": "Asia/Oral",
}
ID = {"Bali": "Asia/Makassar", "Nusa Tenggara Barat": "Asia/Makassar", "Nusa Tenggara Timur": "Asia/Makassar",
      "Kalimantan Selatan": "Asia/Makassar", "Kalimantan Timur": "Asia/Makassar", "Jawa Timur": "Asia/Jakarta",
      "Kepulauan Riau": "Asia/Jakarta", "Sulawesi Selatan": "Asia/Makassar", "Sulawesi Tenggara": "Asia/Makassar",
      "Papua": "Asia/Jayapura", "Maluku Utara": "Asia/Jayapura"}
COUNTRY_TZ = {  # single-zone countries where NE has stray values
    "Paraguay": "America/Asuncion", "El Salvador": "America/El_Salvador", "Czech Republic": "Europe/Prague",
    "Czechia": "Europe/Prague", "United Kingdom": "Europe/London", "Macau S.A.R": "Asia/Macau",
    "Macao S.A.R": "Asia/Macau", "Sri Lanka": "Asia/Colombo", "Barbados": "America/Barbados",
    "Maldives": "Indian/Maldives", "Sao Tome and Principe": "Africa/Sao_Tome", "Samoa": "Pacific/Apia",
    "Saint Lucia": "America/St_Lucia", "Cayman Islands": "America/Cayman", "China": "Asia/Shanghai",
    "Belarus": "Europe/Minsk", "Georgia": "Asia/Tbilisi", "Armenia": "Asia/Yerevan",
    "Azerbaijan": "Asia/Baku", "Kyrgyzstan": "Asia/Bishkek", "Tajikistan": "Asia/Dushanbe",
    "Turkmenistan": "Asia/Ashgabat", "Moldova": "Europe/Chisinau", "Latvia": "Europe/Riga",
    "Lithuania": "Europe/Vilnius", "Estonia": "Europe/Tallinn", "Turkey": "Europe/Istanbul",
    "Thailand": "Asia/Bangkok", "Vietnam": "Asia/Ho_Chi_Minh", "India": "Asia/Kolkata",
    "United Arab Emirates": "Asia/Dubai", "Israel": "Asia/Jerusalem", "Egypt": "Africa/Cairo",
    "Japan": "Asia/Tokyo", "South Korea": "Asia/Seoul", "Germany": "Europe/Berlin",
    "France": "Europe/Paris", "Italy": "Europe/Rome", "Poland": "Europe/Warsaw",
    "Finland": "Europe/Helsinki", "Bulgaria": "Europe/Sofia", "Serbia": "Europe/Belgrade",
    "Montenegro": "Europe/Podgorica", "Greece": "Europe/Athens", "Cyprus": "Asia/Nicosia",
    "Uzbekistan": None,
}

raw = []
for f in load("ne_10m_populated_places"):
    p = f["properties"]
    country, adm1 = p.get("ADM0NAME") or "", p.get("ADM1NAME") or ""
    tz = (p.get("TIMEZONE") or "").strip() or None
    if country == "Russia":
        if adm1 in RU:
            tz = RU[adm1]
        elif tz is None and adm1 in RU_MOSCOW_DEFAULT:
            tz = "Europe/Moscow"
    elif country == "Kazakhstan" and adm1 in KZ:
        tz = KZ[adm1]
    elif country == "Indonesia" and adm1 in ID:
        tz = ID[adm1]
    elif COUNTRY_TZ.get(country) and not (country in ("France", "United Kingdom") and not (p["LATITUDE"] > 40 and -9 < p["LONGITUDE"] < 11)):
        tz = COUNTRY_TZ[country]
    if country == "Spain" and p["LATITUDE"] < 30:
        tz = "Atlantic/Canary"
    raw.append([p, tz])


def gdist(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * math.asin(min(1, math.sqrt(h)))


# fill gaps from the nearest city in the same region, then same country
filled = 0
for item in raw:
    p, tz = item
    if tz:
        continue
    here = (p["LATITUDE"], p["LONGITUDE"])
    best = None
    for scope in ("adm1", "country"):
        for q, qtz in raw:
            if not qtz or q is p or q.get("ADM0NAME") != p.get("ADM0NAME"):
                continue
            if scope == "adm1" and q.get("ADM1NAME") != p.get("ADM1NAME"):
                continue
            d = gdist(here, (q["LATITUDE"], q["LONGITUDE"]))
            if best is None or d < best[0]:
                best = (d, qtz)
        if best:
            break
    if best:
        item[1] = best[1]
        filled += 1
print("filled missing tz:", filled, "still missing:", sum(1 for _, t in raw if not t))

countries, cidx = [], {}
tzs, tzidx = [], {}
rows = []
seen = set()
for p, tz in raw:
    ru = (p.get("NAME_RU") or "").strip()
    en = (p.get("NAME_EN") or p.get("NAME") or "").strip()
    name_ru = ru or en
    c = cname.get(p.get("ADM0_A3")) or cname.get(p.get("SOV_A3")) or p.get("ADM0NAME") or ""
    if not tz:
        continue
    lat, lon = p["LATITUDE"], p["LONGITUDE"]
    key = (name_ru, round(lat, 1), round(lon, 1))
    if key in seen:
        continue
    seen.add(key)
    if c not in cidx:
        cidx[c] = len(countries)
        countries.append(c)
    if tz not in tzidx:
        tzidx[tz] = len(tzs)
        tzs.append(tz)
    pop = int(p.get("POP_MAX") or 0)
    mz = p.get("MIN_ZOOM")
    mz = 9 if mz is None else mz
    en_out = "" if en == name_ru else en
    rows.append((pop, f"{name_ru}|{en_out}|{cidx[c]}|{round(lat*100)}|{round(lon*100)}|{tzidx[tz]}|{pop}|{round(mz*10)}"))

rows.sort(key=lambda r: -r[0])
res["cities"] = "\n".join(r[1] for r in rows)
res["countries"] = countries
res["tzs"] = tzs
stats["cities"] = (len(rows), len(res["cities"]))

with open(OUT, "w", encoding="utf-8") as f:
    f.write("window.ACG_DATA=")
    f.write(json.dumps(res, ensure_ascii=False, separators=(",", ":")))
    f.write(";\n")

for k, v in stats.items():
    print(f"{k:10s} pts={v[0]:7d} chars={v[1]:8d}")
print("tzs", len(tzs), "countries", len(countries))
