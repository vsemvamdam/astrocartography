/* Mirror of the ESPN data the "Спорт" tab needs, for visitors whose network cannot reach ESPN.
   Runs in GitHub Actions (.github/workflows/sport-mirror.yml) every half hour and publishes the files
   to the `data` branch; the site reads them from raw.githubusercontent.com and falls back to ESPN.
   Each file is {fetched, data}, where data keeps ESPN's shape but only the fields the site reads.
   Usage: node tools/sport_mirror.js <previous-dir> <output-dir>   (Node 18+, global fetch) */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = process.env.ESPN_BASE || 'https://site.api.espn.com/apis/site/v2/sports/';
// the copy keeps every league under its id (espn/<id>/…), whatever ESPN's path for it is
const LEAGUES = ['eng.1', 'esp.1', 'fra.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'nhl'];
const PATH = { nhl: 'hockey/nhl' };
const apiOf = (lg) => BASE + (PATH[lg] || 'soccer/' + lg) + '/';
const HOCKEY = new Set(['nhl']);
const DAYS = 15, H = 3600000, DAY = 24 * H;
const [PREV, OUT] = [process.argv[2] || 'prev', process.argv[3] || 'next'];
const now = Date.now();

const ym = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const pick = (o, keys) => { if (!o) return undefined; const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'astrocartography-mirror (github actions)' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (k === 2) throw e;
      await sleep(1500 * (k + 1));
    }
  }
}
function readPrev(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(PREV, 'espn', rel), 'utf8')); } catch (e) { return null; }
}
let written = 0;
function write(rel, data, fetched) {
  const f = path.join(OUT, 'espn', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ fetched: fetched || now, data }));
  written++;
}

/* --------------------------- trimming to what the site reads --------------------------- */
const price = (x) => x && { close: x.close && pick(x.close, ['odds']), open: x.open && pick(x.open, ['odds']) };
function trimOdds(o) {
  if (!o) return undefined;
  const ml = o.moneyline || {};
  return {
    moneyline: { home: price(ml.home), away: price(ml.away), draw: price(ml.draw) },
    homeTeamOdds: pick(o.homeTeamOdds, ['moneyLine']), awayTeamOdds: pick(o.awayTeamOdds, ['moneyLine']), drawOdds: pick(o.drawOdds, ['moneyLine']),
    overUnder: o.overUnder, total: o.total && { over: price(o.total.over) }, provider: o.provider && pick(o.provider, ['name']),
  };
}
function trimScoreboard(j) {
  return {
    events: (j.events || []).map((ev) => {
      const c = (ev.competitions || [])[0] || {};
      return {
        id: ev.id, date: ev.date,
        competitions: [{
          competitors: (c.competitors || []).map((x) => ({
            homeAway: x.homeAway, score: x.score, form: x.form,
            team: x.team && Object.assign(pick(x.team, ['id', 'displayName', 'name', 'shortDisplayName', 'abbreviation', 'logo', 'color']),
              x.team.logos && x.team.logos[0] ? { logos: [{ href: x.team.logos[0].href }] } : {}),
          })),
          venue: c.venue && { fullName: c.venue.fullName, address: c.venue.address && pick(c.venue.address, ['city', 'country']) },
          status: c.status && { type: c.status.type && pick(c.status.type, ['state', 'shortDetail', 'description']) },
          odds: c.odds && c.odds[0] ? [trimOdds(c.odds[0])] : undefined,
        }],
      };
    }),
  };
}
const STATS = new Set(['appearances', 'subIns', 'totalGoals', 'goalAssists']);
function trimRoster(j) {
  return {
    // a hockey roster comes in groups by position ({position, items}): the copy keeps one flat list
    athletes: (j.athletes || []).flatMap((a) => (a && Array.isArray(a.items) ? a.items : [a])).map((a) => {
      const cats = (a.statistics && a.statistics.splits && a.statistics.splits.categories) || [];
      const stats = [];
      for (const c of cats) for (const s of c.stats || []) if (STATS.has(s.name)) stats.push({ name: s.name, value: s.value });
      return Object.assign(pick(a, ['id', 'displayName', 'fullName', 'shortName', 'jersey', 'dateOfBirth', 'age']), {
        position: a.position && pick(a.position, ['abbreviation']),
        statistics: { splits: { categories: [{ stats }] } },
        injuries: (a.injuries || []).map((i) => pick(i, ['status', 'type'])),
      });
    }),
  };
}
function trimSummary(j) {
  return {
    rosters: (j.rosters || []).map((r) => ({
      homeAway: r.homeAway, formation: r.formation,
      roster: (r.roster || []).map((p) => ({
        athlete: p.athlete && pick(p.athlete, ['id', 'displayName']), jersey: p.jersey,
        position: p.position && pick(p.position, ['abbreviation']), starter: p.starter, formationPlace: p.formationPlace,
      })),
    })),
  };
}

