import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Users, Wallet, TrendingUp, AlertCircle, BookOpen, Search,
  Filter, ChevronDown, ChevronUp, Eye, X, RefreshCw,
  User, MapPin, Phone, Mail, Building, Calendar, CreditCard,
  Bell, Send, CheckCircle, Loader2
} from 'lucide-react';
import api from '../../services/api';

// Components
const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden shadow-sm ${className}`} {...props}>{children}</div>
);

const StatCard = ({ icon: Icon, label, value, subtext, color = 'primary', trend }) => {
  const colors = {
    primary: 'bg-primary-100 text-primary-700',
    secondary: 'bg-amber-100 text-amber-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-orange-100 text-orange-700',
    danger: 'bg-red-100 text-red-700'
  };
  return (
    <Card className="animate-fadeIn hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-heading">{value}</p>
          {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
          {trend && (
            <p className={`text-xs mt-1 ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colors[color]}`}><Icon size={24} /></div>
      </div>
    </Card>
  );
};

const Badge = ({ status, children }) => {
  const styles = {
    selesai: 'bg-emerald-100 text-emerald-800',
    separa: 'bg-amber-100 text-amber-800',
    belum_bayar: 'bg-red-100 text-red-800',
    tiada_yuran: 'bg-slate-100 text-slate-600',
    male: 'bg-blue-100 text-blue-800',
    female: 'bg-pink-100 text-pink-800'
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

const ProgressBar = ({ value, max, color = 'emerald' }) => {
  const percent = max > 0 ? (value / max) * 100 : 0;
  const colorClass = percent >= 80 ? 'bg-emerald-500' : percent >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="w-full bg-slate-200 rounded-full h-2">
      <div className={`h-2 rounded-full transition-all duration-300 ${colorClass}`} style={{ width: `${Math.min(percent, 100)}%` }}></div>
    </div>
  );
};

const GuruClassDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [students, setStudents] = useState([]);
  const [filterOptions, setFilterOptions] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // Reminder states
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedForReminder, setSelectedForReminder] = useState([]);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);
  
  // Filters
  const [filters, setFilters] = useState({
    tahun: new Date().getFullYear(),
    gender: '',
    religion: '',
    bangsa: '',
    state: '',
    fee_status: '',
    search: ''
  });
  
  // Fetch overview
  const fetchOverview = useCallback(async () => {
    try {
      const res = await api.get('/api/guru-dashboard/overview', {
        params: { tahun: filters.tahun }
      });
      setOverview(res.data);
    } catch (err) {
      console.error('Failed to fetch overview:', err);
      toast.error('Gagal memuatkan data dashboard');
    }
  }, [filters.tahun]);
  
  // Fetch students
  const fetchStudents = useCallback(async (page = 1) => {
    try {
      const params = {
        page,
        limit: pagination.limit,
        tahun: filters.tahun || undefined,
        gender: filters.gender || undefined,
        religion: filters.religion || undefined,
        bangsa: filters.bangsa || undefined,
        state: filters.state || undefined,
        fee_status: filters.fee_status || undefined,
        search: filters.search || undefined
      };
      
      // Remove undefined values
      Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
      
      const res = await api.get('/api/guru-dashboard/students', { params });
      setStudents(res.data.students);
      setPagination(prev => ({ ...prev, ...res.data.pagination }));
    } catch (err) {
      console.error('Failed to fetch students:', err);
      toast.error('Gagal memuatkan senarai pelajar');
    }
  }, [filters, pagination.limit]);
  
  // Fetch filter options
  const fetchFilterOptions = useCallback(async () => {
    try {
      const res = await api.get('/api/guru-dashboard/filter-options');
      setFilterOptions(res.data);
    } catch (err) {
      console.error('Failed to fetch filter options:', err);
    }
  }, []);
  
  // Fetch student detail
  const fetchStudentDetail = async (studentId) => {
    setLoadingDetail(true);
    try {
      const res = await api.get(`/api/guru-dashboard/student/${studentId}`);
      setStudentDetail(res.data);
    } catch (err) {
      console.error('Failed to fetch student detail:', err);
      toast.error('Gagal memuatkan maklumat pelajar');
    } finally {
      setLoadingDetail(false);
    }
  };
  
  // Send reminder function
  const sendReminder = async (studentIds = null, sendToAll = false) => {
    setSendingReminder(true);
    setReminderResult(null);
    
    try {
      const params = new URLSearchParams();
      if (sendToAll) {
        params.append('send_to_all', 'true');
      }
      if (filters.tahun) {
        params.append('tahun', filters.tahun);
      }
      
      let url = `/api/guru-dashboard/send-reminder?${params.toString()}`;
      
      const payload = studentIds ? { student_ids: studentIds } : {};
      
      const res = await api.post(url, payload);
      setReminderResult(res.data);
      
      if (res.data.notifications_sent > 0) {
        toast.success(`Berjaya menghantar ${res.data.notifications_sent} peringatan`);
      } else {
        toast.info(res.data.message || 'Tiada peringatan dihantar');
      }
    } catch (err) {
      console.error('Failed to send reminder:', err);
      toast.error('Gagal menghantar peringatan');
      setReminderResult({ status: 'error', message: 'Gagal menghantar peringatan' });
    } finally {
      setSendingReminder(false);
    }
  };
  
  // Handle send reminder to selected students
  const handleSendToSelected = () => {
    if (selectedForReminder.length === 0) {
      toast.error('Sila pilih pelajar terlebih dahulu');
      return;
    }
    sendReminder(selectedForReminder, false);
  };
  
  // Handle send reminder to all with outstanding
  const handleSendToAll = () => {
    sendReminder(null, true);
  };
  
  // Toggle student selection for reminder
  const toggleStudentSelection = (studentId) => {
    setSelectedForReminder(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };
  
  // Select all students with outstanding
  const selectAllOutstanding = () => {
    const outstandingIds = students
      .filter(s => s.fee_status === 'belum_bayar' || s.fee_status === 'separa')
      .map(s => s.student_id);
    setSelectedForReminder(outstandingIds);
  };
  
  // Clear selection
  const clearSelection = () => {
    setSelectedForReminder([]);
  };
  
  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchOverview(), fetchFilterOptions()]);
      await fetchStudents(1);
      setLoading(false);
    };
    loadData();
  }, []);
  
  // Reload when filters change
  useEffect(() => {
    if (!loading) {
      fetchStudents(1);
      fetchOverview();
    }
  }, [filters.tahun, filters.gender, filters.religion, filters.bangsa, filters.state, filters.fee_status]);
  
  // Handle search with debounce
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        fetchStudents(1);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [filters.search]);
  
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  
  const clearFilters = () => {
    setFilters({
      tahun: new Date().getFullYear(),
      gender: '',
      religion: '',
      bangsa: '',
      state: '',
      fee_status: '',
      search: ''
    });
  };
  
  const handleViewStudent = (student) => {
    setSelectedStudent(student);
    fetchStudentDetail(student.student_id);
  };
  
  const getFeeStatusLabel = (status) => {
    const labels = {
      selesai: 'Selesai',
      separa: 'Separa',
      belum_bayar: 'Belum Bayar',
      tiada_yuran: 'Tiada Yuran'
    };
    return labels[status] || status;
  };
  
  const getGenderLabel = (gender) => {
    if (gender?.toLowerCase() === 'male' || gender?.toLowerCase() === 'lelaki') return 'Lelaki';
    if (gender?.toLowerCase() === 'female' || gender?.toLowerCase() === 'perempuan') return 'Perempuan';
    return gender || '-';
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }
  
  const hasActiveFilters = filters.gender || filters.religion || filters.bangsa || filters.state || filters.fee_status || filters.search;
  const outstandingCount = (overview?.by_fee_status?.belum_bayar || 0) + (overview?.by_fee_status?.separa || 0);
  
  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="guru-class-dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Dashboard Guru Kelas</h1>
          <p className="text-slate-600">Kelas: <span className="font-semibold">{overview?.class_name || '-'}</span></p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Send Reminder Button */}
          {outstandingCount > 0 && (
            <button
              onClick={() => setShowReminderModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
              data-testid="send-reminder-btn"
            >
              <Bell size={18} />
              Hantar Peringatan
            </button>
          )}
          
          <select
            value={filters.tahun}
            onChange={(e) => handleFilterChange('tahun', parseInt(e.target.value))}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            data-testid="year-filter"
          >
            {filterOptions?.tahun?.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          
          <button
            onClick={() => { fetchOverview(); fetchStudents(pagination.page); }}
            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            title="Muat Semula"
          >
            <RefreshCw size={20} className="text-slate-600" />
          </button>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Jumlah Pelajar"
          value={overview?.total_students || 0}
          color="primary"
        />
        <StatCard
          icon={Wallet}
          label="Dijangka Kutip"
          value={`RM ${(overview?.statistics?.total_expected || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`}
          color="secondary"
        />
        <StatCard
          icon={TrendingUp}
          label="Sudah Dikutip"
          value={`RM ${(overview?.statistics?.total_collected || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`}
          subtext={`${(overview?.statistics?.collection_rate || 0).toFixed(1)}% kutipan`}
          color="success"
        />
        <StatCard
          icon={AlertCircle}
          label="Tunggakan"
          value={`RM ${(overview?.statistics?.total_outstanding || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`}
          color="danger"
        />
      </div>
      
      {/* Fee Status Breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:bg-emerald-50 transition-colors" onClick={() => handleFilterChange('fee_status', 'selesai')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Selesai Bayar</p>
              <p className="text-xl font-bold text-emerald-600">{overview?.by_fee_status?.selesai || 0}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <span className="text-emerald-600">✓</span>
            </div>
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:bg-amber-50 transition-colors" onClick={() => handleFilterChange('fee_status', 'separa')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Bayaran Separa</p>
              <p className="text-xl font-bold text-amber-600">{overview?.by_fee_status?.separa || 0}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <span className="text-amber-600">◐</span>
            </div>
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:bg-red-50 transition-colors" onClick={() => handleFilterChange('fee_status', 'belum_bayar')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Belum Bayar</p>
              <p className="text-xl font-bold text-red-600">{overview?.by_fee_status?.belum_bayar || 0}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-red-600">✗</span>
            </div>
          </div>
        </Card>
        
        <Card className="cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleFilterChange('fee_status', 'tiada_yuran')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Tiada Yuran</p>
              <p className="text-xl font-bold text-slate-600">{overview?.by_fee_status?.tiada_yuran || 0}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
              <span className="text-slate-500">-</span>
            </div>
          </div>
        </Card>
      </div>
      
      {/* Demographics Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Gender */}
        <Card>
          <h3 className="font-semibold text-slate-800 mb-4">Mengikut Jantina</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Lelaki</span>
              <div className="flex items-center gap-3">
                <div className="w-32">
                  <ProgressBar value={overview?.by_gender?.male || 0} max={overview?.total_students || 1} />
                </div>
                <span className="font-semibold text-blue-600 w-8">{overview?.by_gender?.male || 0}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Perempuan</span>
              <div className="flex items-center gap-3">
                <div className="w-32">
                  <ProgressBar value={overview?.by_gender?.female || 0} max={overview?.total_students || 1} />
                </div>
                <span className="font-semibold text-pink-600 w-8">{overview?.by_gender?.female || 0}</span>
              </div>
            </div>
          </div>
        </Card>
        
        {/* By Religion */}
        <Card>
          <h3 className="font-semibold text-slate-800 mb-4">Mengikut Agama</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {overview?.by_religion && Object.entries(overview.by_religion).map(([religion, count]) => (
              <div key={religion} className="flex items-center justify-between py-1">
                <span className="text-slate-600">{religion}</span>
                <span className="font-semibold text-slate-800">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      
      {/* Top Outstanding Students */}
      {overview?.top_outstanding?.length > 0 && (
        <Card>
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <AlertCircle className="text-red-500" size={20} />
            Pelajar dengan Tunggakan Tertinggi
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="pb-2">Nama</th>
                  <th className="pb-2">No. Matrik</th>
                  <th className="pb-2 text-right">Tunggakan</th>
                </tr>
              </thead>
              <tbody>
                {overview.top_outstanding.slice(0, 5).map((student, i) => (
                  <tr key={student.student_id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 font-medium">{student.full_name}</td>
                    <td className="py-2 text-slate-600">{student.matric_number}</td>
                    <td className="py-2 text-right font-semibold text-red-600">
                      RM {student.outstanding.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      
      {/* Students List Section */}
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <BookOpen size={20} />
            Senarai Pelajar
          </h3>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Cari nama atau matrik..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                data-testid="search-input"
              />
            </div>
            
            {/* Toggle Filters */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${hasActiveFilters ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <Filter size={18} />
              Penapis
              {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-primary-500"></span>}
              {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 min-h-[44px] px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
              >
                <X size={16} />
                Reset
              </button>
            )}
          </div>
        </div>
        
        {/* Filter Panel */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 p-4 bg-slate-50 rounded-lg mb-4" data-testid="filter-panel">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Jantina</label>
              <select
                value={filters.gender}
                onChange={(e) => handleFilterChange('gender', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                data-testid="gender-filter"
              >
                <option value="">Semua</option>
                {filterOptions?.gender?.map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Agama</label>
              <select
                value={filters.religion}
                onChange={(e) => handleFilterChange('religion', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                data-testid="religion-filter"
              >
                <option value="">Semua</option>
                {filterOptions?.religion?.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Bangsa</label>
              <select
                value={filters.bangsa}
                onChange={(e) => handleFilterChange('bangsa', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                data-testid="bangsa-filter"
              >
                <option value="">Semua</option>
                {filterOptions?.bangsa?.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Negeri</label>
              <select
                value={filters.state}
                onChange={(e) => handleFilterChange('state', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                data-testid="state-filter"
              >
                <option value="">Semua</option>
                {filterOptions?.state?.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status Yuran</label>
              <select
                value={filters.fee_status}
                onChange={(e) => handleFilterChange('fee_status', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                data-testid="fee-status-filter"
              >
                <option value="">Semua</option>
                {filterOptions?.fee_status?.map(fs => (
                  <option key={fs.value} value={fs.value}>{fs.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        
        {/* Students Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-3 font-medium">Nama Pelajar</th>
                <th className="pb-3 font-medium">No. Matrik</th>
                <th className="pb-3 font-medium hidden md:table-cell">Jantina</th>
                <th className="pb-3 font-medium hidden lg:table-cell">Agama</th>
                <th className="pb-3 font-medium text-right">Jumlah Yuran</th>
                <th className="pb-3 font-medium text-right">Dibayar</th>
                <th className="pb-3 font-medium text-center">Status</th>
                <th className="pb-3 font-medium text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-slate-500">
                    Tiada pelajar dijumpai
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr key={student.student_id} className="border-b border-slate-50 hover:bg-slate-50" data-testid={`student-row-${student.student_id}`}>
                    <td className="py-3">
                      <div>
                        <p className="font-medium text-slate-800">{student.full_name}</p>
                        <p className="text-xs text-slate-500">T{student.form} - Kelas {student.class_name}</p>
                      </div>
                    </td>
                    <td className="py-3 text-slate-600">{student.matric_number}</td>
                    <td className="py-3 hidden md:table-cell">
                      <Badge status={student.gender?.toLowerCase() === 'male' ? 'male' : 'female'}>
                        {getGenderLabel(student.gender)}
                      </Badge>
                    </td>
                    <td className="py-3 hidden lg:table-cell text-slate-600">{student.religion}</td>
                    <td className="py-3 text-right font-medium">
                      RM {student.total_fees.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 text-right">
                      <div>
                        <span className="font-medium text-emerald-600">
                          RM {student.paid_amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                        </span>
                        <div className="mt-1">
                          <ProgressBar value={student.paid_amount} max={student.total_fees} />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      <Badge status={student.fee_status}>{getFeeStatusLabel(student.fee_status)}</Badge>
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => handleViewStudent(student)}
                        className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-primary-100 rounded-lg transition-colors text-primary-600"
                        title="Lihat Detail"
                        data-testid={`view-student-${student.student_id}`}
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {pagination.total > pagination.limit && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              Menunjukkan {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} daripada {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchStudents(pagination.page - 1)}
                disabled={!pagination.has_prev}
                className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Sebelum
              </button>
              <span className="px-3 py-1 text-sm bg-primary-100 text-primary-700 rounded-lg font-medium">
                {pagination.page}
              </span>
              <button
                onClick={() => fetchStudents(pagination.page + 1)}
                disabled={!pagination.has_next}
                className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Seterusnya
              </button>
            </div>
          </div>
        )}
      </Card>
      
      {/* Student Detail Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={() => setSelectedStudent(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Maklumat Pelajar</h3>
              <button onClick={() => setSelectedStudent(null)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {loadingDetail ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="lg" />
                </div>
              ) : studentDetail ? (
                <div className="space-y-6">
                  {/* Student Info */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <User size={18} />
                      Maklumat Pelajar
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-500">Nama:</span>
                        <p className="font-medium">{studentDetail.student.full_name}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">No. Matrik:</span>
                        <p className="font-medium">{studentDetail.student.matric_number}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">No. IC:</span>
                        <p className="font-medium">{studentDetail.student.ic_number}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Tingkatan/Kelas:</span>
                        <p className="font-medium">T{studentDetail.student.form} - {studentDetail.student.class_name}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Jantina:</span>
                        <p className="font-medium">{getGenderLabel(studentDetail.student.gender)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Agama:</span>
                        <p className="font-medium">{studentDetail.student.religion}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Bangsa:</span>
                        <p className="font-medium">{studentDetail.student.bangsa}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Negeri:</span>
                        <p className="font-medium">{studentDetail.student.state || '-'}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Blok Asrama:</span>
                        <p className="font-medium">{studentDetail.student.block_name || '-'}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">No. Bilik/Katil:</span>
                        <p className="font-medium">{studentDetail.student.room_number || '-'}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Parent Info */}
                  {studentDetail.parent && (
                    <div className="bg-blue-50 rounded-xl p-4">
                      <h4 className="font-semibold text-blue-700 mb-3 flex items-center gap-2">
                        <Users size={18} />
                        Maklumat Ibu Bapa
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-blue-600">Nama:</span>
                          <p className="font-medium text-slate-800">{studentDetail.parent.full_name}</p>
                        </div>
                        <div>
                          <span className="text-blue-600">Email:</span>
                          <p className="font-medium text-slate-800">{studentDetail.parent.email || '-'}</p>
                        </div>
                        <div>
                          <span className="text-blue-600">No. Telefon:</span>
                          <p className="font-medium text-slate-800">{studentDetail.parent.phone || '-'}</p>
                        </div>
                        <div>
                          <span className="text-blue-600">No. Alternatif:</span>
                          <p className="font-medium text-slate-800">{studentDetail.parent.phone_alt || '-'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Fee Summary */}
                  <div className="bg-emerald-50 rounded-xl p-4">
                    <h4 className="font-semibold text-emerald-700 mb-3 flex items-center gap-2">
                      <CreditCard size={18} />
                      Ringkasan Yuran
                    </h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-emerald-600">Jumlah</p>
                        <p className="text-xl font-bold text-slate-800">
                          RM {studentDetail.fee_summary.total_fees.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-emerald-600">Dibayar</p>
                        <p className="text-xl font-bold text-emerald-600">
                          RM {studentDetail.fee_summary.paid_amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-emerald-600">Tunggakan</p>
                        <p className="text-xl font-bold text-red-600">
                          RM {studentDetail.fee_summary.outstanding.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-slate-600">Kemajuan Bayaran</span>
                        <span className="font-medium">{studentDetail.fee_summary.progress_percent.toFixed(1)}%</span>
                      </div>
                      <ProgressBar value={studentDetail.fee_summary.paid_amount} max={studentDetail.fee_summary.total_fees} />
                    </div>
                  </div>
                  
                  {/* Yuran Records */}
                  {studentDetail.yuran_records?.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-700 mb-3">Rekod Yuran</h4>
                      <div className="space-y-3">
                        {studentDetail.yuran_records.map(record => (
                          <div key={record.id} className="border border-slate-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="font-medium text-slate-800">{record.set_yuran_nama}</p>
                                <p className="text-sm text-slate-500">Tahun {record.tahun} - Tingkatan {record.tingkatan}</p>
                              </div>
                              <Badge status={record.status === 'paid' ? 'selesai' : record.status === 'partial' ? 'separa' : 'belum_bayar'}>
                                {record.status === 'paid' ? 'Selesai' : record.status === 'partial' ? 'Separa' : 'Belum Bayar'}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-600">
                                RM {record.paid_amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })} / RM {record.total_amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                              </span>
                              <ProgressBar value={record.paid_amount} max={record.total_amount} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-slate-500 py-8">Gagal memuatkan maklumat</p>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Send Reminder Modal */}
      {showReminderModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={() => !sendingReminder && setShowReminderModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Bell className="text-orange-500" size={22} />
                Hantar Peringatan Yuran
              </h3>
              <button 
                onClick={() => !sendingReminder && setShowReminderModal(false)} 
                className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg disabled:opacity-50"
                disabled={sendingReminder}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Summary */}
              <div className="bg-orange-50 rounded-xl p-4">
                <p className="text-sm text-orange-700">
                  Terdapat <span className="font-bold">{outstandingCount}</span> pelajar dengan tunggakan yuran dalam kelas anda.
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  Jumlah tunggakan: <span className="font-semibold">RM {(overview?.statistics?.total_outstanding || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</span>
                </p>
              </div>
              
              {/* Options */}
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer" onClick={() => !sendingReminder && handleSendToAll()}>
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Send size={20} className="text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">Hantar kepada Semua</p>
                    <p className="text-sm text-slate-500">Hantar peringatan kepada semua ibu bapa yang mempunyai tunggakan</p>
                  </div>
                  {sendingReminder && (
                    <Loader2 size={20} className="animate-spin text-orange-500" />
                  )}
                </div>
                
                <div className="text-center text-sm text-slate-400">atau</div>
                
                <div className="p-4 border border-slate-200 rounded-xl">
                  <p className="font-medium text-slate-800 mb-3">Pilih Pelajar Tertentu</p>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {students.filter(s => s.fee_status === 'belum_bayar' || s.fee_status === 'separa').map(student => (
                      <label key={student.student_id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedForReminder.includes(student.student_id)}
                          onChange={() => toggleStudentSelection(student.student_id)}
                          className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-700">{student.full_name}</p>
                          <p className="text-xs text-slate-500">Tunggakan: RM {student.outstanding.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  
                  <div className="flex items-center justify-between mt-3 pt-3 border-t">
                    <div className="flex gap-2">
                      <button
                        onClick={selectAllOutstanding}
                        className="text-xs text-primary-600 hover:underline"
                        disabled={sendingReminder}
                      >
                        Pilih Semua
                      </button>
                      <button
                        onClick={clearSelection}
                        className="text-xs text-slate-500 hover:underline"
                        disabled={sendingReminder}
                      >
                        Kosongkan
                      </button>
                    </div>
                    <button
                      onClick={handleSendToSelected}
                      disabled={selectedForReminder.length === 0 || sendingReminder}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingReminder ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      Hantar ({selectedForReminder.length})
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Result */}
              {reminderResult && (
                <div className={`p-4 rounded-xl ${reminderResult.status === 'success' ? 'bg-emerald-50' : reminderResult.status === 'no_action' ? 'bg-slate-50' : 'bg-red-50'}`}>
                  <div className="flex items-start gap-3">
                    {reminderResult.status === 'success' ? (
                      <CheckCircle size={20} className="text-emerald-600 mt-0.5" />
                    ) : (
                      <AlertCircle size={20} className={reminderResult.status === 'no_action' ? 'text-slate-500' : 'text-red-500'} />
                    )}
                    <div>
                      <p className={`font-medium ${reminderResult.status === 'success' ? 'text-emerald-700' : reminderResult.status === 'no_action' ? 'text-slate-700' : 'text-red-700'}`}>
                        {reminderResult.message}
                      </p>
                      {reminderResult.notifications_sent > 0 && (
                        <p className="text-sm text-slate-600 mt-1">
                          {reminderResult.notifications_sent} notifikasi dalam aplikasi
                          {reminderResult.emails_sent > 0 && `, ${reminderResult.emails_sent} email`} dihantar
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-500 text-center">
                Peringatan akan dihantar sebagai notifikasi dalam aplikasi. Email akan dihantar jika sistem email aktif.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { GuruClassDashboard };
export default GuruClassDashboard;
