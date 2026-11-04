/* Personal account on Firebase: email + password sign-up with email confirmation, password reset,
   change of password, and saved charts in Firestore (users/{uid}/charts/{id}).
   The SDK is loaded only when js/firebase-config.js has a config. */
(function () {
  'use strict';
  const V = '10.12.2';
  const SDK = ['app', 'auth', 'firestore'].map((n) => `https://www.gstatic.com/firebasejs/${V}/firebase-${n}-compat.js`);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ERR = {
    'auth/invalid-email': 'Похоже, в адресе почты ошибка.',
    'auth/missing-email': 'Введите почту.',
    'auth/missing-password': 'Введите пароль.',
    'auth/user-not-found': 'Неверная почта или пароль.',
    'auth/wrong-password': 'Неверная почта или пароль.',
    'auth/invalid-credential': 'Неверная почта или пароль.',
    'auth/invalid-login-credentials': 'Неверная почта или пароль.',
    'auth/email-already-in-use': 'Этот адрес уже зарегистрирован. Войдите или восстановите пароль.',
    'auth/weak-password': 'Слишком простой пароль: нужно не меньше 6 символов.',
    'auth/password-does-not-meet-requirements': 'Пароль не подходит по требованиям безопасности: сделайте его длиннее и добавьте цифры.',
    'auth/too-many-requests': 'Слишком много попыток. Подождите несколько минут и попробуйте снова.',
    'auth/network-request-failed': 'Нет связи с сервером. Проверьте интернет.',
    'auth/operation-not-allowed': 'Вход по почте выключен в настройках Firebase (Authentication → Sign-in method → Email/Password).',
    'auth/requires-recent-login': 'Для этого нужно заново ввести текущий пароль.',
    'auth/user-disabled': 'Этот аккаунт отключён.',
    'auth/unauthorized-domain': 'Этот сайт не добавлен в Firebase (Authentication → Settings → Authorized domains).',
    'auth/popup-blocked': 'Браузер не дал открыть окно входа Google. Разрешите всплывающие окна для сайта и нажмите ещё раз.',
    'auth/account-exists-with-different-credential': 'Этот адрес уже зарегистрирован с паролем. Войдите по почте и паролю.',
    'auth/web-storage-unsupported': 'Браузер блокирует хранение данных входа. Выключите приватный режим или разрешите cookies.',
    'permission-denied': 'Нет доступа к данным. Проверьте правила Firestore.',
    'unavailable': 'Сервер недоступен. Попробуйте чуть позже.',
  };
  const errText = (e) => ERR[e && e.code] || (e && e.message ? `Ошибка: ${e.message}` : 'Что-то пошло не так.');
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const ruDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : ''; };

  let app = null, cfg = null, ready = null, auth = null, db = null, fb = null;
  let user = null, charts = [], unsub = null, dlg = null, screen = 'login', note = null, busy = false, saveName = '';

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = res; s.onerror = () => rej(new Error('Не удалось загрузить ' + src));
      document.head.appendChild(s);
    });
  }
  function boot() {
    if (ready) return ready;
    ready = (async () => {
      for (const src of SDK) await loadScript(src);
      fb = window.firebase;
      fb.initializeApp(cfg);
      auth = fb.auth();
      auth.languageCode = 'ru';
      db = fb.firestore();
      auth.onAuthStateChanged((u) => { user = u; onUser(); });
    })();
    ready.catch(() => { ready = null; });
    return ready;
  }
  const chartsRef = () => db.collection('users').doc(user.uid).collection('charts');
  const actionSettings = () => ({ url: location.origin + location.pathname });
  // the continue link needs the domain in Firebase's authorized list; without it, send the plain email
  async function withContinue(fn) {
    try { await fn(actionSettings()); }
    catch (e) { if (/continue-uri|unauthorized-domain/.test(e.code || '')) await fn(undefined); else throw e; }
  }

  /* --------------------------------- state --------------------------------- */
  function onUser() {
    if (unsub) { unsub(); unsub = null; }
    charts = [];
    if (user) {
      unsub = chartsRef().orderBy('createdAt', 'desc').onSnapshot((snap) => {
        charts = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        renderCharts(); renderPartnerPicker();
      }, (e) => { note = { t: errText(e) }; if (screen === 'profile') render(); });
      if (screen !== 'profile') { screen = 'profile'; if (dlg && dlg.open) note = note && note.keep ? note : null; }
    } else if (screen === 'profile') screen = 'login';
    renderButton(); renderPartnerPicker();
    if (dlg && dlg.open) render();
  }
  function renderButton() {
    const b = $('accBtn');
    b.hidden = false;
    b.classList.toggle('in', !!user);
    $('accBtnText').textContent = user ? (user.displayName || user.email.split('@')[0]) : 'Войти';
    b.setAttribute('aria-label', user ? `Личный кабинет: ${user.email}` : 'Войти в личный кабинет');
  }
  function renderPartnerPicker() {
    const box = $('pSavedBox'), sel = $('pSaved');
    if (!box) return;
    box.hidden = !user || !charts.length;
    sel.innerHTML = '<option value="">Выберите карту</option>' + charts.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} · ${esc(ruDate(c.date))}</option>`).join('');
  }

  /* --------------------------------- dialog -------------------------------- */
  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'acc-dlg';
    dlg.setAttribute('aria-labelledby', 'accTitle');
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) { dlg.close(); return; }
      const a = e.target.closest('[data-act]');
      if (a) { e.preventDefault(); act(a.dataset.act, a.dataset.id); }
    });
    dlg.addEventListener('submit', (e) => { e.preventDefault(); submit(e.target.dataset.form, e.target); });
    dlg.addEventListener('input', (e) => { if (e.target.id === 'accSaveName') saveName = e.target.value; });
    return dlg;
  }
  async function open() {
    ensureDialog();
    note = null;
    screen = user ? 'profile' : 'login';
    render();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    try { await boot(); }
    catch (e) { note = { t: 'Не удалось загрузить модуль входа. Проверьте интернет и обновите страницу.' }; render(); }
  }
  const field = (id, label, type, extra) => `<div class="field"><label for="${id}">${label}</label><input class="inp" id="${id}" name="${id}" type="${type}" ${extra || ''}></div>`;
  const head = (title) => `<div class="acc-head"><h2 id="accTitle">${title}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Закрыть"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg></button></div>`;
  const noteHtml = () => note ? `<div class="acc-msg${note.ok ? ' ok' : ''}" role="status">${esc(note.t)}</div>` : '';
  const googleBtn = () => `<div class="acc-or"><span>или</span></div><button type="button" class="btn-line btn-google" data-act="google">Войти через Google</button>`;
  const btn = (text) => `<button type="submit" class="btn-main"${busy ? ' disabled' : ''}>${busy ? 'Подождите…' : text}</button>`;

  function render() {
    if (!dlg) return;
    let h = '';
    if (screen === 'login') {
      h = head('Вход') + `<div class="acc-body">${noteHtml()}
        <p class="muted">Войдите, чтобы сохранять карты и открывать их с любого устройства.</p>
        <form data-form="login" novalidate>
          ${field('accEmail', 'Почта', 'email', 'autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" required')}
          ${field('accPass', 'Пароль', 'password', 'autocomplete="current-password" required')}
          ${btn('Войти')}
        </form>
        ${googleBtn()}
        <div class="acc-links"><button type="button" class="link-btn" data-act="reset">Забыли пароль?</button><button type="button" class="link-btn" data-act="register">Зарегистрироваться</button></div>
      </div>`;
    } else if (screen === 'register') {
      h = head('Регистрация') + `<div class="acc-body">${noteHtml()}
        <form data-form="register" novalidate>
          ${field('accName', 'Имя (необязательно)', 'text', 'autocomplete="name" autocapitalize="words"')}
          ${field('accEmail', 'Почта', 'email', 'autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required')}
          ${field('accPass', 'Придумайте пароль', 'password', 'autocomplete="new-password" minlength="6" required')}
          ${field('accPass2', 'Повторите пароль', 'password', 'autocomplete="new-password" minlength="6" required')}
          <p class="muted">Пароль — не короче 6 символов. После регистрации придёт письмо со ссылкой для подтверждения почты.</p>
          ${btn('Создать аккаунт')}
        </form>
        ${googleBtn()}
        <div class="acc-links"><button type="button" class="link-btn" data-act="login">Уже есть аккаунт? Войти</button></div>
      </div>`;
    } else if (screen === 'reset') {
      h = head('Восстановление пароля') + `<div class="acc-body">${noteHtml()}
        <p class="muted">Пришлём на почту ссылку, по которой можно задать новый пароль.</p>
        <form data-form="reset" novalidate>
          ${field('accEmail', 'Почта', 'email', 'autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required')}
          ${btn('Отправить ссылку')}
        </form>
        <div class="acc-links"><button type="button" class="link-btn" data-act="login">Вернуться ко входу</button></div>
      </div>`;
    } else if (screen === 'password') {
      h = head('Смена пароля') + `<div class="acc-body">${noteHtml()}
        <form data-form="password" novalidate>
          ${field('accOld', 'Текущий пароль', 'password', 'autocomplete="current-password" required')}
          ${field('accPass', 'Новый пароль', 'password', 'autocomplete="new-password" minlength="6" required')}
          ${field('accPass2', 'Повторите новый пароль', 'password', 'autocomplete="new-password" minlength="6" required')}
          ${btn('Сменить пароль')}
        </form>
        <div class="acc-links"><button type="button" class="link-btn" data-act="profile">Назад</button></div>
      </div>`;
    } else {
      const cur = app.current(), p = app.state.partner;
      const partnerReady = p && p.date && p.time && p.place;
      if (!saveName) saveName = 'Моя карта';
      h = head('Личный кабинет') + `<div class="acc-body">${noteHtml()}
        <div class="acc-who"><b>${esc(user ? user.displayName || user.email : '')}</b>${user && user.displayName ? `<small>${esc(user.email)}</small>` : ''}
          <small>${user && user.emailVerified ? 'Почта подтверждена' : 'Почта не подтверждена'}</small></div>
        ${user && !user.emailVerified ? `<div class="acc-msg ok">Мы отправили письмо на ${esc(user.email)}. Откройте ссылку из него (проверьте и «Спам»), потом нажмите «Я подтвердил(а)».
          <div class="acc-links" style="margin-top:8px"><button type="button" class="link-btn" data-act="verified">Я подтвердил(а)</button><button type="button" class="link-btn" data-act="resend">Отправить ещё раз</button></div></div>` : ''}
        <section class="acc-sec"><h3>Сохранить текущую карту</h3>
          <p class="muted" style="margin-bottom:8px">${esc(ruDate(cur.date))}, ${esc(cur.time)}, ${esc(cur.place.name)}</p>
          <form data-form="save" class="acc-save" novalidate><input class="inp" id="accSaveName" maxlength="60" value="${esc(saveName)}" aria-label="Название карты"><button type="submit" class="btn-line"${busy ? ' disabled' : ''}>Сохранить</button></form>
          ${partnerReady ? `<button type="button" class="link-btn" data-act="savePartner" style="margin-top:6px">Сохранить и карту партнёра${p.name ? ` (${esc(p.name)})` : ''}</button>` : ''}
        </section>
        <section class="acc-sec"><h3>Мои карты</h3><ul class="acc-list" id="accCharts"></ul></section>
        <div class="acc-links">${hasPassword() ? '<button type="button" class="link-btn" data-act="password">Сменить пароль</button>' : `<span class="muted">${viaGoogle() ? 'Вход через Google' : ''}</span>`}<button type="button" class="link-btn" data-act="logout">Выйти</button></div>
      </div>`;
    }
    dlg.innerHTML = h;
    if (screen === 'profile') renderCharts();
    const first = dlg.querySelector('input:not([type=hidden])');
    if (first && screen !== 'profile' && !('ontouchstart' in window)) first.focus();
  }
  function renderCharts() {
    const ul = dlg && dlg.open && $('accCharts');
    if (!ul) return;
    ul.innerHTML = charts.length ? charts.map((c) => `<li>
        <span class="al-n">${esc(c.name)}</span>
        <span class="al-m">${esc(ruDate(c.date))} · ${esc(c.time)} · ${esc(c.place && c.place.name)}</span>
        <span class="al-b"><button type="button" class="link-btn" data-act="open" data-id="${esc(c.id)}">Открыть</button><button type="button" class="link-btn" data-act="asPartner" data-id="${esc(c.id)}">Как партнёра</button><button type="button" class="link-btn del" data-act="del" data-id="${esc(c.id)}">Удалить</button></span>
      </li>`).join('') : '<li class="acc-empty">Пока пусто. Сохраните карту, и она появится здесь.</li>';
  }

  /* -------------------------------- actions -------------------------------- */
  const providers = () => (user && user.providerData ? user.providerData.map((p) => p && p.providerId) : []);
  const hasPassword = () => providers().includes('password');
  const viaGoogle = () => providers().includes('google.com');
  // the popup must open within the tap, so call it right away when the SDK is already loaded
  async function googleSignIn() {
    if (!auth) await boot();
    const provider = new fb.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await auth.signInWithPopup(provider);     // onAuthStateChanged switches the dialog to the profile
    } catch (e) {
      if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return;
      if (e && e.code === 'auth/operation-not-allowed') note = { t: 'Вход через Google ещё не включён в Firebase (Authentication → Sign-in method → Google).' };
      else note = { t: errText(e) };
      render();
    }
  }
  const cleanPlace = (p) => ({ name: p.name || '', country: p.country || '', lat: +p.lat, lon: +p.lon, tz: p.tz || 'UTC' });
  async function act(a, id) {
    if (a === 'close') { dlg.close(); return; }
    if (['login', 'register', 'reset', 'password', 'profile'].includes(a)) { screen = a; note = null; render(); return; }
    if (a === 'google') { await googleSignIn(); return; }
    try {
      await boot();
      const c = charts.find((x) => x.id === id);
      if (a === 'logout') { await auth.signOut(); screen = 'login'; note = { t: 'Вы вышли из аккаунта.', ok: true }; render(); }
      else if (a === 'resend') { await withContinue((s) => user.sendEmailVerification(s)); note = { t: `Письмо отправлено на ${user.email}.`, ok: true }; render(); }
      else if (a === 'verified') { await user.reload(); user = auth.currentUser; note = user.emailVerified ? { t: 'Почта подтверждена.', ok: true } : { t: 'Пока не видим подтверждения. Откройте ссылку из письма и попробуйте ещё раз.' }; renderButton(); render(); }
      else if (a === 'open' && c) { app.loadChart({ date: c.date, time: c.time, place: c.place, manualOffset: c.manualOffset == null ? null : c.manualOffset }); dlg.close(); }
      else if (a === 'asPartner' && c) {
        app.setPartner({ name: c.name, date: c.date, time: c.time, place: c.place, manualOffset: c.manualOffset == null ? null : c.manualOffset });
        app.state.natal = Object.assign({}, app.state.natal, { mode: 'synastry' }); app.save();
        dlg.close(); location.hash = '#natal'; if (window.NatalView) NatalView.update();
      }
      else if (a === 'del' && c) { if (confirm(`Удалить карту «${c.name}»?`)) await chartsRef().doc(c.id).delete(); }
      else if (a === 'savePartner') {
        const p = app.state.partner;
        await chartsRef().add({ name: p.name || 'Партнёр', date: p.date, time: p.time, place: cleanPlace(p.place), manualOffset: p.manualOffset == null ? null : p.manualOffset, createdAt: fb.firestore.FieldValue.serverTimestamp() });
        note = { t: 'Карта партнёра сохранена.', ok: true }; render();
      }
    } catch (e) { note = { t: errText(e) }; render(); }
  }
  async function submit(kind, form) {
    const v = (id) => { const el = form.querySelector('#' + id); return el ? el.value.trim() : ''; };
    const raw = (id) => { const el = form.querySelector('#' + id); return el ? el.value : ''; };
    note = null;
    const keep = { email: v('accEmail'), name: v('accName') };
    const fail = (t) => { note = { t }; render(); refill(keep); };
    if (kind === 'register' || kind === 'password') {
      if (raw('accPass').length < 6) return fail('Пароль должен быть не короче 6 символов.');
      if (raw('accPass') !== raw('accPass2')) return fail('Пароли не совпадают.');
    }
    if ((kind === 'login' || kind === 'register' || kind === 'reset') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(keep.email)) return fail('Проверьте адрес почты.');
    if (kind === 'save' && !v('accSaveName')) return fail('Дайте карте название.');
    busy = true;
    render(); refill(keep);
    try {
      await boot();
      if (kind === 'login') {
        await auth.signInWithEmailAndPassword(keep.email, raw('accPass'));
      } else if (kind === 'register') {
        const pass = raw('accPass');
        const cred = await auth.createUserWithEmailAndPassword(keep.email, pass);
        if (keep.name) await cred.user.updateProfile({ displayName: keep.name });
        await withContinue((s) => cred.user.sendEmailVerification(s));
        user = auth.currentUser; screen = 'profile';
        note = { t: 'Аккаунт создан.', ok: true, keep: true };
        renderButton();
      } else if (kind === 'reset') {
        await withContinue((s) => auth.sendPasswordResetEmail(keep.email, s));
        note = { t: `Если ${keep.email} зарегистрирован, на него пришло письмо со ссылкой для нового пароля. Проверьте и папку «Спам».`, ok: true };
      } else if (kind === 'password') {
        const cred = fb.auth.EmailAuthProvider.credential(user.email, raw('accOld'));
        await user.reauthenticateWithCredential(cred);
        await user.updatePassword(raw('accPass'));
        screen = 'profile'; note = { t: 'Пароль изменён.', ok: true };
      } else if (kind === 'save') {
        const cur = app.current();
        await chartsRef().add({ name: v('accSaveName').slice(0, 60), date: cur.date, time: cur.time, place: cleanPlace(cur.place), manualOffset: cur.manualOffset == null ? null : cur.manualOffset, createdAt: fb.firestore.FieldValue.serverTimestamp() });
        note = { t: 'Карта сохранена.', ok: true };
      }
    } catch (e) { note = { t: errText(e) }; }
    busy = false;
    render(); refill(keep);
  }
  // keep what the person typed when the form is redrawn
  function refill(keep) {
    if (!dlg) return;
    const e = dlg.querySelector('#accEmail'), n = dlg.querySelector('#accName');
    if (e && keep.email) e.value = keep.email;
    if (n && keep.name) n.value = keep.name;
  }

  window.Account = {
    init(a) {
      app = a;
      cfg = window.FIREBASE_CONFIG;
      if (!cfg || !cfg.apiKey) return;          // no Firebase project yet: the site works without an account
      renderButton();
      $('accBtn').addEventListener('click', open);
      const sel = $('pSaved');
      if (sel) sel.addEventListener('change', () => {
        const c = charts.find((x) => x.id === sel.value);
        if (c) app.setPartner({ name: c.name, date: c.date, time: c.time, place: c.place, manualOffset: c.manualOffset == null ? null : c.manualOffset });
        sel.value = '';
      });
      // restore the session in the background
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
      idle(() => boot().catch(() => {}));
    },
  };
})();
