/**
 * Pengurusan Asrama (Blok Asrama) untuk Warden
 * Urus blok asrama lelaki dan perempuan; disegerakkan dengan data pelajar.
 */
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Building, Plus, Edit, Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../../services/api';
import { Card, Button, Input, Spinner } from '../../components/common';
import {
  buildHostelBlockPayload,
  formatBedsPerLevel,
  defaultRoomConfigFromLegacy,
  ensureRoomConfigLevels,
  totalBedsForLevelSegments,
  segmentsToBedsPerLevel,
  formatSegmentSummary,
} from '../../utils/hostelBlocks';

const DEFAULT_LEVELS = ['Tingkat 1', 'Tingkat 2', 'Tingkat 3'];

export default function WardenAsramaPage() {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', gender: 'lelaki', levels: [], room_config_per_level: [], beds_per_room: '' });
  const [saving, setSaving] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [expandedLevelIndex, setExpandedLevelIndex] = useState(null);

  const fetchBlocks = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/hostel-blocks');
      setBlocks(res.data?.blocks || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal muat blok asrama');
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlocks();
  }, []);

  const openModal = (block = null) => {
    setEditing(block);
    const levels = block?.levels || [];
    const blockRoomConfig = block?.room_config_per_level;
    const roomConfig =
      Array.isArray(blockRoomConfig) && blockRoomConfig.length === levels.length
        ? blockRoomConfig.map((segments) =>
            (Array.isArray(segments) ? segments : []).map((s) => ({
              rooms: Number(s?.rooms) || 0,
              beds_per_room: Math.max(1, Math.min(20, Number(s?.beds_per_room) || 2)),
            }))
          )
        : defaultRoomConfigFromLegacy(levels, block?.beds_per_level || [], block?.beds_per_room);
    setForm(block
      ? {
          code: block.code,
          name: block.name,
          gender: block.gender || 'lelaki',
          levels,
          room_config_per_level: ensureRoomConfigLevels(roomConfig, levels.length),
          beds_per_room: block.beds_per_room ?? '',
        }
      : { code: '', name: '', gender: 'lelaki', levels: [], room_config_per_level: [], beds_per_room: '' }
    );
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setExpandedLevelIndex(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.code?.trim() || !form.name?.trim()) {
      toast.error('Kod dan Nama blok wajib');
      return;
    }
    setSaving(true);
    try {
      const payload = buildHostelBlockPayload(form);
      if (editing?.id) {
        await api.put(`/api/hostel-blocks/${editing.id}`, payload);
        toast.success('Blok dikemaskini');
      } else {
        await api.post('/api/hostel-blocks', payload);
        toast.success('Blok ditambah');
      }
      closeModal();
      fetchBlocks();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan blok');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (block) => {
    if (!window.confirm(`Padam blok "${block.name}"? Pelajar dalam blok ini perlu dikemaskini.`)) return;
    try {
      await api.delete(`/api/hostel-blocks/${block.id}`);
      toast.success('Blok dipadam');
      fetchBlocks();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam blok');
    }
  };

  const handleSeed = async () => {
    if (!window.confirm('Masukkan blok asrama default (JA, JB, JC, I, H, G, F, E)? Blok yang sudah wujud akan dilangkau.')) return;
    setSeedLoading(true);
    try {
      const res = await api.post('/api/hostel-blocks/seed-defaults');
      toast.success(res.data?.message || 'Seed selesai');
      fetchBlocks();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal seed blok');
    } finally {
      setSeedLoading(false);
    }
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <Card>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-pastel-lavender rounded-xl flex items-center justify-center">
            <Building className="text-violet-600" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Pengurusan Asrama</h1>
            <p className="text-sm text-slate-500">Urus blok asrama lelaki dan perempuan. Disegerakkan dengan data pelajar (blok).</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => openModal()}>
            <Plus size={18} /> Tambah Blok
          </Button>
          <Button variant="outline" onClick={handleSeed} loading={seedLoading}>
            <RefreshCw size={18} /> Seed Data Default
          </Button>
        </div>
        {loading ? (
          <div className="py-12 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 text-left">
                  <th className="py-2 pr-4">Kod</th>
                  <th className="py-2 pr-4">Nama</th>
                  <th className="py-2 pr-4">Jantina</th>
                  <th className="py-2 pr-4">Tingkat</th>
                  <th className="py-2 pr-4">Katil (per tingkat)</th>
                  <th className="py-2 pr-4">Pelajar</th>
                  <th className="py-2 pr-4">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {blocks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Tiada blok. Klik Tambah Blok atau Seed Data Default.
                    </td>
                  </tr>
                ) : (
                  blocks.map((b) => (
                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 pr-4 font-medium">{b.code}</td>
                      <td className="py-2 pr-4">{b.name}</td>
                      <td className="py-2 pr-4">{b.gender_display || b.gender}</td>
                      <td className="py-2 pr-4">{(b.levels || []).join(', ') || '-'}</td>
                      <td className="py-2 pr-4 text-slate-600">{formatBedsPerLevel(b.beds_per_level)}</td>
                      <td className="py-2 pr-4">{b.student_count ?? 0}</td>
                      <td className="py-2 pr-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openModal(b)}
                            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(b)}
                            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-red-600 hover:bg-red-50 rounded"
                            title="Padam"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal Tambah/Edit Blok Asrama */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={closeModal}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 pb-2 flex-shrink-0">
              <h3 className="text-lg font-semibold text-slate-900">
                {editing ? 'Edit Blok Asrama' : 'Tambah Blok Asrama'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="px-6 pb-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              <Input
                label="Kod Blok *"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="JA, JB, I, H, dll"
                maxLength={10}
                required
                disabled={!!editing}
              />
              <Input
                label="Nama Blok *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Asrama JA"
                required
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jantina *</label>
                <select
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  className="w-full h-11 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="lelaki">Lelaki</option>
                  <option value="perempuan">Perempuan</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tingkat (pilih atau tambah)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {DEFAULT_LEVELS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => {
                        const levels = form.levels.includes(l)
                          ? form.levels.filter((x) => x !== l)
                          : [...form.levels, l];
                        const idx = form.levels.indexOf(l);
                        const config = [...(form.room_config_per_level || [])];
                        const defaultBeds = form.beds_per_room != null && form.beds_per_room !== '' ? parseInt(String(form.beds_per_room), 10) : 2;
                        const newSeg = { rooms: 0, beds_per_room: isNaN(defaultBeds) || defaultBeds < 1 ? 2 : Math.min(20, defaultBeds) };
                        if (levels.length > form.levels.length) config.push([newSeg]);
                        else if (idx >= 0) config.splice(idx, 1);
                        setForm({ ...form, levels, room_config_per_level: config });
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${form.levels.includes(l) ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Tingkat lain (tekan Enter)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const v = e.target.value.trim();
                      if (v && !form.levels.includes(v)) {
                        const defaultBeds = form.beds_per_room != null && form.beds_per_room !== '' ? parseInt(String(form.beds_per_room), 10) : 2;
                        const newSeg = { rooms: 0, beds_per_room: isNaN(defaultBeds) || defaultBeds < 1 ? 2 : Math.min(20, defaultBeds) };
                        setForm({
                          ...form,
                          levels: [...form.levels, v],
                          room_config_per_level: [...(form.room_config_per_level || []), [newSeg]],
                        });
                        e.target.value = '';
                      }
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Katil per bilik (pilihan)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.beds_per_room ?? ''}
                  onChange={(e) => setForm({ ...form, beds_per_room: e.target.value })}
                  placeholder="cth. 2"
                  className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
                <span className="text-xs text-slate-500 ml-2">Untuk laporan bilik kosong &amp; kiraan bilik per tingkat</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tingkat &amp; jenis bilik</label>
                <p className="text-xs text-slate-500 mb-2">Klik baris tingkat untuk edit. Semua tingkat dipaparkan di bawah; scroll jika banyak.</p>
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50 max-h-[40vh] overflow-y-auto">
                  {(form.levels || []).length === 0 && (
                    <p className="text-sm text-slate-400 p-3">Klik &quot;Tambah tingkat&quot; untuk mula.</p>
                  )}
                  {(form.levels || []).map((levelName, levelIdx) => {
                    const segments = Array.isArray(form.room_config_per_level?.[levelIdx]) ? form.room_config_per_level[levelIdx] : [{ rooms: 0, beds_per_room: 2 }];
                    const levelTotal = totalBedsForLevelSegments(segments);
                    const summary = formatSegmentSummary(segments);
                    const isExpanded = expandedLevelIndex === levelIdx;
                    return (
                      <div key={`level-${levelIdx}`} className="border-b border-slate-200 last:border-b-0 bg-white">
                        <div
                          className="flex items-center gap-2 py-2 px-3 hover:bg-slate-50 cursor-pointer"
                          onClick={() => setExpandedLevelIndex(isExpanded ? null : levelIdx)}
                        >
                          <span className="flex-shrink-0 text-slate-400">
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </span>
                          <span className="font-medium text-slate-800 min-w-[6rem] truncate">{levelName || `Tingkat ${levelIdx + 1}`}</span>
                          <span className="text-xs text-slate-500 truncate flex-1">{summary}</span>
                          <span className="text-xs font-medium text-slate-600 flex-shrink-0">{levelTotal} katil</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const levels = (form.levels || []).filter((_, i) => i !== levelIdx);
                              const config = (form.room_config_per_level || []).filter((_, i) => i !== levelIdx);
                              setForm({ ...form, levels, room_config_per_level: config });
                              if (expandedLevelIndex === levelIdx) setExpandedLevelIndex(null);
                              else if (expandedLevelIndex > levelIdx) setExpandedLevelIndex(expandedLevelIndex - 1);
                            }}
                            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded flex-shrink-0"
                            title="Padam tingkat"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 border-t border-slate-100 bg-slate-50/80 space-y-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={levelName}
                              onChange={(e) => {
                                const levels = [...(form.levels || [])];
                                levels[levelIdx] = e.target.value.trim() || levels[levelIdx];
                                setForm({ ...form, levels });
                              }}
                              placeholder="Nama tingkat"
                              className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                            />
                            {segments.map((seg, segIdx) => (
                              <div key={`seg-${levelIdx}-${segIdx}`} className="flex items-center gap-2 flex-wrap">
                                <input
                                  type="number"
                                  min={0}
                                  max={999}
                                  placeholder="bilik"
                                  value={seg.rooms ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                    const r = isNaN(val) ? 0 : Math.max(0, Math.min(999, val));
                                    const newConfig = form.room_config_per_level.map((lev, i) =>
                                      i === levelIdx ? segments.map((s, j) => (j === segIdx ? { ...s, rooms: r } : s)) : lev
                                    );
                                    setForm({ ...form, room_config_per_level: newConfig });
                                  }}
                                  className="w-14 px-2 py-1.5 border border-slate-200 rounded text-sm"
                                />
                                <span className="text-xs text-slate-500">bilik ×</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  placeholder="katil"
                                  value={seg.beds_per_room}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 2 : parseInt(e.target.value, 10);
                                    const b = isNaN(val) ? 2 : Math.max(1, Math.min(20, val));
                                    const newConfig = form.room_config_per_level.map((lev, i) =>
                                      i === levelIdx ? segments.map((s, j) => (j === segIdx ? { ...s, beds_per_room: b } : s)) : lev
                                    );
                                    setForm({ ...form, room_config_per_level: newConfig });
                                  }}
                                  className="w-14 px-2 py-1.5 border border-slate-200 rounded text-sm"
                                />
                                <span className="text-xs text-slate-500">katil</span>
                                {segments.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newSegments = segments.filter((_, j) => j !== segIdx);
                                      const newConfig = form.room_config_per_level.map((lev, i) =>
                                        i === levelIdx ? (newSegments.length ? newSegments : [{ rooms: 0, beds_per_room: 2 }]) : lev
                                      );
                                      setForm({ ...form, room_config_per_level: newConfig });
                                    }}
                                    className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-slate-400 hover:text-red-600 rounded"
                                    title="Padam baris"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const defaultBeds = form.beds_per_room != null && form.beds_per_room !== '' ? parseInt(String(form.beds_per_room), 10) : 2;
                                const newSegments = [...segments, { rooms: 0, beds_per_room: isNaN(defaultBeds) || defaultBeds < 1 ? 2 : Math.min(20, defaultBeds) }];
                                const newConfig = form.room_config_per_level.map((lev, i) => (i === levelIdx ? newSegments : lev));
                                setForm({ ...form, room_config_per_level: newConfig });
                              }}
                              className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                            >
                              + Tambah jenis bilik
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const n = (form.levels || []).length + 1;
                      const defaultBeds = form.beds_per_room != null && form.beds_per_room !== '' ? parseInt(String(form.beds_per_room), 10) : 2;
                      const newSeg = { rooms: 0, beds_per_room: isNaN(defaultBeds) || defaultBeds < 1 ? 2 : Math.min(20, defaultBeds) };
                      setForm({
                        ...form,
                        levels: [...(form.levels || []), `Tingkat ${n}`],
                        room_config_per_level: [...(form.room_config_per_level || []), [newSeg]],
                      });
                      setExpandedLevelIndex((form.levels || []).length);
                    }}
                    className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
                  >
                    <Plus size={16} /> Tambah tingkat
                  </button>
                  {(form.levels || []).length > 0 && (() => {
                    const bedsPerLevel = segmentsToBedsPerLevel(form.room_config_per_level || []);
                    const totalBeds = bedsPerLevel.reduce((a, b) => a + b, 0);
                    const totalRooms = (form.room_config_per_level || []).reduce(
                      (sum, segs) => sum + (Array.isArray(segs) ? segs.reduce((s, seg) => s + (Number(seg?.rooms) || 0), 0) : 0),
                      0
                    );
                    if (totalBeds > 0) {
                      return (
                        <span className="text-sm text-slate-600">
                          Jumlah: <strong>{(form.levels || []).length}</strong> tingkat, <strong>{totalRooms}</strong> bilik, <strong>{totalBeds}</strong> katil
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
              </div>
              <div className="flex gap-2 p-6 pt-4 border-t border-slate-100 flex-shrink-0 bg-white">
                <Button type="button" variant="ghost" onClick={closeModal} className="flex-1">
                  Batal
                </Button>
                <Button type="submit" loading={saving} className="flex-1">
                  Simpan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
