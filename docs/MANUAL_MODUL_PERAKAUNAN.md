# Manual Pengguna: Modul Perakaunan MRSM

**Untuk: Bendahari, Sub-Bendahari & JuruAudit**

Manual ini menerangkan cara menggunakan Sistem Perakaunan MRSM—dari rekod transaksi, pengesahan, sehingga laporan. Sistem menggunakan **perakaunan entri bergu** (double-entry): setiap transaksi direkod sebagai Debit dan Kredit secara automatik.

---

## Kandungan

1. [Pengenalan](#1-pengenalan)
2. [Kelebihan Sistem Perakaunan](#2-kelebihan-sistem-perakaunan)
3. [Peranan & Tanggungjawab](#3-peranan--tanggungjawab)
4. [Aliran Kerja Transaksi](#4-aliran-kerja-transaksi)
5. [Proses Bendahari](#5-proses-bendahari)
6. [Proses JuruAudit](#6-proses-juruaudit)
7. [Senarai Akaun (COA)](#7-senarai-akaun-coa)
8. [Akaun Bank & Kategori](#8-akaun-bank--kategori)
9. [Laporan](#9-laporan)
10. [Migrasi Entri Jurnal (Sekali Sahaja)](#10-migrasi-entri-jurnal-sekali-sahaja)
11. [Soalan Lazim](#11-soalan-lazim)

---

## 1. Pengenalan

### Apa itu Modul Perakaunan?

Modul Perakaunan digunakan untuk:

- **Merekod wang masuk** (yuran, derma, jualan, dll.)
- **Merekod wang keluar** (perbelanjaan operasi, program, utiliti, dll.)
- **Menyimpan rekod mengikut akaun bank** dan kategori
- **Menghasilkan laporan** bulanan, tahunan, dan laporan untuk AGM (Penyata Pendapatan & Perbelanjaan, Kunci Kira-kira, Aliran Tunai, Imbangan Duga)

### Entri Bergu (Double-Entry)

Setiap transaksi dalam sistem direkod secara **entri bergu**:

- **Wang masuk:** Sistem merekod **Debit** pada Akaun Bank dan **Kredit** pada Kategori Hasil (pendapatan).
- **Wang keluar:** Sistem merekod **Debit** pada Kategori Belanja dan **Kredit** pada Akaun Bank.

Anda **tidak perlu** memasukkan debit/kredit secara manual—pilih jenis transaksi (Wang Masuk / Wang Keluar), kategori, akaun bank (pilihan), dan jumlah; sistem yang mengira entri jurnal.

---

## 2. Kelebihan Sistem Perakaunan

Apa yang **pengguna akan dapat** apabila menggunakan sistem perakaunan ini:

| Kelebihan | Keterangan |
|-----------|------------|
| **Entri bergu automatik** | Anda hanya pilih Wang Masuk/Keluar, kategori, akaun bank dan jumlah. Debit dan Kredit dikira oleh sistem—tiada risiko imbangan tidak seimbang. |
| **Pemisahan tugas (Bendahari vs JuruAudit)** | Bendahari merekod; JuruAudit mengesahkan. Mengurangkan ralat, memudahkan audit dan mematuhi amalan kawalan dalaman. |
| **Audit trail yang jelas** | Setiap transaksi ada nombor rujukan, tarikh, pengguna dan status. Transaksi yang sudah disahkan **tidak boleh diedit/dipadam**—rekod kekal untuk siasatan. |
| **Tempoh dikunci** | Bulan/tahun yang sudah dikunci tidak boleh diubah. Memastikan laporan lepas tidak diubah selepas tarikh tutup buku. |
| **Laporan standard satu tempat** | Laporan Bulanan, Tahunan, Penyata P&P, Kunci Kira-kira, Aliran Tunai dan Imbangan Duga dijana dari data yang sama—konsisten dan siap untuk AGM. |
| **Urusan mengikut akaun bank & kategori** | Setiap transaksi dikaitkan dengan akaun bank dan kategori hasil/belanja. Anda boleh lihat baki dan pecahan mengikut akaun serta jenis pendapatan/perbelanjaan. |
| **Integrasi dengan Yuran & AR** | Bayaran yuran dari portal atau rekod bendahari auto-posting ke jurnal (Dr Bank, Cr AR). Modul AR (Akaun Belum Terima) disegerakkan dengan sub-ledger pelajar dan aging—satu sumber benar untuk yuran dan perakaunan. |
| **Pengurusan COA (Chart of Accounts)** | Kategori dan Akaun Bank boleh ditetapkan dengan Kod Akaun; memudahkan Imbangan Duga dan penyediaan laporan berformat perakaunan. |

Ringkasnya: **kurang kerja manual**, **rekod terjamin** dan **laporan siap guna** dari satu sistem bersepadu.

**Kesediaan beroperasi mengikut amalan perakaunan antarabangsa (ACCA):** Asas sistem (entri bergu, kawalan dalaman, audit trail, laporan P&P, Kunci Kira-kira, Aliran Tunai, AR) sudah selari dengan prinsip perakaunan yang diiktiraf antarabangsa. Ini bukan pensijilan ACCA rasmi. Untuk perincian apa yang sedia ada dan apa yang boleh ditambah, rujuk **`docs/PERAKAUNAN_KESEDIAAN_ANTARABANGSA.md`**.

---

## 3. Peranan & Tanggungjawab

| Peranan        | Boleh buat                                                                 | Tidak boleh buat (orang lain)        |
|----------------|----------------------------------------------------------------------------|--------------------------------------|
| **Bendahari**  | Cipta/edit/padam transaksi, urus kategori & akaun bank, lihat laporan      | Sahkan transaksi                     |
| **Sub-Bendahari** | Sama seperti Bendahari                                                 | Sahkan transaksi                     |
| **JuruAudit**  | Sahkan atau tolak transaksi, lihat transaksi & laporan, log audit          | Cipta atau edit transaksi            |
| **Admin / Superadmin** | Semua fungsi Bendahari + pengurusan pengguna & migrasi jurnal      | -                                    |

**Pemisahan tugas:** Bendahari merekod; JuruAudit mengesahkan. Ini mengurangkan ralat dan memudahkan audit.

---

## 4. Aliran Kerja Transaksi

```
[Bendahari] Cipta transaksi (Wang Masuk / Wang Keluar)
       ↓
Status: MENUNGGU PENGESAHAN
       ↓
[JuruAudit] Sahkan atau Tolak transaksi
       ↓
Status: DISAHKAN atau DITOLAK
       ↓
Transaksi yang DISAHKAN masuk ke dalam laporan (bulanan, tahunan, AGM)
```

- Hanya transaksi yang **Disahkan** akan dikira dalam laporan kewangan.
- Transaksi **Ditolak** tidak dipaparkan dalam jumlah pendapatan/perbelanjaan.
- **Tempoh dikunci:** Selepas sesuatu bulan/tahun dikunci, transaksi dalam tempoh itu tidak boleh diedit/dipadam (untuk integriti audit).

---

## 5. Proses Bendahari

### 5.1 Masuk ke Modul Perakaunan

1. Log masuk ke portal MRSM.
2. Dari menu, pilih **Sistem Perakaunan** (atau **Ringkasan Akaun** bergantung pada set menu).
3. Dashboard Perakaunan memaparkan:
   - Wang masuk / keluar bulan ini
   - Baki keseluruhan
   - Bilangan transaksi menunggu pengesahan

### 5.2 Rekod Wang Masuk (Pendapatan)

**Contoh:** Terima bayaran yuran RM500 ke Akaun Semasa MUAFAKAT.

1. Klik **Transaksi Baru** atau **Rekod Wang Masuk**.
2. Pilih **Wang Masuk**.
3. Isi:
   - **Kategori:** Pilih kategori pendapatan (cth. Yuran Pelajar, Derma & Sumbangan, Jualan Koperasi).
   - **Akaun Bank (pilihan):** Pilih akaun bank yang menerima wang. Jika dibiarkan kosong, sistem akan guna akaun default “Tunai/Bank Sistem”.
   - **Jumlah (RM):** 500.00
   - **Tarikh Transaksi:** Tarikh bayaran diterima.
   - **Penerangan:** Cth. “Bayaran yuran Ahmad bin Ali - Set Yuran 2025”.
   - **Nombor Rujukan (pilihan):** No. resit atau invois jika ada.
4. Klik **Simpan**.

Sistem akan:

- Mencipta satu transaksi dengan nombor rujukan (cth. TRX-2025-0001).
- Mencipta entri jurnal: **Debit** Akaun Bank RM500, **Kredit** Kategori Hasil RM500.

Transaksi mula-mula berstatus **Menunggu Pengesahan**. Selepas JuruAudit menyahkan, ia dikira dalam laporan.

### 5.3 Rekod Wang Keluar (Perbelanjaan)

**Contoh:** Bayar bil elektrik RM1,200 dari Akaun Semasa.

1. Klik **Transaksi Baru** atau **Rekod Wang Keluar**.
2. Pilih **Wang Keluar**.
3. Isi:
   - **Kategori:** Pilih kategori perbelanjaan (cth. Utiliti, Operasi Am).
   - **Akaun Bank:** Pilih akaun yang mengeluarkan wang.
   - **Jumlah (RM):** 1200.00
   - **Tarikh**, **Penerangan**, **Nombor Rujukan** (jika ada).
4. Klik **Simpan**.

Sistem akan merekod: **Debit** Kategori Belanja RM1,200, **Kredit** Akaun Bank RM1,200.

### 5.4 Edit atau Padam Transaksi

- **Edit:** Hanya transaksi yang masih **Menunggu Pengesahan** boleh diedit. Buka transaksi → **Edit** → ubah maklumat → **Simpan**.
- **Padam:** Hanya transaksi **Menunggu Pengesahan** boleh dipadam. Buka transaksi → **Padam** → sahkan.

Selepas transaksi **Disahkan**, ia tidak boleh diedit atau dipadam (kecuali ada mekanisme khas pihak pentadbir). Ini mengekalkan audit trail.

### 5.5 Lihat Butiran & Entri Jurnal

- Dari **Senarai Transaksi**, klik satu transaksi untuk buka butiran.
- Jika transaksi mempunyai entri jurnal, paparan **Entri Bergu (Jurnal)** akan menunjukkan:
  - No. entri jurnal (cth. JE-2025-0001)
  - Jadual: Akaun | Debit (RM) | Kredit (RM)
  - Jumlah debit = jumlah kredit (sentiasa seimbang)

Ini membantu Bendahari dan JuruAudit semak bahawa rekod adalah betul.

---

## 6. Proses JuruAudit

### 6.1 Semak Transaksi Menunggu Pengesahan

1. Masuk ke **Sistem Perakaunan**.
2. Klik **Sahkan Transaksi** atau **Pengesahan** (atau lihat bilangan “Menunggu Pengesahan” di dashboard).
3. Senarai transaksi yang berstatus **Menunggu** akan dipaparkan.

### 6.2 Sahkan atau Tolak

1. Buka transaksi yang hendak disahkan.
2. Semak:
   - Jumlah, tarikh, penerangan, kategori, akaun bank.
   - Jika ada, semak bahagian **Entri Bergu (Jurnal)**.
3. Klik **Sahkan** jika rekod betul, atau **Tolak** jika ada kesilapan/suspek.
4. Jika tolak, isi **Nota pengesahan** (cth. “Jumlah tidak sepadan dengan resit”).
5. Sahkan tindakan.

- **Sahkan:** Status bertukar ke **Disahkan**; transaksi akan masuk dalam laporan.
- **Tolak:** Status **Ditolak**; transaksi tidak dikira dalam laporan. Bendahari boleh cipta transaksi baru yang betul jika perlu.

---

## 7. Senarai Akaun (COA)

Senarai Akaun (Chart of Accounts) ialah rujukan semua akaun yang digunakan dalam sistem.

### Cara akses

- Dari Dashboard Perakaunan → **Menu Perakaunan** → **Senarai Akaun**.

### Kandungan

- **Aset (Akaun Bank):** Semua akaun bank yang aktif (cth. Akaun Semasa, Tunai Runcit). Boleh ada **Kod Akaun** (cth. 1100).
- **Hasil (Pendapatan):** Kategori wang masuk (Yuran, Derma, Jualan, dll.) dengan kod jika ditetapkan.
- **Belanja (Perbelanjaan):** Kategori wang keluar (Operasi, Utiliti, Program, dll.) dengan kod.

Kod akaun digunakan untuk Imbangan Duga dan laporan berformat perakaunan. Anda boleh kemaskini kod di:

- **Kategori:** Halaman **Kategori** → Edit kategori → isi **Kod Akaun (Pilihan)**.
- **Akaun Bank:** Halaman **Akaun Bank** → Edit akaun → isi **Kod Akaun (COA)**.

---

## 8. Akaun Bank & Kategori

### 8.1 Akaun Bank

- **Lokasi:** Menu Perakaunan → **Akaun Bank**.
- **Tambah akaun:** Klik **Tambah Akaun Bank** → isi Nama, Jenis (Semasa/Simpanan/Tunai Runcit/Simpanan Tetap), Nama Bank, No. Akaun, Keterangan, Kod Akaun (pilihan).
- **Edit:** Klik ikon edit pada kad akaun → ubah maklumat → **Simpan**.
- Pastikan akaun yang digunakan untuk terima/bayar wang dipilih ketika rekod transaksi supaya laporan tunai mengikut akaun adalah betul.

### 8.2 Kategori

- **Lokasi:** Menu Perakaunan → **Kategori**.
- **Jenis:** Wang Masuk (Hasil) atau Wang Keluar (Belanja).
- **Tambah/Edit:** Nama, Penerangan, Kod Akaun (pilihan), Kategori induk (jika ada).
- Gunakan kategori yang konsisten (cth. semua yuran di “Yuran Pelajar”, semua bil utiliti di “Utiliti”) supaya laporan mengikut kategori tepat.

---

## 9. Laporan

### 9.1 Laporan Bulanan

- **Lokasi:** Menu → **Bulanan** (atau Laporan Bulanan).
- Pilih tahun dan bulan.
- Paparan: Jumlah wang masuk, wang keluar, baki, pecahan mengikut kategori, bilangan transaksi disahkan / menunggu.

### 9.2 Laporan Tahunan

- **Lokasi:** Menu → **Tahunan**.
- Pilih tahun.
- Paparan: Jumlah tahunan, pecahan bulanan, pecahan mengikut kategori pendapatan dan perbelanjaan.

### 9.3 Laporan AGM

- **Lokasi:** Menu → **Laporan AGM**.
- Mengandungi laporan standard untuk mesyuarat agung, termasuk:
  - **Penyata Pendapatan & Perbelanjaan**
  - **Kunci Kira-kira**
  - **Penyata Aliran Tunai**
  - **Imbangan Duga**
  - Ringkasan eksekutif (jika ada)

Pilih tahun kewangan yang dikehendaki. Pastikan transaksi untuk tempoh berkenaan telah **Disahkan** sebelum menjana laporan.

### 9.4 Senarai Transaksi & Tapis

- **Lokasi:** **Lihat Semua Transaksi** (atau Senarai Transaksi).
- Boleh tapis mengikut:
  - Jenis (Wang Masuk / Wang Keluar)
  - Status (Menunggu / Disahkan / Ditolak)
  - Kategori
  - **Modul** (Yuran, Koperasi, Bas, Tabung)—untuk bayaran dari Pusat Bayaran
  - Tarikh, carian teks
- Klik satu transaksi untuk lihat butiran dan entri jurnal.

---

## 10. Migrasi Entri Jurnal (Sekali Sahaja)

Jika sistem baru sahaja diaktifkan dengan **entri bergu**, transaksi lama mungkin belum ada rekod jurnal (debit/kredit). Untuk mencipta entri jurnal bagi transaksi lama:

1. Masuk ke **Dashboard Perakaunan** sebagai **Bendahari**, **Admin**, atau **Superadmin**.
2. Dalam **Menu Perakaunan**, cari butang **Migrasi ke Entri Jurnal**.
3. Klik butang → baca mesej pengesahan (proses ini biasanya dijalankan **sekali sahaja**).
4. Sahkan.
5. Sistem akan memproses semua transaksi yang belum ada jurnal dan mencipta entri yang sepadan. Selepas selesai, paparan akan tunjuk bilangan entri yang dicipta (dan bilangan ralat jika ada).

Selepas migrasi, setiap transaksi baru akan sentiasa ada entri jurnal secara automatik; anda tidak perlu jalankan migrasi lagi melainkan diberitahu oleh pentadbir.

---

## 11. Soalan Lazim

**Saya rekod wang masuk tetapi tidak pilih akaun bank. Adakah ia salah?**  
Tidak. Jika anda biarkan akaun bank kosong, sistem akan guna akaun default “Tunai/Bank Sistem”. Untuk ketepatan laporan mengikut bank, disarankan pilih akaun bank yang sebenar.

**Bilakah transaksi masuk dalam laporan?**  
Hanya transaksi yang statusnya **Disahkan** oleh JuruAudit akan dikira dalam laporan bulanan, tahunan, dan AGM.

**Boleh saya edit transaksi yang sudah disahkan?**  
Biasanya tidak. Ini untuk mengekalkan audit trail. Jika ada kesilapan, rujuk pentadbir atau gunakan prosedur pembetulan (jika ada) mengikut dasar sekolah.

**Apa maksud “Tempoh dikunci”?**  
Bulan atau tahun yang telah **dikunci** tidak boleh lagi mengubah (tambah/edit/padam) transaksi dalam tempoh itu. Ini memastikan angka untuk audit dan laporan tidak berubah selepas ditutup.

**Di mana saya boleh lihat debit dan kredit untuk satu transaksi?**  
Buka **Butiran transaksi** → bahagian **Entri Bergu (Jurnal)**. Di sana dipaparkan akaun, jumlah debit, dan jumlah kredit untuk transaksi itu.

**Siapa yang boleh jalankan “Migrasi ke Entri Jurnal”?**  
Hanya **Bendahari**, **Admin**, dan **Superadmin**. Proses ini disyorkan dijalankan sekali sahaja selepas sistem entri bergu diaktifkan.

---

## Ringkasan Cepat untuk Bendahari

| Tugas              | Langkah ringkas |
|--------------------|------------------|
| Rekod wang masuk   | Transaksi Baru → Wang Masuk → Pilih kategori & akaun bank → Isi jumlah, tarikh, penerangan → Simpan |
| Rekod wang keluar  | Transaksi Baru → Wang Keluar → Pilih kategori & akaun bank → Isi jumlah, tarikh, penerangan → Simpan |
| Semak transaksi    | Senarai Transaksi → Klik transaksi → Lihat butiran & Entri Jurnal |
| Edit transaksi     | Buka transaksi (status Menunggu) → Edit → Simpan |
| Urus kategori      | Menu → Kategori → Tambah/Edit, isi Kod Akaun jika perlu |
| Urus akaun bank    | Menu → Akaun Bank → Tambah/Edit, isi Kod Akaun jika perlu |
| Lihat Senarai Akaun| Menu → Senarai Akaun |
| Laporan bulanan    | Menu → Bulanan → Pilih tahun & bulan |
| Laporan AGM        | Menu → Laporan AGM → Pilih tahun kewangan |
| Migrasi jurnal     | Menu → Migrasi ke Entri Jurnal (sekali sahaja, Bendahari/Admin) |

---

*Manual ini mengikut ciri Modul Perakaunan dalam sistem MRSM. Jika ada perbezaan pada skrin (nama menu atau lokasi), rujuk pentadbir sistem atau dokumentasi dalam aplikasi.*
