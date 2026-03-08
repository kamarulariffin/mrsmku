import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { GraduationCap, Check, X, Search, ChevronLeft, ChevronRight, Edit, RefreshCw, Moon, AlertCircle, Users, BarChart3, Globe, FileText } from 'lucide-react';
import { api } from '../../../services/api';
import { Card, Badge, Spinner } from '../../../components/common';

// Student Report Card Component
const StudentReportCard = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await api.get('/api/admin/students/report');
        setReport(res.data);
      } catch (err) {
        console.error('Failed to fetch report:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, []);

  if (loading || !report) return null;

  return (
    <Card className="bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <BarChart3 className="text-primary-600" size={20} />
          Laporan Pelajar
        </h3>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1"
          data-testid="toggle-report-details"
        >
          <FileText size={16} />
          {showDetails ? 'Tutup' : 'Lihat Butiran'}
        </button>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <p className="text-xs text-slate-500 uppercase">Jumlah</p>
          <p className="text-2xl font-bold text-slate-800">{report.summary.total_students}</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 shadow-sm">
          <p className="text-xs text-emerald-600 uppercase">Muslim</p>
          <p className="text-2xl font-bold text-emerald-700">{report.summary.muslim}</p>
          <p className="text-xs text-emerald-500">{report.summary.muslim_percentage}%</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 shadow-sm">
          <p className="text-xs text-blue-600 uppercase">Bukan Islam</p>
          <p className="text-2xl font-bold text-blue-700">{report.summary.non_muslim}</p>
          <p className="text-xs text-blue-500">{report.summary.non_muslim_percentage}%</p>
        </div>
        <div className="bg-pastel-lavender rounded-lg p-3 shadow-sm col-span-2 md:col-span-1">
          <p className="text-xs text-violet-600 uppercase mb-2">Pecahan Bangsa</p>
          <div className="space-y-1">
            {Object.entries(report.by_bangsa).map(([bangsa, count]) => (
              <div key={bangsa} className="flex justify-between items-center text-sm">
                <span className="text-violet-700">{bangsa}</span>
                <span className="font-bold text-violet-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Details */}
      {showDetails && (
        <div className="border-t border-slate-200 pt-4 mt-4 space-y-4">
          {/* By Bangsa */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
              <Globe size={14} /> Pecahan Mengikut Bangsa
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(report.by_bangsa).map(([bangsa, count]) => (
                <div key={bangsa} className="bg-white rounded px-3 py-2 text-sm flex justify-between items-center">
                  <span className="text-slate-700">{bangsa}</span>
                  <span className="font-semibold text-slate-900">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Religion */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
              <Moon size={14} /> Pecahan Mengikut Agama
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(report.by_religion).map(([religion, count]) => (
                <div key={religion} className="bg-white rounded px-3 py-2 text-sm flex justify-between items-center">
                  <span className="text-slate-700">{religion}</span>
                  <span className={`font-semibold ${religion === 'Islam' ? 'text-emerald-600' : 'text-blue-600'}`}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Form */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
              <GraduationCap size={14} /> Pecahan Mengikut Tingkatan
            </h4>
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(report.by_form).map(([form, count]) => (
                <div key={form} className="bg-white rounded px-3 py-2 text-sm text-center">
                  <span className="text-slate-500 text-xs block">{form}</span>
                  <span className="font-semibold text-slate-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

// Edit Student Modal Component
const EditStudentModal = ({ student, onClose, onSave, systemConfig, hostelBlocks = [] }) => {
  const [formData, setFormData] = useState({
    full_name: student?.full_name || '',
    ic_number: (student?.ic_number || '').replace(/[-\s]/g, ''),
    form: student?.form || 1,
    class_name: student?.class_name || '',
    block_name: student?.block_name || '',
    room_number: student?.room_number || '',
    state: student?.state || '',
    religion: student?.religion || 'Islam',
    bangsa: student?.bangsa || 'Melayu',
    gender: student?.gender || '',
    relationship: student?.relationship || 'BAPA',
    phone: student?.phone || '',
    email: student?.email || ''
  });
  const [saving, setSaving] = useState(false);

  // Use systemConfig or fallback defaults
  const KELAS_OPTIONS = systemConfig?.kelas || ['A', 'B', 'C', 'D', 'E', 'F'];
  const RELIGION_OPTIONS = systemConfig?.agama || ['Islam', 'Buddha', 'Hindu', 'Kristian', 'Sikh', 'Taoisme', 'Konfusianisme', 'Lain-lain'];
  const BANGSA_OPTIONS = systemConfig?.bangsa || ['Melayu', 'Cina', 'India', 'Bumiputera Sabah', 'Bumiputera Sarawak', 'Lain-lain'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/api/students/${student.id}`, formData);
      toast.success('Pelajar berjaya dikemaskini');
      onSave();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal mengemaskini pelajar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b bg-gradient-to-r from-primary-700 to-primary-900 text-white rounded-t-xl">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Edit size={24} />
            Edit Pelajar
          </h3>
          <p className="text-primary-200 text-sm mt-1">{student.matric_number}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Hubungan dengan Pendaftar */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Hubungan dengan Pendaftar</label>
            <div className="flex gap-4">
              {['BAPA', 'IBU', 'PENJAGA'].map((rel) => (
                <label key={rel} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="relationship"
                    value={rel}
                    checked={formData.relationship === rel}
                    onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                    className="w-4 h-4 text-teal-600 border-slate-300 focus:ring-teal-500"
                  />
                  <span className="text-sm text-slate-700">{rel}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama Penuh</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                data-testid="edit-name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">No. Kad Pengenalan * (12 digit tanpa -)</label>
              <input
                type="text"
                value={formData.ic_number}
                onChange={(e) => setFormData({ ...formData, ic_number: e.target.value.replace(/[-\s]/g, '').slice(0, 12) })}
                placeholder="901201061234"
                maxLength={12}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                data-testid="edit-ic"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                <Moon size={14} className="text-emerald-600" />
                Agama
              </label>
              <select
                value={formData.religion}
                onChange={(e) => setFormData({ ...formData, religion: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                data-testid="edit-religion"
              >
                {RELIGION_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                <Globe size={14} className="text-blue-600" />
                Bangsa
              </label>
              <select
                value={formData.bangsa}
                onChange={(e) => setFormData({ ...formData, bangsa: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                data-testid="edit-bangsa"
              >
                {BANGSA_OPTIONS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                <Users size={14} className="text-pink-600" />
                Jantina
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                data-testid="edit-gender"
              >
                <option value="">Pilih Jantina</option>
                <option value="male">Lelaki</option>
                <option value="female">Perempuan</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tingkatan</label>
              <select
                value={formData.form}
                onChange={(e) => setFormData({ ...formData, form: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                data-testid="edit-form"
              >
                {[1, 2, 3, 4, 5].map((f) => (
                  <option key={f} value={f}>Tingkatan {f}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kelas</label>
              <select
                value={formData.class_name}
                onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                data-testid="edit-class"
              >
                <option value="">Pilih Kelas</option>
                {KELAS_OPTIONS.map((k) => (
                  <option key={k} value={k}>Kelas {k}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Blok Asrama</label>
              {hostelBlocks.length > 0 ? (
                <select
                  value={formData.block_name}
                  onChange={(e) => setFormData({ ...formData, block_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  data-testid="edit-block"
                >
                  <option value="">-- Pilih Blok --</option>
                  {hostelBlocks.map((b) => (
                    <option key={b.code} value={b.code}>{b.name} ({b.gender_display || b.gender})</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.block_name}
                  onChange={(e) => setFormData({ ...formData, block_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="cth: JA, I"
                  data-testid="edit-block"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">No. Bilik/Katil</label>
              <input
                type="text"
                value={formData.room_number}
                onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="cth: A101"
                data-testid="edit-room"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Negeri</label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                data-testid="edit-state"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">No. Telefon</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="cth: 0123456789"
                data-testid="edit-phone"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="cth: pelajar@email.com"
                data-testid="edit-email"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-primary-700 text-white rounded-lg hover:bg-primary-800 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              data-testid="save-student-btn"
            >
              {saving && <RefreshCw size={16} className="animate-spin" />}
              Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Sync Status Card Component
const SyncStatusCard = ({ onSync }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/api/admin/sync/status');
      setStatus(res.data);
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/api/admin/sync/students');
      toast.success(res.data.message);
      fetchStatus();
      onSync();
    } catch (err) {
      toast.error('Gagal menjalankan sinkronisasi');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return null;
  if (!status?.sync_needed) return null;

  return (
    <Card className="bg-amber-50 border-amber-200 p-4">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="text-amber-600" size={20} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-amber-800">Data Perlu Disinkronkan</h3>
          <div className="text-sm text-amber-700 mt-1 space-y-1">
            {status.issues.students_without_user_account > 0 && (
              <p>• {status.issues.students_without_user_account} pelajar tanpa akaun login</p>
            )}
            {status.issues.pelajar_users_without_religion > 0 && (
              <p>• {status.issues.pelajar_users_without_religion} akaun tanpa maklumat agama</p>
            )}
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-60"
            data-testid="sync-btn"
          >
            {syncing ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {syncing ? 'Sedang sinkronkan...' : 'Sinkronkan Data'}
          </button>
        </div>
      </div>
    </Card>
  );
};

export const AdminStudentsPage = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1, has_next: false, has_prev: false });
  const [formFilter, setFormFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [bangsaFilter, setBangsaFilter] = useState('');
  const [editingStudent, setEditingStudent] = useState(null);
  
  // System config for dropdowns
  const [systemConfig, setSystemConfig] = useState({
    kelas: ['A', 'B', 'C', 'D', 'E', 'F'],
    bangsa: ['Melayu', 'Cina', 'India', 'Bumiputera Sabah', 'Bumiputera Sarawak', 'Lain-lain'],
    agama: ['Islam', 'Buddha', 'Hindu', 'Kristian', 'Sikh', 'Taoisme', 'Konfusianisme', 'Lain-lain']
  });
  const [hostelBlocks, setHostelBlocks] = useState([]);

  // Fetch system config and hostel blocks on mount
  useEffect(() => {
    const fetchSystemConfig = async () => {
      try {
        const res = await api.get('/api/settings/system-config/public');
        if (res.data) setSystemConfig(res.data);
      } catch (err) {
        console.error('Failed to fetch system config');
      }
    };
    const fetchHostelBlocks = async () => {
      try {
        const res = await api.get('/api/hostel-blocks/public');
        setHostelBlocks(res.data?.blocks || []);
      } catch (err) {
        console.error('Failed to fetch hostel blocks');
      }
    };
    fetchSystemConfig();
    fetchHostelBlocks();
  }, []);

  const fetchStudents = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', 20);
      if (search) params.append('search', search);
      if (filter !== 'all') params.append('status', filter);
      if (formFilter) params.append('form', formFilter);
      if (classFilter) params.append('class_name', classFilter);
      
      const res = await api.get(`/api/admin/students?${params.toString()}`);
      
      // Filter by bangsa on frontend (since backend might not support it)
      let filteredStudents = res.data.students;
      if (bangsaFilter) {
        filteredStudents = filteredStudents.filter(s => s.bangsa === bangsaFilter);
      }
      
      setStudents(filteredStudents);
      setPagination(res.data.pagination);
    } catch (err) { 
      toast.error('Gagal memuatkan data pelajar'); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { fetchStudents(1); }, [search, filter, formFilter, classFilter, bangsaFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleApprove = async (id) => { 
    try { 
      await api.put(`/api/students/${id}/approve`); 
      toast.success('Pelajar disahkan'); 
      fetchStudents(pagination.page); 
    } catch (err) { 
      toast.error('Gagal mengesahkan'); 
    } 
  };
  
  const handleReject = async (id) => { 
    if (!window.confirm('Tolak pelajar ini?')) return; 
    try { 
      await api.put(`/api/students/${id}/reject`); 
      toast.success('Pelajar ditolak'); 
      fetchStudents(pagination.page); 
    } catch (err) { 
      toast.error('Gagal menolak'); 
    } 
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="admin-students-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Pengurusan Pelajar</h1>
          <p className="text-slate-600 mt-1">Senarai dan urus data pelajar • {pagination.total} pelajar</p>
        </div>
      </div>

      {/* Student Report Card */}
      <StudentReportCard />

      {/* Sync Status Alert */}
      <SyncStatusCard onSync={() => fetchStudents(pagination.page)} />

      {/* Search and Filters */}
      <Card>
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search Box */}
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                placeholder="Cari nama, no. matrik, IC, kelas atau blok..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                data-testid="student-search-input"
              />
            </div>
          </form>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap gap-2">
            <select
              value={formFilter}
              onChange={(e) => setFormFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              data-testid="form-filter"
            >
              <option value="">Semua Tingkatan</option>
              <option value="1">Tingkatan 1</option>
              <option value="2">Tingkatan 2</option>
              <option value="3">Tingkatan 3</option>
              <option value="4">Tingkatan 4</option>
              <option value="5">Tingkatan 5</option>
            </select>

            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              data-testid="class-filter"
            >
              <option value="">Semua Kelas</option>
              {systemConfig.kelas.map(k => (
                <option key={k} value={k}>Kelas {k}</option>
              ))}
            </select>

            <select
              value={bangsaFilter}
              onChange={(e) => setBangsaFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              data-testid="bangsa-filter"
            >
              <option value="">Semua Bangsa</option>
              {systemConfig.bangsa.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Filter Buttons */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
          {['all', 'pending', 'approved', 'rejected'].map((f) => (
            <button 
              key={f} 
              onClick={() => setFilter(f)} 
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === f ? 'bg-primary-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              data-testid={`filter-${f}`}
            >
              {f === 'all' ? 'Semua' : f === 'pending' ? 'Menunggu' : f === 'approved' ? 'Disahkan' : 'Ditolak'}
            </button>
          ))}
          {(search || filter !== 'all' || formFilter || classFilter || bangsaFilter) && (
            <button 
              onClick={() => { setSearch(''); setSearchInput(''); setFilter('all'); setFormFilter(''); setClassFilter(''); setBangsaFilter(''); }} 
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-all"
              data-testid="clear-filters"
            >
              <X size={14} className="inline mr-1" />Reset
            </button>
          )}
        </div>
      </Card>

      {/* Students Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
      ) : students.length === 0 ? (
        <Card className="text-center py-12">
          <GraduationCap className="mx-auto text-slate-300" size={48} />
          <h3 className="mt-4 text-lg font-medium text-slate-700">Tiada pelajar dijumpai</h3>
          <p className="text-slate-500 mt-1">Cuba ubah kriteria carian atau penapis</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="students-table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Pelajar</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">No. Matrik</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Tingkatan</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Kelas</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Agama</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Bangsa</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Blok / Bilik/Katil</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Status</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50 transition-colors" data-testid={`student-row-${student.id}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <GraduationCap className="text-primary-700" size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{student.full_name}</p>
                          <p className="text-xs text-slate-500">IC: {student.ic_number}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-slate-700 bg-slate-100 px-2 py-1 rounded">{student.matric_number}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{student.form}</td>
                    <td className="py-3 px-4 text-slate-700">{student.class_name}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${student.religion === 'Islam' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                        {student.religion || 'Islam'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        student.bangsa === 'Melayu' ? 'bg-amber-100 text-amber-700' : 
                        student.bangsa === 'Cina' ? 'bg-red-100 text-red-700' : 
                        student.bangsa === 'India' ? 'bg-pastel-lavender text-violet-700' : 
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {student.bangsa || 'Melayu'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{student.block_name}, {student.room_number}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge status={student.status}>
                        {student.status === 'approved' ? 'Disahkan' : student.status === 'pending' ? 'Menunggu' : 'Ditolak'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex justify-center gap-1">
                        <button 
                          onClick={() => setEditingStudent(student)} 
                          className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          title="Edit"
                          data-testid={`edit-${student.id}`}
                        >
                          <Edit size={16} />
                        </button>
                        {student.status === 'pending' && (
                          <>
                            <button 
                              onClick={() => handleApprove(student.id)} 
                              className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                              title="Sahkan"
                              data-testid={`approve-${student.id}`}
                            >
                              <Check size={16} />
                            </button>
                            <button 
                              onClick={() => handleReject(student.id)} 
                              className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                              title="Tolak"
                              data-testid={`reject-${student.id}`}
                            >
                              <X size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-sm text-slate-600">
              Memaparkan {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} daripada {pagination.total} pelajar
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchStudents(pagination.page - 1)}
                disabled={!pagination.has_prev}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${pagination.has_prev ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                data-testid="prev-page"
              >
                <ChevronLeft size={16} className="inline" /> Sebelum
              </button>
              <span className="px-3 py-1.5 rounded-lg bg-primary-700 text-white text-sm font-medium">
                {pagination.page} / {pagination.total_pages}
              </span>
              <button
                onClick={() => fetchStudents(pagination.page + 1)}
                disabled={!pagination.has_next}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${pagination.has_next ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                data-testid="next-page"
              >
                Seterus <ChevronRight size={16} className="inline" />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Edit Modal */}
      {editingStudent && (
        <EditStudentModal
          student={editingStudent}
          onClose={() => setEditingStudent(null)}
          onSave={() => fetchStudents(pagination.page)}
          systemConfig={systemConfig}
          hostelBlocks={hostelBlocks}
        />
      )}
    </div>
  );
};

export default AdminStudentsPage;
