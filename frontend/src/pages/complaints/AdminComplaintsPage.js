import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  AlertTriangle, FileText, Clock, CheckCircle, AlertCircle,
  Search, Filter, User, Building, Calendar, Eye, X,
  ChevronRight, MessageSquare, ClipboardCheck, Send, Image,
  BookOpen, Info, ExternalLink, Ban, Droplets, TrendingUp, Zap
} from 'lucide-react';
import { useAuth } from '../../App';
import api from '../../services/api';

// Constants
const COMPLAINT_TYPES = {
  disiplin: { name: 'Disiplin', color: 'bg-red-100 text-red-700' },
  keselamatan: { name: 'Keselamatan', color: 'bg-orange-100 text-orange-700' },
  kebajikan: { name: 'Kebajikan', color: 'bg-blue-100 text-blue-700' },
  fasiliti_rosak: { name: 'Fasiliti Rosak', color: 'bg-yellow-100 text-yellow-700' },
  penapis_air: { name: 'Penapis Air', color: 'bg-cyan-100 text-cyan-700' },
  paranormal: { name: 'Paranormal', color: 'bg-violet-100 text-violet-700' },
  makanan: { name: 'Makanan', color: 'bg-green-100 text-green-700' },
  gangguan_pelajar: { name: 'Gangguan Pelajar', color: 'bg-pastel-lavender text-violet-700' },
  lain_lain: { name: 'Lain-lain', color: 'bg-gray-100 text-gray-700' }
};

const COMPLAINT_PRIORITIES = {
  rendah: { name: 'Rendah', color: 'bg-green-100 text-green-700' },
  sederhana: { name: 'Sederhana', color: 'bg-yellow-100 text-yellow-700' },
  kritikal: { name: 'Kritikal', color: 'bg-red-100 text-red-700 animate-pulse' }
};

const COMPLAINT_STATUSES = {
  baru_dihantar: { name: 'Baru Dihantar', color: 'bg-blue-100 text-blue-700' },
  diterima_warden: { name: 'Diterima', color: 'bg-pastel-mint text-teal-700' },
  dalam_siasatan: { name: 'Siasatan', color: 'bg-pastel-lavender text-violet-700' },
  dalam_tindakan: { name: 'Tindakan', color: 'bg-orange-100 text-orange-700' },
  menunggu_maklum_balas: { name: 'Tunggu Maklumbalas', color: 'bg-yellow-100 text-yellow-700' },
  di_luar_bidang: { name: 'Di Luar Bidang', color: 'bg-gray-200 text-gray-700 border border-gray-400' },
  selesai: { name: 'Selesai', color: 'bg-green-100 text-green-700' },
  ditutup: { name: 'Ditutup', color: 'bg-gray-100 text-gray-700' }
};

const STATUS_WORKFLOW = [
  'baru_dihantar',
  'diterima_warden',
  'dalam_siasatan',
  'dalam_tindakan',
  'menunggu_maklum_balas',
  'di_luar_bidang',
  'selesai',
  'ditutup'
];

