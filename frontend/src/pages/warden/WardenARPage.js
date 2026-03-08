/**
 * Paparan AR untuk Warden: tertunggak mengikut blok dan tingkatan.
 * API: GET /api/ar/warden/summary
 */
import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Card, Spinner } from '../../components/common';
import { BarChart3, Building, Layers, RefreshCw, Wallet } from 'lucide-react';

export default function WardenARPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [block, setBlock] = useState('');
  const [tingkatan, setTingkatan] = useState('');

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const params = { year };
      if (block) params.block = block;
      if (tingkatan) params.tingkatan = Number(tingkatan);
      const res = await api.get('/api/ar/warden/summary', { params });
      setData(res.data);
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [year, block, tingkatan]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const years = [year - 1, year, year + 1].filter((y) => y >= 2020);

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="warden-ar-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-heading flex items-center gap-2">
            <BarChart3 className="text-teal-600" size={28} />
            Tertunggak Yuran (AR) – Blok / Tingkatan
          </h1>
          <p className="text-slate-600 mt-1">Ringkasan mengikut blok asrama dan tingkatan</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={block}
            onChange={(e) => setBlock(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">Semua blok</option>
            {(data?.by_block || []).map((b) => (
              <option key={b.block} value={b.block}>{b.block}</option>
            ))}
          </select>
          <select
            value={tingkatan}
            onChange={(e) => setTingkatan(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">Semua tingkatan</option>
            {[1, 2, 3, 4, 5].map((t) => (
              <option key={t} value={t}>Tingkatan {t}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={fetchSummary}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {!data && (
        <Card>
          <p className="text-slate-500 text-center py-8">Tiada data. Pastikan anda mempunyai akses Warden/Bendahari.</p>
        </Card>
      )}

      {data && (
        <>
          <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
            <div className="flex items-center gap-3">
              <Wallet className="text-amber-600" size={28} />
              <div>
                <p className="text-sm text-amber-700 font-medium">Jumlah Tertunggak (tahun {data.year})</p>
                <p className="text-2xl font-bold text-amber-900">RM {(data.total_outstanding || 0).toLocaleString()}</p>
              </div>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Building size={18} /> Mengikut Blok
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-medium text-slate-600">Blok</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-600">Tertunggak (RM)</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-600">Bil. Pelajar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.by_block || []).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-2 px-3">{row.block || '-'}</td>
                        <td className="py-2 px-3 text-right font-medium text-amber-700">
                          {(row.outstanding || 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right">{row.student_count ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Layers size={18} /> Mengikut Tingkatan
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-medium text-slate-600">Tingkatan</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-600">Tertunggak (RM)</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-600">Bil. Pelajar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.by_tingkatan || []).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-2 px-3">{row.tingkatan != null ? `Tingkatan ${row.tingkatan}` : '-'}</td>
                        <td className="py-2 px-3 text-right font-medium text-amber-700">
                          {(row.outstanding || 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right">{row.student_count ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
