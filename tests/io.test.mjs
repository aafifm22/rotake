import test from "node:test";
import assert from "node:assert/strict";
import { parseCSV, parseTables, parseBackup, buildNext, toCSV } from "../public/js/io.js";
import { seedData } from "../public/js/seed.js";

globalThis.document = undefined;

test("CSV round trip dengan koma, kutip, dan titik koma", () => {
  const rows = [["a", "b"], ['x,y', 'he said "hi"'], ["1", "2"]];
  assert.deepEqual(parseCSV(toCSV(rows)), rows);
  assert.deepEqual(parseCSV("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
});

test("impor Daftar Kelompok format asli (Kelompok,No,Nama,NIM)", () => {
  const p = parseTables({ "Daftar Kelompok": [["Kelompok", "No", "Nama", "NIM"], ["Kelompok 1", "1", "A", "1"], ["", "2", "B", "2"], ["Kelompok 2", "1", "C", "3"]] });
  assert.equal(p.groups.length, 2);
  assert.equal(p.groups[0].members.length, 2); // baris kosong = lanjut kelompok sebelumnya
  const cur = { config: { title: "T", idLabel: "ID", roles: [] }, groups: [], sessions: [] };
  const { next, report } = buildNext(cur, p);
  assert.equal(next.groups.length, 2); assert.equal(report.groups, 2); assert.equal(next.config.idLabel, "NIM");
});

test("impor riwayat membuat kelompok & peran yang belum ada, cocokkan yang sudah ada", () => {
  const cur = seedData();
  const p = parseTables({ Riwayat: [["Pertemuan", "Tanggal", "Topik", "Kelompok", "Peran"],
    [3, "17/10/2026", "Bahaya dalam K3", "Kelompok 1", "Presentasi"],
    [3, "17/10/2026", "Bahaya dalam K3", "kelompok 2", "penilai"],
    [3, "17/10/2026", "Bahaya dalam K3", "Kelompok 99", "Moderator"]] });
  const { next, report } = buildNext(cur, p);
  const s3 = next.sessions.find((s) => s.number === 3);
  assert.equal(s3.id, "s_3"); assert.equal(s3.date, "2026-10-17");
  assert.equal(s3.assignments.g1, "r_presentasi"); assert.equal(s3.assignments.g2, "r_penilai");
  assert.equal(Object.keys(s3.assignments).length, 3);
  assert.equal(report.created.length, 2);
  assert.equal(next.groups.length, 9);
});

test("cadangan JSON -> parse -> replace menghasilkan data setara", () => {
  const d = seedData();
  d.sessions[0].assignments = { g1: "r_presentasi", g2: "r_penilai" };
  const { next } = buildNext(seedData(), parseBackup(JSON.parse(JSON.stringify(d))), { replace: true });
  assert.equal(next.groups.length, 8);
  assert.equal(next.config.roles.length, 4);
  const a = next.sessions.find((s) => s.number === 3).assignments;
  assert.equal(Object.values(a).length, 2);
});