/* ------------------------------------------ run ----------------------------------------- */
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; try { await fn(it); } catch (e) { console.warn('fail', it.rel || it, e.message); } } }));
}
// reuse the previous copy while it is fresh enough, otherwise fetch; keep the stale copy if ESPN fails
async function refresh(rel, url, maxAge, trim) {
  const old = readPrev(rel);
  if (old && now - old.fetched < maxAge) { write(rel, old.data, old.fetched); return old.data; }
  try {
    const j = await get(url);
    if (j) { const d = trim(j); write(rel, d); return d; }
  } catch (e) {
    if (!old) throw e;
    console.warn('stale', rel, e.message);
  }
  if (old) { write(rel, old.data, old.fetched); return old.data; }
  return null;
}

(async () => {
  const months = [...new Set([ym(now - DAY), ym(now + DAYS * DAY)])];
  const matches = [];
  let boards = 0;
  await pool(LEAGUES.flatMap((lg) => months.map((mo) => ({ lg, mo, rel: `${lg}/scoreboard-${mo}.json` }))), 4, async ({ lg, mo, rel }) => {
    const d = await refresh(rel, `${apiOf(lg)}scoreboard?dates=${mo}&limit=300`, 0, trimScoreboard);
    if (!d) return;
    boards++;
    for (const ev of d.events) {
      const t = Date.parse(ev.date), c = ev.competitions[0], st = c.status && c.status.type && c.status.type.state;
      if (st !== 'post' && t > now - 3 * H && t < now + DAYS * DAY) matches.push({ lg, id: ev.id, t, teams: c.competitors.map((x) => x.team && x.team.id).filter(Boolean) });
    }
  });
  if (!boards) { console.error('no scoreboards at all'); process.exit(1); }

  const teams = new Map();
  for (const m of matches) for (const id of m.teams) teams.set(`${m.lg}/roster-${id}.json`, { lg: m.lg, id });
  await pool([...teams].map(([rel, x]) => ({ rel, ...x })), 6, ({ rel, lg, id }) => refresh(rel, `${apiOf(lg)}teams/${id}/roster`, 12 * H, trimRoster));

  // lineups come out about an hour before kickoff: refresh often close to the match, rarely before.
  // ESPN gives no hockey lineups before the game, so there is nothing to copy for the NHL
  const near = matches.filter((m) => m.t - now < 36 * H && !HOCKEY.has(m.lg));
  await pool(near.map((m) => ({ rel: `${m.lg}/summary-${m.id}.json`, ...m })), 6, ({ rel, lg, id, t }) =>
    refresh(rel, `${apiOf(lg)}summary?event=${id}`, t - now < 4 * H ? 20 * 60000 : 6 * H, trimSummary));

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ fetched: now, matches: matches.length, rosters: teams.size, summaries: near.length, files: written }));
  fs.writeFileSync(path.join(OUT, 'README.md'), 'Data for the "Спорт" tab, rebuilt by .github/workflows/sport-mirror.yml. Do not edit.\n');
  console.log(`matches ${matches.length}, rosters ${teams.size}, summaries ${near.length}, files ${written}`);
})().catch((e) => { console.error(e); process.exit(1); });
