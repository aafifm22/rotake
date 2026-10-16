import { esc, fmtDate, sortGroups, sortSessions, DEFAULT_COLORS } from "./util.js";
import { roleCounts, inspect } from "./randomizer.js";
import { isSuper, isAdmin } from "./state.js";
import { roleChip } from "./views-public.js";

/* ================= ACAK ================= */
export function viewRandomize(S) {
  const d = S.data, rz = S.rz;
  const groups = sortGroups(d.groups), sessions = sortSessions(d.sessions);
  const roles = d.config.roles;
  if (!groups.length || !roles.length) return `<div class="card empty">Tambahkan kelompok dan peran dulu di tab <b>Kelola data</b>.</div>`;
  const role = Object.fromEntries(roles.map((r) => [r.id, r]));
  const counts = roleCounts(sessions, { excludeSessionId: rz.sessionId, fromNumber: +rz.fromNumber || 0 });
  const present = groups.filter((g) => !rz.absent.includes(g.id));
  const rep = inspect({ groups: present, roles, assignments: rz.assignments, counts });
  const filled = {};
  present.forEach((g) => { const r = rz.assignments[g.id]; if (r) filled[r] = (filled[r] || 0) + 1; });
  const hasAssign = Object.keys(rz.assignments).length > 0;

  const eff = (r) => (rz.repeat[r.id] !== undefined ? rz.repeat[r.id] : r.allowRepeat);

  const alerts = [];
  if (rz.error) alerts.push(`<div class="alert err">${rz.error}</div>`);
  if (hasAssign) {
    if (rep.repeats.length) alerts.push(`<div class="alert warn">${rep.repeats.length} kelompok mendapat peran yang pernah dipegang: ${rep.repeats.map((id) => esc(d.groups.find((g) => g.id === id).name)).join(", ")}.</div>`);
    rep.unfilled.forEach((u) => alerts.push(`<div class="alert info">Peran ${esc(role[u.roleId].name)} kurang ${u.missing} kelompok.</div>`));
    rep.over.forEach((u) => alerts.push(`<div class="alert warn">Peran ${esc(role[u.roleId].name)} kelebihan ${u.extra} kelompok dari kuota.</div>`));
    if (rep.unassigned.length) alerts.push(`<div class="alert info">Tanpa peran: ${rep.unassigned.map((id) => esc(d.groups.find((g) => g.id === id).name)).join(", ")}.</div>`);
  }

  const rows = groups.map((g) => {
    const absent = rz.absent.includes(g.id);
    const cur = rz.assignments[g.id] || "";
    const past = roles.filter((r) => counts[g.id]?.[r.id]);
    const isRep = !absent && cur && (counts[g.id]?.[cur] || 0) > 0;
    return `<tr style="${absent ? "opacity:.5" : ""}">
      <td class="c"><input type="checkbox" aria-label="Hadir: ${esc(g.name)}" data-rzabsent="${esc(g.id)}" ${absent ? "" : "checked"}></td>
      <td><b>${esc(g.name)}</b></td>
      <td><select data-rzassign="${esc(g.id)}" ${absent ? "disabled" : ""} aria-label="Peran ${esc(g.name)}">
        <option value="">— tanpa peran —</option>
        ${roles.map((r) => `<option value="${esc(r.id)}" ${cur === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></td>
      <td class="c"><input type="checkbox" aria-label="Kunci peran ${esc(g.name)}" data-rzpin="${esc(g.id)}" ${rz.pins.includes(g.id) ? "checked" : ""} ${absent || !cur ? "disabled" : ""}></td>
      <td>${past.map(roleChip).join(" ") || '<span class="muted small">belum pernah</span>'} ${isRep ? '<span class="rep">mengulang</span>' : ""}</td></tr>`;
  }).join("");

  return `
  <div class="card">
    <h2>Pertemuan</h2>
    <div class="grid">
      <label class="f">Pilih pertemuan
        <select data-rz="sessionId">
          <option value="">+ Pertemuan baru</option>
          ${sessions.map((s) => `<option value="${esc(s.id)}" ${rz.sessionId === s.id ? "selected" : ""}>Pertemuan ${s.number} — ${esc(s.topic || "tanpa topik")}</option>`).join("")}
        </select></label>
      <label class="f">Nomor<input type="number" min="1" data-rz="number" value="${esc(rz.number)}"></label>
      <label class="f">Tanggal<input type="date" data-rz="date" value="${esc(rz.date)}"></label>
      <label class="f wide">Topik<input type="text" data-rz="topic" value="${esc(rz.topic)}" placeholder="mis. Bahaya dalam K3"></label>
      <label class="f wide">Catatan (opsional)<input type="text" data-rz="notes" value="${esc(rz.notes)}"></label>
    </div>
  </div>

  <div class="card">
    <h2>Aturan pengacakan</h2>
    <p class="muted small" style="margin-top:0">Centang <b>boleh sama</b> bila kelompok boleh mendapat peran itu lagi. Pengaturan ini hanya untuk pengacakan sesi ini; default per peran diatur di Kelola data.</p>
    <div class="scroll"><table><thead><tr><th>Peran</th><th class="c">Kuota</th><th class="c">Boleh sama lagi</th></tr></thead><tbody>
      ${roles.map((r) => `<tr><td>${roleChip(r)}</td><td class="c">${r.slots}</td>
        <td class="c"><input type="checkbox" aria-label="Boleh sama: ${esc(r.name)}" data-rzrepeat="${esc(r.id)}" ${eff(r) ? "checked" : ""}></td></tr>`).join("")}
    </tbody></table></div>
    <div class="grid" style="margin-top:12px">
      <label class="f">Jika tidak ada susunan tanpa pengulangan
        <select data-rz="strict">
          <option value="1" ${rz.strict ? "selected" : ""}>Berhenti dan beri tahu saya</option>
          <option value="0" ${!rz.strict ? "selected" : ""}>Izinkan pengulangan seminimal mungkin</option>
        </select></label>
      <label class="f">Abaikan riwayat sebelum pertemuan ke-
        <input type="number" min="0" data-rz="fromNumber" value="${esc(rz.fromNumber)}" placeholder="0 = pakai semua riwayat"></label>
    </div>
    <p class="muted small" style="margin-bottom:0">Pakai isian terakhir untuk memulai siklus baru setelah semua kelompok pernah memegang semua peran.</p>
  </div>

  <div class="card">
    <div class="card-head"><h2>Hasil</h2>
      <div class="row">
        <button class="btn primary" data-act="shuffle">${hasAssign ? "Acak ulang" : "Acak sekarang"}</button>
        <button class="btn" data-act="clearAssign" ${hasAssign ? "" : "disabled"}>Kosongkan</button>
      </div></div>
    <p class="muted small" style="margin-top:0">Kelompok yang <b>dikunci</b> tidak ikut diacak ulang. Hasil bisa diubah manual lewat pilihan peran sebelum disimpan.</p>
    ${alerts.join("")}
    <div class="scroll"><table><thead><tr><th class="c">Hadir</th><th>Kelompok</th><th>Peran</th><th class="c">Kunci</th><th>Pernah memegang</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row" style="margin-top:12px">
      ${roles.map((r) => `<span class="muted small">${roleChip(r)} ${filled[r.id] || 0}/${r.slots}</span>`).join("")}
    </div>
    <div class="divider"></div>
    <div class="row end"><button class="btn primary" data-act="saveSession" ${S.busy ? "disabled" : ""}>Simpan ke riwayat</button></div>
  </div>`;
}

/* ================= KELOLA DATA ================= */
export function roleRow(r, i) {
  return `<tr data-rolerow>
    <td><input type="hidden" name="rid" value="${esc(r.id || "")}"><input type="color" name="rcolor" value="${esc(r.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length])}" aria-label="Warna"></td>
    <td><input type="text" name="rname" value="${esc(r.name)}" placeholder="Nama peran" required aria-label="Nama peran"></td>
    <td style="width:90px"><input type="number" min="1" name="rslots" value="${esc(r.slots ?? 1)}" aria-label="Jumlah kelompok"></td>
    <td class="c"><input type="checkbox" name="rrepeat" ${r.allowRepeat ? "checked" : ""} aria-label="Boleh sama"></td>
    <td><input type="text" name="rdesc" value="${esc(r.desc || "")}" placeholder="Deskripsi singkat (opsional)" aria-label="Deskripsi"></td>
    <td><button type="button" class="btn sm danger" data-act="removeRoleRow" aria-label="Hapus peran">✕</button></td></tr>`;
}

export function viewData(S) {
  const d = S.data;
  const groups = sortGroups(d.groups), sessions = sortSessions(d.sessions);
  const sup = isSuper();
  const roles = d.config.roles;

  const info = `<div class="card"><h2>Umum</h2>
    <form data-form="config"><div class="grid">
      <label class="f">Nama kelas / kegiatan<input type="text" name="title" value="${esc(d.config.title)}" placeholder="mis. Dasar K3"></label>
      <label class="f">Keterangan tambahan<input type="text" name="subtitle" value="${esc(d.config.subtitle)}"></label>
      <label class="f">Label ID anggota<input type="text" name="idLabel" value="${esc(d.config.idLabel)}" placeholder="NIM / NIS / ID"></label>
    </div><div class="row end" style="margin-top:12px"><button class="btn primary">Simpan</button></div></form></div>`;

  const roleCard = `<div class="card"><h2>Peran</h2>
    <p class="muted small" style="margin-top:0"><b>Kuota</b> = jumlah kelompok per pertemuan untuk peran itu. <b>Boleh sama</b> = default apakah kelompok boleh mendapat peran yang sama lagi.</p>
    <form data-form="roles"><div class="scroll"><table class="role-edit"><thead><tr><th>Warna</th><th>Nama</th><th>Kuota</th><th class="c">Boleh sama</th><th>Deskripsi</th><th></th></tr></thead>
      <tbody id="roleRows">${roles.map(roleRow).join("")}</tbody></table></div>
    <div class="row" style="margin-top:12px;justify-content:space-between"><button type="button" class="btn" data-act="addRoleRow">+ Tambah peran</button><button class="btn primary">Simpan peran</button></div></form></div>`;

  const groupCard = `<div class="card"><div class="card-head"><h2>Kelompok (${groups.length})</h2><button class="btn" data-act="addGroup">+ Kelompok baru</button></div>
    ${groups.map((g) => groupForm(S, g, sup)).join("") || '<p class="muted">Belum ada kelompok.</p>'}
    ${!sup ? '<p class="muted small">Hanya super admin yang dapat menghapus kelompok.</p>' : ""}</div>`;

  const sessCard = `<div class="card"><div class="card-head"><h2>Pertemuan (${sessions.length})</h2><button class="btn" data-act="newSession">+ Pertemuan baru</button></div>
    <div class="scroll"><table><thead><tr><th>#</th><th>Tanggal</th><th>Topik</th><th>Status</th><th></th></tr></thead><tbody>
    ${sessions.map((s) => `<tr><td>${s.number}</td><td>${esc(fmtDate(s.date)) || '<span class="muted">—</span>'}</td><td>${esc(s.topic)}</td>
      <td>${Object.keys(s.assignments || {}).length ? "Sudah diacak" : '<span class="muted">Belum</span>'}</td>
      <td class="row end"><button class="btn sm" data-act="editSession" data-id="${esc(s.id)}">Edit / acak</button><button class="btn sm danger" data-act="deleteSession" data-id="${esc(s.id)}">Hapus</button></td></tr>`).join("")}
    </tbody></table></div></div>`;

  return info + roleCard + groupCard + sessCard + ioCard(S);
}

function groupForm(S, g, sup) {
  const open = S.openGroup === g.id;
  const text = g.members.map((m) => (m.nim ? `${m.name} | ${m.nim}` : m.name)).join("\n");
  return `<details class="g" ${open ? "open" : ""} data-gid="${esc(g.id)}"><summary><b>${esc(g.name || "Kelompok baru")}</b><span class="muted small">${g.members.length} anggota</span></summary>
    <div class="body"><form data-form="group" data-id="${esc(g.id)}">
      <div class="grid"><label class="f">Nama kelompok<input type="text" name="name" value="${esc(g.name)}" required></label></div>
      <label class="f" style="margin-top:10px">Anggota — satu per baris, format <code>Nama | ${esc(S.data.config.idLabel || "ID")}</code>
        <textarea name="members" spellcheck="false">${esc(text)}</textarea></label>
      <div class="row" style="margin-top:10px;justify-content:space-between">
        <button type="button" class="btn sm danger" data-act="deleteGroup" data-id="${esc(g.id)}" ${sup ? "" : "disabled"}>Hapus kelompok</button>
        <button class="btn primary sm">Simpan</button></div></form></div></details>`;
}

function ioCard(S) {
  const p = S.importPreview;
  let preview = "";
  if (p?.error) preview = `<div class="alert err">${esc(p.error)}</div>`;
  else if (p) {
    const x = p.parsed;
    const parts = [];
    if (x.groups) parts.push(`${x.groups.length} kelompok (${x.groups.reduce((n, g) => n + g.members.length, 0)} anggota)`);
    if (x.roles) parts.push(`${x.roles.length} peran`);
    if (x.sessions) parts.push(`${x.sessions.length} pertemuan`);
    preview = `<div class="alert ok"><b>${esc(p.name)}</b>: ${parts.join(", ") || "tidak ada data yang dikenali"}.
      ${(x.warnings || []).map((w) => `<br>⚠ ${esc(w)}`).join("")}</div>
      ${parts.length ? `<div class="row">
        <button class="btn primary" data-act="applyImport" data-mode="merge">Gabungkan dengan data saat ini</button>
        <button class="btn danger" data-act="applyImport" data-mode="replace" ${isSuper() ? "" : "disabled"} title="${isSuper() ? "" : "Khusus super admin"}">Ganti bagian yang ada di berkas</button>
        <button class="btn" data-act="cancelImport">Batal</button></div>
        <p class="muted small">Gabungkan: kelompok & peran dicocokkan lewat nama, pertemuan lewat nomor; data lain tidak dihapus.</p>` : ""}`;
  }
  return `<div class="card"><h2>Impor &amp; ekspor</h2>
    <p class="muted small" style="margin-top:0">Ekspor / impor berformat <b>.xlsx</b> (sheet <i>Daftar Kelompok</i>, <i>Peran</i>, <i>Riwayat</i>), <b>.csv</b>, atau cadangan <b>.json</b>. Format <i>Daftar Kelompok</i> sama dengan berkas Daftar_Kelompok.xlsx (Kelompok, No, Nama, NIM).</p>
    <div class="row">
      <button class="btn" data-act="export" data-fmt="xlsx">Ekspor .xlsx</button>
      <button class="btn" data-act="export" data-fmt="json">Cadangan .json</button>
      <button class="btn" data-act="export" data-fmt="riwayat">Riwayat .csv</button>
      <button class="btn" data-act="export" data-fmt="kelompok">Kelompok .csv</button>
    </div>
    <div class="divider"></div>
    <label class="f">Impor berkas (.xlsx, .csv, .json)<input type="file" data-file="import" accept=".xlsx,.xls,.csv,.json"></label>
    ${preview}</div>`;
}

/* ================= PENGGUNA ================= */
export function viewUsers(S) {
  const a = S.admins;
  const rows = Array.isArray(a)
    ? a.sort((x, y) => x.email.localeCompare(y.email)).map((u) => `<tr><td>${esc(u.email)}</td>
        <td><select data-adminrole="${esc(u.email)}" ${u.email === S.auth.email ? "disabled" : ""}>
          <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
          <option value="superadmin" ${u.role === "superadmin" ? "selected" : ""}>Super Admin</option></select></td>
        <td class="row end">${u.email === S.auth.email ? '<span class="muted small">akun Anda</span>' : `<button class="btn sm danger" data-act="removeAdmin" data-email="${esc(u.email)}">Cabut akses</button>`}</td></tr>`).join("")
    : "";
  return `<div class="card"><h2>Admin &amp; super admin</h2>
    <p class="muted small" style="margin-top:0"><b>Admin</b>: acak, edit pertemuan, kelola kelompok/peran, impor (gabung). <b>Super admin</b>: semua itu + kelola pengguna, hapus kelompok, impor mode ganti, reset data. Pengunjung tanpa login hanya bisa melihat.</p>
    ${a === null ? '<div class="alert err">Tidak dapat memuat daftar (izin ditolak).</div>' : ""}
    ${a === undefined ? '<p class="muted">Memuat…</p>' : `<div class="scroll"><table><thead><tr><th>Email Google</th><th>Peran</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="muted">Belum ada.</td></tr>'}</tbody></table></div>`}
    <div class="divider"></div>
    <form data-form="admin"><div class="grid">
      <label class="f">Tambah email<input type="email" name="email" placeholder="nama@gmail.com" required></label>
      <label class="f">Peran<select name="role"><option value="admin">Admin</option><option value="superadmin">Super Admin</option></select></label>
    </div><div class="row end" style="margin-top:12px"><button class="btn primary">Tambah / perbarui</button></div></form>
    ${S.store.mode === "local" ? '<div class="alert info">Mode demo: daftar ini hanya contoh dan tidak mempengaruhi login. Di Firebase, daftar ini tersimpan di koleksi <code>roles</code>.</div>' : ""}</div>
  <div class="card"><h2>Zona berbahaya</h2>
    <div class="row">
      <button class="btn danger" data-act="resetHistory">Kosongkan semua hasil pengacakan</button>
      <button class="btn danger" data-act="wipeAll">Hapus kelompok &amp; pertemuan</button>
      <button class="btn danger" data-act="loadSampleReplace">Ganti dengan data contoh</button>
    </div>
    <p class="muted small" style="margin-bottom:0">Ekspor cadangan .json lebih dulu di Kelola data.</p></div>`;
}
