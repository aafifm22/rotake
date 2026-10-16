import { SAMPLE_GROUPS } from "./seed-groups.js";

export function defaultConfig() {
  return { title: "", subtitle: "", idLabel: "ID", roles: [] };
}

export function emptyData() {
  return { config: defaultConfig(), groups: [], sessions: [] };
}

/** Data contoh (Dasar K3): 8 kelompok, 4 peran x 2 kelompok, pertemuan 3-6 belum diacak. */
export function seedData() {
  return {
    config: {
      title: "Dasar K3",
      subtitle: "Tugas Terstruktur · Pertemuan 3–6",
      idLabel: "NIM",
      roles: [
        { id: "r_presentasi", name: "Presentasi", slots: 2, allowRepeat: false, color: "#2563eb", desc: "Mempresentasikan tugas terstruktur, lalu berdiskusi dengan kelas" },
        { id: "r_penilai", name: "Penilai", slots: 2, allowRepeat: false, color: "#d97706", desc: "Bertanya atau menguji, lalu menilai kelompok presentasi sesuai rubrik" },
        { id: "r_penanggap", name: "Penanggap", slots: 2, allowRepeat: false, color: "#059669", desc: "Memberi tanggapan atas gaya presentasi dan isi" },
        { id: "r_pendokumentasi", name: "Pendokumentasi", slots: 2, allowRepeat: false, color: "#9333ea", desc: "Merangkum, memotret/merekam, dan mengunggah konten ke media sosial" },
      ],
    },
    groups: structuredClone(SAMPLE_GROUPS),
    sessions: [
      { id: "s_3", number: 3, date: "", topic: "Bahaya dalam K3", notes: "", assignments: {} },
      { id: "s_4", number: 4, date: "", topic: "Risiko dalam K3", notes: "", assignments: {} },
      { id: "s_5", number: 5, date: "", topic: "Ruang lingkup K3", notes: "", assignments: {} },
      { id: "s_6", number: 6, date: "", topic: "Pengertian, teori penyebab, dan faktor penyebab kecelakaan kerja serta PAK", notes: "", assignments: {} },
    ],
  };
}
