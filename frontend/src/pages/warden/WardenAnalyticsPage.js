/**
 * Laporan Analitik AI untuk Warden
 * Laporan berdasarkan asrama (e-hostel) dan Bilik Sakit; laporan keberadaan pelajar; Chat AI asrama & sickbay.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart3, Brain, Home, Stethoscope, Users, DoorOpen, UtensilsCrossed,
  MessageCircle, Send, Loader2, RefreshCw, ClipboardList
} from 'lucide-react';
import api from '../../services/api';
import { Card, Button, Spinner } from '../../components/common';
import { toast } from 'sonner';

export const WardenAnalyticsPage = () => {
  const [loading, setLoading] = useState(true);
  const [hostelStats, setHostelStats] = useState(null);
  const [sickbayStats, setSickbayStats] = useState(null);
  const [pulangStats, setPulangStats] = useState(null);
  const [presenceReport, setPresenceReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [activeTab, setActiveTab] = useState('laporan');
  const [chatModule, setChatModule] = useState('hostel');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [hRes, sRes, pRes] = await Promise.all([
        api.get('/api/hostel/stats').catch(() => ({ data: null })),
        api.get('/api/sickbay/stats').catch(() => ({ data: null })),
        api.get('/api/hostel/pulang-bermalam/stats').catch(() => ({ data: null }))
      ]);
      setHostelStats(hRes.data);
      setSickbayStats(sRes.data);
      setPulangStats(pRes.data);
    } catch (e) {
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const loadPresenceReport = async () => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportDateFrom) params.set('date_from', reportDateFrom);
      if (reportDateTo) params.set('date_to', reportDateTo);
      const res = await api.get(`/api/hostel/presence-report?${params.toString()}`);
      setPresenceReport(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal muat laporan');
      setPresenceReport(null);
    } finally {
      setReportLoading(false);
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
        module: chatModule
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="text-primary-600" size={28} />
            Laporan Analitik – Warden
          </h1>
          <p className="text-slate-600 mt-1">Laporan asrama, Bilik Sakit dan keberadaan pelajar</p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCw size={18} /> Muat Semula
        </Button>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('laporan')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${activeTab === 'laporan' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500'}`}
        >
          <ClipboardList size={18} /> Laporan
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${activeTab === 'chat' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500'}`}
        >
          <Brain size={18} /> Chat AI
        </button>
      </div>

      {activeTab === 'laporan' && (
        <div className="space-y-8">
          {/* Laporan Asrama */}
          <section>
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
              <Home className="text-teal-600" size={22} /> Laporan Asrama (e-Hostel)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <Card className="p-4">
                <p className="text-xs text-slate-500 mb-1">Blok</p>
                <p className="text-xl font-bold text-slate-800">{hostelStats?.block || '–'}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-slate-500 mb-1">Jumlah Pelajar</p>
                <p className="text-xl font-bold text-slate-800">{hostelStats?.total_students ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-slate-500 mb-1">Dalam Asrama</p>
                <p className="text-xl font-bold text-emerald-600">{hostelStats?.in_hostel ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-slate-500 mb-1">Sedang Keluar</p>
                <p className="text-xl font-bold text-amber-600">{hostelStats?.out_count ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-slate-500 mb-1">Keluar Hari Ini</p>
                <p className="text-xl font-bold text-slate-800">{hostelStats?.today_checkouts ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-slate-500 mb-1">Masuk Hari Ini</p>
                <p className="text-xl font-bold text-slate-800">{hostelStats?.today_checkins ?? 0}</p>
              </Card>
            </div>
            {pulangStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <Card className="p-4 bg-pastel-lavender border-pastel-lilac">
                  <p className="text-xs text-slate-600 mb-1">Pulang Bermalam – Menunggu</p>
                  <p className="text-xl font-bold text-violet-700">{pulangStats.pending ?? 0}</p>
                </Card>
                <Card className="p-4 bg-emerald-50 border-emerald-100">
                  <p className="text-xs text-slate-600 mb-1">Pulang Bermalam – Diluluskan</p>
                  <p className="text-xl font-bold text-emerald-700">{pulangStats.approved ?? 0}</p>
                </Card>
                <Card className="p-4 bg-slate-50">
                  <p className="text-xs text-slate-600 mb-1">Pulang Bermalam – Ditolak</p>
                  <p className="text-xl font-bold text-slate-700">{pulangStats.rejected ?? 0}</p>
                </Card>
              </div>
            )}
          </section>

          {/* Laporan Bilik Sakit */}
          <section>
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
              <Stethoscope className="text-red-600" size={22} /> Laporan Bilik Sakit
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <p className="text-xs text-slate-500 mb-1">Dalam Bilik Sakit</p>
                <p className="text-xl font-bold text-red-600">{sickbayStats?.in_sickbay ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-slate-500 mb-1">Lawatan Hari Ini</p>
                <p className="text-xl font-bold text-slate-800">{sickbayStats?.today_visits ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-slate-500 mb-1">Keluar Hari Ini</p>
                <p className="text-xl font-bold text-emerald-600">{sickbayStats?.today_discharges ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-slate-500 mb-1">Simptom Kerap</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(sickbayStats?.common_symptoms || []).slice(0, 3).map((s, i) => (
                    <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs">{s.symptom}</span>
                  ))}
                  {(!sickbayStats?.common_symptoms || sickbayStats.common_symptoms.length === 0) && (
                    <span className="text-slate-400 text-xs">–</span>
                  )}
                </div>
              </Card>
            </div>
          </section>

          {/* Laporan Keberadaan Pelajar */}
          <section>
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
              <Users className="text-sky-600" size={22} /> Laporan Keberadaan Pelajar
            </h2>
            <p className="text-sm text-slate-500 mb-4">Penting untuk dewan makan: senarai pelajar yang pulang bermalam dan yang berada di maktab. Kosongkan tarikh untuk guna hujung minggu ini.</p>
            <Card className="p-4 mb-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Tarikh mula</label>
                  <input type="date" value={reportDateFrom} onChange={(e) => setReportDateFrom(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Tarikh akhir</label>
                  <input type="date" value={reportDateTo} onChange={(e) => setReportDateTo(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg" />
                </div>
                <Button onClick={loadPresenceReport} disabled={reportLoading}>
                  {reportLoading ? <Spinner size="sm" /> : <ClipboardList size={16} />} Muat Laporan
                </Button>
              </div>
            </Card>
            {presenceReport && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card className="p-4 bg-slate-50">
                    <p className="text-sm text-slate-500">Tempoh</p>
                    <p className="font-semibold text-slate-800">{presenceReport.date_from} – {presenceReport.date_to}</p>
                    <p className="text-xs text-slate-500 mt-1">Blok: {presenceReport.block || '–'}</p>
                  </Card>
                  <Card className="p-4 bg-pastel-lavender">
                    <p className="text-sm text-slate-600">Pulang bermalam</p>
                    <p className="text-2xl font-bold text-violet-700">{presenceReport.summary?.total_pulang ?? 0}</p>
                  </Card>
                  <Card className="p-4 bg-emerald-50">
                    <p className="text-sm text-slate-600 flex items-center gap-1"><UtensilsCrossed size={14} /> Berada di maktab (Dewan Makan)</p>
                    <p className="text-2xl font-bold text-emerald-700">{presenceReport.summary?.total_di_maktab ?? 0}</p>
                  </Card>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <h4 className="font-semibold text-slate-800 mb-3"><DoorOpen size={18} className="inline mr-2" /> Pelajar pulang bermalam ({presenceReport.pelajar_pulang_bermalam?.length ?? 0})</h4>
                    <div className="max-h-60 overflow-y-auto">
                      {(!presenceReport.pelajar_pulang_bermalam || presenceReport.pelajar_pulang_bermalam.length === 0) ? (
                        <p className="text-slate-500 text-sm py-4">Tiada rekod</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-slate-50"><tr><th className="text-left py-2 px-2">Bil</th><th className="text-left py-2">Nama</th><th className="text-left py-2">Matrik</th><th className="text-left py-2">Bilik/Katil</th></tr></thead>
                          <tbody>
                            {presenceReport.pelajar_pulang_bermalam.map((p, i) => (
                              <tr key={p.student_id} className="border-t border-slate-100">
                                <td className="py-2 px-2 text-slate-500">{i + 1}</td>
                                <td className="py-2 px-2 font-medium">{p.student_name}</td>
                                <td className="py-2 px-2">{p.student_matric}</td>
                                <td className="py-2 px-2">{p.student_room || '–'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </Card>
                  <Card>
                    <h4 className="font-semibold text-slate-800 mb-3"><UtensilsCrossed size={18} className="inline mr-2" /> Senarai dewan makan – tidak pulang ({presenceReport.pelajar_berada_di_maktab?.length ?? 0})</h4>
                    <div className="max-h-60 overflow-y-auto">
                      {(!presenceReport.pelajar_berada_di_maktab || presenceReport.pelajar_berada_di_maktab.length === 0) ? (
                        <p className="text-slate-500 text-sm py-4">Tiada rekod</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-slate-50"><tr><th className="text-left py-2 px-2">Bil</th><th className="text-left py-2">Nama</th><th className="text-left py-2">Matrik</th><th className="text-left py-2">Ting.</th><th className="text-left py-2">Bilik/Katil</th></tr></thead>
                          <tbody>
                            {presenceReport.pelajar_berada_di_maktab.map((s, i) => (
                              <tr key={s.student_id} className="border-t border-slate-100">
                                <td className="py-2 px-2 text-slate-500">{i + 1}</td>
                                <td className="py-2 px-2 font-medium">{s.name}</td>
                                <td className="py-2 px-2">{s.matric}</td>
                                <td className="py-2 px-2">{s.form}</td>
                                <td className="py-2 px-2">{s.room || '–'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'chat' && (
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-teal-500 to-violet-500 px-6 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl"><Brain size={24} /></div>
              <div>
                <h3 className="font-bold">Chat Analitik AI – Asrama & Bilik Sakit</h3>
                <p className="text-white/80 text-sm">Tanya tentang laporan asrama atau bilik sakit sahaja</p>
              </div>
            </div>
          </div>
          <div className="p-4 border-b flex flex-wrap gap-2">
            <button
              onClick={() => setChatModule('hostel')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${chatModule === 'hostel' ? 'bg-pastel-mint text-teal-700' : 'bg-slate-100 text-slate-600'}`}
            >
              <Home size={16} /> Asrama
            </button>
            <button
              onClick={() => setChatModule('sickbay')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${chatModule === 'sickbay' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}
            >
              <Stethoscope size={16} /> Bilik Sakit
            </button>
          </div>
          <div className="h-[320px] overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <MessageCircle size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="font-medium">Tanya tentang asrama atau bilik sakit</p>
                <p className="text-sm mt-1">Contoh: &quot;Ringkaskan laporan asrama&quot;, &quot;Berapa pelajar dalam bilik sakit?&quot;</p>
              </div>
            )}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 p-4 rounded-2xl"><Loader2 className="animate-spin text-teal-600" size={20} /></div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                placeholder="Tanya soalan tentang asrama atau bilik sakit..."
                className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                disabled={chatLoading}
              />
              <Button onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()} className="px-6">
                <Send size={20} />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {['Ringkaskan laporan asrama', 'Berapa bilik yang ada katil kosong?', 'Berapa pelajar dalam bilik sakit?', 'Trend lawatan bilik sakit', 'Permohonan pulang bermalam pending'].map((s, i) => (
                <button key={i} onClick={() => setChatInput(s)} className="min-h-[44px] px-3 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full">{s}</button>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default WardenAnalyticsPage;
