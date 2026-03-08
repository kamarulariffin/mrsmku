/**
 * Laporan Analitik Pengangkutan — Halaman khas untuk Admin Bas sahaja.
 * Hanya memaparkan data analitik modul bas/pengangkutan (trip, tempahan, hasil).
 */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, Bus, Building, MapPinned, Calendar, Ticket, MessageCircle,
  Send, Loader2, Sparkles, TrendingUp, DollarSign
} from 'lucide-react';
import api from '../../services/api';
import { Card, Button, Spinner } from '../../components/common';

const formatNumber = (num) => {
  if (num == null) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return Number(num).toLocaleString();
};

const formatCurrency = (num) => {
  if (num == null) return 'RM 0';
  return `RM ${Number(num).toLocaleString('ms-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function BusAdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [busData, setBusData] = useState(null);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [analyticsRes, statsRes] = await Promise.all([
        api.get('/api/analytics/module/bus'),
        api.get('/api/bus/stats').catch(() => ({ data: {} }))
      ]);
      setBusData(analyticsRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to fetch transport analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);
    try {
      const res = await api.post('/api/analytics/chat', {
        question: userMessage,
        module: 'bus'
      });
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Maaf, berlaku ralat. Sila cuba lagi.'
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const getAIInsights = async () => {
    setChatLoading(true);
    try {
      const res = await api.post('/api/analytics/ai-insights', {
        question: 'Berikan analisis komprehensif tentang data pengangkutan dan tiket bas',
        module: 'bus'
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

  const suggestions = [
    'Ringkaskan prestasi pengangkutan bas',
    'Berapa jumlah tempahan disahkan bulan ini?',
    'Trend trip dan hasil tiket bas',
    'Cadangkan penambahbaikan operasi bas'
  ];

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
            <Bus className="text-cyan-600" size={28} />
            Laporan Analitik Pengangkutan
          </h1>
          <p className="text-slate-600 mt-1">Analisis data modul bas dan tiket sahaja — Pentadbir Bas</p>
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

      <AnimatePresence mode="wait">
        {activeTab === 'dashboard' ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Ringkasan pengangkutan */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-100 rounded-xl"><Building className="text-cyan-600" size={20} /></div>
                  <div>
                    <p className="text-xs text-slate-500">Syarikat Bas</p>
                    <p className="text-xl font-bold text-slate-800">{stats?.total_companies ?? 0}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-xl"><Bus className="text-blue-600" size={20} /></div>
                  <div>
                    <p className="text-xs text-slate-500">Bas</p>
                    <p className="text-xl font-bold text-slate-800">{stats?.total_buses ?? 0}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-xl"><MapPinned className="text-emerald-600" size={20} /></div>
                  <div>
                    <p className="text-xs text-slate-500">Routes</p>
                    <p className="text-xl font-bold text-slate-800">{stats?.total_routes ?? 0}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-xl"><Calendar className="text-amber-600" size={20} /></div>
                  <div>
                    <p className="text-xs text-slate-500">Trip</p>
                    <p className="text-xl font-bold text-slate-800">{busData?.total_trips ?? stats?.active_trips ?? 0}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-violet-100 rounded-xl"><Ticket className="text-violet-600" size={20} /></div>
                  <div>
                    <p className="text-xs text-slate-500">Tempahan</p>
                    <p className="text-xl font-bold text-slate-800">{busData?.total_bookings ?? stats?.total_bookings ?? 0}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-100 rounded-xl"><DollarSign className="text-teal-600" size={20} /></div>
                  <div>
                    <p className="text-xs text-slate-500">Jumlah Hasil</p>
                    <p className="text-lg font-bold text-teal-700">{formatCurrency(busData?.total_revenue)}</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Status tempahan */}
            {busData?.bookings_by_status && Object.keys(busData.bookings_by_status).length > 0 && (
              <Card className="p-5">
                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <TrendingUp size={20} className="text-cyan-600" />
                  Tempahan mengikut status
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Object.entries(busData.bookings_by_status).map(([status, count]) => (
                    <div key={status} className="bg-slate-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-slate-800">{formatNumber(count)}</p>
                      <p className="text-xs text-slate-500 capitalize">{status}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Jana Insight AI */}
            <div className="flex justify-center">
              <Button
                onClick={getAIInsights}
                disabled={chatLoading}
                className="bg-gradient-to-r from-cyan-500 to-teal-600 text-white px-8 py-3 rounded-2xl shadow-lg hover:shadow-xl transition-all"
              >
                {chatLoading ? (
                  <Loader2 className="animate-spin mr-2" size={20} />
                ) : (
                  <Sparkles className="mr-2" size={20} />
                )}
                Jana Insight AI Pengangkutan
              </Button>
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
            <div className="bg-gradient-to-r from-cyan-500 to-teal-600 px-6 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl"><MessageCircle size={24} /></div>
                <div>
                  <h3 className="font-bold">Chat Analitik Pengangkutan</h3>
                  <p className="text-white/80 text-sm">Tanya tentang trip, tempahan dan hasil bas sahaja</p>
                </div>
              </div>
            </div>
            <div className="h-[400px] overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Bus size={48} className="mx-auto mb-4 text-slate-300" />
                  <p className="font-medium">Soalan tentang pengangkutan bas</p>
                  <p className="text-sm mt-1">Contoh: &quot;Berapa jumlah tempahan disahkan?&quot;</p>
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
                        ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {msg.isInsight && (
                      <div className="flex items-center gap-2 mb-2 text-cyan-600">
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
                    <Loader2 className="animate-spin text-cyan-600" size={20} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-slate-200 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Tanya soalan tentang pengangkutan bas..."
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  disabled={chatLoading}
                />
                <Button
                  onClick={sendChatMessage}
                  disabled={chatLoading || !chatInput.trim()}
                  className="bg-gradient-to-r from-cyan-500 to-teal-600 text-white px-6 rounded-xl"
                >
                  <Send size={20} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setChatInput(s)}
                    className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
