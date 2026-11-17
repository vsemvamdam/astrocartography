#!/bin/bash
# Screenshots of the app in the iOS simulator, with sample data (launch argument -demo, see Demo in AppModel.swift).
#   ios/scripts/screenshots.sh <simulator-udid> <path/to/AstroSky.app> <output-dir>
set -uo pipefail
UDID=$1 APP=$2 OUT=$3
BID=io.github.vsemvamdam.astrosky
mkdir -p "$OUT"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 || true
xcrun simctl install "$UDID" "$APP"

shot() {
  local name=$1; shift
  xcrun simctl terminate "$UDID" "$BID" >/dev/null 2>&1 || true
  xcrun simctl launch "$UDID" "$BID" "$@" >/dev/null
  sleep "${WAIT:-8}"
  xcrun simctl io "$UDID" screenshot --type=png "$OUT/$name.png" >/dev/null 2>&1 && echo "shot $name"
}

shot 00-welcome
shot 01-natal -demo -tab 0
shot 02-natal-reading -demo -tab 0 -scroll reading
shot 03-natal-tables -demo -tab 0 -scroll tables
shot 04-solar -demo -tab 1 -mode solar
shot 05-solar-reading -demo -tab 1 -mode solar -scroll reading
shot 06-lunar -demo -tab 1 -mode lunar
shot 07-synastry -demo -tab 2 -mode synastry
shot 08-composite -demo -tab 2 -mode composite -scroll reading
shot 09-profile -demo -tab 3

# the PDF written by EngineTests.testPDF, if the tests ran on this simulator
DATA=$(xcrun simctl get_app_container "$UDID" "$BID" data 2>/dev/null)
if [ -n "$DATA" ]; then find "$DATA" -name '*.pdf' -exec cp {} "$OUT/" \; 2>/dev/null; fi
ls -la "$OUT"
