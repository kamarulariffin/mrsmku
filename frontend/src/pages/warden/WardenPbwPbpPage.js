/**
 * Jadual PBW/PBP (Pulang Bermalam Wajib / Pulang Bermalam Pilihan)
 * Warden tetapkan tarikh ikut pekeliling dan jadual asrama.
 * Berkait dengan borang permohonan keluar bermalam (hostel/permohonan).
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Calendar, Plus, X, Edit2, Trash2, FileText, ChevronLeft, ChevronRight,
} from 'lucide-react';
import api from '../../services/api';
import { Card, Button, Input } from '../../components/common';
import { formatDateDMY } from '../../constants/hostel';

const TYPE_LABELS = { pbw: 'Pulang Bermalam Wajib (PBW)', pbp: 'Pulang Bermalam Pilihan (PBP)' };
const TYPE_BADGE = { pbw: 'bg-amber-100 text-amber-800 border-amber-200', pbp: 'bg-teal-100 text-teal-800 border-teal-200' };

export default function WardenPbwPbpPage() {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    type: 'pbw',
    label: '',
    start_date: '',
    end_date: '',
    description: '',
  });

  const fetchPeriods = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/hostel/pbw-pbp-periods', { params: { year } });
      setPeriods(res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memuatkan jadual PBW/PBP');
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPeriods();
  }, [year]);

  const openAdd = () => {
    setEditing(null);
    const today = new Date().toISOString().slice(0, 10);
    setForm({ type: 'pbw', label: '', start_date: today, end_date: today, description: '' });
    setShowForm(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      type: p.type,
      label: p.label,
      start_date: p.start_date,
      end_date: p.end_date,
      description: p.description || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.label.trim()) {
      toast.error('Sila isi label (contoh: PBW CNY)');
      return;
    }
    if (form.start_date > form.end_date) {
      toast.error('Tarikh mula tidak boleh lewat daripada tarikh tamat');
      return;
    }
    try {
      if (editing) {
        await api.put(`/api/hostel/pbw-pbp-periods/${editing.id}`, form);
        toast.success('Jadual dikemaskini');
      } else {
        await api.post('/api/hostel/pbw-pbp-periods', form);
        toast.success('Jadual PBW/PBP ditambah');
      }
      setShowForm(false);
      fetchPeriods();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Padam tempoh ini dari jadual?')) return;
    try {
      await api.delete(`/api/hostel/pbw-pbp-periods/${id}`);
      toast.success('Tempoh dipadam');
      fetchPeriods();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam');
    }
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="warden-pbw-pbp-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-heading flex items-center gap-2">
            <Calendar className="text-teal-600" size={28} />
            Jadual PBW / PBP
          </h1>
          <p className="text-slate-500 mt-1">
            Tetapkan tarikh Pulang Bermalam Wajib (PBW) dan Pulang Bermalam Pilihan (PBP) ikut pekeliling dan jadual asrama. 
            Maklumat ini dipaparkan pada borang permohonan keluar bermalam (ibu bapa/pelajar).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="min-w-[44px] min-h-[44px] p-2 rounded inline-flex items-center justify-center hover:bg-slate-100"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-3 py-1 font-semibold text-slate-700 min-w-[4rem] text-center">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              className="min-w-[44px] min-h-[44px] p-2 rounded inline-flex items-center justify-center hover:bg-slate-100"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <Button onClick={openAdd}>
            <Plus size={18} /> Tambah Tempoh
          </Button>
        </div>
      </div>

      <Card className="p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-200 border-t-teal-500" />
          </div>
        ) : periods.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>Tiada jadual PBW/PBP untuk tahun {year}.</p>
            <p className="text-sm mt-1">Klik &quot;Tambah Tempoh&quot; untuk menambah (contoh: PBW CNY 14–22 Feb 2026).</p>
            <Button className="mt-4" onClick={openAdd}><Plus size={18} /> Tambah Tempoh</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 text-left">
                  <th className="py-3 px-2">Jenis</th>
                  <th className="py-3 px-2">Label</th>
                  <th className="py-3 px-2">Tarikh Mula</th>
                  <th className="py-3 px-2">Tarikh Tamat</th>
                  <th className="py-3 px-2">Keterangan</th>
                  <th className="py-3 px-2 w-24">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-3 px-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${TYPE_BADGE[p.type] || 'bg-slate-100 text-slate-700'}`}>
                        {TYPE_LABELS[p.type] || p.type}
                      </span>
                    </td>
                    <td className="py-3 px-2 font-medium">{p.label}</td>
                    <td className="py-3 px-2">{formatDateDMY(p.start_date)}</td>
                    <td className="py-3 px-2">{formatDateDMY(p.end_date)}</td>
                    <td className="py-3 px-2 text-slate-500 max-w-xs truncate">{p.description || '–'}</td>
                    <td className="py-3 px-2">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openEdit(p)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg" title="Edit">
                          <Edit2 size={16} />
                        </button>
                        <button type="button" onClick={() => handleDelete(p.id)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Padam">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={() => setShowForm(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-4 text-white">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{editing ? 'Edit Tempoh PBW/PBP' : 'Tambah Tempoh PBW/PBP'}</h2>
                <button type="button" onClick={() => setShowForm(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg"><X size={20} /></button>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jenis</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="pbw">Pulang Bermalam Wajib (PBW)</option>
                  <option value="pbp">Pulang Bermalam Pilihan (PBP)</option>
                </select>
              </div>
              <Input
                label="Label (contoh: PBW CNY, PBP Hujung Minggu)"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="PBW CNY"
                required
              />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Tarikh Mula" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} required />
                <Input label="Tarikh Tamat" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Keterangan (pilihan)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
                  rows={2}
                  placeholder="Rujuk surat pekeliling..."
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
                <Button type="submit">{editing ? 'Simpan' : 'Tambah'}</Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
