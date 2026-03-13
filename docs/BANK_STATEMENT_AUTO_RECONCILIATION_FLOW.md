# Bank Statement Auto-Reconciliation Flow (Mesra Pengguna)

Dokumen ini menerangkan flow terbaik untuk pengguna tanpa latar belakang accounting supaya proses reconcile bank boleh dibuat dengan yakin, cepat, dan patuh audit.

## 0) Lokasi UI

Wizard pengguna tersedia pada:

- `/admin/accounting/bank-reconciliation`

## 1) Objektif Ringkas

- Pengguna upload statement bank (`PDF` atau `CSV`).
- Sistem padankan transaksi bank dengan transaksi sistem secara automatik.
- Pengguna hanya semak item yang meragukan, isi remark bila perlu, dan hantar untuk kelulusan.
- Rekod audit kekal lengkap untuk semakan juruaudit.
- Sistem menyokong **pelbagai akaun bank** (2, 3 atau lebih) dalam tenant yang sama; setiap statement direconcile ikut akaun bank masing-masing.

## 2) Bahasa Mudah (Tanpa Istilah Rumit)

- **Matched**: transaksi bank jumpa padanan yang tepat dalam sistem.
- **Need Review**: sistem jumpa padanan tetapi kurang yakin.
- **Unmatched**: transaksi bank belum jumpa padanan.
- **Remark**: nota penjelasan pengguna (wajib untuk perubahan manual).
- **Reconcile Complete**: baki bank akhir sama dengan baki sistem selepas semakan.

## 3) Flow Pengguna (Step-by-Step)

### Step 0 - Pilih Akaun & Tempoh

- Pilih akaun bank.
- Pilih tempoh statement (contoh: Mac 2026).
- Gunakan **ringkasan per akaun bank** untuk tengok akaun mana paling banyak unresolved/difference alert sebelum mula semakan.
- Gunakan **Queue Prioriti Kerja** untuk fokus ikut urutan operasi: `Perlu Review` -> `Difference Alert` -> `Ready For Approval`.
- Jika operator baru, aktifkan **Mode Ringkas Harian** supaya UI fokus kepada 3 tindakan: `Review -> Match -> Submit`.
- Aktifkan **Quick Action Selesai Hari Ini** untuk tapis senarai kepada statement yang betul-betul perlukan tindakan segera.
- Sistem hantar **auto-notification ikut peranan** (`admin`/`bendahari`/`sub_bendahari`) apabila skor statement masuk kategori `Kritikal` atau `Overdue`.
- Sistem paparkan ringkas status tempoh:
  - belum reconcile,
  - sedang disemak,
  - selesai.

### Step 1 - Upload Statement

- Upload fail statement:
  - utama: `CSV` (paling tepat),
  - sokongan: `PDF` (dengan parser/OCR jika perlu).
- Sistem semak:
  - format fail,
  - duplicate upload (hash fail),
  - tarikh transaksi munasabah.

### Step 2 - Semak Hasil Bacaan Sistem

- Sistem tunjuk preview baris statement:
  - tarikh, rujukan, deskripsi, debit/kredit, amaun, baki.
- Jika parser kurang tepat, pengguna boleh:
  - pilih profil bank lain,
  - baiki mapping kolum (khusus CSV),
  - simpan profil untuk kegunaan seterusnya.

### Step 3 - Auto-Match

- Sistem jalankan padanan automatik:
  - amaun sama,
  - julat tarikh (contoh ±3 hari),
  - nombor rujukan,
  - padanan teks deskripsi.
- Dalam **Mode Ringkas Harian**, sistem guna tetapan auto-match standard konservatif untuk kurangkan risiko salah konfigurasi.
- Gunakan panel **AI Smart Reconcile** untuk:
  - cadangan konfigurasi auto-match berasaskan skor/risk model,
  - unjuran pengurangan kerja review,
  - amaran risiko sebelum jalankan auto-match.
- Sistem beri status warna:
  - Hijau: auto-matched (yakin tinggi),
  - Kuning: need review,
  - Merah: unmatched.

### Step 4 - Review Mudah (Fokus Item Bermasalah)

- Pengguna semak tab:
  - `Need Review`,
  - `Unmatched`,
  - `Exceptions`.
- Tindakan tersedia:
  - terima cadangan sistem,
  - match manual melalui **Manual Match Picker** (dropdown calon transaksi),
  - guna butang **Cadang Terbaik** (hanya pilih automatik jika lulus rule konservatif),
  - bulk action melalui wizard (`Pilih Aksi -> Preview Impak -> Sahkan`),
  - unmatch,
  - abaikan sementara (carry forward).
