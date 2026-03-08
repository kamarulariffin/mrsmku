# Manual Modul Accounts Receivable (AR) – MRSMKU Smart360

## 1. Pengenalan

Modul **Accounts Receivable (AR)** dalam Smart360 menyokong:

- **Invoice** berasaskan Set Yuran dan data pelajar (setiap rekod `student_yuran` = satu invoice).
- **Bayaran berbilang** (partial payments) sehingga baki sifar.
- **Entri bergu (double entry)** ke General Ledger:
  - Cipta invoice: **Dr Akaun Belum Terima (AR), Cr Hasil (Revenue)**.
  - Terima bayaran: **Dr Tunai/Bank, Cr AR**.
- **Sub-ledger per pelajar**: jumlah tertunggak dan senarai invoice mengikut pelajar.
- **Aging**: pengelasan tertunggak 0–30, 31–60, 61–90, 90+ hari.
- **Integriti data**: semakan bahawa jumlah sub-ledger AR = baki AR dalam GL.

Modul ini **disegerakkan** dengan:

- Modul Pelajar
- Modul Set Yuran (penciptaan invoice apabila pelajar diberi set yuran)
- Modul Bayaran (FPX/DuitNow/cash/bank) – setiap bayaran auto-posting ke GL
- Dashboard Kewangan dan Laporan sedia ada

### Kelebihan Modul AR (apa yang pengguna dapat)

| Kelebihan | Keterangan |
|-----------|------------|
| **Satu sumber benar** | Yuran pelajar dan baki AR sentiasa sepadan dengan General Ledger—tiada duplikasi atau rekod terpisah. |
| **Auto-posting ke GL** | Cipta invoice (assign set yuran) dan terima bayaran—sistem auto Dr AR Cr Hasil, dan Dr Bank Cr AR; bendahari tidak perlu rekod jurnal manual untuk yuran. |
| **Sub-ledger per pelajar** | Lihat jumlah tertunggak dan senarai invoice per pelajar; senang rujuk bila ibu bapa bertanya atau bila buat kutipan. |
| **Aging tertunggak** | Pecahan 0–30, 31–60, 61–90, 90+ hari—tahu siapa tertunggak lama dan keutamaan tindakan. |
| **Skor risiko & cadangan tindakan** | Setiap pelajar ada risk (Rendah/Sederhana/Tinggi) dan cadangan (peringatan, panggilan ibu bapa, tawaran ansuran); memudahkan keputusan kutipan. |
| **Hantar peringatan sekali klik** | Dari dashboard AR, "Hantar Peringatan" hantar notifikasi dalam app + push (FCM) + pautan WhatsApp—kurang kerja hantar mesej manual. |
| **Semakan integriti** | Endpoint integriti pastikan jumlah sub-ledger = baki AR dalam GL; jika tidak match, ada isu data yang perlu disemak. |
| **Pembalikan (reversal)** | Jika entri bayaran salah, Bendahari/Admin boleh buat reversal melalui API—entri songsang dicipta dan dikaitkan dengan entri asal untuk audit. |
| **Paparan Warden** | Warden boleh lihat tertunggak mengikut blok dan tingkatan tanpa akses penuh ke semua data kewangan. |

---

## 2. Aliran Kerja

### 2.1 Cipta Invoice (Auto)

- **Bila:** Apabila Bendahari/Admin **memberi Set Yuran** kepada pelajar (dari menu Yuran → Pakej Yuran → assign pelajar, atau bulk assign).
- **Apa berlaku:**
  1. Satu rekod **student_yuran** dicipta (total_amount, paid_amount=0, status=pending, due_date).
  2. Sistem **auto-posting jurnal**: Dr AR, Cr Hasil (kategori Yuran).
  3. Invoice dianggap **Unpaid** sehingga ada bayaran.

### 2.2 Bayaran (Partial / Full)

- **Bila:** Ibu bapa/pelajar bayar melalui portal (atau Bendahari rekod bayaran manual).
- **Apa berlaku:**
  1. Rekod bayaran ditambah pada **student_yuran.payments**; paid_amount dan status dikemas kini.
  2. Satu transaksi perakaunan (audit) dicipta seperti sedia ada.
  3. **Auto-posting jurnal AR**: Dr Tunai/Bank, Cr AR.
  4. Jika baki = 0, status invoice → **Paid**; jika sebahagian → **Partially Paid**.

