import { S, isAdmin, isSuper } from "./state.js";
import { esc, uid, slug, todayStr, sortGroups, sortSessions, DEFAULT_COLORS } from "./util.js";
import { randomize } from "./randomizer.js";
import { seedData } from "./seed.js";
import * as io from "./io.js";
import { roleRow } from "./views-admin.js";

let render = () => {};
export const initActions = (r) => (render = r);

export function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => el.remove(), kind === "err" ? 7000 : 3500);
}

const friendly = (e) => (e?.code === "permission-denied" ? "Ditolak: akun Anda tidak punya izin untuk aksi ini." : e?.message || String(e));

/** Jalankan aksi async dengan penanganan galat. */
async function run(fn, okMsg) {
  S.busy = true;
  try { await fn(); if (okMsg) toast(okMsg); return true; }
  catch (e) { console.error(e); toast(friendly(e), "err"); return false; }
  finally { S.busy = false; render(); }
}

/* ---------- pertemuan / pengacakan ---------- */
export function initRz(id, keep = {}) {
  const d = S.data;
  const s = id ? d.sessions.find((x) => x.id === id) : null;
  const nextNum = d.sessions.reduce((m, x) => Math.max(m, x.number), 0) + 1;
  S.rz = {
    sessionId: s?.id || null,
    number: s ? s.number : nextNum,
    date: s?.date || todayStr(),
    topic: s?.topic || "",
    notes: s?.notes || "",
    absent: [],
    repeat: keep.repeat || {},
    strict: keep.strict ?? true,
    fromNumber: keep.fromNumber ?? 0,
    assignments: s ? { ...s.assignments } : {},
    pins: [],
    error: "",
  };
}

function shuffle() {
  const rz = S.rz, d = S.data;
  const pinned = {};
  rz.pins.forEach((g) => { if (rz.assignments[g]) pinned[g] = rz.assignments[g]; });
  const res = randomize({
    groups: sortGroups(d.groups), roles: d.config.roles, sessions: d.sessions,
    excludeSessionId: rz.sessionId, absent: rz.absent, pinned,
    allowRepeat: rz.repeat, strict: rz.strict, fromNumber: +rz.fromNumber || 0,
  });
  if (!res.ok) {
    if (res.error === "infeasible") {
      const names = (res.stuck || []).map((id) => d.groups.find((g) => g.id === id)?.name).filter(Boolean);
      rz.error = `Tidak ada susunan yang menghindari pengulangan peran.${names.length ? " Kelompok yang sudah pernah memegang semua peran: " + esc(names.join(", ")) + "." : ""} ` +
        `Pilihan: ubah aturan ke “Izinkan pengulangan seminimal mungkin”, centang “boleh sama” pada peran tertentu, atau mulai siklus baru dengan mengabaikan riwayat sebelum pertemuan ke-N.`;
    } else rz.error = esc(res.error);
    return;
  }
  rz.error = "";
  rz.assignments = res.assignments;
  rz.pins = rz.pins.filter((g) => res.assignments[g]);
}

async function saveSession() {
  const rz = S.rz, d = S.data;
  const n = parseInt(rz.number, 10);
  rz.error = "";
  if (!(n > 0)) { rz.error = "Nomor pertemuan harus angka positif."; return render(); }
  if (d.sessions.some((s) => s.number === n && s.id !== rz.sessionId)) { rz.error = `Pertemuan ${n} sudah ada. Pilih pertemuan itu dari daftar untuk mengeditnya, atau ganti nomor.`; return render(); }
  const assignments = {};
  for (const [g, r] of Object.entries(rz.assignments)) if (r && !rz.absent.includes(g) && d.groups.some((x) => x.id === g)) assignments[g] = r;
  const s = { id: rz.sessionId || uid("s"), number: n, date: rz.date || "", topic: rz.topic.trim(), notes: (rz.notes || "").trim(), assignments };
  const ok = await run(() => S.store.saveSession(s), `Pertemuan ${n} disimpan.`);
  if (ok) rz.sessionId = s.id;
  render();
}

/* ---------- form ---------- */
const parseMembers = (text) =>
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, nim] = l.split(/\s*[|\t]\s*/);
    return { name: name.trim(), nim: (nim || "").trim() };
  });

const val = (f, n) => f.elements[n].value;

