import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { MessageCircle, Plus, Edit, Trash2, Upload, X, FileText, Image } from 'lucide-react';
import api from '../../../services/api';

export default function AdminChatboxFAQPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ question: '', answer: '', order: 0 });
  const [saveLoading, setSaveLoading] = useState(false);
  const [uploadingFaqId, setUploadingFaqId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState('');

  const apiError = (err, fallback) => {
    const d = err.response?.data?.detail;
    if (Array.isArray(d)) return d.map((x) => x.msg || x.loc?.join('.')).filter(Boolean).join(', ') || fallback;
    return typeof d === 'string' ? d : fallback;
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/chatbox/faq/admin');
      setItems(r.data.items || []);
    } catch (e) {
      toast.error(apiError(e, 'Gagal muat FAQ'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm({ question: '', answer: '', order: items.length });
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({ question: item.question || '', answer: item.answer || '', order: item.order ?? 0 });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.question.trim()) { toast.error('Soalan wajib diisi'); return; }
    setSaveLoading(true);
    try {
      if (editingId) {
        await api.put(`/api/chatbox/faq/${editingId}`, { question: form.question.trim(), answer: form.answer.trim(), order: form.order });
        toast.success('FAQ dikemaskini');
      } else {
        await api.post('/api/chatbox/faq', { question: form.question.trim(), answer: form.answer.trim(), order: form.order });
        toast.success('FAQ ditambah');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e, 'Gagal simpan'));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Padam FAQ ini?')) return;
    try {
      await api.delete(`/api/chatbox/faq/${id}`);
      toast.success('FAQ dipadam');
      load();
    } catch (e) {
      toast.error(apiError(e, 'Gagal padam'));
    }
  };

  const handleFileSelect = async (faqId, e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type) && !/\.(pdf|jpg|jpeg|png|webp|gif)$/i.test(file.name)) {
      toast.error('Hanya PDF dan gambar (jpg, png, webp, gif) dibenarkan');
      return;
    }
    if (file.size > 10 * 1024 * 1024) { toast.error('Saiz fail maksimum 10MB'); return; }
    setUploadingFaqId(faqId);
    setUploadProgress('Memuat naik...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('faq_id', faqId);
      await api.post('/api/chatbox/faq/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Fail dimuat naik');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Gagal muat naik'));
    } finally {
      setUploadingFaqId(null);
      setUploadProgress('');
      e.target.value = '';
    }
  };

  const removeAttachment = async (faqId, filename) => {
    try {
      await api.delete(`/api/chatbox/faq/${faqId}/attachments/${encodeURIComponent(filename)}`);
      toast.success('Lampiran dipadam');
      load();
    } catch (e) {
      toast.error(apiError(e, 'Gagal padam lampiran'));
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto min-w-0 overflow-x-hidden">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
            <MessageCircle className="text-red-600" size={26} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">FAQ Chatbox</h1>
            <p className="text-sm text-slate-500">Urus soalan lazim untuk tab FAQ dalam chatbox AI. Sokongan PDF & gambar.</p>
          </div>
        </div>
        <button type="button" onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium shadow">
          <Plus size={20} /> Tambah FAQ
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-12 text-center">
          <MessageCircle className="mx-auto text-slate-300 mb-3" size={48} />
          <p className="text-slate-600 mb-4">Tiada FAQ lagi. Klik &quot;Tambah FAQ&quot; untuk mula.</p>
          <button type="button" onClick={openAdd} className="text-red-600 font-medium hover:underline">Tambah FAQ</button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-slate-400">#{item.order}</span>
                    <h3 className="font-semibold text-slate-900 truncate">{item.question}</h3>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2">{item.answer || '—'}</p>
                  {item.attachments?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.attachments.map((att) => (
                        <span key={att.filename} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-700">
                          {att.original_name?.toLowerCase().endsWith('.pdf') ? <FileText size={14} /> : <Image size={14} />}
                          {att.original_name || att.filename}
                          <button type="button" onClick={() => removeAttachment(item.id, att.filename)} className="text-red-500 hover:text-red-700"><X size={14} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <label className="cursor-pointer">
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*" className="hidden" disabled={uploadingFaqId !== null} onChange={(e) => handleFileSelect(item.id, e)} />
                    <span className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700">
                      {uploadingFaqId === item.id ? <span className="animate-pulse">{uploadProgress}</span> : <><Upload size={16} /> Lampiran</>}
                    </span>
                  </label>
                  <button type="button" onClick={() => openEdit(item)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Edit"><Edit size={18} /></button>
                  <button type="button" onClick={() => handleDelete(item.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Padam"><Trash2 size={18} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen bg-black/50" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200"><h2 className="text-lg font-bold text-slate-900">{editingId ? 'Edit FAQ' : 'Tambah FAQ'}</h2></div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Soalan *</label>
                <input type="text" value={form.question} onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))} placeholder="Contoh: Berapa jumlah yuran setahun?" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jawapan</label>
                <textarea value={form.answer} onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))} placeholder="Jawapan ringkas untuk tab FAQ chatbox." rows={4} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Susunan (nombor)</label>
                <input type="number" min={0} value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: parseInt(e.target.value, 10) || 0 }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent" />
                <p className="text-xs text-slate-500 mt-1">Lebih kecil = lebih atas dalam senarai.</p>
              </div>
              {editingId && <p className="text-xs text-slate-500">Lampiran (PDF, gambar) boleh ditambah selepas simpan dengan butang Lampiran pada setiap baris.</p>}
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50">Batal</button>
              <button type="button" onClick={handleSave} disabled={saveLoading} className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium disabled:opacity-50">{saveLoading ? 'Menyimpan...' : editingId ? 'Kemaskini' : 'Tambah'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
