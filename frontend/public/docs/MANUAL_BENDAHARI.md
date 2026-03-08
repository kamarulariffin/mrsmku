# Manual Pengguna: Bendahari

**Untuk: Bendahari & Sub-Bendahari**

Manual ini merujuk setiap bahagian (halaman dan panel/modal) yang boleh anda gunakan. **Semua panduan**—yuran, perakaunan, dan AR—disatukan dalam satu dokumen ini. Gunakan navigasi di bawah untuk melompat ke seksyen berkenaan.

---

## Kelebihan & Manual

Bahagian ini memaparkan **kelebihan sistem** dan **navigasi penuh** manual.

### Kelebihan untuk Pengguna (Bendahari)

Apa yang **anda akan dapat** apabila menggunakan sistem kewangan dan perakaunan ini:

- **Kurang kerja manual** — Entri jurnal perakaunan dikira automatik (Wang Masuk/Keluar); yuran dan bayaran auto-posting ke Akaun Belum Terima (AR) dan Bank. Anda pilih kategori, akaun dan jumlah sahaja.
- **Satu tempat untuk yuran & kutipan** — Pakej yuran, senarai yuran pelajar, pusat bayaran (troli), dan AR (tertunggak) bersepadu. Lihat baki, aging dan top tertunggak dari dashboard AR.
- **Kutipan lebih terarah** — Skor risiko (Rendah/Sederhana/Tinggi) dan cadangan tindakan membantu anda utamakan pelajar yang perlu diingatkan; butang "Hantar Peringatan" membolehkan bendahari hantar reminder guna e-mel dan push notifikasi (notifikasi dalam app, push FCM, pautan WhatsApp) sekali klik.
- **Laporan siap guna** — Laporan bulanan, tahunan dan laporan AGM (Penyata P&P, Kunci Kira-kira, Aliran Tunai, Imbangan Duga) dijana dari data yang sama; konsisten dan sesuai untuk mesyuarat.
- **Audit trail & kawalan** — Pemisahan tugas: anda merekod, JuruAudit mengesahkan. Transaksi yang sudah disahkan tidak boleh diedit; tempoh boleh dikunci. Rekod kekal untuk audit.
- **Integriti data** — Semakan AR memastikan jumlah sub-ledger tertunggak sama dengan baki AR dalam perakaunan; jika tidak match, sistem laporkan untuk siasatan.

### Kelebihan Sistem Perakaunan

| Kelebihan | Keterangan |
|-----------|------------|
| **Entri bergu automatik** | Anda hanya pilih Wang Masuk/Keluar, kategori, akaun bank dan jumlah. Debit dan Kredit dikira oleh sistem—tiada risiko imbangan tidak seimbang. |
| **Pemisahan tugas (Bendahari vs JuruAudit)** | Bendahari merekod; JuruAudit mengesahkan. Mengurangkan ralat, memudahkan audit dan mematuhi amalan kawalan dalaman. |
| **Audit trail yang jelas** | Setiap transaksi ada nombor rujukan, tarikh, pengguna dan status. Transaksi yang sudah disahkan **tidak boleh diedit/dipadam**—rekod kekal untuk siasatan. |
| **Tempoh dikunci** | Bulan/tahun yang sudah dikunci tidak boleh diubah. Memastikan laporan lepas tidak diubah selepas tarikh tutup buku. |
| **Laporan standard satu tempat** | Laporan Bulanan, Tahunan, Penyata P&P, Kunci Kira-kira, Aliran Tunai dan Imbangan Duga dijana dari data yang sama—konsisten dan siap untuk AGM. |
| **Urusan mengikut akaun bank & kategori** | Setiap transaksi dikaitkan dengan akaun bank dan kategori hasil/belanja. Anda boleh lihat baki dan pecahan mengikut akaun serta jenis pendapatan/perbelanjaan. |
| **Integrasi dengan Yuran & AR** | Bayaran yuran dari portal atau rekod bendahari auto-posting ke jurnal (Dr Bank, Cr AR). Modul AR disegerakkan dengan sub-ledger pelajar dan aging—satu sumber benar untuk yuran dan perakaunan. |
| **Pengurusan COA (Chart of Accounts)** | Kategori dan Akaun Bank boleh ditetapkan dengan Kod Akaun; memudahkan Imbangan Duga dan penyediaan laporan berformat perakaunan. |

### Kelebihan Modul AR (Akaun Belum Terima)

