import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Store, Package, DollarSign, Users, TrendingUp,
  CheckCircle, Clock, Eye, ChevronRight, BarChart3,
  Settings, Award
} from 'lucide-react';
import api from '../../../services/api';

const AdminMarketplaceDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [pendingVendors, setPendingVendors] = useState([]);
  const [pendingProducts, setPendingProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, vendorsRes, productsRes] = await Promise.all([
        api.get('/api/marketplace/dashboard/stats'),
        api.get('/api/marketplace/vendors?status=pending'),
        api.get('/api/marketplace/products?status=pending')
      ]);
      setStats(statsRes.data);
      setPendingVendors(vendorsRes.data || []);
      setPendingProducts(productsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="admin-marketplace-dashboard">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Store className="h-8 w-8 text-teal-600" />
            Multi-Vendor Marketplace
          </h1>
          <p className="text-gray-500 mt-1">Pengurusan vendor, produk, dan pesanan marketplace</p>
        </div>
        <button 
          onClick={() => navigate('/admin/marketplace/settings')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          <Settings className="h-4 w-4" />
          Tetapan
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-teal-500 to-violet-600 text-white rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/90 text-sm">Jumlah Vendor</p>
              <p className="text-3xl font-bold mt-1">{stats?.total_vendors || 0}</p>
            </div>
            <Users className="h-10 w-10 text-white/80" />
          </div>
          {stats?.pending_vendors > 0 && (
            <span className="inline-block mt-3 px-2 py-1 bg-white/20 rounded text-sm">
              {stats.pending_vendors} menunggu
            </span>
          )}
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Jumlah Produk</p>
              <p className="text-3xl font-bold mt-1">{stats?.total_products || 0}</p>
            </div>
            <Package className="h-10 w-10 text-blue-200" />
          </div>
          {stats?.pending_products > 0 && (
            <span className="inline-block mt-3 px-2 py-1 bg-white/20 rounded text-sm">
              {stats.pending_products} menunggu
            </span>
          )}
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm">Dana Kecemerlangan</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(stats?.dana_kecemerlangan_total || 0)}</p>
            </div>
            <Award className="h-10 w-10 text-emerald-200" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-100 text-sm">Koperasi Revenue</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(stats?.koperasi_total || 0)}</p>
            </div>
            <DollarSign className="h-10 w-10 text-amber-200" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div 
          className="bg-white rounded-xl border border-l-4 border-l-teal-500 p-6 cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-between"
          onClick={() => navigate('/admin/marketplace/vendors')}
          data-testid="vendors-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-pastel-lavender rounded-lg">
              <Users className="h-6 w-6 text-teal-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Pengurusan Vendor</p>
              <p className="text-sm text-gray-500">Luluskan & urus vendor</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>

        <div 
          className="bg-white rounded-xl border border-l-4 border-l-blue-500 p-6 cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-between"
          onClick={() => navigate('/admin/marketplace/products')}
          data-testid="products-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Pengurusan Produk</p>
              <p className="text-sm text-gray-500">Luluskan & semak produk</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>

        <div 
          className="bg-white rounded-xl border border-l-4 border-l-emerald-500 p-6 cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-between"
          onClick={() => navigate('/admin/marketplace/finance')}
          data-testid="finance-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-lg">
              <BarChart3 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Kewangan</p>
              <p className="text-sm text-gray-500">Dashboard komisyen</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>

        <div 
          className="bg-white rounded-xl border border-l-4 border-l-amber-500 p-6 cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-between"
          onClick={() => navigate('/admin/marketplace/payouts')}
          data-testid="payouts-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Pengeluaran Wang</p>
              <p className="text-sm text-gray-500">Proses payout vendor</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>

        <div 
          className="bg-white rounded-xl border border-l-4 border-l-pink-500 p-6 cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-between"
          onClick={() => navigate('/admin/marketplace/ads')}
          data-testid="ads-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-pink-100 rounded-lg">
              <Award className="h-6 w-6 text-pink-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Iklan Banner</p>
              <p className="text-sm text-gray-500">Urus & luluskan iklan</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>

        <div 
          className="bg-white rounded-xl border border-l-4 border-l-cyan-500 p-6 cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-between"
          onClick={() => navigate('/admin/marketplace/monetization')}
          data-testid="monetization-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-cyan-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-cyan-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Monetisasi</p>
              <p className="text-sm text-gray-500">Statistik ciri berbayar</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
      </div>

      {/* Pending Approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Vendors */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Vendor Menunggu Kelulusan
            </h3>
            {pendingVendors.length > 0 && (
              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-sm">
                {pendingVendors.length}
              </span>
            )}
          </div>
          <div className="p-4">
            {pendingVendors.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-10 w-10 mx-auto text-emerald-400 mb-2" />
                <p>Tiada vendor menunggu kelulusan</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingVendors.slice(0, 5).map((vendor) => (
                  <div 
                    key={vendor.id} 
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                    onClick={() => navigate(`/admin/marketplace/vendors?id=${vendor.id}`)}
                  >
                    <div>
                      <p className="font-medium text-gray-900">{vendor.business_name}</p>
                      <p className="text-sm text-gray-500">{vendor.parent_name}</p>
                    </div>
                    <button className="px-3 py-1 border border-gray-300 rounded text-sm flex items-center gap-1 hover:bg-white">
                      <Eye className="h-4 w-4" /> Semak
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pending Products */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Produk Menunggu Kelulusan
            </h3>
            {pendingProducts.length > 0 && (
              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-sm">
                {pendingProducts.length}
              </span>
            )}
          </div>
          <div className="p-4">
            {pendingProducts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-10 w-10 mx-auto text-emerald-400 mb-2" />
                <p>Tiada produk menunggu kelulusan</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingProducts.slice(0, 5).map((product) => (
                  <div 
                    key={product.id} 
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                    onClick={() => navigate(`/admin/marketplace/products?id=${product.id}`)}
                  >
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.vendor_name} - {formatCurrency(product.price)}</p>
                    </div>
                    <button className="px-3 py-1 border border-gray-300 rounded text-sm flex items-center gap-1 hover:bg-white">
                      <Eye className="h-4 w-4" /> Semak
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reports Section */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-teal-600" />
            Laporan Kewangan
          </h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <button 
              onClick={() => navigate('/admin/marketplace/analytics')}
              className="p-4 border-2 border-pastel-lilac bg-pastel-mint/50 rounded-lg hover:bg-pastel-mint flex flex-col items-center gap-2 transition"
              data-testid="sales-analytics-btn"
            >
              <BarChart3 className="h-8 w-8 text-teal-600" />
              <span className="font-medium text-teal-900">Analitik Jualan</span>
              <span className="text-xs text-teal-600">Dashboard komprehensif</span>
            </button>

            <button 
              onClick={() => navigate('/admin/marketplace/reports/dana-kecemerlangan')}
              className="p-4 border rounded-lg hover:bg-gray-50 flex flex-col items-center gap-2 transition"
            >
              <Award className="h-8 w-8 text-emerald-600" />
              <span className="font-medium">Dana Kecemerlangan</span>
              <span className="text-xs text-gray-500">Laporan kutipan dana</span>
            </button>

            <button 
              onClick={() => navigate('/admin/marketplace/reports/koperasi')}
              className="p-4 border rounded-lg hover:bg-gray-50 flex flex-col items-center gap-2 transition"
            >
              <DollarSign className="h-8 w-8 text-amber-600" />
              <span className="font-medium">Koperasi Revenue</span>
              <span className="text-xs text-gray-500">Pendapatan koperasi</span>
            </button>

            <button 
              onClick={() => navigate('/admin/marketplace/reports/vendors')}
              className="p-4 border rounded-lg hover:bg-gray-50 flex flex-col items-center gap-2 transition"
            >
              <TrendingUp className="h-8 w-8 text-teal-600" />
              <span className="font-medium">Prestasi Vendor</span>
              <span className="text-xs text-gray-500">Analitik vendor</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminMarketplaceDashboard;
