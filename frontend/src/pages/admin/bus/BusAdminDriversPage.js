import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Users, Bus } from 'lucide-react';
import api from '../../../services/api';
import { Spinner } from './BusAdminShared';

function getErrorMessage(err, fallback) {
  const d = err?.response?.data?.detail;
  if (Array.isArray(d) && d.length) return d[0].msg || fallback;
  if (typeof d === 'string') return d;
  return fallback;
}

export default function BusAdminDriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      api.get('/api/users', { params: { role: 'bus_driver' } }).then((r) => r.data),
      api.get('/api/bus/buses', { params: { is_active: true } }).then((r) => r.data)
    ])
      .then(([userList, busList]) => {
        const list = Array.isArray(userList) ? userList : (userList?.users ?? []);
        setDrivers(Array.isArray(list) ? list : []);
        setBuses(Array.isArray(busList) ? busList : []);
      })
      .catch((err) => {
        toast.error(getErrorMessage(err, 'Gagal memuatkan data'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleAssignBus = async (driverId, assignedBusId) => {
    setSavingId(driverId);
    try {
      await api.put(`/api/users/${driverId}`, {
        assigned_bus_id: assignedBusId || ''
      });
      toast.success('Penugasan bas dikemaskini');
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Gagal menyimpan'));
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent font-heading">
          Penugasan Driver Bas
        </h1>
        <p className="text-slate-600 mt-1">
          Tugaskan bas kepada driver. Driver akan melihat trip untuk bas yang ditugaskan di dashboard mereka.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Users className="text-cyan-600" size={20} />
            Senarai Driver Bas
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {drivers.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              Tiada akaun Driver Bas. Cipta pengguna dengan role Driver Bas dari Pengurusan Pengguna (Superadmin/Admin) terlebih dahulu.
            </div>
          ) : (
            drivers.map((driver) => (
              <div key={driver.id} className="p-4 flex flex-wrap items-center gap-4 hover:bg-slate-50/50">
                <div className="min-w-[200px]">
                  <p className="font-medium text-slate-900">{driver.full_name}</p>
                  <p className="text-sm text-slate-500">{driver.email}</p>
                </div>
                <div className="flex-1 min-w-[200px] flex items-center gap-2">
                  <Bus size={18} className="text-slate-400 shrink-0" />
                  <select
                    className="flex h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    value={driver.assigned_bus_id || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleAssignBus(driver.id, val);
                    }}
                    disabled={savingId === driver.id}
                  >
                    <option value="">— Tiada / Pilih bas —</option>
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.plate_number} {b.name ? `(${b.name})` : ''}
                      </option>
                    ))}
                  </select>
                  {savingId === driver.id && <Spinner size="sm" />}
                </div>
                {driver.assigned_bus_id && (
                  <span className="text-xs text-slate-500">
                    Bas ditugaskan
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
