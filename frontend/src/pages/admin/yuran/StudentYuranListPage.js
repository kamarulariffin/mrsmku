import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  GraduationCap, Search, ChevronLeft, ChevronRight, Users, DollarSign,
  CheckCircle2, AlertCircle, Clock, Eye, CreditCard, X, Filter, Download
} from 'lucide-react';
import api from '../../../services/api';
import { TINGKATAN_LABELS } from '../../../constants';
import { HelpManualLink } from '../../../components/common';

// Components
const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-primary-200 border-t-primary-700 ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-primary-700 hover:bg-primary-800 text-white shadow-sm',
    secondary: 'bg-amber-500 hover:bg-amber-600 text-white',
    outline: 'border-2 border-primary-700 text-primary-700 hover:bg-primary-50',
    ghost: 'text-slate-600 hover:text-primary-700 hover:bg-slate-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Select = ({ label, children, className = '', ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <select className={`flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 border-slate-200 ${className}`} {...props}>{children}</select>
  </div>
);

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 shadow-sm ${className}`} {...props}>{children}</div>
);

const Badge = ({ status, children, className = '' }) => {
  const styles = {
    paid: 'bg-emerald-100 text-emerald-800',
    partial: 'bg-amber-100 text-amber-800',
    pending: 'bg-slate-100 text-slate-600'
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'} ${className}`}>{children}</span>;
};

const STATUS_LABELS = {
  paid: 'Selesai',
  partial: 'Separuh',
  pending: 'Belum Bayar'
};

const getBillingTagMeta = (record) => {
  const billingMode = String(record?.billing_mode || '').trim();
  const isFutureYear = Number(record?.tahun || 0) > new Date().getFullYear();
  const isPrebill = billingMode === 'prebill_next_year_from_current_students' || record?.is_prebill_next_year === true;

  if (isPrebill || isFutureYear) {
    return {
      label: 'Pre-Billing Tahun Hadapan',
      className: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    };
  }
  return {
    label: 'Invoice Tahun Semasa',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  };
};

const INVOICE_STATUS_LABELS = {
  paid: 'PAID',
  partial: 'PARTIAL PAID',
  pending: 'UNPAID'
};

const formatDateTimeMs = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ms-MY');
};

const formatPaymentMethodLabel = (methodValue) => {
  const text = String(methodValue || '').trim();
  if (!text) return 'N/A';
  return text.replace(/_/g, ' ').toUpperCase();
};

const getBillingModeFilterLabel = (billingModeValue) => {
  if (billingModeValue === 'prebill_next_year') return 'Pre-Billing Tahun Hadapan';
  if (billingModeValue === 'semasa') return 'Invoice Tahun Semasa';
  return 'Semua Mode Invoice';
};

