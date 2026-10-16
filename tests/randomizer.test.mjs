import test from "node:test";
import assert from "node:assert/strict";
import { randomize, roleCounts, hungarian, inspect } from "../public/js/randomizer.js";

const groups = Array.from({ length: 8 }, (_, i) => ({ id: "g" + (i + 1), name: "Kelompok " + (i + 1) }));
const roles = ["Presentasi", "Penilai", "Penanggap", "Pendokumentasi"].map((n, i) => ({ id: "r" + i, name: n, slots: 2, allowRepeat: false }));

test("hungarian menemukan biaya minimum", () => {
  const a = [[4, 1, 3], [2, 0, 5], [3, 2, 2]];
  const r = hungarian(a);
  assert.equal(r.reduce((s, j, i) => s + a[i][j], 0), 5);
});

test("4 pertemuan berturut-turut: tiap peran terisi 2 kelompok, tidak ada pengulangan (200 simulasi)", () => {
  for (let sim = 0; sim < 200; sim++) {
    const sessions = [];
    for (let n = 3; n <= 6; n++) {
      const res = randomize({ groups, roles, sessions, strict: true });
      assert.ok(res.ok, `sim ${sim} pertemuan ${n} gagal: ${JSON.stringify(res)}`);
      assert.equal(res.repeats.length, 0);
      assert.equal(Object.keys(res.assignments).length, 8);
      for (const r of roles) assert.equal(Object.values(res.assignments).filter((x) => x === r.id).length, 2);
      sessions.push({ id: "s" + n, number: n, assignments: res.assignments });
    }
    // setelah 4 pertemuan tiap kelompok memegang 4 peran berbeda
    const c = roleCounts(sessions);
    for (const g of groups) assert.equal(Object.keys(c[g.id]).length, 4);
  }
});

test("pertemuan ke-5 strict: gagal; mode minimal: berhasil", () => {
  const sessions = [];
  for (let n = 1; n <= 4; n++) sessions.push({ id: "s" + n, number: n, assignments: randomize({ groups, roles, sessions }).assignments });
  const strict = randomize({ groups, roles, sessions, strict: true });
  assert.equal(strict.ok, false);
  assert.equal(strict.error, "infeasible");
  assert.equal(strict.stuck.length, 8);
  const loose = randomize({ groups, roles, sessions, strict: false });
  assert.ok(loose.ok);
  assert.equal(loose.repeats.length, 8);
});

test("fromNumber mengabaikan riwayat lama (siklus baru)", () => {
  const sessions = [1, 2, 3, 4].map((n) => ({ id: "s" + n, number: n, assignments: Object.fromEntries(groups.map((g, i) => [g.id, roles[(i + n) % 4].id])) }));
  assert.equal(randomize({ groups, roles, sessions, fromNumber: 5 }).ok, true);
  assert.equal(randomize({ groups, roles, sessions, fromNumber: 5 }).repeats.length, 0);
});

test("allowRepeat per peran dan override sesi", () => {
  const sessions = [{ id: "s1", number: 1, assignments: Object.fromEntries(groups.map((g, i) => [g.id, roles[Math.floor(i / 2)].id])) }];
  const rep = roles.map((r) => ({ ...r, allowRepeat: true }));
  assert.ok(randomize({ groups, roles: rep, sessions }).ok);
  const ov = randomize({ groups, roles, sessions, allowRepeat: { r0: true, r1: true, r2: true, r3: true }, strict: true });
  assert.ok(ov.ok);
});

test("kelompok absen tidak diacak, peran tersisa tidak penuh", () => {
  const res = randomize({ groups, roles, sessions: [], absent: ["g1", "g2"] });
  assert.ok(res.ok);
  assert.equal(Object.keys(res.assignments).length, 6);
  assert.ok(!("g1" in res.assignments));
  assert.equal(res.unfilled.reduce((s, x) => s + x.missing, 0), 2);
});

test("kelompok lebih banyak dari kuota: sisanya tanpa peran", () => {
  const res = randomize({ groups, roles: roles.slice(0, 2), sessions: [] });
  assert.ok(res.ok);
  assert.equal(Object.keys(res.assignments).length, 4);
  assert.equal(res.unassigned.length, 4);
});

test("pin dipertahankan dan melebihi kuota ditolak", () => {
  const res = randomize({ groups, roles, sessions: [], pinned: { g1: "r0", g2: "r0" } });
  assert.ok(res.ok);
  assert.equal(res.assignments.g1, "r0");
  assert.equal(Object.values(res.assignments).filter((x) => x === "r0").length, 2);
  const bad = randomize({ groups, roles, sessions: [], pinned: { g1: "r0", g2: "r0", g3: "r0" } });
  assert.equal(bad.ok, false);
});

test("sesi yang sedang diedit tidak dihitung sebagai riwayat", () => {
  const sessions = [{ id: "s1", number: 1, assignments: Object.fromEntries(groups.map((g, i) => [g.id, roles[Math.floor(i / 2)].id])) }];
  const c = roleCounts(sessions, { excludeSessionId: "s1" });
  assert.deepEqual(c, {});
});

test("inspect menandai pengulangan", () => {
  const counts = { g1: { r0: 1 } };
  const rep = inspect({ groups: groups.slice(0, 2), roles, assignments: { g1: "r0", g2: "r0" }, counts });
  assert.deepEqual(rep.repeats, ["g1"]);
});
