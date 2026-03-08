import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Calendar, Plus, Edit, Trash2 } from 'lucide-react';
import api from '../../../services/api';
import { Spinner, Button, Input, Badge } from './BusAdminShared';
import BusAdminModal from './BusAdminModal';

export default function BusAdminTripsPage() {
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [form, setForm] = useState({
    route_id: '',
    bus_id: '',
    departure_date: '',
    departure_time: '',
    return_date: '',
    return_time: '',
    notes: ''
  });

  const fetchData = () => {
    setLoading(true);
    Promise.all([api.get('/api/bus/routes'), api.get('/api/bus/buses'), api.get('/api/bus/trips')])
      .then(([rRes, bRes, tRes]) => {
        setRoutes(rRes.data);
        setBuses(bRes.data);
        setTrips(tRes.data);
      })
      .catch(() => toast.error('Gagal memuatkan data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openModal = (item = null) => {
    setEditItem(item);
    if (item) setForm(item);
    else setForm({ route_id: routes[0]?.id || '', bus_id: buses[0]?.id || '', departure_date: '', departure_time: '', return_date: '', return_time: '', notes: '' });
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setProcessing(true);
    const promise = editItem ? api.put(`/api/bus/trips/${editItem.id}`, form) : api.post('/api/bus/trips', form);
    promise
      .then(() => {
        toast.success(editItem ? 'Trip dikemaskini' : 'Trip ditambah');
        setShowModal(false);
        fetchData();
      })
      .catch((err) => toast.error(err.response?.data?.detail || 'Operasi gagal'))
      .finally(() => setProcessing(false));
  };

  const handleDelete = (id) => {
    if (!window.confirm('Adakah anda pasti ingin memadam trip ini?')) return;
    api.delete(`/api/bus/trips/${id}`)
      .then(() => { toast.success('Trip dipadam'); fetchData(); })
      .catch((err) => toast.error(err.response?.data?.detail || 'Gagal memadam'));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trips</h1>
          <p className="text-slate-600 mt-1">Urus jadual perjalanan bas</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => openModal()} disabled={routes.length === 0 || buses.length === 0}>
          <Plus size={16} className="mr-1" /> Tambah Trip
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {trips.map((trip) => (
          <div key={trip.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{trip.route_name}</h3>
                <p className="text-sm text-slate-500">{trip.company_name} • {trip.bus_plate}</p>
              </div>
              <Badge status={trip.status === 'scheduled' ? 'approved' : trip.status === 'cancelled' ? 'rejected' : 'pending'}>
                {trip.status === 'scheduled' ? 'Dijadualkan' : trip.status === 'cancelled' ? 'Dibatalkan' : trip.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
              <div>
                <p className="text-slate-500">Tarikh Pergi</p>
                <p className="font-medium">{trip.departure_date ? new Date(trip.departure_date).toLocaleDateString('ms-MY') : '-'} {trip.departure_time}</p>
              </div>
              {trip.return_date && (
                <div>
                  <p className="text-slate-500">Tarikh Pulang</p>
                  <p className="font-medium">{new Date(trip.return_date).toLocaleDateString('ms-MY')} {trip.return_time}</p>
                </div>
              )}
              <div>
                <p className="text-slate-500">Tempat Duduk</p>
                <p className="font-medium">{trip.booked_seats ?? 0}/{trip.total_seats ?? 0} ditempah</p>
              </div>
              <div>
                <p className="text-slate-500">Tersedia</p>
                <p className="font-medium text-emerald-600">{trip.available_seats ?? 0} kosong</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => openModal(trip)} className="px-3 py-1.5 text-sm bg-slate-100 rounded-lg hover:bg-slate-200 flex items-center gap-1"><Edit size={14} /> Edit</button>
              <button onClick={() => handleDelete(trip.id)} className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {trips.length === 0 && (
          <div className="p-12 text-center">
            <Calendar className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500">Tiada trip dijadualkan. Tambah route dan bas dahulu.</p>
          </div>
        )}
      </div>

      <BusAdminModal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editItem ? 'Edit Trip' : 'Tambah Trip'}
        onSubmit={handleSubmit}
        submitLabel={editItem ? 'Kemaskini' : 'Simpan'}
        loading={processing}
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Route</label>
          <select value={form.route_id} onChange={(e) => setForm({ ...form, route_id: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500" required>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Bas</label>
          <select value={form.bus_id} onChange={(e) => setForm({ ...form, bus_id: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500" required>
            {buses.map((b) => <option key={b.id} value={b.id}>{b.plate_number} - {b.company_name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tarikh Pergi" type="date" value={form.departure_date} onChange={(e) => setForm({ ...form, departure_date: e.target.value })} required />
          <Input label="Masa Pergi" type="time" value={form.departure_time} onChange={(e) => setForm({ ...form, departure_time: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tarikh Pulang" type="date" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} />
          <Input label="Masa Pulang" type="time" value={form.return_time} onChange={(e) => setForm({ ...form, return_time: e.target.value })} />
        </div>
        <Input label="Nota" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Contoh: Pulang bermalam CNY" />
      </BusAdminModal>
    </div>
  );
}
