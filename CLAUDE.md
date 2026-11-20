# AstroSky (astrosky.pro)

- Every section and mode has its own address, listed in `js/routes.js`; each address is a folder with a copy of `index.html` (`solyar/index.html` …). After any change to `index.html`, `js/routes.js` or `js/page-texts.js` (the text under each section and the documents: about, questions, privacy policy, consent, cookies) run `node tools/build_pages.js` and commit what it writes (the copies, `sitemap.xml`, `index.html`). Never edit the copies by hand. If forgotten, `.github/workflows/pages.yml` rebuilds them in a separate commit after the push.
- Navigate with `ROUTES.go('natal:solar')` (or links to the section's address), not `location.hash`.
- Local preview with every address: `node tools/build_pages.js --serve` → http://localhost:8080/.
- Yandex Metrica: the counter's number goes into `METRIKA_ID` in `js/pages.js`; it loads only after the visitor allows cookies.