| Kelebihan | Keterangan |
|-----------|------------|
| **Satu sumber benar** | Yuran pelajar dan baki AR sentiasa sepadan dengan General Ledger—tiada duplikasi atau rekod terpisah. |
| **Auto-posting ke GL** | Cipta invoice (assign set yuran) dan terima bayaran—sistem auto Dr AR Cr Hasil, dan Dr Bank Cr AR; bendahari tidak perlu rekod jurnal manual untuk yuran. |
| **Sub-ledger per pelajar** | Lihat jumlah tertunggak dan senarai invoice per pelajar; senang rujuk bila ibu bapa bertanya atau bila buat kutipan. |
| **Aging tertunggak** | Pecahan 0–30, 31–60, 61–90, 90+ hari—tahu siapa tertunggak lama dan keutamaan tindakan. |
| **Skor risiko & cadangan tindakan** | Setiap pelajar ada risk (Rendah/Sederhana/Tinggi) dan cadangan (peringatan, panggilan ibu bapa, tawaran ansuran); memudahkan keputusan kutipan. |
| **Hantar peringatan sekali klik** | Bendahari boleh hantar reminder guna **e-mel** dan **push notifikasi**. Dari dashboard AR, "Hantar Peringatan" hantar notifikasi dalam app + push (FCM) + pautan WhatsApp; kandungan e-mel ikut template di E-mel Template. |
| **Semakan integriti** | Endpoint integriti pastikan jumlah sub-ledger = baki AR dalam GL; jika tidak match, ada isu data yang perlu disemak. |
| **Pembalikan (reversal)** | Jika entri bayaran salah, Bendahari/Admin boleh buat reversal—entri songsang dicipta dan dikaitkan dengan entri asal untuk audit. |
| **Paparan Warden** | Warden boleh lihat tertunggak mengikut blok dan tingkatan tanpa akses penuh ke semua data kewangan. |

### Navigasi Manual (Kandungan)

Senarai di bawah sama dengan **Kandungan** di sidebar kiri—guna salah satu untuk melompat ke bahagian berkenaan.

**Panduan halaman & modul**

