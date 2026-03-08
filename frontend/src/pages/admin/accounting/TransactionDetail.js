import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  Edit,
  Trash2,
  RefreshCw,
  AlertCircle,
  User,
  Receipt,
  BookOpen
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

const statusConfig = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock, label: 'Menunggu Pengesahan' },
  verified: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'Disahkan' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle, label: 'Ditolak' },
  locked: { bg: 'bg-gray-100', text: 'text-gray-700', icon: CheckCircle, label: 'Tempoh Dikunci' }
};

const TransactionDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [transaction, setTransaction] = useState(null);
  const [journal, setJournal] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  
  // Verification Modal
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyAction, setVerifyAction] = useState(''); // verified or rejected
  const [verifyNotes, setVerifyNotes] = useState('');

  const getAuthHeader = useCallback(() => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const fetchData = useCallback(async () => {
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

      // Fetch transaction
      const txRes = await fetch(`${API_URL}/api/accounting-full/transactions/${id}`, { headers });
      if (!txRes.ok) {
        throw new Error('Transaksi tidak dijumpai');
      }
      const txData = await txRes.json();
      setTransaction(txData);

      // Fetch journal (entri bergu) if available
      const journalRes = await fetch(`${API_URL}/api/accounting-full/transactions/${id}/journal`, { headers });
      if (journalRes.ok) {
        const journalData = await journalRes.json();
        setJournal(journalData.has_journal ? journalData : null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, navigate, getAuthHeader]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleVerify = async () => {
    try {
      setActionLoading(true);
      const headers = {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      };

      const response = await fetch(`${API_URL}/api/accounting-full/transactions/${id}/verify`, {
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

      setShowVerifyModal(false);
      fetchData();

    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Adakah anda pasti mahu memadam transaksi ini?')) {
      return;
    }

    try {
      setActionLoading(true);
      const response = await fetch(`${API_URL}/api/accounting-full/transactions/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Gagal memadam transaksi');
      }

      navigate('/admin/accounting/transactions');

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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-gray-600">{error}</p>
        <button
          onClick={() => navigate('/admin/accounting/transactions')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Kembali ke Senarai
        </button>
      </div>
    );
  }

  const isBendahari = ['superadmin', 'admin', 'bendahari', 'sub_bendahari'].includes(user?.role);
  const isJuruaudit = ['superadmin', 'juruaudit'].includes(user?.role);
  const canEdit = isBendahari && transaction?.status === 'pending';
  const canVerify = isJuruaudit && transaction?.status === 'pending';

  const StatusIcon = statusConfig[transaction?.status]?.icon || Clock;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 min-w-0 overflow-x-hidden" data-testid="transaction-detail-page">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/accounting/transactions')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Senarai
        </button>
        
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              {transaction?.type === 'income' ? (
                <ArrowUpRight className="w-6 h-6 text-green-600" />
              ) : (
                <ArrowDownRight className="w-6 h-6 text-red-600" />
              )}
              {transaction?.transaction_number}
            </h1>
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium mt-2 ${
              statusConfig[transaction?.status]?.bg || 'bg-gray-100'
            } ${statusConfig[transaction?.status]?.text || 'text-gray-700'}`}>
              <StatusIcon className="w-4 h-4" />
              {statusConfig[transaction?.status]?.label || transaction?.status_display}
            </span>
          </div>
          
          <div className="flex gap-2">
            {canVerify && (
              <>
                <button
                  onClick={() => { setVerifyAction('verified'); setShowVerifyModal(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  data-testid="verify-btn"
                >
                  <CheckCircle className="w-4 h-4" />
                  Sahkan
                </button>
                <button
                  onClick={() => { setVerifyAction('rejected'); setShowVerifyModal(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  data-testid="reject-btn"
                >
                  <XCircle className="w-4 h-4" />
                  Tolak
                </button>
              </>
            )}
            {canEdit && (
              <>
                <button
                  onClick={() => navigate(`/admin/accounting/transactions/${id}/edit`)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  data-testid="edit-btn"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  data-testid="delete-btn"
                >
                  <Trash2 className="w-4 h-4" />
                  Padam
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Entri Jurnal (Debit/Kredit) - user-friendly */}
          {journal && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                Entri Bergu (Jurnal)
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                No. Entri: <span className="font-mono">{journal.entry_number}</span>
                {journal.transaction_date && ` • Tarikh: ${journal.transaction_date}`}
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600 font-medium">Akaun</th>
                      <th className="px-4 py-2 text-right text-gray-600 font-medium">Debit (RM)</th>
                      <th className="px-4 py-2 text-right text-gray-600 font-medium">Kredit (RM)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {journal.lines?.map((line, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <span className="text-gray-500 font-mono text-xs">{line.account_code || '-'}</span>
                          <span className="ml-2 text-gray-800">{line.account_name}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-gray-800">
                          {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-gray-800">
                          {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-4 py-2">Jumlah</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(journal.total_debit)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(journal.total_credit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Transaction Details */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-600" />
              Maklumat Transaksi
            </h3>
            
            <div className="space-y-4">
              {/* Amount */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">Jumlah</p>
                <p className={`text-3xl font-bold ${
                  transaction?.type === 'income' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {transaction?.type === 'income' ? '+' : '-'}{formatCurrency(transaction?.amount)}
                </p>
              </div>

              {/* Grid Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Jenis</p>
                  <p className="font-medium text-gray-800">{transaction?.type_display}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Kategori</p>
                  <p className="font-medium text-gray-800">{transaction?.category_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Tarikh Transaksi</p>
                  <p className="font-medium text-gray-800">
                    {new Date(transaction?.transaction_date).toLocaleDateString('ms-MY', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Sumber</p>
                  <p className="font-medium text-gray-800">{transaction?.source_display}</p>
                </div>
                {transaction?.reference_number && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500">Nombor Rujukan</p>
                    <p className="font-medium text-gray-800">{transaction?.reference_number}</p>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500 mb-2">Penerangan</p>
                <p className="text-gray-800">{transaction?.description}</p>
              </div>

              {/* Notes */}
              {transaction?.notes && (
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500 mb-2">Nota</p>
                  <p className="text-gray-600 italic">{transaction?.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Verification Info */}
          {(transaction?.status === 'verified' || transaction?.status === 'rejected') && (
            <div className={`rounded-xl p-6 shadow-sm border ${
              transaction?.status === 'verified' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
            }`}>
              <h3 className={`font-semibold mb-4 flex items-center gap-2 ${
                transaction?.status === 'verified' ? 'text-green-800' : 'text-red-800'
              }`}>
                {transaction?.status === 'verified' ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
                {transaction?.status === 'verified' ? 'Maklumat Pengesahan' : 'Maklumat Penolakan'}
              </h3>
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="text-gray-600">Oleh:</span>{' '}
                  <span className="font-medium">{transaction?.verified_by_name}</span>
                </p>
                <p className="text-sm">
                  <span className="text-gray-600">Pada:</span>{' '}
                  <span className="font-medium">{formatDateTime(transaction?.verified_at)}</span>
                </p>
                {transaction?.verification_notes && (
                  <p className="text-sm mt-2">
                    <span className="text-gray-600">Catatan:</span>{' '}
                    <span className="italic">{transaction?.verification_notes}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Audit Log */}
          {transaction?.audit_logs && transaction.audit_logs.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Log Audit
              </h3>
              <div className="space-y-3">
                {transaction.audit_logs.map((log, index) => (
                  <div key={log.id || index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {log.performed_by_name} ({log.performed_by_role})
                      </p>
                      <p className="text-sm text-gray-600">{log.action_display}</p>
                      {log.notes && <p className="text-xs text-gray-500 italic mt-1">{log.notes}</p>}
                      <p className="text-xs text-gray-400 mt-1">{formatDateTime(log.performed_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Created Info */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              Direkod Oleh
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">{transaction?.created_by_name}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(transaction?.created_at)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Document */}
          {transaction?.document_url && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Dokumen Sokongan
              </h3>
              <a
                href={transaction.document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-blue-600"
              >
                <FileText className="w-5 h-5" />
                <span>Lihat Dokumen</span>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Verification Modal */}
      {showVerifyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0" data-testid="verify-modal">
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
            
            <p className="text-gray-600 mb-4">
              {verifyAction === 'verified'
                ? 'Anda akan mengesahkan transaksi ini. Pastikan maklumat telah disemak.'
                : 'Sila berikan sebab penolakan transaksi ini.'}
            </p>
            
            <textarea
              value={verifyNotes}
              onChange={(e) => setVerifyNotes(e.target.value)}
              placeholder="Catatan (pilihan)"
              rows={3}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 mb-4"
              data-testid="verify-notes-input"
            />
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowVerifyModal(false)}
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
                data-testid="confirm-verify-btn"
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

export default TransactionDetail;
