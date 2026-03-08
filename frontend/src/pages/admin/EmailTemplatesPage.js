import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Mail, Plus, Edit, Trash2, Send, X, Save, RefreshCw, FileText, CheckCircle,
} from 'lucide-react';
import api from '../../services/api';
import { HelpManualLink } from '../../components/common';

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

const EmailTemplatesPage = () => {
  const [templates, setTemplates] = useState([]);
  const [keysRef, setKeysRef] = useState([]);
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
  });
  const [testForm, setTestForm] = useState({ template_key: '', to_email: '', variables: {} });

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const [resList, resKeys] = await Promise.all([
        api.get('/api/email-templates'),
        api.get('/api/email-templates/keys').catch(() => ({ data: { keys: [] } })),
      ]);
      setTemplates(resList.data.templates || []);
      setKeysRef(resKeys.data?.keys || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memuatkan template');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

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
    });
    setModalOpen(true);
  };

  const openTest = (t) => {
    setTestForm({
      template_key: t.template_key,
      to_email: '',
      variables: (t.variables || []).reduce((acc, v) => ({ ...acc, [v]: '' }), {}),
    });
    setTestModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.template_key?.trim() || !form.name?.trim() || !form.subject?.trim() || !form.body_html?.trim()) {
      toast.error('Isi template_key, nama, subjek dan body HTML');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/api/email-templates/${editingId}`, {
          name: form.name,
          description: form.description || null,
          subject: form.subject,
          body_html: form.body_html,
          body_text: form.body_text || null,
          variables: form.variables,
        });
        toast.success('Template dikemaskini');
      } else {
        await api.post('/api/email-templates', {
          template_key: form.template_key.trim().toLowerCase().replace(/\s+/g, '_'),
          name: form.name,
          description: form.description || null,
          subject: form.subject,
          body_html: form.body_html,
          body_text: form.body_text || null,
          variables: form.variables,
        });
        toast.success('Template dicipta');
      }
      setModalOpen(false);
      fetchTemplates();
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
      fetchTemplates();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam');
    }
  };

  const handleSendTest = async () => {
    if (!testForm.template_key || !testForm.to_email?.trim()) {
      toast.error('Pilih template dan masukkan e-mel penerima');
      return;
    }
    setSending(true);
    try {
      await api.post('/api/email-templates/send-test', {
        template_key: testForm.template_key,
        to_email: testForm.to_email.trim(),
        variables: testForm.variables || {},
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
    setTestForm((prev) => ({
      ...prev,
      variables: { ...prev.variables, [key]: value },
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 min-w-0 overflow-x-hidden">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-violet-500 flex items-center justify-center text-white shadow-pastel-sm">
              <Mail size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Template E-mel</h1>
              <p className="text-slate-500 text-sm">Urus template e-mel mengikut fungsi (SES / Resend)</p>
              <HelpManualLink sectionId="emel-template" label="Manual bahagian ini" className="mt-1 inline-block" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchTemplates}>
              <RefreshCw size={18} /> Muat Semula
            </Button>
            <Button onClick={openCreate}>
              <Plus size={18} /> Template Baru
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
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
                      Tiada template. Klik &quot;Template Baru&quot; untuk menambah.
                    </td>
                  </tr>
                ) : (
                  templates.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <code className="text-sm bg-slate-100 px-2 py-1 rounded">{t.template_key}</code>
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

        {keysRef.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mt-6 p-4 bg-slate-100/80 rounded-xl border border-slate-200"
          >
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
              <FileText size={18} /> Rujukan kunci template & pembolehubah
            </h3>
            <div className="flex flex-wrap gap-2">
              {keysRef.map((k) => (
                <span key={k.key} className="text-xs bg-white px-2 py-1 rounded border border-slate-200">
                  <code>{k.key}</code>
                  {k.variables?.length ? ` (${k.variables.join(', ')})` : ''}
                </span>
              ))}
            </div>
          </motion.div>
        )}
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
                <textarea
                  value={form.body_html}
                  onChange={(e) => setForm((f) => ({ ...f, body_html: e.target.value }))}
                  placeholder="<p>Assalamualaikum {{parent_name}}, ...</p>"
                  rows={8}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Body teks (pilihan)</label>
                <textarea
                  value={form.body_text}
                  onChange={(e) => setForm((f) => ({ ...f, body_text: e.target.value }))}
                  placeholder="Versi teks sahaja"
                  rows={3}
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
};

export default EmailTemplatesPage;
