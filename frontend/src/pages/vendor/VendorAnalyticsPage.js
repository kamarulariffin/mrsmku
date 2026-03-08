import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, TrendingUp, Package, ShoppingCart, Wallet,
  BarChart3, PieChart, Calendar, Download, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { API_URL } from '../../services/api';

// Simple Card components
const Card = ({ children, className = '' }) => (
  <div className={`rounded-xl ${className}`}>{children}</div>
);
const CardHeader = ({ children }) => <div className="p-4 pb-2">{children}</div>;
const CardTitle = ({ children, className = '' }) => <h3 className={`font-semibold ${className}`}>{children}</h3>;
const CardContent = ({ children, className = '' }) => <div className={`p-4 pt-2 ${className}`}>{children}</div>;
const Button = ({ children, onClick, disabled, variant = 'default', className = '' }) => {
  const baseClass = "px-4 py-2 rounded-lg font-medium transition-colors flex items-center";
  const variants = {
    default: "bg-gray-700 hover:bg-gray-600 text-white",
    outline: "border bg-transparent hover:bg-gray-800",
    ghost: "bg-transparent hover:bg-gray-800 text-gray-400"
  };
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseClass} ${variants[variant]} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
};

export default function VendorAnalyticsPage() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('6months');

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/marketplace/analytics/my-analytics?period=${period}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      } else {
        toast.error('Gagal memuatkan analitik');
      }
    } catch (error) {
      toast.error('Ralat sambungan');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount || 0);
  };

  // Simple bar chart component
  const SimpleBarChart = ({ data, dataKey, label }) => {
    if (!data || data.length === 0) return <p className="text-gray-400 text-center py-8">Tiada data</p>;
    
    const maxValue = Math.max(...data.map(d => d[dataKey] || 0));
    
    return (
      <div className="space-y-2">
        {data.slice(-6).map((item, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-16">{item.month?.slice(-5) || idx}</span>
            <div className="flex-1 bg-gray-700 rounded-full h-6 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${maxValue > 0 ? (item[dataKey] / maxValue) * 100 : 0}%` }}
              />
            </div>
            <span className="text-sm text-white w-24 text-right">{formatCurrency(item[dataKey])}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 min-w-0 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/vendor')} className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Analitik Vendor</h1>
              <p className="text-gray-400">{analytics?.vendor?.business_name || 'Kedai Anda'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <select 
              value={period} 
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
              data-testid="period-selector"
            >
              <option value="6months">6 Bulan</option>
              <option value="12months">12 Bulan</option>
              <option value="all">Semua</option>
            </select>
            <Button onClick={fetchAnalytics} variant="outline" className="border-gray-600">
              <RefreshCw className="w-4 h-4 mr-2" />
              Muat Semula
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-emerald-900/50 to-emerald-800/30 border-emerald-700/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-300 text-sm">Jumlah Jualan</p>
                  <p className="text-2xl font-bold text-white mt-1" data-testid="total-sales">
                    {formatCurrency(analytics?.vendor?.total_sales)}
                  </p>
                </div>
                <div className="p-3 bg-emerald-500/20 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 border-blue-700/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-300 text-sm">Baki Tersedia</p>
                  <p className="text-2xl font-bold text-white mt-1" data-testid="available-balance">
                    {formatCurrency(analytics?.wallet?.available_balance)}
                  </p>
                </div>
                <div className="p-3 bg-blue-500/20 rounded-xl">
                  <Wallet className="w-6 h-6 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-violet-900/50 to-violet-800/30 border-violet-700/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Produk Aktif</p>
                  <p className="text-2xl font-bold text-white mt-1" data-testid="total-products">
                    {analytics?.vendor?.total_products || 0}
                  </p>
                </div>
                <div className="p-3 bg-violet-500/20 rounded-xl">
                  <Package className="w-6 h-6 text-violet-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-900/50 to-amber-800/30 border-amber-700/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-300 text-sm">Jumlah Pesanan</p>
                  <p className="text-2xl font-bold text-white mt-1" data-testid="total-orders">
                    {Object.values(analytics?.order_status || {}).reduce((a, b) => a + b, 0)}
                  </p>
                </div>
                <div className="p-3 bg-amber-500/20 rounded-xl">
                  <ShoppingCart className="w-6 h-6 text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Sales Trend */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                Trend Jualan Bulanan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleBarChart data={analytics?.monthly_trend} dataKey="sales" label="Jualan" />
            </CardContent>
          </Card>

          {/* Earnings Trend */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                Trend Pendapatan Bersih
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleBarChart data={analytics?.earnings_trend} dataKey="earnings" label="Pendapatan" />
            </CardContent>
          </Card>
        </div>

        {/* Top Products & Category */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Products */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-violet-400" />
                Produk Terlaris
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics?.top_products?.length > 0 ? (
                  analytics.top_products.map((product, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-violet-500/30 text-violet-400 flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </span>
                        <span className="text-white">{product.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-400 font-medium">{product.sales_count} terjual</p>
                        <p className="text-xs text-gray-400">{formatCurrency(product.revenue)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 text-center py-4">Tiada data jualan</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Category Breakdown */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <PieChart className="w-5 h-5 text-amber-400" />
                Jualan Mengikut Kategori
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics?.category_breakdown?.length > 0 ? (
                  analytics.category_breakdown.map((cat, idx) => {
                    const total = analytics.category_breakdown.reduce((a, b) => a + b.total, 0);
                    const percent = total > 0 ? ((cat.total / total) * 100).toFixed(1) : 0;
                    const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500'];
                    
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{cat.category}</span>
                          <span className="text-white font-medium">{formatCurrency(cat.total)} ({percent}%)</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div 
                            className={`h-full rounded-full ${colors[idx % colors.length]}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-gray-400 text-center py-4">Tiada data kategori</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Order Status */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-teal-400" />
              Status Pesanan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Object.entries(analytics?.order_status || {}).map(([status, count]) => {
                const statusConfig = {
                  'pending_payment': { label: 'Menunggu Bayaran', color: 'bg-yellow-500/20 text-yellow-400' },
                  'paid': { label: 'Dibayar', color: 'bg-blue-500/20 text-blue-400' },
                  'preparing': { label: 'Disediakan', color: 'bg-violet-500/20 text-violet-400' },
                  'out_for_delivery': { label: 'Dalam Penghantaran', color: 'bg-cyan-500/20 text-cyan-400' },
                  'arrived_hostel': { label: 'Sampai Asrama', color: 'bg-teal-500/20 text-teal-400' },
                  'delivered': { label: 'Selesai', color: 'bg-emerald-500/20 text-emerald-400' },
                  'cancelled': { label: 'Dibatalkan', color: 'bg-red-500/20 text-red-400' },
                  'failed': { label: 'Gagal', color: 'bg-rose-500/20 text-rose-400' }
                };
                const config = statusConfig[status] || { label: status, color: 'bg-gray-500/20 text-gray-400' };
                
                return (
                  <div key={status} className={`p-4 rounded-xl ${config.color.split(' ')[0]}`}>
                    <p className="text-2xl font-bold text-white">{count}</p>
                    <p className={`text-sm ${config.color.split(' ')[1]}`}>{config.label}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Wallet Summary */}
        <Card className="bg-gradient-to-r from-gray-800 to-gray-700 border-gray-600">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-400" />
              Ringkasan Dompet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-gray-400 text-sm">Jumlah Pendapatan</p>
                <p className="text-xl font-bold text-white">{formatCurrency(analytics?.wallet?.total_earnings)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Baki Tersedia</p>
                <p className="text-xl font-bold text-emerald-400">{formatCurrency(analytics?.wallet?.available_balance)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Menunggu</p>
                <p className="text-xl font-bold text-amber-400">{formatCurrency(analytics?.wallet?.pending_amount)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Sudah Dikeluarkan</p>
                <p className="text-xl font-bold text-blue-400">{formatCurrency(analytics?.wallet?.total_withdrawn)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
