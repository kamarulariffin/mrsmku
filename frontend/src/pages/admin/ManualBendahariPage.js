/**
 * Manual Pengguna Bendahari – Layout moden dengan navigasi sisi dan kad seksyen.
 * Pautan bantuan pada setiap skrin membawa ke bahagian ini dengan hash (#section-id).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  TrendingUp,
  Package,
  Users,
  Settings,
  Calculator,
  Heart,
  CreditCard,
  PanelRight,
  Wallet,
  FileText,
  BarChart3,
  Mail,
  FileBarChart,
  Sparkles,
  Zap,
  ShieldCheck,
  CheckCircle2,
  ListOrdered,
  CircleDot,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard-admin', label: 'Dashboard Admin', icon: LayoutDashboard },
  { id: 'dashboard-kewangan', label: 'Dashboard Kewangan', icon: TrendingUp },
  { id: 'pakej-yuran', label: 'Pakej Yuran', icon: Package },
  { id: 'semua-yuran', label: 'Semua Yuran', icon: Users },
  { id: 'tetapan-yuran', label: 'Tetapan Yuran', icon: Settings },
  { id: 'formula-logik-pengiraan-ansuran', label: 'Formula Ansuran', icon: Calculator },
  { id: 'tabung', label: 'Tabung', icon: Heart },
  { id: 'pusat-bayaran', label: 'Pusat Bayaran', icon: CreditCard },
  { id: 'pusat-bayaran-panel-slider', label: 'Panel Slider Bayaran', icon: PanelRight },
  { id: 'ringkasan-akaun', label: 'Ringkasan Akaun', icon: Wallet },
  { id: 'modul-perakaunan-transaksi', label: 'Perakaunan & Laporan', icon: FileText },
  { id: 'ar-akaun-belum-terima', label: 'AR (Akaun Belum Terima)', icon: BarChart3 },
  { id: 'emel-template', label: 'E-mel Template', icon: Mail },
  { id: 'laporan', label: 'Laporan', icon: FileBarChart },
  { id: 'faq-ar-peringatan', label: 'Soalan Lazim – AR & Peringatan', icon: HelpCircle },
];

const BENEFITS = [
  { icon: Zap, text: 'Kurang kerja manual — entri jurnal & yuran auto-posting', color: 'amber' },
  { icon: LayoutDashboard, text: 'Satu tempat: yuran, kutipan, AR, perakaunan', color: 'teal' },
  { icon: BarChart3, text: 'Skor risiko & Hantar reminder (e-mel + push notifikasi) sekali klik', color: 'indigo' },
  { icon: FileBarChart, text: 'Laporan siap guna (AGM, P&P, Kunci Kira-kira)', color: 'emerald' },
  { icon: ShieldCheck, text: 'Audit trail & integriti data', color: 'slate' },
];

/** Manual mengikut aliran – step by step untuk bendahari tanpa latar perakaunan */
const FLOW_STEPS = [
  {
    step: 1,
    title: 'Faham peranan anda',
    faham: 'Anda urus: (1) Wang masuk—yuran, derma, kutipan; (2) Wang keluar—perbelanjaan sekolah; (3) Pastikan setiap ringgit direkod. Anda tidak perlu faham debit/kredit—sistem yang rekod secara automatik apabila anda pilih "Wang Masuk" atau "Wang Keluar", kategori dan jumlah.',
    buat: 'Log masuk, biasakan menu: Dashboard Kewangan, Semua Yuran, Ringkasan Akaun, AR (Akaun Belum Terima), Laporan.',
    icon: HelpCircle,
    color: 'teal',
  },
  {
    step: 2,
    title: 'Tetapan asas (sekali atau bila perlu)',
    faham: 'Tetapan Yuran = berapa kali ibu bapa boleh bayar ansuran dalam setahun (contoh: 2 bayaran). Pakej Yuran = senarai item yuran (nama, jumlah) mengikut tahun dan tingkatan—ini ialah "menu" yuran yang pelajar akan dapat.',
    buat: 'Menu → Tetapan Yuran: pilih bilangan ansuran (1–9), Simpan. Menu → Pakej Yuran: tambah set yuran, isi tahun/tingkatan, tambah item (nama, jumlah), Simpan.',
    icon: Settings,
    color: 'amber',
  },
  {
    step: 3,
    title: 'Beri yuran kepada pelajar',
    faham: 'Sistem tidak auto-generate bil untuk semua pelajar—anda perlu assign pakej yuran. Apabila anda assign, sistem auto "cipta bil" (invoice) untuk pelajar itu—baki yuran wujud dan perakaunan AR direkod automatik. Anda boleh assign satu per satu atau sekali gus untuk semua pelajar dalam satu tingkatan.',
    buat: '(A) Satu per satu: Menu → Semua Yuran → cari pelajar → Assign/Beri set yuran → pilih pakej. (B) Sekali gus mengikut tingkatan: Menu → Pakej Yuran → pilih tahun → kembangkan (expand) set yuran untuk tingkatan yang dikehendaki (cth. Tingkatan 1) → klik butang "Assign ke Semua Pelajar". Sistem akan assign pakej itu kepada SEMUA pelajar dalam tingkatan tersebut dan cipta bil automatik untuk setiap orang. Pelajar yang sudah ada yuran untuk tahun/tingkatan itu akan dilangkau.',
    icon: Package,
    color: 'emerald',
  },
  {
    step: 4,
    title: 'Terima bayaran',
    faham: 'Bila ibu bapa bayar (portal/FPX) atau anda rekod bayaran secara manual, wang masuk direkod. Sistem akan kurangkan baki yuran pelajar dan rekod perakaunan (wang masuk ke akaun) secara automatik.',
    buat: 'Jika bayaran melalui portal: ia auto masuk. Jika rekod manual: dari Semua Yuran pilih pelajar → Rekod bayaran, isi jumlah dan tarikh. Anda juga boleh guna Pusat Bayaran untuk troli bayaran (penuh / kategori / ansuran).',
    icon: CreditCard,
    color: 'cyan',
  },
  {
    step: 5,
    title: 'Rekod perbelanjaan (wang keluar)',
    faham: 'Bila sekolah berbelanja (bil elektrik, program, bekalan), anda rekod sebagai "Wang Keluar". Anda pilih kategori (contoh: Utiliti), akaun bank yang mengeluarkan wang, jumlah dan tarikh—sistem yang isi rekod perakaunan.',
    buat: 'Menu → Ringkasan Akaun → Transaksi Baru → Wang Keluar. Pilih kategori, akaun bank, jumlah (RM), tarikh, penerangan (cth. "Bil elektrik Jan 2025"). Simpan. Transaksi akan "Menunggu Pengesahan" sehingga JuruAudit menyahkan.',
    icon: Wallet,
    color: 'indigo',
  },
  {
    step: 6,
    title: 'JuruAudit sahkan transaksi',
    faham: 'Ini kawalan dalaman: anda yang rekod, orang lain (JuruAudit) yang sahkan. Hanya transaksi yang disahkan akan masuk dalam laporan rasmi. Transaksi yang ditolak tidak dikira—jika ada kesilapan, anda boleh buat transaksi baru.',
    buat: 'Anda tidak buat pengesahan—JuruAudit yang buat. Pastikan transaksi anda ada maklumat yang betul (jumlah, tarikh, penerangan) supaya mudah disahkan. Selepas disahkan, transaksi tidak boleh diedit (rekod kekal untuk audit).',
    icon: ShieldCheck,
    color: 'slate',
  },
  {
    step: 7,
    title: 'Pantau tertunggak & hantar peringatan',
    faham: 'AR (Akaun Belum Terima) = siapa lagi berhutang yuran. "Aging" = sudah lewat berapa lama (0–30 hari, 31–60, 61–90, 90+). Skor risiko (Rendah/Sederhana/Tinggi) membantu anda utamakan siapa untuk diingatkan. Anda boleh hantar peringatan satu per satu atau pukal (seluruh tingkatan) dengan satu butang.',
    buat: 'Menu → AR (Akaun Belum Terima) → Pergi ke Senarai Tertunggak. Pilih tab Tingkatan 1–5; senarai tunjuk status (merah = belum hantar, hijau = sudah hantar) dan jenis (E-mel/Push). Hantar satu: klik Hantar Peringatan pada baris → pilih E-mel atau Push, pilih template → Hantar. Hantar pukal: klik "Hantar Peringatan Pukal (Tingkatan X)" → pilih saluran & template, pilihan kelompok 20 orang → Setuju & Hantar.',
    icon: BarChart3,
    color: 'rose',
  },
  {
    step: 8,
    title: 'Laporan untuk mesyuarat',
    faham: 'Laporan Bulanan/Tahunan dan Laporan AGM (Penyata Pendapatan & Perbelanjaan, Kunci Kira-kira, Aliran Tunai) dijana dari data yang anda dan JuruAudit telah rekod dan sahkan. Pastikan transaksi untuk tempoh berkenaan telah disahkan sebelum tarikh tutup.',
    buat: 'Menu → Ringkasan Akaun → Laporan Bulanan/Tahunan, atau Laporan AGM. Pilih tahun (dan bulan jika bulanan). Jana atau cetak untuk mesyuarat. Menu → Laporan juga ada laporan lain (yuran, pelajar) mengikut keperluan.',
    icon: FileBarChart,
    color: 'violet',
  },
];

