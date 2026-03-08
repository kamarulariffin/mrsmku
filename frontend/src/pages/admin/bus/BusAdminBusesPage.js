import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Bus, Building, Users, Plus, Edit, Trash2, FileText, Shield, ClipboardCheck } from 'lucide-react';
import api, { API_URL } from '../../../services/api';
import { Spinner, Button, Input, Badge } from './BusAdminShared';
import BusAdminModal from './BusAdminModal';

const BUS_CATEGORY_OPTIONS = [
  { value: '', label: 'Pilih jenis' },
  { value: 'persiaran', label: 'Bas Persiaran' },
  { value: 'sekolah', label: 'Bas Sekolah' },
  { value: 'kilang', label: 'Bas Kilang' }
];

const OWNERSHIP_OPTIONS = [
  { value: '', label: 'Pilih status' },
  { value: 'Milik sendiri', label: 'Milik sendiri' },
  { value: 'Sewa', label: 'Sewa' },
  { value: 'Pajakan', label: 'Pajakan' }
];

const PUSPAKOM_RESULT_OPTIONS = [
  { value: '', label: 'Pilih keputusan' },
  { value: 'Lulus', label: 'Lulus' },
  { value: 'Gagal', label: 'Gagal' }
];

const FormSection = ({ title, icon: Icon, children }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
      {Icon && <Icon className="text-cyan-600" size={18} />}
      <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
    </div>
    <div className="space-y-4">{children}</div>
  </div>
);

