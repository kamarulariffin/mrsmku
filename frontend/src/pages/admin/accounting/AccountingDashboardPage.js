import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Wallet, Package, ShoppingCart,
  BarChart3, RefreshCw,
  Building, ArrowUpRight, ArrowDownRight, Filter,
  Clock, CheckCircle,
  Layers, CreditCard
} from 'lucide-react';
import { useAuth } from '../../../App';
import { api } from '../../../services/api';

// Stat Card Component
const StatCard = ({ icon: Icon, label, value, subValue, color = 'blue', trend, trendType }) => {
  const colors = {
    blue: 'from-blue-500 to-teal-500',
    green: 'from-emerald-500 to-teal-600',
    amber: 'from-amber-500 to-orange-600',
    purple: 'from-violet-500 to-fuchsia-500',
    red: 'from-red-500 to-rose-600',
    cyan: 'from-cyan-500 to-blue-600',
    indigo: 'from-teal-500 to-violet-500'
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-lg transition-all"
    >
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-xl bg-gradient-to-br ${colors[color]} shadow-lg`}>
          <Icon className="text-white" size={24} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-sm font-medium ${
            trendType === 'positive' ? 'text-emerald-600' : 
            trendType === 'negative' ? 'text-red-600' : 'text-slate-500'
          }`}>
            {trendType === 'positive' ? <ArrowUpRight size={16} /> : 
             trendType === 'negative' ? <ArrowDownRight size={16} /> : null}
            {trend}
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500 mt-1">{label}</p>
        {subValue && <p className="text-xs text-slate-400 mt-0.5">{subValue}</p>}
      </div>
    </motion.div>
  );
};

