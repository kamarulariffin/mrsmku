import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Wallet, Clock, CheckCircle, XCircle, AlertCircle,
  Search, Filter, RefreshCw, Building2, User, DollarSign,
  ChevronDown, ChevronUp, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../services/api';

const PayoutManagementPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState([]);
  const [pagination, setPagination] = useState({});
  const [statusCounts, setStatusCounts] = useState({});
  const [filterStatus, setFilterStatus] = useState('pending');
  const [currentPage, setCurrentPage] = useState(1);
  
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processForm, setProcessForm] = useState({
    action: '',
    reference_number: '',
    rejection_reason: ''
  });

  useEffect(() => {
    fetchPayouts();
  }, [filterStatus, currentPage]);

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus && filterStatus !== 'all') {
        params.append('status', filterStatus);
      }
      params.append('page', currentPage);
      params.append('limit', 20);
      
      const res = await api.get(`/api/marketplace/payouts/all?${params.toString()}`);
      setPayouts(res.data.payouts || []);
      setPagination(res.data.pagination || {});
      setStatusCounts(res.data.status_counts || {});
    } catch (error) {
      console.error('Error fetching payouts:', error);
      toast.error('Gagal memuatkan senarai pengeluaran');
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = (payout, action) => {
    setSelectedPayout(payout);
    setProcessForm({
      action,
      reference_number: '',
      rejection_reason: ''
    });
    setShowProcessModal(true);
  };

  const submitProcess = async () => {
    if (!selectedPayout) return;
    
    if (processForm.action === 'completed' && !processForm.reference_number.trim()) {
      toast.error('Sila masukkan nombor rujukan transaksi');
      return;
    }
    
    if (processForm.action === 'rejected' && !processForm.rejection_reason.trim()) {
      toast.error('Sila nyatakan sebab penolakan');
      return;
    }
    
    setProcessing(true);
    try {
      await api.put(`/api/marketplace/payouts/${selectedPayout.id}/approve`, {
        status: processForm.action,
        reference_number: processForm.reference_number || null,
        rejection_reason: processForm.rejection_reason || null
      });
      
      toast.success(`Permohonan berjaya di${processForm.action === 'completed' ? 'proses' : processForm.action === 'approved' ? 'luluskan' : 'tolak'}`);
      setShowProcessModal(false);
      setSelectedPayout(null);
      fetchPayouts();
    } catch (error) {
      console.error('Error processing payout:', error);
      toast.error(error.response?.data?.detail || 'Gagal memproses permohonan');
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ms-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-amber-100 text-amber-700', icon: Clock, label: 'Menunggu' },
      approved: { color: 'bg-blue-100 text-blue-700', icon: CheckCircle, label: 'Diluluskan' },
      completed: { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle, label: 'Selesai' },
      rejected: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Ditolak' }
    };
    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${badge.color}`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    );
  };

  const statusFilters = [
    { value: 'all', label: 'Semua', count: Object.values(statusCounts).reduce((a, b) => a + b, 0) },
    { value: 'pending', label: 'Menunggu', count: statusCounts.pending || 0 },
    { value: 'approved', label: 'Diluluskan', count: statusCounts.approved || 0 },
    { value: 'completed', label: 'Selesai', count: statusCounts.completed || 0 },
    { value: 'rejected', label: 'Ditolak', count: statusCounts.rejected || 0 }
  ];

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="payout-management-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/admin/marketplace/finance')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            data-testid="back-btn"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Wallet className="h-6 w-6 text-emerald-600" />
              Pengurusan Pengeluaran Wang
            </h1>
            <p className="text-gray-500">Lulus atau tolak permohonan pengeluaran vendor</p>
          </div>
        </div>
        <button
          onClick={fetchPayouts}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
          data-testid="refresh-btn"
        >
          <RefreshCw className={`h-5 w-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {statusFilters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => {
              setFilterStatus(filter.value);
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              filterStatus === filter.value
                ? 'bg-emerald-600 text-white'
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}
            data-testid={`filter-${filter.value}`}
          >
            {filter.label}
            <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
              filterStatus === filter.value ? 'bg-white/20' : 'bg-gray-100'
            }`}>
              {filter.count}
            </span>
          </button>
        ))}
      </div>

      {/* Payouts List */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          </div>
        ) : payouts.length === 0 ? (
          <div className="text-center py-12">
            <Wallet className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">Tiada permohonan pengeluaran</p>
          </div>
        ) : (
          <div className="divide-y">
            {payouts.map((payout) => (
              <div key={payout.id} className="p-4 hover:bg-gray-50 transition" data-testid={`payout-${payout.id}`}>
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Vendor & Amount Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{payout.vendor_name}</p>
                        <p className="text-sm text-gray-500">Dimohon: {formatDate(payout.requested_at)}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Jumlah</p>
                        <p className="text-xl font-bold text-emerald-600">{formatCurrency(payout.amount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Bank</p>
                        <p className="font-medium text-gray-900">{payout.bank_name}</p>
                        <p className="text-sm text-gray-500">****{payout.bank_account_number.slice(-4)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Nama Pemegang</p>
                        <p className="font-medium text-gray-900">{payout.bank_account_name}</p>
                      </div>
                    </div>
                    
                    {payout.notes && (
                      <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-600">
                        <span className="font-medium">Nota:</span> {payout.notes}
                      </div>
                    )}
                    
                    {payout.rejection_reason && (
                      <div className="mt-3 p-2 bg-red-50 rounded text-sm text-red-600">
                        <span className="font-medium">Sebab Penolakan:</span> {payout.rejection_reason}
                      </div>
                    )}
                    
                    {payout.reference_number && (
                      <div className="mt-3 p-2 bg-emerald-50 rounded text-sm text-emerald-600">
                        <span className="font-medium">Rujukan:</span> {payout.reference_number}
                      </div>
                    )}
                  </div>
                  
                  {/* Right: Status & Actions */}
                  <div className="flex flex-col items-end gap-3">
                    {getStatusBadge(payout.status)}
                    
                    {payout.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleProcess(payout, 'approved')}
                          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                          data-testid={`approve-${payout.id}`}
                        >
                          Luluskan
                        </button>
                        <button
                          onClick={() => handleProcess(payout, 'rejected')}
                          className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
                          data-testid={`reject-${payout.id}`}
                        >
                          Tolak
                        </button>
                      </div>
                    )}
                    
                    {payout.status === 'approved' && (
                      <button
                        onClick={() => handleProcess(payout, 'completed')}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition"
                        data-testid={`complete-${payout.id}`}
                      >
                        Tandakan Selesai
                      </button>
                    )}
                    
                    {payout.processed_at && (
                      <p className="text-xs text-gray-500">
                        Diproses: {formatDate(payout.processed_at)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="p-4 border-t flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Halaman {pagination.page} dari {pagination.pages} ({pagination.total} rekod)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sebelum
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(pagination.pages, p + 1))}
                disabled={currentPage === pagination.pages}
                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Seterusnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Process Modal */}
      {showProcessModal && selectedPayout && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0 p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              {processForm.action === 'completed' ? (
                <>
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  Tandakan Selesai
                </>
              ) : processForm.action === 'approved' ? (
                <>
                  <CheckCircle className="h-5 w-5 text-blue-600" />
                  Luluskan Pengeluaran
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  Tolak Pengeluaran
                </>
              )}
            </h2>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-500">Vendor</p>
              <p className="font-semibold text-gray-900">{selectedPayout.vendor_name}</p>
              <p className="text-2xl font-bold text-emerald-600 mt-2">{formatCurrency(selectedPayout.amount)}</p>
              <p className="text-sm text-gray-500 mt-1">
                {selectedPayout.bank_name} - {selectedPayout.bank_account_number}
              </p>
            </div>
            
            {processForm.action === 'completed' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombor Rujukan Transaksi *
                </label>
                <input
                  type="text"
                  value={processForm.reference_number}
                  onChange={(e) => setProcessForm(prev => ({ ...prev, reference_number: e.target.value }))}
                  placeholder="Contoh: TRX123456789"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  data-testid="reference-number-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Masukkan nombor rujukan dari bank selepas transaksi dibuat
                </p>
              </div>
            )}
            
            {processForm.action === 'rejected' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sebab Penolakan *
                </label>
                <textarea
                  value={processForm.rejection_reason}
                  onChange={(e) => setProcessForm(prev => ({ ...prev, rejection_reason: e.target.value }))}
                  placeholder="Nyatakan sebab penolakan..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  data-testid="rejection-reason-input"
                />
              </div>
            )}
            
            {processForm.action === 'approved' && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  <AlertCircle className="inline h-4 w-4 mr-1" />
                  Selepas diluluskan, anda perlu memproses pembayaran dan tandakan "Selesai" dengan nombor rujukan.
                </p>
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowProcessModal(false);
                  setSelectedPayout(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Batal
              </button>
              <button
                onClick={submitProcess}
                disabled={processing}
                className={`flex-1 px-4 py-2 text-white rounded-lg transition disabled:opacity-50 ${
                  processForm.action === 'rejected' 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : processForm.action === 'approved'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
                data-testid="submit-process-btn"
              >
                {processing ? 'Memproses...' : 
                  processForm.action === 'completed' ? 'Tandakan Selesai' :
                  processForm.action === 'approved' ? 'Luluskan' : 'Tolak'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayoutManagementPage;
