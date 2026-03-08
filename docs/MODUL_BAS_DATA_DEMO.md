# Modul Bas – Data Demo & Data Sebenar

## Data demo

Data demo modul bas (syarikat, bas, route, pemandu) disediakan untuk ujian dan demo. Data ini **boleh diubah suai atau diganti dengan data sebenar** pada masa akan datang.

## Cara guna data sebenar nanti

1. **Ubah melalui paparan Admin Bas**  
   Log masuk sebagai Admin Bas → Syarikat Bas / Bas / Route / Pemandu. Edit, padam atau tambah rekod seperti biasa. Semua perubahan disimpan dalam pangkalan data yang sama.

2. **Tambah syarikat sebenar**  
   Syarikat boleh mendaftar sendiri melalui **Pendaftaran Syarikat Bas** (awakam). Admin Bas kemudian luluskan permohonan. Data demo boleh dikekalkan atau dipadam mengikut keperluan.

3. **Hentikan seed automatik**  
   Jika anda mahu guna **data sebenar sahaja**, pastikan tiada data demo di-DB (contoh: padam rekod dengan `created_by: seed_bus_data` atau jalankan sekali `seed_bus_data.py --force` lalu padam semua data demo melalui Admin Bas). Selepas itu jangan jalankan `seed_bus_data.py` atau pastikan backend tidak seed bila tiada syarikat demo (boleh ubah logik dalam `server.py` lifespan jika perlu).

## Ringkasan

| Perkara        | Keterangan |
|----------------|------------|
| Data demo      | Untuk demo/ujian; format sama seperti data sebenar |
| Edit/padam     | Boleh melalui Admin Bas (Syarikat Bas, Bas, Route, Pemandu) |
| Data sebenar   | Boleh tambah melalui pendaftaran awam + kelulusan admin, atau tambah terus oleh Admin Bas |
| Masa depan     | Tiada penguncian – data demo boleh diganti sepenuhnya dengan data operasi sebenar |
