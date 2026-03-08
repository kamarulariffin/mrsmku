import React from 'react';
import { Link } from 'react-router-dom';
import {
  Home,
  ChevronRight,
  Users,
  Wallet,
  CheckCircle,
  AlertCircle,
  Plus,
  CreditCard,
  FileText,
  Bell,
  Settings,
  ArrowRight,
  Inbox,
  Sparkles,
} from 'lucide-react';
import { Card, StatCard, Button, Badge } from '../../components/common';

/**
 * Sample Layout Page – Rujukan layout moden & user-friendly untuk Portal MRSMKU.
 * Guna pola ini bila buat halaman baharu: header → stats → content grid → table/cards.
 * Akses: Log masuk sebagai Super Admin → sidebar "Sample Layout" atau /sample-layout
 */
const SampleLayoutPage = () => {
  return (
    <div className="space-y-8 max-w-6xl mx-auto min-w-0 overflow-x-hidden" data-testid="sample-layout-page">
      {/* ─── 1. Page Header (title + breadcrumb + action) ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Link to="/superadmin" className="hover:text-primary-700 flex items-center gap-1">
              <Home size={14} />
              Dashboard
            </Link>
            <ChevronRight size={14} className="text-slate-300" />
            <span className="text-slate-700 font-medium">Sample Layout</span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 font-heading tracking-tight">
            Sample Layout
          </h1>
          <p className="text-slate-600 mt-1">
            Rujukan layout moden untuk halaman dalam sistem. Gunakan pola yang sama untuk konsistensi.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm">
            <FileText size={16} />
            Eksport
          </Button>
          <Button size="sm">
            <Plus size={16} />
            Tindakan Utama
          </Button>
        </div>
      </div>

      {/* ─── 2. Stat Cards (4 kolum) ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Jumlah Pengguna"
          value="1,234"
          subtext="+12% bulan ini"
          color="primary"
        />
        <StatCard
          icon={Wallet}
          label="Jumlah Yuran"
          value="RM 45.2k"
          subtext="Bulan semasa"
          color="secondary"
        />
        <StatCard
          icon={CheckCircle}
          label="Selesai"
          value="89%"
          subtext="Pembayaran"
          color="success"
        />
        <StatCard
          icon={AlertCircle}
          label="Tertunggak"
          value="23"
          subtext="Perlu tindakan"
          color="danger"
        />
      </div>

      {/* ─── 3. Quick Action Cards (grid) ─── */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 font-heading mb-4 flex items-center gap-2">
          <Sparkles size={20} className="text-primary-600" />
          Tindakan Pantas
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: CreditCard, label: 'Bayar Yuran', desc: 'Yuran tertunggak', to: '/yuran', color: 'bg-primary-100 text-primary-700' },
            { icon: Users, label: 'Anak Saya', desc: 'Daftar & kelulusan', to: '/children', color: 'bg-teal-100 text-teal-700' },
            { icon: Bell, label: 'Notifikasi', desc: 'Pemberitahuan baru', to: '/notifications', color: 'bg-amber-100 text-amber-700' },
          ].map((item) => (
            <Link key={item.to} to={item.to}>
              <Card hover className="h-full">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${item.color}`}>
                    <item.icon size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900">{item.label}</h3>
                    <p className="text-sm text-slate-500">{item.desc}</p>
                  </div>
                  <ArrowRight className="text-slate-300 flex-shrink-0" size={18} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── 4. Content + Table / List ─── */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 font-heading mb-4">Senarai Contoh</h2>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Nama</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Status</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Ahmad bin Abu', status: 'paid', amount: 'RM 850.00' },
                  { name: 'Siti Nurul', status: 'partial', amount: 'RM 500.00' },
                  { name: 'Muhammad Arif', status: 'pending', amount: 'RM 850.00' },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-medium text-slate-900">{row.name}</td>
                    <td className="py-3 px-4">
                      <Badge status={row.status}>
                        {row.status === 'paid' ? 'Dibayar' : row.status === 'partial' ? 'Separa' : 'Menunggu'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">{row.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* ─── 5. Empty State (contoh) ─── */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 font-heading mb-4">Contoh Empty State</h2>
        <Card className="text-center py-12 border-2 border-dashed border-slate-200 bg-slate-50/50">
          <div className="w-14 h-14 mx-auto rounded-full bg-slate-200 flex items-center justify-center mb-4">
            <Inbox className="text-slate-500" size={28} />
          </div>
          <h3 className="font-semibold text-slate-800 mb-1">Tiada data lagi</h3>
          <p className="text-slate-500 text-sm max-w-sm mx-auto mb-6">
            Apabila tiada rekod, gunakan mesej mesra dan butang tindakan untuk memulakan.
          </p>
          <Button size="sm">
            <Plus size={16} />
            Tambah Rekod
          </Button>
        </Card>
      </section>

      {/* ─── 6. Tip box (user-friendly) ─── */}
      <Card className="border-primary-200 bg-primary-50/50">
        <div className="flex gap-4">
          <div className="p-2 rounded-lg bg-primary-100 text-primary-700 flex-shrink-0">
            <Settings size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-1">Tip Layout</h3>
            <p className="text-sm text-slate-600">
              Gunakan spacing konsisten (gap-4, gap-6, space-y-6), font-heading untuk tajuk, dan komponen
              dari <code className="px-1.5 py-0.5 bg-white rounded text-primary-700">components/common</code> (Card, StatCard, Button, Badge)
              supaya semua halaman kelihatan seragam dan mesra pengguna.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default SampleLayoutPage;