- **Remark wajib** untuk semua tindakan manual/override.
- Rujuk **Checklist SOP Reconciliation** (status tick/warning) supaya pengguna bukan accounting boleh semak langkah tanpa tertinggal.
- Semak panel **Pengesan Perkara Pelik/Ralat** untuk amaran awal jika status tidak konsisten (contoh: unresolved masih ada tetapi statement ready).
- Jika amaran "kemungkinan akaun bank/period tidak tepat" muncul (kadar matched sangat rendah), semak semula akaun bank dan tempoh statement sebelum teruskan.
- Jika remark tidak diisi, sistem boleh auto-cadangkan/auto-isi remark standard mengikut tindakan (match/unmatch/exception) untuk mempercepat operasi harian.

### Step 5 - Semak Ringkasan Reconcile

- Sistem paparkan ringkasan jelas:
  - opening balance,
  - total masuk/keluar bank,
  - matched count/amount,
  - unmatched count/amount,
  - closing balance bank vs sistem,
  - difference (mesti `0.00` untuk finalize).

### Step 6 - Hantar Untuk Kelulusan

- Status bertukar kepada `ready_for_approval`.
- Kelulusan dibuat oleh pegawai berautoriti.
- Jika lulus: status `approved`, boleh proceed ke lock period.
- Jika ditolak: kembali ke `in_review` dengan reason.
- Sistem guna **guard submit pintar** dan paparkan sebab lock dengan jelas sebelum submit/approve (contoh unresolved masih ada, difference bukan `0.00`, atau status belum sesuai).

## 4) Hak Akses (Flexible)

- **Sub Bendahari**
  - upload statement,
  - run auto-match,
  - edit/manual match,
  - isi remark,
  - hantar untuk kelulusan.
- **Bendahari**
  - semua fungsi Sub Bendahari,
  - approve/reject reconciliation.
- **Admin**
  - semua fungsi Bendahari,
  - urus rules parser/matching,
  - override dalam kes khas (dengan remark wajib).
- **JuruAudit**
  - read-only bukti audit, perubahan, dan remark.

Cadangan kawalan terbaik: **maker-checker** (orang yang buat reconcile tidak boleh approve batch yang sama).

## 5) Remark Fields (Mesti Ada)

Sediakan remark di tiga aras:

- **Statement Remark**: nota keseluruhan batch statement.
- **Line Remark**: nota untuk baris transaksi tertentu.
- **Action Remark**: nota untuk tindakan manual (match/unmatch/override).

Medan minimum untuk setiap remark:

- `remark_text` (wajib untuk tindakan manual),
- `remark_category` (contoh: timing_difference, bank_fee, duplicate, data_error),
- `attachment_url` (optional bukti tambahan),
- `created_by`, `created_at`.

## 6) Cadangan Terbaik (Recommended Design)

1. **CSV-first, PDF-second**
   - CSV jadi laluan utama kerana lebih stabil/tepat.
   - PDF kekal disokong untuk fleksibiliti pengguna.

2. **Confidence-based Matching**
   - auto-approve hanya untuk confidence tinggi (contoh >= 95),
   - confidence sederhana (70-94) masuk `Need Review`,
   - bawah itu kekal `Unmatched`.

3. **Guided Wizard UI**
   - satu skrin satu fokus,
   - bahasa mudah,
   - panel onboarding + tooltip contoh setiap langkah.

4. **Zero-difference Rule**
   - finalize hanya bila `difference = 0.00`,
   - jika tidak, sistem wajib minta tindakan atau remark.

5. **Audit Trail Lengkap**
   - simpan semua perubahan sebelum/selepas,
   - simpan siapa buat tindakan + masa tindakan.

6. **Multi-Akaun Dashboard Ringkas**
   - paparkan kad ringkasan per akaun bank (in-progress/ready/approved/unresolved),
   - benarkan klik terus kad akaun untuk auto-filter senarai statement,
   - bantu bendahari fokus pada akaun paling kritikal dahulu.

7. **Queue Prioriti + Checklist SOP**
   - sistem paparkan queue kerja harian mengikut keutamaan sebenar operasi,
   - checklist visual (done/warning/pending) bantu elak langkah tertinggal.

8. **Pengesan Anomali Ringkas**
   - paparkan amaran automatik untuk perkara tidak normal (difference bukan 0, parser warning, exception tinggi),
   - jadikan amaran ini sebagai "gate" sebelum submit/approve.

9. **Mode Ringkas Harian**
   - paparkan fokus `Review -> Match -> Submit` untuk operator bukan accounting,
   - kekalkan mode lanjutan untuk pelarasan tolerance bila diperlukan.

