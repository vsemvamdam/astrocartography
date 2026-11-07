"""Item 9: generate the time-zone test cases for the site (local -> UTC and offsets at instants).
python3 tz_cases.py <out.json>   (zones: every zone used by the site's city list + extra historical ones)"""
import json, sys, subprocess, datetime as dt
from zoneinfo import ZoneInfo

site_tz = json.loads(subprocess.run(['node', '-e', "const S=require('/home/claude/astrocartography/qa/lib/site.js'); console.log(JSON.stringify(S.DATA.tzs))"],
                                    capture_output=True, text=True).stdout)
EXTRA = ['Europe/Saratov', 'Europe/Ulyanovsk', 'Europe/Astrakhan', 'Asia/Omsk', 'Asia/Barnaul', 'Asia/Tomsk', 'Asia/Srednekolymsk',
         'Australia/Sydney', 'Australia/Lord_Howe', 'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Apia', 'Africa/Casablanca',
         'America/Santiago', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'America/Argentina/Ushuaia', 'UTC']
zones = sorted(set(site_tz) | set(EXTRA))
UTC = dt.timezone.utc
local, offsets, meta = [], [], []

# 1. two fixed wall-clock times a year, 1880–2035
for tz in zones:
    for y in range(1880, 2036):
        for (m, d, h, mi) in ((1, 15, 12, 0), (7, 15, 12, 0)):
            local.append([y, m, d, h, mi, tz, None]); meta.append({'kind': 'sample'})

# 2. around every transition 1880–2035: wall clock 1 h before, inside the gap/overlap, 1 h after; and offsets at instants
KEY = ['Europe/Moscow', 'Europe/Samara', 'Europe/Kaliningrad', 'Europe/Volgograd', 'Europe/Saratov', 'Europe/Kirov', 'Asia/Yekaterinburg',
       'Asia/Novosibirsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka', 'Europe/Simferopol',
       'Europe/Kiev', 'Europe/Minsk', 'Asia/Tbilisi', 'Asia/Yerevan', 'Asia/Almaty', 'Asia/Tashkent', 'Europe/Berlin', 'Europe/London',
       'Europe/Oslo', 'Atlantic/Reykjavik', 'America/New_York', 'America/Phoenix', 'America/Argentina/Buenos_Aires',
       'America/Argentina/Ushuaia', 'America/Guayaquil', 'Australia/Sydney', 'Australia/Lord_Howe', 'Pacific/Auckland', 'Pacific/Chatham',
       'Pacific/Apia', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Tehran', 'America/Santiago', 'Africa/Casablanca', 'Europe/Amsterdam',
       'Europe/Paris', 'Europe/Dublin', 'Asia/Shanghai', 'Asia/Tokyo']
for tz in KEY:
    z = ZoneInfo(tz)
    t = dt.datetime(1870, 1, 1, tzinfo=UTC)
    end = dt.datetime(2036, 1, 1, tzinfo=UTC)
    prev = t.astimezone(z).utcoffset()
    step = dt.timedelta(hours=6)
    n = 0
    while t < end:
        t2 = t + step
        o2 = t2.astimezone(z).utcoffset()
        if o2 != prev:
            lo, hi = t, t2                                   # bisect the transition instant to the second
            while (hi - lo) > dt.timedelta(seconds=1):
                mid = lo + (hi - lo) / 2
                if mid.astimezone(z).utcoffset() == prev: lo = mid
                else: hi = mid
            tr = hi.replace(microsecond=0)
            for s in (-3600, -1, 0, 1, 3600):
                offsets.append([tz, int((tr + dt.timedelta(seconds=s)).timestamp() * 1000)])
            # wall clock just before the transition in the old offset, then inside the gap / overlap and after
            wall_old = (tr + prev).replace(tzinfo=None)
            delta = (o2 - prev)
            probes = [wall_old - dt.timedelta(hours=1), wall_old + abs(delta) / 2 if delta.total_seconds() > 0 else wall_old - abs(delta) / 2,
                      wall_old + dt.timedelta(hours=1, minutes=abs(delta.total_seconds()) // 60)]
            for p in probes:
                local.append([p.year, p.month, p.day, p.hour, p.minute, tz, None]); meta.append({'kind': 'transition', 'gap' if delta.total_seconds() > 0 else 'fold': True, 'tr': tr.isoformat()})
            prev = o2; n += 1
        t = t2
# 3. manual offsets
for off in (-720, -570, -60, 0, 39.95, 150.2833, 345, 525, 765, 840):
    local.append([1950, 6, 15, 18, 0, 'UTC', off]); meta.append({'kind': 'manual'})
# 4. LMT era (before standard time): offsets at 1850, 1879, 1900
for tz in zones:
    for y in (1850, 1879, 1900, 1915, 1925):
        offsets.append([tz, int(dt.datetime(y, 3, 14, 12, tzinfo=UTC).timestamp() * 1000)])
json.dump({'zones': zones, 'local': local, 'meta': meta, 'offsets': offsets}, open(sys.argv[1], 'w'))
print('zones', len(zones), 'local', len(local), 'offsets', len(offsets))
