/**
 * Modul E-mel Template Khas Bendahari / Sub Bendahari
 * Urus template e-mel per tingkatan (1–5) dan umum; disegerakkan dengan data pelajar & ibu bapa.
 * Laluan: Menu → E-mel Template
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Mail, Plus, Edit, Trash2, Send, X, Save, RefreshCw, FileText, CheckCircle,
  Users, UserCheck, ArrowLeft, Bell, ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { HelpManualLink } from '../../components/common';

const TINGKATAN_OPTIONS = [
  { value: null, label: 'Umum' },
  { value: 1, label: 'Tingkatan 1' },
  { value: 2, label: 'Tingkatan 2' },
  { value: 3, label: 'Tingkatan 3' },
  { value: 4, label: 'Tingkatan 4' },
  { value: 5, label: 'Tingkatan 5' },
];

const VARIABLE_HINTS = [
  'parent_name', 'child_name', 'total_outstanding', 'children_outstanding',
  'amount', 'receipt_number', 'remaining', 'fee_set_name', 'total_amount', 'items',
];

const Button = ({ children, variant = 'primary', loading, disabled, className = '', ...props }) => {
  const base = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700',
    outline: 'border border-slate-300 text-slate-700 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  };
  return (
    <button className={`${base} ${variants[variant] || variants.primary} ${className}`} disabled={disabled || loading} {...props}>
      {loading ? <span className="animate-spin">⏳</span> : null}
      {children}
    </button>
  );
};

export default function BendahariEmailTemplatesPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(null); // null = Umum, 1-5 = Tingkatan
  const [templates, setTemplates] = useState([]);
  const [keysRef, setKeysRef] = useState([]);
  const [stats, setStats] = useState({ by_tingkatan: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    template_key: '',
    name: '',
    description: '',
    subject: '',
    body_html: '',
    body_text: '',
    variables: [],
    tingkatan: null,
  });
  const [testForm, setTestForm] = useState({ template_key: '', to_email: '', variables: {}, tingkatan: null });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Umum (activeTab null) = hanya template tanpa tingkatan; lain = template untuk tingkatan itu + umum
      const tingkatanParam = activeTab != null ? `?tingkatan=${activeTab}` : '';
      const [resList, resKeys, resStats] = await Promise.all([
        api.get(`/api/email-templates${tingkatanParam}`),
        api.get('/api/email-templates/keys').catch(() => ({ data: { keys: [] } })),
        api.get('/api/email-templates/stats-by-tingkatan').catch(() => ({ data: { by_tingkatan: {} } })),
      ]);
      let list = resList.data.templates || [];
      if (activeTab == null) {
        list = list.filter((t) => t.tingkatan == null || t.tingkatan === undefined);
      }
      setTemplates(list);
      setKeysRef(resKeys.data?.keys || []);
      setStats(resStats.data || { by_tingkatan: {} });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memuatkan data');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      template_key: '',
      name: '',
      description: '',
      subject: '',
      body_html: '',
      body_text: '',
      variables: [],
      tingkatan: activeTab,
    });
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setForm({
      template_key: t.template_key,
      name: t.name,
      description: t.description || '',
      subject: t.subject,
      body_html: t.body_html,
      body_text: t.body_text || '',
      variables: Array.isArray(t.variables) ? t.variables : [],
      tingkatan: t.tingkatan ?? null,
    });
    setModalOpen(true);
  };

  const openTest = (t) => {
    setTestForm({
      template_key: t.template_key,
      to_email: '',
      variables: (t.variables || []).reduce((acc, v) => ({ ...acc, [v]: '' }), {}),
      tingkatan: t.tingkatan ?? activeTab,
    });
    setTestModalOpen(true);
  };

  const insertVariable = (field, varName) => {
    const token = `{{${varName}}}`;
    setForm((f) => ({ ...f, [field]: (f[field] || '') + token }));
  };

  const handleSave = async () => {
    if (!form.template_key?.trim() || !form.name?.trim() || !form.subject?.trim() || !form.body_html?.trim()) {
      toast.error('Isi kunci template, nama, subjek dan body HTML');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        template_key: form.template_key.trim().toLowerCase().replace(/\s+/g, '_'),
        name: form.name,
        description: form.description || null,
        subject: form.subject,
        body_html: form.body_html,
        body_text: form.body_text || null,
        variables: form.variables,
        tingkatan: form.tingkatan ?? undefined,
      };
      if (editingId) {
        await api.put(`/api/email-templates/${editingId}`, {
          name: payload.name,
          description: payload.description,
          subject: payload.subject,
          body_html: payload.body_html,
          body_text: payload.body_text,
          variables: payload.variables,
          tingkatan: payload.tingkatan,
        });
        toast.success('Template dikemaskini');
      } else {
        await api.post('/api/email-templates', payload);
        toast.success('Template dicipta');
      }
      setModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Padam template ini?')) return;
    try {
      await api.delete(`/api/email-templates/${id}`);
      toast.success('Template dipadam');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam');
    }
  };

  const handleSendTest = async () => {
    if (!testForm.template_key || !testForm.to_email?.trim()) {
      toast.error('Masukkan e-mel penerima');
      return;
    }
    setSending(true);
    try {
      await api.post('/api/email-templates/send-test', {
        template_key: testForm.template_key,
        to_email: testForm.to_email.trim(),
        variables: testForm.variables || {},
        tingkatan: testForm.tingkatan ?? undefined,
      });
      toast.success('E-mel ujian dihantar');
      setTestModalOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal hantar e-mel');
    } finally {
      setSending(false);
    }
  };

  const updateVariable = (key, value) => {
    setTestForm((prev) => ({ ...prev, variables: { ...prev.variables, [key]: value } }));
  };

  const byTingkatan = stats.by_tingkatan || {};

  if (loading && templates.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50/30 p-6 min-w-0 overflow-x-hidden">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-2"
          >
            <ArrowLeft size={18} /> Kembali
          </button>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-lg">
                <Mail size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">E-mel Template</h1>
                <p className="text-slate-500 text-sm">Urus template peringatan yuran, pengesahan bayaran, yuran baru mengikut tingkatan. Guna pembolehubah seperti {'{{parent_name}}'}, {'{{total_outstanding}}'}.</p>
                <HelpManualLink sectionId="emel-template" label="Manual: E-mel Template" className="mt-1 inline-block text-teal-600" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => fetchData()}>
                <RefreshCw size={18} /> Muat Semula
              </Button>
              <Button onClick={openCreate}>
                <Plus size={18} /> Template Baru
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Pintasan: Hantar Peringatan (e-mel & push) — butang sebenar ada di halaman AR */}
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl border border-teal-200 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
              <Bell className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Hantar Peringatan (E-mel & Push Notifikasi)</h2>
              <p className="text-sm text-slate-600 mt-0.5">Untuk hantar reminder kepada ibu bapa (e-mel + push FCM + notifikasi dalam app + pautan WhatsApp), gunakan butang <strong>Hantar Peringatan</strong> pada setiap baris pelajar di halaman AR (Akaun Belum Terima). Kandungan e-mel ikut template yang anda set di sini.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/ar-dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors"
          >
            Pergi ke AR – Hantar Peringatan
            <ChevronRight size={18} />
          </button>
        </motion.div>

        {/* Tabs: Umum, Tingkatan 1–5 */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TINGKATAN_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setActiveTab(opt.value)}
              className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === opt.value
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:bg-teal-50/50'
              }`}
            >
              {opt.label}
              {opt.value != null && byTingkatan[String(opt.value)] && (
                <span className="ml-1.5 text-xs opacity-90">
                  ({byTingkatan[String(opt.value)].students} pelajar, {byTingkatan[String(opt.value)].parents} ibu bapa)
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Stats cards for current tab */}
        {activeTab != null && byTingkatan[String(activeTab)] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 gap-4 mb-6"
          >
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-teal-500" />
              <div>
                <p className="text-sm text-slate-500">Pelajar (Tingkatan {activeTab})</p>
                <p className="text-xl font-bold text-slate-800">{byTingkatan[String(activeTab)].students}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <UserCheck className="w-8 h-8 text-emerald-500" />
              <div>
                <p className="text-sm text-slate-500">Ibu bapa (disegerakkan)</p>
                <p className="text-xl font-bold text-slate-800">{byTingkatan[String(activeTab)].parents}</p>
              </div>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Kunci</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Nama</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Subjek</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      Tiada template untuk {activeTab == null ? 'Umum' : `Tingkatan ${activeTab}`}. Klik &quot;Template Baru&quot; untuk menambah.
                    </td>
                  </tr>
                ) : (
                  templates.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <code className="text-sm bg-slate-100 px-2 py-1 rounded">{t.template_key}</code>
                        {t.tingkatan != null && (
                          <span className="ml-1 text-xs text-slate-500">T{t.tingkatan}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{t.name}</td>
                      <td className="py-3 px-4 text-sm text-slate-600 max-w-xs truncate">{t.subject}</td>
                      <td className="py-3 px-4">
                        {t.is_active !== false ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-sm">
                            <CheckCircle size={16} /> Aktif
                          </span>
                        ) : (
                          <span className="text-slate-400 text-sm">Tidak aktif</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" className="!py-1.5 !px-3 text-sm" onClick={() => openTest(t)}>
                            <Send size={14} /> Ujian
                          </Button>
                          <Button variant="outline" className="!py-1.5 !px-3 text-sm" onClick={() => openEdit(t)}>
                            <Edit size={14} /> Edit
                          </Button>
                          <Button variant="danger" className="!py-1.5 !px-3 text-sm" onClick={() => handleDelete(t.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Variable reference */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mt-6 p-4 bg-slate-100/80 rounded-xl border border-slate-200"
        >
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
            <FileText size={18} /> Pembolehubah untuk subjek & badan e-mel
          </h3>
          <p className="text-xs text-slate-500 mb-2">Gunakan format {'{{nama_pembolehubah}}'} dalam subjek atau body. Contoh: {'{{parent_name}}'}, {'{{total_outstanding}}'}.</p>
          <div className="flex flex-wrap gap-2">
            {VARIABLE_HINTS.map((v) => (
              <code key={v} className="text-xs bg-white px-2 py-1 rounded border border-slate-200">{'{{' + v + '}}'}</code>
            ))}
          </div>
          {keysRef.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Rujukan kunci template sistem:</p>
              <div className="flex flex-wrap gap-2">
                {keysRef.map((k) => (
                  <span key={k.key} className="text-xs bg-white px-2 py-1 rounded border border-slate-200">
                    <code>{k.key}</code>
                    {k.variables?.length ? ` (${k.variables.join(', ')})` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Modal Create/Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModalOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">
                {editingId ? 'Edit Template' : 'Template Baru'}
                {form.tingkatan != null && ` (Tingkatan ${form.tingkatan})`}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Template key</label>
                <input
                  type="text"
                  value={form.template_key}
                  onChange={(e) => setForm((f) => ({ ...f, template_key: e.target.value }))}
                  placeholder="cth. fee_reminder"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  disabled={!!editingId}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nama template"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Keterangan (pilihan)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Deskripsi singkat"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subjek e-mel</label>
                <div className="flex flex-wrap gap-1 mb-1">
                  {VARIABLE_HINTS.slice(0, 5).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable('subject', v)}
                      className="text-xs px-2 py-1 bg-teal-100 text-teal-700 rounded hover:bg-teal-200"
                    >
                      {'{{' + v + '}}'}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="Guna {{parent_name}} untuk pembolehubah"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Body HTML</label>
                <div className="flex flex-wrap gap-1 mb-1">
                  {VARIABLE_HINTS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable('body_html', v)}
                      className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                    >
                      {'{{' + v + '}}'}
                    </button>
                  ))}
                </div>
                <textarea
                  value={form.body_html}
                  onChange={(e) => setForm((f) => ({ ...f, body_html: e.target.value }))}
                  placeholder="<p>Assalamualaikum {{parent_name}}, ...</p>"
                  rows={8}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pembolehubah (nama dipisahkan koma)</label>
                <input
                  type="text"
                  value={Array.isArray(form.variables) ? form.variables.join(', ') : ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      variables: e.target.value ? e.target.value.split(',').map((v) => v.trim()).filter(Boolean) : [],
                    }))
                  }
                  placeholder="parent_name, child_name, total_outstanding"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
              <Button loading={saving} onClick={handleSave}>
                <Save size={18} /> Simpan
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal Test Email */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="absolute inset-0 bg-black/50" onClick={() => setTestModalOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-white rounded-2xl shadow-xl max-w-md w-full"
          >
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Hantar E-mel Ujian</h2>
              <button onClick={() => setTestModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Template</label>
                <input
                  type="text"
                  value={testForm.template_key}
                  readOnly
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">E-mel penerima</label>
                <input
                  type="email"
                  value={testForm.to_email}
                  onChange={(e) => setTestForm((f) => ({ ...f, to_email: e.target.value }))}
                  placeholder="email@example.com"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>
              {Object.keys(testForm.variables || {}).length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nilai pembolehubah (pilihan)</label>
                  <div className="space-y-2">
                    {Object.entries(testForm.variables).map(([key]) => (
                      <input
                        key={key}
                        type="text"
                        value={testForm.variables[key] || ''}
                        onChange={(e) => updateVariable(key, e.target.value)}
                        placeholder={`{{${key}}}`}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTestModalOpen(false)}>Batal</Button>
              <Button loading={sending} onClick={handleSendTest}>
                <Send size={18} /> Hantar
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
