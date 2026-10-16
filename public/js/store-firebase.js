// Backend Firebase Spark: Firestore (data) + Authentication (Google) + koleksi `roles` untuk peran admin.
const V = "11.0.2";
const base = `https://www.gstatic.com/firebasejs/${V}/`;
import { defaultConfig } from "./seed.js";

export async function createFirebaseStore(cfg) {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(base + "firebase-app.js"),
    import(base + "firebase-firestore.js"),
    import(base + "firebase-auth.js"),
  ]);
  const app = initializeApp(cfg);
  const db = fs.getFirestore(app);
  const auth = au.getAuth(app);

  const dl = new Set(), al = new Set();
  let cache = { config: null, groups: null, sessions: null };
  let curAuth = null;
  let unsubRole = null;

  const emitData = () => {
    if (!cache._cfgSeen || cache.groups === null || cache.sessions === null) return;
    const d = { config: { ...defaultConfig(), ...(cache.config || {}) }, groups: cache.groups, sessions: cache.sessions };
    dl.forEach((f) => f(structuredClone(d)));
  };
  const onErr = (e) => console.error("Firestore:", e);

  fs.onSnapshot(fs.doc(db, "config", "main"), (s) => { cache.config = s.exists() ? s.data() : {}; cache._cfgSeen = true; emitData(); }, onErr);
  fs.onSnapshot(fs.collection(db, "groups"), (s) => {
    cache.groups = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); emitData();
  }, onErr);
  fs.onSnapshot(fs.collection(db, "sessions"), (s) => {
    cache.sessions = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.number - b.number); emitData();
  }, onErr);

  const emitAuth = () => al.forEach((f) => f(curAuth));
  au.onAuthStateChanged(auth, (user) => {
    unsubRole?.(); unsubRole = null;
    if (!user) { curAuth = null; emitAuth(); return; }
    const email = (user.email || "").toLowerCase();
    curAuth = { email, name: user.displayName || email, role: null };
    emitAuth();
    unsubRole = fs.onSnapshot(fs.doc(db, "roles", email), (s) => {
      curAuth = { email, name: user.displayName || email, role: s.exists() ? s.data().role : null };
      emitAuth();
    }, onErr);
  });

  const clean = (o) => JSON.parse(JSON.stringify(o)); // buang undefined
  const stripId = ({ id, ...rest }) => clean(rest);

  async function batched(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const b = fs.writeBatch(db);
      ops.slice(i, i + 400).forEach((op) => op(b));
      await b.commit();
    }
  }

  return {
    mode: "firebase",
    onData(cb) { dl.add(cb); emitData(); return () => dl.delete(cb); },
    onAuth(cb) { al.add(cb); cb(curAuth); return () => al.delete(cb); },
    async signIn() {
      const provider = new au.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await au.signInWithPopup(auth, provider);
    },
    signOut: () => au.signOut(auth),
    saveConfig: (c) => fs.setDoc(fs.doc(db, "config", "main"), clean(c)),
    saveGroup: (g) => fs.setDoc(fs.doc(db, "groups", g.id), stripId(g)),
    deleteGroup: async (id) => {
      // hapus kelompok + bersihkan penetapannya di riwayat
      const ops = [(b) => b.delete(fs.doc(db, "groups", id))];
      (cache.sessions || []).forEach((s) => {
        if (s.assignments && id in s.assignments) {
          const a = { ...s.assignments }; delete a[id];
          ops.push((b) => b.set(fs.doc(db, "sessions", s.id), stripId({ ...s, assignments: a })));
        }
      });
      await batched(ops);
    },
    saveSession: (s) => fs.setDoc(fs.doc(db, "sessions", s.id), stripId(s)),
    deleteSession: (id) => fs.deleteDoc(fs.doc(db, "sessions", id)),
    async applyData(next, { replace = false } = {}) {
      const ops = [(b) => b.set(fs.doc(db, "config", "main"), clean(next.config))];
      next.groups.forEach((g) => ops.push((b) => b.set(fs.doc(db, "groups", g.id), stripId(g))));
      next.sessions.forEach((s) => ops.push((b) => b.set(fs.doc(db, "sessions", s.id), stripId(s))));
      if (replace) {
        const gi = new Set(next.groups.map((g) => g.id)), si = new Set(next.sessions.map((s) => s.id));
        (cache.groups || []).filter((g) => !gi.has(g.id)).forEach((g) => ops.push((b) => b.delete(fs.doc(db, "groups", g.id))));
        (cache.sessions || []).filter((s) => !si.has(s.id)).forEach((s) => ops.push((b) => b.delete(fs.doc(db, "sessions", s.id))));
      }
      await batched(ops);
    },
    onAdmins(cb) {
      return fs.onSnapshot(fs.collection(db, "roles"),
        (s) => cb(s.docs.map((d) => ({ email: d.id, role: d.data().role }))),
        () => cb(null));
    },
    setAdmin: (email, role) => fs.setDoc(fs.doc(db, "roles", email.trim().toLowerCase()), { role }),
    removeAdmin: (email) => fs.deleteDoc(fs.doc(db, "roles", email)),
  };
}
