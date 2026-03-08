import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Building, User, FileText, CheckCircle, ChevronLeft, Bus, AlertCircle } from 'lucide-react';
import api from '../../services/api';

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

const FormSection = ({ title, stepLabel, icon: Icon, children }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
      {Icon && <Icon className="text-cyan-600" size={18} />}
      <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
      {stepLabel && (
        <span className="ml-2 px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 text-xs font-medium">{stepLabel}</span>
      )}
    </div>
    <div className="space-y-4">{children}</div>
  </div>
);

const Input = ({ label, required, error, ...props }) => (
  <div className="space-y-1.5">
    {label && (
      <label className="block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
    )}
    <input
      className={`flex h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 ${error ? 'border-red-400' : 'border-slate-200'}`}
      {...props}
    />
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

export default function BusCompanyRegisterPage() {
  const [form, setForm] = useState({ ...FORM_INIT });
  const [processing, setProcessing] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});

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
    api.post('/api/upload/bus-document-public', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((res) => {
        if (res.data?.url) setForm((f) => ({ ...f, [field]: res.data.url }));
        setErrors((e) => ({ ...e, apad_document_url: null }));
        toast.success('Dokumen dimuat naik');
      })
      .catch(() => toast.error('Gagal muat naik dokumen'))
      .finally(() => setUploadingDoc(false));
  };

  const clearError = (field) => setErrors((e) => ({ ...e, [field]: null }));

  const validate = () => {
    const e = {};
    if (!form.name?.trim()) e.name = 'Nama syarikat wajib diisi';
    if (!form.registration_number?.trim()) e.registration_number = 'No. Pendaftaran SSM wajib diisi';
    if (!form.address?.trim()) e.address = 'Alamat berdaftar wajib diisi';
    if (!form.phone?.trim()) e.phone = 'No. telefon wajib diisi';
    if (!form.email?.trim()) e.email = 'Emel rasmi wajib diisi';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Emel tidak sah';
    if (!form.pic_name?.trim()) e.pic_name = 'Nama PIC wajib diisi';
    if (!form.pic_phone?.trim()) e.pic_phone = 'No. telefon PIC wajib diisi';
    if (!form.apad_document_url) e.apad_document_url = 'Sila muat naik salinan Lesen Operator APAD';
    if (!form.akuan) e.akuan = 'Sila sahkan akuan di bawah';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Sila lengkapkan semua medan wajib dan semak maklumat dengan teliti.');
      return;
    }
    setProcessing(true);
    const payload = {
      name: form.name.trim(),
      registration_number: form.registration_number.trim(),
      entity_type: form.entity_type || undefined,
      address: form.address.trim(),
      postcode: form.postcode || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      director_name: form.director_name?.trim() || undefined,
      director_ic_passport: form.director_ic_passport?.trim() || undefined,
      phone: form.phone.trim(),
      email: form.email.trim(),
      pic_name: form.pic_name.trim(),
      pic_phone: form.pic_phone.trim(),
      apad_license_no: form.apad_license_no?.trim() || undefined,
      apad_expiry_date: form.apad_expiry_date || undefined,
      apad_document_url: form.apad_document_url || undefined
    };
    api.post('/api/bus/companies/register', payload)
      .then(() => {
        setSubmitted(true);
        toast.success('Permohonan berjaya dihantar. Admin Bas akan menyemak dan meluluskan.');
      })
      .catch((err) => toast.error(err.response?.data?.detail || 'Permohonan gagal dihantar'))
      .finally(() => setProcessing(false));
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-cyan-50 flex flex-col">
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Link to="/" className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
              <ChevronLeft size={20} />
            </Link>
            <Bus className="text-cyan-600" size={28} />
            <h1 className="text-xl font-bold text-slate-900">Daftar Syarikat Bas</h1>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="text-emerald-600" size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Permohonan Dihantar</h2>
            <p className="text-slate-600 mb-6">
              Syarikat bas anda telah didaftarkan. Admin Bas akan menyemak maklumat dan dokumen, kemudian meluluskan permohonan. Anda akan dihubungi melalui emel jika ada maklumat tambahan diperlukan.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/" className="px-5 py-2.5 rounded-lg bg-cyan-600 text-white font-medium hover:bg-cyan-700">
                Ke Laman Utama
              </Link>
              <Link to="/login" className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50">
                Log Masuk
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-cyan-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/" className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
            <ChevronLeft size={20} />
          </Link>
          <Bus className="text-cyan-600" size={28} />
          <h1 className="text-xl font-bold text-slate-900">Daftar Syarikat Bas</h1>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm mb-6">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <p>
              Sila isi <strong>semua medan dengan teliti</strong>. Medan bertanda <span className="text-red-500">*</span> adalah wajib. Anda boleh isi mengikut susunan mana-mana sebelum hantar.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-8">
            {/* Langkah 1: Maklumat Syarikat */}
            <FormSection title="Langkah 1 — Maklumat Pemilik / Syarikat" stepLabel="1" icon={Building}>
              <Input label="Nama Syarikat" required value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); clearError('name'); }} placeholder="Nama penuh syarikat" error={errors.name} />
              <Input label="No. Pendaftaran SSM" required value={form.registration_number} onChange={(e) => { setForm({ ...form, registration_number: e.target.value }); clearError('registration_number'); }} placeholder="No. SSM" error={errors.registration_number} />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">Jenis Entiti</label>
                <select value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value })} className="flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  {ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <Input label="Alamat Berdaftar" required value={form.address} onChange={(e) => { setForm({ ...form, address: e.target.value }); clearError('address'); }} placeholder="Jalan, bangunan, nombor lot" error={errors.address} />
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
                <Input label="No. Telefon" required value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); clearError('phone'); }} placeholder="No. pejabat" error={errors.phone} />
                <Input label="Emel Rasmi" required type="email" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); clearError('email'); }} placeholder="emel@syarikat.com" error={errors.email} />
              </div>
              <Input label="No. Lesen Operator APAD" value={form.apad_license_no} onChange={(e) => setForm({ ...form, apad_license_no: e.target.value })} placeholder="Nombor lesen" />
              <Input label="Tarikh Tamat Lesen Operator" type="date" value={form.apad_expiry_date} onChange={(e) => setForm({ ...form, apad_expiry_date: e.target.value })} />
            </FormSection>

            <FormSection title="Person In Charge (PIC)" icon={User}>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Nama PIC" required value={form.pic_name} onChange={(e) => { setForm({ ...form, pic_name: e.target.value }); clearError('pic_name'); }} error={errors.pic_name} />
                <Input label="No. Telefon PIC" required value={form.pic_phone} onChange={(e) => { setForm({ ...form, pic_phone: e.target.value }); clearError('pic_phone'); }} error={errors.pic_phone} />
              </div>
            </FormSection>

            {/* Langkah 2: Upload dokumen */}
            <FormSection title="Langkah 2 — Salinan Lesen Operator APAD" stepLabel="2" icon={FileText}>
              <p className="text-sm text-slate-600">Muat naik PDF atau imej (jpg, png, webp). Max 10MB. <span className="text-red-500">*</span></p>
              <div className="flex items-center gap-3 flex-wrap">
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="text-sm" onChange={(e) => handleFileUpload('apad_document_url', e.target.files?.[0])} disabled={uploadingDoc} />
                {form.apad_document_url && <span className="text-emerald-600 text-sm flex items-center gap-1"><CheckCircle size={16} /> Dokumen dilampirkan</span>}
              </div>
              {errors.apad_document_url && <p className="text-xs text-red-500">{errors.apad_document_url}</p>}
            </FormSection>

            {/* Langkah 3: Checklist & Akuan */}
            <FormSection title="Langkah 3 — Checklist & Akuan" stepLabel="3" icon={CheckCircle}>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-center gap-2">{form.apad_document_url ? <CheckCircle className="text-emerald-600" size={18} /> : <span className="w-5 h-5 rounded border border-slate-300 inline-block" />} Lesen Operator APAD</li>
              </ul>
              <label className={`flex items-start gap-3 mt-4 cursor-pointer p-3 rounded-lg border ${errors.akuan ? 'border-red-300 bg-red-50/50' : 'border-slate-200'}`}>
                <input type="checkbox" checked={form.akuan} onChange={(e) => { setForm({ ...form, akuan: e.target.checked }); setErrors((err) => ({ ...err, akuan: null })); }} className="mt-1 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
                <span className="text-sm text-slate-700">Saya mengesahkan semua maklumat adalah benar dan tertakluk kepada peraturan APAD. <span className="text-red-500">*</span></span>
              </label>
              {errors.akuan && <p className="text-xs text-red-500">{errors.akuan}</p>}
            </FormSection>

            <div className="pt-4 border-t border-slate-200">
              <button type="submit" disabled={processing} className="w-full px-6 py-3 rounded-lg bg-cyan-600 text-white font-medium hover:bg-cyan-700 disabled:opacity-60">
                {processing ? 'Menghantar...' : 'Hantar Permohonan'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
