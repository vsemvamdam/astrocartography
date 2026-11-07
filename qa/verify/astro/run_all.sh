#!/bin/sh
# Area A (astronomy) QA: site dump -> comparisons with five sources -> summary.json.  sh qa/verify/astro/run_all.sh
set -e
H=$(cd "$(dirname "$0")" && pwd)
T=${QA_TMP:-/tmp/claude-0/-home-claude/3337e13a-b497-573b-b11c-0e8413777368/scratchpad/astro}
mkdir -p "$T"
cd "$H"
[ -f "$T/horizons.json" ] || curl -sSf -o "$T/horizons.json" https://raw.githubusercontent.com/vsemvamdam/astrocartography/qa/qa/verify/data/horizons.json || true
python3 tz_cases.py "$T/tz_cases.json"
node dump_site.js ../cases.json "$T/site_dump.json" "$T/tz_cases.json" "$T/tz_site.json"
python3 -W ignore compare_positions.py "$T/site_dump.json" "$T/cmp_positions.json" > "$T/cmp_positions.txt"
python3 -W ignore compare_points.py "$T/site_dump.json" "$T/cmp_points.json" > "$T/cmp_points.txt"
python3 -W ignore compare_houses.py "$T/site_dump.json" "$T/cmp_houses.json" > "$T/cmp_houses.txt"
python3 -W ignore compare_lines.py "$T/site_dump.json" "$T/cmp_lines.json" > "$T/cmp_lines.txt"
python3 -W ignore paran_audit.py "$T/site_dump.json" "$T/paran_audit.json" > /dev/null
python3 -W ignore paran_fix_check.py "$T/site_dump.json" > "$T/paran_fix_check.txt"
python3 -W ignore compare_returns_stars.py "$T/site_dump.json" "$T/cmp_returns_stars.json" > /dev/null
python3 -W ignore compare_tz.py "$T/tz_cases.json" "$T/tz_site.json" "$T/cmp_tz.json" > "$T/cmp_tz.txt"
python3 compare_online.py "$T/site_dump.json" > "$T/cmp_online.txt"
python3 -W ignore build_summary.py "$T" summary.json
