#!/usr/bin/env bash
# Tool checks (area B): dump the site's results, recompute them with independent sources, write summary.json.
# TOOLS_TMP — folder for the intermediate JSON; SWE_EPHE — Swiss Ephemeris files (sepl_18, semo_18, seas_18, sefstars.txt);
# FDB — a month file of the football-db branch (matches/YYYY-MM.json) for the sport check.
set -euo pipefail
cd "$(dirname "$0")"
: "${TOOLS_TMP:?set TOOLS_TMP}"
mkdir -p "$TOOLS_TMP"
if [ -z "${FDB:-}" ]; then
  FDB="$TOOLS_TMP/fdb_2025-10.json"
  [ -f "$FDB" ] || gh api "repos/vsemvamdam/astrocartography/contents/matches/2025-10.json?ref=football-db" --jq '.content' | base64 -d > "$FDB"
fi
export TOOLS_TMP FDB
node site_dump.js all "$TOOLS_TMP"
for s in check_hours check_voc check_lunar check_dign check_bio_num check_cycles check_kery check_kery_nm check_aspects check_horary check_stars check_cities check_sport; do
  echo "== $s"; python3 "$s.py" > "$TOOLS_TMP/out_$s.txt"
done
# 30° dial: pairs across the 0°/30° seam (the rule of renderDeg30 in js/tools-view.js)
python3 - <<'EOF'
import json, os
T = os.environ['TOOLS_TMP']; N = json.load(open(os.path.join(T, 'site_natal.json'))); miss = []; tot = 0
for ch in N['charts']:
    it = [(p['id'], p['lon'] % 30, p['lon']) for p in [p for p in ch['points'] if p['id'] != 'SNode'] + ch['angles']]
    for i in range(len(it)):
        for j in range(i + 1, len(it)):
            lin = abs(it[i][1] - it[j][1]); circ = min(lin, 30 - lin)
            if circ <= 1.5:
                tot += 1
                if lin > 1.5: miss.append((ch['id'], it[i][0], it[j][0], round(it[i][2], 2), round(it[j][2], 2), round(circ, 2)))
json.dump({'pairs': tot, 'missed': miss}, open(os.path.join(T, 'res_deg30.json'), 'w'))
EOF
python3 make_summary.py