export default function BusAdminBusesPage() {
  const [companies, setCompanies] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [form, setForm] = useState({
    company_id: '',
    plate_number: '',
    bus_type: 'single_decker',
    total_seats: 44,
    brand: '',
    model: '',
    chassis_no: '',
    engine_no: '',
    year_manufactured: '',
    bus_category: '',
    color: '',
    ownership_status: '',
    operation_start_date: '',
    permit_no: '',
    permit_expiry: '',
    permit_document_url: '',
    puspakom_date: '',
    puspakom_result: '',
    puspakom_document_url: '',
    insurance_company: '',
    insurance_expiry: '',
    insurance_document_url: '',
    geran_document_url: ''
  });

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      api.get('/api/bus/companies'),
      api.get('/api/bus/buses')
    ])
      .then(([cRes, bRes]) => {
        setCompanies(cRes.data);
        setBuses(bRes.data);
      })
      .catch(() => toast.error('Gagal memuatkan data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const openModal = (item = null) => {
    setEditItem(item);
    if (item) {
      setForm({
        company_id: item.company_id,
        plate_number: item.plate_number,
        bus_type: item.bus_type || 'single_decker',
        total_seats: item.total_seats ?? 44,
        brand: item.brand ?? '',
        model: item.model ?? '',
        chassis_no: item.chassis_no ?? '',
        engine_no: item.engine_no ?? '',
        year_manufactured: item.year_manufactured ?? '',
        bus_category: item.bus_category ?? '',
        color: item.color ?? '',
        ownership_status: item.ownership_status ?? '',
        operation_start_date: item.operation_start_date ?? '',
        permit_no: item.permit_no ?? '',
        permit_expiry: item.permit_expiry ?? '',
        permit_document_url: item.permit_document_url ?? '',
        puspakom_date: item.puspakom_date ?? '',
        puspakom_result: item.puspakom_result ?? '',
        puspakom_document_url: item.puspakom_document_url ?? '',
        insurance_company: item.insurance_company ?? '',
        insurance_expiry: item.insurance_expiry ?? '',
        insurance_document_url: item.insurance_document_url ?? '',
        geran_document_url: item.geran_document_url ?? ''
      });
    } else {
      setForm({
        company_id: companies[0]?.id || '',
        plate_number: '',
        bus_type: 'single_decker',
        total_seats: 44,
        brand: '',
        model: '',
        chassis_no: '',
        engine_no: '',
        year_manufactured: '',
        bus_category: '',
        color: '',
        ownership_status: '',
        operation_start_date: '',
        permit_no: '',
        permit_expiry: '',
        permit_document_url: '',
        puspakom_date: '',
        puspakom_result: '',
        puspakom_document_url: '',
        insurance_company: '',
        insurance_expiry: '',
        insurance_document_url: '',
        geran_document_url: ''
      });
    }
    setShowModal(true);
  };

  const handleFileUpload = (field, file) => {
    if (!file) return;
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      toast.error('Hanya PDF atau imej dibenarkan');
      return;
    }
    setUploadingDoc(true);
    const fd = new FormData();
    fd.append('file', file);
    api.post('/api/upload/bus-document', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((res) => {
        if (res.data?.url) setForm((f) => ({ ...f, [field]: res.data.url }));
        toast.success('Dokumen dimuat naik');
      })
      .catch(() => toast.error('Gagal muat naik'))
      .finally(() => setUploadingDoc(false));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setProcessing(true);
    const payload = { ...form };
    if (!payload.year_manufactured) delete payload.year_manufactured;
    else payload.year_manufactured = parseInt(payload.year_manufactured, 10);
    const promise = editItem
      ? api.put(`/api/bus/buses/${editItem.id}`, payload)
      : api.post('/api/bus/buses', payload);
    promise
      .then(() => {
        toast.success(editItem ? 'Bas dikemaskini' : 'Bas ditambah');
        setShowModal(false);
        fetchData();
      })
      .catch((err) => toast.error(err.response?.data?.detail || 'Operasi gagal'))
      .finally(() => setProcessing(false));
  };

  const handleDelete = (id) => {
    if (!window.confirm('Adakah anda pasti ingin memadam bas ini?')) return;
    api.delete(`/api/bus/buses/${id}`)
      .then(() => { toast.success('Bas dipadam'); fetchData(); })
      .catch((err) => toast.error(err.response?.data?.detail || 'Gagal memadam'));
  };

  const expiryStatus = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'expired';
    if (diff <= 30) return 'soon';
    return 'ok';
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Senarai Bas</h1>
          <p className="text-slate-600 mt-1">Urus kenderaan bas: butiran, permit, PUSPAKOM & insurans</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => openModal()} disabled={companies.length === 0}>
          <Plus size={16} className="mr-1" /> Tambah Bas
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {buses.map((bus) => {
          const permitStatus = expiryStatus(bus.permit_expiry);
          const insStatus = expiryStatus(bus.insurance_expiry);
          return (
            <div key={bus.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xl font-bold text-cyan-700">{bus.plate_number}</span>
                <Badge status={bus.is_active ? 'approved' : 'rejected'}>{bus.is_active ? 'Aktif' : 'Tidak Aktif'}</Badge>
              </div>
              <div className="space-y-2 text-sm text-slate-600">
                <p><Building size={14} className="inline mr-2" />{bus.company_name}</p>
                <p><Bus size={14} className="inline mr-2" />{bus.bus_type === 'single_decker' ? 'Single Decker' : 'Double Decker'}{bus.bus_category ? ` • ${bus.bus_category}` : ''}</p>
                <p><Users size={14} className="inline mr-2" />{bus.total_seats} tempat duduk</p>
                {bus.brand && <p className="text-xs text-slate-500">{bus.brand} {bus.model}</p>}
                <div className="flex gap-2 mt-2 flex-wrap">
                  {permitStatus === 'ok' && <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs">Permit OK</span>}
                  {permitStatus === 'soon' && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">Permit hampir tamat</span>}
                  {permitStatus === 'expired' && <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs">Permit tamat</span>}
                  {insStatus === 'ok' && <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs">Insurans OK</span>}
                  {insStatus === 'soon' && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">Insurans hampir tamat</span>}
                  {insStatus === 'expired' && <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs">Insurans tamat</span>}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => openModal(bus)} className="flex-1 px-3 py-1.5 text-sm bg-slate-100 rounded-lg hover:bg-slate-200 flex items-center justify-center gap-1"><Edit size={14} /> Edit</button>
                <button onClick={() => handleDelete(bus.id)} className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
        {buses.length === 0 && (
          <div className="col-span-full p-12 text-center">
            <Bus className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500">Tiada bas berdaftar. Tambah syarikat dahulu di Syarikat Bas.</p>
          </div>
        )}
      </div>

      <BusAdminModal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editItem ? 'Edit Bas' : 'Tambah Bas'}
        onSubmit={handleSubmit}
        submitLabel={editItem ? 'Kemaskini' : 'Simpan'}
        loading={processing}
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Syarikat Bas</label>
          <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500" required>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <FormSection title="Butiran Kenderaan" icon={Bus}>
          <Input label="No. Pendaftaran Bas" value={form.plate_number} onChange={(e) => setForm({ ...form, plate_number: e.target.value.toUpperCase() })} placeholder="e.g. BKK 1234" required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="No. Casis" value={form.chassis_no} onChange={(e) => setForm({ ...form, chassis_no: e.target.value })} />
            <Input label="No. Enjin" value={form.engine_no} onChange={(e) => setForm({ ...form, engine_no: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Jenama" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Scania / Volvo / Hino" />
            <Input label="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Tahun Pembuatan" type="number" value={form.year_manufactured} onChange={(e) => setForm({ ...form, year_manufactured: e.target.value })} placeholder="e.g. 2020" />
            <Input label="Kapasiti Penumpang" type="number" value={form.total_seats} onChange={(e) => setForm({ ...form, total_seats: parseInt(e.target.value, 10) || '' })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Jenis Bas</label>
              <select value={form.bus_category} onChange={(e) => setForm({ ...form, bus_category: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500">
                {BUS_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <Input label="Warna Bas" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Status Milikan</label>
              <select value={form.ownership_status} onChange={(e) => setForm({ ...form, ownership_status: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500">
                {OWNERSHIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <Input label="Tarikh Mula Operasi" type="date" value={form.operation_start_date} onChange={(e) => setForm({ ...form, operation_start_date: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Jenis Bas (Decker)</label>
            <select value={form.bus_type} onChange={(e) => setForm({ ...form, bus_type: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500">
              <option value="single_decker">Single Decker</option>
              <option value="double_decker">Double Decker</option>
            </select>
          </div>
        </FormSection>

        <FormSection title="Pemeriksaan & Permit" icon={ClipboardCheck}>
          <Input label="No. Permit Kenderaan Perkhidmatan Awam" value={form.permit_no} onChange={(e) => setForm({ ...form, permit_no: e.target.value })} />
          <Input label="Tarikh Tamat Permit" type="date" value={form.permit_expiry} onChange={(e) => setForm({ ...form, permit_expiry: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Salinan Permit</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="text-sm" onChange={(e) => handleFileUpload('permit_document_url', e.target.files?.[0])} disabled={uploadingDoc} />
            {form.permit_document_url && <a href={form.permit_document_url.startsWith('http') ? form.permit_document_url : `${API_URL || ''}${form.permit_document_url}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 text-sm ml-2">Lihat</a>}
          </div>
          <Input label="Tarikh Pemeriksaan PUSPAKOM" type="date" value={form.puspakom_date} onChange={(e) => setForm({ ...form, puspakom_date: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Keputusan Pemeriksaan</label>
            <select value={form.puspakom_result} onChange={(e) => setForm({ ...form, puspakom_result: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500">
              {PUSPAKOM_RESULT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Salinan Laporan PUSPAKOM</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="text-sm" onChange={(e) => handleFileUpload('puspakom_document_url', e.target.files?.[0])} disabled={uploadingDoc} />
            {form.puspakom_document_url && <a href={form.puspakom_document_url.startsWith('http') ? form.puspakom_document_url : `${API_URL || ''}${form.puspakom_document_url}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 text-sm ml-2">Lihat</a>}
          </div>
        </FormSection>

        <FormSection title="Polisi Insurans Komersial" icon={Shield}>
          <Input label="Nama Syarikat Insurans" value={form.insurance_company} onChange={(e) => setForm({ ...form, insurance_company: e.target.value })} />
          <Input label="Tarikh Tamat Insurans" type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Salinan Cover Note</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="text-sm" onChange={(e) => handleFileUpload('insurance_document_url', e.target.files?.[0])} disabled={uploadingDoc} />
            {form.insurance_document_url && <a href={form.insurance_document_url.startsWith('http') ? form.insurance_document_url : `${API_URL || ''}${form.insurance_document_url}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 text-sm ml-2">Lihat</a>}
          </div>
        </FormSection>

        <FormSection title="Geran Kenderaan (pilihan)" icon={FileText}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Salinan Geran</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="text-sm" onChange={(e) => handleFileUpload('geran_document_url', e.target.files?.[0])} disabled={uploadingDoc} />
            {form.geran_document_url && <a href={form.geran_document_url.startsWith('http') ? form.geran_document_url : `${API_URL || ''}${form.geran_document_url}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 text-sm ml-2">Lihat</a>}
          </div>
        </FormSection>
      </BusAdminModal>
    </div>
  );
}
