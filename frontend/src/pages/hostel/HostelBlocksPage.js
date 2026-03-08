import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Building, Plus, X, Edit, Trash2, Users, User, Layers, BedDouble, Copy, Hash, AlertCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

// Block Form
const BlockForm = ({ block, wardens, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: block?.code || '',
    name: block?.name || '',
    gender: block?.gender || 'lelaki',
    levels: block?.levels || [],
    capacity: block?.capacity || '',
    warden_id: block?.warden_id || '',
    description: block?.description || '',
    is_active: block?.is_active ?? true,
    beds_per_level: block?.beds_per_level?.length ? [...block.beds_per_level] : (block?.levels?.length ? block.levels.map(() => 0) : []),
    beds_per_room: block?.beds_per_room ?? ''
  });
  const [newLevel, setNewLevel] = useState('');

  const addLevel = () => {
    if (newLevel.trim() && !formData.levels.includes(newLevel.trim())) {
      setFormData(prev => ({
        ...prev,
        levels: [...prev.levels, newLevel.trim()],
        beds_per_level: [...(prev.beds_per_level || []), 0]
      }));
      setNewLevel('');
    }
  };

  const removeLevel = (level) => {
    const idx = formData.levels.indexOf(level);
    setFormData(prev => ({
      ...prev,
      levels: prev.levels.filter(l => l !== level),
      beds_per_level: prev.beds_per_level?.filter((_, i) => i !== idx) ?? []
    }));
  };

  const setBedsForLevel = (levelIndex, value) => {
    const v = parseInt(value, 10);
    if (isNaN(v) || v < 0) return;
    setFormData(prev => {
      const arr = [...(prev.beds_per_level || [])];
      while (arr.length <= levelIndex) arr.push(0);
      arr[levelIndex] = v;
      return { ...prev, beds_per_level: arr };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.code || !formData.name) {
      toast.error('Sila lengkapkan maklumat wajib');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        beds_per_level: (formData.beds_per_level || []).length ? formData.beds_per_level : null,
        beds_per_room: formData.beds_per_room !== '' && formData.beds_per_room != null ? parseInt(formData.beds_per_room, 10) : null
      };

      if (block?.id) {
        await api.put(`/api/hostel-blocks/${block.id}`, payload);
        toast.success('Blok berjaya dikemaskini');
      } else {
        await api.post('/api/hostel-blocks', payload);
        toast.success('Blok berjaya dicipta');
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan blok');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-6">
          <h2 className="text-xl font-bold text-slate-900 min-w-0 truncate pr-2">
            {block ? 'Edit Blok Asrama' : 'Blok Asrama Baru'}
          </h2>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg flex-shrink-0" aria-label="Tutup">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kod Blok *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg"
                placeholder="JA, JB, I, dll"
                maxLength={10}
                required
                disabled={!!block}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Gender *</label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg"
              >
                <option value="lelaki">Lelaki</option>
                <option value="perempuan">Perempuan</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nama Blok *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg"
              placeholder="Asrama JA"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kapasiti</label>
              <input
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg"
                placeholder="100"
                min={0}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Warden Default</label>
              <select
                value={formData.warden_id}
                onChange={(e) => setFormData({ ...formData, warden_id: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg"
              >
                <option value="">Pilih Warden</option>
                {wardens.map(w => (
                  <option key={w.id ?? w._id} value={w.id ?? w._id}>{w.full_name ?? w.name ?? '-'}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Levels */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tingkat/Level</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newLevel}
                onChange={(e) => setNewLevel(e.target.value)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg"
                placeholder="Contoh: Tingkat 1"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addLevel())}
              />
              <button
                type="button"
                onClick={addLevel}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
              >
                Tambah
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {formData.levels.map((level, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-pastel-lavender text-violet-700 rounded-full text-sm"
                >
                  {level}
                  <button
                    type="button"
                    onClick={() => removeLevel(level)}
                    className="hover:text-violet-800"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
              {formData.levels.length === 0 && (
                <span className="text-sm text-slate-400">Tiada tingkat ditambah</span>
              )}
            </div>
            {formData.levels.length > 0 && (
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                <p className="text-xs font-medium text-slate-600 mb-2">Jumlah katil per tingkat (untuk jana kod katil)</p>
                {formData.levels.map((level, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-sm text-slate-700 w-28">{level}</span>
                    <input
                      type="number"
                      min={0}
                      value={formData.beds_per_level?.[idx] ?? 0}
                      onChange={(e) => setBedsForLevel(idx, e.target.value)}
                      className="w-24 px-2 py-1.5 border border-slate-200 rounded"
                      placeholder="0"
                    />
                    <span className="text-xs text-slate-500">katil</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Katil per bilik (pilihan)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={formData.beds_per_room}
              onChange={(e) => setFormData({ ...formData, beds_per_room: e.target.value })}
              className="w-full max-w-[120px] px-4 py-2.5 border border-slate-200 rounded-lg"
              placeholder="2"
            />
            <p className="text-xs text-slate-500 mt-1">Digunakan dalam laporan katil kosong jika ditetapkan</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Penerangan</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg"
              rows={2}
              placeholder="Penerangan tambahan..."
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300"
            />
            <label htmlFor="is_active" className="text-sm text-slate-700">Aktif</label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50"
            >
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

// Modal: Jana kod katil
const BedCodesModal = ({ blockId, blockCode, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!blockId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.get(`/api/hostel-blocks/${blockId}/bed-codes`)
      .then(res => setData(res.data))
      .catch(() => setData({ bed_codes: [], total: 0, message: 'Gagal memuatkan kod katil.' }))
      .finally(() => setLoading(false));
  }, [blockId]);

  const copyAll = () => {
    if (!data?.bed_codes?.length) return;
    navigator.clipboard.writeText(data.bed_codes.join('\n'));
    toast.success(`${data.bed_codes.length} kod disalin`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col overflow-x-hidden min-w-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 p-4 border-b shrink-0">
          <h3 className="font-bold text-slate-900 flex items-center gap-2 min-w-0 truncate pr-2">
            <BedDouble size={20} className="flex-shrink-0" /> <span className="truncate">Kod katil – {blockCode}</span>
          </h3>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg flex-shrink-0" aria-label="Tutup"><X size={20} /></button>
        </div>
        <div className="p-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" /></div>
          ) : !data?.bed_codes?.length ? (
            <p className="text-slate-500 text-center py-6">{data?.message || 'Tiada kod katil. Tetapkan jumlah katil per tingkat dalam Edit Blok.'}</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-slate-600">Jumlah: {data.total} kod (format: Blok-Tingkat-Nombor)</p>
                <button onClick={copyAll} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">
                  <Copy size={16} /> Salin semua
                </button>
              </div>
              <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                {data.bed_codes.map((code, i) => (
                  <span key={i} className="px-2 py-1 bg-slate-100 text-slate-800 rounded text-sm font-mono">{code}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// Block Card
const BlockCard = ({ block, onEdit, onDelete, onShowBedCodes, canEdit }) => {
  const [levelDetail, setLevelDetail] = useState(null);
  const [levelDetailLoading, setLevelDetailLoading] = useState(false);
  const [expandedLevelIndex, setExpandedLevelIndex] = useState(null);

  const fetchLevelDetail = async () => {
    if (levelDetail || levelDetailLoading || !block?.id) return;
    setLevelDetailLoading(true);
    try {
      const res = await api.get(`/api/hostel-blocks/${block.id}/level-detail`);
      setLevelDetail(res.data?.levels ?? []);
    } catch {
      setLevelDetail([]);
    } finally {
      setLevelDetailLoading(false);
    }
  };

  const handleLevelClick = (idx) => {
    if (expandedLevelIndex === idx) {
      setExpandedLevelIndex(null);
      return;
    }
    setExpandedLevelIndex(idx);
    if (!levelDetail && !levelDetailLoading) fetchLevelDetail();
  };

  const occupancyPercent = block.capacity 
    ? Math.round((block.student_count / block.capacity) * 100) 
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl border p-5 ${
        block.is_active ? 'border-slate-200' : 'border-red-200 bg-red-50/50'
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold ${
            block.gender === 'lelaki' ? 'bg-blue-500' : 'bg-pink-500'
          }`}>
            {block.code}
          </div>
          <div>
            <h3 className="font-bold text-slate-900">{block.name}</h3>
            <p className="text-sm text-slate-500">{block.gender_display}</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <button
              onClick={() => onShowBedCodes(block)}
              className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              title="Jana kod katil"
            >
              <BedDouble size={16} />
            </button>
            <button
              onClick={() => onEdit(block)}
              className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
            >
              <Edit size={16} />
            </button>
            <button
              onClick={() => onDelete(block)}
              className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-50 p-3 rounded-lg">
          <div className="flex items-center gap-2 text-slate-600 mb-1">
            <Users size={14} />
            <span className="text-xs">Pelajar</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{block.student_count}</p>
        </div>
        <div className="bg-slate-50 p-3 rounded-lg">
          <div className="flex items-center gap-2 text-slate-600 mb-1">
            <Layers size={14} />
            <span className="text-xs">Tingkat</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{block.levels?.length || 0}</p>
        </div>
      </div>

      {/* Capacity Bar */}
      {block.capacity && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-slate-500">Kapasiti</span>
            <span className="font-medium text-slate-700">{block.student_count}/{block.capacity}</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                occupancyPercent > 90 ? 'bg-red-500' :
                occupancyPercent > 70 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(occupancyPercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Tingkat: boleh klik, papar jumlah pelajar & bilik kosong dalam box sama */}
      {block.levels?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">Klik tingkat untuk maklumat</p>
          <div className="flex flex-wrap gap-1">
            {block.levels.map((level, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleLevelClick(idx)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  expandedLevelIndex === idx
                    ? 'bg-teal-600 text-white ring-2 ring-teal-300'
                    : 'bg-pastel-lavender text-violet-700 hover:bg-pastel-lilac'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
          {expandedLevelIndex !== null && (
            <div className="mt-3 p-3 rounded-xl border-2 border-pastel-lilac bg-pastel-lavender/80">
              {levelDetailLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-6 h-6 border-2 border-teal-300 border-t-teal-500 rounded-full animate-spin" />
                </div>
              ) : levelDetail?.length > 0 ? (
                <div className="space-y-3">
                  {levelDetail.map((lev, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg ${i === expandedLevelIndex ? 'bg-white shadow border border-pastel-lilac' : 'bg-white/60'}`}
                    >
                      <p className="font-semibold text-slate-800 text-sm">{lev.level_name}</p>
                      <p className="text-slate-600 text-sm mt-1">
                        Jumlah pelajar: <span className="font-bold text-slate-900">{lev.student_count}</span>
                      </p>
                      {lev.empty_rooms?.length > 0 ? (
                        <p className="text-slate-600 text-sm mt-1">
                          Bilik/Katil kosong:{' '}
                          <span className="flex flex-wrap gap-1 mt-1">
                            {lev.empty_rooms.map((r) => (
                              <span
                                key={r.room}
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-medium"
                                title={`${r.occupants}/${r.capacity} (${r.empty_beds} katil kosong)`}
                              >
                                Bilik/Katil {r.room} ({r.empty_beds})
                              </span>
                            ))}
                          </span>
                        </p>
                      ) : (
                        <p className="text-slate-500 text-sm mt-1">Tiada bilik/katil kosong di tingkat ini.</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm py-2">Tiada data tingkat.</p>
              )}
            </div>
          )}
        </div>
      )}
      {block.bed_codes_count != null && block.bed_codes_count > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-slate-600">
          <Hash size={12} />
          <span>{block.bed_codes_count} kod katil</span>
        </div>
      )}

      {/* Warden */}
      {block.warden_name && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-sm">
          <User size={14} className="text-slate-400" />
          <span className="text-slate-600">Warden: {block.warden_name}</span>
        </div>
      )}

      {/* Status */}
      {!block.is_active && (
        <div className="mt-3 flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle size={14} />
          Tidak Aktif
        </div>
      )}
    </motion.div>
  );
};

// Main Page
export const HostelBlocksPage = () => {
  const auth = useAuth();
  const user = auth?.user;
  const [loading, setLoading] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [wardens, setWardens] = useState([]);
  const [stats, setStats] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editBlock, setEditBlock] = useState(null);
  const [bedCodesBlock, setBedCodesBlock] = useState(null);
  const [filterGender, setFilterGender] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [blocksRes, wardensRes, statsRes] = await Promise.all([
        api.get('/api/hostel-blocks'),
        api.get('/api/warden/list'),
        api.get('/api/hostel-blocks/stats/overview')
      ]);
      setBlocks(blocksRes.data?.blocks ?? []);
      setWardens(Array.isArray(wardensRes.data?.wardens) ? wardensRes.data.wardens : []);
      setStats(statsRes.data ?? null);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (block) => {
    if (!window.confirm(`Padam blok ${block.code}?`)) return;
    try {
      await api.delete(`/api/hostel-blocks/${block.id}`);
      toast.success('Blok berjaya dipadam');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam blok');
    }
  };

  const canEdit = ['superadmin', 'warden', 'admin'].includes(user?.role);

  const filteredBlocks = filterGender 
    ? blocks?.filter(b => b.gender === filterGender) || []
    : blocks || [];

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="hostel-blocks-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Blok Asrama</h1>
          <p className="text-slate-600">Pengurusan blok dan tingkat asrama</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditBlock(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700"
            data-testid="add-block-btn"
          >
            <Plus size={20} />
            Tambah Blok
          </button>
        )}
      </div>

      {/* Stats */}
      {stats?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-sm text-slate-500">Jumlah Blok</p>
            <p className="text-2xl font-bold text-slate-900">{stats.summary.total_blocks}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-sm text-slate-500">Jumlah Pelajar</p>
            <p className="text-2xl font-bold text-slate-900">{stats.summary.total_students}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-blue-100">
            <p className="text-sm text-slate-500">Jumlah Lelaki</p>
            <p className="text-2xl font-bold text-blue-700">{stats.summary.total_male ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-pink-100">
            <p className="text-sm text-slate-500">Jumlah Perempuan</p>
            <p className="text-2xl font-bold text-pink-700">{stats.summary.total_female ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-sm text-slate-500">Jumlah Kapasiti</p>
            <p className="text-2xl font-bold text-slate-900">{stats.summary.total_capacity ?? '-'}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-sm text-slate-500">Kadar Penghunian</p>
            <p className="text-2xl font-bold text-slate-900">{stats.summary.overall_occupancy}%</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={filterGender}
          onChange={(e) => setFilterGender(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-lg bg-white"
        >
          <option value="">Semua Gender</option>
          <option value="lelaki">Lelaki</option>
          <option value="perempuan">Perempuan</option>
        </select>
      </div>

      {/* Blocks Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
        </div>
      ) : filteredBlocks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <Building className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-500">Tiada blok dijumpai</p>
          {canEdit && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 px-4 py-2 text-teal-600 hover:bg-pastel-mint/50 rounded-lg"
            >
              Tambah Blok Pertama
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredBlocks.map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              onEdit={(b) => { setEditBlock(b); setShowForm(true); }}
              onDelete={handleDelete}
              onShowBedCodes={(b) => setBedCodesBlock(b)}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <BlockForm
            block={editBlock}
            wardens={wardens}
            onClose={() => { setShowForm(false); setEditBlock(null); }}
            onSuccess={fetchData}
          />
        )}
      </AnimatePresence>

      {bedCodesBlock && (
        <BedCodesModal
          blockId={bedCodesBlock.id}
          blockCode={bedCodesBlock.code}
          onClose={() => setBedCodesBlock(null)}
        />
      )}
    </div>
  );
};

export default HostelBlocksPage;
