import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Wallet, ArrowLeft, TrendingUp, Clock, CheckCircle, XCircle,
  ArrowUpRight, DollarSign, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

const VendorWalletPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState(null);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({
    amount: '',
    bank_name: '',
    bank_account_number: '',
    bank_account_name: '',
    notes: ''
  });

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      const [walletRes, historyRes] = await Promise.all([
        api.get('/api/marketplace/wallet/my-wallet'),
        api.get('/api/marketplace/wallet/payout-history')
      ]);
      setWallet(walletRes.data);
      setPayoutHistory(historyRes.data || []);
    } catch (error) {
      console.error('Error fetching wallet:', error);
      toast.error('Gagal memuatkan maklumat dompet');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawForm.amount || parseFloat(withdrawForm.amount) <= 0) {
      toast.error('Sila masukkan jumlah yang sah');
      return;
    }
    if (!withdrawForm.bank_name || !withdrawForm.bank_account_number || !withdrawForm.bank_account_name) {
      toast.error('Sila lengkapkan maklumat bank');
      return;
    }

    setWithdrawing(true);
    try {
      await api.post('/api/marketplace/wallet/payout-request', {
        amount: parseFloat(withdrawForm.amount),
        bank_name: withdrawForm.bank_name,
        bank_account_number: withdrawForm.bank_account_number,
        bank_account_name: withdrawForm.bank_account_name,
        notes: withdrawForm.notes
      });
      toast.success('Permohonan pengeluaran berjaya dihantar');
      setShowWithdrawModal(false);
      setWithdrawForm({
        amount: '',
        bank_name: '',
        bank_account_number: '',
        bank_account_name: '',
        notes: ''
      });
      fetchWalletData();
    } catch (error) {
      console.error('Error requesting withdrawal:', error);
      toast.error(error.response?.data?.detail || 'Gagal menghantar permohonan');
    } finally {
      setWithdrawing(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="vendor-wallet-page">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/vendor')}
          className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-emerald-600" />
            Dompet Vendor
          </h1>
          <p className="text-gray-500">Urus pendapatan dan pengeluaran wang</p>
        </div>
      </div>

      {/* Wallet Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Available Balance */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <span className="text-emerald-100">Baki Tersedia</span>
            <Wallet className="h-6 w-6 text-emerald-200" />
          </div>
          <p className="text-3xl font-bold mb-4">{formatCurrency(wallet?.available_balance)}</p>
          <button
            onClick={() => setShowWithdrawModal(true)}
            disabled={!wallet?.available_balance || wallet.available_balance < 10}
            className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            data-testid="withdraw-btn"
          >
            <ArrowUpRight className="h-4 w-4" />
            Keluarkan Wang
          </button>
        </div>

        {/* Total Earnings */}
        <div className="bg-white rounded-2xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-500">Jumlah Pendapatan</span>
            <TrendingUp className="h-6 w-6 text-violet-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(wallet?.total_earnings)}</p>
          <p className="text-sm text-gray-500 mt-2">Sepanjang masa</p>
        </div>

        {/* Pending */}
        <div className="bg-white rounded-2xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-500">Dalam Proses</span>
            <Clock className="h-6 w-6 text-amber-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(wallet?.pending_payouts)}</p>
          <p className="text-sm text-gray-500 mt-2">Menunggu kelulusan</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Pendapatan Tertunda</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(wallet?.pending_earnings)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Jumlah Dikeluarkan</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(wallet?.total_withdrawn)}</p>
          </div>
        </div>
      </div>

      {/* Payout History */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Sejarah Pengeluaran</h2>
          <button 
            onClick={fetchWalletData}
            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg transition"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        
        {payoutHistory.length === 0 ? (
          <div className="text-center py-12">
            <Wallet className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">Tiada sejarah pengeluaran</p>
          </div>
        ) : (
          <div className="divide-y">
            {payoutHistory.map((payout) => (
              <div key={payout.id} className="p-4 hover:bg-gray-50 transition">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">
                        {formatCurrency(payout.amount)}
                      </span>
                      {getStatusBadge(payout.status)}
                    </div>
                    <p className="text-sm text-gray-500">
                      {payout.bank_name} - ****{payout.bank_account_number}
                    </p>
                    {payout.reference_number && (
                      <p className="text-xs text-gray-400 mt-1">
                        Rujukan: {payout.reference_number}
                      </p>
                    )}
                    {payout.rejection_reason && (
                      <p className="text-xs text-red-600 mt-1">
                        Sebab: {payout.rejection_reason}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">{formatDate(payout.requested_at)}</p>
                    {payout.processed_at && (
                      <p className="text-xs text-gray-400">
                        Diproses: {formatDate(payout.processed_at)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0 p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-emerald-600" />
              Keluarkan Wang
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jumlah (RM)
                </label>
                <input
                  type="number"
                  value={withdrawForm.amount}
                  onChange={(e) => setWithdrawForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                  min="10"
                  max={wallet?.available_balance}
                  step="0.01"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimum: RM 10 | Tersedia: {formatCurrency(wallet?.available_balance)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Bank
                </label>
                <select
                  value={withdrawForm.bank_name}
                  onChange={(e) => setWithdrawForm(prev => ({ ...prev, bank_name: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Pilih Bank</option>
                  <option value="Maybank">Maybank</option>
                  <option value="CIMB">CIMB Bank</option>
                  <option value="Public Bank">Public Bank</option>
                  <option value="RHB Bank">RHB Bank</option>
                  <option value="Hong Leong Bank">Hong Leong Bank</option>
                  <option value="AmBank">AmBank</option>
                  <option value="Bank Islam">Bank Islam</option>
                  <option value="Bank Rakyat">Bank Rakyat</option>
                  <option value="BSN">BSN</option>
                  <option value="Affin Bank">Affin Bank</option>
                  <option value="Alliance Bank">Alliance Bank</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombor Akaun
                </label>
                <input
                  type="text"
                  value={withdrawForm.bank_account_number}
                  onChange={(e) => setWithdrawForm(prev => ({ ...prev, bank_account_number: e.target.value }))}
                  placeholder="Nombor akaun bank"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Pemegang Akaun
                </label>
                <input
                  type="text"
                  value={withdrawForm.bank_account_name}
                  onChange={(e) => setWithdrawForm(prev => ({ ...prev, bank_account_name: e.target.value }))}
                  placeholder="Nama seperti dalam akaun bank"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nota (Pilihan)
                </label>
                <textarea
                  value={withdrawForm.notes}
                  onChange={(e) => setWithdrawForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Nota tambahan..."
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Batal
              </button>
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {withdrawing ? 'Menghantar...' : 'Hantar Permohonan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorWalletPage;
