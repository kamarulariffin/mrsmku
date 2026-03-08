/**
 * Pusat Pengetahuan (Knowledge Management) – senarai semua manual dan dokumen rujukan.
 * Gaya: knowledge base moden (hero, kad hover, ikon gradient).
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileText, ChevronRight, Library, Search, Lightbulb } from 'lucide-react';

const DOCS = [
  {
    id: 'manual-bendahari',
    title: 'Manual Pengguna Bendahari',
    description: 'Panduan ringkasan mengikut aliran dan rujukan pantas mengikut skrin (yuran, perakaunan, AR, e-mel, laporan).',
    icon: BookOpen,
    path: '/admin/manual-bendahari',
    tag: 'Ringkasan',
  },
  {
    id: 'manual-bendahari-full',
    title: 'Manual Pengguna Bendahari (Dokumen Penuh)',
    description: 'Dokumen lengkap dengan navigasi kandungan. Semua bahagian dalam satu dokumen.',
    icon: FileText,
    path: '/admin/manual-bendahari/full',
    tag: 'Penuh',
  },
  {
    id: 'manual-perakaunan',
    title: 'Manual Modul Perakaunan',
    description: 'Panduan khusus perakaunan: entri bergu, peranan Bendahari & JuruAudit, COA, laporan.',
    icon: FileText,
    path: '/admin/accounting/manual',
    tag: 'Perakaunan',
  },
];

export default function KnowledgePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filtered = DOCS.filter(
    (d) =>
      !search.trim() ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-w-0 overflow-x-hidden" data-testid="knowledge-page">
      {/* Hero – pastel lembut */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-teal-50 via-emerald-50/90 to-cyan-50 p-8 md:p-10 mb-8 shadow-md border border-slate-200/60">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%230d9488\' fill-opacity=\'0.06\' fill-rule=\'evenodd\'%3E%3Cpath d=\'M20 20c0-2 1-4 2-4s2 2 2 4-1 4-2 4-2-2-2-4z\'/%3E%3C/g%3E%3C/svg%3E')]" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-white/80 backdrop-blur border border-teal-100 shadow-sm">
              <Library className="w-8 h-8 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold font-heading tracking-tight text-slate-800 flex items-center gap-2">
                Pusat Pengetahuan
                <Lightbulb className="w-6 h-6 text-amber-500" />
              </h1>
              <p className="text-slate-600 mt-2 text-sm md:text-base max-w-xl">
                Manual pengguna dan dokumen rujukan dalam satu tempat. Cari dan buka panduan mengikut keperluan.
              </p>
            </div>
          </div>
        </div>
        {/* Search */}
        <div className="relative mt-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Cari manual…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/80 border border-slate-200/80 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
          />
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Semua Manual</h2>
          {filtered.length < DOCS.length && (
            <span className="text-sm text-slate-500">{filtered.length} daripada {DOCS.length}</span>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => {
            const Icon = doc.icon;
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => navigate(doc.path)}
                className="group relative flex flex-col text-left rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm hover:shadow-lg hover:border-teal-200/80 hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-600 shrink-0 group-hover:from-teal-100 group-hover:to-emerald-100 transition-colors">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {doc.tag && (
                      <span className="inline-block text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full mb-2">
                        {doc.tag}
                      </span>
                    )}
                    <h3 className="font-semibold text-slate-800 group-hover:text-teal-700 text-base">
                      {doc.title}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1.5 line-clamp-2">
                      {doc.description}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 shrink-0 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-slate-500 py-8">Tiada manual sepadan dengan carian.</p>
        )}

        <p className="text-sm text-slate-500 pt-2">
          Lebih banyak manual dan panduan akan ditambah dari semasa ke semasa.
        </p>
      </div>
    </div>
  );
}
