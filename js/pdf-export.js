/* PDF export of a chart and its reading: the wheel, the tables and every section of the reading on
   light A4 pages. jsPDF and the DejaVu Sans fonts (Cyrillic and the astrological glyphs) live in the
   repository and load only when someone asks for a PDF. natal-view.js builds the model:
   { filename, kicker, title, subtitle, wheel: <svg>, tables: [{ title, cols, widths, rows }],
     sections: [{ title, note, items: [{ glyph, color, head, text, tone, indent, house }] }] } */
(function () {
  'use strict';
  const SUB = { '⚹': '✶', '⚻': '⊼' };     // DejaVu Sans has no sextile or quincunx glyph
  const clean = (s) => String(s == null ? '' : s).replace(/[︎️]/g, '').replace(/[⚹⚻]/g, (c) => SUB[c]).replace(/ /g, ' ');
  // the site's planet colours are made for a dark page: light ones are darkened to read on white paper
  const rgb = (hex, fb) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return fb;
    const c = [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    const L = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
    return L > 0.5 ? c.map((v) => Math.round(v * 0.5 / L)) : c;
  };
  const INK = [24, 30, 44], MUTED = [112, 120, 136], BRASS = [150, 110, 36], RULE = [222, 216, 202], ZEBRA = [247, 244, 237];
  const GOOD = [46, 158, 122], BAD = [217, 72, 59], NEUTRAL = [190, 180, 160];

  let libP = null;
  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Не удалось загрузить ' + src));
    document.head.appendChild(s);
  });
  async function fetchB64(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Не удалось загрузить ' + url);
    const u8 = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function lib() {
    if (!libP) {
      libP = Promise.all([window.jspdf ? null : loadScript('js/vendor/jspdf.umd.min.js?v=2.5.2'), fetchB64('assets/fonts/DejaVuSans.ttf'), fetchB64('assets/fonts/DejaVuSans-Bold.ttf')])
        .then(([, reg, bold]) => ({ reg, bold }))
        .catch((e) => { libP = null; throw e; });
    }
    return libP;
  }

  // the wheel as a PNG: the page's #wheel rules and colour variables travel inside the SVG,
  // the whole circle is shown whatever the zoom, and nothing is dimmed or highlighted
  async function wheelImage(svg, px) {
    const NS = 'http://www.w3.org/2000/svg';
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', NS);
    clone.setAttribute('viewBox', '-62 -62 1124 1124');
    clone.setAttribute('width', px); clone.setAttribute('height', px);
    clone.removeAttribute('style');
    clone.querySelectorAll('.dim').forEach((el) => el.classList.remove('dim'));
    clone.querySelectorAll('.on').forEach((el) => el.classList.remove('on'));
    let css = '';
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules) {
        if (!r.selectorText) continue;
        if (r.selectorText.includes('#wheel')) css += r.cssText + '\n';
        else if (r.selectorText === ':root') css += r.cssText.replace(':root', 'svg') + '\n';
      }
    }
    const st = document.createElementNS(NS, 'style');
    st.textContent = css;
    clone.insertBefore(st, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = new Image();
      img.src = url;
      await (img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej; }));
      const c = document.createElement('canvas');
      c.width = c.height = px;
      c.getContext('2d').drawImage(img, 0, 0, px, px);
      return c.toDataURL('image/png');
    } finally { URL.revokeObjectURL(url); }
  }

  async function save(model) {
    const fonts = await lib();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.addFileToVFS('DejaVuSans.ttf', fonts.reg); doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
    doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold); doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
    const W = 210, H = 297, M = 16, CW = W - 2 * M, BOTTOM = H - 16;
    const PT = 0.3528;                       // mm in a point
    let y = M;
    const font = (size, style, color) => { doc.setFont('DejaVu', style || 'normal'); doc.setFontSize(size); doc.setTextColor(...(color || INK)); };
    const newPage = () => { doc.addPage(); y = M; };
    const ensure = (h) => { if (y + h > BOTTOM) newPage(); };
    const lines = (text, size, style, width) => { font(size, style); return doc.splitTextToSize(clean(text), width); };
    // a block of wrapped lines; y is the top of the first line
    const write = (ls, size, style, color, x, lh) => {
      const step = size * PT * (lh || 1.42);
      for (const ln of ls) { ensure(step); font(size, style, color); doc.text(ln, x, y + size * PT * 0.9); y += step; }
    };

    /* ------------------------------- title ------------------------------- */
    font(8.5, 'bold', BRASS);
    doc.text(clean(`ASTROSKY · ${model.kicker || ''}`.toUpperCase()), M, y + 3, { charSpace: 0.6 });
    y += 7;
    write(lines(model.title, 19, 'bold', CW), 19, 'bold', INK, M, 1.25);
    y += 1;
    if (model.subtitle) write(lines(model.subtitle, 8.8, 'normal', CW), 8.8, 'normal', MUTED, M, 1.45);
    y += 3;
    doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.line(M, y, W - M, y);
    y += 5;

    /* ------------------------------- wheel ------------------------------- */
    if (model.wheel) {
      try {
        const png = await wheelImage(model.wheel, 1500);
        const size = 150;
        ensure(size);
        doc.addImage(png, 'PNG', (W - size) / 2, y, size, size, undefined, 'FAST');
        y += size + 6;
      } catch (e) { console.error(e); }
    }

    /* ------------------------------- tables ------------------------------ */
    for (const t of model.tables || []) {
      const ws = t.widths.map((f) => f * CW), pad = 1.6, size = 8.8;
      const rowLines = (cells, style) => cells.map((cell, i) => lines(typeof cell === 'object' && cell ? cell.text : cell, size, style, ws[i] - 2 * pad));
      const step = size * PT * 1.35;
      const head = rowLines(t.cols, 'bold');
      const headH = Math.max(...head.map((l) => l.length)) * step + 2 * pad;
      ensure(12 + headH + 8);
      y += 2;
      write(lines(t.title, 12, 'bold', CW), 12, 'bold', BRASS, M, 1.3);
      y += 1;
      const drawHead = () => {
        let x = M;
        head.forEach((ls, i) => { ls.forEach((ln, k) => { font(size, 'bold', MUTED); doc.text(ln, x + pad, y + pad + k * step + size * PT * 0.9); }); x += ws[i]; });
        y += headH;
        doc.setDrawColor(...RULE); doc.line(M, y, W - M, y);
      };
      drawHead();
      t.rows.forEach((cells, r) => {
        const ls = rowLines(cells, 'normal'), h = Math.max(...ls.map((l) => l.length)) * step + 2 * pad;
        if (y + h > BOTTOM) { newPage(); drawHead(); }
        if (r % 2) { doc.setFillColor(...ZEBRA); doc.rect(M, y, CW, h, 'F'); }
        let x = M;
        ls.forEach((cl, i) => {
          const cell = cells[i], color = cell && typeof cell === 'object' && cell.color ? rgb(cell.color, INK) : INK;
          cl.forEach((ln, k) => { font(size, cell && cell.bold ? 'bold' : 'normal', color); doc.text(ln, x + pad, y + pad + k * step + size * PT * 0.9); });
          x += ws[i];
        });
        y += h;
      });
      y += 5;
    }

    /* ------------------------------ reading ------------------------------ */
    for (const sec of model.sections || []) {
      if (!sec.items || !sec.items.length) continue;
      ensure(30);
      y += 3;
      write(lines(sec.title, 13.5, 'bold', CW), 13.5, 'bold', BRASS, M, 1.3);
      if (sec.note) { y += 0.5; write(lines(sec.note, 8.5, 'normal', CW), 8.5, 'normal', MUTED, M, 1.4); }
      y += 2.5;
      for (const it of sec.items) {
        const ind = (it.indent ? 7 : 0) + 4.2, width = CW - ind;
        const headTxt = `${it.glyph ? it.glyph + '  ' : ''}${it.head || ''}`;
        const hl = it.head ? lines(headTxt, it.house ? 11 : 10.2, 'bold', width) : [];
        const tl = it.text ? lines(it.text, 9.6, 'normal', width) : [];
        const hH = hl.length * 10.2 * PT * 1.35, tH = tl.length * 9.6 * PT * 1.45, total = hH + tH + 3.2;
        ensure(Math.min(total, 60));
        const page0 = doc.getNumberOfPages(), top = y, bar = it.tone === 'soft' ? GOOD : it.tone === 'hard' ? BAD : it.house ? BRASS : NEUTRAL;
        // the head: the glyph in its colour, then the head in ink
        if (hl.length) {
          if (it.glyph && it.color) {
            const size = it.house ? 11 : 10.2;
            font(size, 'bold', rgb(it.color, INK));
            doc.text(clean(it.glyph), M + ind, y + size * PT * 0.9);
            const gw = doc.getTextWidth(clean(it.glyph) + '  ');
            const rest = lines(it.head, size, 'bold', width - gw);
            font(size, 'bold', INK);
            doc.text(rest[0], M + ind + gw, y + size * PT * 0.9);
            y += size * PT * 1.35;
            if (rest.length > 1) write(lines(rest.slice(1).join(' '), size, 'bold', width), size, 'bold', INK, M + ind, 1.35);
          } else write(hl, it.house ? 11 : 10.2, 'bold', INK, M + ind, 1.35);
        }
        if (tl.length) { y += 0.6; write(tl, 9.6, 'normal', INK, M + ind, 1.45); }
        // a thin bar on the left: green for harmony, red for tension
        if (doc.getNumberOfPages() === page0 && y > top) {
          doc.setFillColor(...bar); doc.rect(M + (it.indent ? 7 : 0), top + 0.6, 1.1, y - top - 0.6, 'F');
        }
        y += it.house ? 2.2 : 3.2;
      }
      y += 2;
    }

    /* ------------------------------- footer ------------------------------ */
    const n = doc.getNumberOfPages();
    const made = new Date();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      font(7.5, 'normal', MUTED);
      doc.text(clean(`AstroSky · ${model.title}`).slice(0, 110), M, H - 9);
      doc.text(`${i} / ${n}`, W - M, H - 9, { align: 'right' });
      if (i === 1) doc.text(`Создано ${made.toLocaleDateString('ru-RU')}`, W - M, M - 6, { align: 'right' });
    }
    doc.save(clean(model.filename || 'AstroSky.pdf').replace(/[\\/:*?"<>|]+/g, ' ').trim());
  }

  window.AstroPDF = { save, preload: () => lib().catch(() => null) };
})();
