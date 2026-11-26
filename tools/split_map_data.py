"""Split js/data.js into a core bundle and an on-demand high-detail map bundle.

The map layers land10 (722 KB raw / 496 KB gzip) and borders10 (172 KB raw /
120 KB gzip) are only used at deep zoom (s >= 22 in app.js). They were shipping
in the boot payload anyway: 615 KB gzip of the 905 KB gzip data.js, plus the
Path2D decode of ~900 KB of polyline on the main thread during startup.

Core (always):   land110, land50, borders50, lakes, cities, countries, tzs
On demand:       land10, borders10   ->  window.ACG_DATA_HI

Raw text spans are preserved byte-for-byte: the values are re-emitted exactly as
they appear in the source, not re-serialised, so no number formatting can drift.
"""
import json
import os
import sys

HI_KEYS = {'land10', 'borders10'}

src = sys.argv[1] if len(sys.argv) > 1 else "js/data.js"
out_core = sys.argv[2] if len(sys.argv) > 2 else 'js/data.js'
out_hi = sys.argv[3] if len(sys.argv) > 3 else 'js/map-hi.js'

s = open(src, encoding='utf-8').read()

prefix = s[:s.find('{')]
assert prefix == 'window.ACG_DATA=', f'unexpected prefix: {prefix!r}'

start = s.find('{')
depth = 0
in_str = False
esc = False
for i in range(start, len(s)):
    c = s[i]
    if esc:
        esc = False
        continue
    if c == '\\':
        esc = True
        continue
    if c == '"':
        in_str = not in_str
        continue
    if in_str:
        continue
    if c == '{':
        depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            end = i + 1
            break

# --- walk depth 1 recording, for each key: (name, value_start, key_open_quote) ---
depth = 0
in_str = False
esc = False
key_open = None
key_start = None
entries = []

i = start
while i < end:
    c = s[i]
    if esc:
        esc = False
        i += 1
        continue
    if c == '\\':
        esc = True
        i += 1
        continue
    if c == '"':
        if not in_str:
            in_str = True
            key_open = i
            key_start = i + 1
        else:
            in_str = False
            j = i + 1
            while j < end and s[j] in ' \t\n\r':
                j += 1
            if j < end and s[j] == ':' and depth == 1:
                v = j + 1
                while v < end and s[v] in ' \t\n\r':
                    v += 1
                entries.append((s[key_start:i], v, key_open))
        i += 1
        continue
    if not in_str:
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
    i += 1

raw = {}
order = [k for k, _, _ in entries]
for idx, (k, vs, _) in enumerate(entries):
    if idx + 1 < len(entries):
        ve = entries[idx + 1][2]          # opening quote of the NEXT key
        while ve > vs and s[ve - 1] in ' \t\n\r':
            ve -= 1
        while ve > vs and s[ve - 1] == ',':
            ve -= 1
    else:
        ve = end - 1                      # the closing brace itself
        while ve > vs and s[ve - 1] in ' \t\n\r':
            ve -= 1
    raw[k] = s[vs:ve]

missing = HI_KEYS - set(raw)
if missing:
    print(f'ERROR: keys not found in {src}: {sorted(missing)}')
    sys.exit(1)

# every span must be stand-alone valid JSON before we write anything
for k in order:
    json.loads(raw[k])

core_keys = [k for k in order if k not in HI_KEYS]
hi_keys = [k for k in order if k in HI_KEYS]

core = 'window.ACG_DATA={' + ','.join(f'"{k}":{raw[k]}' for k in core_keys) + '};\n'
hi = 'window.ACG_DATA_HI={' + ','.join(f'"{k}":{raw[k]}' for k in hi_keys) + '};\n'

os.makedirs(os.path.dirname(out_hi) or '.', exist_ok=True)
with open(out_core, 'w', encoding='utf-8', newline='\n') as f:
    f.write(core)
with open(out_hi, 'w', encoding='utf-8', newline='\n') as f:
    f.write(hi)

print(f'core keys : {core_keys}')
print(f'hi keys   : {hi_keys}')
print()
print(f'  {out_core:22s} {len(core):>10,d} bytes')
print(f'  {out_hi:22s} {len(hi):>10,d} bytes')
print(f'  {"original":22s} {len(s):>10,d} bytes')
