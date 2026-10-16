import { esc, fmtDate, fmtDateShort, sortGroups, sortSessions } from "./util.js";
import { roleCounts } from "./randomizer.js";
import { isAdmin } from "./state.js";

export const roleChip = (r) => (r ? `<span class="chip" style="--c:${esc(r.color || "#888")}"><i></i>${esc(r.name)}</span>` : "");

const maps = (d) => ({
  groups: sortGroups(d.groups),
  sessions: sortSessions(d.sessions),
  role: Object.fromEntries(d.config.roles.map((r) => [r.id, r])),
  group: Object.fromEntries(d.groups.map((g) => [g.id, g])),
});

export function viewHistory(S) {
  const d = S.data, m = maps(d);
  if (!d.groups.length && !d.sessions.length) return emptyState(S);
  const done = m.sessions.filter((s) => Object.keys(s.assignments || {}).length).length;

  const filter = `
    <div class="row" style="margin-bottom:14px">
      <label class="f" style="min-width:220px">Lihat per kelompok
        <select data-change="filterGroup">
          <option value="">Semua pertemuan</option>
          ${m.groups.map((g) => `<option value="${esc(g.id)}" ${S.filterGroup === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}
        </select>
      </label>
    </div>`;

  if (S.filterGroup && m.group[S.filterGroup]) return filter + groupDetail(S, m, m.group[S.filterGroup]);

  const stats = `<div class="stats">
      <span><b>${d.groups.length}</b> kelompok</span>
      <span><b>${d.config.roles.length}</b> peran</span>
      <span><b>${m.sessions.length}</b> pertemuan (<b>${done}</b> sudah diacak)</span>
    </div>`;

  const roleLegend = d.config.roles.length
    ? `<div class="legend">${d.config.roles.map((r) => `<span title="${esc(r.desc || "")}">${roleChip(r)} <span class="muted small">× ${r.slots}${r.allowRepeat ? " · boleh sama" : " · tidak berulang"}</span></span>`).join("")}</div>`
    : "";

  const cards = [...m.sessions].reverse().map((s) => sessionCard(S, m, s)).join("");
  return filter + stats + roleLegend + (cards ? `<div class="sessions">${cards}</div>` : `<div class="card empty">Belum ada pertemuan.</div>`);
}

function sessionCard(S, m, s) {
  const a = s.assignments || {};
  const has = Object.keys(a).length > 0;
  const lines = !has
    ? `<p class="muted" style="margin:0">Peran belum diacak.</p>`
    : S.data.config.roles.map((r) => {
        const gs = m.groups.filter((g) => a[g.id] === r.id);
        return `<div class="role-line"><div>${roleChip(r)}</div><div>${gs.length
          ? gs.map((g) => `<button class="pill" data-act="viewGroup" data-id="${esc(g.id)}">${esc(g.name)}</button>`).join("")
          : `<span class="muted small">—</span>`}</div></div>`;
      }).join("") + (() => {
        const none = m.groups.filter((g) => !a[g.id]);
        return none.length ? `<div class="role-line"><div class="muted small">Tanpa peran</div><div>${none.map((g) => `<span class="pill muted">${esc(g.name)}</span>`).join("")}</div></div>` : "";
      })();
  return `<article class="card sess">
    <div class="card-head"><h3>Pertemuan ${s.number}</h3><span class="status ${has ? "done" : ""}">${has ? "Sudah diacak" : "Belum diacak"}</span></div>
    <div class="meta">${s.date ? esc(fmtDate(s.date)) : "Tanggal belum diisi"}</div>
    <div class="topic">${esc(s.topic || "Tanpa topik")}</div>
    ${s.notes ? `<p class="muted small" style="margin-top:-6px">${esc(s.notes)}</p>` : ""}
    ${lines}
    ${isAdmin() ? `<div class="row end" style="margin-top:10px"><button class="btn sm" data-act="editSession" data-id="${esc(s.id)}">${has ? "Edit / acak ulang" : "Acak peran"}</button></div>` : ""}
  </article>`;
}

function groupDetail(S, m, g) {
  const d = S.data;
  const counts = roleCounts(m.sessions)[g.id] || {};
  const never = d.config.roles.filter((r) => !counts[r.id]);
  const rows = m.sessions.map((s) => {
    const r = m.role[s.assignments?.[g.id]];
    const has = Object.keys(s.assignments || {}).length > 0;
    return `<tr><td>${s.number}</td><td>${esc(fmtDateShort(s.date)) || '<span class="muted">—</span>'}</td><td>${esc(s.topic)}</td>
      <td>${r ? roleChip(r) : `<span class="muted">${has ? "Tanpa peran" : "Belum diacak"}</span>`}</td></tr>`;
  }).join("");
  return `<div class="card"><div class="card-head"><h2>${esc(g.name)}</h2><button class="btn sm" data-act="viewGroup" data-id="">Tutup</button></div>
    <p class="muted small" style="margin-top:0">Anggota (${g.members.length})</p>
    <ul style="margin:0 0 14px;padding-left:18px">${g.members.map((x) => `<li>${esc(x.name)}${x.nim ? ` <span class="muted small">· ${esc(x.nim)}</span>` : ""}</li>`).join("")}</ul>
    <p class="muted small" style="margin:0 0 6px">Belum pernah menjadi</p>
    <div class="legend">${never.length ? never.map(roleChip).join("") : '<span class="muted small">Sudah pernah semua peran</span>'}</div>
    <div class="scroll"><table><thead><tr><th>#</th><th>Tanggal</th><th>Topik</th><th>Peran</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

export function viewMatrix(S) {
  const d = S.data, m = maps(d);
  if (!d.groups.length) return `<div class="card empty">Belum ada kelompok.</div>`;
  const counts = roleCounts(m.sessions);
  const head = m.sessions.map((s) => `<th class="c" title="${esc(s.topic)}">P${s.number}<br><span style="font-weight:400;text-transform:none">${esc(fmtDateShort(s.date))}</span></th>`).join("");
  const body = m.groups.map((g) => {
    const cells = m.sessions.map((s) => {
      const has = Object.keys(s.assignments || {}).length > 0;
      const r = m.role[s.assignments?.[g.id]];
      return `<td class="c">${r ? roleChip(r) : `<span class="muted">${has ? "–" : "·"}</span>`}</td>`;
    }).join("");
    const left = d.config.roles.filter((r) => !(counts[g.id]?.[r.id]));
    return `<tr><td class="sticky"><button class="pill" data-act="viewGroup" data-id="${esc(g.id)}">${esc(g.name)}</button></td>${cells}
      <td>${left.length ? left.map(roleChip).join(" ") : '<span class="muted small">—</span>'}</td></tr>`;
  }).join("");
  return `<div class="card"><div class="card-head"><h2>Matriks peran</h2><span class="muted small">Baris = kelompok, kolom = pertemuan</span></div>
    <div class="legend">${d.config.roles.map(roleChip).join("")}<span class="muted small">· belum diacak &nbsp; – tanpa peran</span></div>
    <div class="scroll"><table class="matrix"><thead><tr><th class="sticky">Kelompok</th>${head}<th>Belum pernah menjadi</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
}

function emptyState(S) {
  return `<div class="card empty"><h2>Belum ada data</h2>
    <p>${isAdmin() ? "Impor daftar kelompok atau muat data contoh untuk mulai." : "Data belum diisi oleh admin."}</p>
    ${isAdmin() ? `<div class="row" style="justify-content:center"><button class="btn primary" data-act="loadSample">Muat data contoh (Dasar K3)</button><button class="btn" data-act="goto" data-view="data">Impor / kelola data</button></div>` : ""}</div>`;
}