const FLOW_COLORS = {
  teal: 'bg-teal-50 border-teal-200 text-teal-900 [&_svg]:text-teal-600',
  amber: 'bg-amber-50 border-amber-200 text-amber-900 [&_svg]:text-amber-600',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900 [&_svg]:text-emerald-600',
  cyan: 'bg-cyan-50 border-cyan-200 text-cyan-900 [&_svg]:text-cyan-600',
  indigo: 'bg-indigo-50 border-indigo-200 text-indigo-900 [&_svg]:text-indigo-600',
  slate: 'bg-slate-50 border-slate-200 text-slate-800 [&_svg]:text-slate-600',
  rose: 'bg-rose-50 border-rose-200 text-rose-900 [&_svg]:text-rose-600',
  violet: 'bg-violet-50 border-violet-200 text-violet-900 [&_svg]:text-violet-600',
};

const FlowStepCard = ({ step, title, faham, buat, icon: Icon, color }) => (
  <div className={`rounded-2xl border-2 p-5 ${FLOW_COLORS[color] || FLOW_COLORS.teal}`}>
    <div className="flex items-start gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/80 border-2 border-current font-bold text-lg shadow-sm">
        {step}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          {Icon && <Icon className="w-5 h-5 shrink-0" />}
          <h3 className="font-bold text-lg">{title}</h3>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">Apa yang anda perlu faham</p>
            <p className="opacity-90 leading-relaxed">{faham}</p>
          </div>
          <div>
            <p className="font-semibold mb-1">Apa yang anda buat</p>
            <p className="opacity-90 leading-relaxed">{buat}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const Section = ({ number, title, id, icon: Icon, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      id={id}
      className="group rounded-2xl bg-white border border-slate-200/80 overflow-hidden shadow-sm hover:shadow-md hover:border-teal-200/60 transition-all duration-300 mb-4"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50/80 transition-colors"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white font-bold text-sm shadow-sm">
          {number}
        </span>
        {Icon && <Icon className="w-5 h-5 text-teal-600 shrink-0" />}
        <span className="font-semibold text-slate-800 flex-1">{title}</span>
        <span className={`shrink-0 p-1.5 rounded-lg bg-slate-100 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <ChevronDown className="w-5 h-5 text-slate-500" />
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-0">
          <div className="pl-[4.25rem] border-l-2 border-teal-100 pl-6 ml-5 prose prose-slate prose-sm max-w-none text-slate-600">
            {children}
          </div>
        </div>
      )}
    </section>
  );
};

export default function ManualBendahariPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeId, setActiveId] = useState('');

  const hash = location.hash?.replace('#', '') || '';

  useEffect(() => {
    if (hash) {
      setActiveId(hash);
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const section = el.closest('section');
        if (section) {
          const btn = section.querySelector('button');
          if (btn) btn.click();
        }
      }
    }
  }, [hash]);

  const benefitColors = useMemo(() => ({
    amber: 'bg-amber-50 border-amber-200/60 text-amber-800 [&_svg]:text-amber-600',
    teal: 'bg-teal-50 border-teal-200/60 text-teal-800 [&_svg]:text-teal-600',
    indigo: 'bg-indigo-50 border-indigo-200/60 text-indigo-800 [&_svg]:text-indigo-600',
    emerald: 'bg-emerald-50 border-emerald-200/60 text-emerald-800 [&_svg]:text-emerald-600',
    slate: 'bg-slate-50 border-slate-200/60 text-slate-800 [&_svg]:text-slate-600',
  }), []);

  return (
    <div className="min-h-screen bg-[#f0f4f8] min-w-0 overflow-x-hidden">
      {/* Hero – pastel */}
      <header className="relative overflow-hidden shadow-md">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-50 via-emerald-50/90 to-cyan-50" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%230d9488\' fill-opacity=\'0.06\' fill-rule=\'evenodd\'%3E%3Cpath d=\'M20 20c0-2 1-4 2-4s2 2 2 4-1 4-2 4-2-2-2-4z\'/%3E%3C/g%3E%3C/svg%3E')]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-10">
          <button
            onClick={() => navigate('/admin')}
            className="inline-flex items-center gap-2 text-teal-700 hover:text-teal-900 text-sm font-medium mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Dashboard
          </button>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-4 rounded-2xl bg-white/80 backdrop-blur border border-teal-100 shadow-sm">
                <BookOpen className="w-10 h-10 text-teal-600" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-800">
                  Manual Pengguna: Bendahari
                </h1>
                <p className="text-slate-600 text-sm md:text-base mt-2 max-w-xl leading-relaxed">
                  Panduan lengkap untuk setiap bahagian—yuran, perakaunan, AR. Gunakan pautan Manual pada skrin untuk melompat ke bahagian berkaitan.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-200/80 to-transparent" aria-hidden="true" />
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar nav - sticky on desktop */}
          <aside className="lg:w-64 shrink-0">
            <div className="lg:sticky lg:top-6 space-y-6">
              {/* Kelebihan & Manual block */}
              <section
                id="kelebihan-dan-manual"
                className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden"
              >
                <div className="p-4 bg-gradient-to-r from-teal-500/10 to-emerald-500/10 border-b border-slate-100">
                  <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    Kelebihan & Manual
                  </h2>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Kelebihan untuk anda</h3>
                    <ul className="space-y-2">
                      {BENEFITS.map(({ icon: Icon, text, color }, i) => (
                        <li key={i} className={`flex items-start gap-2 rounded-xl border p-2.5 text-xs ${benefitColors[color]}`}>
                          <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Navigasi</h3>
                    <a
                      href="#manual-mengikut-aliran"
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors mb-2 ${
                        activeId === 'manual-mengikut-aliran'
                          ? 'bg-teal-500/15 text-teal-800'
                          : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200/60'
                      }`}
                    >
                      <ListOrdered className="w-4 h-4 shrink-0 text-teal-600" />
                      <span>Manual mengikut aliran</span>
                    </a>
                    <nav className="space-y-0.5 max-h-[240px] overflow-y-auto pr-1">
                      {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                        <a
                          key={id}
                          href={`#${id}`}
                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                            activeId === id
                              ? 'bg-teal-500/15 text-teal-800 font-medium'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0 text-teal-600" />
                          <span className="truncate">{label}</span>
                        </a>
                      ))}
                    </nav>
                  </div>
                </div>
              </section>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {/* Manual mengikut aliran – step by step */}
            <section id="manual-mengikut-aliran" className="mb-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 rounded-xl bg-teal-100">
                  <ListOrdered className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Manual mengikut aliran</h2>
                  <p className="text-sm text-slate-600">Ikut langkah demi langkah—sesuai jika anda tiada latar belakang perakaunan.</p>
                </div>
              </div>
              <div className="space-y-4">
                {FLOW_STEPS.map((s) => (
                  <FlowStepCard key={s.step} {...s} />
                ))}
              </div>
              <div className="mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <h4 className="font-semibold text-slate-800 flex items-center gap-2 mb-2">
                  <CircleDot className="w-4 h-4 text-teal-600" />
                  Istilah ringkas (tanpa perlu hafal)
                </h4>
                <ul className="text-sm text-slate-600 space-y-1.5">
                  <li><strong>Wang masuk / Wang keluar</strong> — Anda hanya pilih satu; sistem yang rekod sisi perakaunan (debit/kredit).</li>
                  <li><strong>AR (Akaun Belum Terima)</strong> — Jumlah yuran yang belum dibayar; "siapa lagi berhutang".</li>
                  <li><strong>Aging</strong> — Tertunggak sudah lewat berapa lama (0–30 hari, 31–60, 61–90, 90+).</li>
                  <li><strong>Sub-ledger</strong> — Senarai tertunggak per pelajar; mesti sama dengan baki AR dalam sistem (integriti).</li>
                  <li><strong>Pengesahan</strong> — JuruAudit sahkan transaksi anda; hanya yang disahkan masuk laporan rasmi.</li>
                </ul>
              </div>
            </section>

            <hr className="my-10 border-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" aria-hidden="true" />

            <div className="flex items-center gap-2 mb-4">
              <ArrowRight className="w-5 h-5 text-slate-400" />
              <h2 className="text-lg font-bold text-slate-700">Rujukan pantas mengikut skrin</h2>
            </div>
            <p className="text-sm text-slate-600 mb-6">Klik bahagian di bawah untuk panduan mengikut halaman atau modul.</p>

            <Section number={1} title="Dashboard Admin" id="dashboard-admin" icon={LayoutDashboard} defaultOpen={hash === 'dashboard-admin'}>
              <p><strong>Laluan:</strong> Menu → Dashboard (<code>/admin</code>)</p>
              <p>Paparan utama selepas log masuk. Ringkasan ringkas dan pautan pantas ke modul. Gunakan menu sisi untuk ke Dashboard Kewangan, Ringkasan Akaun, Pakej Yuran, Semua Yuran, Tetapan Yuran, Tabung, Laporan, E-mel Template.</p>
            </Section>

            <Section number={2} title="Dashboard Kewangan" id="dashboard-kewangan" icon={TrendingUp} defaultOpen={hash === 'dashboard-kewangan'}>
              <p><strong>Laluan:</strong> Menu → Dashboard Kewangan</p>
              <p>Ringkasan kewangan: yuran dikutip, mengikut kaedah bayaran (penuh, kategori, ansuran), pecahan tingkatan. Boleh tapis mengikut tahun. Berguna untuk semakan pantas kutipan yuran.</p>
            </Section>

            <Section number={3} title="Pakej Yuran (Set Yuran)" id="pakej-yuran" icon={Package} defaultOpen={hash === 'pakej-yuran'}>
              <p><strong>Laluan:</strong> Menu → Pakej Yuran</p>
              <p>Urus set yuran mengikut tahun dan tingkatan. Tambah set: isi nama, tahun, tingkatan; tentukan kategori dan item yuran (nama, kod, jumlah); item Islam sahaja / bukan Islam jika perlu. Edit/padam dari senarai.</p>
              <p><strong>Assign ke pelajar:</strong> (1) Satu per satu dari Semua Yuran — pilih pelajar, Assign, pilih pakej. (2) <strong>Assign kepada semua pelajar mengikut tingkatan:</strong> Di halaman ini, pilih tahun, kemudian kembangkan (expand) kad set yuran untuk tingkatan yang dikehendaki (cth. Tingkatan 1). Klik butang <strong>&quot;Assign ke Semua Pelajar&quot;</strong> — sistem akan assign pakej itu kepada SEMUA pelajar dalam tingkatan tersebut dan cipta bil (invoice) automatik untuk setiap orang. Ini bukan auto tanpa tindakan; anda tetap klik butang sekali per tingkatan. Pelajar yang sudah ada yuran untuk tahun/tingkatan itu akan dilangkau.</p>
            </Section>

            <Section number={4} title="Semua Yuran Pelajar" id="semua-yuran" icon={Users} defaultOpen={hash === 'semua-yuran'}>
              <p><strong>Laluan:</strong> Menu → Semua Yuran</p>
              <p>Senarai yuran pelajar: nama, tingkatan, set yuran, jumlah, dibayar, baki, status. Tapis mengikut tahun, tingkatan, status. Tindakan: lihat butiran, resit; rekod bayaran; assign set yuran. Laporan accounting mengikut senarai item yuran (bayaran diperuntukkan ke item mengikut keutamaan).</p>
            </Section>

            <Section number={5} title="Tetapan Yuran (Polisi Ansuran)" id="tetapan-yuran" icon={Settings} defaultOpen={hash === 'tetapan-yuran'}>
              <p><strong>Laluan:</strong> Menu → Tetapan Yuran</p>
              <p>Ketetapan bendahari: <strong>Bilangan maksimum ansuran dalam 9 bulan</strong> (1–9, default 2). Ibu bapa boleh bayar yuran dalam masa 9 bulan (sebelum bulan 10) sebanyak maksimum kali yang ditetapkan. Pilih nombor, klik Simpan. Perubahan berkuat kuasa serta-merta.</p>
            </Section>

            <Section number={6} title="Formula & Logik Pengiraan Ansuran" id="formula-logik-pengiraan-ansuran" icon={Calculator} defaultOpen={hash === 'formula-logik-pengiraan-ansuran'}>
              <p>Formula bayaran ansuran <strong>mengikut bilangan kali bayar (N)</strong> yang ditetapkan di Tetapan Yuran. N = 1 hingga 9 (default 2).</p>
              <p><strong>Pemboleh ubah:</strong> N = bilangan kali bayar; Jumlah yuran = jumlah penuh yuran pelajar.</p>
              <p><strong>Jumlah setiap bayaran:</strong></p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Bayaran ke-1, ke-2, … ke-(N−1): <strong>RM round(Jumlah yuran ÷ N, 2)</strong>. Contoh: N=3, yuran RM 1000 → Bayaran 1 = RM 333.33, Bayaran 2 = RM 333.33.</li>
                <li>Bayaran ke-N (terakhir): <strong>Baki tertunggak</strong> = Jumlah yuran − (semua bayaran yang sudah dibuat). Contoh: Bayaran 3 = RM 1000 − 333.33 − 333.33 = RM 333.34. Ini memastikan jumlah keseluruhan tepat (tiada rounding error).</li>
              </ul>
              <p><strong>Ringkasan:</strong> Bayaran 1, 2, … N−1 = round(Jumlah ÷ N, 2); Bayaran N = baki tertunggak. Sistem mengira mengikut N; laporan kekal terperinci mengikut senarai item yuran.</p>
            </Section>

            <Section number={7} title="Tabung & Sumbangan" id="tabung" icon={Heart} defaultOpen={hash === 'tabung'}>
              <p><strong>Laluan:</strong> Menu → Tabung & Sumbangan</p>
              <p>Urus kempen derma/sumbangan. Kempen aktif: tambah/edit kempen, set target atau slot, harga, status. Bentuk: berasaskan jumlah atau slot. Ibu bapa boleh sumbang melalui portal; bendahari pantau kutipan.</p>
            </Section>

            <Section number={8} title="Pusat Bayaran (Modul Bayaran)" id="pusat-bayaran" icon={CreditCard} defaultOpen={hash === 'pusat-bayaran'}>
              <p><strong>Laluan:</strong> Pautan Pusat Bayaran / modul bayaran</p>
              <p>Troli bayaran berpusat: yuran, koperasi, bas, tabung. Tab: Yuran, 2 Bayaran (ansuran), Tabung, Resit, Troli. Yuran: pilih pelajar & yuran; pilih kaedah melalui panel slider. 2 Bayaran: senarai yuran layak ansuran; tambah ke troli. Troli: semak item, checkout.</p>
            </Section>

            <Section number={9} title="Pusat Bayaran – Panel Slider Bayaran Yuran" id="pusat-bayaran-panel-slider" icon={PanelRight} defaultOpen={hash === 'pusat-bayaran-panel-slider'}>
              <p><strong>Konteks:</strong> Dalam Pusat Bayaran, bila pilih yuran dan klik bayar, panel slider terbuka.</p>
              <p><strong>Pilihan kaedah:</strong> (1) Bayaran penuh – semua baki sekali gus. (2) Mengikut kategori – pilih item/kategori (checkbox); jumlah ikut pilihan. (3) Ansuran – pilih Bayaran 1, 2, … N; jumlah dikira sistem. Pilih kaedah pembayaran (FPX/Kad/DuitNow). Klik Sahkan untuk tambah ke troli. Setiap bayaran diperuntukkan ke senarai item yuran untuk accounting terperinci.</p>
            </Section>

            <Section number={10} title="Ringkasan Akaun (Modul Perakaunan)" id="ringkasan-akaun" icon={Wallet} defaultOpen={hash === 'ringkasan-akaun'}>
              <p><strong>Laluan:</strong> Menu → Ringkasan Akaun</p>
              <p>Dashboard modul perakaunan: wang masuk/keluar bulan ini, baki, transaksi menunggu pengesahan. Klik &quot;Manual Pengguna&quot; untuk manual khusus perakaunan. Pautan: Transaksi Baru, Senarai Transaksi, Kategori, Akaun Bank, Laporan.</p>
            </Section>

            <Section number={11} title="Modul Perakaunan – Transaksi & Laporan" id="modul-perakaunan-transaksi" icon={FileText} defaultOpen={hash === 'modul-perakaunan-transaksi'}>
              <p><strong>Transaksi Baru:</strong> Rekod wang masuk/keluar; kategori, akaun bank, jumlah, tarikh, penerangan; entri bergu automatik. <strong>Senarai Transaksi:</strong> Tapis; edit/padam hanya yang belum disahkan. <strong>Kategori & Akaun Bank:</strong> Urus kategori dan akaun. <strong>Laporan Bulanan/Tahunan/AGM:</strong> Pilih tahun/bulan; Penyata P&P, Kunci Kira-kira, Aliran Tunai, Imbangan Duga. Pengesahan: JuruAudit sahkan/tolak; hanya transaksi disahkan masuk laporan. Manual penuh: Manual Pengguna Modul Perakaunan.</p>
            </Section>

            <Section number={12} title="AR (Akaun Belum Terima)" id="ar-akaun-belum-terima" icon={BarChart3} defaultOpen={hash === 'ar-akaun-belum-terima'}>
              <p><strong>Laluan:</strong> Menu → AR (Akaun Belum Terima). Dari sini klik <strong>Pergi ke Senarai Tertunggak</strong> untuk halaman penuh mengikut tingkatan.</p>
              <p><strong>Senarai Tertunggak mengikut Tingkatan</strong> (Laluan: /admin/ar-outstanding): Tab <strong>Tingkatan 1–5</strong>, pagination 20 per halaman. Setiap baris: Pelajar, No Matrik, Tertunggak (RM), Risiko, <strong>Status Notifikasi</strong> (merah = Belum dihantar, hijau = Sudah hantar), <strong>Jenis / Tarikh</strong> (E-mel atau Push + tarikh), butang <strong>Hantar Peringatan</strong>. Kad &quot;Urus E-mel & Push Notifikasi&quot; ada pautan ke E-mel Template dan butang <strong>Hantar Peringatan Pukal (Tingkatan X)</strong>.</p>
              <p><strong>Hantar satu per satu:</strong> Klik Hantar Peringatan pada baris → pilih E-mel sahaja atau Push sahaja → pilih template e-mel atau template push → Hantar. Status baris dikemas kini (hijau, jenis, tarikh).</p>
              <p><strong>Hantar pukal:</strong> Klik Hantar Peringatan Pukal → form: ringkasan bilangan penerima, pilih saluran (E-mel/Push), template, pilihan &quot;Hantar dalam kelompok 20 orang&quot; (disyorkan; 100 orang = 5 batch 20 dengan jeda 1 saat) → Setuju & Hantar. Sistem hantar dan kemas kini status semua pelajar. Pembalikan: untuk entri jurnal AR yang salah (Bendahari/Admin).</p>
            </Section>

            <Section number={13} title="E-mel Template" id="emel-template" icon={Mail} defaultOpen={hash === 'emel-template'}>
              <p><strong>Laluan:</strong> Menu → E-mel Template</p>
              <p>Urus template e-mel: peringatan yuran, pengesahan bayaran, yuran baru, dll. Boleh disesuaikan <strong>ikut tingkatan</strong> (Umum, Tingkatan 1–5). Edit subjek dan badan; pembolehubah seperti <code>{'{{parent_name}}'}</code>, <code>{'{{total_outstanding}}'}</code>. Bila hantar peringatan (satu atau pukal) di Senarai Tertunggak, bendahari <strong>pilih template e-mel</strong> (cth. Peringatan Yuran Tertunggak) atau <strong>template push</strong> (Peringatan penuh/ringkas/mendesak); kandungan ikut template yang anda edit di sini.</p>
            </Section>

            <Section number={14} title="Laporan" id="laporan" icon={FileBarChart} defaultOpen={hash === 'laporan'}>
              <p><strong>Laluan:</strong> Menu → Laporan</p>
              <p>Akses pelbagai laporan: yuran, kewangan, pelajar. Pilih jenis dan parameter (tahun, tingkatan, tarikh); jana atau eksport.</p>
            </Section>

            <Section number={15} title="Soalan Lazim – AR & Peringatan" id="faq-ar-peringatan" icon={HelpCircle} defaultOpen={hash === 'faq-ar-peringatan'}>
              <p><strong>Di mana hantar peringatan satu per satu?</strong> Menu → AR → Pergi ke Senarai Tertunggak. Pilih tab tingkatan, klik Hantar Peringatan pada baris pelajar → pilih E-mel atau Push, template → Hantar.</p>
              <p><strong>Boleh hantar kepada seluruh tingkatan sekali gus?</strong> Ya. Di Senarai Tertunggak, klik Hantar Peringatan Pukal (Tingkatan X). Pilih saluran, template, pilihan kelompok 20 orang → Setuju & Hantar. Sistem hantar kepada semua pelajar tertunggak dalam tingkatan itu.</p>
              <p><strong>Apa maksud &quot;Hantar dalam kelompok 20 orang&quot;?</strong> Sistem hantar batch 20 orang, jeda 1 saat, kemudian batch seterusnya (cth. 100 orang = 5 kelompok). Kurangkan beban pelayan. Jika tidak dicentang, semua dihantar berturut-turut.</p>
              <p><strong>Apa maksud status merah dan hijau?</strong> Merah = peringatan belum dihantar. Hijau = sudah dihantar; lajur Jenis/Tarikh tunjuk E-mel atau Push dan tarikh.</p>
              <p><strong>Boleh pilih template?</strong> Ya. Bila Hantar Peringatan (satu atau pukal), pilih E-mel sahaja atau Push sahaja; kemudian pilih template e-mel (cth. Peringatan Yuran) atau template push (penuh/ringkas/mendesak). Template e-mel boleh diedit ikut tingkatan di E-mel Template.</p>
            </Section>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-teal-100">
                  <BookOpen className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-800">Manual penuh (dokumen lengkap)</p>
                  <p className="text-sm text-slate-600">Baca semua bahagian dalam satu dokumen dengan navigasi kandungan dan format yang senang dibaca.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/admin/manual-bendahari/full')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors"
                >
                  <BookOpen className="w-5 h-5" />
                  Buka Manual Penuh
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/admin/knowledge')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                >
                  Semua manual di Pusat Pengetahuan
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
