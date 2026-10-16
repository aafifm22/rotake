// Mesin pengacakan peran. Murni (tanpa DOM) supaya bisa diuji di Node.
const BIG = 1e7;

/** Hitung berapa kali tiap kelompok memegang tiap peran. */
export function roleCounts(sessions, { excludeSessionId = null, fromNumber = 0 } = {}) {
  const counts = {};
  for (const s of sessions) {
    if (s.id === excludeSessionId) continue;
    if (fromNumber && s.number < fromNumber) continue;
    for (const [gid, rid] of Object.entries(s.assignments || {})) {
      if (!rid) continue;
      (counts[gid] ||= {})[rid] = ((counts[gid] || {})[rid] || 0) + 1;
    }
  }
  return counts;
}

/** Hungarian algorithm: n baris <= m kolom. Mengembalikan indeks kolom per baris. */
export function hungarian(a) {
  const n = a.length;
  if (!n) return [];
  const m = a[0].length;
  const u = Array(n + 1).fill(0), v = Array(m + 1).fill(0), p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(m + 1).fill(Infinity);
    const used = Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) ans[p[j] - 1] = j - 1;
  return ans;
}

/**
 * Acak peran.
 * @param {object} o
 * @param {Array} o.groups   [{id,name}]
 * @param {Array} o.roles    [{id,name,slots,allowRepeat}]
 * @param {Array} o.sessions riwayat pertemuan
 * @param {string|null} o.excludeSessionId pertemuan yang sedang diedit (tidak dihitung sbg riwayat)
 * @param {string[]} o.absent id kelompok yang tidak ikut diacak
 * @param {object} o.pinned  {groupId: roleId} penetapan manual yang dipertahankan
 * @param {object} o.allowRepeat {roleId: bool} override sesi ini
 * @param {boolean} o.strict true = berhenti jika tidak ada solusi tanpa pengulangan
 * @param {number} o.fromNumber abaikan riwayat sebelum pertemuan ke-N (0 = pakai semua)
 */
export function randomize({
  groups, roles, sessions, excludeSessionId = null, absent = [], pinned = {},
  allowRepeat = {}, strict = true, fromNumber = 0, rng = Math.random,
}) {
  const counts = roleCounts(sessions, { excludeSessionId, fromNumber });
  const roleById = Object.fromEntries(roles.map((r) => [r.id, r]));
  const canRepeat = (r) => (allowRepeat[r.id] !== undefined ? !!allowRepeat[r.id] : !!r.allowRepeat);
  const cnt = (gid, rid) => counts[gid]?.[rid] || 0;

  const absentSet = new Set(absent);
  const active = groups.filter((g) => !absentSet.has(g.id));
  const assignments = {};
  const slotsLeft = Object.fromEntries(roles.map((r) => [r.id, Math.max(0, +r.slots || 0)]));

  for (const g of active) {
    const rid = pinned[g.id];
    if (!rid || !roleById[rid]) continue;
    assignments[g.id] = rid;
    slotsLeft[rid]--;
    if (slotsLeft[rid] < 0) {
      return { ok: false, error: `Penetapan manual untuk peran "${roleById[rid].name}" melebihi kuotanya (${roleById[rid].slots} kelompok).` };
    }
  }

  const free = active.filter((g) => !assignments[g.id]);
  const cols = [];
  for (const r of roles) for (let i = 0; i < slotsLeft[r.id]; i++) cols.push(r.id);
  while (cols.length < free.length) cols.push(null); // kelompok tanpa peran

  const cost = free.map((g) =>
    cols.map((rid) => {
      const noise = rng() * 5;
      if (rid === null) return noise;
      const c = cnt(g.id, rid);
      if (canRepeat(roleById[rid])) return c * 10 + noise;
      if (c === 0) return noise;
      return strict ? BIG + noise : c * 1000 + noise;
    })
  );

  const pick = hungarian(cost);
  const blocked = [];
  free.forEach((g, i) => {
    if (cost[i][pick[i]] >= BIG) blocked.push(g.id);
  });
  if (blocked.length) {
    // kelompok yang sama sekali tidak punya peran tersisa (penyebab paling umum)
    const stuck = free.filter((g) =>
      !roles.some((r) => slotsLeft[r.id] > 0 && (canRepeat(r) || cnt(g.id, r.id) === 0))
    ).map((g) => g.id);
    return { ok: false, error: "infeasible", stuck, blocked };
  }

  free.forEach((g, i) => {
    const rid = cols[pick[i]];
    if (rid) assignments[g.id] = rid;
  });

  return { ok: true, ...inspect({ groups: active, roles, assignments, counts }) , assignments };
}

/** Laporan atas sebuah penetapan: siapa mengulang, siapa tanpa peran, peran yang belum penuh. */
export function inspect({ groups, roles, assignments, counts }) {
  const repeats = [];
  const unassigned = [];
  const filled = {};
  for (const g of groups) {
    const rid = assignments[g.id];
    if (!rid) { unassigned.push(g.id); continue; }
    filled[rid] = (filled[rid] || 0) + 1;
    if ((counts[g.id]?.[rid] || 0) > 0) repeats.push(g.id);
  }
  const unfilled = roles
    .map((r) => ({ roleId: r.id, missing: Math.max(0, (+r.slots || 0) - (filled[r.id] || 0)) }))
    .filter((x) => x.missing > 0);
  const over = roles
    .map((r) => ({ roleId: r.id, extra: Math.max(0, (filled[r.id] || 0) - (+r.slots || 0)) }))
    .filter((x) => x.extra > 0);
  return { repeats, unassigned, unfilled, over };
}
