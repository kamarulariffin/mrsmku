import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, TrendingUp, DollarSign, ShoppingCart, Users,
  BarChart3, Download, RefreshCw, FileText, Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { API_URL } from '../../../services/api';

// Simple Card components
const Card = ({ children, className = '' }) => (
  <div className={`rounded-xl ${className}`}>{children}</div>
);
const CardHeader = ({ children }) => <div className="p-4 pb-2">{children}</div>;
const CardTitle = ({ children, className = '' }) => <h3 className={`font-semibold ${className}`}>{children}</h3>;
const CardContent = ({ children }) => <div className="p-4 pt-2">{children}</div>;
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

export default function SalesAnalyticsPage() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('12months');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/marketplace/analytics/sales-overview?period=${period}`, {
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

  const handleExport = async (type) => {
    try {
      setExporting(true);
      const token = localStorage.getItem('token');
      const endpoint = type === 'sales' ? 'sales' : 'ledger';
      const response = await fetch(`${API_URL}/api/marketplace/analytics/export/${endpoint}?format=csv`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Download CSV
        const blob = new Blob([data.content], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success(`${data.record_count} rekod berjaya dieksport`);
      } else {
        toast.error('Gagal mengeksport data');
      }
    } catch (error) {
      toast.error('Ralat eksport');
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount || 0);
  };

  // Bar chart component
  const BarChart = ({ data, dataKeys, colors }) => {
    if (!data || data.length === 0) return <p className="text-gray-400 text-center py-8">Tiada data</p>;
    
    const maxValue = Math.max(...data.flatMap(d => dataKeys.map(k => d[k] || 0)));
    
    return (
      <div className="space-y-3">
        {data.slice(-8).map((item, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">{item.month?.slice(-5) || item.date?.slice(-5)}</span>
              <span className="text-white">{formatCurrency(item[dataKeys[0]])}</span>
            </div>
            <div className="flex gap-1 h-6">
              {dataKeys.map((key, kIdx) => (
                <div 
                  key={key}
                  className={`h-full rounded ${colors[kIdx]} transition-all duration-500`}
                  style={{ width: `${maxValue > 0 ? (item[key] / maxValue) * 100 : 0}%` }}
                  title={`${key}: ${formatCurrency(item[key])}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 min-w-0 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/admin/marketplace')} className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Analitik Jualan</h1>
              <p className="text-gray-400">Laporan komprehensif marketplace</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <select 
              value={period} 
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
              data-testid="period-selector"
            >
              <option value="6months">6 Bulan</option>
              <option value="12months">12 Bulan</option>
              <option value="all">Semua Masa</option>
            </select>
            
            <Button onClick={() => handleExport('sales')} disabled={exporting} variant="outline" className="border-emerald-600 text-emerald-400">
              <Download className="w-4 h-4 mr-2" />
              Export Jualan
            </Button>
            
            <Button onClick={() => handleExport('ledger')} disabled={exporting} variant="outline" className="border-blue-600 text-blue-400">
              <FileText className="w-4 h-4 mr-2" />
              Export Lejar
            </Button>
            
            <Button onClick={fetchAnalytics} variant="ghost">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-teal-900/50 to-teal-800/30 border-teal-700/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-teal-300 text-xs">Jumlah Jualan</p>
                  <p className="text-xl font-bold text-white mt-1" data-testid="total-sales">
                    {formatCurrency(analytics?.summary?.total_sales)}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-teal-400 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-900/50 to-emerald-800/30 border-emerald-700/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-300 text-xs">Dana Kecemerlangan</p>
                  <p className="text-xl font-bold text-white mt-1" data-testid="dana-kecemerlangan">
                    {formatCurrency(analytics?.summary?.dana_kecemerlangan)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-emerald-400 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 border-blue-700/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-300 text-xs">Koperasi</p>
                  <p className="text-xl font-bold text-white mt-1" data-testid="koperasi">
                    {formatCurrency(analytics?.summary?.koperasi)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-blue-400 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-violet-900/50 to-violet-800/30 border-violet-700/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-xs">Pendapatan Vendor</p>
                  <p className="text-xl font-bold text-white mt-1" data-testid="vendor-earnings">
                    {formatCurrency(analytics?.summary?.vendor_earnings)}
                  </p>
                </div>
                <Users className="w-8 h-8 text-violet-400 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-900/50 to-amber-800/30 border-amber-700/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-300 text-xs">Jumlah Pesanan</p>
                  <p className="text-xl font-bold text-white mt-1" data-testid="total-orders">
                    {analytics?.summary?.total_orders || 0}
                  </p>
                </div>
                <ShoppingCart className="w-8 h-8 text-amber-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Trend */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-teal-400" />
                Trend Jualan Bulanan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart 
                data={analytics?.monthly_trend} 
                dataKeys={['sales']} 
                colors={['bg-gradient-to-r from-teal-500 to-violet-500']}
              />
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-emerald-500" />
                  <span className="text-gray-400">Dana Kecemerlangan</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-blue-500" />
                  <span className="text-gray-400">Koperasi</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-violet-500" />
                  <span className="text-gray-400">Vendor</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Daily Trend (Last 30 days) */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal-400" />
                Jualan Harian (30 Hari)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart 
                data={analytics?.daily_trend} 
                dataKeys={['sales']} 
                colors={['bg-gradient-to-r from-teal-500 to-cyan-500']}
              />
            </CardContent>
          </Card>
        </div>

        {/* Top Vendors & Category */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Vendors */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-400" />
                Vendor Terbaik
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics?.top_vendors?.length > 0 ? (
                  analytics.top_vendors.slice(0, 5).map((vendor, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700/70 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                          idx === 0 ? 'bg-amber-500/30 text-amber-400' :
                          idx === 1 ? 'bg-gray-400/30 text-gray-300' :
                          idx === 2 ? 'bg-amber-700/30 text-amber-600' :
                          'bg-gray-600/30 text-gray-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <span className="text-white font-medium">{vendor.name}</span>
                          <p className="text-xs text-gray-400">{vendor.products} produk</p>
                        </div>
                      </div>
                      <span className="text-emerald-400 font-medium">{formatCurrency(vendor.total_sales)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 text-center py-4">Tiada data vendor</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Category Breakdown */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-amber-400" />
                Jualan Mengikut Kategori
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics?.category_breakdown?.length > 0 ? (
                  analytics.category_breakdown.slice(0, 6).map((cat, idx) => {
                    const total = analytics.category_breakdown.reduce((a, b) => a + b.sales, 0);
                    const percent = total > 0 ? ((cat.sales / total) * 100).toFixed(1) : 0;
                    const colors = [
                      'from-emerald-500 to-teal-500',
                      'from-blue-500 to-teal-500',
                      'from-violet-500 to-fuchsia-500',
                      'from-amber-500 to-orange-500',
                      'from-rose-500 to-red-500',
                      'from-cyan-500 to-blue-500'
                    ];
                    
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{cat.category}</span>
                          <span className="text-white">{formatCurrency(cat.sales)} <span className="text-gray-400">({percent}%)</span></span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2.5">
                          <div 
                            className={`h-full rounded-full bg-gradient-to-r ${colors[idx % colors.length]}`}
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

        {/* Order Status Distribution */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-cyan-400" />
              Taburan Status Pesanan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {Object.entries(analytics?.order_status_distribution || {}).map(([status, count]) => {
                const statusConfig = {
                  'pending_payment': { label: 'Menunggu Bayaran', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
                  'paid': { label: 'Dibayar', bg: 'bg-blue-500/20', text: 'text-blue-400' },
                  'preparing': { label: 'Disediakan', bg: 'bg-violet-500/20', text: 'text-violet-400' },
                  'out_for_delivery': { label: 'Penghantaran', bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
                  'arrived_hostel': { label: 'Sampai', bg: 'bg-teal-500/20', text: 'text-teal-400' },
                  'delivered': { label: 'Selesai', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
                  'cancelled': { label: 'Batal', bg: 'bg-red-500/20', text: 'text-red-400' },
                  'failed': { label: 'Gagal', bg: 'bg-rose-500/20', text: 'text-rose-400' }
                };
                const config = statusConfig[status] || { label: status, bg: 'bg-gray-500/20', text: 'text-gray-400' };
                
                return (
                  <div key={status} className={`p-3 rounded-xl ${config.bg} text-center`}>
                    <p className="text-xl font-bold text-white">{count}</p>
                    <p className={`text-xs ${config.text}`}>{config.label}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
