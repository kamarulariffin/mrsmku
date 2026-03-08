import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, TrendingUp, DollarSign, Building2, Wallet, Users,
  ShoppingBag, Calendar, Download, RefreshCw, ChevronRight,
  ArrowUpRight, ArrowDownRight, Filter, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../services/api';

const FinanceDashboardPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [vendorSummary, setVendorSummary] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [dashRes, vendorRes] = await Promise.all([
        api.get('/api/marketplace/finance/dashboard'),
        api.get('/api/marketplace/finance/vendor-summary')
      ]);
      setDashboard(dashRes.data);
      setVendorSummary(vendorRes.data);
    } catch (error) {
      console.error('Error fetching finance data:', error);
      toast.error('Gagal memuatkan data kewangan');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount || 0);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('ms-MY').format(num || 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const summary = dashboard?.summary || {};

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="finance-dashboard-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/admin/marketplace')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            data-testid="back-btn"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-violet-600" />
              Dashboard Kewangan
            </h1>
            <p className="text-gray-500">Marketplace - Laporan Komisyen & Pendapatan</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDashboardData}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            data-testid="refresh-btn"
          >
            <RefreshCw className="h-5 w-5 text-gray-600" />
          </button>
          <button
            onClick={() => navigate('/admin/marketplace/payouts')}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-2"
            data-testid="manage-payouts-btn"
          >
            <Wallet className="h-4 w-4" />
            Urus Pengeluaran
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales */}
        <div className="bg-gradient-to-br from-teal-500 to-violet-500 rounded-2xl p-6 text-white shadow-pastel">
          <div className="flex items-center justify-between mb-3">
            <span className="text-blue-100">Jumlah Jualan</span>
            <ShoppingBag className="h-5 w-5 text-blue-200" />
          </div>
          <p className="text-3xl font-bold">{formatCurrency(summary.sales_total)}</p>
          <div className="flex items-center gap-2 mt-2 text-sm text-blue-100">
            <ArrowUpRight className="h-4 w-4" />
            <span>{formatCurrency(summary.sales_month)} bulan ini</span>
          </div>
        </div>

        {/* Dana Kecemerlangan */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-amber-100">Dana Kecemerlangan</span>
            <TrendingUp className="h-5 w-5 text-amber-200" />
          </div>
          <p className="text-3xl font-bold">{formatCurrency(summary.dana_kecemerlangan_total)}</p>
          <div className="flex items-center gap-2 mt-2 text-sm text-amber-100">
            <span className="px-2 py-0.5 bg-white/20 rounded">5%</span>
            <span>{formatCurrency(summary.dana_kecemerlangan_month)} bulan ini</span>
          </div>
        </div>

        {/* Koperasi */}
        <div className="bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl p-6 text-white shadow-pastel">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/80">Koperasi</span>
            <Building2 className="h-5 w-5 text-white/60" />
          </div>
          <p className="text-3xl font-bold">{formatCurrency(summary.koperasi_total)}</p>
          <div className="flex items-center gap-2 mt-2 text-sm text-white/80">
            <span className="px-2 py-0.5 bg-white/20 rounded">5%</span>
            <span>{formatCurrency(summary.koperasi_month)} bulan ini</span>
          </div>
        </div>

        {/* Vendor Earnings */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-emerald-100">Pendapatan Vendor</span>
            <Users className="h-5 w-5 text-emerald-200" />
          </div>
          <p className="text-3xl font-bold">{formatCurrency(summary.vendor_earnings_total)}</p>
          <div className="flex items-center gap-2 mt-2 text-sm text-emerald-100">
            <span className="px-2 py-0.5 bg-white/20 rounded">90%</span>
            <span>Belum bayar: {formatCurrency(summary.vendor_balance_unpaid)}</span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Jumlah Pesanan</p>
              <p className="text-xl font-bold text-gray-900">{formatNumber(summary.orders_total)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Calendar className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pesanan Bulan Ini</p>
              <p className="text-xl font-bold text-gray-900">{formatNumber(summary.orders_month)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Wallet className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pengeluaran Menunggu</p>
              <p className="text-xl font-bold text-gray-900">{summary.pending_payouts_count}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pastel-lavender rounded-lg flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Sudah Dibayar</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.vendor_payouts_total)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="border-b">
          <div className="flex">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-3 text-sm font-medium transition ${activeTab === 'overview' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-gray-500 hover:text-gray-700'}`}
              data-testid="tab-overview"
            >
              Ringkasan Bulanan
            </button>
            <button
              onClick={() => setActiveTab('vendors')}
              className={`px-6 py-3 text-sm font-medium transition ${activeTab === 'vendors' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-gray-500 hover:text-gray-700'}`}
              data-testid="tab-vendors"
            >
              Ringkasan Vendor
            </button>
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Pecahan Bulanan (6 Bulan Terakhir)</h3>
            {dashboard?.monthly_breakdown?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-gray-500 border-b">
                      <th className="pb-3 font-medium">Bulan</th>
                      <th className="pb-3 font-medium text-right">Dana Kecemerlangan</th>
                      <th className="pb-3 font-medium text-right">Koperasi</th>
                      <th className="pb-3 font-medium text-right">Pendapatan Vendor</th>
                      <th className="pb-3 font-medium text-right">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dashboard.monthly_breakdown.map((month) => (
                      <tr key={month.month} className="hover:bg-gray-50">
                        <td className="py-3 font-medium text-gray-900">{month.month}</td>
                        <td className="py-3 text-right text-amber-600">{formatCurrency(month.dana_kecemerlangan)}</td>
                        <td className="py-3 text-right text-violet-600">{formatCurrency(month.koperasi)}</td>
                        <td className="py-3 text-right text-emerald-600">{formatCurrency(month.vendor_earnings)}</td>
                        <td className="py-3 text-right font-semibold text-gray-900">
                          {formatCurrency(month.dana_kecemerlangan + month.koperasi + month.vendor_earnings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <BarChart3 className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p>Tiada data untuk dipaparkan</p>
              </div>
            )}
          </div>
        )}

        {/* Vendors Tab */}
        {activeTab === 'vendors' && (
          <div className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Ringkasan Kewangan Vendor</h3>
            {vendorSummary.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-gray-500 border-b">
                      <th className="pb-3 font-medium">Vendor</th>
                      <th className="pb-3 font-medium text-right">Jumlah Jualan</th>
                      <th className="pb-3 font-medium text-right">Pendapatan</th>
                      <th className="pb-3 font-medium text-right">Sudah Dibayar</th>
                      <th className="pb-3 font-medium text-right">Baki Tersedia</th>
                      <th className="pb-3 font-medium text-right">Pesanan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {vendorSummary.map((vendor) => (
                      <tr key={vendor.vendor_id} className="hover:bg-gray-50">
                        <td className="py-3">
                          <div>
                            <p className="font-medium text-gray-900">{vendor.vendor_name}</p>
                            <p className="text-sm text-gray-500">{vendor.parent_name}</p>
                          </div>
                        </td>
                        <td className="py-3 text-right font-semibold text-gray-900">{formatCurrency(vendor.total_sales)}</td>
                        <td className="py-3 text-right text-emerald-600">{formatCurrency(vendor.total_earnings)}</td>
                        <td className="py-3 text-right text-blue-600">{formatCurrency(vendor.total_paid)}</td>
                        <td className="py-3 text-right">
                          <span className={`font-semibold ${vendor.available_balance > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                            {formatCurrency(vendor.available_balance)}
                          </span>
                          {vendor.pending_payout > 0 && (
                            <span className="block text-xs text-gray-500">
                              (Menunggu: {formatCurrency(vendor.pending_payout)})
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right text-gray-600">{vendor.orders_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Users className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p>Tiada vendor aktif</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Commission Split Info */}
      <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Pecahan Komisyen Marketplace</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Dana Kecemerlangan</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">5%</p>
            <p className="text-xs text-gray-500 mt-1">Untuk dana pendidikan pelajar</p>
          </div>
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 bg-violet-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Koperasi</span>
            </div>
            <p className="text-2xl font-bold text-violet-600">5%</p>
            <p className="text-xs text-gray-500 mt-1">Untuk operasi koperasi maktab</p>
          </div>
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Vendor</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">90%</p>
            <p className="text-xs text-gray-500 mt-1">Pendapatan bersih penjual</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceDashboardPage;
