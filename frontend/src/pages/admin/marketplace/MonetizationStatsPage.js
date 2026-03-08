import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, DollarSign, Image, Zap, Crown, TrendingUp,
  Calendar, RefreshCw, BarChart3, PieChart
} from 'lucide-react';
import { motion } from 'framer-motion';
import { API_URL } from '../../../services/api';

export default function MonetizationStatsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [runningScheduler, setRunningScheduler] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/marketplace/monetization/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const runScheduler = async () => {
    if (!window.confirm('Jalankan scheduler untuk tamatkan ciri-ciri yang telah luput?')) return;

    setRunningScheduler(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/marketplace/scheduler/expire-features`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Scheduler berjaya dijalankan!\n\nTamat tempoh:\n- Iklan: ${data.expired.ads}\n- Boost: ${data.expired.boosts}\n- Langganan: ${data.expired.subscriptions}`);
        fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || 'Ralat semasa menjalankan scheduler');
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Ralat rangkaian');
    } finally {
      setRunningScheduler(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8 min-w-0 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/marketplace')}
              className="p-2 hover:bg-white/80 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Statistik Monetisasi</h1>
              <p className="text-slate-500">Ringkasan pendapatan dari ciri berbayar</p>
            </div>
          </div>
          <button
            onClick={runScheduler}
            disabled={runningScheduler}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-900 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${runningScheduler ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">Jalankan Scheduler</span>
          </button>
        </div>

        {/* Total Revenue */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-6 text-white"
        >
          <div className="flex items-center gap-4">
            <div className="p-4 bg-white/20 rounded-2xl">
              <DollarSign className="w-10 h-10" />
            </div>
            <div>
              <p className="text-white/80 text-sm">Jumlah Pendapatan Monetisasi</p>
              <p className="text-4xl font-bold">RM {(stats?.total_monetization_revenue || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </motion.div>

        {/* Revenue Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Ads Revenue */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-pastel-lavender rounded-xl">
                <Image className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Iklan Banner</h3>
            </div>
            <p className="text-3xl font-bold text-slate-800">
              RM {(stats?.ads?.revenue || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-4 mt-3 text-sm">
              <div>
                <span className="text-slate-500">Aktif: </span>
                <span className="font-medium text-emerald-600">{stats?.ads?.active || 0}</span>
              </div>
              <div>
                <span className="text-slate-500">Menunggu: </span>
                <span className="font-medium text-amber-600">{stats?.ads?.pending || 0}</span>
              </div>
            </div>
          </motion.div>

          {/* Boosts Revenue */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-pastel-mint rounded-xl">
                <Zap className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Boost Produk</h3>
            </div>
            <p className="text-3xl font-bold text-slate-800">
              RM {(stats?.boosts?.revenue || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-3 text-sm">
              <span className="text-slate-500">Boost Aktif: </span>
              <span className="font-medium text-teal-600">{stats?.boosts?.active || 0}</span>
            </div>
          </motion.div>

          {/* Subscriptions Revenue */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-xl">
                <Crown className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Langganan Premium</h3>
            </div>
            <p className="text-3xl font-bold text-slate-800">
              RM {(stats?.subscriptions?.revenue || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-3 text-sm">
              <span className="text-slate-500">Vendor Premium: </span>
              <span className="font-medium text-amber-600">{stats?.subscriptions?.premium_vendors || 0}</span>
            </div>
          </motion.div>

          {/* Flash Sales Revenue */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl">
                <TrendingUp className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Flash Sale</h3>
            </div>
            <p className="text-3xl font-bold text-slate-800">
              RM {(stats?.flash_sales?.revenue || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-3 text-sm text-slate-500">
              Slot jualan kilat
            </div>
          </motion.div>
        </div>

        {/* Revenue Distribution Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-2xl p-6 shadow-sm"
          >
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-slate-400" />
              Pecahan Pendapatan
            </h3>
            <div className="space-y-4">
              {[
                { label: 'Iklan Banner', amount: stats?.ads?.revenue || 0, color: 'bg-teal-500' },
                { label: 'Boost Produk', amount: stats?.boosts?.revenue || 0, color: 'bg-violet-500' },
                { label: 'Langganan Premium', amount: stats?.subscriptions?.revenue || 0, color: 'bg-amber-500' },
                { label: 'Flash Sale', amount: stats?.flash_sales?.revenue || 0, color: 'bg-red-500' }
              ].map((item, index) => {
                const total = stats?.total_monetization_revenue || 1;
                const percentage = ((item.amount / total) * 100).toFixed(1);
                return (
                  <div key={index}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-600">{item.label}</span>
                      <span className="font-medium text-slate-800">
                        RM {item.amount.toLocaleString('ms-MY', { minimumFractionDigits: 2 })} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.8, delay: 0.6 + index * 0.1 }}
                        className={`h-full ${item.color} rounded-full`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white rounded-2xl p-6 shadow-sm"
          >
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-slate-400" />
              Status Ciri Berbayar
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Image className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">Iklan Aktif</p>
                    <p className="text-xs text-slate-500">Sedang berjalan</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-emerald-600">{stats?.ads?.active || 0}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-pastel-mint rounded-lg">
                    <Zap className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">Boost Aktif</p>
                    <p className="text-xs text-slate-500">Produk di-boost</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-teal-600">{stats?.boosts?.active || 0}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <Crown className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">Vendor Premium</p>
                    <p className="text-xs text-slate-500">Langganan aktif</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-amber-600">{stats?.subscriptions?.premium_vendors || 0}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <h4 className="font-semibold text-blue-800 mb-2">Tentang Scheduler</h4>
          <p className="text-sm text-blue-700">
            Scheduler akan menamatkan iklan, boost produk, dan langganan premium yang telah tamat tempoh secara automatik.
            Anda boleh menjalankan scheduler secara manual dengan menekan butang "Jalankan Scheduler" di atas,
            atau ia boleh dikonfigurasikan untuk berjalan secara automatik menggunakan cron job.
          </p>
        </div>
      </div>
    </div>
  );
}
