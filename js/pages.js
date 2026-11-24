/* The text about the open page, the footer, the documents, cookies and Yandex Metrica.
   - js/app.js announces every page change ('astrosky:route' with the page from js/routes.js). The block under the
     section gets that page's text (js/page-texts.js), a document page gets its document, and the block with the
     footer moves to the end of the open section on a computer (each section scrolls by itself there) or to the end
     of the page on a phone.
   - Yandex Metrica: put the counter's number into METRIKA_ID. It loads only after the visitor allows cookies in the
     bar at the bottom; with METRIKA_ID = 0 there is no Metrica and nobody is asked.
   Loaded before js/app.js so it hears the first page. */
(function () {
  'use strict';
  const METRIKA_ID = 114639698;          // Yandex Metrica counter (metrika.yandex.ru → the counter's number); 0: off
  const CHOICE = 'astrosky.cookies';     // localStorage: 'yes' or 'no'
  const T = window.PAGE_TEXTS || { SECTIONS: {}, DOCS: {}, aboutHtml: () => '' };
  const $ = (id) => document.getElementById(id);
  const desk = window.matchMedia('(min-width: 900px)');
  let shown = null;    // the address whose text is on screen
  let hitUrl = null;   // the last address sent to Metrica

  /* --------------------------- text and footer --------------------------- */
  function show(page) {
    const about = $('pageAbout'), doc = $('docOut');
    if (!about || !page || page.path === shown) return;
    shown = page.path;
    if (page.spec.startsWith('doc:')) {
      if (doc) doc.innerHTML = T.DOCS[page.path] || '';
      about.hidden = true;
    } else {
      about.innerHTML = T.aboutHtml(page.path);
      about.hidden = !about.innerHTML;
    }
  }
  // the end of the open section (computer) or of the page (phone); on the map the panel beside it
  function place() {
    const tail = $('pageTail'), app = $('app'), v = document.body.dataset.view;
    if (!tail || !app || !v) return;
    const host = desk.matches ? (v === 'map' ? $('panel') : $(`${v}View`)) : null;
    if (host) { if (tail.parentNode !== host) host.appendChild(tail); }
    else if (app.nextElementSibling !== tail) app.after(tail);
    const acc = $('accBtn'), foot = $('footAcc');
    if (foot) foot.hidden = !(acc && !acc.hidden);   // the account exists only where Firebase is set up
  }

  /* ------------------------ cookies, Yandex Metrica ------------------------ */
  const choice = () => { try { return localStorage.getItem(CHOICE); } catch (e) { return null; } };
  const setChoice = (v) => { try { if (v) localStorage.setItem(CHOICE, v); else localStorage.removeItem(CHOICE); } catch (e) { /* no storage */ } };
  function bar(on) { const b = $('cookieBar'); if (b) b.hidden = !on; }
  function hit() {
    if (!window.ym || hitUrl === location.href) return;
    window.ym(METRIKA_ID, 'hit', location.href, { title: document.title, referer: hitUrl || document.referrer });
    hitUrl = location.href;
  }
  function metrika(sendHit) {
    if (!METRIKA_ID || choice() !== 'yes') return;
    if (!window.ym) {
      /* Yandex's tag, as on metrika.yandex.ru; defer: the site sends each page itself, the address changes without reloads */
      (function (m, e, t, r, i, k, a) {
        m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); }; m[i].l = 1 * new Date();
        k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
      })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
      window.ym(METRIKA_ID, 'init', { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
    }
    if (sendHit) hit();
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'account') { const acc = $('accBtn'); if (acc) acc.click(); }
    else if (act === 'cookies-yes') { setChoice('yes'); bar(false); metrika(true); }
    else if (act === 'cookies-no') { setChoice('no'); bar(false); }
    else if (act === 'cookies-reset') { setChoice(null); bar(true); }
  });

  window.addEventListener('astrosky:route', (e) => { show(e.detail); place(); metrika(true); });
  window.addEventListener('astrosky:view', place);
  if (desk.addEventListener) desk.addEventListener('change', place); else if (desk.addListener) desk.addListener(place);

  if (METRIKA_ID) {
    document.body.classList.add('has-metrika');
    if (!choice()) bar(true);
  }
})();
