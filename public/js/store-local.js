// Backend demo: semua data di localStorage. Login hanya simulasi untuk mencoba peran.
import { seedData } from "./seed.js";

const KEY = "rk:data", AUTH = "rk:auth", ADM = "rk:admins";
const read = (k, d) => { try { const j = localStorage.getItem(k); return j ? JSON.parse(j) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export function createLocalStore() {
  const dl = new Set(), al = new Set(), ml = new Set();
  let data = read(KEY, null);
  if (!data) { data = seedData(); write(KEY, data); }
  let auth = read(AUTH, null);
  let admins = read(ADM, [{ email: "admin@demo.local", role: "admin" }]);

  const emitData = () => dl.forEach((f) => f(structuredClone(data)));
  const commit = () => { write(KEY, data); emitData(); };
  const upsert = (arr, item) => { const i = arr.findIndex((x) => x.id === item.id); if (i >= 0) arr[i] = item; else arr.push(item); };
  const need = (...roles) => { if (!auth || !roles.includes(auth.role)) throw new Error("Tidak punya izin untuk aksi ini."); };

  return {
    mode: "local",
    onData(cb) { dl.add(cb); cb(structuredClone(data)); return () => dl.delete(cb); },
    onAuth(cb) { al.add(cb); cb(auth); return () => al.delete(cb); },
    async signIn(role = "admin") {
      auth = { email: role + "@demo.local", name: role === "superadmin" ? "Super Admin (demo)" : "Admin (demo)", role };
      write(AUTH, auth); al.forEach((f) => f(auth));
    },
    async signOut() { auth = null; write(AUTH, null); al.forEach((f) => f(auth)); },
    async saveConfig(c) { need("admin", "superadmin"); data.config = c; commit(); },
    async saveGroup(g) { need("admin", "superadmin"); upsert(data.groups, g); commit(); },
    async deleteGroup(id) {
      need("superadmin");
      data.groups = data.groups.filter((g) => g.id !== id);
      data.sessions.forEach((s) => delete s.assignments[id]);
      commit();
    },
    async saveSession(s) { need("admin", "superadmin"); upsert(data.sessions, s); commit(); },
    async deleteSession(id) { need("admin", "superadmin"); data.sessions = data.sessions.filter((s) => s.id !== id); commit(); },
    async applyData(next, { replace = false } = {}) {
      need(replace ? "superadmin" : "admin", "superadmin");
      data = structuredClone(next); commit();
    },
    onAdmins(cb) { ml.add(cb); cb([...admins]); return () => ml.delete(cb); },
    async setAdmin(email, role) {
      need("superadmin");
      email = email.trim().toLowerCase();
      admins = admins.filter((a) => a.email !== email); admins.push({ email, role }); write(ADM, admins);
      ml.forEach((f) => f([...admins]));
    },
    async removeAdmin(email) {
      need("superadmin");
      admins = admins.filter((a) => a.email !== email); write(ADM, admins);
      ml.forEach((f) => f([...admins]));
    },
  };
}
