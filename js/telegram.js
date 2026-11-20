/* AstroSky as a Telegram Mini App. Loaded only inside Telegram (see the inline script at the top of
   index.html), after Telegram's SDK (js/vendor/telegram-web-app.js) and before the site's own scripts.
   - Telegram's launch parameters (#tgWebAppData=…) are replaced with #home; the router then moves to the home page.
   - The night-sky colours for Telegram's header and background; vertical swipes don't close the app,
     so the map and the wheel can be dragged.
   - Telegram's Back button follows the site's sections and closes open dialogs.
   - "Где я" uses Telegram's LocationManager: plain geolocation often doesn't work in its web view.
   - PDF: Telegram's web view can't save files, so the PDF goes to the share sheet, or the same chart opens
     in the browser (the state travels in the URL fragment, which never reaches the server).
   - Google sign-in doesn't work inside Telegram (Google refuses embedded browsers): the button is hidden by CSS. */
(function () {
  'use strict';
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.platform || tg.platform === 'unknown') return;
  const at = (v) => { try { return tg.isVersionAtLeast(v); } catch (e) { return false; } };
  const STORE = 'acg.v1';
  const BG = '#070C16';

  document.documentElement.classList.add('tg', 'tg-' + tg.platform);
  if (/tgWebApp/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#home');

  tg.ready();
  tg.expand();
  try {
    if (at('6.1')) { tg.setHeaderColor(BG); tg.setBackgroundColor(BG); }
    if (at('7.10')) tg.setBottomBarColor(BG);
    if (at('7.7')) tg.disableVerticalSwipes();
  } catch (e) { /* older clients */ }

  /* ------------------------------ Back button ------------------------------ */
  const view = () => (document.body && document.body.dataset.view) || 'home';   // loaded in <head>: no body yet
  const openDialog = () => document.querySelector('dialog[open]');
  function syncBack() {
    if (!at('6.1')) return;
    if (view() !== 'home' || openDialog()) tg.BackButton.show(); else tg.BackButton.hide();
  }
  if (at('6.1')) {
    tg.BackButton.onClick(() => {
      const d = openDialog();
      if (d) { d.close(); syncBack(); return; }
      if (history.length > 1) history.back(); else if (window.ROUTES && ROUTES.go) ROUTES.go('home'); else location.hash = '#home';
    });
    window.addEventListener('astrosky:view', () => {   // js/app.js: a section was opened
      syncBack();
      try { tg.HapticFeedback.selectionChanged(); } catch (e) { /* no haptics */ }
    });
    // dialogs (account, help) open and close without a change of section
    new MutationObserver(syncBack).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
    syncBack();
  }

  /* ------------------------------ geolocation ------------------------------ */
  const geo = navigator.geolocation;
  if (geo && at('8.0') && tg.LocationManager) {
    const LM = tg.LocationManager;
    const native = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = function (ok, fail, opts) {
      const err = (code, message) => { if (fail) fail({ code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); };
      const go = () => {
        if (!LM.isLocationAvailable) { native(ok, fail, opts); return; }
        if (LM.isAccessRequested && !LM.isAccessGranted) {
          tg.showConfirm('AstroSky не может узнать, где вы. Открыть настройки доступа к геопозиции?', (yes) => { if (yes) LM.openSettings(); });
          err(1, 'denied');
          return;
        }
        LM.getLocation((loc) => {
          if (!loc) { err(1, 'denied'); return; }
          ok({ timestamp: Date.now(), coords: { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.horizontal_accuracy || 1000,
            altitude: loc.altitude == null ? null : loc.altitude, altitudeAccuracy: null, heading: null, speed: null } });
        });
      };
      try { if (LM.isInited) go(); else LM.init(go); } catch (e) { native(ok, fail, opts); }
    };
  }

  /* ---------------------------------- PDF ---------------------------------- */
  // the chart on screen opens in the browser: the saved state in the URL fragment (#s=…&v=…), read by index.html
  function browserUrl() {
    let st = null;
    try { st = localStorage.getItem(STORE); } catch (e) { /* no storage */ }
    const v = view();
    if (!st) return `${location.origin}${location.pathname}#${v}`;
    // children's data leaves the app only for the chart being saved
    try {
      const o = JSON.parse(st);
      if (o.kids) {
        if (v === 'natal' && o.natal && o.natal.mode === 'child') o.kids = { list: o.kids.list.filter((k) => k.id === o.kids.cur), cur: o.kids.cur };
        else delete o.kids;
        st = JSON.stringify(o);
      }
    } catch (e) { /* send it as it is */ }
    const b64 = btoa(unescape(encodeURIComponent(st))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${location.origin}${location.pathname}#s=${b64}&v=${v}`;
  }
  function openInBrowser(message) {
    const go = () => tg.openLink(browserUrl());
    if (!at('6.2')) { go(); return; }
    tg.showPopup({ title: 'Скачать PDF', message, buttons: [{ id: 'open', type: 'default', text: 'Открыть в браузере' }, { type: 'cancel' }] },
      (id) => { if (id === 'open') go(); });
  }
  async function savePdf(blob, name) {
    const file = typeof File === 'function' ? new File([blob], name, { type: 'application/pdf' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    openInBrowser('Telegram не даёт сохранять файлы из мини-приложений. Эта карта откроется в браузере — там нажмите «Скачать PDF» ещё раз.');
  }

  window.TG = { webApp: tg, savePdf, openInBrowser };
})();
