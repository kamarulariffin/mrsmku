import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { 
  Wallet, TrendingUp, AlertCircle, Search, RefreshCw,
  ChevronLeft, ChevronRight, X, Users, CheckCircle, Clock
} from 'lucide-react';
import api from '../../services/api';

// Components
const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden shadow-sm ${className}`} {...props}>{children}</div>
);

const StatCard = ({ icon: Icon, label, value, subtext, color = 'primary', onClick, active }) => {
  const colors = { 
    primary: 'bg-primary-100 text-primary-700', 
    secondary: 'bg-amber-100 text-amber-700', 
    success: 'bg-emerald-100 text-emerald-700', 
    warning: 'bg-orange-100 text-orange-700', 
    danger: 'bg-red-100 text-red-700' 
  };
  return (
    <Card 
      className={`cursor-pointer transition-all ${active ? 'ring-2 ring-primary-500 shadow-md' : 'hover:shadow-md'}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-heading">{value}</p>
          {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
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
    tiada_yuran: 'bg-slate-100 text-slate-800'
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

const TeacherFeesPage = () => {
  const [overview, setOverview] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1 });
  const [filters, setFilters] = useState({
    search: '',
    fee_status: ''
  });

  const fetchOverview = useCallback(async () => {
    try {
      const res = await api.get('/api/guru-dashboard/overview');
      setOverview(res.data);
    } catch (err) {
      toast.error('Gagal memuatkan data ringkasan');
    }
  }, []);

  const fetchStudents = useCallback(async (page = 1, feeStatus = '') => {
    setLoadingStudents(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', pagination.limit);
      
      if (filters.search) params.append('search', filters.search);
      if (feeStatus || filters.fee_status) params.append('fee_status', feeStatus || filters.fee_status);
      
      const res = await api.get(`/api/guru-dashboard/students?${params.toString()}`);
      setStudents(res.data.students || []);
      setPagination(prev => ({ ...prev, ...res.data.pagination }));
    } catch (err) {
      toast.error('Gagal memuatkan senarai pelajar');
    } finally {
      setLoadingStudents(false);
    }
  }, [filters, pagination.limit]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchOverview(), fetchStudents()]);
      setLoading(false);
    };
    loadData();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchStudents(1);
  };

  const handleStatusFilter = (status) => {
    setFilters(prev => ({ ...prev, fee_status: prev.fee_status === status ? '' : status }));
    fetchStudents(1, filters.fee_status === status ? '' : status);
  };

  const clearFilters = () => {
    setFilters({ search: '', fee_status: '' });
    fetchStudents(1, '');
  };

  const getFeeStatusBadge = (status) => {
    const labels = {
      selesai: 'Selesai',
      separa: 'Separa Bayar',
      belum_bayar: 'Belum Bayar',
      tiada_yuran: 'Tiada Yuran'
    };
    return <Badge status={status}>{labels[status] || status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const stats = overview?.statistics || {};
  const byStatus = overview?.by_fee_status || {};

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="teacher-fees-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading flex items-center gap-2">
            <Wallet className="text-primary-600" size={28} />
            Status Yuran Kelas
          </h1>
          {overview && (
            <p className="text-slate-600 mt-1">
              Kelas: <span className="font-semibold text-primary-700">{overview.class_name}</span>
              <span className="text-slate-400 ml-2">• {overview.total_students} pelajar</span>
            </p>
          )}
        </div>
        
        <button
          onClick={() => { fetchOverview(); fetchStudents(1); }}
          className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          title="Muat Semula"
        >
          <RefreshCw size={20} className="text-slate-600" />
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={Wallet} 
          label="Dijangka Kutip" 
          value={`RM ${(stats.total_expected || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`}
          color="primary" 
        />
        <StatCard 
          icon={TrendingUp} 
          label="Sudah Dikutip" 
          value={`RM ${(stats.total_collected || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`}
          subtext={`${(stats.collection_rate || 0).toFixed(1)}% kadar kutipan`}
          color="success" 
        />
        <StatCard 
          icon={AlertCircle} 
          label="Tunggakan" 
          value={`RM ${(stats.total_outstanding || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`}
          color="danger" 
        />
        <StatCard 
          icon={Users} 
          label="Jumlah Pelajar" 
          value={overview?.total_students || 0}
          color="secondary" 
        />
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card 
          className={`cursor-pointer transition-all ${filters.fee_status === 'selesai' ? 'ring-2 ring-emerald-500' : 'hover:shadow-md'}`}
          onClick={() => handleStatusFilter('selesai')}
          data-testid="status-selesai"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <CheckCircle className="text-emerald-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{byStatus.selesai || 0}</p>
              <p className="text-sm text-slate-500">Selesai Bayar</p>
            </div>
          </div>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${filters.fee_status === 'separa' ? 'ring-2 ring-amber-500' : 'hover:shadow-md'}`}
          onClick={() => handleStatusFilter('separa')}
          data-testid="status-separa"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="text-amber-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{byStatus.separa || 0}</p>
              <p className="text-sm text-slate-500">Separa Bayar</p>
            </div>
          </div>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${filters.fee_status === 'belum_bayar' ? 'ring-2 ring-red-500' : 'hover:shadow-md'}`}
          onClick={() => handleStatusFilter('belum_bayar')}
          data-testid="status-belum-bayar"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="text-red-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{byStatus.belum_bayar || 0}</p>
              <p className="text-sm text-slate-500">Belum Bayar</p>
            </div>
          </div>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${filters.fee_status === 'tiada_yuran' ? 'ring-2 ring-slate-500' : 'hover:shadow-md'}`}
          onClick={() => handleStatusFilter('tiada_yuran')}
          data-testid="status-tiada-yuran"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Wallet className="text-slate-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-600">{byStatus.tiada_yuran || 0}</p>
              <p className="text-sm text-slate-500">Tiada Yuran</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearch} className="flex flex-1 gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                placeholder="Cari nama atau no. matrik..."
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                data-testid="search-input"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
              data-testid="search-btn"
            >
              Cari
            </button>
          </form>
          {(filters.search || filters.fee_status) && (
            <button
              onClick={clearFilters}
              className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors flex items-center gap-2"
              data-testid="clear-filters-btn"
            >
              <X size={18} />
              Reset
            </button>
          )}
        </div>
        {filters.fee_status && (
          <p className="mt-2 text-sm text-primary-600">
            Menapis: {filters.fee_status === 'selesai' ? 'Selesai Bayar' : 
                     filters.fee_status === 'separa' ? 'Separa Bayar' :
                     filters.fee_status === 'belum_bayar' ? 'Belum Bayar' : 'Tiada Yuran'}
          </p>
        )}
      </Card>

      {/* Students Table */}
      <Card className="p-0 overflow-hidden">
        {loadingStudents ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto text-slate-300 mb-3" size={48} />
            <p className="text-slate-500">Tiada pelajar dijumpai</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="fees-table">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Nama Pelajar</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">No. Matrik</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">Jumlah Yuran</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">Dibayar</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">Tunggakan</th>
                  <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Kemajuan</th>
                  <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => (
                  <tr key={student.student_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-semibold text-sm">
                          {student.full_name?.charAt(0) || '?'}
                        </div>
                        <p className="font-medium text-slate-800">{student.full_name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{student.matric_number}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      RM {student.total_fees?.toLocaleString('ms-MY', { minimumFractionDigits: 2 }) || '0.00'}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                      RM {student.paid_amount?.toLocaleString('ms-MY', { minimumFractionDigits: 2 }) || '0.00'}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600 font-medium">
                      RM {student.outstanding?.toLocaleString('ms-MY', { minimumFractionDigits: 2 }) || '0.00'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-full max-w-[100px] mx-auto">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">{student.progress_percent?.toFixed(0) || 0}%</span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all ${
                              student.progress_percent >= 100 ? 'bg-emerald-500' :
                              student.progress_percent >= 50 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(student.progress_percent || 0, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">{getFeeStatusBadge(student.fee_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loadingStudents && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-sm text-slate-600">
              Halaman {pagination.page} daripada {pagination.total_pages} ({pagination.total} pelajar)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchStudents(pagination.page - 1)}
                disabled={!pagination.has_prev}
                className="min-w-[44px] min-h-[44px] p-2 rounded-lg inline-flex items-center justify-center hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="prev-page-btn"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => fetchStudents(pagination.page + 1)}
                disabled={!pagination.has_next}
                className="min-w-[44px] min-h-[44px] p-2 rounded-lg inline-flex items-center justify-center hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="next-page-btn"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export { TeacherFeesPage };
export default TeacherFeesPage;