### 2.3 Status Invoice

| Status      | Makna                          |
|------------|---------------------------------|
| Unpaid     | Tiada bayaran lagi.             |
| Partially Paid | Ada bayaran, baki > 0.     |
| Paid       | Baki = 0.                       |
| Overdue    | Tarikh due sudah lepas, baki > 0 (ditunjukkan di laporan/aging). |

---

## 3. Chart of Accounts (COA)

- **Akaun AR** dicipta automatik dengan kod **1200** dan nama **Accounts Receivable (AR)** (dalam senarai akaun bank/aset sistem).
- **Hasil (Revenue)** menggunakan kategori perakaunan sedia ada (contoh: Yuran Pelajar) untuk kredit apabila invoice dicipta.
- **Tunai/Bank** menggunakan akaun bank default sistem (1100) untuk debit apabila bayaran diterima.

---

## 4. API Modul AR (Backend)

Base path: **`/api/ar`**. Semua endpoint memerlukan auth dan role: superadmin, admin, bendahari, sub_bendahari, juruaudit.

| Endpoint | Keterangan |
|----------|------------|
| `GET /api/ar/invoices` | Senarai invoice (student_yuran) dengan filter year, student_id, status. |
| `GET /api/ar/subledger/{student_id}` | Sub-ledger satu pelajar: senarai invoice dan total outstanding. |
| `GET /api/ar/subledger` | Senarai sub-ledger semua pelajar yang ada outstanding (boleh filter tahun, blok, tingkatan). |
| `GET /api/ar/aging` | Ringkasan aging (0–30, 31–60, 61–90, 90+ hari). |
| `GET /api/ar/dashboard` | Dashboard: total AR, kutipan, kadar kutipan, aging, top 10 tertunggak (termasuk risk_score). |
| `GET /api/ar/integrity` | Semak integriti: jumlah sub-ledger outstanding vs baki GL AR. |
| `GET /api/ar/risk/{student_id}` | Skor risiko pelajar (low/medium/high) dan cadangan tindakan. |
| `GET /api/ar/outstanding-by-tingkatan` | Senarai pelajar tertunggak mengikut tingkatan (1–5), dengan pagination dan status notifikasi terakhir (last_reminder: channel, sent_at). Params: tingkatan, year, page, limit. |
| `GET /api/ar/push-template-options` | Senarai template push untuk bendahari pilih bila hantar peringatan (channel=push). |
| `POST /api/ar/send-reminder` | Hantar peringatan satu orang: body student_id (atau student_yuran_id), channel ("email" \| "push"), template_key (untuk e-mel), push_template_key (untuk push). Notifikasi dalam app / e-mel / push FCM; pautan WhatsApp; rekod dalam ar_reminder_log. |
| `POST /api/ar/send-reminder-bulk` | Hantar peringatan pukal kepada semua pelajar tertunggak dalam satu tingkatan. Body: tingkatan (1–5), year, channel ("email" \| "push"), template_key, push_template_key, batch_size (cth. 20; 0 = semua sekali gus). Sistem hantar batch demi batch dengan jeda 1 saat jika batch_size > 0; kemas kini ar_reminder_log setiap penghantaran. Return: total_recipients, sent, failed, errors. |
| `POST /api/ar/reversal` | Cipta entri pembalikan untuk jurnal AR (Bendahari/Admin). Body: journal_entry_id, reason. |
| `GET /api/ar/warden/summary` | Ringkasan tertunggak untuk Warden: mengikut blok dan tingkatan (params: year, block, tingkatan). |

---

## 5. Sub-Ledger dan Integriti

- **Sub-ledger per pelajar** = jumlah `total_amount - paid_amount` bagi semua invoice (student_yuran) pelajar itu.
- **Jumlah semua sub-ledger (outstanding)** sepatutnya **sama** dengan **baki Akaun AR dalam General Ledger** (jumlah debit − kredit dalam journal lines bagi akaun AR).
- Gunakan **`GET /api/ar/integrity`** untuk semakan. Jika mismatch, sistem akan laporkan; rujuk audit trail dan jurnal untuk siasatan.

---

## 6. Aging