const forms = {
  config: (f) => run(() => S.store.saveConfig({ ...S.data.config, title: val(f, "title").trim(), subtitle: val(f, "subtitle").trim(), idLabel: val(f, "idLabel").trim() || "ID" }), "Pengaturan disimpan."),

  async roles(f) {
    const d = S.data;
    const rows = [...f.querySelectorAll("[data-rolerow]")];
    const roles = rows.map((tr, i) => {
      const q = (n) => tr.querySelector(`[name=${n}]`);
      const name = q("rname").value.trim();
      return {
        id: q("rid").value || "r_" + slug(name) + "_" + Math.random().toString(36).slice(2, 5),
        name, slots: Math.max(1, parseInt(q("rslots").value, 10) || 1), allowRepeat: q("rrepeat").checked,
        color: q("rcolor").value || DEFAULT_COLORS[i % DEFAULT_COLORS.length], desc: q("rdesc").value.trim(),
      };
    }).filter((r) => r.name);
    const names = roles.map((r) => r.name.toLowerCase());
    if (new Set(names).size !== names.length) return toast("Nama peran tidak boleh kembar.", "err");
    const keep = new Set(roles.map((r) => r.id));
    const removed = d.config.roles.filter((r) => !keep.has(r.id));
    const affected = d.sessions.filter((s) => Object.values(s.assignments || {}).some((rid) => removed.some((r) => r.id === rid)));
    if (affected.length && !confirm(`Peran yang dihapus (${removed.map((r) => r.name).join(", ")}) dipakai di ${affected.length} pertemuan. Penetapannya akan dikosongkan. Lanjutkan?`)) return;
    await run(async () => {
      await S.store.saveConfig({ ...d.config, roles });
      for (const s of affected) {
        const a = Object.fromEntries(Object.entries(s.assignments).filter(([, rid]) => keep.has(rid)));
        await S.store.saveSession({ ...s, assignments: a });
      }
    }, "Peran disimpan.");
    S.rz = null;
  },

  async group(f) {
    const g = S.data.groups.find((x) => x.id === f.dataset.id);
    if (!g) return;
    S.openGroup = g.id;
    await run(() => S.store.saveGroup({ ...g, name: val(f, "name").trim(), members: parseMembers(val(f, "members")) }), "Kelompok disimpan.");
  },

  async admin(f) {
    const email = val(f, "email").trim().toLowerCase();
    await run(() => S.store.setAdmin(email, val(f, "role")), `${email} ditambahkan.`);
  },
};

/* ---------- klik ---------- */
const clicks = {
  goto: (el) => { S.view = el.dataset.view; if (S.view !== "history") S.filterGroup = ""; location.hash = "#/" + S.view; render(); window.scrollTo({ top: 0 }); },
  viewGroup: (el) => { S.filterGroup = el.dataset.id; location.hash = "#/history"; S.view = "history"; render(); window.scrollTo({ top: 0 }); },
  login: (el) => run(() => S.store.signIn(el.dataset.role), ""),
  logout: () => run(() => S.store.signOut()),
  editSession: (el) => { initRz(el.dataset.id); location.hash = "#/randomize"; S.view = "randomize"; render(); window.scrollTo({ top: 0 }); },
  newSession: () => { initRz(null); location.hash = "#/randomize"; S.view = "randomize"; render(); },
  shuffle: () => { shuffle(); render(); },
  clearAssign: () => { S.rz.assignments = {}; S.rz.pins = []; S.rz.error = ""; render(); },
  saveSession,
  deleteSession: (el) => {
    const s = S.data.sessions.find((x) => x.id === el.dataset.id);
    if (s && confirm(`Hapus Pertemuan ${s.number} (${s.topic || "tanpa topik"}) beserta hasil pengacakannya?`)) {
      if (S.rz?.sessionId === s.id) S.rz = null;
      return run(() => S.store.deleteSession(s.id), "Pertemuan dihapus.");
    }
  },
  addGroup() {
    const d = S.data;
    const id = uid("g");
    S.openGroup = id;
    return run(() => S.store.saveGroup({ id, name: `Kelompok ${d.groups.length + 1}`, order: d.groups.reduce((m, g) => Math.max(m, g.order ?? 0), -1) + 1, members: [] }));
  },
  deleteGroup(el) {
    const g = S.data.groups.find((x) => x.id === el.dataset.id);
    if (g && confirm(`Hapus ${g.name}? Riwayat perannya di semua pertemuan ikut terhapus.`)) return run(() => S.store.deleteGroup(g.id), "Kelompok dihapus.");
  },
  addRoleRow() {
    const tb = document.getElementById("roleRows");
    const i = tb.children.length;
    tb.insertAdjacentHTML("beforeend", roleRow({ id: "", name: "", slots: 1, allowRepeat: false }, i));
    tb.lastElementChild.querySelector("[name=rname]").focus();
  },
  removeRoleRow: (el) => el.closest("tr").remove(),
  export(el) {
    const f = el.dataset.fmt;
    return run(async () => {
      if (f === "xlsx") await io.exportXLSX(S.data);
      else if (f === "json") io.exportJSON(S.data);
      else io.exportCSV(S.data, f);
    });
  },
  cancelImport: () => { S.importPreview = null; render(); },
  async applyImport(el) {
    const replace = el.dataset.mode === "replace";
    if (replace && !confirm("Bagian data yang ada di berkas akan MENGGANTI data saat ini (yang tidak ada di berkas dihapus). Lanjutkan?")) return;
    const { next, report } = io.buildNext(S.data, S.importPreview.parsed, { replace });
    const ok = await run(() => S.store.applyData(next, { replace }),
      `Impor selesai: ${report.groups} kelompok, ${report.roles} peran, ${report.sessions} pertemuan.`);
    if (ok) {
      report.created.slice(0, 3).forEach((m) => toast(m));
      S.importPreview = null; S.rz = null; render();
    }
  },
  loadSample: () => run(() => S.store.applyData(seedData(), { replace: false }), "Data contoh dimuat."),
  loadSampleReplace() {
    if (confirm("Semua data saat ini diganti data contoh. Lanjutkan?")) { S.rz = null; return run(() => S.store.applyData(seedData(), { replace: true }), "Data contoh dimuat."); }
  },
  resetHistory() {
    if (!confirm("Kosongkan hasil pengacakan di SEMUA pertemuan? (Pertemuan dan topiknya tetap ada.)")) return;
    const next = structuredClone(S.data); next.sessions.forEach((s) => (s.assignments = {}));
    S.rz = null;
    return run(() => S.store.applyData(next, { replace: true }), "Riwayat peran dikosongkan.");
  },
  wipeAll() {
    if (!confirm("Hapus SEMUA kelompok dan pertemuan? Peran dan pengaturan tetap. Tidak bisa dibatalkan.")) return;
    S.rz = null;
    return run(() => S.store.applyData({ config: S.data.config, groups: [], sessions: [] }, { replace: true }), "Data dihapus.");
  },
  removeAdmin(el) { if (confirm(`Cabut akses ${el.dataset.email}?`)) return run(() => S.store.removeAdmin(el.dataset.email), "Akses dicabut."); },
};

