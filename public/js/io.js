// Impor / ekspor: JSON (cadangan penuh), CSV, XLSX (SheetJS dimuat dari CDN hanya saat dibutuhkan).
import { uid, slug, sortGroups, sortSessions, DEFAULT_COLORS } from "./util.js";

/* ---------- unduh ---------- */
export function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- tabel datar dari data ---------- */
export function tables(data) {
  const groups = sortGroups(data.groups), sessions = sortSessions(data.sessions);
  const roleName = Object.fromEntries(data.config.roles.map((r) => [r.id, r.name]));
  const groupName = Object.fromEntries(groups.map((g) => [g.id, g.name]));

  const kelompok = [["Kelompok", "No", "Nama", data.config.idLabel || "ID"]];
  groups.forEach((g) => g.members.forEach((m, i) => kelompok.push([g.name, i + 1, m.name, m.nim || ""])));

  const peran = [["Peran", "Jumlah Kelompok", "Boleh Sama", "Warna", "Deskripsi"]];
  data.config.roles.forEach((r) => peran.push([r.name, r.slots, r.allowRepeat ? "Ya" : "Tidak", r.color || "", r.desc || ""]));

  const riwayat = [["Pertemuan", "Tanggal", "Topik", "Kelompok", "Peran"]];
  sessions.forEach((s) => {
    const rows = groups.filter((g) => s.assignments?.[g.id]);
    if (!rows.length) riwayat.push([s.number, s.date || "", s.topic || "", "", ""]);
    rows.forEach((g) => riwayat.push([s.number, s.date || "", s.topic || "", groupName[g.id], roleName[s.assignments[g.id]] || ""]));
  });

  const matriks = [["Kelompok", ...sessions.map((s) => `Pertemuan ${s.number}`)]];
  groups.forEach((g) => matriks.push([g.name, ...sessions.map((s) => roleName[s.assignments?.[g.id]] || "")]));

  return { kelompok, peran, riwayat, matriks };
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export const toCSV = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

export function exportCSV(data, which) {
  const t = tables(data);
  const map = { kelompok: "rotake-kelompok.csv", riwayat: "rotake-riwayat.csv", peran: "rotake-peran.csv", matriks: "rotake-matriks.csv" };
  download(map[which], toCSV(t[which]), "text/csv;charset=utf-8");
}

export function exportJSON(data) {
  const payload = { app: "rotake", version: 1, exportedAt: new Date().toISOString(), ...data };
  download("rotake-cadangan.json", JSON.stringify(payload, null, 2), "application/json");
}

let xlsxPromise;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  xlsxPromise ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = () => res(window.XLSX);
    s.onerror = () => { xlsxPromise = null; rej(new Error("Gagal memuat pustaka XLSX. Periksa koneksi internet, atau gunakan CSV/JSON.")); };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

export async function exportXLSX(data) {
  const X = await loadXLSX();
  const t = tables(data);
  const wb = X.utils.book_new();
  const add = (name, rows, widths) => {
    const ws = X.utils.aoa_to_sheet(rows);
    ws["!cols"] = widths.map((w) => ({ wch: w }));
    X.utils.book_append_sheet(wb, ws, name);
  };
  add("Daftar Kelompok", t.kelompok, [14, 5, 36, 12]);
  add("Peran", t.peran, [18, 16, 11, 10, 60]);
  add("Riwayat", t.riwayat, [11, 12, 40, 14, 18]);
  add("Matriks", t.matriks, [14, ...Array(Math.max(1, t.matriks[0].length - 1)).fill(16)]);
  X.writeFile(wb, "rotake.xlsx");
}

/* ---------- baca file ---------- */
export function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

const norm = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const pickKey = (keys, ...alts) => alts.find((a) => keys.includes(a));
const truthy = (v) => /^(ya|y|yes|true|1|boleh)$/i.test(String(v ?? "").trim());

/** rows: array of arrays (baris pertama = header) -> array of objects dengan kunci ternormalisasi */
function objectify(rows) {
  if (!rows.length) return [];
  const keys = rows[0].map(norm);
  return rows.slice(1).map((r) => Object.fromEntries(keys.map((k, i) => [k, String(r[i] ?? "").trim()])));
}

function normDate(v) {
  v = String(v || "").trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  let m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(v);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Hasil parse (berbasis NAMA, bukan id, supaya bisa digabung dengan data yang ada):
 * { groups?:[{name,members}], roles?:[...], sessions?:[{number,date,topic,notes,entries:[{group,role}]}], config?, warnings:[] }
 */
export function parseTables(sheets) {
  const out = { warnings: [] };
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const objs = objectify(rows);
    if (!objs.length) continue;
    const keys = Object.keys(objs[0]);
    const kGroup = pickKey(keys, "kelompok", "group", "tim");
    const kRole = pickKey(keys, "peran", "role");
    const kName = pickKey(keys, "nama", "name", "anggota");
    const kNum = pickKey(keys, "pertemuan", "sesi", "session");
    if (kNum && kGroup && kRole !== undefined) {
      const map = new Map();
      for (const o of objs) {
        const n = parseInt(o[kNum], 10);
        if (!Number.isFinite(n)) continue;
        if (!map.has(n)) map.set(n, { number: n, date: "", topic: "", notes: "", entries: [] });
        const s = map.get(n);
        s.date ||= normDate(o[pickKey(keys, "tanggal", "date")]);
        s.topic ||= o[pickKey(keys, "topik", "topic", "materi")] || "";
        if (o[kGroup] && o[kRole]) s.entries.push({ group: o[kGroup], role: o[kRole] });
      }
      out.sessions = [...(out.sessions || []), ...map.values()];
    } else if (kGroup && kName) {
      const kNim = pickKey(keys, "nim", "id", "nomorinduk", "npm");
      const map = new Map();
      let last = "";
      for (const o of objs) {
        const gname = o[kGroup] || last;
        last = gname;
        if (!gname || !o[kName]) continue;
        if (!map.has(gname)) map.set(gname, { name: gname, members: [] });
        map.get(gname).members.push({ name: o[kName], nim: kNim ? o[kNim] : "" });
      }
      out.groups = [...(out.groups || []), ...map.values()];
      if (kNim && keys.includes("nim") === false && kNim === "id") out.idLabel = "ID";
      if (keys.includes("nim")) out.idLabel = "NIM";
    } else if (kRole && pickKey(keys, "jumlahkelompok", "slot", "kuota", "jumlah")) {
      const kSlot = pickKey(keys, "jumlahkelompok", "slot", "kuota", "jumlah");
      out.roles = objs.filter((o) => o[kRole]).map((o, i) => ({
        name: o[kRole], slots: Math.max(1, parseInt(o[kSlot], 10) || 1),
        allowRepeat: truthy(o.bolehsama), color: o.warna || "", desc: o.deskripsi || "",
      }));
    } else {
      out.warnings.push(`Sheet "${sheetName}" dilewati (kolom tidak dikenali).`);
    }
  }
  return out;
}

/** JSON cadangan (berbasis id) -> bentuk berbasis nama */
export function parseBackup(json) {
  if (!json || !Array.isArray(json.groups) || !Array.isArray(json.sessions) || !json.config) throw new Error("Berkas JSON bukan cadangan Rotasi Kelompok.");
  const gname = Object.fromEntries(json.groups.map((g) => [g.id, g.name]));
  const rname = Object.fromEntries(json.config.roles.map((r) => [r.id, r.name]));
  return {
    warnings: [],
    config: { title: json.config.title, subtitle: json.config.subtitle, idLabel: json.config.idLabel },
    groups: json.groups.map((g) => ({ name: g.name, members: g.members || [] })),
    roles: json.config.roles.map((r) => ({ ...r })),
    sessions: json.sessions.map((s) => ({
      number: s.number, date: s.date || "", topic: s.topic || "", notes: s.notes || "",
      entries: Object.entries(s.assignments || {}).filter(([g, r]) => gname[g] && rname[r]).map(([g, r]) => ({ group: gname[g], role: rname[r] })),
    })),
  };
}

export async function parseFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "json") return parseBackup(JSON.parse(await file.text()));
  if (ext === "csv") return parseTables({ [file.name]: parseCSV(await file.text()) });
  if (ext === "xlsx" || ext === "xls") {
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer());
    const sheets = {};
    for (const name of wb.SheetNames) sheets[name] = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false });
    return parseTables(sheets);
  }
  throw new Error("Format tidak didukung. Gunakan .xlsx, .csv, atau .json.");
}

