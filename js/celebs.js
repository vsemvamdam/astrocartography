/* "Звёзды": well-known people with a sourced birth time (js/celebs-data.js, loaded on demand) and how close
   their charts are to yours. The resemblance is the usual comparison of the personal points: the same sign
   of the Sun, Moon and Ascendant matters most, then the MC and the personal planets, plus how close the
   points are in degrees and how similar the balance of elements and modalities is. The generational
   planets (Uranus, Neptune, Pluto) are left out: they are the same for everyone born in the same years. */
(function (root) {
  'use strict';
  const n360 = (x) => ((x % 360) + 360) % 360;
  const dist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const sign = (x) => Math.floor(n360(x) / 30);

  const CATS = [['all', 'Все'], ['actor', 'Кино'], ['music', 'Музыка'], ['sport', 'Спорт'], ['business', 'Бизнес и мода'],
    ['blogger', 'ТВ и блогеры'], ['culture', 'Искусство и литература'], ['science', 'Наука']];
  const CAT_RU = Object.fromEntries(CATS);
  const RATING = { AA: 'AA — по свидетельству или записи о рождении', A: 'A — со слов самого человека', B: 'B — по биографии' };

  // weight of a point: the same sign gives the weight, being close in degrees gives up to the weight again
  const W = { Sun: 3, Moon: 3, ASC: 3, MC: 1.5, Mercury: 1.5, Venus: 1.5, Mars: 1.5, Jupiter: 1, Saturn: 1 };
  const NEAR = 8;                                  // degrees within which closeness counts
  const BAL = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'ASC'];
  const BAL_W = { Sun: 2, Moon: 2, ASC: 2 };
  const EL_W = 2, CR_W = 1;
  const MAX = Object.values(W).reduce((s, w) => s + 2 * w, 0) + EL_W + CR_W;

  let state = root.ACG_CELEBS ? 'ready' : null;
  const waiting = [];
  function load(cb) {
    if (state === 'ready') { if (cb) cb(); return true; }
    if (cb) waiting.push(cb);
    if (state === 'loading') return false;
    state = 'loading';
    const core = document.querySelector('script[src*="acg-core.js"]'), v = core && core.src.split('?')[1];
    const sc = document.createElement('script');
    sc.src = `js/celebs-data.js${v ? '?' + v : ''}`;
    sc.onload = () => { state = 'ready'; index(); waiting.splice(0).forEach((f) => f()); };
    sc.onerror = () => { state = 'error'; waiting.splice(0).forEach((f) => f()); };
    document.head.appendChild(sc);
    return false;
  }
  let LIST = [];
  function index() {
    const D = root.ACG_CELEBS;
    if (!D) return;
    LIST = D.list.map((c) => {
      const P = {};
      D.points.forEach((id, i) => { P[id] = c.p[i]; });
      return Object.assign(c, { P, bal: balance(P) });
    });
  }
  if (state === 'ready') index();

  function balance(P) {
    const el = [0, 0, 0, 0], cr = [0, 0, 0];
    let n = 0;
    for (const id of BAL) {
      if (P[id] == null) continue;
      const w = BAL_W[id] || 1, s = sign(P[id]);
      el[s % 4] += w; cr[s % 3] += w; n += w;
    }
    return { el: el.map((x) => x / n), cr: cr.map((x) => x / n) };
  }
  const l1 = (a, b) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);

  /* you: {Sun: lon, …, ASC, MC}. Returns [{c, score (0…100), parts: [{id, kind: 'sign'|'near'|'el'|'cr', w, d?}]}] best first */
  function compare(you) {
    const yb = balance(you);
    return LIST.map((c) => {
      let s = 0;
      const parts = [];
      for (const id in W) {
        const a = you[id], b = c.P[id];
        if (a == null || b == null) continue;
        const same = sign(a) === sign(b), d = dist(a, b);
        const near = Math.max(0, 1 - d / NEAR);
        const v = W[id] * ((same ? 1 : 0) + near);
        s += v;
        if (v > 0) parts.push({ id, same, d, w: v, sign: sign(b) });
      }
      const el = EL_W * (1 - l1(yb.el, c.bal.el) / 2), cr = CR_W * (1 - l1(yb.cr, c.bal.cr) / 2);
      s += el + cr;
      // shown as an index from 0 to 100; the square root spreads the usual values (no two charts are alike in everything)
      return { c, score: Math.round(Math.sqrt(s / MAX) * 100), raw: s, parts: parts.sort((x, y) => y.w - x.w), el: el / EL_W, cr: cr / CR_W };
    }).sort((x, y) => y.raw - x.raw);
  }

  root.CELEBS = {
    CATS, CAT_RU, RATING,
    load, ready: () => state === 'ready', failed: () => state === 'error',
    list: () => LIST, byId: (id) => LIST.find((c) => c.id === id) || null,
    compare,
  };
})(typeof window !== 'undefined' ? window : globalThis);
