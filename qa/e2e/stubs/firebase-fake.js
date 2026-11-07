/* A stand-in for the Firebase compat SDK (app + auth + firestore) for the end-to-end tests: the account UI runs
   against an in-memory backend, so no real account is created and nothing leaves the browser.
   Test hooks: window.__fb.users, window.__fb.fail(code) makes the next auth call fail with that code. */
(function () {
  if (window.firebase && window.firebase.__fake) return;
  const users = {}; const store = {}; const subsBy = {}; const listeners = []; let current = null; let nextFail = null; let n = 0;
  const err = (code) => Object.assign(new Error(code), { code });
  const tick = () => new Promise((r) => setTimeout(r, 5));
  function fire() { const u = current; listeners.forEach((f) => setTimeout(() => f(u), 0)); }
  async function guard() { await tick(); if (nextFail) { const c = nextFail; nextFail = null; throw err(c); } }
  function mkUser(rec) {
    return {
      uid: rec.uid, get email() { return rec.email; }, get emailVerified() { return rec.verified; }, get displayName() { return rec.name || null; },
      providerData: [{ providerId: rec.google ? 'google.com' : 'password' }],
      async sendEmailVerification() { await guard(); rec.mails = (rec.mails || 0) + 1; },
      async reload() { await tick(); },
      async updateProfile(p) { await guard(); if ('displayName' in p) rec.name = p.displayName; },
      async updatePassword(p) { await guard(); if (!p || p.length < 6) throw err('auth/weak-password'); rec.pass = p; },
      async reauthenticateWithCredential(c) { await guard(); if (c.password !== rec.pass) throw err('auth/wrong-password'); },
    };
  }
  const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || '');
  const auth = {
    languageCode: 'en', get currentUser() { return current; },
    onAuthStateChanged(f) { listeners.push(f); setTimeout(() => f(current), 0); return () => {}; },
    async createUserWithEmailAndPassword(email, pass) {
      await guard();
      if (!email) throw err('auth/missing-email'); if (!validEmail(email)) throw err('auth/invalid-email');
      if (!pass) throw err('auth/missing-password'); if (pass.length < 6) throw err('auth/weak-password');
      if (users[email]) throw err('auth/email-already-in-use');
      const rec = users[email] = { uid: 'u' + (++n), email, pass, verified: false };
      current = mkUser(rec); fire(); return { user: current };
    },
    async signInWithEmailAndPassword(email, pass) {
      await guard();
      if (!email) throw err('auth/missing-email'); if (!validEmail(email)) throw err('auth/invalid-email');
      if (!pass) throw err('auth/missing-password');
      const rec = users[email]; if (!rec || rec.pass !== pass) throw err('auth/invalid-credential');
      current = mkUser(rec); fire(); return { user: current };
    },
    async signInWithPopup() {
      await guard();
      const email = 'google.user@example.com';
      const rec = users[email] = users[email] || { uid: 'g' + (++n), email, pass: null, verified: true, google: true, name: 'Google User' };
      current = mkUser(rec); fire(); return { user: current };
    },
    async sendPasswordResetEmail(email) { await guard(); if (!validEmail(email)) throw err('auth/invalid-email'); if (users[email]) users[email].resets = (users[email].resets || 0) + 1; },
    async signOut() { await tick(); current = null; fire(); },
  };
  function coll(path) {
    const docs = () => (store[path] = store[path] || {});
    const subs = (subsBy[path] = subsBy[path] || []);
    const snap = (order) => {
      let list = Object.entries(docs()).map(([id, d]) => ({ id, data: () => Object.assign({}, d) }));
      if (order) list.sort((a, b) => (order.dir === 'desc' ? -1 : 1) * ((a.data()[order.f] || 0) - (b.data()[order.f] || 0)));
      return { docs: list, size: list.length, empty: !list.length };
    };
    const notify = () => subs.forEach((s) => setTimeout(() => s.f(snap(s.order)), 0));
    const api = {
      doc(id) {
        return {
          collection: (c) => coll(path + '/' + id + '/' + c),
          async delete() { await guard(); delete docs()[id]; notify(); },
          async set(d) { await guard(); docs()[id] = d; notify(); },
          async get() { return { exists: !!docs()[id], data: () => docs()[id] }; },
        };
      },
      async add(d) { await guard(); const id = 'c' + (++n); const x = Object.assign({}, d); for (const k in x) if (x[k] && x[k].__ts) x[k] = Date.now() + n; docs()[id] = x; notify(); return { id }; },
      orderBy(f, dir) {
        return { onSnapshot(f2, e) { const s = { f: f2, e, order: { f, dir } }; subs.push(s); setTimeout(() => f2(snap(s.order)), 0); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; },
          async get() { return snap({ f, dir }); } };
      },
    };
    return api;
  }
  const colls = {};
  const db = { collection: (c) => (colls[c] = colls[c] || coll(c)) };
  const authFn = () => auth;
  authFn.GoogleAuthProvider = function () { this.setCustomParameters = () => {}; }; authFn.EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
  const fsFn = () => db; fsFn.FieldValue = { serverTimestamp: () => ({ __ts: true }) };
  window.firebase = { __fake: true, initializeApp: () => ({}), auth: authFn, firestore: fsFn };
  window.__fb = { users, store, fail: (code) => { nextFail = code; }, verify: (email) => { if (users[email]) users[email].verified = true; } };
})();
