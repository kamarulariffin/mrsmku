import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertCircle,
  Eye
} from 'lucide-react';
import { API_URL } from '../../../services/api';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ms-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2
  }).format(amount || 0);
};

const formatDateTime = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('ms-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const VerificationPage = () => {
  const navigate = useNavigate();
  const [, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 1 });

  // Quick verify state
  const [selectedTx, setSelectedTx] = useState(null);
  const [verifyAction, setVerifyAction] = useState('');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const getAuthHeader = useCallback(() => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const fetchData = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const headers = getAuthHeader();

      // Fetch user
      const userRes = await fetch(`${API_URL}/api/auth/me`, { headers });
      if (!userRes.ok) {
        navigate('/login');
        return;
      }
      const userData = await userRes.json();
      setUser(userData);

      // Check access
      const allowedRoles = ['superadmin', 'juruaudit'];
      if (!allowedRoles.includes(userData.role)) {
        setError('Anda tiada kebenaran untuk mengakses halaman ini');
        return;
      }

      // Fetch pending transactions
      const txRes = await fetch(`${API_URL}/api/accounting-full/pending-verification?page=${page}&limit=20`, { headers });
      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData.transactions || []);
        setPagination(txData.pagination || { page: 1, total: 0, total_pages: 1 });
      }
    } catch (err) {
      setError('Gagal memuat data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [navigate, getAuthHeader]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleVerify = async () => {
    if (!selectedTx) return;

    try {
      setActionLoading(true);
      const headers = {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      };

      const response = await fetch(`${API_URL}/api/accounting-full/transactions/${selectedTx.id}/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          status: verifyAction,
          verification_notes: verifyNotes
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Gagal mengesahkan transaksi');
      }

      // Reset and refresh
      setSelectedTx(null);
      setVerifyAction('');
      setVerifyNotes('');
      fetchData(pagination.page);

    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Memuat...</span>
      </div>
    );
  }

  if (error && !transactions.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-gray-600">{error}</p>
        <button
          onClick={() => navigate('/admin/accounting')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Kembali ke Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 min-w-0 overflow-x-hidden" data-testid="verification-page">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/accounting')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Dashboard
        </button>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-amber-600" />
              Pengesahan Transaksi
            </h1>
            <p className="text-gray-600">Semak dan sahkan transaksi yang menunggu kelulusan</p>
          </div>
          <div className="bg-amber-100 px-4 py-2 rounded-lg">
            <span className="text-amber-800 font-semibold">{pagination.total}</span>
            <span className="text-amber-700 ml-1">menunggu</span>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Transaction List */}
      <div className="space-y-4">
        {transactions.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
            <CheckCircle className="w-16 h-16 mx-auto text-green-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Tiada Transaksi Menunggu</h3>
            <p className="text-gray-500">Semua transaksi telah disemak dan disahkan.</p>
          </div>
        ) : (
          transactions.map((tx) => (
            <div
              key={tx.id}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              data-testid={`pending-tx-${tx.transaction_number}`}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                {/* Transaction Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === 'income' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {tx.type === 'income' ? (
                        <ArrowUpRight className="w-5 h-5 text-green-600" />
                      ) : (
                        <ArrowDownRight className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-mono text-sm text-blue-600">{tx.transaction_number}</p>
                      <p className="text-sm text-gray-500">{tx.type_display} • {tx.category_name}</p>
                    </div>
                  </div>
                  <p className="text-gray-700 mb-2">{tx.description}</p>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                    <span>Tarikh: {new Date(tx.transaction_date).toLocaleDateString('ms-MY')}</span>
                    <span>Oleh: {tx.created_by_name}</span>
                    <span>Direkod: {formatDateTime(tx.created_at)}</span>
                  </div>
                </div>

                {/* Amount & Actions */}
                <div className="flex flex-col items-end gap-3">
                  <p className={`text-2xl font-bold ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/admin/accounting/transactions/${tx.id}`)}
                      className="flex items-center gap-1 px-3 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                      data-testid={`view-${tx.transaction_number}`}
                    >
                      <Eye className="w-4 h-4" />
                      Lihat
                    </button>
                    <button
                      onClick={() => {
                        setSelectedTx(tx);
                        setVerifyAction('verified');
                      }}
                      className="flex items-center gap-1 px-3 py-2 text-green-700 bg-green-100 rounded-lg hover:bg-green-200"
                      data-testid={`approve-${tx.transaction_number}`}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Sahkan
                    </button>
                    <button
                      onClick={() => {
                        setSelectedTx(tx);
                        setVerifyAction('rejected');
                      }}
                      className="flex items-center gap-1 px-3 py-2 text-red-700 bg-red-100 rounded-lg hover:bg-red-200"
                      data-testid={`reject-${tx.transaction_number}`}
                    >
                      <XCircle className="w-4 h-4" />
                      Tolak
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: pagination.total_pages }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              onClick={() => fetchData(page)}
              className={`px-4 py-2 rounded-lg ${
                page === pagination.page
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {page}
            </button>
          ))}
        </div>
      )}

      {/* Verification Modal */}
      {selectedTx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen" data-testid="verify-modal">
          <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
            <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
              verifyAction === 'verified' ? 'text-green-700' : 'text-red-700'
            }`}>
              {verifyAction === 'verified' ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Sahkan Transaksi
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5" />
                  Tolak Transaksi
                </>
              )}
            </h3>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="font-mono text-sm text-blue-600 mb-1">{selectedTx.transaction_number}</p>
              <p className="text-gray-700">{selectedTx.description}</p>
              <p className={`text-lg font-bold mt-2 ${selectedTx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(selectedTx.amount)}
              </p>
            </div>

            <textarea
              value={verifyNotes}
              onChange={(e) => setVerifyNotes(e.target.value)}
              placeholder={verifyAction === 'verified' ? 'Catatan (pilihan)' : 'Sebab penolakan'}
              rows={3}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 mb-4"
              data-testid="modal-notes-input"
            />
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedTx(null);
                  setVerifyAction('');
                  setVerifyNotes('');
                }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleVerify}
                disabled={actionLoading}
                className={`flex-1 px-4 py-2 text-white rounded-lg flex items-center justify-center gap-2 ${
                  verifyAction === 'verified' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
                data-testid="modal-confirm-btn"
              >
                {actionLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  verifyAction === 'verified' ? 'Sahkan' : 'Tolak'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VerificationPage;