1. [Dashboard Admin](#1-dashboard-admin)
2. [Dashboard Kewangan](#2-dashboard-kewangan)
3. [Pakej Yuran (Set Yuran)](#3-pakej-yuran-set-yuran)
4. [Semua Yuran Pelajar](#4-semua-yuran-pelajar)
5. [Tetapan Yuran (Polisi Ansuran)](#5-tetapan-yuran-polisi-ansuran)
6. [Formula & Logik Pengiraan Ansuran](#6-formula--logik-pengiraan-ansuran)
7. [Tabung & Sumbangan](#7-tabung-sumbangan)
8. [Pusat Bayaran (Modul Bayaran)](#8-pusat-bayaran-modul-bayaran)
9. [Pusat Bayaran – Panel Slider Bayaran Yuran](#9-pusat-bayaran-panel-slider-bayaran-yuran)
10. [Ringkasan Akaun (Modul Perakaunan)](#10-ringkasan-akaun-modul-perakaunan)
11. [Modul Perakaunan – Transaksi & Laporan](#11-modul-perakaunan-transaksi-laporan)
12. [AR (Akaun Belum Terima)](#12-ar-akaun-belum-terima)
13. [E-mel Template](#13-emel-template)
14. [Laporan](#14-laporan)

**Modul Perakaunan (terperinci)**

15. [Perakaunan – Pengenalan & Entri Bergu](#15-perakaunan-pengenalan--entri-bergu)
16. [Perakaunan – Peranan & Aliran Kerja](#16-perakaunan-peranan--aliran-kerja)
17. [Perakaunan – Proses Bendahari & JuruAudit](#17-perakaunan-proses-bendahari-juruaudit)
18. [Perakaunan – COA, Akaun Bank & Kategori](#18-perakaunan-coa-akaun-bank-kategori)
19. [Perakaunan – Laporan, Migrasi & Soalan Lazim](#19-perakaunan-laporan-migrasi-soalan-lazim)

**Modul AR (terperinci)**

20. [AR – Pengenalan, Aliran Kerja & Aging](#20-ar-pengenalan-aliran-kerja-aging)
21. [AR – Sub-Ledger, Integriti & Fitur Lanjutan](#21-ar-sub-ledger-integriti-fitur-lanjutan)

**Soalan lazim**

22. [Soalan Lazim (FAQ) – AR & Peringatan](#soalan-lazim-faq--ar--peringatan)

---

## 1. Dashboard Admin

**Laluan:** Menu → Dashboard (`/admin`)

- Paparan utama selepas log masuk.
- Ringkasan ringkas: yuran, pelajar, dan pautan pantas ke modul.
- Gunakan menu sisi untuk ke **Dashboard Kewangan**, **Ringkasan Akaun**, **Pakej Yuran**, **Semua Yuran**, **Tetapan Yuran**, **Tabung**, **Laporan**, **E-mel Template**, **AR (Akaun Belum Terima)**.

---

## 2. Dashboard Kewangan

**Laluan:** Menu → Dashboard Kewangan (`/admin/financial-dashboard`)

- Paparan ringkasan kewangan: yuran dikutip, mengikut kaedah bayaran (penuh, kategori, ansuran), pecahan tingkatan.
- Boleh tapis mengikut tahun.
- Berguna untuk semakan pantas kutipan yuran dan perbandingan tingkatan.

---

## 3. Pakej Yuran (Set Yuran)

**Laluan:** Menu → Pakej Yuran (`/admin/yuran/set-yuran`)

- **Fungsi:** Urus set yuran (pakej) mengikut tahun dan tingkatan.
- **Tambah set:** Klik tambah set yuran; isi nama, tahun, tingkatan; tentukan kategori dan item yuran (nama, kod, jumlah); tentukan item Islam sahaja / bukan Islam sahaja jika perlu.
- **Edit/Padam:** Pilih set dari senarai, edit atau padam. Pastikan tiada pelajar yang sudah diassign ke set sebelum padam.
- **Assign ke pelajar:** Biasanya dilakukan dari halaman Semua Yuran atau aliran assign pakej; set yang aktif boleh diassign ke pelajar.

---

## 4. Semua Yuran Pelajar

**Laluan:** Menu → Semua Yuran (`/admin/yuran/pelajar`)

- Senarai yuran pelajar: nama, tingkatan, set yuran, jumlah, dibayar, baki, status (pending/partial/paid).
- Boleh tapis mengikut tahun, tingkatan, status.
- **Tindakan:** Lihat butiran, resit; rekod bayaran (jika ada aliran bendahari rekod bayaran manual); assign set yuran jika pelajar belum ada set.
- Laporan accounting kekal mengikut **senarai item yuran** (bayaran penuh atau ansuran diperuntukkan ke item mengikut keutamaan).

---

## 5. Tetapan Yuran (Polisi Ansuran)

**Laluan:** Menu → Tetapan Yuran (`/admin/yuran/settings`)

- **Fungsi:** Ketetapan bendahari untuk polisi bayaran ansuran.
- **Bilangan maksimum ansuran dalam 9 bulan:** Pilih dari 1 hingga 9 (default 2). Ibu bapa boleh bayar yuran dalam masa 9 bulan (sebelum bulan 10) sebanyak maksimum kali yang ditetapkan.
- Klik nombor (1–9) untuk pilih, kemudian **Simpan**.
- Perubahan berkuat kuasa serta-merta untuk pilihan bayaran ibu bapa di Pusat Bayaran dan halaman bayaran yuran.

---

## 6. Formula & Logik Pengiraan Ansuran

Formula bayaran ansuran **mengikut bilangan kali bayar (N)** yang ditetapkan di Tetapan Yuran. N = 1 hingga 9 (default 2).

### 6.1 Pemboleh ubah

- **N** = bilangan kali bayar (daripada tetapan bendahari).
- **Jumlah yuran** = jumlah penuh yuran pelajar untuk set tersebut.

### 6.2 Jumlah setiap bayaran

- **Bayaran ke-1, ke-2, … ke-(N−1):**  
  **RM round(Jumlah yuran ÷ N, 2)**  
  Contoh: N = 3, yuran RM 1000 → Bayaran 1 = RM 333.33, Bayaran 2 = RM 333.33.

- **Bayaran ke-N (terakhir):**  
  **Baki tertunggak** = Jumlah yuran − (semua bayaran yang sudah dibuat).  
  Ini memastikan jumlah keseluruhan tepat dan tiada lebih/kurang akibat rounding.  
  Contoh: Bayaran 3 = RM 1000 − 333.33 − 333.33 = **RM 333.34**.

### 6.3 Ringkasan

| Bayaran   | Formula                                      |
|-----------|----------------------------------------------|
| 1, 2, … N−1 | round(Jumlah yuran ÷ N, 2)                 |
| N (akhir) | Baki tertunggak (Jumlah − sudah dibayar)     |

Sistem mengira jumlah setiap bayaran mengikut N; ibu bapa pilih sama ada bayar penuh, ikut kategori, atau ansuran (Bayaran 1, 2, … N). Laporan dan peruntukan ke senarai item yuran kekal terperinci mengikut keutamaan.

---

## 7. Tabung & Sumbangan

**Laluan:** Menu → Tabung & Sumbangan (`/admin/tabung`)

- Urus kempen derma/sumbangan (tabung).
- **Kempen aktif:** Senarai kempen; tambah kempen baru, edit kempen, set target/slot, harga per slot, status aktif/tidak aktif.
- **Bentuk kempen:** Berasaskan jumlah (target amount) atau berasaskan slot (jumlah slot × harga).
- Ibu bapa boleh sumbang melalui portal; bendahari boleh pantau kutipan dan kempen.

---

## 8. Pusat Bayaran (Modul Bayaran)

**Laluan:** Dicapai melalui menu modul atau pautan Pusat Bayaran (bergantung pada konfigurasi).

- **Fungsi:** Troli bayaran berpusat – yuran, koperasi, bas, tabung/sumbangan dalam satu tempat.
- **Tab:** Yuran, 2 Bayaran (ansuran), Tabung/Sumbangan, Resit, Troli.
- **Yuran:** Pilih pelajar & yuran; pilih kaedah bayaran (penuh, kategori, ansuran) melalui **panel slider** (lihat bahagian seterusnya).
- **2 Bayaran / Ansuran:** Senarai yuran yang layak untuk bayaran ansuran (sebelum bulan 10); tambah ke troli bayaran seterusnya (Bayaran 1, 2, … mengikut tetapan).
- **Troli:** Semak item, jumlah; checkout (simulasi/gateway mengikut sistem).

---

## 9. Pusat Bayaran – Panel Slider Bayaran Yuran

**Konteks:** Dalam Pusat Bayaran, apabila anda memilih satu yuran dan klik bayar, panel (slider) dari tepi akan terbuka.

- **Pilihan kaedah bayaran:**
  - **Bayaran penuh:** Bayar semua baki sekali gus.
  - **Mengikut kategori:** Pilih item/kategori yuran yang hendak dibayar (checkbox); jumlah dikira mengikut pilihan.
  - **Ansuran (2 Bayaran / N bayaran):** Pilih bilangan bayaran mengikut tetapan (contoh Bayaran 1, 2, … N); jumlah setiap ansuran dikira oleh sistem (sama rata atau bayaran terakhir = baki).
- **Kaedah pembayaran:** FPX, Kad, DuitNow QR (bergantung pada konfigurasi).
- Setelah pilih kaedah dan jumlah, klik **Sahkan** untuk tambah ke troli; selesaikan di Troli dengan checkout.
- **Laporan:** Setiap bayaran (penuh atau ansuran) diperuntukkan ke **senarai item yuran** mengikut keutamaan untuk accounting yang terperinci.

---

## 10. Ringkasan Akaun (Modul Perakaunan)

**Laluan:** Menu → Ringkasan Akaun (`/admin/accounting`)

- Dashboard ringkas modul perakaunan: wang masuk/keluar bulan ini, baki, transaksi menunggu pengesahan.
- Pautan pantas: Transaksi Baru, Senarai Transaksi, Kategori, Akaun Bank, Laporan Bulanan/Tahunan, Laporan AGM, dll.
- Untuk panduan terperinci transaksi, pengesahan dan laporan, rujuk [§15–§19](#15-perakaunan-pengenalan--entri-bergu) di bawah.

---

## 11. Modul Perakaunan – Transaksi & Laporan

**Laluan:** Dari Ringkasan Akaun → pelbagai submenu.

- **Transaksi Baru:** Rekod wang masuk atau wang keluar; pilih kategori, akaun bank (pilihan), jumlah, tarikh, penerangan. Sistem cipta entri bergu automatik.
- **Senarai Transaksi:** Tapis mengikut jenis, status, kategori, tarikh; edit/padam hanya transaksi yang belum disahkan.
- **Kategori:** Urus kategori wang masuk dan wang keluar; kod akaun (pilihan).
- **Akaun Bank:** Urus akaun bank; kod akaun (pilihan).
- **Laporan Bulanan / Tahunan:** Pilih tahun dan bulan/tahun; lihat penyata pendapatan dan perbelanjaan.
- **Laporan AGM:** Penyata P&P, Kunci Kira-kira, Aliran Tunai, Imbangan Duga.
- **Pengesahan:** Transaksi yang dicipta oleh bendahari berstatus "Menunggu Pengesahan"; JuruAudit menyahkan atau menolak. Hanya transaksi disahkan masuk dalam laporan.
- Terperinci: [§15–§19](#15-perakaunan-pengenalan--entri-bergu).

---

## 12. AR (Akaun Belum Terima)

**Laluan:** Menu → AR (Akaun Belum Terima) (`/admin/ar-dashboard`)

Modul AR menyegerakkan yuran pelajar dengan perakaunan: setiap set yuran = invoice (Dr AR, Cr Hasil); setiap bayaran = Dr Bank, Cr AR. Bendahari boleh pantau tertunggak dan tindakan kutipan dari sini.

- **Paparan:** Jumlah dijangka, dikumpul, tertunggak (AR), kadar kutipan; integriti Sub-Ledger vs GL; aging (0–30, 31–60, 61–90, 90+ hari). Satu kad **“Pergi ke Senarai Tertunggak”** membawa ke halaman **Senarai Tertunggak mengikut Tingkatan** (lihat di bawah).
- **Senarai Tertunggak mengikut Tingkatan** (`/admin/ar-outstanding`): Dari AR Dashboard klik **Pergi ke Senarai Tertunggak**. Halaman ini ada **tab Tingkatan 1–5**; pilih tingkatan, kemudian papar senarai pelajar tertunggak dengan **pagination** (20 orang per halaman). Setiap baris tunjuk: Pelajar, No Matrik, Tertunggak (RM), Risiko, **Status Notifikasi** (merah = Belum dihantar, hijau = Sudah hantar), **Jenis / Tarikh** (E-mel atau Push + tarikh terakhir dihantar), dan butang **Hantar Peringatan**. Bendahari boleh **hantar satu per satu** (klik Hantar Peringatan → pilih E-mel sahaja atau Push sahaja → pilih template → Hantar) atau **hantar pukal** (lihat di bawah).
- **Urus E-mel & Push mengikut Tingkatan:** Di halaman Senarai Tertunggak ada kad **“Urus E-mel & Push Notifikasi mengikut Tingkatan”** dengan pautan ke **E-mel Template**. Kandungan e-mel dan mesej push boleh disesuaikan ikut tingkatan (Tingkatan 1–5) di E-mel Template; template tersebut digunakan bila anda klik Hantar Peringatan (satu atau pukal).
- **Hantar Peringatan (satu orang):** Pada baris pelajar, klik **Hantar Peringatan**. Pilih saluran: **E-mel sahaja** atau **Push notifikasi sahaja**. Kemudian pilih **template e-mel** (cth. Peringatan Yuran Tertunggak) atau **template push** (Peringatan penuh / ringkas / mendesak). Klik Hantar e-mel atau Hantar push. Sistem hantar ke ibu bapa dan kemas kini status (hijau, jenis E-mel/Push, tarikh).
- **Hantar Peringatan Pukal:** Di halaman Senarai Tertunggak, dalam kad “Urus E-mel & Push”, ada butang **“Hantar Peringatan Pukal (Tingkatan X)”** (X = tingkatan tab semasa). Klik → satu **form/prompt** terbuka: ringkasan bilangan penerima, pilih saluran (E-mel atau Push), pilih template, dan pilihan **“Hantar dalam kelompok 20 orang”** (disyorkan). Jika dicentang: sistem hantar batch 20 orang, jeda 1 saat, kemudian batch seterusnya (cth. 100 orang = 5 kelompok). Jika tidak dicentang: semua dihantar berturut-turut. Klik **Setuju & Hantar** untuk mula; sistem akan hantar dan kemas kini status setiap pelajar. Selepas selesai, bilangan “dihantar” dan “gagal” dipaparkan; senarai dikemas kini.
- **Risiko:** Setiap pelajar dalam senarai ada skor risiko (Rendah/Sederhana/Tinggi) dan cadangan tindakan.
- **Pembalikan (Reversal):** Jika ada entri jurnal bayaran AR yang salah, gunakan reversal (Bendahari/Admin sahaja). Entri songsang dicipta dan dikaitkan dengan entri asal.
- **Sub-ledger & Laporan:** Data AR diselaraskan dengan Semua Yuran Pelajar dan Ringkasan Akaun. Terperinci: [§20–§21](#20-ar-pengenalan-aliran-kerja-aging).

---

## 13. E-mel Template

**Laluan:** Menu → E-mel Template (`/admin/email-templates`)

- Urus template e-mel sistem: peringatan yuran, pengesahan bayaran, yuran baru diassign, dll. **Template boleh disesuaikan ikut tingkatan** (Umum, Tingkatan 1–5); kandungan ikut tingkatan pelajar bila hantar.
- Edit subjek dan badan e-mel; gunakan pembolehubah (cth. `{{parent_name}}`, `{{total_outstanding}}`, `{{children_outstanding}}`) seperti yang disenaraikan.
- **Bila hantar peringatan (satu atau pukal):** Di halaman **Senarai Tertunggak** (/admin/ar-outstanding), bendahari pilih **template e-mel** (cth. Peringatan Yuran Tertunggak, Pengesahan Pembayaran) atau **template push** (Peringatan penuh / ringkas / mendesak). Kandungan e-mel ikut template yang anda edit di E-mel Template (mengikut tingkatan pelajar); push ikut template pilihan dalam form.

---

## 14. Laporan

**Laluan:** Menu → Laporan (`/admin/reports`)

- Akses pelbagai laporan sistem (bergantung pada modul): yuran, kewangan, pelajar, dll.
- Pilih jenis laporan dan parameter (tahun, tingkatan, tarikh); jana atau eksport mengikut fungsi yang disediakan.

---

## 15. Perakaunan – Pengenalan & Entri Bergu

Modul Perakaunan digunakan untuk: **merekod wang masuk** (yuran, derma, jualan, dll.); **merekod wang keluar** (perbelanjaan operasi, program, utiliti, dll.); **menyimpan rekod mengikut akaun bank dan kategori**; **menghasilkan laporan** bulanan, tahunan, dan laporan untuk AGM (Penyata P&P, Kunci Kira-kira, Aliran Tunai, Imbangan Duga).

### Entri Bergu (Double-Entry)

Setiap transaksi dalam sistem direkod secara **entri bergu**:

- **Wang masuk:** Sistem merekod **Debit** pada Akaun Bank dan **Kredit** pada Kategori Hasil (pendapatan).
- **Wang keluar:** Sistem merekod **Debit** pada Kategori Belanja dan **Kredit** pada Akaun Bank.

Anda **tidak perlu** memasukkan debit/kredit secara manual—pilih jenis transaksi (Wang Masuk / Wang Keluar), kategori, akaun bank (pilihan), dan jumlah; sistem yang mengira entri jurnal.

---

## 16. Perakaunan – Peranan & Aliran Kerja

### Peranan

| Peranan        | Boleh buat                                                                 | Tidak boleh buat (orang lain)        |
|----------------|----------------------------------------------------------------------------|--------------------------------------|
| **Bendahari**  | Cipta/edit/padam transaksi, urus kategori & akaun bank, lihat laporan      | Sahkan transaksi                     |
| **Sub-Bendahari** | Sama seperti Bendahari                                                 | Sahkan transaksi                     |
| **JuruAudit**  | Sahkan atau tolak transaksi, lihat transaksi & laporan, log audit          | Cipta atau edit transaksi            |
| **Admin / Superadmin** | Semua fungsi Bendahari + pengurusan pengguna & migrasi jurnal      | -                                    |

**Pemisahan tugas:** Bendahari merekod; JuruAudit mengesahkan.

### Aliran Kerja Transaksi

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

## 17. Perakaunan – Proses Bendahari & JuruAudit

### Proses Bendahari

1. **Masuk:** Menu → Ringkasan Akaun. Dashboard papar wang masuk/keluar bulan ini, baki, transaksi menunggu pengesahan.
2. **Rekod Wang Masuk:** Transaksi Baru → Wang Masuk → pilih Kategori (pendapatan), Akaun Bank (pilihan), Jumlah, Tarikh, Penerangan, Nombor Rujukan (pilihan) → Simpan. Sistem cipta transaksi dan entri jurnal (Dr Bank, Cr Hasil).
3. **Rekod Wang Keluar:** Transaksi Baru → Wang Keluar → pilih Kategori (belanja), Akaun Bank, Jumlah, Tarikh, Penerangan → Simpan. Sistem merekod Dr Kategori Belanja, Cr Akaun Bank.
4. **Edit/Padam:** Hanya transaksi **Menunggu Pengesahan** boleh diedit atau dipadam. Selepas Disahkan, rekod kekal (audit trail).
5. **Lihat Butiran & Entri Jurnal:** Dari Senarai Transaksi, klik satu transaksi → paparan Entri Bergu (Jurnal) tunjuk Akaun | Debit | Kredit; jumlah debit = jumlah kredit.

### Proses JuruAudit

1. **Semak:** Menu → Sahkan Transaksi / Pengesahan. Senarai transaksi berstatus Menunggu dipaparkan.
2. **Sahkan atau Tolak:** Buka transaksi → semak jumlah, tarikh, penerangan, kategori, akaun bank, Entri Jurnal → Klik **Sahkan** atau **Tolak**. Jika tolak, isi Nota pengesahan.
3. **Sahkan:** Status → Disahkan; transaksi masuk dalam laporan. **Tolak:** Status → Ditolak; transaksi tidak dikira; Bendahari boleh cipta transaksi baru yang betul.

---

## 18. Perakaunan – COA, Akaun Bank & Kategori

### Senarai Akaun (COA)

Dari Dashboard Perakaunan → **Senarai Akaun**. Rujukan semua akaun: **Aset (Akaun Bank)** dengan Kod Akaun (cth. 1100); **Hasil (Pendapatan)** kategori wang masuk; **Belanja (Perbelanjaan)** kategori wang keluar. Kod akaun untuk Imbangan Duga dan laporan berformat perakaunan.

### Akaun Bank

Menu Perakaunan → **Akaun Bank**. Tambah/Edit: Nama, Jenis (Semasa/Simpanan/Tunai Runcit/Simpanan Tetap), Nama Bank, No. Akaun, Keterangan, Kod Akaun (pilihan). Pilih akaun yang betul ketika rekod transaksi supaya laporan tunai mengikut akaun tepat.

### Kategori

Menu Perakaunan → **Kategori**. Jenis: Wang Masuk (Hasil) atau Wang Keluar (Belanja). Tambah/Edit: Nama, Penerangan, Kod Akaun (pilihan), Kategori induk (jika ada). Gunakan kategori yang konsisten supaya laporan mengikut kategori tepat.

---

## 19. Perakaunan – Laporan, Migrasi & Soalan Lazim

### Laporan

- **Laporan Bulanan:** Menu → Bulanan → pilih tahun & bulan. Paparan: wang masuk, wang keluar, baki, pecahan kategori, bilangan transaksi disahkan/menunggu.
- **Laporan Tahunan:** Menu → Tahunan → pilih tahun. Jumlah tahunan, pecahan bulanan, pecahan kategori.
- **Laporan AGM:** Menu → Laporan AGM → pilih tahun kewangan. Mengandungi Penyata P&P, Kunci Kira-kira, Aliran Tunai, Imbangan Duga. Pastikan transaksi untuk tempoh berkenaan telah **Disahkan** sebelum menjana.
- **Senarai Transaksi:** Tapis mengikut jenis, status, kategori, modul (Yuran, Koperasi, Bas, Tabung), tarikh, carian teks. Klik transaksi untuk butiran dan entri jurnal.

### Migrasi Entri Jurnal (Sekali Sahaja)

Jika sistem baru diaktifkan dengan entri bergu, transaksi lama mungkin belum ada rekod jurnal. **Bendahari/Admin/Superadmin:** Dashboard Perakaunan → **Migrasi ke Entri Jurnal** → sahkan. Sistem memproses transaksi yang belum ada jurnal dan mencipta entri sepadan. Jalankan sekali sahaja melainkan diberitahu pentadbir.

### Soalan Lazim Perakaunan

- **Tidak pilih akaun bank?** Sistem guna akaun default “Tunai/Bank Sistem”. Untuk ketepatan laporan, disarankan pilih akaun bank yang sebenar.
- **Bilakah transaksi masuk laporan?** Hanya transaksi **Disahkan** oleh JuruAudit.
- **Edit transaksi disahkan?** Biasanya tidak; audit trail. Rujuk pentadbir atau prosedur pembetulan jika ada.
- **Tempoh dikunci?** Bulan/tahun yang dikunci tidak boleh ubah transaksi dalam tempoh itu.
- **Lihat debit/kredit?** Buka Butiran transaksi → bahagian **Entri Bergu (Jurnal)**.

### Ringkasan Cepat Perakaunan

| Tugas              | Langkah ringkas |
|--------------------|------------------|
| Rekod wang masuk   | Transaksi Baru → Wang Masuk → Pilih kategori & akaun bank → Isi jumlah, tarikh, penerangan → Simpan |
| Rekod wang keluar  | Transaksi Baru → Wang Keluar → Pilih kategori & akaun bank → Isi jumlah, tarikh, penerangan → Simpan |
| Semak transaksi    | Senarai Transaksi → Klik transaksi → Lihat butiran & Entri Jurnal |
| Edit transaksi     | Buka transaksi (status Menunggu) → Edit → Simpan |
| Urus kategori      | Menu → Kategori → Tambah/Edit |
| Urus akaun bank    | Menu → Akaun Bank → Tambah/Edit |
| Laporan bulanan    | Menu → Bulanan → Pilih tahun & bulan |
| Laporan AGM        | Menu → Laporan AGM → Pilih tahun kewangan |
| Migrasi jurnal     | Menu → Migrasi ke Entri Jurnal (sekali sahaja) |

---

## 20. AR – Pengenalan, Aliran Kerja & Aging

### Pengenalan Modul AR

- **Invoice** berasaskan Set Yuran (setiap rekod student_yuran = satu invoice). **Bayaran berbilang** (partial) sehingga baki sifar.
- **Entri bergu ke GL:** Cipta invoice → Dr AR, Cr Hasil; Terima bayaran → Dr Bank, Cr AR.
- **Sub-ledger per pelajar**, **Aging** (0–30, 31–60, 61–90, 90+ hari), **Integriti** (sub-ledger = baki AR dalam GL).
- Disegerakkan dengan Modul Pelajar, Set Yuran, Bayaran (FPX/DuitNow/cash/bank), Dashboard Kewangan.

### Aliran Kerja

- **Cipta Invoice (Auto):** Bila Bendahari/Admin beri Set Yuran kepada pelajar → rekod student_yuran dicipta → sistem auto-posting jurnal Dr AR, Cr Hasil. Invoice Unpaid sehingga ada bayaran.
- **Bayaran (Partial/Full):** Ibu bapa/pelajar bayar atau Bendahari rekod bayaran → bayaran ditambah pada student_yuran; paid_amount & status dikemas kini → auto-posting Dr Bank, Cr AR. Baki = 0 → status Paid; sebahagian → Partially Paid.
- **Status Invoice:** Unpaid (tiada bayaran); Partially Paid (ada bayaran, baki > 0); Paid (baki = 0); Overdue (due lepas, baki > 0).

### COA AR

- **Akaun AR** auto dengan kod **1200** (Accounts Receivable). **Hasil** guna kategori perakaunan sedia ada (Yuran Pelajar). **Tunai/Bank** guna akaun bank default (1100).

### Aging

Due date diset pada setiap student_yuran. Aging dari tarikh due ke tarikh semasa: **0_30**, **31_60**, **61_90**, **90_plus** hari. Dashboard dan laporan guna bucket ini.

---

## 21. AR – Sub-Ledger, Integriti & Fitur Lanjutan

### Sub-Ledger dan Integriti

- **Sub-ledger per pelajar** = jumlah (total_amount − paid_amount) bagi semua invoice pelajar itu.
- **Jumlah semua sub-ledger (outstanding)** = **baki Akaun AR dalam GL**. Gunakan semakan integriti (dashboard AR atau API); jika mismatch, sistem laporkan—rujuk audit trail dan jurnal.

### API Modul AR (rujukan)

Base **`/api/ar`**. Antara endpoint: invoices, subledger, aging, dashboard, integrity, risk/{student_id}, send-reminder, reversal, warden/summary. Semua perlukan auth dan role berkaitan.

### Audit Trail & Reversal

- Setiap jurnal AR ada **source_ref** (module: ar, student_yuran_id, type: invoice | payment). Rekod tidak boleh edit selepas posting.
- **Pembetulan:** Guna **reversal** (POST /api/ar/reversal): sistem cipta entri songsang (debit/credit diterbalikkan), source_ref.reverses_entry_id = entri asal. Hanya Bendahari/Admin.

### Fitur Lanjutan

- **Risk Score:** Skor low/medium/high dalam senarai tertunggak dan subledger; cadangan: reminder, call_parent, restrict_hostel, installment_offer.
- **Senarai Tertunggak mengikut Tingkatan:** Halaman `/admin/ar-outstanding` — tab Tingkatan 1–5, pagination, status notifikasi (merah belum / hijau sudah), jenis (E-mel/Push). API: `GET /api/ar/outstanding-by-tingkatan?tingkatan=1..5&year=&page=&limit=`.
- **Send Reminder (satu orang):** Pilih E-mel atau Push, pilih template → notifikasi dalam app / e-mel / push FCM, pautan WhatsApp; status dikemas kini.
- **Send Reminder Pukal:** `POST /api/ar/send-reminder-bulk` — body: tingkatan, year, channel (email|push), template_key / push_template_key, batch_size (cth. 20). Sistem hantar kepada semua pelajar tertunggak dalam tingkatan; pilihan kelompok 20 orang dengan jeda 1 saat antara batch.
- **Paparan Warden:** GET /api/ar/warden/summary dan halaman Warden "Tertunggak Yuran (AR)" mengikut blok dan tingkatan.

### Ringkasan Demo AR

1. Cipta invoice → Assign set yuran → auto Dr AR, Cr Hasil.
2. Partial payment → Bayar sebahagian → baki & status dikemas kini; jurnal Dr Bank, Cr AR.
3. Aging → Papar 0–30, 31–60, 61–90, 90+ dari dashboard.
4. Sub-ledger → Lihat semua invoice dan jumlah tertunggak per pelajar.
5. Integriti → Semakan pastikan sub-ledger = baki GL AR.

---

## Soalan Lazim (FAQ) – AR & Peringatan

- **Di mana saya hantar peringatan satu per satu?**  
  Menu → AR (Akaun Belum Terima) → **Pergi ke Senarai Tertunggak**. Pilih tab tingkatan, cari pelajar dalam jadual, klik **Hantar Peringatan** pada baris tersebut. Pilih E-mel atau Push, pilih template, kemudian Hantar.

- **Boleh hantar peringatan kepada seluruh tingkatan sekali gus?**  
  Ya. Di halaman **Senarai Tertunggak mengikut Tingkatan**, pilih tab tingkatan (cth. Tingkatan 1), kemudian klik butang **Hantar Peringatan Pukal (Tingkatan 1)**. Dalam form: pilih saluran (E-mel atau Push), pilih template, pilih sama ada “Hantar dalam kelompok 20 orang” (disyorkan), kemudian **Setuju & Hantar**. Sistem akan hantar kepada semua pelajar tertunggak dalam tingkatan itu dan kemas kini status.

- **Apa maksud “Hantar dalam kelompok 20 orang”?**  
  Jika dicentang, sistem hantar **batch 20 orang**, jeda **1 saat**, kemudian batch seterusnya. Contoh: 100 orang = 5 kelompok (20+20+20+20+20). Ini mengurangkan beban pelayan. Jika tidak dicentang, semua penerima dihantar berturut-turut tanpa jeda.

- **Apa maksud status merah dan hijau dalam senarai?**  
  **Merah (Belum dihantar):** Peringatan belum pernah dihantar kepada ibu bapa pelajar itu. **Hijau (Sudah hantar):** Peringatan telah dihantar; lajur “Jenis / Tarikh” tunjuk sama ada E-mel atau Push dan tarikh terakhir dihantar.

- **Boleh pilih template e-mel atau push?**  
  Ya. Bila klik Hantar Peringatan (satu atau pukal), anda pilih saluran **E-mel sahaja** atau **Push sahaja**. Untuk E-mel, pilih template e-mel (cth. Peringatan Yuran Tertunggak). Untuk Push, pilih template push (Peringatan penuh / ringkas / mendesak). Template e-mel boleh diedit ikut tingkatan di halaman E-mel Template.

- **Di mana saya edit kandungan e-mel peringatan?**  
  Menu → **E-mel Template**. Edit subjek dan badan e-mel untuk template peringatan yuran; boleh set berbeza untuk Tingkatan 1–5. Pembolehubah seperti `{{parent_name}}`, `{{total_outstanding}}` disokong.

---

*Manual ini mengikut ciri semasa portal MRSM. Semua panduan yuran, perakaunan dan AR disatukan di sini. Jika ada perbezaan pada skrin (nama menu atau laluan), rujuk pentadbir sistem atau dokumentasi dalam aplikasi.*
