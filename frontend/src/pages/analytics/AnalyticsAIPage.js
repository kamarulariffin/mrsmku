import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, TrendingUp, Brain, MessageCircle, Send, Loader2,
  Wallet, ShoppingCart, Bus, Heart, Gift, Home, Stethoscope,
  Users, Target, AlertCircle, Sparkles, ChevronDown, RefreshCw
} from 'lucide-react';
import api from '../../services/api';
import { Card, Button, Spinner } from '../../components/common';

const AnalyticsAIPage = () => {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [selectedModule, setSelectedModule] = useState('all');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, chat
  const chatEndRef = useRef(null);

  const modules = [
    { id: 'all', name: 'Semua Modul', icon: BarChart3, color: 'from-teal-500 to-violet-500' },
    { id: 'yuran', name: 'Yuran', icon: Wallet, color: 'from-blue-500 to-teal-500' },
    { id: 'koperasi', name: 'Koperasi', icon: ShoppingCart, color: 'from-emerald-500 to-teal-500' },
    { id: 'bus', name: 'Bas', icon: Bus, color: 'from-cyan-500 to-blue-500' },
    { id: 'infaq', name: 'Infaq', icon: Gift, color: 'from-amber-500 to-orange-500' },
    { id: 'sedekah', name: 'Sedekah', icon: Heart, color: 'from-pink-500 to-rose-500' },
    { id: 'hostel', name: 'Hostel', icon: Home, color: 'from-violet-500 to-fuchsia-500' },
    { id: 'sickbay', name: 'Sick Bay', icon: Stethoscope, color: 'from-red-500 to-pink-500' },
  ];

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/analytics/dashboard');
      setDashboardData(res.data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);

    try {
      const res = await api.post('/api/analytics/chat', {
        question: userMessage,
        module: selectedModule
      });
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Maaf, berlaku ralat semasa memproses soalan anda. Sila cuba lagi.' 
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const getAIInsights = async () => {
    setChatLoading(true);
    try {
      const res = await api.post('/api/analytics/ai-insights', {
        question: 'Berikan analisis komprehensif tentang semua data',
        module: selectedModule
      });
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: res.data.response,
        isInsight: true
      }]);
      setActiveTab('chat');
    } catch (err) {
      console.error('Failed to get AI insights:', err);
    } finally {
      setChatLoading(false);
    }
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num?.toLocaleString() || '0';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Brain className="text-violet-600" size={28} />
            Analitik AI
          </h1>
          <p className="text-slate-600 mt-1">Analisis data pintar dengan kecerdasan buatan</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'dashboard' ? 'primary' : 'ghost'}
            onClick={() => setActiveTab('dashboard')}
          >
            <BarChart3 size={18} className="mr-1" /> Dashboard
          </Button>
          <Button
            variant={activeTab === 'chat' ? 'primary' : 'ghost'}
            onClick={() => setActiveTab('chat')}
          >
            <MessageCircle size={18} className="mr-1" /> Chat AI
          </Button>
        </div>
      </div>

      {/* Module Filter */}
      <div className="flex flex-wrap gap-2">
        {modules.map((module) => (
          <button
            key={module.id}
            onClick={() => setSelectedModule(module.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedModule === module.id
                ? `bg-gradient-to-r ${module.color} text-white shadow-lg`
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <module.icon size={16} />
            {module.name}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'dashboard' ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Summary Cards */}
            {dashboardData?.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-xl"
                >
                  <Wallet className="mb-2" size={24} />
                  <p className="text-emerald-100 text-sm">Jumlah Kutipan</p>
                  <p className="text-2xl font-bold">RM {formatNumber(dashboardData.summary.total_revenue)}</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="bg-gradient-to-br from-teal-500 to-violet-500 rounded-2xl p-5 text-white shadow-xl"
                >
                  <TrendingUp className="mb-2" size={24} />
                  <p className="text-blue-100 text-sm">Kadar Kutipan Yuran</p>
                  <p className="text-2xl font-bold">{dashboardData.summary.fees_collection_rate}%</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl p-5 text-white shadow-xl"
                >
                  <Heart className="mb-2" size={24} />
                  <p className="text-pink-100 text-sm">Kempen Aktif</p>
                  <p className="text-2xl font-bold">{dashboardData.summary.active_campaigns}</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white shadow-xl"
                >
                  <AlertCircle className="mb-2" size={24} />
                  <p className="text-amber-100 text-sm">Permohonan Keluar Pending</p>
                  <p className="text-2xl font-bold">{dashboardData.summary.pending_leave_requests}</p>
                </motion.div>
              </div>
            )}

            {/* AI Insights Button */}
            <div className="flex justify-center">
              <Button
                onClick={getAIInsights}
                disabled={chatLoading}
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white px-8 py-3 rounded-2xl shadow-xl hover:shadow-2xl transition-all"
              >
                {chatLoading ? (
                  <Loader2 className="animate-spin mr-2" size={20} />
                ) : (
                  <Sparkles className="mr-2" size={20} />
                )}
                Jana Insight AI
              </Button>
            </div>

            {/* Module Details */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Yuran */}
              {(selectedModule === 'all' || selectedModule === 'yuran') && dashboardData?.modules?.yuran && (
                <Card className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-100 rounded-xl">
                      <Wallet className="text-blue-600" size={20} />
                    </div>
                    <h3 className="font-bold text-slate-900">Yuran</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Jumlah Yuran</span>
                      <span className="font-semibold">{dashboardData.modules.yuran.total_fees}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Telah Dibayar</span>
                      <span className="font-semibold text-emerald-600">{dashboardData.modules.yuran.paid_fees}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Tertunggak</span>
                      <span className="font-semibold text-red-600">{dashboardData.modules.yuran.pending_fees}</span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Kadar Kutipan</span>
                        <span className="font-bold text-blue-600">{dashboardData.modules.yuran.collection_rate}%</span>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Koperasi */}
              {(selectedModule === 'all' || selectedModule === 'koperasi') && dashboardData?.modules?.koperasi && (
                <Card className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-100 rounded-xl">
                      <ShoppingCart className="text-emerald-600" size={20} />
                    </div>
                    <h3 className="font-bold text-slate-900">Koperasi</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Produk</span>
                      <span className="font-semibold">{dashboardData.modules.koperasi.total_products}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Kit</span>
                      <span className="font-semibold">{dashboardData.modules.koperasi.total_kits}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Pesanan</span>
                      <span className="font-semibold">{dashboardData.modules.koperasi.total_orders}</span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Jumlah Jualan</span>
                        <span className="font-bold text-emerald-600">RM {formatNumber(dashboardData.modules.koperasi.total_revenue)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Bus */}
              {(selectedModule === 'all' || selectedModule === 'bus') && dashboardData?.modules?.bus && (
                <Card className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-cyan-100 rounded-xl">
                      <Bus className="text-cyan-600" size={20} />
                    </div>
                    <h3 className="font-bold text-slate-900">Tiket Bas</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Trip</span>
                      <span className="font-semibold">{dashboardData.modules.bus.total_trips}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Tempahan</span>
                      <span className="font-semibold">{dashboardData.modules.bus.total_bookings}</span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Jumlah Hasil</span>
                        <span className="font-bold text-cyan-600">RM {formatNumber(dashboardData.modules.bus.total_revenue)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Infaq */}
              {(selectedModule === 'all' || selectedModule === 'infaq') && dashboardData?.modules?.infaq && (
                <Card className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-amber-100 rounded-xl">
                      <Gift className="text-amber-600" size={20} />
                    </div>
                    <h3 className="font-bold text-slate-900">Infaq Slot</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Kempen</span>
                      <span className="font-semibold">{dashboardData.modules.infaq.total_campaigns}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Kempen Aktif</span>
                      <span className="font-semibold text-emerald-600">{dashboardData.modules.infaq.active_campaigns}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Slot Terjual</span>
                      <span className="font-semibold">{dashboardData.modules.infaq.total_slots_sold}</span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Jumlah Kutipan</span>
                        <span className="font-bold text-amber-600">RM {formatNumber(dashboardData.modules.infaq.total_collected)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Sedekah */}
              {(selectedModule === 'all' || selectedModule === 'sedekah') && dashboardData?.modules?.sedekah && (
                <Card className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-pink-100 rounded-xl">
                      <Heart className="text-pink-600" size={20} />
                    </div>
                    <h3 className="font-bold text-slate-900">Sedekah</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Kempen</span>
                      <span className="font-semibold">{dashboardData.modules.sedekah.total_campaigns}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Penderma Unik</span>
                      <span className="font-semibold">{dashboardData.modules.sedekah.unique_donors}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Sumbangan</span>
                      <span className="font-semibold">{dashboardData.modules.sedekah.total_donations}</span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Jumlah Kutipan</span>
                        <span className="font-bold text-pink-600">RM {formatNumber(dashboardData.modules.sedekah.total_collected)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Hostel */}
              {(selectedModule === 'all' || selectedModule === 'hostel') && dashboardData?.modules?.hostel && (
                <Card className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-violet-100 rounded-xl">
                      <Home className="text-violet-600" size={20} />
                    </div>
                    <h3 className="font-bold text-slate-900">Hostel</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Pelajar Asrama</span>
                      <span className="font-semibold">{dashboardData.modules.hostel.total_hostel_students}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Permohonan Keluar</span>
                      <span className="font-semibold">{dashboardData.modules.hostel.total_leave_requests}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Pending</span>
                      <span className="font-semibold text-amber-600">{dashboardData.modules.hostel.pending_requests}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Diluluskan</span>
                      <span className="font-semibold text-emerald-600">{dashboardData.modules.hostel.approved_requests}</span>
                    </div>
                  </div>
                </Card>
              )}

              {/* Sickbay */}
              {(selectedModule === 'all' || selectedModule === 'sickbay') && dashboardData?.modules?.sickbay && (
                <Card className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-red-100 rounded-xl">
                      <Stethoscope className="text-red-600" size={20} />
                    </div>
                    <h3 className="font-bold text-slate-900">Sick Bay</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Jumlah Rekod</span>
                      <span className="font-semibold">{dashboardData.modules.sickbay.total_records}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Minggu Ini</span>
                      <span className="font-semibold text-red-600">{dashboardData.modules.sickbay.recent_week_records}</span>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
          >
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Brain size={24} />
                </div>
                <div>
                  <h3 className="font-bold">Chat Analitik AI</h3>
                  <p className="text-white/80 text-sm">Tanya apa sahaja tentang data analitik</p>
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="h-[400px] overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Brain size={48} className="mx-auto mb-4 text-slate-300" />
                  <p className="font-medium">Mulakan perbualan dengan AI</p>
                  <p className="text-sm mt-1">Contoh: "Apakah trend kutipan yuran bulan ini?"</p>
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] p-4 rounded-2xl ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-teal-500 to-violet-500 text-white'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {msg.isInsight && (
                      <div className="flex items-center gap-2 mb-2 text-violet-600">
                        <Sparkles size={16} />
                        <span className="text-sm font-semibold">AI Insight</span>
                      </div>
                    )}
                    <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                  </div>
                </motion.div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 p-4 rounded-2xl">
                    <Loader2 className="animate-spin text-violet-600" size={20} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="border-t border-slate-200 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Tanya soalan tentang analitik..."
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  disabled={chatLoading}
                />
                <Button
                  onClick={sendChatMessage}
                  disabled={chatLoading || !chatInput.trim()}
                  className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white px-6 rounded-xl"
                >
                  <Send size={20} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {[
                  'Ringkaskan prestasi keseluruhan',
                  'Apakah modul paling aktif?',
                  'Cadangkan penambahbaikan',
                  'Bandingkan kutipan yuran vs infaq'
                ].map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => setChatInput(suggestion)}
                    className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AnalyticsAIPage;