10. **Guard Submit + Quick Action Harian**
   - butang submit/approve/reject dikawal dengan mesej sebab-lock yang mudah difahami,
   - senarai statement boleh ditapis ke mode `Selesai Hari Ini` untuk fokus kerja kritikal.

11. **Template SOP Ikut Peranan**
   - paparkan SOP ringkas berbeza mengikut role (`admin`/`bendahari`/`sub_bendahari`/`juruaudit`),
   - bantu operator baru ikut flow standard tanpa keliru.

12. **AI Smart Reconcile + Guardrail**
   - AI assist memberi cadangan konfigurasi auto-match tanpa auto-approve membuta tuli,
   - semua keputusan submit/approve kekal dilindungi guardrail maker-checker dan rule difference `0.00`.

13. **AI Auto-Priority Queue Harian**
   - statement disusun automatik ikut skor risiko + due period (`period_end`),
   - label `Kritikal/Tinggi/Sederhana/Rendah` dipapar terus pada senarai statement,
   - fokus kerja harian menjadi jelas untuk bendahari/sub-bendahari tanpa perlu analisis manual.

14. **Auto-Notification Kritikal/Overdue Mengikut Peranan**
   - apabila statement menjadi `Kritikal` (berdasarkan skor prioriti) atau `Overdue`, notifikasi dihantar automatik ke `Notification Center`,
   - penerima sasaran: `admin`, `bendahari`, `sub_bendahari`,
   - sistem guna `risk signature` + cooldown untuk elak notifikasi berulang yang sama (anti-spam),
   - komponen bell memaparkan microcopy BM khusus (`Amaran Kritikal/Overdue`, ringkasan unresolved/difference, CTA `Buka Rekonsiliasi Bank`) untuk jelas tindakan operator,
   - mesej alert dipersonalisasi ikut role penerima (contoh `Pemantauan Admin`, `Tindakan Bendahari`, `Tindakan Sub Bendahari`) supaya tindakan susulan lebih tepat,
   - tone warna alert dalam bell juga ikut role dan akan override kepada tone `Kritikal/Overdue` bila risiko meningkat.

## 7) API MVP (Sudah Diimplement)

Endpoint modul `bank-reconciliation`:

- `POST /api/accounting-full/bank-reconciliation/statements/upload`
- `GET /api/accounting-full/bank-reconciliation/statements`
- `GET /api/accounting-full/bank-reconciliation/statements/{statement_id}`
- `GET /api/accounting-full/bank-reconciliation/profiles`
- `POST /api/accounting-full/bank-reconciliation/profiles`
- `PUT /api/accounting-full/bank-reconciliation/profiles/{profile_id}`
- `POST /api/accounting-full/bank-reconciliation/{statement_id}/auto-match`
- `GET /api/accounting-full/bank-reconciliation/{statement_id}/items`
- `POST /api/accounting-full/bank-reconciliation/{statement_id}/bulk-action`
- `POST /api/accounting-full/bank-reconciliation/{statement_id}/items/{item_id}/manual-match`
- `POST /api/accounting-full/bank-reconciliation/{statement_id}/items/{item_id}/remark`
- `POST /api/accounting-full/bank-reconciliation/{statement_id}/items/{item_id}/adjust`
- `POST /api/accounting-full/bank-reconciliation/{statement_id}/submit`
- `POST /api/accounting-full/bank-reconciliation/{statement_id}/approve`
- `POST /api/accounting-full/bank-reconciliation/{statement_id}/reject`

## 8) Contoh User Journey (Non-Accounting)

Contoh: Sub Bendahari mahu reconcile statement bulan Mac.

1. Pilih akaun `CIMB Muafakat` + tempoh `Mac 2026`.
2. Upload fail `statement_mac_2026.csv`.
3. Klik `Auto Reconcile`.
4. Sistem terus match 85%, tinggal 15% dalam `Need Review`.
5. Untuk 15% itu, pengguna pilih padanan cadangan dan isi remark ringkas bila override.
6. Ringkasan tunjuk `difference = 0.00`.
7. Klik `Hantar Untuk Kelulusan`.
8. Bendahari semak, approve, dan tempoh bersedia untuk lock.

## 9) Kriteria Kejayaan MVP

- Pengguna bukan accounting boleh selesaikan reconcile tanpa bantuan teknikal.
- Sekurang-kurangnya 80% transaksi auto-matched untuk statement format biasa.
- Semua tindakan manual ada remark dan direkod dalam audit trail.
- Approval flow jelas antara pembuat dan pelulus.
