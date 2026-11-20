#!/usr/bin/env node
/* Section pages for search engines. Every entry of js/routes.js gets its own address (/solyar/, /lunnye-dni/ …).
   GitHub Pages builds them with Jekyll from index.html, so they never go out of date: this script only writes the
   small page files, one per address, in the root (solyar.html …), which say "take index.html, put this page's
   title, description and heading in it", plus the sitemap and, in index.html itself, the home page's block between
   <!--seo--> and <!--/seo--> and the list of sections between <!--home--> and <!--/home-->.

     node tools/build_pages.js            write the files (after editing js/routes.js or the seo block)
     node tools/build_pages.js --check    fail if something is out of date (GitHub Actions runs it on every push)
     node tools/build_pages.js --serve [port]
                                          the site with its section pages on http://localhost:8080, built the
                                          same way as on GitHub Pages (a plain static server only has the root page)

   index.html must not contain "{{" or "{%": Jekyll would read them as its own tags. */
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('../js/routes.js');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const MARK = (name) => [`<!--${name}-->`, `<!--/${name}-->`];
// the section headings a mode page replaces: the natal chart's and the tools' (js/natal-view.js and js/tools-view.js
// set the same text when the mode changes)
const H1 = { natal: ['<h1 id="natH">', 'Натальная карта'], tools: ['<h1 id="toolTitle">', 'Инструменты'] };
const HOME_H1 = 'Астрология по вашей карте';
const HOME_LEAD = 'Натальная карта и её расшифровка, линии планет на карте мира, соляры и лунары, совместимость и инструменты для всей семьи — по дате, времени и месту рождения.';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (p) => p.path.replace(/^\/|\/$/g, '');

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
  const links = R.PAGES.filter((p) => p.path !== '/').map((p) => `<li><a href="${p.path}">${esc(p.name)}</a></li>`).join('');
  return `<h1 class="hm-h1">${esc(HOME_H1)}</h1><p class="hm-lead">${esc(HOME_LEAD)}</p><h2 class="hm-h">Разделы</h2><ul class="hm-links">${links}</ul>`;
}
function between(src, name, inner) {
  const [a, b] = MARK(name), i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < i || src.indexOf(a, i + 1) >= 0 || src.indexOf(b, j + 1) >= 0) throw new Error(`index.html: need exactly one ${a} … ${b}`);
  return src.slice(0, i + a.length) + inner + src.slice(j);
}
const h1Of = (p) => { const v = p.spec.split(':')[0]; return H1[v] && p.spec.includes(':') ? [H1[v][0] + H1[v][1] + '</h1>', H1[v][0] + esc(p.name) + '</h1>'] : null; };

// index.html with its home blocks brought up to date
function indexHtml() {
  let src = fs.readFileSync(INDEX, 'utf8');
  if (/\{\{|\{%/.test(src)) throw new Error('index.html contains "{{" or "{%": GitHub Pages (Jekyll) would treat it as a template tag');
  for (const [tag, text] of Object.values(H1)) if (!src.includes(`${tag}${text}</h1>`)) throw new Error(`index.html: no ${tag}${text}</h1> to replace`);
  between(src, 'base', '');
  src = between(src, 'seo', '\n' + seoBlock(R.PAGES[0]) + '\n');
  src = between(src, 'home', homeBlock());
  return src;
}

// a section page for Jekyll: index.html with <base href="/">, the page's own seo block, no home blocks, its heading
function stub(p) {
  const h = h1Of(p);
  const rest = h ? `{{ f[1] | replace_first: '${h[0]}', '${h[1]}' }}` : '{{ f[1] }}';
  return `---
# Written by tools/build_pages.js from js/routes.js: don't edit. GitHub Pages (Jekyll) makes it the page ${p.path}
permalink: ${p.path}
layout: null
---
{%- capture src -%}{% include_relative index.html %}{%- endcapture -%}
{%- assign a = src | split: '<!--base-->' -%}{%- assign b = a[1] | split: '<!--/base-->' -%}
{%- assign c = b[1] | split: '<!--seo-->' -%}{%- assign d = c[1] | split: '<!--/seo-->' -%}
{%- assign e = d[1] | split: '<!--home-->' -%}{%- assign f = e[1] | split: '<!--/home-->' -%}
{{ a[0] }}<base href="/">{{ c[0] }}<!--seo-->
${seoBlock(p)}
<!--/seo-->{{ e[0] }}<!--home--><!--/home-->${rest}
`;
}
// the same page the way Jekyll renders the stub (for --serve)
function render(src, p) {
  if (p.path === '/') return src;
  const cut = (s, name) => { const [a, b] = MARK(name), i = s.indexOf(a), j = s.indexOf(b); return [s.slice(0, i), s.slice(j + b.length)]; };
  const [a0, b1] = cut(src, 'base'), [c0, d1] = cut(b1, 'seo'), [e0, f1] = cut(d1, 'home');
  const h = h1Of(p);
  return `${a0}<base href="/">${c0}<!--seo-->\n${seoBlock(p)}\n<!--/seo-->${e0}<!--home--><!--/home-->${h ? f1.replace(h[0], h[1]) : f1}`;
}
function sitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${R.PAGES.map((p) => `  <url><loc>${R.SITE}${p.path}</loc></url>`).join('\n')}
</urlset>
`;
}

function files() {
  const out = new Map([['index.html', indexHtml()], ['sitemap.xml', sitemap()]]);
  for (const p of R.PAGES) if (p.path !== '/') out.set(`${slug(p)}.html`, stub(p));
  return out;
}

const arg = process.argv[2];
if (arg === '--serve') {
  const port = +process.argv[3] || 8080;
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
  require('http').createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const page = R.PAGES.find((p) => p.path === u || p.path === u + '/');
    if (page && !u.endsWith('/') && u !== '') { res.writeHead(301, { Location: page.path }); res.end(); return; }
    if (page) { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); res.end(render(fs.readFileSync(INDEX, 'utf8'), page)); return; }
    const f = path.join(ROOT, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': TYPES['.txt'] }); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(data);
    });
  }).listen(port, () => console.log(`http://localhost:${port}/`));
} else {
  const stale = [];
  const want = files();
  // stubs of addresses no longer in the list
  for (const f of fs.readdirSync(ROOT)) {
    if (!f.endsWith('.html') || want.has(f)) continue;
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (t.startsWith('---\n# Written by tools/build_pages.js')) { stale.push(f); if (arg !== '--check') fs.unlinkSync(path.join(ROOT, f)); }
  }
  for (const [f, text] of want) {
    const file = path.join(ROOT, f);
    const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (old === text) continue;
    stale.push(f);
    if (arg !== '--check') fs.writeFileSync(file, text);
  }
  if (arg === '--check') {
    if (stale.length) { console.error(`Out of date: ${stale.join(', ')}. Run: node tools/build_pages.js`); process.exit(1); }
    console.log(`Section pages up to date (${R.PAGES.length} addresses).`);
  } else console.log(stale.length ? `Updated: ${stale.join(', ')}` : 'Nothing to update.');
}
