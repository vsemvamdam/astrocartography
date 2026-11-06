/* Merge the records of one league from a backfilled copy of the football base into the latest base.
   node research/merge_db.js <backfilled-db> <latest-db> <league>
   The latest base wins for every match it already has; venues are joined. */
'use strict';
const fs = require('fs'), path = require('path');
const [A, B, LG] = process.argv.slice(2);
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
let added = 0, months = 0;
for (const f of fs.readdirSync(path.join(A, 'matches'))) {
  const ours = read(path.join(A, 'matches', f)) || {};
  const theirs = read(path.join(B, 'matches', f)) || {};
  let changed = false;
  for (const [id, r] of Object.entries(ours)) {
    if (r.league !== LG || theirs[id]) continue;
    theirs[id] = r; added++; changed = true;
  }
  if (!changed) continue;
  months++;
  const rows = Object.values(theirs).sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
  fs.mkdirSync(path.join(B, 'matches'), { recursive: true });
  fs.writeFileSync(path.join(B, 'matches', f), '{\n' + rows.map((r) => JSON.stringify(r.id) + ': ' + JSON.stringify(r)).join(',\n') + '\n}\n');
}
const va = read(path.join(A, 'venues.json')) || {}, vb = read(path.join(B, 'venues.json')) || {};
const v = Object.assign({}, va, vb);
fs.writeFileSync(path.join(B, 'venues.json'), '{\n' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ': ' + JSON.stringify(v[k])).join(',\n') + '\n}\n');
console.log(`${LG}: ${added} matches added in ${months} months, venues ${Object.keys(vb).length} → ${Object.keys(v).length}`);
