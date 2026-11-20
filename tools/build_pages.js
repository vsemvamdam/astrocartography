#!/usr/bin/env node
/* Section pages for search engines. Every entry of js/routes.js gets its own address (/solyar/, /lunnye-dni/ …):
   a folder with a copy of index.html that has <base href="/">, that page's title, description and canonical link,
   and the heading of its section. The host serves files as they are, so the copies are written here and committed.
   The script also writes the sitemap and the blocks between marks in index.html and the copies: <!--seo--> (title,
   description), <!--home--> (the list of sections, for search engines without scripts), <!--about--> (the text under
   the section, js/page-texts.js) and <!--doc--> (a document: about the site, questions, privacy policy …).

     node tools/build_pages.js            write everything (after any change to index.html or js/routes.js)
     node tools/build_pages.js --check    fail if something is out of date
     node tools/build_pages.js --serve [port]
                                          the site with every address on http://localhost:8080, pages built on the fly

   GitHub Actions (.github/workflows/pages.yml) runs it after every push to main and commits what changed. */
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('../js/routes.js');
const T = require('../js/page-texts.js');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const STAMP = '<!-- Copy of index.html for this address, written by tools/build_pages.js from js/routes.js: edit index.html, not this file. -->';
const MARK = (name) => [`<!--${name}-->`, `<!--/${name}-->`];
// the section headings a mode page replaces: the natal chart's and the tools' (js/natal-view.js and js/tools-view.js
// set the same text when the mode changes)
const H1 = { natal: ['<h1 id="natH">', 'Натальная карта'], tools: ['<h1 id="toolTitle">', 'Инструменты'] };
const HOME_H1 = 'Астрология по вашей карте';
const HOME_LEAD = 'Натальная карта и её расшифровка, линии планет на карте мира, соляры и лунары, совместимость и инструменты для всей семьи — по дате, времени и месту рождения.';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dir = (p) => p.path.replace(/^\/|\/$/g, '');
const isDoc = (p) => p.spec.startsWith('doc:');

function seoBlock(p) {
  const url = R.SITE + p.path;
  return [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.desc)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${esc(p.title)}">`,
    `<meta property="og:description" content="${esc(p.desc)}">`,
  ].join('\n');
}
// the home page as plain HTML, for search engines that don't run scripts: js/home-view.js draws over it
function homeBlock() {
  const links = R.PAGES.filter((p) => p.path !== '/' && !isDoc(p)).map((p) => `<li><a href="${p.path}">${esc(p.name)}</a></li>`).join('');
  return `<h1 class="hm-h1">${esc(HOME_H1)}</h1><p class="hm-lead">${esc(HOME_LEAD)}</p><h2 class="hm-h">Разделы</h2><ul class="hm-links">${links}</ul>`;
}
function find(src, name) {
  const [a, b] = MARK(name), i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < i || src.indexOf(a, i + 1) >= 0 || src.indexOf(b, j + 1) >= 0) throw new Error(`index.html: need exactly one ${a} … ${b}`);
  return [i, j + b.length, a, b];
}
const between = (src, name, inner) => { const [i, j, a, b] = find(src, name); return src.slice(0, i) + a + inner + b + src.slice(j); };
const replaced = (src, name, text) => { const [i, j] = find(src, name); return src.slice(0, i) + text + src.slice(j); };

// index.html with its home blocks brought up to date
function indexHtml() {
  let src = fs.readFileSync(INDEX, 'utf8');
  for (const [tag, text] of Object.values(H1)) if (!src.includes(`${tag}${text}</h1>`)) throw new Error(`index.html: no ${tag}${text}</h1> to replace`);
  if (!src.startsWith('<!doctype html>\n')) throw new Error('index.html must start with "<!doctype html>" and a new line');
  find(src, 'base');
  src = between(src, 'seo', '\n' + seoBlock(R.PAGES[0]) + '\n');
  src = between(src, 'home', homeBlock());
  src = between(src, 'about', T.aboutHtml('/'));
  src = between(src, 'doc', '');
  return src;
}
// the page of an address: index.html with <base href="/">, its seo block and heading, no home blocks
function pageHtml(src, p) {
  if (p.path === '/') return src;
  let out = replaced(src, 'base', '<base href="/">');
  out = between(out, 'seo', '\n' + seoBlock(p) + '\n');
  out = between(out, 'home', '');
  out = between(out, 'about', isDoc(p) ? '' : T.aboutHtml(p.path));
  out = between(out, 'doc', isDoc(p) ? T.DOCS[p.path] || '' : '');
  const v = p.spec.split(':')[0];
  if (H1[v] && p.spec.includes(':')) out = out.replace(`${H1[v][0]}${H1[v][1]}</h1>`, `${H1[v][0]}${esc(p.name)}</h1>`);
  return out.replace('<!doctype html>\n', `<!doctype html>\n${STAMP}\n`);
}
function sitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${R.PAGES.map((p) => `  <url><loc>${R.SITE}${p.path}</loc></url>`).join('\n')}
</urlset>
`;
}
function files() {
  const index = indexHtml();
  const out = new Map([['index.html', index], ['sitemap.xml', sitemap()]]);
  for (const p of R.PAGES) if (p.path !== '/') out.set(`${dir(p)}/index.html`, pageHtml(index, p));
  return out;
}
// written earlier by this script for addresses no longer in the list
function leftovers(want) {
  const old = [];
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    const f = e.isDirectory() ? `${e.name}/index.html` : e.name;
    if (want.has(f) || !/\.html$/.test(f) || !fs.existsSync(path.join(ROOT, f))) continue;
    const head = fs.readFileSync(path.join(ROOT, f), 'utf8').slice(0, 400);
    if (head.includes(STAMP) || head.startsWith('---\n# Written by tools/build_pages.js')) old.push(f);
  }
  return old;
}

const arg = process.argv[2];
if (arg === '--serve') {
  const port = +process.argv[3] || 8080;
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
  require('http').createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const page = R.PAGES.find((p) => p.path === u || p.path === u + '/');
    if (page && u !== page.path) { res.writeHead(301, { Location: page.path }); res.end(); return; }
    if (page) { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); res.end(pageHtml(indexHtml(), page)); return; }
    const f = path.join(ROOT, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': TYPES['.txt'] }); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(data);
    });
  }).listen(port, () => console.log(`http://localhost:${port}/`));
} else {
  const want = files(), stale = leftovers(want);
  if (arg !== '--check') for (const f of stale) { fs.unlinkSync(path.join(ROOT, f)); const d = path.dirname(path.join(ROOT, f)); if (d !== ROOT && !fs.readdirSync(d).length) fs.rmdirSync(d); }
  for (const [f, text] of want) {
    const file = path.join(ROOT, f);
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) continue;
    stale.push(f);
    if (arg !== '--check') { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
  }
  if (arg === '--check') {
    if (stale.length) { console.error(`Out of date: ${stale.join(', ')}. Run: node tools/build_pages.js`); process.exit(1); }
    console.log(`Section pages up to date (${R.PAGES.length} addresses).`);
  } else console.log(stale.length ? `Updated: ${stale.join(', ')}` : 'Nothing to update.');
}