/**
 * Terapkan hasil parse ke data saat ini.
 * replace=false: gabung (cocokkan kelompok/peran berdasarkan nama, pertemuan berdasarkan nomor)
 * replace=true : bagian yang ADA di berkas menggantikan bagian yang sama di data saat ini
 */
export function buildNext(cur, parsed, { replace = false } = {}) {
  const next = structuredClone(cur);
  const report = { groups: 0, roles: 0, sessions: 0, created: [], warnings: [...(parsed.warnings || [])] };
  const key = (s) => String(s).trim().toLowerCase();

  if (parsed.config) {
    if (parsed.config.title) next.config.title = parsed.config.title;
    if (parsed.config.subtitle !== undefined) next.config.subtitle = parsed.config.subtitle;
    if (parsed.config.idLabel) next.config.idLabel = parsed.config.idLabel;
  } else if (parsed.idLabel && (replace || !cur.groups.length)) next.config.idLabel = parsed.idLabel;

  if (parsed.groups) {
    const old = new Map(cur.groups.map((g) => [key(g.name), g]));
    const result = replace ? [] : [...next.groups];
    parsed.groups.forEach((pg) => {
      const ex = old.get(key(pg.name));
      const g = { id: ex?.id || uid("g"), name: pg.name, order: 0, members: pg.members };
      const i = result.findIndex((x) => x.id === g.id);
      if (i >= 0) result[i] = g; else result.push(g);
      report.groups++;
    });
    result.forEach((g, i) => (g.order = i));
    next.groups = result;
  }

  if (parsed.roles) {
    const old = new Map(cur.config.roles.map((r) => [key(r.name), r]));
    const result = replace ? [] : [...next.config.roles];
    parsed.roles.forEach((pr, i) => {
      const ex = old.get(key(pr.name));
      const r = {
        id: ex?.id || "r_" + slug(pr.name) + "_" + Math.random().toString(36).slice(2, 5),
        name: pr.name, slots: pr.slots, allowRepeat: !!pr.allowRepeat,
        color: pr.color || ex?.color || DEFAULT_COLORS[result.length % DEFAULT_COLORS.length], desc: pr.desc ?? ex?.desc ?? "",
      };
      const j = result.findIndex((x) => x.id === r.id);
      if (j >= 0) result[j] = r; else result.push(r);
      report.roles++;
    });
    next.config.roles = result;
  }

  if (parsed.sessions) {
    const gByName = new Map(next.groups.map((g) => [key(g.name), g]));
    const rByName = new Map(next.config.roles.map((r) => [key(r.name), r]));
    const ensureGroup = (name) => {
      let g = gByName.get(key(name));
      if (!g) { g = { id: uid("g"), name, order: next.groups.length, members: [] }; next.groups.push(g); gByName.set(key(name), g); report.created.push(`Kelompok "${name}" dibuat otomatis`); }
      return g;
    };
    const ensureRole = (name, slots) => {
      let r = rByName.get(key(name));
      if (!r) {
        r = { id: "r_" + slug(name) + "_" + Math.random().toString(36).slice(2, 5), name, slots, allowRepeat: false, color: DEFAULT_COLORS[next.config.roles.length % DEFAULT_COLORS.length], desc: "" };
        next.config.roles.push(r); rByName.set(key(name), r); report.created.push(`Peran "${name}" dibuat otomatis`);
      }
      return r;
    };
    // kuota peran otomatis = jumlah maksimum per pertemuan di berkas
    const maxSlots = {};
    parsed.sessions.forEach((s) => {
      const c = {};
      s.entries.forEach((e) => (c[key(e.role)] = (c[key(e.role)] || 0) + 1));
      Object.entries(c).forEach(([k, v]) => (maxSlots[k] = Math.max(maxSlots[k] || 0, v)));
    });
    const oldByNum = new Map(cur.sessions.map((s) => [s.number, s]));
    const result = replace ? [] : [...next.sessions];
    parsed.sessions.forEach((ps) => {
      const assignments = {};
      ps.entries.forEach((e) => {
        const g = ensureGroup(e.group), r = ensureRole(e.role, maxSlots[key(e.role)] || 1);
        assignments[g.id] = r.id;
      });
      const ex = oldByNum.get(ps.number);
      const s = { id: ex?.id || uid("s"), number: ps.number, date: ps.date || ex?.date || "", topic: ps.topic || ex?.topic || "", notes: ps.notes || ex?.notes || "", assignments };
      const i = result.findIndex((x) => x.id === s.id);
      if (i >= 0) result[i] = s; else result.push(s);
      report.sessions++;
    });
    next.sessions = result.sort((a, b) => a.number - b.number);
  }

  // bersihkan penetapan yang menunjuk kelompok/peran yang sudah tidak ada
  const gids = new Set(next.groups.map((g) => g.id)), rids = new Set(next.config.roles.map((r) => r.id));
  next.sessions.forEach((s) => {
    for (const [g, r] of Object.entries(s.assignments)) if (!gids.has(g) || !rids.has(r)) delete s.assignments[g];
  });
  return { next, report };
}
