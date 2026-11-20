# AstroSky (astrosky.pro)

- Every section and mode has its own address, listed in `js/routes.js`. After editing that list, or the `<!--seo-->` block of `index.html`, run `node tools/build_pages.js` and commit what it writes (`*.html` page stubs in the root, `sitemap.xml`, `index.html`).
- Never put `{{` or `{%` in `index.html`: GitHub Pages (Jekyll) builds the section pages from it and would fail.
- Navigate with `ROUTES.go('natal:solar')` (or links to the section's address), not `location.hash`.
- Local preview with every address: `node tools/build_pages.js --serve` → http://localhost:8080/.