export function onClick(e) {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = clicks[el.dataset.act];
  if (!fn) return;
  if (el.tagName === "BUTTON" && el.type !== "button" && el.closest("form")) return;
  fn(el);
}

export function onSubmit(e) {
  const f = e.target.closest("form[data-form]");
  if (!f) return;
  e.preventDefault();
  forms[f.dataset.form]?.(f);
}

export function onInput(e) {
  const t = e.target;
  if (t.dataset.rz && S.rz && t.tagName === "INPUT") S.rz[t.dataset.rz] = t.value; // tanpa render agar fokus tetap
}

export async function onChange(e) {
  const t = e.target, ds = t.dataset, rz = S.rz;
  if (ds.change === "filterGroup") { S.filterGroup = t.value; return render(); }
  if (ds.rz && rz) {
    if (ds.rz === "sessionId") { initRz(t.value || null, { repeat: rz.repeat, strict: rz.strict, fromNumber: rz.fromNumber }); return render(); }
    if (ds.rz === "strict") { rz.strict = t.value === "1"; return; }
    return;
  }
  if (ds.rzabsent) {
    const on = !t.checked;
    rz.absent = on ? [...new Set([...rz.absent, ds.rzabsent])] : rz.absent.filter((x) => x !== ds.rzabsent);
    if (on) { delete rz.assignments[ds.rzabsent]; rz.pins = rz.pins.filter((x) => x !== ds.rzabsent); }
    return render();
  }
  if (ds.rzassign) { if (t.value) rz.assignments[ds.rzassign] = t.value; else { delete rz.assignments[ds.rzassign]; rz.pins = rz.pins.filter((x) => x !== ds.rzassign); } return render(); }
  if (ds.rzpin) { rz.pins = t.checked ? [...new Set([...rz.pins, ds.rzpin])] : rz.pins.filter((x) => x !== ds.rzpin); return; }
  if (ds.rzrepeat) { rz.repeat[ds.rzrepeat] = t.checked; return; }
  if (ds.adminrole) return run(() => S.store.setAdmin(ds.adminrole, t.value), "Peran diperbarui.");
  if (ds.file === "import" && t.files[0]) {
    const file = t.files[0];
    try { S.importPreview = { name: file.name, parsed: await io.parseFile(file) }; }
    catch (err) { S.importPreview = { name: file.name, error: err.message }; }
    render();
  }
}
