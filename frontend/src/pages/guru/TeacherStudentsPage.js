import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { 
  Users, Search, Filter, RefreshCw, User, ChevronLeft, ChevronRight,
  X, Phone, Mail, MapPin, Home, GraduationCap, BookOpen
} from 'lucide-react';
import api from '../../services/api';

// Components
const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden shadow-sm ${className}`} {...props}>{children}</div>
);

const Badge = ({ status, children }) => {
  const styles = {
    selesai: 'bg-emerald-100 text-emerald-800',
    separa: 'bg-amber-100 text-amber-800',
    belum_bayar: 'bg-red-100 text-red-800',
    tiada_yuran: 'bg-slate-100 text-slate-800',
    male: 'bg-blue-100 text-blue-700',
    female: 'bg-pink-100 text-pink-700'
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

const TeacherStudentsPage = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1 });
  const [filters, setFilters] = useState({
    search: '',
    gender: '',
    religion: '',
    fee_status: ''
  });
  const [filtersApplied, setFiltersApplied] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchStudents = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', pagination.limit);
      
      if (filters.search) params.append('search', filters.search);
      if (filters.gender) params.append('gender', filters.gender);
      if (filters.religion) params.append('religion', filters.religion);
      if (filters.fee_status) params.append('fee_status', filters.fee_status);
      
      const res = await api.get(`/api/guru-dashboard/students?${params.toString()}`);
      setStudents(res.data.students || []);
      setPagination(prev => ({ ...prev, ...res.data.pagination }));
      setFiltersApplied(res.data.filters_applied || {});
    } catch (err) {
      toast.error('Gagal memuatkan senarai pelajar');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit]);

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchStudents(1);
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    fetchStudents(1);
    setShowFilters(false);
  };

  const clearFilters = () => {
    setFilters({ search: '', gender: '', religion: '', fee_status: '' });
    setTimeout(() => fetchStudents(1), 100);
    setShowFilters(false);
  };

  const fetchStudentDetail = async (studentId) => {
    setLoadingDetail(true);
    try {
      const res = await api.get(`/api/guru-dashboard/student/${studentId}`);
      setStudentDetail(res.data);
    } catch (err) {
      toast.error('Gagal memuatkan butiran pelajar');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleViewStudent = (student) => {
    setSelectedStudent(student);
    fetchStudentDetail(student.student_id);
  };

  const closeDetail = () => {
    setSelectedStudent(null);
    setStudentDetail(null);
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

  const getGenderBadge = (gender) => {
    const g = gender?.toLowerCase();
    if (g === 'male' || g === 'lelaki') return <Badge status="male">Lelaki</Badge>;
    if (g === 'female' || g === 'perempuan') return <Badge status="female">Perempuan</Badge>;
    return <Badge status="unknown">-</Badge>;
  };

  const hasActiveFilters = filters.search || filters.gender || filters.religion || filters.fee_status;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="teacher-students-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading flex items-center gap-2">
            <Users className="text-primary-600" size={28} />
            Senarai Pelajar Kelas
          </h1>
          {filtersApplied.tingkatan && (
            <p className="text-slate-600 mt-1">
              Kelas: <span className="font-semibold text-primary-700">Tingkatan {filtersApplied.tingkatan} Kelas {filtersApplied.class_name}</span>
              <span className="text-slate-400 ml-2">({pagination.total} pelajar)</span>
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              hasActiveFilters 
                ? 'bg-primary-100 text-primary-700 hover:bg-primary-200' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            data-testid="filter-toggle-btn"
          >
            <Filter size={18} />
            Tapis
            {hasActiveFilters && <span className="w-2 h-2 bg-primary-600 rounded-full"></span>}
          </button>
          <button
            onClick={() => fetchStudents(pagination.page)}
            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            title="Muat Semula"
          >
            <RefreshCw size={20} className="text-slate-600" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="p-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Cari nama, no. matrik, atau IC..."
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
      </Card>

      {/* Filters Panel */}
      {showFilters && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">Tapis Senarai</h3>
            <button onClick={() => setShowFilters(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded">
              <X size={20} className="text-slate-400" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Jantina</label>
              <select
                value={filters.gender}
                onChange={(e) => handleFilterChange('gender', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                data-testid="filter-gender"
              >
                <option value="">Semua</option>
                <option value="male">Lelaki</option>
                <option value="female">Perempuan</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Agama</label>
              <select
                value={filters.religion}
                onChange={(e) => handleFilterChange('religion', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                data-testid="filter-religion"
              >
                <option value="">Semua</option>
                <option value="Islam">Islam</option>
                <option value="Buddha">Buddha</option>
                <option value="Hindu">Hindu</option>
                <option value="Kristian">Kristian</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status Yuran</label>
              <select
                value={filters.fee_status}
                onChange={(e) => handleFilterChange('fee_status', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                data-testid="filter-fee-status"
              >
                <option value="">Semua</option>
                <option value="selesai">Selesai</option>
                <option value="separa">Separa Bayar</option>
                <option value="belum_bayar">Belum Bayar</option>
                <option value="tiada_yuran">Tiada Yuran</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={applyFilters}
                className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
                data-testid="apply-filters-btn"
              >
                Tapis
              </button>
              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
                data-testid="clear-filters-btn"
              >
                Reset
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Students Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
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
            <table className="w-full" data-testid="students-table">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Nama Pelajar</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">No. Matrik</th>
                  <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Jantina</th>
                  <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Agama</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">Jumlah Yuran</th>
                  <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Status</th>
                  <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Tindakan</th>
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
                        <div>
                          <p className="font-medium text-slate-800">{student.full_name}</p>
                          <p className="text-xs text-slate-400">{student.ic_number || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{student.matric_number}</td>
                    <td className="px-4 py-3 text-center">{getGenderBadge(student.gender)}</td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">{student.religion || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold text-slate-800">
                        RM {student.total_fees?.toLocaleString('ms-MY', { minimumFractionDigits: 2 }) || '0.00'}
                      </p>
                      {student.outstanding > 0 && (
                        <p className="text-xs text-red-500">
                          Baki: RM {student.outstanding?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">{getFeeStatusBadge(student.fee_status)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleViewStudent(student)}
                        className="px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        data-testid={`view-student-${student.student_id}`}
                      >
                        Lihat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && pagination.total_pages > 1 && (
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

      {/* Student Detail Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={closeDetail}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <User className="text-primary-600" size={22} />
                Butiran Pelajar
              </h3>
              <button onClick={closeDetail} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            {loadingDetail ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : studentDetail ? (
              <div className="p-6 space-y-6">
                {/* Student Info - using nested studentDetail.student structure */}
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-2xl font-bold">
                    {studentDetail.student?.full_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xl font-bold text-slate-800">{studentDetail.student?.full_name}</h4>
                    <p className="text-slate-500">{studentDetail.student?.matric_number}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {getGenderBadge(studentDetail.student?.gender)}
                      {getFeeStatusBadge(studentDetail.fee_summary?.progress_percent >= 100 ? 'selesai' : 
                        studentDetail.fee_summary?.paid_amount > 0 ? 'separa' : 
                        studentDetail.fee_summary?.total_fees > 0 ? 'belum_bayar' : 'tiada_yuran')}
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <GraduationCap className="text-primary-500" size={20} />
                    <div>
                      <p className="text-xs text-slate-500">Tingkatan & Kelas</p>
                      <p className="font-medium text-slate-800">T{studentDetail.student?.form} {studentDetail.student?.class_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <BookOpen className="text-emerald-500" size={20} />
                    <div>
                      <p className="text-xs text-slate-500">Agama</p>
                      <p className="font-medium text-slate-800">{studentDetail.student?.religion || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <MapPin className="text-amber-500" size={20} />
                    <div>
                      <p className="text-xs text-slate-500">Negeri</p>
                      <p className="font-medium text-slate-800">{studentDetail.student?.state || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <Home className="text-blue-500" size={20} />
                    <div>
                      <p className="text-xs text-slate-500">Asrama</p>
                      <p className="font-medium text-slate-800">{studentDetail.student?.block_name || '-'} {studentDetail.student?.room_number || ''}</p>
                    </div>
                  </div>
                </div>

                {/* Parent Info */}
                {studentDetail.parent && (
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <h5 className="font-semibold text-emerald-800 mb-3">Maklumat Ibu Bapa</h5>
                    <div className="space-y-2">
                      <p className="flex items-center gap-2 text-emerald-700">
                        <User size={16} /> {studentDetail.parent.full_name}
                      </p>
                      {studentDetail.parent.phone && (
                        <p className="flex items-center gap-2 text-emerald-700">
                          <Phone size={16} /> {studentDetail.parent.phone}
                        </p>
                      )}
                      {studentDetail.parent.email && (
                        <p className="flex items-center gap-2 text-emerald-700">
                          <Mail size={16} /> {studentDetail.parent.email}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Fee Summary - using nested studentDetail.fee_summary structure */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h5 className="font-semibold text-slate-800 mb-3">Ringkasan Yuran</h5>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-slate-800">
                        RM {studentDetail.fee_summary?.total_fees?.toLocaleString('ms-MY', { minimumFractionDigits: 2 }) || '0.00'}
                      </p>
                      <p className="text-xs text-slate-500">Jumlah Yuran</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-emerald-600">
                        RM {studentDetail.fee_summary?.paid_amount?.toLocaleString('ms-MY', { minimumFractionDigits: 2 }) || '0.00'}
                      </p>
                      <p className="text-xs text-slate-500">Dibayar</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-600">
                        RM {studentDetail.fee_summary?.outstanding?.toLocaleString('ms-MY', { minimumFractionDigits: 2 }) || '0.00'}
                      </p>
                      <p className="text-xs text-slate-500">Tunggakan</p>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">Kemajuan Bayaran</span>
                      <span className="font-medium text-slate-700">{studentDetail.fee_summary?.progress_percent?.toFixed(1) || 0}%</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
                        style={{ width: `${studentDetail.fee_summary?.progress_percent || 0}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-500">Gagal memuatkan butiran</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export { TeacherStudentsPage };
export default TeacherStudentsPage;
