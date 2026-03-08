/**
 * Manual Pengguna Modul Perakaunan - Boleh diakses oleh Bendahari/JuruAudit selepas log masuk
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';

const Section = ({ title, id, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="border border-gray-200 rounded-xl bg-white overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <span className="font-semibold text-gray-800">{title}</span>
        {open ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
      </button>
      {open && <div className="p-4 pt-0 prose prose-slate max-w-none">{children}</div>}
    </section>
  );
};

export default function ManualPerakaunanPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 min-w-0 overflow-x-hidden">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/admin/accounting-full')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Dashboard
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-100 rounded-xl">
            <BookOpen className="w-8 h-8 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Manual Pengguna: Modul Perakaunan</h1>
            <p className="text-gray-600 text-sm">Untuk Bendahari, Sub-Bendahari & JuruAudit</p>
          </div>
        </div>

        <p className="text-gray-700 mb-6">
          Manual ini menerangkan cara menggunakan Sistem Perakaunan MRSM—dari rekod transaksi, pengesahan, sehingga laporan.
          Sistem menggunakan <strong>perakaunan entri bergu</strong>: setiap transaksi direkod sebagai Debit dan Kredit secara automatik.
        </p>

        <Section title="1. Pengenalan" id="pengenalan">
          <p><strong>Apa itu Modul Perakaunan?</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li>Merekod wang masuk (yuran, derma, jualan, dll.)</li>
            <li>Merekod wang keluar (perbelanjaan operasi, program, utiliti, dll.)</li>
            <li>Menyimpan rekod mengikut akaun bank dan kategori</li>
            <li>Menghasilkan laporan bulanan, tahunan, dan laporan AGM</li>
          </ul>
          <p className="mt-3"><strong>Entri Bergu:</strong> Wang masuk → Debit Akaun Bank, Kredit Hasil. Wang keluar → Debit Belanja, Kredit Akaun Bank. Anda tidak perlu isi debit/kredit manual—sistem yang rekod.</p>
        </Section>

        <Section title="2. Peranan & Tanggungjawab" id="peranan">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Peranan</th>
                  <th className="px-3 py-2 text-left font-semibold">Boleh buat</th>
                  <th className="px-3 py-2 text-left font-semibold">Tidak boleh buat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr><td className="px-3 py-2 font-medium">Bendahari</td><td className="px-3 py-2">Cipta/edit transaksi, urus kategori & akaun bank, lihat laporan</td><td className="px-3 py-2">Sahkan transaksi</td></tr>
                <tr><td className="px-3 py-2 font-medium">Sub-Bendahari</td><td className="px-3 py-2">Sama seperti Bendahari</td><td className="px-3 py-2">Sahkan transaksi</td></tr>
                <tr><td className="px-3 py-2 font-medium">JuruAudit</td><td className="px-3 py-2">Sahkan/tolak transaksi, lihat transaksi & laporan, log audit</td><td className="px-3 py-2">Cipta atau edit transaksi</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-gray-600">Pemisahan tugas: Bendahari merekod; JuruAudit mengesahkan.</p>
        </Section>

        <Section title="3. Aliran Kerja Transaksi" id="aliran">
          <p className="text-gray-700">Bendahari cipta transaksi → Status <strong>Menunggu Pengesahan</strong> → JuruAudit <strong>Sahkan</strong> atau <strong>Tolak</strong> → Hanya transaksi <strong>Disahkan</strong> masuk dalam laporan.</p>
          <p className="mt-2 text-sm text-gray-600">Tempoh yang dikunci tidak boleh edit/padam transaksi (untuk audit).</p>
        </Section>

        <Section title="4. Proses Bendahari" id="proses-bendahari">
          <p><strong>Rekod Wang Masuk:</strong></p>
          <ol className="list-decimal pl-6 space-y-1 text-gray-700">
            <li>Klik Transaksi Baru / Rekod Wang Masuk</li>
            <li>Pilih Wang Masuk → Pilih Kategori (cth. Yuran Pelajar) → Pilih Akaun Bank (atau biar kosong untuk akaun default)</li>
            <li>Isi Jumlah, Tarikh, Penerangan, Nombor Rujukan (pilihan)</li>
            <li>Simpan. Sistem cipta entri jurnal automatik.</li>
          </ol>
          <p className="mt-3"><strong>Rekod Wang Keluar:</strong> Pilih Wang Keluar → Pilih kategori belanja & akaun bank → Isi jumlah, tarikh, penerangan → Simpan.</p>
          <p className="mt-2 text-sm">Edit/Padam hanya untuk transaksi yang masih <strong>Menunggu Pengesahan</strong>. Selepas disahkan, tidak boleh edit.</p>
          <p className="mt-2 text-sm">Dalam Butiran transaksi, bahagian <strong>Entri Bergu (Jurnal)</strong> tunjuk Debit/Kredit untuk semakan.</p>
        </Section>

        <Section title="5. Proses JuruAudit" id="proses-juruaudit">
          <p className="text-gray-700">Pergi ke Pengesahan → Semak senarai transaksi menunggu → Buka transaksi → Semak maklumat & entri jurnal → Klik <strong>Sahkan</strong> atau <strong>Tolak</strong>. Jika tolak, isi nota pengesahan.</p>
        </Section>

        <Section title="6. Senarai Akaun (COA)" id="coa">
          <p className="text-gray-700">Menu → Senarai Akaun. Papar Aset (akaun bank), Hasil, Belanja. Kod akaun boleh ditetapkan di Kategori dan Akaun Bank untuk rujukan Imbangan Duga.</p>
        </Section>

        <Section title="7. Akaun Bank & Kategori" id="akaun-kategori">
          <p className="text-gray-700"><strong>Akaun Bank:</strong> Menu → Akaun Bank. Tambah/Edit nama, jenis, nama bank, no. akaun, kod akaun (pilihan).</p>
          <p className="mt-2 text-gray-700"><strong>Kategori:</strong> Menu → Kategori. Tambah/Edit kategori Wang Masuk atau Wang Keluar, nama, penerangan, kod akaun (pilihan).</p>
        </Section>

        <Section title="8. Laporan" id="laporan">
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li><strong>Bulanan:</strong> Menu → Bulanan → Pilih tahun & bulan</li>
            <li><strong>Tahunan:</strong> Menu → Tahunan → Pilih tahun</li>
            <li><strong>Laporan AGM:</strong> Menu → Laporan AGM → Penyata P&P, Kunci Kira-kira, Aliran Tunai, Imbangan Duga</li>
            <li><strong>Senarai Transaksi:</strong> Boleh tapis mengikut jenis, status, kategori, modul (Yuran/Koperasi/Bas/Tabung), tarikh</li>
          </ul>
        </Section>

        <Section title="9. Migrasi Entri Jurnal (Sekali Sahaja)" id="migrasi">
          <p className="text-gray-700">Jika sistem baru guna entri bergu, transaksi lama mungkin belum ada jurnal. Bendahari/Admin: Dashboard → Menu Perakaunan → klik <strong>Migrasi ke Entri Jurnal</strong> → Sahkan. Jalankan sekali sahaja.</p>
        </Section>

        <Section title="10. Ringkasan Cepat" id="ringkasan">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Tugas</th>
                  <th className="px-3 py-2 text-left font-semibold">Langkah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                <tr><td className="px-3 py-2 font-medium">Rekod wang masuk</td><td className="px-3 py-2">Transaksi Baru → Wang Masuk → Kategori & Akaun Bank → Jumlah, tarikh, penerangan → Simpan</td></tr>
                <tr><td className="px-3 py-2 font-medium">Rekod wang keluar</td><td className="px-3 py-2">Transaksi Baru → Wang Keluar → Kategori & Akaun Bank → Isi → Simpan</td></tr>
                <tr><td className="px-3 py-2 font-medium">Urus kategori</td><td className="px-3 py-2">Menu → Kategori → Tambah/Edit</td></tr>
                <tr><td className="px-3 py-2 font-medium">Urus akaun bank</td><td className="px-3 py-2">Menu → Akaun Bank → Tambah/Edit</td></tr>
                <tr><td className="px-3 py-2 font-medium">Laporan bulanan</td><td className="px-3 py-2">Menu → Bulanan → Pilih tahun & bulan</td></tr>
                <tr><td className="px-3 py-2 font-medium">Laporan AGM</td><td className="px-3 py-2">Menu → Laporan AGM → Pilih tahun kewangan</td></tr>
              </tbody>
            </table>
          </div>
        </Section>

        <div className="mt-8 p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-900">
          <p className="font-medium">Manual penuh (dokumen Markdown) juga tersedia di: <code className="bg-white px-1 rounded">docs/MANUAL_MODUL_PERAKAUNAN.md</code> dalam repositori projek.</p>
        </div>
      </div>
    </div>
  );
}