- **Due date** diset pada setiap student_yuran (contoh: akhir tahun atau +90 hari dari cipta).
- Aging dikira dari **tarikh due** ke **tarikh semasa**:
  - **0_30**: 0–30 hari lepas due
  - **31_60**: 31–60 hari
  - **61_90**: 61–90 hari
  - **90_plus**: > 90 hari

Laporan dan dashboard menggunakan bucket ini untuk paparan Pengetua/Bendahari.

---

## 7. Integrasi dengan Modul Lain

- **Modul Pelajar:** Nama, no matrik, blok, tingkatan diambil dari `students`.
- **Modul Set Yuran:** Invoice dicipta apabila set yuran di-assign; kategori hasil mengikut tetapan perakaunan.
- **Payment Gateway / Bayaran:** Setiap bayaran yuran (dari portal atau rekod manual) mencetuskan posting Dr Bank Cr AR.
- **Notifikasi:** "Hantar Peringatan" dari dashboard AR menghantar notifikasi dalam app (create_notification), push (FCM via send_push_to_user), dan pautan WhatsApp (wa.me) kepada ibu bapa pelajar tertunggak.

---

## 8. Audit Trail dan Data Integrity

- Setiap jurnal AR mempunyai **source_ref** (module: ar, student_yuran_id, type: invoice | payment).
- Rekod tidak boleh edit selepas posting; pembetulan guna **reversal entry** (`POST /api/ar/reversal`): sistem cipta entri jurnal songsang (debit/credit diterbalikkan) dengan source_ref.reverses_entry_id merujuk entri asal.
- Semua rekod ada created_by, timestamp, reference_number, source_module.

---

## 9. Fitur Lanjutan (Siap)

- **Risk Score:** `GET /api/ar/risk/{student_id}` dan risk disertakan dalam senarai tertunggak serta subledger. Skor low/medium/high berdasarkan tertunggak, hari overdue, dan sejarah bayaran lewat; cadangan tindakan: reminder, call_parent, restrict_hostel, installment_offer.
- **Senarai Tertunggak mengikut Tingkatan:** Halaman `/admin/ar-outstanding` — tab Tingkatan 1–5, pagination (20 per halaman), status notifikasi (merah = belum hantar, hijau = sudah hantar), lajur jenis/tarikh (E-mel atau Push + tarikh). Data dari `GET /api/ar/outstanding-by-tingkatan`. Setiap baris ada butang "Hantar Peringatan" (satu orang) dengan pilihan saluran dan template.
- **Send Reminder (satu orang):** Bendahari pilih E-mel sahaja atau Push sahaja; pilih template e-mel (cth. fee_reminder) atau template push (reminder_full, reminder_short, reminder_urgent). `POST /api/ar/send-reminder`; sistem hantar dan log dalam ar_reminder_log; status dalam senarai dikemas kini.
- **Send Reminder Pukal:** Butang "Hantar Peringatan Pukal (Tingkatan X)" dalam halaman Senarai Tertunggak. Form: ringkasan bilangan penerima, pilih saluran (E-mel/Push), template, dan pilihan "Hantar dalam kelompok 20 orang". `POST /api/ar/send-reminder-bulk`; sistem hantar batch demi batch (jika batch_size=20), kemas kini status setiap pelajar; return total_recipients, sent, failed, errors.
- **Reversal entry:** `POST /api/ar/reversal` (Bendahari/Admin sahaja) cipta entri pembalikan dan audit trail.
- **Paparan Warden:** `GET /api/ar/warden/summary` dan halaman Warden "Tertunggak Yuran (AR)" papar ringkasan mengikut blok dan tingkatan; role warden, bendahari, admin boleh akses.

---

## 10. Ringkasan untuk Demo Pengetua

1. **Cipta invoice** → Assign set yuran kepada pelajar → sistem auto Dr AR, Cr Hasil.
2. **Partial payment** → Bayar sebahagian → baki dan status dikemas kini; jurnal Dr Bank, Cr AR.
3. **Aging** → Papar breakdown 0–30, 31–60, 61–90, 90+ dari dashboard/laporan.
4. **Sub-ledger** → Klik pelajar → lihat semua invoice dan jumlah tertunggak.
5. **Integriti** → Endpoint semakan pastikan jumlah sub-ledger = baki GL AR.

Sistem beroperasi sebagai **sistem kewangan peringkat enterprise** yang bersepadu dengan pelajar, set yuran, dan bayaran sedia ada.
