import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Store, Package, ShoppingCart, DollarSign, TrendingUp,
  Plus, Clock, XCircle, AlertCircle,
  ChevronRight, BarChart3, Star
} from 'lucide-react';
import api from '../../services/api';

const VendorDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, vendorRes] = await Promise.all([
        api.get('/api/marketplace/dashboard/stats'),
        api.get('/api/marketplace/vendors/my-vendor')
      ]);
      
      setStats(statsRes.data);
      setVendor(vendorRes.data?.vendor);

      // Fetch recent orders if vendor is approved
      if (vendorRes.data?.vendor?.status === 'approved') {
        try {
          const ordersRes = await api.get('/api/marketplace/orders', {
            params: { vendor_id: vendorRes.data.vendor.id }
          });
          setRecentOrders(ordersRes.data?.slice(0, 5) || []);
        } catch (e) {
          console.error('Error fetching orders:', e);
        }
      }
    } catch (error) {
      console.error('Error fetching vendor data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount || 0);
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-700',
      approved: 'bg-emerald-100 text-emerald-700',
      rejected: 'bg-red-100 text-red-700',
      suspended: 'bg-gray-100 text-gray-700'
    };
    const labels = {
      pending: 'Menunggu Kelulusan',
      approved: 'Aktif',
      rejected: 'Ditolak',
      suspended: 'Digantung'
    };
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getOrderStatusBadge = (status) => {
    const styles = {
      pending_payment: 'bg-gray-100 text-gray-700',
      paid: 'bg-blue-100 text-blue-700',
      preparing: 'bg-amber-100 text-amber-700',
      out_for_delivery: 'bg-pastel-lavender text-violet-700',
      arrived_hostel: 'bg-pastel-mint text-teal-700',
      delivered: 'bg-emerald-100 text-emerald-700',
      failed: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-100 text-gray-600'
    };
    const labels = {
      pending_payment: 'Menunggu Bayaran',
      paid: 'Dibayar',
      preparing: 'Sedang Disediakan',
      out_for_delivery: 'Dalam Penghantaran',
      arrived_hostel: 'Sampai Asrama',
      delivered: 'Dihantar',
      failed: 'Gagal',
      cancelled: 'Dibatalkan'
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  // Show vendor application form if not a vendor yet
  if (!vendor) {
    return (
      <div className="p-6 min-w-0 overflow-x-hidden" data-testid="vendor-dashboard">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl border p-8 text-center">
            <Store className="h-16 w-16 mx-auto text-violet-600 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Jadi Vendor Marketplace</h2>
            <p className="text-gray-500 mb-6">
              Mulakan perniagaan anda dengan menjual produk kepada pelajar dan komuniti MRSMKU.
              Pendapatan akan dibahagikan: 90% kepada anda, 5% Dana Kecemerlangan, 5% Koperasi.
            </p>
            <button 
              onClick={() => navigate('/vendor/register')}
              className="px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition flex items-center gap-2 mx-auto"
            >
              <Plus className="h-5 w-5" />
              Mohon Jadi Vendor
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show pending/rejected status
  if (vendor.status === 'pending') {
    return (
      <div className="p-6 min-w-0 overflow-x-hidden" data-testid="vendor-dashboard">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl border p-8 text-center">
            <Clock className="h-16 w-16 mx-auto text-amber-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Permohonan Sedang Diproses</h2>
            <p className="text-gray-500 mb-4">
              Permohonan vendor anda untuk "{vendor.business_name}" sedang disemak oleh pentadbir.
              Anda akan dimaklumkan setelah permohonan diluluskan.
            </p>
            {getStatusBadge(vendor.status)}
          </div>
        </div>
      </div>
    );
  }

  if (vendor.status === 'rejected') {
    return (
      <div className="p-6 min-w-0 overflow-x-hidden" data-testid="vendor-dashboard">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl border p-8 text-center">
            <XCircle className="h-16 w-16 mx-auto text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Permohonan Ditolak</h2>
            <p className="text-gray-500 mb-4">
              Permohonan vendor anda telah ditolak.
            </p>
            {vendor.rejection_reason && (
              <div className="bg-red-50 p-4 rounded-lg text-left mb-4">
                <p className="text-sm text-red-600 font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Sebab Penolakan:
                </p>
                <p className="text-red-700 mt-1">{vendor.rejection_reason}</p>
              </div>
            )}
            <button 
              onClick={() => navigate('/vendor/register')}
              className="px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition"
            >
              Mohon Semula
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (vendor.status === 'suspended') {
    return (
      <div className="p-6 min-w-0 overflow-x-hidden" data-testid="vendor-dashboard">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl border p-8 text-center">
            <AlertCircle className="h-16 w-16 mx-auto text-gray-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Akaun Digantung</h2>
            <p className="text-gray-500 mb-4">
              Akaun vendor anda telah digantung. Sila hubungi pentadbir untuk maklumat lanjut.
            </p>
            {getStatusBadge(vendor.status)}
          </div>
        </div>
      </div>
    );
  }

  // Approved vendor dashboard
  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="vendor-dashboard">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{vendor.business_name}</h1>
            {getStatusBadge(vendor.status)}
          </div>
          <p className="text-gray-500">Dashboard Vendor</p>
        </div>
        <button 
          onClick={() => navigate('/vendor/products/new')}
          className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition flex items-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Tambah Produk
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Produk Saya</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.my_products || 0}</p>
            </div>
            <div className="p-3 bg-pastel-lavender rounded-lg">
              <Package className="h-6 w-6 text-violet-600" />
            </div>
          </div>
          {stats?.pending_products > 0 && (
            <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {stats.pending_products} menunggu kelulusan
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Pesanan</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.my_orders || 0}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          {stats?.pending_orders > 0 && (
            <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {stats.pending_orders} perlu tindakan
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Jumlah Jualan</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(stats?.total_sales)}</p>
            </div>
            <div className="p-3 bg-emerald-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Pendapatan Bersih</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(stats?.total_earnings)}</p>
            </div>
            <div className="p-3 bg-amber-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-amber-600" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Selepas komisyen 10%</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          className="bg-white rounded-xl border p-6 cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-between"
          onClick={() => navigate('/vendor/products')}
          data-testid="manage-products-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-pastel-lavender rounded-lg">
              <Package className="h-6 w-6 text-violet-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Urus Produk</p>
              <p className="text-sm text-gray-500">Tambah, edit, padam</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>

        <div 
          className="bg-white rounded-xl border p-6 cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-between"
          onClick={() => navigate('/vendor/bundles')}
          data-testid="manage-bundles-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-pastel-mint rounded-lg">
              <Package className="h-6 w-6 text-teal-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Pakej Bundle</p>
              <p className="text-sm text-gray-500">Cipta pakej produk</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>

        <div 
          className="bg-white rounded-xl border p-6 cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-between"
          onClick={() => navigate('/vendor/orders')}
          data-testid="view-orders-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Pesanan Saya</p>
              <p className="text-sm text-gray-500">Lihat & urus pesanan</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>

        <div 
          className="bg-white rounded-xl border p-6 cursor-pointer hover:shadow-lg transition-shadow flex items-center justify-between"
          onClick={() => navigate('/vendor/wallet')}
          data-testid="vendor-wallet-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Dompet</p>
              <p className="text-sm text-gray-500">Urus pendapatan</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
      </div>

      {/* Monetization Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div 
          className="bg-gradient-to-r from-teal-500 to-violet-500 rounded-xl p-6 cursor-pointer hover:shadow-lg transition-shadow text-white"
          onClick={() => navigate('/vendor/ads')}
          data-testid="vendor-ads-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-lg">
              <Star className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold">Iklan Banner</p>
              <p className="text-sm text-white/80">Promosikan perniagaan</p>
            </div>
          </div>
        </div>

        <div 
          className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-6 cursor-pointer hover:shadow-lg transition-shadow text-white"
          onClick={() => navigate('/vendor/boost')}
          data-testid="vendor-boost-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-lg">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold">Boost Produk</p>
              <p className="text-sm text-white/80">Tingkatkan paparan</p>
            </div>
          </div>
        </div>

        <div 
          className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl p-6 cursor-pointer hover:shadow-lg transition-shadow text-white"
          onClick={() => navigate('/vendor/subscription')}
          data-testid="vendor-premium-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-lg">
              <Star className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold">Premium Vendor</p>
              <p className="text-sm text-white/80">Naik taraf akaun</p>
            </div>
          </div>
        </div>

        <div 
          className="bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl p-6 cursor-pointer hover:shadow-lg transition-shadow text-white"
          onClick={() => navigate('/vendor/analytics')}
          data-testid="vendor-analytics-card"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-lg">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold">Analitik</p>
              <p className="text-sm text-white/80">Lihat prestasi kedai</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-gray-600" />
            Pesanan Terkini
          </h3>
          <button 
            onClick={() => navigate('/vendor/orders')}
            className="text-sm text-violet-600 hover:text-violet-700"
          >
            Lihat Semua
          </button>
        </div>
        <div className="p-4">
          {recentOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <ShoppingCart className="h-10 w-10 mx-auto text-gray-300 mb-2" />
              <p>Tiada pesanan lagi</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div 
                  key={order.id} 
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                  onClick={() => navigate(`/vendor/orders/${order.id}`)}
                >
                  <div>
                    <p className="font-medium text-gray-900">{order.order_number}</p>
                    <p className="text-sm text-gray-500">
                      {order.student_name} - {order.items_count} item
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">{formatCurrency(order.total_amount)}</p>
                    {getOrderStatusBadge(order.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Commission Info */}
      <div className="bg-gradient-to-r from-pastel-lavender to-pastel-mint rounded-xl border border-pastel-lilac p-6">
        <h3 className="font-semibold text-violet-900 flex items-center gap-2 mb-3">
          <BarChart3 className="h-5 w-5" />
          Pecahan Pendapatan
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-white rounded-lg p-4">
            <p className="text-2xl font-bold text-emerald-600">90%</p>
            <p className="text-sm text-gray-600">Anda</p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <p className="text-2xl font-bold text-violet-600">5%</p>
            <p className="text-sm text-gray-600">Dana Kecemerlangan</p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <p className="text-2xl font-bold text-amber-600">5%</p>
            <p className="text-sm text-gray-600">Koperasi</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VendorDashboard;
