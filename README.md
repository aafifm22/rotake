# Rotake

Rotasi peran kelompok. © 2026 A Afif Mauludi.

Rotake adalah app web statis (tanpa build, tanpa npm) untuk mengacak peran kelompok per pertemuan, menyimpan riwayat,
dan mengatur apakah kelompok boleh mendapat peran yang sama lagi. Generik: kelompok, peran, kuota, dan topik
semuanya bisa diubah. Data contoh = Daftar_Kelompok.xlsx + Tugas Terstruktur Dasar K3 (4 peran × 2 kelompok).

## Coba lokal (mode demo)
```bash
cd public && python3 -m http.server 8080     # lalu buka http://localhost:8080
```
Selama `public/js/firebase-config.js` masih `null`, app memakai localStorage dan tombol "Demo: masuk Admin/Super Admin".

## Peran pengguna
| Peran | Hak |
|---|---|
| Tamu (tanpa login) | Hanya melihat riwayat dan matriks |
| Admin | + acak peran, edit pertemuan, kelola kelompok/peran, impor (gabung), ekspor |
| Super Admin | + kelola admin, hapus kelompok, impor mode "ganti", reset data |

Kontrol akses ditegakkan di `firestore.rules` (bukan hanya di tampilan).

## Deploy ke Firebase (paket Spark / gratis)
1. Buat project di console.firebase.google.com (tanpa Blaze). Tambahkan **Web app**, salin `firebaseConfig`
   ke `public/js/firebase-config.js` (hapus komentar `export const firebaseConfig = {...}`).
2. **Build → Firestore Database → Create database** (production mode).
3. **Build → Authentication → Sign-in method → Google → Enable.** Domain `*.web.app` / `*.firebaseapp.com` sudah otomatis diizinkan.
4. **Super admin pertama** (sekali saja, manual): di Firestore buat koleksi `roles`, dokumen dengan ID = email Google Anda
   (huruf kecil, mis. `dosen@gmail.com`), field `role` (string) = `superadmin`.
5. Deploy:
   ```bash
   npm i -g firebase-tools && firebase login
   cp .firebaserc.example .firebaserc      # isi project ID
   firebase deploy --only firestore:rules,hosting
   ```
6. Buka `https://PROJECT_ID.web.app`, login Google → tab **Pengguna** untuk menambah admin lain (email Google mereka).
   Di tab **Kelola data → Impor** unggah `Daftar_Kelompok.xlsx`, atau di tab Riwayat klik "Muat data contoh".

Kuota gratis Spark: 50 rb baca/hari, 20 rb tulis/hari. Satu kali buka halaman ≈ 20 dokumen terbaca (8 kelompok + pertemuan + config) → ± 2.500 kunjungan/hari.

## Impor / ekspor
- `.xlsx`: sheet **Daftar Kelompok** (Kelompok, No, Nama, NIM), **Peran** (Peran, Jumlah Kelompok, Boleh Sama, Warna, Deskripsi),
  **Riwayat** (Pertemuan, Tanggal, Topik, Kelompok, Peran). Ekspor menghasilkan sheet yang sama + **Matriks**, jadi bisa diekspor lalu diimpor lagi.
- `.csv`: salah satu tabel di atas (dikenali dari nama kolom). `.json`: cadangan penuh.
- XLSX memakai SheetJS yang dimuat dari CDN jsDelivr hanya saat dipakai. CSV dan JSON bekerja tanpa internet.

## Cara kerja pengacakan
Tiap kuota peran dijadikan "slot", lalu kelompok dicocokkan ke slot dengan algoritma Hungarian (biaya = pengulangan peran,
ditambah derau acak). Peran bertanda *tidak boleh sama* yang sudah pernah dipegang diberi biaya tak hingga, sehingga hasilnya
dijamin tanpa pengulangan bila ada solusinya. Bila tidak ada: berhenti dengan pesan jelas, atau (opsi) izinkan pengulangan
seminimal mungkin, atau mulai siklus baru dengan "abaikan riwayat sebelum pertemuan ke-N".
Kelompok absen dapat dikeluarkan, hasil dapat dikunci per kelompok lalu diacak ulang, dan dapat diubah manual sebelum disimpan.

## Uji
```bash
node --test tests/randomizer.test.mjs tests/io.test.mjs
```

## Struktur data Firestore
`config/main` (judul, peran), `groups/{id}` (nama, anggota), `sessions/{id}` (nomor, tanggal, topik, `assignments: {groupId: roleId}`), `roles/{email}` (`role`).

---
© 2026 A Afif Mauludi. Hak cipta dilindungi.
