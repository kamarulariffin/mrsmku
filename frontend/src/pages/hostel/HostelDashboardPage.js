/**
 * e-ASRAMA PINTAR - Dashboard Bersepadu (Fasa 7)
 * Semua paparan tarik data terus dari MongoDB; auto-refresh; linked to master records.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Building,
  Users,
  DoorOpen,
  LogOut,
  RefreshCw,
  FileText,
  CheckCircle,
  ArrowRight,
  Clock,
  Shield,
  AlertTriangle,
  Activity,
  Radio,
} from 'lucide-react';
import api from '../../services/api';
import { Card, Spinner } from '../../components/common';
import { toast } from 'sonner';

const AUTO_REFRESH_MS = 60000; // 60s

const KATEGORI_LABEL = {
  lawatan: 'Lawatan',
  pulang_bermalam: 'Pulang Bermalam',
  aktiviti: 'Aktiviti',
  kem_motivasi: 'Kem Motivasi',
  kecemasan: 'Kecemasan',
  sakit: 'Sakit',
  pertandingan: 'Pertandingan',
  program_rasmi: 'Program Rasmi',
};

export default function HostelDashboardPage() {
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);
  const [integration, setIntegration] = useState(null);
  const [disciplineStats, setDisciplineStats] = useState(null);
  const [riskSummary, setRiskSummary] = useState(null);
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        statsRes,
        recordsRes,
        integrationRes,
        disciplineRes,
        riskRes,
        incidentsRes,
      ] = await Promise.all([
        api.get('/api/hostel/stats'),
        api.get('/api/hostel/records').catch(() => ({ data: [] })),
        api.get('/api/hostel/integration-status').catch(() => ({ data: null })),
        api.get('/api/discipline/stats').catch(() => ({ data: null })),
        api.get('/api/risk/summary').catch(() => ({ data: null })),
        api.get('/api/hostel/live-incidents?hours=24&limit=20').catch(() => ({ data: [] })),
      ]);
      setStats(statsRes.data);
      setRecords(Array.isArray(recordsRes.data) ? recordsRes.data.slice(0, 15) : []);
      setIntegration(integrationRes.data || null);
      setDisciplineStats(disciplineRes.data ?? null);
      setRiskSummary(riskRes.data || null);
      setLiveIncidents(Array.isArray(incidentsRes.data) ? incidentsRes.data : []);
      setLastUpdated(new Date());
    } catch (e) {
      toast.error('Gagal memuatkan data dashboard');
      setStats(null);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const t = setInterval(fetchData, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="hostel-dashboard-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-heading flex items-center gap-2">
            <Building className="text-teal-600" size={28} />
            e-Asrama Pintar
          </h1>
          <p className="text-slate-500 mt-1">Dashboard bersepadu — data live dari Pangkalan Data · Auto-refresh setiap 60s</p>
          {lastUpdated && (
            <p className="text-xs text-slate-400 mt-0.5">Kemas kini terakhir: {lastUpdated.toLocaleTimeString('ms-MY')}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData()}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
            title="Muat semula"
          >
            <RefreshCw size={20} />
          </button>
          <Link
            to="/hostel/blocks"
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium"
          >
            Blok Asrama <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* Integration status */}
      {integration?.synced && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
          <CheckCircle size={18} />
          <span>Data disegerakkan dengan MongoDB — {integration.counts?.hostel_records ?? 0} rekod hostel</span>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-pastel-mint rounded-lg">
              <Users className="text-teal-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Jumlah Pelajar</p>
              <p className="text-2xl font-bold text-slate-900">{stats?.total_students ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-100 rounded-lg">
              <DoorOpen className="text-emerald-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Dalam Asrama</p>
              <p className="text-2xl font-bold text-emerald-600">{stats?.in_hostel ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 rounded-lg">
              <LogOut className="text-amber-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Sedang Keluar</p>
              <p className="text-2xl font-bold text-amber-600">{stats?.out_count ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-100 rounded-lg">
              <FileText className="text-slate-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Keluar / Masuk Hari Ini</p>
              <p className="text-lg font-bold text-slate-800">
                {stats?.today_checkouts ?? 0} / {stats?.today_checkins ?? 0}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 rounded-lg">
              <Clock className="text-red-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Lewat Balik</p>
              <p className="text-2xl font-bold text-red-600">{stats?.late_returns_count ?? 0}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Ringkasan modul lain (linked to master) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/admin/discipline" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 rounded-lg">
                <Shield className="text-amber-600" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-500">Disiplin & OLAT</p>
                <p className="text-lg font-bold text-slate-800">
                  {disciplineStats != null ? `${disciplineStats.pending_offences ?? 0} menunggu · ${disciplineStats.total_olat_cases ?? 0} kes OLAT` : '—'}
                </p>
                <p className="text-xs text-teal-600 mt-1">Lihat disiplin →</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link to="/admin/discipline" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-lg">
                <Activity className="text-red-600" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-500">Risiko Disiplin</p>
                <p className="text-lg font-bold text-slate-800">
                  {riskSummary != null ? `Tinggi: ${riskSummary.high ?? 0} · Sederhana: ${riskSummary.medium ?? 0}` : '—'}
                </p>
                <p className="text-xs text-teal-600 mt-1">Lihat risiko →</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* Live Incidents (Fasa 8) */}
      <Card>
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Radio size={20} className="text-teal-600" />
          Aktiviti Terkini (24 jam)
        </h2>
        {liveIncidents.length === 0 ? (
          <p className="text-slate-500 py-4 text-center">Tiada aktiviti dalam 24 jam lepas</p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {liveIncidents.map((inc) => (
              <li key={`${inc.type}-${inc.id}`} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                <span className={`shrink-0 w-2 h-2 rounded-full ${
                  inc.type === 'movement' ? 'bg-emerald-500' :
                  inc.type === 'offence' ? 'bg-amber-500' :
                  inc.type === 'olat' ? 'bg-red-500' : 'bg-orange-500'
                }`} />
                <div className="min-w-0 flex-1">
                  <Link to={inc.link || '#'} className="text-sm font-medium text-slate-800 hover:text-teal-600 truncate block">
                    {inc.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {inc.at ? new Date(inc.at).toLocaleString('ms-MY') : ''}
                    {inc.meta?.is_late_return && ' · Lewat balik'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Recent records */}
      <Card>
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <FileText size={20} />
          Rekod Terkini (live)
        </h2>
        {records.length === 0 ? (
          <p className="text-slate-500 py-6 text-center">Tiada rekod hostel lagi</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 text-left">
                  <th className="py-2 pr-4">Pelajar</th>
                  <th className="py-2 pr-4">Jenis</th>
                  <th className="py-2 pr-4">Kategori</th>
                  <th className="py-2 pr-4">Tarikh Keluar</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-4 font-medium">{r.student_name || '-'}</td>
                    <td className="py-2 pr-4">{r.check_type === 'keluar' ? 'Keluar' : r.check_type === 'masuk' ? 'Masuk' : r.check_type || '-'}</td>
                    <td className="py-2 pr-4">{KATEGORI_LABEL[r.kategori] || r.kategori || '-'}</td>
                    <td className="py-2 pr-4 text-slate-600">{r.tarikh_keluar ? new Date(r.tarikh_keluar).toLocaleString('ms-MY') : '-'}</td>
                    <td className="py-2 pr-4">
                      {r.actual_return ? (
                        <span className="text-emerald-600">Masuk</span>
                      ) : r.check_type === 'keluar' ? (
                        <span className="text-amber-600">Keluar</span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
