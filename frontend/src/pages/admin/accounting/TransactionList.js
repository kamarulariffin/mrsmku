import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Filter,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  Clock,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { API_URL } from '../../../services/api';

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

const statusColors = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock },
  verified: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
  locked: { bg: 'bg-gray-100', text: 'text-gray-700', icon: CheckCircle }
};

const TransactionList = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    type: searchParams.get('type') || '',
    status: searchParams.get('status') || '',
    category_id: searchParams.get('category_id') || '',
    module: searchParams.get('module') || '',
    start_date: searchParams.get('start_date') || '',
    end_date: searchParams.get('end_date') || '',
    search: searchParams.get('search') || ''
  });
  const [showFilters, setShowFilters] = useState(false);

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

      // Fetch categories
      const catRes = await fetch(`${API_URL}/api/accounting-full/categories`, { headers });
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData);
      }

      // Build query params
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (filters.type) params.append('type', filters.type);
      if (filters.status) params.append('status', filters.status);
      if (filters.category_id) params.append('category_id', filters.category_id);
      if (filters.module) params.append('module', filters.module);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.search) params.append('search', filters.search);

      // Fetch transactions
      const txRes = await fetch(`${API_URL}/api/accounting-full/transactions?${params}`, { headers });
      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData.transactions || []);
        setPagination(txData.pagination || { page: 1, total: 0, total_pages: 1 });
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [navigate, getAuthHeader, filters]);

  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    
    // Update URL params
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    setSearchParams(params);
  };

  const clearFilters = () => {
    const clearedFilters = {
      type: '', status: '', category_id: '', module: '', start_date: '', end_date: '', search: ''
    };
    setFilters(clearedFilters);
    setSearchParams(new URLSearchParams());
  };

  const isBendahari = ['superadmin', 'admin', 'bendahari', 'sub_bendahari'].includes(user?.role);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 min-w-0 overflow-x-hidden" data-testid="transaction-list-page">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/accounting')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Dashboard
        </button>
        
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-800">Senarai Transaksi</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                showFilters ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'
              }`}
            >
              <Filter className="w-4 h-4" />
              Tapis
            </button>
            {isBendahari && (
              <button
                onClick={() => navigate('/admin/accounting/transactions/new')}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                data-testid="new-transaction-btn"
              >
                <Plus className="w-4 h-4" />
                Tambah
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6" data-testid="filter-panel">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Cari..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Type */}
            <select
              value={filters.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Semua Jenis</option>
              <option value="income">Wang Masuk</option>
              <option value="expense">Wang Keluar</option>
            </select>

            {/* Status */}
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Semua Status</option>
              <option value="pending">Menunggu</option>
              <option value="verified">Disahkan</option>
              <option value="rejected">Ditolak</option>
            </select>

            {/* Category */}
            <select
              value={filters.category_id}
              onChange={(e) => handleFilterChange('category_id', e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Semua Kategori</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>

            {/* Module (payment source) */}
            <select
              value={filters.module}
              onChange={(e) => handleFilterChange('module', e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Semua Modul</option>
              <option value="yuran">Yuran</option>
              <option value="koperasi">Koperasi</option>
              <option value="bus">Bas</option>
              <option value="tabung">Tabung</option>
            </select>

            {/* Start Date */}
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Dari"
            />

            {/* End Date */}
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Hingga"
            />
          </div>
          
          <div className="mt-4 flex justify-end">
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Kosongkan Tapis
            </button>
          </div>
        </div>
      )}

      {/* Transaction List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Memuat...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Tiada transaksi dijumpai</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full" data-testid="transactions-table">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">No. Transaksi</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tarikh</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Modul</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Jenis</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Kategori</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Penerangan</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Jumlah</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((tx) => {
                    const StatusIcon = statusColors[tx.status]?.icon || Clock;
                    return (
                      <tr
                        key={tx.id}
                        onClick={() => navigate(`/admin/accounting/transactions/${tx.id}`)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        data-testid={`tx-row-${tx.transaction_number}`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-blue-600">{tx.transaction_number}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(tx.transaction_date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {tx.module_display ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">{tx.module_display}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                              tx.type === 'income' ? 'bg-green-100' : 'bg-red-100'
                            }`}>
                              {tx.type === 'income' ? (
                                <ArrowUpRight className="w-4 h-4 text-green-600" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4 text-red-600" />
                              )}
                            </div>
                            <span className="text-sm">{tx.type_display}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{tx.category_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{tx.description}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${
                          tx.type === 'income' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                              statusColors[tx.status]?.bg || 'bg-gray-100'
                            } ${statusColors[tx.status]?.text || 'text-gray-700'}`}>
                              <StatusIcon className="w-3 h-3" />
                              {tx.status_display}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {transactions.map((tx) => {
                const StatusIcon = statusColors[tx.status]?.icon || Clock;
                return (
                  <div
                    key={tx.id}
                    onClick={() => navigate(`/admin/accounting/transactions/${tx.id}`)}
                    className="p-4 hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm text-blue-600">{tx.transaction_number}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        statusColors[tx.status]?.bg || 'bg-gray-100'
                      } ${statusColors[tx.status]?.text || 'text-gray-700'}`}>
                        <StatusIcon className="w-3 h-3" />
                        {tx.status_display}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">{tx.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {tx.module_display ? `${tx.module_display} • ` : ''}{tx.category_name} • {formatDate(tx.transaction_date)}
                      </span>
                      <span className={`font-semibold ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Jumlah: {pagination.total} transaksi
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchData(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-600">
                  {pagination.page} / {pagination.total_pages}
                </span>
                <button
                  onClick={() => fetchData(pagination.page + 1)}
                  disabled={pagination.page >= pagination.total_pages}
                  className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TransactionList;