export const StudentYuranListPage = () => {
  const [yuranList, setYuranList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1 });
  
  // Filters
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedTingkatan, setSelectedTingkatan] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedBillingMode, setSelectedBillingMode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  
  // Modal states
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentHistory, setStudentHistory] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('fpx');
  const [processingPayment, setProcessingPayment] = useState(false);

  const fetchYuranList = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', 20);
      params.append('compact', 'true');
      if (selectedYear) params.append('tahun', selectedYear);
      if (selectedTingkatan) params.append('tingkatan', selectedTingkatan);
      if (selectedStatus) params.append('status', selectedStatus);
      if (selectedBillingMode) params.append('billing_mode', selectedBillingMode);
      if (searchQuery) params.append('search', searchQuery);
      
      const res = await api.get(`/api/yuran/pelajar?${params.toString()}`);
      setYuranList(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuatkan data yuran');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchYuranList(1);
  }, [selectedYear, selectedTingkatan, selectedStatus, selectedBillingMode, searchQuery]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const viewStudentHistory = async (studentId) => {
    try {
      const res = await api.get(`/api/yuran/pelajar/${studentId}`);
      setStudentHistory(res.data);
      setSelectedStudent(res.data.student);
    } catch (err) {
      toast.error('Gagal memuatkan sejarah yuran');
    }
  };

  const handlePayment = async () => {
    if (!selectedStudent || !paymentAmount) return;
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Sila masukkan jumlah yang sah');
      return;
    }
    
    // Find current year yuran record
    const currentYuran = studentHistory?.all_records?.find(r => 
      r.tahun === selectedYear && r.tingkatan === selectedStudent.current_form
    );
    
    if (!currentYuran) {
      toast.error('Tiada rekod yuran untuk dibayar');
      return;
    }
    
    setProcessingPayment(true);
    try {
      const res = await api.post(`/api/yuran/bayar/${currentYuran.id}?amount=${amount}&payment_method=${paymentMethod}`);
      toast.success(`Bayaran RM ${amount.toFixed(2)} berjaya direkodkan`);
      setShowPaymentModal(false);
      setPaymentAmount('');
      // Refresh data
      viewStudentHistory(selectedStudent.id);
      fetchYuranList(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Bayaran gagal');
    } finally {
      setProcessingPayment(false);
    }
  };

  const clearFilters = () => {
    setSelectedTingkatan('');
    setSelectedStatus('');
    setSelectedBillingMode('');
    setSearchQuery('');
    setSearchInput('');
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="student-yuran-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Senarai Yuran Pelajar</h1>
          <p className="text-slate-600 mt-1">Lihat dan urus status yuran semua pelajar</p>
          <HelpManualLink sectionId="semua-yuran" label="Manual bahagian ini" className="mt-1 inline-block" />
        </div>
        <Select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} data-testid="year-filter">
          {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
        </Select>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                placeholder="Cari nama atau no. matrik pelajar..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                data-testid="search-input"
              />
            </div>
          </form>
          
          <div className="flex flex-wrap gap-2">
            <select
              value={selectedTingkatan}
              onChange={(e) => setSelectedTingkatan(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm"
              data-testid="tingkatan-filter"
            >
              <option value="">Semua Tingkatan</option>
              {[1, 2, 3, 4, 5].map(t => <option key={t} value={t}>Tingkatan {t}</option>)}
            </select>
            
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm"
              data-testid="status-filter"
            >
              <option value="">Semua Status</option>
              <option value="paid">Selesai</option>
              <option value="partial">Separuh Bayar</option>
              <option value="pending">Belum Bayar</option>
            </select>

            <select
              value={selectedBillingMode}
              onChange={(e) => setSelectedBillingMode(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm"
              data-testid="billing-mode-filter"
            >
              <option value="">Semua Mode Invoice</option>
              <option value="semasa">Invoice Tahun Semasa</option>
              <option value="prebill_next_year">Pre-Billing Tahun Hadapan</option>
            </select>
            
            {(selectedTingkatan || selectedStatus || selectedBillingMode || searchQuery) && (
              <button onClick={clearFilters} className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
                <X size={16} className="inline mr-1" /> Reset
              </button>
            )}
          </div>
        </div>
      </Card>

      <div
        className="rounded-lg border border-primary-100 bg-primary-50 px-4 py-2.5 text-sm text-primary-900"
        data-testid="active-billing-mode-indicator"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>
            <span className="font-semibold">Mode Invoice aktif:</span>{' '}
            {getBillingModeFilterLabel(selectedBillingMode)}
          </p>
          <span
            className="inline-flex items-center rounded-full border border-primary-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-primary-800"
            data-testid="active-billing-mode-count"
          >
            {loading ? 'Memuatkan...' : `${pagination.total} rekod (halaman ini: ${yuranList.length})`}
          </span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
      ) : yuranList.length === 0 ? (
        <Card className="text-center py-12">
          <Users className="mx-auto text-slate-300" size={48} />
          <h3 className="mt-4 text-lg font-medium text-slate-700">Tiada rekod yuran</h3>
          <p className="text-slate-500 mt-1">Cuba ubah kriteria carian atau penapis</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="yuran-table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Pelajar</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">No. Matrik</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Tingkatan</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Jumlah</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Dibayar</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Baki</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Status</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yuranList.map((yuran) => {
                  const outstanding = yuran.total_amount - yuran.paid_amount;
                  const billingTag = getBillingTagMeta(yuran);
                  return (
                    <tr key={yuran.id} className="hover:bg-slate-50" data-testid={`yuran-row-${yuran.id}`}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center">
                            <GraduationCap className="text-primary-700" size={18} />
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium text-slate-900 block truncate">{yuran.student_name}</span>
                            <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${billingTag.className}`}>
                              {billingTag.label}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{yuran.matric_number}</span>
                      </td>
                      <td className="py-3 px-4 text-center text-slate-700">{TINGKATAN_LABELS[yuran.tingkatan]}</td>
                      <td className="py-3 px-4 text-right font-medium text-slate-900">
                        RM {yuran.total_amount?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right text-emerald-600 font-medium">
                        RM {yuran.paid_amount?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right text-red-600 font-medium">
                        {outstanding > 0 ? `RM ${outstanding.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge status={yuran.status}>{STATUS_LABELS[yuran.status]}</Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => viewStudentHistory(yuran.student_id)}
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
                            title="Lihat Sejarah"
                            data-testid={`view-${yuran.id}`}
                          >
                            <Eye size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-sm text-slate-600">
              Memaparkan {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} daripada {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchYuranList(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${pagination.page > 1 ? 'bg-white border text-slate-700 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                <ChevronLeft size={16} className="inline" /> Sebelum
              </button>
              <span className="px-3 py-1.5 rounded-lg bg-primary-700 text-white text-sm font-medium">
                {pagination.page} / {pagination.total_pages || 1}
              </span>
              <button
                onClick={() => fetchYuranList(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${pagination.page < pagination.total_pages ? 'bg-white border text-slate-700 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                Seterus <ChevronRight size={16} className="inline" />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Student History Slide-Over Panel */}
      <AnimatePresence>
        {studentHistory && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
              onClick={() => { setStudentHistory(null); setSelectedStudent(null); }}
            />
            {/* Slide-Over Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col"
              data-testid="student-history-panel"
            >
              {/* Header */}
              <div className="p-5 border-b bg-gradient-to-r from-primary-700 to-primary-800 text-white shrink-0">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                      <GraduationCap size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">{studentHistory.student?.name}</h3>
                      <p className="text-primary-200 text-sm mt-0.5">
                        {studentHistory.student?.matric_number} • {TINGKATAN_LABELS[studentHistory.student?.current_form]} • {studentHistory.student?.class_name}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setStudentHistory(null); setSelectedStudent(null); }} 
                    className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors"
                    data-testid="close-panel-btn"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Summary Stats - Horizontal */}
              <div className="grid grid-cols-3 border-b shrink-0">
                <div className="p-4 text-center border-r">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Jumlah</p>
                  <p className="text-lg font-bold text-slate-800 mt-1">RM {studentHistory.summary?.total_fees?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-4 text-center border-r bg-emerald-50/50">
                  <p className="text-xs text-emerald-600 uppercase tracking-wide">Dibayar</p>
                  <p className="text-lg font-bold text-emerald-700 mt-1">RM {studentHistory.summary?.total_paid?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-4 text-center bg-red-50/50">
                  <p className="text-xs text-red-600 uppercase tracking-wide">Tunggakan</p>
                  <p className="text-lg font-bold text-red-700 mt-1">RM {studentHistory.summary?.total_outstanding?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-5">
                  {/* Outstanding Alert */}
                  {studentHistory.outstanding_by_tingkatan?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <h4 className="font-semibold text-amber-800 text-sm mb-3 flex items-center gap-2">
                        <AlertCircle size={16} /> Tunggakan Mengikut Tingkatan
                      </h4>
                      <div className="space-y-2">
                        {studentHistory.outstanding_by_tingkatan.map((ting, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm bg-white/60 rounded-lg px-3 py-2">
                            <span className="text-amber-700">{TINGKATAN_LABELS[ting.tingkatan]}</span>
                            <span className="font-semibold text-amber-800">RM {ting.outstanding?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Yuran Records */}
                  <div>
                    <h4 className="font-semibold text-slate-800 text-sm mb-3">Invoice Yuran & Sejarah Bayaran</h4>
                    <div className="space-y-3">
                      {studentHistory.all_records?.map((record, idx) => {
                        const progressPercent = record.total_amount > 0
                          ? Math.min((record.paid_amount / record.total_amount) * 100, 100)
                          : 0;
                        const outstandingAmount = Math.max(0, Number(record.total_amount || 0) - Number(record.paid_amount || 0));
                        const billingTag = getBillingTagMeta(record);
                        const paymentHistory = [...(record.payments || [])].sort((a, b) =>
                          new Date(b?.paid_at || 0).getTime() - new Date(a?.paid_at || 0).getTime()
                        );
                        return (
                          <div key={idx} className="bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
                            <div className="px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${record.status === 'paid' ? 'bg-emerald-500' : record.status === 'partial' ? 'bg-amber-500' : 'bg-slate-400'}`}></div>
                                <div>
                                  <span className="font-semibold text-slate-800 text-sm">{TINGKATAN_LABELS[record.tingkatan]}</span>
                                  <span className="text-slate-400 ml-2 text-xs">({record.tahun})</span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <Badge status={record.status}>{INVOICE_STATUS_LABELS[record.status] || 'UNPAID'}</Badge>
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${billingTag.className}`}>
                                  {billingTag.label}
                                </span>
                              </div>
                            </div>
                            <div className="px-4 pb-4 space-y-2.5">
                              <p className="text-xs text-slate-500">{record.set_yuran_nama}</p>
                              <div className="grid grid-cols-3 gap-2 text-[11px]">
                                <div className="rounded-lg bg-slate-100 px-2 py-1.5">
                                  <p className="text-slate-500">Jumlah Invoice</p>
                                  <p className="font-semibold text-slate-800">RM {record.total_amount?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="rounded-lg bg-emerald-100/60 px-2 py-1.5">
                                  <p className="text-emerald-700">Jumlah Dibayar</p>
                                  <p className="font-semibold text-emerald-700">RM {record.paid_amount?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="rounded-lg bg-amber-100/60 px-2 py-1.5">
                                  <p className="text-amber-700">Baki</p>
                                  <p className="font-semibold text-amber-800">RM {outstandingAmount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                                </div>
                              </div>
                              {/* Progress bar */}
                              <div>
                                <div className="w-full bg-slate-200 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full transition-all ${record.status === 'paid' ? 'bg-emerald-500' : record.status === 'partial' ? 'bg-amber-500' : 'bg-slate-300'}`}
                                    style={{ width: `${progressPercent}%` }}
                                  ></div>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">Progress: {Math.round(progressPercent)}%</p>
                              </div>

                              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                <p className="text-xs font-semibold text-slate-700 mb-1.5">History Payment</p>
                                {paymentHistory.length === 0 ? (
                                  <p className="text-[11px] text-slate-500">Belum ada history payment untuk invoice ini.</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {paymentHistory.map((payment, paymentIdx) => (
                                      <div key={`${idx}-payment-${paymentIdx}`} className="flex items-center justify-between text-[11px]">
                                        <div className="min-w-0">
                                          <p className="font-medium text-slate-700 truncate">
                                            {formatDateTimeMs(payment?.paid_at)} · {formatPaymentMethodLabel(payment?.payment_method)}
                                          </p>
                                          <p className="text-slate-500 truncate">
                                            Resit: {payment?.receipt_number || '-'}
                                            {payment?.reference_number ? ` · Ref: ${payment.reference_number}` : ''}
                                            {payment?.paid_by_name ? ` · Oleh: ${payment.paid_by_name}` : ''}
                                          </p>
                                        </div>
                                        <span className="font-semibold text-slate-800 ml-2">
                                          RM {Number(payment?.amount || 0).toFixed(2)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="border-t p-4 bg-slate-50 flex gap-3 shrink-0">
                <Button variant="outline" className="flex-1" onClick={() => { setStudentHistory(null); setSelectedStudent(null); }}>
                  Tutup
                </Button>
                {studentHistory.summary?.total_outstanding > 0 && (
                  <Button className="flex-1" onClick={() => setShowPaymentModal(true)}>
                    <CreditCard size={18} /> Rekod Bayaran
                  </Button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Payment Slide-Over Panel */}
      <AnimatePresence>
        {showPaymentModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
              onClick={() => setShowPaymentModal(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-[60] flex flex-col"
              data-testid="payment-panel"
            >
              {/* Header */}
              <div className="p-5 border-b bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                      <CreditCard size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold">Rekod Bayaran</h3>
                      <p className="text-emerald-200 text-sm">{studentHistory?.student?.name}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowPaymentModal(false)} 
                    className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Outstanding Amount */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 text-center border border-amber-200">
                  <p className="text-sm text-amber-600 uppercase tracking-wide">Baki Tertunggak</p>
                  <p className="text-3xl font-bold text-amber-800 mt-1">
                    RM {studentHistory?.summary?.total_outstanding?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                {/* Payment Amount Input */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Jumlah Bayaran</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">RM</span>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-12 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-lg font-medium"
                      data-testid="payment-amount"
                    />
                  </div>
                  {/* Quick Amount Buttons */}
                  <div className="flex gap-2 mt-2">
                    {[50, 100, 200].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setPaymentAmount(amt.toString())}
                        className="flex-1 py-2 px-3 text-sm font-medium bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        RM {amt}
                      </button>
                    ))}
                    <button
                      onClick={() => setPaymentAmount(studentHistory?.summary?.total_outstanding?.toString() || '0')}
                      className="flex-1 py-2 px-3 text-sm font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg transition-colors"
                    >
                      Penuh
                    </button>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Kaedah Bayaran</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'fpx', label: 'FPX Online', icon: '🏦' },
                      { value: 'card', label: 'Kad Kredit/Debit', icon: '💳' },
                      { value: 'cash', label: 'Tunai', icon: '💵' },
                      { value: 'bank_transfer', label: 'Pindahan Bank', icon: '🔄' }
                    ].map(method => (
                      <button
                        key={method.value}
                        onClick={() => setPaymentMethod(method.value)}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          paymentMethod === method.value 
                            ? 'border-emerald-500 bg-emerald-50' 
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                        data-testid={`payment-method-${method.value}`}
                      >
                        <span className="text-lg">{method.icon}</span>
                        <p className={`text-sm font-medium mt-1 ${paymentMethod === method.value ? 'text-emerald-700' : 'text-slate-700'}`}>
                          {method.label}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info Note */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
                  <AlertCircle size={18} className="text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">
                    <strong>Nota:</strong> Bayaran ini adalah simulasi untuk tujuan demo. Integrasi payment gateway sebenar akan dilaksanakan kemudian.
                  </p>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="border-t p-4 bg-slate-50 flex gap-3 shrink-0">
                <Button variant="outline" className="flex-1" onClick={() => setShowPaymentModal(false)}>
                  Batal
                </Button>
                <Button variant="success" className="flex-1" onClick={handlePayment} loading={processingPayment}>
                  <CheckCircle2 size={18} /> Sahkan Bayaran
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StudentYuranListPage;
