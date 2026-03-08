import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { MapPinned, MapPin, ArrowRight, Plus, Edit, Trash2, RotateCcw, MapPinOff } from 'lucide-react';
import api from '../../../services/api';
import { Spinner, Button, Input } from './BusAdminShared';
import BusAdminModal from './BusAdminModal';

export default function BusAdminRoutesPage() {
  const [companies, setCompanies] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [form, setForm] = useState({
    company_id: '',
    name: '',
    origin: 'MRSMKU Kuantan',
    destination: '',
    base_price: 0,
    estimated_duration: '',
    pickup_locations: [],
    drop_off_points: [{ location: '', price: 0, order: 1 }],
    trip_type: 'one_way',
    return_route_id: ''
  });

  const fetchData = () => {
    setLoading(true);
    Promise.all([api.get('/api/bus/companies'), api.get('/api/bus/routes')])
      .then(([cRes, rRes]) => {
        setCompanies(cRes.data);
        setRoutes(rRes.data);
      })
      .catch(() => toast.error('Gagal memuatkan data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openModal = (item = null) => {
    setEditItem(item);
    if (item) {
      setForm({
        ...item,
        pickup_locations: item.pickup_locations || [],
        drop_off_points: (item.drop_off_points && item.drop_off_points.length) ? item.drop_off_points : [{ location: '', price: 0, order: 1 }],
        trip_type: item.trip_type || 'one_way',
        return_route_id: item.return_route_id || ''
      });
    } else {
      setForm({
        company_id: companies[0]?.id || '',
        name: '',
        origin: 'MRSMKU Kuantan',
        destination: '',
        base_price: 0,
        estimated_duration: '',
        pickup_locations: [],
        drop_off_points: [{ location: '', price: 0, order: 1 }],
        trip_type: 'one_way',
        return_route_id: ''
      });
    }
    setShowModal(true);
  };

  const addPickup = () => setForm({ ...form, pickup_locations: [...form.pickup_locations, { location: '', order: form.pickup_locations.length + 1 }] });
  const updatePickup = (idx, field, value) => {
    const u = [...form.pickup_locations];
    u[idx] = { ...u[idx], [field]: field === 'order' ? parseInt(value, 10) || 1 : value };
    setForm({ ...form, pickup_locations: u });
  };
  const removePickup = (idx) => setForm({ ...form, pickup_locations: form.pickup_locations.filter((_, i) => i !== idx) });

  const addDropOff = () => setForm({ ...form, drop_off_points: [...form.drop_off_points, { location: '', price: 0, order: form.drop_off_points.length + 1 }] });
  const updateDropOff = (idx, field, value) => {
    const u = [...form.drop_off_points];
    u[idx] = { ...u[idx], [field]: field === 'price' ? (parseFloat(value) || 0) : value };
    setForm({ ...form, drop_off_points: u });
  };
  const removeDropOff = (idx) => setForm({ ...form, drop_off_points: form.drop_off_points.filter((_, i) => i !== idx) });

  const handleSubmit = (e) => {
    e.preventDefault();
    setProcessing(true);
    const payload = {
      ...form,
      pickup_locations: (form.pickup_locations || []).filter((p) => p.location?.trim()).map((p, i) => ({ location: p.location.trim(), order: i + 1 })),
      drop_off_points: form.drop_off_points.filter((p) => p.location?.trim()).map((p, i) => ({ ...p, order: i + 1 })),
      trip_type: form.trip_type || 'one_way',
      return_route_id: form.trip_type === 'return' && form.return_route_id ? form.return_route_id : ''
    };
    const promise = editItem ? api.put(`/api/bus/routes/${editItem.id}`, payload) : api.post('/api/bus/routes', payload);
    promise
      .then(() => {
        toast.success(editItem ? 'Route dikemaskini' : 'Route ditambah');
        setShowModal(false);
        fetchData();
      })
      .catch((err) => toast.error(err.response?.data?.detail || 'Operasi gagal'))
      .finally(() => setProcessing(false));
  };

  const handleDelete = (id) => {
    if (!window.confirm('Adakah anda pasti ingin memadam route ini?')) return;
    api.delete(`/api/bus/routes/${id}`)
      .then(() => { toast.success('Route dipadam'); fetchData(); })
      .catch((err) => toast.error(err.response?.data?.detail || 'Gagal memadam'));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Routes</h1>
          <p className="text-slate-600 mt-1">Urus laluan dan titik turun</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => openModal()} disabled={companies.length === 0}>
          <Plus size={16} className="mr-1" /> Tambah Route
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {routes.map((route) => (
          <div key={route.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-900">{route.name}</h3>
                <p className="text-sm text-slate-500">{route.company_name}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-cyan-700">RM {route.base_price?.toFixed(2)}</p>
                <p className="text-xs text-slate-500">{route.estimated_duration}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3 text-sm text-slate-700">
              <MapPin size={16} className="text-emerald-600" />
              <span>{route.origin}</span>
              <ArrowRight size={16} className="text-slate-400" />
              <span>{route.destination}</span>
              {route.trip_type === 'return' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">
                  <RotateCcw size={12} /> Return
                  {route.return_route_name && (
                    <span className="text-cyan-700">· Balik: {route.return_route_name}</span>
                  )}
                </span>
              ) : (
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Sehala</span>
              )}
            </div>
            {(route.pickup_locations?.length > 0 || (route.drop_off_points?.length > 0)) && (
              <div className="flex flex-wrap items-start gap-3 text-xs">
                {route.pickup_locations?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-slate-500 font-medium">Pickup:</span>
                    {[route.origin, ...(route.pickup_locations || []).map((p) => p.location)].filter(Boolean).map((loc, i) => (
                      <span key={i} className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded-full">{loc}</span>
                    ))}
                  </div>
                )}
                {(route.drop_off_points || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-slate-500 font-medium">Drop-off:</span>
                    {(route.drop_off_points || []).map((point, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">{point.location} • RM {point.price}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <button onClick={() => openModal(route)} className="px-3 py-1.5 text-sm bg-slate-100 rounded-lg hover:bg-slate-200 flex items-center gap-1"><Edit size={14} /> Edit</button>
              <button onClick={() => handleDelete(route.id)} className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {routes.length === 0 && (
          <div className="p-12 text-center">
            <MapPinned className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500">Tiada route berdaftar</p>
          </div>
        )}
      </div>

      <BusAdminModal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editItem ? 'Edit Route' : 'Tambah Route'}
        onSubmit={handleSubmit}
        submitLabel={editItem ? 'Kemaskini' : 'Simpan'}
        loading={processing}
      >
        <div className="space-y-6">
          {/* Maklumat asas */}
          <section className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2 pb-1 border-b border-slate-100">
              <MapPinned className="w-4 h-4 text-cyan-600" />
              Maklumat Route
            </h4>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Syarikat Bas</label>
              <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-400" required>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Input label="Nama Route" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Kuantan - KL" required />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Harga Asas (RM)" type="number" step="0.01" min="0" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: parseFloat(e.target.value) || 0 })} required />
              <Input label="Anggaran Masa" value={form.estimated_duration} onChange={(e) => setForm({ ...form, estimated_duration: e.target.value })} placeholder="Cth: 3 jam 30 minit" />
            </div>
          </section>

          {/* Lokasi Pickup */}
          <section className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2 pb-1 border-b border-slate-100">
              <MapPin className="w-4 h-4 text-emerald-600" />
              Lokasi Pickup (Ambilan)
            </h4>
            <p className="text-xs text-slate-500">Lokasi di mana bas mengambil penumpang. Asal ialah lokasi pertama; tambah lokasi jika ada perhentian pickup lain.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Lokasi asal (pickup pertama)</label>
                <input type="text" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Cth: MRSMKU Kuantan" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-400 bg-emerald-50/50" required />
              </div>
              {form.pickup_locations.map((point, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <span className="text-slate-400 text-xs w-6">{idx + 2}.</span>
                  <input type="text" value={point.location} onChange={(e) => updatePickup(idx, 'location', e.target.value)} placeholder="Lokasi pickup tambahan" className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 text-sm" />
                  <button type="button" onClick={() => removePickup(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" aria-label="Padam"><Trash2 size={18} /></button>
                </div>
              ))}
              <button type="button" onClick={addPickup} className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/50 flex items-center justify-center gap-2 text-sm font-medium transition-colors">
                <Plus size={18} /> Tambah lokasi pickup
              </button>
            </div>
          </section>

          {/* Lokasi Drop-off */}
          <section className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2 pb-1 border-b border-slate-100">
              <MapPinOff className="w-4 h-4 text-amber-600" />
              Lokasi Drop-off (Titik Turun)
            </h4>
            <p className="text-xs text-slate-500">Lokasi di mana penumpang boleh turun dan harga ke lokasi tersebut. Destinasi utama dan titik perhentian.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Destinasi utama</label>
                <input type="text" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Cth: Kuala Lumpur" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-400 bg-amber-50/50" required />
              </div>
              {form.drop_off_points.map((point, idx) => (
                <div key={idx} className="flex gap-2 items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 text-xs w-6">{idx + 1}.</span>
                  <input type="text" value={point.location} onChange={(e) => updateDropOff(idx, 'location', e.target.value)} placeholder="Nama lokasi" className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-amber-500" />
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-sm">RM</span>
                    <input type="number" step="0.01" min="0" value={point.price} onChange={(e) => updateDropOff(idx, 'price', e.target.value)} className="w-20 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-amber-500" placeholder="0" />
                  </div>
                  <button type="button" onClick={() => removeDropOff(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" aria-label="Padam"><Trash2 size={18} /></button>
                </div>
              ))}
              <button type="button" onClick={addDropOff} className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50/50 flex items-center justify-center gap-2 text-sm font-medium transition-colors">
                <Plus size={18} /> Tambah lokasi drop-off
              </button>
            </div>
          </section>

          {/* Jenis perjalanan */}
          <section className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-800 pb-1 border-b border-slate-100">Jenis perjalanan</h4>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="trip_type" checked={form.trip_type === 'one_way'} onChange={() => setForm({ ...form, trip_type: 'one_way', return_route_id: '' })} className="text-cyan-600" />
                <span className="text-slate-700">Sehala</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="trip_type" checked={form.trip_type === 'return'} onChange={() => setForm({ ...form, trip_type: 'return' })} className="text-cyan-600" />
                <span className="text-slate-700">Return (Pergi & Balik)</span>
              </label>
            </div>
            {form.trip_type === 'return' && (
              <div className="pt-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Route balik</label>
                <select value={form.return_route_id} onChange={(e) => setForm({ ...form, return_route_id: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500">
                  <option value="">Pilih route balik...</option>
                  {routes.filter((r) => r.company_id === form.company_id && r.id !== editItem?.id).map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.origin} → {r.destination})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">Pilih route yang mewakili perjalanan balik (destinasi → asal).</p>
              </div>
            )}
          </section>
        </div>
      </BusAdminModal>
    </div>
  );
}
