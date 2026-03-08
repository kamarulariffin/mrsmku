import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  BookOpen,
  Wallet,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  Info
} from 'lucide-react';
import { API_URL } from '../../../services/api';

/**
 * Senarai Akaun (Chart of Accounts) - paparan mesra pengguna
 * Aset (akaun bank), Hasil (kategori income), Belanja (kategori expense)
 */
const ChartOfAccountsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [coa, setCoa] = useState({ asset: [], income: [], expense: [] });
  const [filter, setFilter] = useState(''); // '' | 'asset' | 'income' | 'expense'
  const [openSections, setOpenSections] = useState({ asset: true, income: true, expense: true });

  const getAuthHeader = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
  }), []);

  const fetchCOA = useCallback(async () => {
    try {
      setLoading(true);
      const params = filter ? `?type_filter=${filter}` : '';
      const res = await fetch(`${API_URL}/api/accounting-full/chart-of-accounts${params}`, {
        headers: getAuthHeader()
      });
      if (!res.ok) {
        if (res.status === 401) {
          navigate('/login');
          return;
        }
        throw new Error('Gagal memuat senarai akaun');
      }
      const data = await res.json();
      setCoa({
        asset: data.asset || [],
        income: data.income || [],
        expense: data.expense || []
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter, getAuthHeader, navigate]);

  useEffect(() => {
    fetchCOA();
  }, [fetchCOA]);

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const Section = ({ title, icon: Icon, colorClass, items, sectionKey }) => {
    const isOpen = openSections[sectionKey] !== false;
    if (items.length === 0 && filter === '') return null;
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection(sectionKey)}
          className={`w-full flex items-center gap-3 p-4 text-left ${colorClass} hover:opacity-95 transition-opacity`}
        >
          <Icon className="w-5 h-5 text-white" />
          <span className="font-semibold text-white">{title}</span>
          <span className="text-white/90 text-sm ml-auto">{items.length} akaun</span>
          {isOpen ? <ChevronDown className="w-5 h-5 text-white" /> : <ChevronRight className="w-5 h-5 text-white" />}
        </button>
        {isOpen && (
          <div className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">Tiada akaun dalam bahagian ini.</div>
            ) : (
              items.map((acc) => (
                <div
                  key={`${acc.account_type}-${acc.id}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-mono text-sm text-gray-500 w-14 shrink-0">{acc.account_code || '-'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800">{acc.name}</p>
                    {acc.description && (
                      <p className="text-xs text-gray-500 truncate">{acc.description}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Memuat senarai akaun...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 min-w-0 overflow-x-hidden">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/admin/accounting-full')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Dashboard
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <BookOpen className="w-7 h-7 text-blue-600" />
              Senarai Akaun (COA)
            </h1>
            <p className="text-gray-600 mt-1">
              Rujukan akaun untuk perakaunan bergu (debit/kredit). Kemaskini kod akaun di Kategori atau Akaun Bank.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Semua jenis</option>
              <option value="asset">Aset (Bank)</option>
              <option value="income">Hasil</option>
              <option value="expense">Belanja</option>
            </select>
            <button
              onClick={() => fetchCOA()}
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              title="Muat semula"
            >
              <RefreshCw className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Apakah Senarai Akaun?</p>
            <p>
              Setiap transaksi direkod secara <strong>entri bergu</strong>: satu debit dan satu kredit.
              Wang masuk: Debit Akaun Bank, Kredit Hasil. Wang keluar: Debit Belanja, Kredit Akaun Bank.
              Kod akaun boleh ditetapkan di halaman Kategori dan Akaun Bank.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <Section
            title="Aset (Akaun Bank)"
            icon={Wallet}
            colorClass="bg-blue-600"
            items={coa.asset}
            sectionKey="asset"
          />
          <Section
            title="Hasil (Pendapatan)"
            icon={TrendingUp}
            colorClass="bg-emerald-600"
            items={coa.income}
            sectionKey="income"
          />
          <Section
            title="Belanja (Perbelanjaan)"
            icon={TrendingDown}
            colorClass="bg-rose-600"
            items={coa.expense}
            sectionKey="expense"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/admin/accounting/categories')}
            className="text-sm text-blue-600 hover:underline"
          >
            Kemaskini kategori & kod akaun →
          </button>
          <button
            onClick={() => navigate('/admin/accounting/bank-accounts')}
            className="text-sm text-blue-600 hover:underline"
          >
            Kemaskini akaun bank & kod →
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChartOfAccountsPage;