// Complaint Detail Panel
const ComplaintDetailPanel = ({ complaint, onClose, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState({
    status: complaint.status,
    catatan: ''
  });
  const [action, setAction] = useState({
    tindakan: '',
    respon_kepada_ibubapa: ''
  });
  const [showActionForm, setShowActionForm] = useState(false);

  const handleStatusUpdate = async () => {
    if (!statusUpdate.status) return;
    setLoading(true);
    try {
      await api.put(`/api/complaints/${complaint.id}/status`, statusUpdate);
      toast.success('Status berjaya dikemaskini');
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal kemaskini status');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAction = async () => {
    if (!action.tindakan) {
      toast.error('Sila masukkan tindakan');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/api/complaints/${complaint.id}/action`, action);
      toast.success('Tindakan berjaya ditambah');
      setAction({ tindakan: '', respon_kepada_ibubapa: '' });
      setShowActionForm(false);
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menambah tindakan');
    } finally {
      setLoading(false);
    }
  };

  const priorityInfo = COMPLAINT_PRIORITIES[complaint.tahap_keutamaan] || COMPLAINT_PRIORITIES.sederhana;
  const typeInfo = COMPLAINT_TYPES[complaint.jenis_aduan] || COMPLAINT_TYPES.lain_lain;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 overflow-y-auto overflow-x-hidden"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 text-white sticky top-0 z-10 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-white/60 text-sm">{complaint.nombor_aduan}</p>
            <h2 className="text-xl font-bold truncate">{complaint.nama_pelajar}</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-xs px-2 py-1 rounded-full ${priorityInfo.color}`}>
                {priorityInfo.name}
              </span>
              <span className={`text-xs px-2 py-1 rounded-full ${typeInfo.color}`}>
                {typeInfo.name}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg flex-shrink-0" aria-label="Tutup">
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Info Section */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl">
            <p className="text-xs text-slate-500">Pengadu</p>
            <p className="font-semibold text-slate-900">{complaint.nama_pengadu}</p>
            <p className="text-sm text-slate-600">{complaint.hubungan === 'ibu_bapa' ? 'Ibu Bapa' : complaint.hubungan}</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl">
            <p className="text-xs text-slate-500">Lokasi</p>
            <p className="font-semibold text-slate-900">Asrama {complaint.asrama}</p>
            <p className="text-sm text-slate-600">Tingkatan {complaint.tingkatan}</p>
          </div>
        </div>

        {/* Description */}
        <div className="bg-slate-50 p-4 rounded-xl">
          <p className="text-xs text-slate-500 mb-2">Penerangan Aduan</p>
          <p className="text-slate-900">{complaint.penerangan}</p>
          <p className="text-xs text-slate-500 mt-3">
            Dilaporkan: {new Date(complaint.created_at).toLocaleString('ms-MY')}
          </p>
        </div>

        {/* Status Workflow */}
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <ClipboardCheck size={18} className="text-blue-600" />
            Kemaskini Status
          </h3>
          <div className="flex flex-wrap gap-2">
            {STATUS_WORKFLOW.map((status) => {
              const info = COMPLAINT_STATUSES[status];
              const isActive = complaint.status === status;
              const isSelected = statusUpdate.status === status;
              const isDiLuarBidang = status === 'di_luar_bidang';
              return (
                <button
                  key={status}
                  onClick={() => setStatusUpdate({ ...statusUpdate, status })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    isSelected
                      ? 'ring-2 ring-blue-500 ring-offset-2'
                      : ''
                  } ${info.color} ${isDiLuarBidang ? 'flex items-center gap-1' : ''}`}
                >
                  {isDiLuarBidang && <Ban size={14} />}
                  {info.name}
                  {isActive && <span className="ml-1">•</span>}
                </button>
              );
            })}
          </div>
          
          {/* Info box for "Di Luar Bidang" status */}
          {statusUpdate.status === 'di_luar_bidang' && statusUpdate.status !== complaint.status && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="text-amber-600 mt-0.5" size={18} />
                <div>
                  <p className="font-medium text-amber-800">Aduan Di Luar Bidang Tugas</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Gunakan status ini jika aduan tidak berkaitan dengan bidang tugas warden atau 
                    ibu bapa perlu merujuk kepada peraturan/prosedur sedia ada. Sistem akan 
                    secara automatik menghantar panduan berkaitan kepada pengadu.
                  </p>
                </div>
              </div>
            </div>
          )}

          {statusUpdate.status !== complaint.status && (
            <div className="space-y-3">
              <textarea
                value={statusUpdate.catatan}
                onChange={(e) => setStatusUpdate({ ...statusUpdate, catatan: e.target.value })}
                placeholder={statusUpdate.status === 'di_luar_bidang' 
                  ? "Terangkan sebab aduan di luar bidang tugas (pilihan)..." 
                  : "Catatan (pilihan)..."}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                rows={2}
              />
              <button
                onClick={handleStatusUpdate}
                disabled={loading}
                className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${
                  statusUpdate.status === 'di_luar_bidang'
                    ? 'bg-gray-600 hover:bg-gray-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {statusUpdate.status === 'di_luar_bidang' ? 'Tandakan Di Luar Bidang' : 'Kemaskini Status'}
              </button>
            </div>
          )}
        </div>

        {/* Guideline Reference Display (when status is di_luar_bidang) */}
        {complaint.status === 'di_luar_bidang' && complaint.guideline_reference && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-800">
              <BookOpen size={20} />
              <h3 className="font-semibold">Panduan Telah Dihantar kepada Pengadu</h3>
            </div>
            <div className="bg-white rounded-lg p-4 border border-amber-200">
              <h4 className="font-medium text-slate-900 mb-2">{complaint.guideline_reference.title}</h4>
              <ul className="space-y-1.5">
                {complaint.guideline_reference.items?.map((item, idx) => (
                  <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
              {complaint.guideline_reference.contact && (
                <p className="text-sm text-amber-700 mt-3 pt-3 border-t border-amber-100">
                  {complaint.guideline_reference.contact}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Add Action */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare size={18} className="text-green-600" />
              Tindakan
            </h3>
            <button
              onClick={() => setShowActionForm(!showActionForm)}
              className="text-sm text-green-600 hover:text-green-700"
            >
              + Tambah Tindakan
            </button>
          </div>

          {showActionForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="bg-green-50 p-4 rounded-xl space-y-3"
            >
              <textarea
                value={action.tindakan}
                onChange={(e) => setAction({ ...action, tindakan: e.target.value })}
                placeholder="Terangkan tindakan yang diambil..."
                className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                rows={3}
              />
              <textarea
                value={action.respon_kepada_ibubapa}
                onChange={(e) => setAction({ ...action, respon_kepada_ibubapa: e.target.value })}
                placeholder="Respon kepada ibu bapa (akan dihantar sebagai notifikasi)..."
                className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddAction}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Send size={16} />
                  Hantar Tindakan
                </button>
                <button
                  onClick={() => setShowActionForm(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
              </div>
            </motion.div>
          )}

          {/* Action History */}
          {complaint.tindakan_list?.length > 0 && (
            <div className="space-y-3">
              {complaint.tindakan_list.map((t, idx) => (
                <div key={idx} className="bg-slate-50 p-4 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-900">{t.user_name}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(t.timestamp).toLocaleString('ms-MY')}
                    </p>
                  </div>
                  <p className="text-slate-700">{t.tindakan}</p>
                  {t.respon_kepada_ibubapa && (
                    <p className="text-sm text-green-700 mt-2 p-2 bg-green-50 rounded">
                      Respon: {t.respon_kepada_ibubapa}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audit Log */}
        {complaint.audit_log?.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-900">Log Audit</h3>
            <div className="space-y-2">
              {complaint.audit_log.map((log, idx) => (
                <div key={idx} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-slate-400 mt-1.5" />
                  <div>
                    <p className="text-slate-900">{log.details}</p>
                    <p className="text-xs text-slate-500">
                      {log.user_name} · {new Date(log.timestamp).toLocaleString('ms-MY')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Admin Complaints Page
export const AdminComplaintsPage = () => {
  const auth = useAuth();
  const user = auth?.user;
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [stats, setStats] = useState(null);
  const [trending, setTrending] = useState([]);
  const [showBulkAction, setShowBulkAction] = useState(false);
  const [selectedBulkCategory, setSelectedBulkCategory] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    status: 'selesai',
    tindakan: '',
    respon_kepada_semua: ''
  });
  const [filters, setFilters] = useState({
    status: '',
    jenis_aduan: '',
    tahap_keutamaan: '',
    search: ''
  });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [initialized, setInitialized] = useState(false);

  // Initial load
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      fetchComplaints();
      fetchStats();
      fetchTrending();
    }
  }, [initialized]);

  // Refetch when filters/page change
  useEffect(() => {
    if (initialized) {
      fetchComplaints();
    }
  }, [filters, page]);

  const fetchComplaints = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/complaints', { params: { ...filters, page, limit: 20 } });
      setComplaints(res.data.complaints);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('fetchComplaints error:', err);
      toast.error('Gagal mendapatkan senarai aduan');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/api/complaints/dashboard/stats');
      setStats(res.data.stats);
    } catch (err) {
      console.error('Failed to fetch stats');
    }
  };

  const fetchTrending = async () => {
    try {
      const res = await api.get('/api/complaints/trending/categories?limit=3');
      setTrending(res.data.trending || []);
    } catch (err) {
      console.error('Failed to fetch trending');
    }
  };

  const fetchComplaintDetail = async (id) => {
    try {
      const res = await api.get(`/api/complaints/${id}`);
      setSelectedComplaint(res.data.complaint);
    } catch (err) {
      toast.error('Gagal mendapatkan butiran aduan');
    }
  };

  const handleBulkAction = async () => {
    if (!selectedBulkCategory || !bulkForm.tindakan) {
      toast.error('Sila lengkapkan maklumat tindakan');
      return;
    }
    
    setBulkLoading(true);
    try {
      const params = new URLSearchParams({
        jenis_aduan: selectedBulkCategory.jenis_aduan,
        status: bulkForm.status,
        tindakan: bulkForm.tindakan
      });
      if (bulkForm.respon_kepada_semua) {
        params.append('respon_kepada_semua', bulkForm.respon_kepada_semua);
      }
      
      const res = await api.post(`/api/complaints/bulk-action?${params.toString()}`);
      toast.success(`Berjaya kemaskini ${res.data.updated_count} aduan!`);
      
      // Reset and refresh
      setShowBulkAction(false);
      setSelectedBulkCategory(null);
      setBulkForm({ status: 'selesai', tindakan: '', respon_kepada_semua: '' });
      fetchComplaints();
      fetchStats();
      fetchTrending();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menjalankan tindakan pukal');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="admin-complaints-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Pengurusan Aduan</h1>
        <p className="text-slate-600">Pantau dan ambil tindakan terhadap aduan</p>
      </div>

      {/* Trending Categories - Bulk Action Alert */}
      {trending.length > 0 && (
        <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-xl p-4 border border-cyan-200">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="text-cyan-600" size={20} />
            <h3 className="font-semibold text-cyan-800">Aduan Berulang - Tindakan Pukal Tersedia</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {trending.map((item) => (
              <div 
                key={item.jenis_aduan}
                className="bg-white rounded-lg p-3 border border-cyan-100 hover:border-cyan-300 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${COMPLAINT_TYPES[item.jenis_aduan]?.color || 'bg-gray-100'}`}>
                    {item.jenis_aduan === 'penapis_air' && <Droplets size={12} className="inline mr-1" />}
                    {item.jenis_aduan_display}
                  </span>
                  <span className="text-lg font-bold text-cyan-700">{item.count}</span>
                </div>
                <p className="text-xs text-slate-500 mb-2">aduan belum selesai</p>
                <button
                  onClick={() => {
                    setSelectedBulkCategory(item);
                    setShowBulkAction(true);
                  }}
                  className="w-full py-1.5 text-sm bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-all flex items-center justify-center gap-1"
                >
                  <Zap size={14} />
                  Tindakan Pukal
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-sm text-slate-500">Hari Ini</p>
            <p className="text-2xl font-bold text-slate-900">{stats.jumlah_hari_ini}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4 border border-red-200">
            <p className="text-sm text-red-600">Kritikal</p>
            <p className="text-2xl font-bold text-red-700">{stats.aduan_kritikal}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
            <p className="text-sm text-yellow-600">Belum Selesai</p>
            <p className="text-2xl font-bold text-yellow-700">{stats.aduan_belum_selesai}</p>
          </div>
          {Object.entries(stats.aduan_ikut_kategori || {}).slice(0, 2).map(([key, value]) => (
            <div key={key} className="bg-white rounded-xl p-4 border border-slate-200">
              <p className="text-sm text-slate-500 truncate">{key}</p>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Cari aduan..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg"
              />
            </div>
          </div>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">Semua Status</option>
            {Object.entries(COMPLAINT_STATUSES).map(([key, value]) => (
              <option key={key} value={key}>{value.name}</option>
            ))}
          </select>
          <select
            value={filters.jenis_aduan}
            onChange={(e) => setFilters({ ...filters, jenis_aduan: e.target.value })}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">Semua Jenis</option>
            {Object.entries(COMPLAINT_TYPES).map(([key, value]) => (
              <option key={key} value={key}>{value.name}</option>
            ))}
          </select>
          <select
            value={filters.tahap_keutamaan}
            onChange={(e) => setFilters({ ...filters, tahap_keutamaan: e.target.value })}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">Semua Keutamaan</option>
            {Object.entries(COMPLAINT_PRIORITIES).map(([key, value]) => (
              <option key={key} value={key}>{value.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Complaints Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">No. Aduan</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Pelajar</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Jenis</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Keutamaan</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Status</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Warden</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Tarikh</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8">
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : complaints.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-500">
                    Tiada aduan dijumpai
                  </td>
                </tr>
              ) : (
                complaints.map((c) => {
                  const typeInfo = COMPLAINT_TYPES[c.jenis_aduan] || COMPLAINT_TYPES.lain_lain;
                  const priorityInfo = COMPLAINT_PRIORITIES[c.tahap_keutamaan] || COMPLAINT_PRIORITIES.sederhana;
                  const statusInfo = COMPLAINT_STATUSES[c.status] || COMPLAINT_STATUSES.baru_dihantar;
                  return (
                    <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-900">{c.nombor_aduan}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-900">{c.nama_pelajar}</p>
                        <p className="text-xs text-slate-500">Asrama {c.asrama} · T{c.tingkatan}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${typeInfo.color}`}>
                          {typeInfo.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${priorityInfo.color}`}>
                          {priorityInfo.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${statusInfo.color}`}>
                          {statusInfo.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-600">{c.warden_name || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-600">
                          {new Date(c.created_at).toLocaleDateString('ms-MY')}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => fetchComplaintDetail(c.id)}
                          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              Halaman {pagination.page} dari {pagination.total_pages} ({pagination.total} aduan)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-50"
              >
                Sebelum
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.total_pages, p + 1))}
                disabled={page === pagination.total_pages}
                className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-50"
              >
                Seterusnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedComplaint && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setSelectedComplaint(null)}
            />
            <ComplaintDetailPanel
              complaint={selectedComplaint}
              onClose={() => setSelectedComplaint(null)}
              onUpdate={() => {
                fetchComplaintDetail(selectedComplaint.id);
                fetchComplaints();
                fetchStats();
                fetchTrending();
              }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Bulk Action Modal */}
      <AnimatePresence>
        {showBulkAction && selectedBulkCategory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowBulkAction(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
            >
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col overflow-x-hidden min-w-0">
                {/* Header */}
                <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-5 text-white shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Zap size={24} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-xl font-bold">Tindakan Pukal</h2>
                        <p className="text-white/80 text-sm truncate">
                          {selectedBulkCategory.count} aduan {selectedBulkCategory.jenis_aduan_display}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowBulkAction(false)}
                      className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg flex-shrink-0"
                      aria-label="Tutup"
                    >
                      <X size={24} />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                  <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Info className="text-cyan-600 mt-0.5" size={18} />
                      <div>
                        <p className="font-medium text-cyan-800">Tindakan ini akan:</p>
                        <ul className="text-sm text-cyan-700 mt-1 space-y-1">
                          <li>• Kemaskini status semua {selectedBulkCategory.count} aduan</li>
                          <li>• Hantar notifikasi kepada semua pengadu</li>
                          <li>• Rekod tindakan dalam log audit</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Status Baharu
                    </label>
                    <select
                      value={bulkForm.status}
                      onChange={(e) => setBulkForm({ ...bulkForm, status: e.target.value })}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="dalam_tindakan">Dalam Tindakan</option>
                      <option value="selesai">Selesai</option>
                      <option value="ditutup">Ditutup</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Penerangan Tindakan *
                    </label>
                    <textarea
                      value={bulkForm.tindakan}
                      onChange={(e) => setBulkForm({ ...bulkForm, tindakan: e.target.value })}
                      placeholder={`Cth: Penapis air di Blok JA telah dibaiki pada ${new Date().toLocaleDateString('ms-MY')}`}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500"
                      rows={3}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Mesej kepada Semua Pengadu
                    </label>
                    <textarea
                      value={bulkForm.respon_kepada_semua}
                      onChange={(e) => setBulkForm({ ...bulkForm, respon_kepada_semua: e.target.value })}
                      placeholder="Cth: Terima kasih atas laporan anda. Penapis air telah dibaiki dan boleh digunakan semula."
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500"
                      rows={2}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-50 px-5 py-4 flex justify-end gap-3">
                  <button
                    onClick={() => setShowBulkAction(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleBulkAction}
                    disabled={bulkLoading || !bulkForm.tindakan}
                    className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {bulkLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Zap size={18} />
                        Jalankan Tindakan
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminComplaintsPage;
