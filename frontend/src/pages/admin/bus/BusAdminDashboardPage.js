import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building, Bus, MapPinned, Calendar, Ticket, AlertTriangle, CheckCircle, Users } from 'lucide-react';
import api from '../../../services/api';
import { Spinner } from './BusAdminShared';

function expiryStatus(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { status: 'expired', label: 'Tamat', color: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-800' };
  if (diff <= 30) return { status: 'soon', label: 'Hampir tamat', color: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-800' };
  return { status: 'ok', label: 'Aktif', color: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-800' };
}

export default function BusAdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/bus/stats').then((r) => r.data).catch(() => null),
      api.get('/api/bus/companies').then((r) => r.data).catch(() => []),
      api.get('/api/bus/buses').then((r) => r.data).catch(() => [])
    ]).then(([s, c, b]) => {
      setStats(s);
      setCompanies(c);
      setBuses(b);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const cards = [
    { icon: Building, label: 'Syarikat Bas', path: '/bus-admin/company', value: stats?.total_companies ?? 0, color: 'from-cyan-500 to-blue-600' },
    { icon: Bus, label: 'Senarai Bas', path: '/bus-admin/buses', value: stats?.total_buses ?? 0, color: 'from-blue-500 to-indigo-600' },
    { icon: Users, label: 'Driver Bas', path: '/bus-admin/drivers', value: '—', color: 'from-sky-500 to-cyan-600' },
    { icon: MapPinned, label: 'Routes', path: '/bus-admin/routes', value: stats?.total_routes ?? 0, color: 'from-emerald-500 to-teal-600' },
    { icon: Calendar, label: 'Trips', path: '/bus-admin/trips', value: stats?.active_trips ?? 0, color: 'from-amber-500 to-orange-600' },
    { icon: Ticket, label: 'Tempahan', path: '/bus-admin/bookings', value: stats?.total_bookings ?? 0, color: 'from-violet-500 to-purple-600' }
  ];

  const companyExpiry = companies
    .filter((c) => c.apad_expiry_date)
    .map((c) => ({ ...c, type: 'Lesen Operator', date: c.apad_expiry_date, name: c.name }));
  const busPermit = buses
    .filter((b) => b.permit_expiry)
    .map((b) => ({ ...b, type: 'Permit Bas', date: b.permit_expiry, name: b.plate_number }));
  const busIns = buses
    .filter((b) => b.insurance_expiry)
    .map((b) => ({ ...b, type: 'Insurans', date: b.insurance_expiry, name: b.plate_number }));
  const allExpiry = [...companyExpiry, ...busPermit, ...busIns];
  const expired = allExpiry.filter((e) => expiryStatus(e.date)?.status === 'expired');
  const soon = allExpiry.filter((e) => expiryStatus(e.date)?.status === 'soon');
  const okCount = allExpiry.filter((e) => expiryStatus(e.date)?.status === 'ok').length;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent font-heading">
          Pentadbir Bas — Dashboard
        </h1>
        <p className="text-slate-600 mt-1">Urus modul bas: syarikat, kenderaan, route, trip dan tempahan</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((card) => (
          <Link
            key={card.path}
            to={card.path}
            className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg hover:border-cyan-200 transition-all flex items-center gap-4 group"
          >
            <div className={`p-4 rounded-xl bg-gradient-to-br ${card.color} text-white group-hover:scale-105 transition-transform`}>
              <card.icon size={28} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{card.value}</p>
              <p className="text-sm text-slate-500">{card.label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="text-amber-500" size={22} />
          Status Dokumen — Lesen / Permit / Insurans
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          Hijau = Aktif • Kuning = Hampir tamat (30 hari) • Merah = Tamat
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white">
              <CheckCircle size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-800">{okCount}</p>
              <p className="text-sm text-emerald-700">Aktif</p>
            </div>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-800">{soon.length}</p>
              <p className="text-sm text-amber-700">Hampir tamat</p>
            </div>
          </div>
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-800">{expired.length}</p>
              <p className="text-sm text-red-700">Tamat</p>
            </div>
          </div>
        </div>
        {(soon.length > 0 || expired.length > 0) && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b border-slate-200">
                  <th className="pb-2 pr-4">Jenis</th>
                  <th className="pb-2 pr-4">Nama / Plat</th>
                  <th className="pb-2 pr-4">Tarikh Tamat</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...soon, ...expired].map((row, i) => {
                  const s = expiryStatus(row.date);
                  return (
                    <tr key={`${row.type}-${row.name}-${i}`} className="border-b border-slate-100">
                      <td className="py-2 pr-4">{row.type}</td>
                      <td className="py-2 pr-4">{row.name}</td>
                      <td className="py-2 pr-4">{row.date}</td>
                      <td className="py-2">
                        {s && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {soon.length === 0 && expired.length === 0 && allExpiry.length > 0 && (
          <p className="text-slate-500 text-sm">Semua dokumen berdaftar dalam status aktif.</p>
        )}
        {allExpiry.length === 0 && (
          <p className="text-slate-500 text-sm">Tiada tarikh tamat dokumen didaftarkan. Isi maklumat permit/lesen/insurans di Syarikat Bas dan Senarai Bas.</p>
        )}
      </div>
    </div>
  );
}
