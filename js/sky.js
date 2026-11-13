/* The sky behind the site, in the spirit of the banner: deep space with a faint Milky Way, stars that
   twinkle (some brighter, some fainter) and now and then flash with four rays, and two cloud banks cut
   from the banner that drift slowly and part as the page scrolls. With "reduce motion" the sky is still. */
(function () {
  'use strict';
  const sky = document.getElementById('sky'), cv = document.getElementById('skyStars');
  if (!sky || !cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cloudL = sky.querySelector('.sky-cloud.l'), cloudR = sky.querySelector('.sky-cloud.r');
  const TINTS = ['255,255,255', '255,236,228', '236,214,226', '214,226,255'];
  let W = 0, H = 0, FH = 0, dpr = 1, stars = [], milky = null, glints = [], scroll = 0, nextGlint = 0, last = 0, raf = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    W = window.innerWidth; H = window.innerHeight; FH = Math.round(H * 1.4);   // a taller field, for the parallax
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const n = Math.max(120, Math.round((W * FH) / 5600));
    stars = [];
    for (let i = 0; i < n; i++) {
      const bright = Math.random() < 0.08;
      stars.push({
        x: Math.random() * W, y: Math.random() * FH,
        r: bright ? rnd(1.1, 1.8) : Math.random() < 0.7 ? rnd(0.35, 0.8) : rnd(0.8, 1.15),
        base: bright ? rnd(0.65, 0.95) : rnd(0.25, 0.7),
        amp: rnd(0.15, 0.5), speed: rnd(0.0006, 0.0022), phase: rnd(0, Math.PI * 2),
        tint: TINTS[Math.floor(Math.random() * TINTS.length)], bright,
      });
    }
    // the Milky Way: a soft diagonal band of fine dust, drawn once
    milky = document.createElement('canvas');
    milky.width = Math.round(W * dpr); milky.height = Math.round(FH * dpr);
    const m = milky.getContext('2d');
    m.scale(dpr, dpr);
    const x0 = W * 1.05, y0 = -FH * 0.05, x1 = -W * 0.1, y1 = FH * 0.75;          // from top right towards lower left
    const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len, nx = -uy, ny = ux;
    const band = Math.max(W, H) * 0.12;
    m.save();
    m.translate(x0, y0); m.rotate(Math.atan2(uy, ux));
    const g = m.createLinearGradient(0, -band * 1.6, 0, band * 1.6);
    g.addColorStop(0, 'rgba(120,100,150,0)'); g.addColorStop(0.5, 'rgba(150,120,170,0.10)'); g.addColorStop(1, 'rgba(120,100,150,0)');
    m.fillStyle = g; m.fillRect(0, -band * 1.6, len, band * 3.2);
    m.restore();
    const dust = Math.round((W * FH) / 1400);
    for (let i = 0; i < dust; i++) {
      const t = Math.random() * len, off = (Math.random() + Math.random() + Math.random() - 1.5) * band;
      const x = x0 + ux * t + nx * off, y = y0 + uy * t + ny * off;
      m.fillStyle = `rgba(${TINTS[i % 4]},${rnd(0.05, 0.3).toFixed(2)})`;
      m.fillRect(x, y, rnd(0.4, 1.1), rnd(0.4, 1.1));
    }
    draw(performance.now());
  }

  // a four-ray glint, like the stars on the banner: long vertical and horizontal rays, short diagonals
  function glint(x, y, k, tint) {
    const L = 7 + 30 * k, l = L * 0.45;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(x, y, 0, x, y, 10 + 10 * k);
    halo.addColorStop(0, `rgba(${tint},${0.55 * k})`); halo.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 10 + 10 * k, 0, Math.PI * 2); ctx.fill();
    const ray = (dx, dy, len, w) => {
      const gr = ctx.createLinearGradient(x, y, x + dx * len, y + dy * len);
      gr.addColorStop(0, `rgba(${tint},${0.95 * k})`); gr.addColorStop(1, `rgba(${tint},0)`);
      ctx.strokeStyle = gr; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * len, y + dy * len); ctx.stroke();
    };
    ray(0, -1, L * 1.25, 1.1); ray(0, 1, L * 1.25, 1.1); ray(-1, 0, L, 1); ray(1, 0, L, 1);
    const d = Math.SQRT1_2;
    ray(d, d, l, 0.7); ray(-d, d, l, 0.7); ray(d, -d, l, 0.7); ray(-d, -d, l, 0.7);
    ctx.restore();
  }

  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const off = (scroll * 0.05) % FH;                                            // stars drift up slowly as you scroll
    const sy = (y) => { let v = y - off; if (v < -20) v += FH; return v; };
    if (milky) {
      ctx.drawImage(milky, 0, off * dpr, milky.width, Math.min(milky.height - off * dpr, H * dpr), 0, 0, W, Math.min(H, FH - off));
      if (FH - off < H) ctx.drawImage(milky, 0, 0, milky.width, (H - (FH - off)) * dpr, 0, FH - off, W, H - (FH - off));
    }
    for (const s of stars) {
      const y = sy(s.y);
      if (y > H + 4) continue;
      const a = still ? s.base : Math.max(0, s.base + s.amp * Math.sin(t * s.speed + s.phase) * (s.bright ? 0.6 : 1));
      ctx.fillStyle = `rgba(${s.tint},${Math.min(1, a).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, Math.PI * 2); ctx.fill();
      if (s.bright && a > 0.7) {
        const h = ctx.createRadialGradient(s.x, y, 0, s.x, y, s.r * 5);
        h.addColorStop(0, `rgba(${s.tint},${(0.25 * a).toFixed(3)})`); h.addColorStop(1, `rgba(${s.tint},0)`);
        ctx.fillStyle = h; ctx.beginPath(); ctx.arc(s.x, y, s.r * 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (still) return;
    // now and then a star flashes: brighter ones flash harder
    if (t > nextGlint) {
      const pool = stars.filter((s) => { const y = sy(s.y); return y > 10 && y < H * 0.85 && s.r > 0.7; });
      if (pool.length) { const s = pool[Math.floor(Math.random() * pool.length)]; glints.push({ s, t0: t, dur: rnd(1300, 2200), k: s.bright ? rnd(0.75, 1) : rnd(0.35, 0.65) }); }
      nextGlint = t + rnd(900, 2600);
    }
    glints = glints.filter((gl) => t - gl.t0 < gl.dur);
    for (const gl of glints) {
      const p = (t - gl.t0) / gl.dur, k = Math.sin(Math.PI * p) ** 2 * gl.k;
      glint(gl.s.x, sy(gl.s.y), k, gl.s.tint);
    }
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (t - last < 33) return;                                                   // about 30 frames a second is plenty
    last = t;
    draw(t);
  }

  // the clouds sink and part as the page scrolls; the page scrolls in the window on phones and inside
  // each section on wide screens, so the scroll is taken from whichever of them moved
  function clouds() {
    const k = Math.min(scroll, 1800);
    if (cloudL) cloudL.style.transform = `translate3d(${(-k * 0.04).toFixed(1)}px, ${(k * 0.1).toFixed(1)}px, 0)`;
    if (cloudR) cloudR.style.transform = `translate3d(${(k * 0.04).toFixed(1)}px, ${(k * 0.08).toFixed(1)}px, 0)`;
  }
  function onScroll(e) {
    const el = e.target === document ? document.scrollingElement : e.target;
    if (!el || (e.target !== document && !(el.classList && el.classList.contains('natal')))) return;
    scroll = el.scrollTop || 0;
    if (still) draw(0); else clouds();
  }
  function resetScroll() {
    const sec = [...document.querySelectorAll('.natal')].find((s) => !s.hidden);
    scroll = Math.max(window.scrollY || 0, sec ? sec.scrollTop : 0);
    clouds(); draw(performance.now());
  }

  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 150); });
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('hashchange', () => setTimeout(resetScroll, 0));
  document.addEventListener('visibilitychange', () => {
    if (still) return;
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) raf = requestAnimationFrame(loop);
  });
  build();
  if (!still) raf = requestAnimationFrame(loop);
})();
