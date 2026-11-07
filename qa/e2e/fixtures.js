/* Shared test setup: the site from a local server, every outside service replaced by a local copy or a stub,
   console errors and page errors collected (a test fails on any), and an axe scan helper. */
'use strict';
const base = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('fs');
const path = require('path');

const QA = path.join(__dirname, '..');
const NM = path.join(QA, 'node_modules');
const SP = process.env.QA_DATA || '/tmp/claude-0/-home-claude/3337e13a-b497-573b-b11c-0e8413777368/scratchpad';
const ESPN = process.env.QA_ESPN || path.join(SP, 'espn-data');            // a clone of the `data` branch
const VENUES = process.env.QA_VENUES || '/home/claude/fdb/venues.json';      // football-db/venues.json
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function stubOutside(page, log) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
    const url = route.request().url();
    const file = (p, type) => route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
    if (/astronomy-engine@2\.1\.19\/astronomy\.browser\.min\.js/.test(url)) return file(path.join(NM, 'astronomy-engine/astronomy.browser.min.js'), 'application/javascript');
    if (/html2pdf\.js@0\.10\.3\/dist\/html2pdf\.bundle\.min\.js/.test(url)) return file(path.join(NM, 'html2pdf.js/dist/html2pdf.bundle.min.js'), 'application/javascript');
    if (/gstatic\.com\/firebasejs\/.*firebase-app-compat\.js/.test(url)) return file(path.join(__dirname, 'stubs/firebase-fake.js'), 'application/javascript');
    if (/gstatic\.com\/firebasejs\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* in firebase-fake.js */' });
    if (/fonts\.googleapis\.com/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (/fonts\.gstatic\.com/.test(url)) return route.fulfill({ status: 404, body: '' });
    if (/tile\.openstreetmap|basemaps\.cartocdn|cartocdn|\/\{?[a-c]\}?\.tile/.test(url) || /\.png(\?|$)/.test(url) && /tile/.test(url)) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    let m;
    if ((m = url.match(/raw\.githubusercontent\.com\/vsemvamdam\/astrocartography\/data\/(.+?)(\?|$)/))) {
      const p = path.join(ESPN, m[1]);
      return fs.existsSync(p) ? file(p, 'application/json') : route.fulfill({ status: 404, body: '404: Not Found' });
    }
    if (/raw\.githubusercontent\.com\/vsemvamdam\/astrocartography\/football-db\/venues\.json/.test(url) && fs.existsSync(VENUES)) return file(VENUES, 'application/json');
    if (/a\.espncdn\.com\//.test(url)) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    // ESPN itself is never asked during the tests: the site falls back to it when the copy is stale or missing
    if (/site\.api\.espn\.com/.test(url)) { log.outside.push(url); return route.fulfill({ status: 404, body: '' }); }
    log.outside.push(url);
    return route.fulfill({ status: 404, body: '' });
  });
}

const test = base.test.extend({
  log: async ({}, use) => { await use({ console: [], page: [], outside: [] }); },
  page: async ({ page, log }, use, testInfo) => {
    await stubOutside(page, log);
    page.on('console', (m) => { if (m.type() === 'error') log.console.push(m.text()); });
    page.on('pageerror', (e) => log.page.push(String(e && e.stack || e)));
    await use(page);
    const allowed = (t) => /Failed to load resource: the server responded with a status of 404/.test(t) || (testInfo.annotations.some((a) => a.type === 'allow-console') && testInfo.annotations.some((a) => a.type === 'allow-console' && new RegExp(a.description).test(t)));
    const bad = log.console.filter((t) => !allowed(t));
    if (log.outside.length) await testInfo.attach('outside-requests', { body: log.outside.join('\n') });
    base.expect(log.page, 'page errors').toEqual([]);
    base.expect(bad, 'console errors').toEqual([]);
  },
});

/* Opens the site at a view with a birth chart already entered (through the form, as a person would). */
async function open(page, hash = '') {
  await page.goto('/' + (hash ? '#' + hash : ''));
  await page.waitForFunction(() => window.Astronomy && window.ACG && window.ACG_APP);
}

/* axe scan of the current screen; returns the serious and critical violations. */
async function axe(page, include) {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  if (include) b = b.include(include);
  const r = await b.analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, nodes: v.nodes.slice(0, 3).map((x) => x.target.join(' ')) }));
}

module.exports = { test, expect: base.expect, open, axe };
