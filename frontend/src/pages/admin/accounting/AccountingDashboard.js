import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calculator,
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Filter,
  RefreshCw,
  BarChart3,
  CalendarDays,
  Building2,
  Calendar,
  FileSpreadsheet,
  BookOpen,
  Clock,
  Database,
  HelpCircle
} from 'lucide-react';
import { API_URL } from '../../../services/api';

// Utility functions
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ms-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2
  }).format(amount || 0);
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('ms-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

// Main Dashboard Component
const AccountingDashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);

  const getAuthHeader = useCallback(() => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeader();

      // Fetch user info
      const userRes = await fetch(`${API_URL}/api/auth/me`, { headers });
      if (!userRes.ok) {
        navigate('/login');
        return;
      }
      const userData = await userRes.json();
      setUser(userData);

      // Check access
      const allowedRoles = ['superadmin', 'admin', 'bendahari', 'sub_bendahari', 'juruaudit'];
      if (!allowedRoles.includes(userData.role)) {
        setError('Anda tiada kebenaran untuk mengakses modul ini');
        return;
      }

      // Fetch stats
      const statsRes = await fetch(`${API_URL}/api/accounting-full/dashboard/stats`, { headers });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // Fetch recent transactions
      const txRes = await fetch(`${API_URL}/api/accounting-full/transactions?limit=5`, { headers });
      if (txRes.ok) {
        const txData = await txRes.json();
        setRecentTransactions(txData.transactions || []);
      }

    } catch (err) {
      setError('Gagal memuat data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [navigate, getAuthHeader]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="loading-spinner">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Memuat data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen" data-testid="error-display">
        <XCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-gray-600">{error}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Kembali ke Dashboard
        </button>
      </div>
    );
  }

  const isBendahari = ['superadmin', 'admin', 'bendahari', 'sub_bendahari'].includes(user?.role);
  const isJuruaudit = ['superadmin', 'juruaudit'].includes(user?.role);
  const canMigrate = ['superadmin', 'admin', 'bendahari'].includes(user?.role);

  const runMigrateToJournal = async () => {
    if (!window.confirm('Cipta entri jurnal untuk semua transaksi lama yang belum ada jurnal? Proses ini biasanya dijalankan sekali sahaja.')) return;
    setMigrateLoading(true);
    setMigrateResult(null);
    try {
      const headers = { ...(localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {}), 'Content-Type': 'application/json' };
      const res = await fetch(`${API_URL}/api/accounting-full/migrate-transactions-to-journal`, { method: 'POST', headers });
      const data = await res.json();
      if (res.ok) {
        setMigrateResult({ ok: true, message: data.message, created: data.created, errors: data.errors });
      } else {
        setMigrateResult({ ok: false, message: data.detail || 'Gagal menjalankan migrasi' });
      }
    } catch (e) {
      setMigrateResult({ ok: false, message: e.message || 'Ralat rangkaian' });
    } finally {
      setMigrateLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 min-w-0 overflow-x-hidden" data-testid="accounting-dashboard">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-2">
              <Calculator className="w-8 h-8 text-blue-600" />
              Sistem Perakaunan MRSM
            </h1>
            <p className="text-gray-600 mt-1">Dashboard Kewangan Bersepadu</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/admin/accounting/manual')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors border border-slate-200"
              data-testid="manual-btn"
            >
              <HelpCircle className="w-4 h-4" />
              Manual Perakaunan
            </button>
            <button
              onClick={() => navigate('/admin/manual-bendahari#ringkasan-akaun')}
              className="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors border border-teal-200"
            >
              <HelpCircle className="w-4 h-4" />
              Manual Bendahari (bahagian ini)
            </button>
            {isBendahari && (
              <button
                onClick={() => navigate('/admin/accounting/transactions/new')}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                data-testid="new-transaction-btn"
              >
                <Plus className="w-4 h-4" />
                Transaksi Baru
              </button>
            )}
            <button
              onClick={() => navigate('/admin/accounting/reports')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              data-testid="reports-btn"
            >
              <BarChart3 className="w-4 h-4" />
              Laporan
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Current Month Income */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100" data-testid="stat-month-income">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Wang Masuk Bulan Ini</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {formatCurrency(stats?.current_month?.income)}
              </p>
              <p className="text-xs text-gray-400 mt-1">{stats?.current_month?.month_name} {stats?.current_month?.year}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <ArrowUpRight className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Current Month Expense */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100" data-testid="stat-month-expense">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Wang Keluar Bulan Ini</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {formatCurrency(stats?.current_month?.expense)}
              </p>
              <p className="text-xs text-gray-400 mt-1">{stats?.current_month?.month_name} {stats?.current_month?.year}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <ArrowDownRight className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        {/* All Time Balance */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100" data-testid="stat-balance">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Baki Keseluruhan</p>
              <p className={`text-2xl font-bold mt-1 ${(stats?.all_time?.balance || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(stats?.all_time?.balance)}
              </p>
              <p className="text-xs text-gray-400 mt-1">Sepanjang masa</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Wallet className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Pending Verification */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100" data-testid="stat-pending">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Menunggu Pengesahan</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">
                {stats?.pending_verification || 0}
              </p>
              <p className="text-xs text-gray-400 mt-1">transaksi</p>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Tindakan Pantas
          </h3>
          <div className="space-y-3">
            {isBendahari && (
              <>
                <button
                  onClick={() => navigate('/admin/accounting/transactions/new', { state: { type: 'income' } })}
                  className="w-full flex items-center gap-3 p-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                  data-testid="quick-income-btn"
                >
                  <TrendingUp className="w-5 h-5" />
                  <span>Rekod Wang Masuk</span>
                </button>
                <button
                  onClick={() => navigate('/admin/accounting/transactions/new', { state: { type: 'expense' } })}
                  className="w-full flex items-center gap-3 p-3 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                  data-testid="quick-expense-btn"
                >
                  <TrendingDown className="w-5 h-5" />
                  <span>Rekod Wang Keluar</span>
                </button>
              </>
            )}
            {isJuruaudit && (
              <button
                onClick={() => navigate('/admin/accounting/verification')}
                className="w-full flex items-center gap-3 p-3 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
                data-testid="quick-verify-btn"
              >
                <CheckCircle className="w-5 h-5" />
                <span>Sahkan Transaksi ({stats?.pending_verification || 0})</span>
              </button>
            )}
            <button
              onClick={() => navigate('/admin/accounting/transactions')}
              className="w-full flex items-center gap-3 p-3 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              data-testid="quick-list-btn"
            >
              <Filter className="w-5 h-5" />
              <span>Lihat Semua Transaksi</span>
            </button>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-600" />
              Transaksi Terkini
            </h3>
            <button
              onClick={() => navigate('/admin/accounting/transactions')}
              className="text-sm text-blue-600 hover:underline"
            >
              Lihat Semua
            </button>
          </div>
          
          {recentTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Tiada transaksi</p>
            </div>
          ) : (
            <div className="space-y-3" data-testid="recent-transactions">
              {recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  onClick={() => navigate(`/admin/accounting/transactions/${tx.id}`)}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                  data-testid={`tx-${tx.transaction_number}`}
                >
                  <div className="flex items-center gap-3">
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
                      <p className="font-medium text-gray-800 text-sm">{tx.description?.substring(0, 40)}...</p>
                      <p className="text-xs text-gray-500">{tx.transaction_number} • {tx.category_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </p>
                    <div className="flex items-center gap-1 text-xs">
                      {tx.status === 'verified' && <CheckCircle className="w-3 h-3 text-green-500" />}
                      {tx.status === 'pending' && <Clock className="w-3 h-3 text-amber-500" />}
                      {tx.status === 'rejected' && <XCircle className="w-3 h-3 text-red-500" />}
                      <span className="text-gray-500">{formatDate(tx.transaction_date)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* All Time Summary */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-4">Ringkasan Keseluruhan</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <span className="text-gray-600">Jumlah Wang Masuk</span>
              <span className="font-bold text-green-600">{formatCurrency(stats?.all_time?.income)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
              <span className="text-gray-600">Jumlah Wang Keluar</span>
              <span className="font-bold text-red-600">{formatCurrency(stats?.all_time?.expense)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
              <span className="text-gray-600">Baki Bersih</span>
              <span className={`font-bold ${(stats?.all_time?.balance || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(stats?.all_time?.balance)}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation to Other Features */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-4">Menu Perakaunan</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/admin/accounting/bank-accounts')}
              className="p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-center"
              data-testid="menu-bank-accounts"
            >
              <Building2 className="w-6 h-6 mx-auto text-blue-600 mb-2" />
              <span className="text-sm text-gray-700">Akaun Bank</span>
            </button>
            <button
              onClick={() => navigate('/admin/accounting/financial-years')}
              className="p-4 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors text-center"
              data-testid="menu-financial-years"
            >
              <Calendar className="w-6 h-6 mx-auto text-emerald-600 mb-2" />
              <span className="text-sm text-gray-700">Tahun Kewangan</span>
            </button>
            <button
              onClick={() => navigate('/admin/accounting/categories')}
              className="p-4 bg-pastel-mint/50 rounded-lg hover:bg-pastel-mint transition-colors text-center"
              data-testid="menu-categories"
            >
              <Filter className="w-6 h-6 mx-auto text-teal-600 mb-2" />
              <span className="text-sm text-gray-700">Kategori</span>
            </button>
            <button
              onClick={() => navigate('/admin/accounting/chart-of-accounts')}
              className="p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors text-center"
              data-testid="menu-chart-of-accounts"
            >
              <BookOpen className="w-6 h-6 mx-auto text-indigo-600 mb-2" />
              <span className="text-sm text-gray-700">Senarai Akaun</span>
            </button>
            <button
              onClick={() => navigate('/admin/accounting/manual')}
              className="p-4 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors text-center"
              data-testid="menu-manual"
            >
              <HelpCircle className="w-6 h-6 mx-auto text-sky-600 mb-2" />
              <span className="text-sm text-gray-700">Manual Pengguna</span>
            </button>
            {canMigrate && (
              <button
                onClick={runMigrateToJournal}
                disabled={migrateLoading}
                className="p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors text-center border border-slate-200 col-span-2"
                data-testid="menu-migrate-journal"
                title="Cipta entri jurnal untuk transaksi lama (sekali sahaja)"
              >
                {migrateLoading ? (
                  <RefreshCw className="w-6 h-6 mx-auto text-slate-500 animate-spin mb-2" />
                ) : (
                  <Database className="w-6 h-6 mx-auto text-slate-600 mb-2" />
                )}
                <span className="text-sm text-gray-700 block">Migrasi ke Entri Jurnal</span>
                {migrateResult && (
                  <span className={`text-xs mt-1 block ${migrateResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                    {migrateResult.ok
                      ? `${migrateResult.created} entri dicipta${migrateResult.errors ? `, ${migrateResult.errors} ralat` : ''}`
                      : migrateResult.message}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => navigate('/admin/accounting/agm-reports')}
              className="p-4 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors text-center"
              data-testid="menu-agm-reports"
            >
              <FileSpreadsheet className="w-6 h-6 mx-auto text-amber-600 mb-2" />
              <span className="text-sm text-gray-700">Laporan AGM</span>
            </button>
            <button
              onClick={() => navigate('/admin/accounting/reports/monthly')}
              className="p-4 bg-cyan-50 rounded-lg hover:bg-cyan-100 transition-colors text-center"
              data-testid="menu-monthly"
            >
              <CalendarDays className="w-6 h-6 mx-auto text-cyan-600 mb-2" />
              <span className="text-sm text-gray-700">Bulanan</span>
            </button>
            <button
              onClick={() => navigate('/admin/accounting/reports/annual')}
              className="p-4 bg-pastel-lavender rounded-lg hover:bg-pastel-lilac transition-colors text-center"
              data-testid="menu-annual"
            >
              <BarChart3 className="w-6 h-6 mx-auto text-violet-600 mb-2" />
              <span className="text-sm text-gray-700">Tahunan</span>
            </button>
            {isJuruaudit && (
              <button
                onClick={() => navigate('/admin/accounting/audit-logs')}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-center col-span-2"
                data-testid="menu-audit"
              >
                <FileText className="w-6 h-6 mx-auto text-gray-600 mb-2" />
                <span className="text-sm text-gray-700">Log Audit</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountingDashboard;