// Account Card Component
const AccountCard = ({ title, description, icon: Icon, color, stats, children }) => {
  const colors = {
    emerald: 'from-emerald-500 to-teal-600 border-emerald-200',
    blue: 'from-blue-500 to-teal-500 border-blue-200',
    amber: 'from-amber-500 to-orange-600 border-amber-200',
    purple: 'from-violet-500 to-fuchsia-500 border-pastel-lilac'
  };
  
  const bgColors = {
    emerald: 'bg-emerald-50',
    blue: 'bg-blue-50',
    amber: 'bg-amber-50',
    purple: 'bg-pastel-lavender'
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-white rounded-2xl border ${colors[color].split(' ')[1]} overflow-hidden shadow-sm hover:shadow-lg transition-all`}
    >
      <div className={`p-4 bg-gradient-to-r ${colors[color].split(' ').slice(0, 2).join(' ')}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Icon className="text-white" size={24} />
          </div>
          <div className="text-white">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm opacity-90">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-5">
        {stats && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {stats.map((stat, idx) => (
              <div key={idx} className={`${bgColors[color]} rounded-xl p-3 text-center`}>
                <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-600">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
        {children}
      </div>
    </motion.div>
  );
};

// Mini Bar Chart Component
const MiniBarChart = ({ data = [], color = 'blue' }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  const colors = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    purple: 'bg-violet-500'
  };
  
  return (
    <div className="flex items-end gap-2 h-20">
      {data.map((item, idx) => (
        <div key={idx} className="flex-1 flex flex-col items-center gap-1">
          <div
            className={`w-full rounded-t ${colors[color]} opacity-80 hover:opacity-100 transition-all`}
            style={{ height: `${(item.value / max) * 100}%`, minHeight: '4px' }}
          />
          <span className="text-xs text-slate-500 truncate w-full text-center">{item.label}</span>
        </div>
      ))}
    </div>
  );
};

// Status Badge Component
const StatusBadge = ({ status, count, amount }) => {
  const statusConfig = {
    pending: { label: 'Menunggu', color: 'bg-amber-100 text-amber-700' },
    paid: { label: 'Dibayar', color: 'bg-emerald-100 text-emerald-700' },
    confirmed: { label: 'Disahkan', color: 'bg-blue-100 text-blue-700' },
    paid_out: { label: 'Telah Dibayar', color: 'bg-pastel-lavender text-violet-700' },
    processing: { label: 'Diproses', color: 'bg-cyan-100 text-cyan-700' },
    ready: { label: 'Sedia', color: 'bg-pastel-mint text-teal-700' },
    delivered: { label: 'Dihantar', color: 'bg-emerald-100 text-emerald-700' },
    collected: { label: 'Diambil', color: 'bg-emerald-100 text-emerald-700' },
    cancelled: { label: 'Dibatal', color: 'bg-red-100 text-red-700' }
  };
  
  const config = statusConfig[status] || { label: status, color: 'bg-slate-100 text-slate-700' };
  
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${config.color}`}>
      <span className="text-xs font-medium">{config.label}</span>
      {count !== undefined && <span className="text-xs opacity-70">({count})</span>}
      {amount !== undefined && <span className="text-xs font-semibold">RM {amount.toFixed(2)}</span>}
    </div>
  );
};

// Main Component
const AccountingDashboardPage = () => {
  useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = async (showToast = false) => {
    if (showToast) setRefreshing(true);
    else setLoading(true);
    
    try {
      const params = {};
      if (selectedPeriod === 'custom' && startDate) params.start_date = startDate;
      if (selectedPeriod === 'custom' && endDate) params.end_date = endDate;
      if (selectedPeriod === 'month') {
        const now = new Date();
        params.start_date = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      }
      if (selectedPeriod === 'year') {
        const now = new Date();
        params.start_date = new Date(now.getFullYear(), 0, 1).toISOString();
      }
      
      const [summaryRes, trendRes] = await Promise.all([
        api.get('/api/accounting/summary', { params }),
        api.get('/api/accounting/monthly-trend', { params: { months: 6 } })
      ]);
      
      setSummary(summaryRes.data);
      setTrend(trendRes.data);
      
      if (showToast) toast.success('Data dikemaskini');
    } catch (err) {
      console.error('Failed to fetch accounting data:', err);
      toast.error('Gagal memuatkan data perakaunan');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedPeriod, startDate, endDate]);

  const formatCurrency = (amount) => {
    return `RM ${(amount || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  const accounts = summary?.accounts || {};
  const grandTotals = summary?.grand_totals || {};

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="accounting-dashboard-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Dashboard Perakaunan</h1>
          <p className="text-slate-600">Ringkasan akaun dan pendapatan MRSMKU</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            Muat Semula
          </button>
        </div>
      </div>

      {/* Period Filter */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <Filter size={18} className="text-slate-400" />
        <div className="flex gap-2">
          {[
            { value: 'all', label: 'Keseluruhan' },
            { value: 'month', label: 'Bulan Ini' },
            { value: 'year', label: 'Tahun Ini' },
            { value: 'custom', label: 'Pilih Tarikh' }
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setSelectedPeriod(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                selectedPeriod === opt.value
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {selectedPeriod === 'custom' && (
          <div className="flex items-center gap-2 ml-4">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
            />
            <span className="text-slate-400">hingga</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
            />
          </div>
        )}
      </div>

      {/* Grand Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Wallet}
          label="Jumlah Pendapatan"
          value={formatCurrency(grandTotals.total_revenue)}
          subValue="Komisyen & hasil jualan"
          color="emerald"
        />
        <StatCard
          icon={ShoppingCart}
          label="Jumlah Jualan"
          value={formatCurrency(grandTotals.total_sales)}
          subValue={`${grandTotals.total_orders || 0} pesanan`}
          color="blue"
        />
        <StatCard
          icon={Package}
          label="Nilai Inventori"
          value={formatCurrency(grandTotals.total_inventory_value)}
          subValue="Stok dalam simpanan"
          color="amber"
        />
        <StatCard
          icon={CreditCard}
          label="Pesanan Keseluruhan"
          value={(grandTotals.total_orders || 0).toLocaleString()}
          subValue="Merentasi semua modul"
          color="purple"
        />
      </div>

      {/* Account Cards */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Muafakat Account */}
        <AccountCard
          title={accounts.muafakat?.name || 'Akaun Muafakat'}
          description={accounts.muafakat?.description || 'Pendapatan utama'}
          icon={Building}
          color="emerald"
          stats={[
            { label: 'Disahkan', value: formatCurrency(accounts.muafakat?.confirmed) },
            { label: 'Telah Dibayar', value: formatCurrency(accounts.muafakat?.paid_out) },
            { label: 'Menunggu', value: formatCurrency(accounts.muafakat?.pending) },
            { label: 'Jumlah', value: formatCurrency(accounts.muafakat?.total_revenue) }
          ]}
        >
          <div className="mt-2 p-3 bg-emerald-50 rounded-xl">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-600" />
              <span className="text-sm text-emerald-700 font-medium">
                {(accounts.muafakat?.transaction_counts?.confirmed || 0) + (accounts.muafakat?.transaction_counts?.paid_out || 0)} transaksi selesai
              </span>
            </div>
          </div>
        </AccountCard>

        {/* Merchandise Account */}
        <AccountCard
          title={accounts.merchandise?.name || 'Akaun Merchandise'}
          description={accounts.merchandise?.description || 'Jualan barangan'}
          icon={ShoppingCart}
          color="blue"
          stats={[
            { label: 'Jumlah Jualan', value: formatCurrency(accounts.merchandise?.total_sales) },
            { label: 'Pesanan', value: accounts.merchandise?.total_orders || 0 },
            { label: 'Nilai Stok', value: formatCurrency(accounts.merchandise?.inventory?.stock_value) },
            { label: 'Item Stok', value: accounts.merchandise?.inventory?.total_items || 0 }
          ]}
        >
          {accounts.merchandise?.by_status && Object.keys(accounts.merchandise.by_status).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(accounts.merchandise.by_status).map(([status, data]) => (
                <StatusBadge key={status} status={status} count={data.count} />
              ))}
            </div>
          )}
        </AccountCard>

        {/* Koperasi Account (termasuk PUM) */}
        <AccountCard
          title={accounts.koperasi?.name || 'Akaun Koperasi (termasuk PUM)'}
          description={accounts.koperasi?.description || 'Jualan kit dan barangan koperasi maktab, termasuk PUM'}
          icon={Layers}
          color="amber"
          stats={[
            { label: 'Jumlah Jualan', value: formatCurrency(accounts.koperasi?.total_sales) },
            { label: 'Komisyen', value: formatCurrency(accounts.koperasi?.commission_earned) },
            { label: 'Pesanan', value: accounts.koperasi?.total_orders || 0 },
            { label: 'Nilai Stok (PUM)', value: formatCurrency(accounts.koperasi?.inventory?.stock_value) }
          ]}
        >
          {accounts.koperasi?.sub_accounts && (
            <div className="mt-2 p-3 bg-amber-50 rounded-xl text-sm">
              <p className="font-medium text-slate-700 mb-1">Pecahan:</p>
              <p className="text-slate-600">
                Koperasi: {formatCurrency(accounts.koperasi.sub_accounts.koperasi?.total_sales)} ({accounts.koperasi.sub_accounts.koperasi?.total_orders || 0} pesanan) · PUM: {formatCurrency(accounts.koperasi.sub_accounts.pum?.total_sales)} ({accounts.koperasi.sub_accounts.pum?.total_orders || 0} pesanan)
              </p>
              <p className="text-xs text-slate-500 mt-1.5">
                Pecahan = pecahan jumlah jualan dan bil. pesanan: <strong>Koperasi</strong> (jualan kit/barangan koperasi biasa) dan <strong>PUM</strong> (Barangan Rasmi / merchandise). RM 0.00 (0 pesanan) = tiada jualan/pesanan dalam tempoh dipilih.
              </p>
            </div>
          )}
          {accounts.koperasi?.by_status && Object.keys(accounts.koperasi.by_status).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(accounts.koperasi.by_status).map(([status, data]) => (
                <StatusBadge key={status} status={status} count={data.count} />
              ))}
            </div>
          )}
        </AccountCard>
      </div>

      {/* Monthly Trend Chart */}
      {trend?.trend && trend.trend.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="text-emerald-600" size={20} />
              <h3 className="font-semibold text-slate-900">Trend Pendapatan Bulanan</h3>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-emerald-500" />
                <span>Muafakat</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-amber-500" />
                <span>Koperasi (termasuk PUM)</span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-6 gap-4">
            {trend.trend.map((month, idx) => {
              const koperasiPum = (month.koperasi || 0) + (month.pum || 0);
              return (
                <div key={idx} className="text-center">
                  <div className="flex flex-col gap-1 h-32">
                    <div className="flex-1 flex flex-col justify-end gap-0.5">
                      {month.muafakat > 0 && (
                        <div 
                          className="bg-emerald-500 rounded-t"
                          style={{ 
                            height: `${Math.max((month.muafakat / Math.max(...trend.trend.map(t => t.total), 1)) * 100, 2)}%`,
                            minHeight: '4px'
                          }}
                          title={`Muafakat: RM ${month.muafakat}`}
                        />
                      )}
                      {koperasiPum > 0 && (
                        <div 
                          className="bg-amber-500 rounded-b"
                          style={{ 
                            height: `${Math.max((koperasiPum / Math.max(...trend.trend.map(t => t.total), 1)) * 100, 2)}%`,
                            minHeight: '4px'
                          }}
                          title={`Koperasi (termasuk PUM): RM ${koperasiPum.toLocaleString()}`}
                        />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">{month.month_name}</p>
                  <p className="text-xs font-medium text-slate-700">RM {month.total.toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Info */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-6 border border-emerald-100/80">
        <h3 className="font-semibold mb-4 flex items-center gap-2 text-slate-700">
          <Clock size={20} className="text-emerald-600" />
          Maklumat Terkini
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white/90 rounded-xl p-4 border border-emerald-100/60 shadow-sm">
            <p className="text-slate-500 text-sm">Tempoh Laporan</p>
            <p className="font-medium mt-1 text-slate-800">{summary?.period?.description || 'Keseluruhan'}</p>
          </div>
          <div className="bg-white/90 rounded-xl p-4 border border-emerald-100/60 shadow-sm">
            <p className="text-slate-500 text-sm">Dijana Pada</p>
            <p className="font-medium mt-1 text-slate-800">
              {summary?.generated_at ? new Date(summary.generated_at).toLocaleString('ms-MY') : '-'}
            </p>
          </div>
          <div className="bg-white/90 rounded-xl p-4 border border-emerald-100/60 shadow-sm">
            <p className="text-slate-500 text-sm">Status Sistem</p>
            <p className="font-medium mt-1 flex items-center gap-2 text-slate-800">
              <CheckCircle size={16} className="text-emerald-500" />
              Aktif & Berjalan
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountingDashboardPage;
