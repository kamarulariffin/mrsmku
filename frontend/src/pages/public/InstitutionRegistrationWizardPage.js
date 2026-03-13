import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Mail, Phone, School, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import api from '../../services/api';
import { Button, Card, Input, Select, Spinner } from '../../components/common';

const STEPS = [
  { key: 'institusi', label: 'Maklumat Institusi' },
  { key: 'wakil', label: 'Wakil & Admin' },
  { key: 'modul', label: 'Pilih Modul' },
  { key: 'semak', label: 'Semak & Hantar' },
];

const INITIAL_FORM = {
  institution_name: '',
  institution_type: 'mrsm',
  state: '',
  estimated_students: '',
  preferred_tenant_code: '',
  contact_person_name: '',
  contact_person_email: '',
  contact_person_phone: '',
  admin_full_name: '',
  admin_email: '',
  admin_phone: '',
  notes: '',
};

const DEFAULT_STATUS_LABELS = {
  submitted: 'Dihantar',
  under_review: 'Dalam Semakan',
  need_info: 'Perlu Maklumat Tambahan',
  approved: 'Diluluskan',
  rejected: 'Ditolak',
};

function StepPill({ idx, activeIdx, label }) {
  const done = idx < activeIdx;
  const active = idx === activeIdx;
  const className = done
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : active
      ? 'bg-cyan-100 text-cyan-700 border-cyan-200'
      : 'bg-slate-100 text-slate-500 border-slate-200';
  return (
    <div className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${className}`}>
      {idx + 1}. {label}
    </div>
  );
}

function inferModuleLabels(defaultMap) {
  const entries = Object.entries(defaultMap || {});
  if (!entries.length) return [];
  return entries.map(([key, meta]) => ({
    key,
    name: meta?.name || key,
    description: meta?.description || '',
    enabled: Boolean(meta?.enabled),
  }));
}

export default function InstitutionRegistrationWizardPage() {
  const navigate = useNavigate();

  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [institutionTypes, setInstitutionTypes] = useState([]);
  const [moduleDefaults, setModuleDefaults] = useState({});
  const [statusLabels, setStatusLabels] = useState(DEFAULT_STATUS_LABELS);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INITIAL_FORM);
  const [selectedModules, setSelectedModules] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  const [statusCheck, setStatusCheck] = useState({ tracking_code: '', email: '' });
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusResult, setStatusResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await api.get('/api/public/institutions/wizard/defaults');
        if (cancelled) return;
        const defaults = res?.data || {};
        const defaultModules = defaults.module_defaults || {};
        setModuleDefaults(defaultModules);
        setInstitutionTypes(defaults.institution_types || []);
        setStatusLabels({ ...DEFAULT_STATUS_LABELS, ...(defaults.status_labels || {}) });
        const enabledByDefault = Object.entries(defaultModules)
          .filter(([, meta]) => Boolean(meta?.enabled))
          .map(([key]) => key);
        setSelectedModules(enabledByDefault);
      } catch (err) {
        if (!cancelled) {
          toast.error(err?.response?.data?.detail || 'Gagal memuatkan tetapan wizard institusi');
        }
      } finally {
        if (!cancelled) setLoadingDefaults(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const modulesUi = useMemo(() => inferModuleLabels(moduleDefaults), [moduleDefaults]);

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleModule = (key) => {
    setSelectedModules((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) {
          toast.error('Sekurang-kurangnya satu modul perlu dipilih');
          return prev;
        }
        return prev.filter((item) => item !== key);
      }
      return [...prev, key];
    });
  };

  const validateStep = () => {
    if (step === 0) {
      if (!form.institution_name.trim()) return 'Nama institusi wajib diisi';
      if (!form.institution_type.trim()) return 'Jenis institusi wajib dipilih';
      return '';
    }
    if (step === 1) {
      if (!form.contact_person_name.trim()) return 'Nama wakil institusi wajib diisi';
      if (!form.contact_person_email.trim()) return 'Emel wakil institusi wajib diisi';
      if (!form.contact_person_phone.trim()) return 'Telefon wakil institusi wajib diisi';
      if (!form.admin_full_name.trim()) return 'Nama admin institusi wajib diisi';
      if (!form.admin_email.trim()) return 'Emel admin institusi wajib diisi';
      if (!form.admin_phone.trim()) return 'Telefon admin institusi wajib diisi';
      return '';
    }
    if (step === 2) {
      if (!selectedModules.length) return 'Sila pilih sekurang-kurangnya satu modul';
      return '';
    }
    return '';
  };

  const goNext = () => {
    const error = validateStep();
    if (error) {
      toast.error(error);
      return;
    }
    setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const goBack = () => setStep((prev) => Math.max(prev - 1, 0));

  const handleSubmit = async () => {
    const error = validateStep();
    if (error) {
      toast.error(error);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        estimated_students: form.estimated_students ? Number(form.estimated_students) : 0,
        requested_modules: selectedModules,
      };
      const res = await api.post('/api/public/institutions/wizard/submit', payload);
      setSubmitResult(res.data || null);
      toast.success('Permohonan berjaya dihantar');
      setStatusCheck((prev) => ({
        ...prev,
        tracking_code: res?.data?.tracking_code || prev.tracking_code,
        email: form.contact_person_email || form.admin_email || prev.email,
      }));
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Gagal menghantar permohonan institusi');
    } finally {
      setSubmitting(false);
    }
  };

  const checkStatus = async () => {
    if (!statusCheck.tracking_code.trim() || !statusCheck.email.trim()) {
      toast.error('Sila isi Tracking Code dan emel');
      return;
    }
    setStatusLoading(true);
    try {
      const res = await api.get(`/api/public/institutions/wizard/status/${encodeURIComponent(statusCheck.tracking_code.trim())}`, {
        params: { email: statusCheck.email.trim() },
      });
      setStatusResult(res.data || null);
      toast.success('Status permohonan berjaya disemak');
    } catch (err) {
      setStatusResult(null);
      toast.error(err?.response?.data?.detail || 'Status permohonan tidak dijumpai');
    } finally {
      setStatusLoading(false);
    }
  };

  if (loadingDefaults) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 via-white to-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-cyan-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-100 text-cyan-700 text-xs font-semibold mb-3">
                <Sparkles size={14} /> Multi-Tenant Onboarding Wizard
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Daftar Sekolah / Institusi Baru</h1>
              <p className="text-sm text-slate-600 mt-1">
                Lengkapkan wizard ini untuk memohon institusi anda menggunakan sistem Smart360.
              </p>
            </div>
            <Button variant="ghost" onClick={() => navigate('/')}>Kembali ke laman utama</Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-5">
            {STEPS.map((item, idx) => (
              <StepPill key={item.key} idx={idx} activeIdx={step} label={item.label} />
            ))}
          </div>
        </Card>

        <Card>
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><School size={18} /> Maklumat Institusi</h2>
              <Input
                label="Nama Institusi"
                placeholder="Contoh: MRSM Kota Bharu"
                value={form.institution_name}
                onChange={(e) => updateForm('institution_name', e.target.value)}
              />
              <div className="grid md:grid-cols-2 gap-4">
                <Select
                  label="Jenis Institusi"
                  value={form.institution_type}
                  onChange={(e) => updateForm('institution_type', e.target.value)}
                >
                  {(institutionTypes.length ? institutionTypes : [
                    { value: 'mrsm', label: 'MRSM' },
                    { value: 'sekolah_menengah', label: 'Sekolah Menengah' },
                    { value: 'sekolah_rendah', label: 'Sekolah Rendah' },
                    { value: 'kolej', label: 'Kolej' },
                    { value: 'lain_lain', label: 'Lain-lain' },
                  ]).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
                <Input
                  label="Negeri"
                  placeholder="Contoh: Pahang"
                  value={form.state}
                  onChange={(e) => updateForm('state', e.target.value)}
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  label="Anggaran Pelajar"
                  type="number"
                  min="0"
                  placeholder="Contoh: 1200"
                  value={form.estimated_students}
                  onChange={(e) => updateForm('estimated_students', e.target.value)}
                />
                <Input
                  label="Cadangan Kod Tenant (opsyenal)"
                  placeholder="Contoh: mrsm-kotabharu"
                  value={form.preferred_tenant_code}
                  onChange={(e) => updateForm('preferred_tenant_code', e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Mail size={18} /> Maklumat Wakil & Admin</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  label="Nama Wakil Institusi"
                  placeholder="Nama penuh wakil"
                  value={form.contact_person_name}
                  onChange={(e) => updateForm('contact_person_name', e.target.value)}
                />
                <Input
                  label="Telefon Wakil"
                  placeholder="Contoh: +60123456789"
                  value={form.contact_person_phone}
                  onChange={(e) => updateForm('contact_person_phone', e.target.value)}
                />
              </div>
              <Input
                label="Emel Wakil"
                type="email"
                placeholder="wakil@institusi.edu.my"
                value={form.contact_person_email}
                onChange={(e) => updateForm('contact_person_email', e.target.value)}
              />
              <div className="h-px bg-slate-200 my-2" />
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  label="Nama Admin Institusi"
                  placeholder="Nama admin pertama"
                  value={form.admin_full_name}
                  onChange={(e) => updateForm('admin_full_name', e.target.value)}
                />
                <Input
                  label="Telefon Admin"
                  placeholder="Contoh: +601155667788"
                  value={form.admin_phone}
                  onChange={(e) => updateForm('admin_phone', e.target.value)}
                />
              </div>
              <Input
                label="Emel Admin"
                type="email"
                placeholder="admin@institusi.edu.my"
                value={form.admin_email}
                onChange={(e) => updateForm('admin_email', e.target.value)}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Building2 size={18} /> Modul Diperlukan</h2>
              <p className="text-sm text-slate-600">Pilih modul yang ingin diaktifkan untuk institusi anda. Anda boleh ubah semula selepas onboarding diluluskan.</p>
              <div className="grid md:grid-cols-2 gap-3">
                {modulesUi.map((item) => {
                  const active = selectedModules.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleModule(item.key)}
                      className={`text-left rounded-xl border p-4 transition-all min-h-[96px] ${active ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-600 mt-1">{item.description}</p>
                        </div>
                        {active ? <CheckCircle2 size={18} className="text-cyan-600 mt-0.5" /> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><ClipboardCheck size={18} /> Semak Sebelum Hantar</h2>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-slate-500">Institusi</p>
                  <p className="font-medium text-slate-900">{form.institution_name || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-500">Jenis</p>
                  <p className="font-medium text-slate-900">{form.institution_type || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-500">Wakil</p>
                  <p className="font-medium text-slate-900">{form.contact_person_name || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-500">Admin Institusi</p>
                  <p className="font-medium text-slate-900">{form.admin_full_name || '-'}</p>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <p className="text-slate-500">Modul Dipilih</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedModules.map((key) => (
                      <span key={key} className="px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 text-xs font-semibold">
                        {moduleDefaults?.[key]?.name || key}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <Input
                label="Catatan Tambahan (opsyenal)"
                placeholder="Contoh: Mahu go-live sebelum sesi akademik baharu"
                value={form.notes}
                onChange={(e) => updateForm('notes', e.target.value)}
              />
              {submitResult ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-800">Permohonan berjaya dihantar</p>
                  <p className="text-sm text-emerald-700 mt-1">Tracking Code: <span className="font-mono">{submitResult.tracking_code}</span></p>
                </div>
              ) : null}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-100">
            <Button variant="ghost" onClick={goBack} disabled={step === 0 || submitting}>
              <ChevronLeft size={16} /> Kembali
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={goNext} disabled={submitting}>
                Seterusnya <ChevronRight size={16} />
              </Button>
            ) : (
              <Button onClick={handleSubmit} loading={submitting}>
                Hantar Permohonan
              </Button>
            )}
          </div>
        </Card>

        <Card className="border-slate-200">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2"><ShieldCheck size={16} /> Semak Status Permohonan</h3>
          <p className="text-sm text-slate-600 mt-1">Masukkan tracking code dan emel yang digunakan semasa pendaftaran.</p>
          <div className="grid md:grid-cols-2 gap-3 mt-4">
            <Input
              label="Tracking Code"
              placeholder="Contoh: INST-20260312-ABC123"
              value={statusCheck.tracking_code}
              onChange={(e) => setStatusCheck((prev) => ({ ...prev, tracking_code: e.target.value }))}
            />
            <Input
              label="Emel"
              type="email"
              placeholder="wakil@institusi.edu.my"
              value={statusCheck.email}
              onChange={(e) => setStatusCheck((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div className="mt-3">
            <Button onClick={checkStatus} loading={statusLoading}>
              <Phone size={16} /> Semak Status
            </Button>
          </div>
          {statusResult ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1 text-sm">
              <p><span className="text-slate-500">Institusi:</span> <span className="font-medium text-slate-900">{statusResult.institution_name || '-'}</span></p>
              <p><span className="text-slate-500">Status:</span> <span className="font-semibold text-cyan-700">{statusLabels[statusResult.status] || statusResult.status}</span></p>
              {statusResult.tenant_code ? (
                <p><span className="text-slate-500">Tenant Code:</span> <span className="font-mono text-slate-900">{statusResult.tenant_code}</span></p>
              ) : null}
              <p><span className="text-slate-500">Catatan Semakan:</span> <span className="text-slate-900">{statusResult.reviewer_notes || 'Tiada catatan'}</span></p>
              {statusResult.registration_url ? (
                <p>
                  <span className="text-slate-500">Link Pendaftaran Ibu Bapa:</span>{' '}
                  <a className="text-cyan-700 hover:text-cyan-900 font-medium underline" href={statusResult.registration_url}>
                    {statusResult.registration_url}
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
