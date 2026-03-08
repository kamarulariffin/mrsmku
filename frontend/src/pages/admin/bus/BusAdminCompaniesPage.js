import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Building, Plus, Edit, Trash2, User, FileText, CheckCircle, ChevronLeft } from 'lucide-react';
import api, { API_URL } from '../../../services/api';
import { Spinner, Button, Input, Badge } from './BusAdminShared';
import BusAdminModal from './BusAdminModal';

const NEGERI_OPTIONS = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis',
  'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya'
];

const ENTITY_OPTIONS = [
  { value: '', label: 'Pilih jenis entiti' },
  { value: 'Sdn Bhd', label: 'Sdn Bhd' },
  { value: 'Enterprise', label: 'Enterprise' },
  { value: 'Partnership', label: 'Partnership' },
  { value: 'Lain-lain', label: 'Lain-lain' }
];

const STATUS_FILTERS = [
  { value: '', label: 'Semua' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Lulus' },
  { value: 'rejected', label: 'Ditolak' },
  { value: 'need_documents', label: 'Perlu Dokumen' }
];

const FORM_INIT = {
  name: '',
  registration_number: '',
  entity_type: '',
  address: '',
  postcode: '',
  city: '',
  state: '',
  director_name: '',
  director_ic_passport: '',
  phone: '',
  email: '',
  pic_name: '',
  pic_phone: '',
  apad_license_no: '',
  apad_expiry_date: '',
  apad_document_url: '',
  akuan: false
};

const FormSection = ({ title, icon: Icon, children }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
      {Icon && <Icon className="text-cyan-600" size={18} />}
      <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
    </div>
    <div className="space-y-4">{children}</div>
  </div>
);

function ProgressBar({ currentStep, totalSteps }) {
  const pct = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
  return (
    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
      <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function BusAdminCompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [form, setForm] = useState({ ...FORM_INIT });
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveStatus, setApproveStatus] = useState('approved');
  const [approveNotes, setApproveNotes] = useState('');
  const [approveLoading, setApproveLoading] = useState(false);

  const fetchCompanies = () => {
    setLoading(true);
    const params = statusFilter ? { application_status: statusFilter } : {};
    api.get('/api/bus/companies', { params })
      .then((res) => setCompanies(res.data))
      .catch(() => toast.error('Gagal memuatkan syarikat'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCompanies();
  }, [statusFilter]);

  const openModal = (item = null) => {
    setEditItem(item);
    setWizardStep(1);
    if (item) {
      setForm({
        name: item.name ?? '',
        registration_number: item.registration_number ?? '',
        entity_type: item.entity_type ?? '',
        address: item.address ?? '',
        postcode: item.postcode ?? '',
        city: item.city ?? '',
        state: item.state ?? '',
        director_name: item.director_name ?? '',
        director_ic_passport: item.director_ic_passport ?? '',
        phone: item.phone ?? '',
        email: item.email ?? '',
        pic_name: item.pic_name ?? '',
        pic_phone: item.pic_phone ?? '',
        apad_license_no: item.apad_license_no ?? '',
        apad_expiry_date: item.apad_expiry_date ?? '',
        apad_document_url: item.apad_document_url ?? '',
        akuan: true
      });
    } else {
      setForm({ ...FORM_INIT });
    }
    setShowModal(true);
  };

  const handleFileUpload = (field, file) => {
    if (!file) return;
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      toast.error('Hanya PDF atau imej (jpg, png, webp) dibenarkan');
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
      .catch(() => toast.error('Gagal muat naik dokumen'))
      .finally(() => setUploadingDoc(false));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!editItem && wizardStep < 3) {
      setWizardStep((s) => s + 1);
      return;
    }
    if (!editItem && wizardStep === 3 && !form.akuan) {
      toast.error('Sila sahkan akuan terlebih dahulu');
      return;
    }
    setProcessing(true);
    const payload = {
      name: form.name,
      registration_number: form.registration_number,
      entity_type: form.entity_type || undefined,
      address: form.address,
      postcode: form.postcode || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      director_name: form.director_name || undefined,
      director_ic_passport: form.director_ic_passport || undefined,
      phone: form.phone,
      email: form.email,
      pic_name: form.pic_name,
      pic_phone: form.pic_phone,
      apad_license_no: form.apad_license_no || undefined,
      apad_expiry_date: form.apad_expiry_date || undefined,
      apad_document_url: form.apad_document_url || undefined
    };
    const promise = editItem
      ? api.put(`/api/bus/companies/${editItem.id}`, payload)
      : api.post('/api/bus/companies', payload);
    promise
      .then(() => {
        toast.success(editItem ? 'Syarikat dikemaskini' : 'Permohonan syarikat dihantar');
        setShowModal(false);
        fetchCompanies();
      })
      .catch((err) => toast.error(err.response?.data?.detail || 'Operasi gagal'))
      .finally(() => setProcessing(false));
  };

  const openApprove = (company, status) => {
    setApproveTarget(company);
    setApproveStatus(status);
    setApproveNotes(company.officer_notes || '');
    setShowApproveModal(true);
  };

  const submitApprove = () => {
    if (!approveTarget) return;
    setApproveLoading(true);
    api.patch(`/api/bus/companies/${approveTarget.id}/approve`, {
      application_status: approveStatus,
      officer_notes: approveNotes || undefined
    })
      .then(() => {
        toast.success(approveStatus === 'approved' ? 'Syarikat diluluskan' : approveStatus === 'rejected' ? 'Permohonan ditolak' : 'Status dikemaskini');
        setShowApproveModal(false);
        fetchCompanies();
      })
      .catch((err) => toast.error(err.response?.data?.detail || 'Gagal'))
      .finally(() => setApproveLoading(false));
  };

  const handleDelete = (id) => {
    if (!window.confirm('Adakah anda pasti ingin memadam syarikat ini?')) return;
    api.delete(`/api/bus/companies/${id}`)
      .then(() => {
        toast.success('Syarikat dipadam');
        fetchCompanies();
      })
      .catch((err) => toast.error(err.response?.data?.detail || 'Gagal memadam'));
  };

  const statusLabel = (s) => ({ pending: 'Pending', approved: 'Lulus', rejected: 'Ditolak', need_documents: 'Perlu Dokumen' }[s] || s);
  const isCreateWizard = !editItem && showModal;
  const totalWizardSteps = 3;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Syarikat Bas</h1>
          <p className="text-slate-600 mt-1">Urus permohonan dan senarai syarikat bas</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => openModal()}>
          <Plus size={16} className="mr-1" /> Tambah Syarikat
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value || 'all'}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === value ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="divide-y divide-slate-100">
          {companies.map((company) => (
            <div key={company.id} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center">
                    <Building className="text-cyan-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{company.name}</h3>
                    <p className="text-sm text-slate-500">Reg: {company.registration_number} | PIC: {company.pic_name}</p>
                    {company.address && (
                      <p className="text-xs text-slate-500 mt-1">
                        {[company.address, company.postcode, company.city, company.state].filter(Boolean).join(', ')}
                      </p>
                    )}
                    <div className="flex gap-4 mt-1 text-xs text-slate-500">
                      <span>{company.total_buses} bas</span>
                      <span>{company.total_routes} routes</span>
                    </div>
                    {company.officer_notes && (
                      <p className="text-xs text-slate-600 mt-1 italic">Catatan: {company.officer_notes}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge status={company.application_status || (company.is_verified ? 'approved' : 'pending')}>
                    {statusLabel(company.application_status || (company.is_verified ? 'approved' : 'pending'))}
                  </Badge>
                  {(company.application_status === 'pending' || company.application_status === 'need_documents') && (
                    <>
                      <Button variant="primary" size="sm" onClick={() => openApprove(company, 'approved')}>Lulus</Button>
                      <Button variant="outline" size="sm" onClick={() => openApprove(company, 'need_documents')}>Perlu Dokumen</Button>
                      <Button variant="danger" size="sm" onClick={() => openApprove(company, 'rejected')}>Tolak</Button>
                    </>
                  )}
                  <button onClick={() => openModal(company)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"><Edit size={16} /></button>
                  <button onClick={() => handleDelete(company.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
          {companies.length === 0 && (
            <div className="p-12 text-center">
              <Building className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500">Tiada syarikat dalam filter ini</p>
            </div>
          )}
        </div>
      </div>

      <BusAdminModal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editItem ? 'Edit Syarikat' : (isCreateWizard ? `Pendaftaran Syarikat (Langkah ${wizardStep}/${totalWizardSteps})` : 'Tambah Syarikat')}
        onSubmit={handleSubmit}
        submitLabel={editItem ? 'Kemaskini' : (wizardStep < totalWizardSteps ? 'Seterusnya' : 'Hantar Permohonan')}
        loading={processing}
      >
        {isCreateWizard && (
          <div className="mb-4">
            <ProgressBar currentStep={wizardStep} totalSteps={totalWizardSteps} />
            <p className="text-xs text-slate-500 mt-1">Langkah {wizardStep} daripada {totalWizardSteps}</p>
          </div>
        )}

        {(editItem || wizardStep === 1) && (
          <>
            <FormSection title="Maklumat Pemilik / Syarikat" icon={Building}>
              <Input label="Nama Syarikat" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama penuh syarikat" required />
              <Input label="No. Pendaftaran SSM" value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} placeholder="No. SSM" required />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">Jenis Entiti</label>
                <select value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value })} className="flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  {ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <Input label="Alamat Berdaftar" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Jalan, bangunan, nombor lot" required />
              <div className="grid grid-cols-3 gap-4">
                <Input label="Poskod" value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value.replace(/\D/g, '').slice(0, 5) })} placeholder="e.g. 26600" maxLength={5} />
                <Input label="Bandar" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Bandar" />
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Negeri</label>
                  <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="">Pilih negeri</option>
                    {NEGERI_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <Input label="Nama Pengarah / Pemilik" value={form.director_name} onChange={(e) => setForm({ ...form, director_name: e.target.value })} placeholder="Nama penuh" />
              <Input label="No. IC / Passport" value={form.director_ic_passport} onChange={(e) => setForm({ ...form, director_ic_passport: e.target.value })} placeholder="Tanpa dash" />
              <div className="grid grid-cols-2 gap-4">
                <Input label="No. Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="No. pejabat" required />
                <Input label="Emel Rasmi" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="emel@syarikat.com" required />
              </div>
              <Input label="No. Lesen Operator APAD" value={form.apad_license_no} onChange={(e) => setForm({ ...form, apad_license_no: e.target.value })} placeholder="Nombor lesen" />
              <Input label="Tarikh Tamat Lesen Operator" type="date" value={form.apad_expiry_date} onChange={(e) => setForm({ ...form, apad_expiry_date: e.target.value })} />
            </FormSection>
            <FormSection title="Person In Charge" icon={User}>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Nama PIC" value={form.pic_name} onChange={(e) => setForm({ ...form, pic_name: e.target.value })} required />
                <Input label="No. Telefon PIC" value={form.pic_phone} onChange={(e) => setForm({ ...form, pic_phone: e.target.value })} required />
              </div>
            </FormSection>
          </>
        )}

        {isCreateWizard && wizardStep >= 2 && (
          <>
            <FormSection title="Salinan Lesen Operator APAD" icon={FileText}>
              <p className="text-sm text-slate-600">Muat naik PDF atau imej (jpg, png, webp). Max 10MB.</p>
              <div className="flex items-center gap-3">
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="text-sm" onChange={(e) => handleFileUpload('apad_document_url', e.target.files?.[0])} disabled={uploadingDoc} />
                {form.apad_document_url && <span className="text-emerald-600 text-sm flex items-center gap-1"><CheckCircle size={16} /> Dokumen dilampirkan</span>}
              </div>
            </FormSection>
          </>
        )}

        {isCreateWizard && wizardStep === 3 && (
          <FormSection title="Checklist & Akuan" icon={CheckCircle}>
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-center gap-2">{form.apad_document_url ? <CheckCircle className="text-emerald-600" size={18} /> : <span className="w-5" />} Lesen Operator APAD</li>
            </ul>
            <label className="flex items-start gap-3 mt-4 cursor-pointer">
              <input type="checkbox" checked={form.akuan} onChange={(e) => setForm({ ...form, akuan: e.target.checked })} className="mt-1 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
              <span className="text-sm text-slate-700">Saya mengesahkan semua maklumat adalah benar dan tertakluk kepada peraturan APAD.</span>
            </label>
          </FormSection>
        )}

        {editItem && (
          <FormSection title="Salinan Lesen Operator APAD" icon={FileText}>
            <div className="flex items-center gap-3">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="text-sm" onChange={(e) => handleFileUpload('apad_document_url', e.target.files?.[0])} disabled={uploadingDoc} />
              {form.apad_document_url && <a href={form.apad_document_url.startsWith('http') ? form.apad_document_url : `${API_URL || ''}${form.apad_document_url}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 text-sm">Lihat dokumen</a>}
            </div>
          </FormSection>
        )}

        {isCreateWizard && wizardStep > 1 && (
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setWizardStep((s) => s - 1)}><ChevronLeft size={16} /> Sebelumnya</Button>
          </div>
        )}
      </BusAdminModal>

      {showApproveModal && approveTarget && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowApproveModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                {approveStatus === 'approved' ? 'Lulus' : approveStatus === 'rejected' ? 'Tolak' : 'Perlu Dokumen'} – {approveTarget.name}
              </h3>
              <div className="space-y-2 mb-4">
                <label className="block text-sm font-medium text-slate-700">Catatan Pegawai</label>
                <textarea value={approveNotes} onChange={(e) => setApproveNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Catatan (pilihan)" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowApproveModal(false)}>Batal</Button>
                <Button variant="primary" loading={approveLoading} onClick={submitApprove}>
                  {approveStatus === 'approved' ? 'Lulus' : approveStatus === 'rejected' ? 'Tolak' : 'Hantar'}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
