/**
 * Analisis dan Statistik Kewangan (AI)
 * Page berasaskan AI: cadangan kelas lambat/cepat bayar, laporan ikut kelas, jantina, negeri. Pelbagai graf. Eksport PDF.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Brain, MessageCircle, Send, Loader2, RefreshCw, Download,
  TrendingDown, TrendingUp, Users, MapPin, BarChart3, Sparkles, LineChart as LineChartIcon,
  Image, FileDown, Copy, AlertTriangle, ThumbsUp
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar, FunnelChart, Funnel, LabelList
} from 'recharts';
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import api from '../../services/api';
import { Card, Button, Spinner } from '../../components/common';
import { HelpManualLink } from '../../components/common';

applyPlugin(jsPDF);

const formatRM = (n) => (n != null ? `RM ${Number(n).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}` : '-');

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
const CHART_COLORS_JAW = ['#3b82f6', '#ec4899', '#94a3b8'];

export default function FinancialAnalyticsAIPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [years, setYears] = useState([]);
  const [activeTab, setActiveTab] = useState('cadangan'); // cadangan, graf, laporan, chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const chartsContainerRef = useRef(null);
  const [exportingChartsPdf, setExportingChartsPdf] = useState(false);
  const [savingChartImage, setSavingChartImage] = useState(null);

  useEffect(() => {
    const y = new Date().getFullYear();
    setYears(Array.from({ length: 5 }, (_, i) => y - i));
  }, []);

  useEffect(() => {
    fetchData();
  }, [tahun]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/financial-dashboard/analytics-ai?tahun=${tahun}`);
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuatkan data analisis');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);
    try {
      const res = await api.post('/api/analytics/chat', {
        question: userMessage,
        module: 'yuran',
      });
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.data.response }]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Maaf, berlaku ralat. Sila cuba lagi.' },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const getAIInsights = async () => {
    setChatLoading(true);
    try {
      const res = await api.post('/api/analytics/ai-insights', {
        question: 'Berikan analisis dan cadangan kewangan yuran',
        module: 'yuran',
      });
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.data.response, isInsight: true },
      ]);
      setActiveTab('chat');
    } catch (err) {
      toast.error('Gagal menjana insight AI');
    } finally {
      setChatLoading(false);
    }
  };

  const exportToPdf = async () => {
    if (!data) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();
      let y = 18;

      doc.setFontSize(18);
      doc.text('Laporan Analisis Kewangan (AI)', pageW / 2, y, { align: 'center' });
      y += 8;
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text(`Tahun ${data.tahun} | Dijana: ${new Date().toLocaleString('ms-MY')}`, pageW / 2, y, { align: 'center' });
      y += 12;

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.text('Ringkasan', 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(`Jumlah pelajar: ${data.summary?.total_students ?? 0}`, 14, y);
      y += 5;
      doc.text(`Jumlah dijangka: ${formatRM(data.summary?.total_expected)}`, 14, y);
      y += 5;
      doc.text(`Jumlah dikutip: ${formatRM(data.summary?.total_collected)}`, 14, y);
      y += 5;
      doc.text(`Tunggakan: ${formatRM(data.summary?.total_outstanding)}`, 14, y);
      y += 5;
      doc.text(`Kadar kutipan: ${data.summary?.collection_rate ?? 0}%`, 14, y);
      y += 10;

      const cadangan = data.ai_cadangan;
      if (cadangan?.slowest_class || cadangan?.fastest_class) {
        doc.setFontSize(12);
        doc.text('Cadangan AI', 14, y);
        y += 6;
        doc.setFontSize(10);
        if (cadangan.slowest_class) {
          doc.text(
            `Kelas paling lambat bayar: Tingkatan ${cadangan.slowest_class.tingkatan} (kadar ${cadangan.slowest_class.collection_rate}%)`,
            14,
            y
          );
          y += 5;
        }
        if (cadangan.fastest_class) {
          doc.text(
            `Kelas paling cepat habis bayar: Tingkatan ${cadangan.fastest_class.tingkatan} (kadar ${cadangan.fastest_class.collection_rate}%)`,
            14,
            y
          );
          y += 8;
        }
      }

      if (data.outstanding_by_tingkatan?.length) {
        doc.setFontSize(12);
        doc.text('Mengikut Tingkatan (Kelas)', 14, y);
        y += 6;
        doc.autoTable({
          startY: y,
          head: [['Tingkatan', 'Pelajar', 'Dijangka', 'Dikutip', 'Tunggakan', 'Kadar %']],
          body: data.outstanding_by_tingkatan.map((t) => [
            `T${t.tingkatan}`,
            String(t.student_count ?? 0),
            formatRM(t.total_expected),
            formatRM(t.total_collected),
            formatRM(t.outstanding),
            `${t.collection_rate ?? 0}%`,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14 },
        });
        y = doc.lastAutoTable.finalY + 10;
      }

      if (data.by_jantina?.length && y < 250) {
        doc.setFontSize(12);
        doc.text('Mengikut Jantina', 14, y);
        y += 6;
        doc.autoTable({
          startY: y,
          head: [['Jantina', 'Pelajar', 'Dijangka', 'Dikutip', 'Kadar %']],
          body: data.by_jantina.map((j) => [
            j.jantina,
            String(j.student_count ?? 0),
            formatRM(j.total_expected),
            formatRM(j.total_collected),
            `${j.collection_rate ?? 0}%`,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [99, 102, 241] },
          margin: { left: 14 },
        });
        y = doc.lastAutoTable.finalY + 10;
      }

      if (data.by_negeri?.length && y < 250) {
        if (y > 230) doc.addPage();
        y = y > 230 ? 18 : y;
        doc.setFontSize(12);
        doc.text('Mengikut Negeri', 14, y);
        y += 6;
        doc.autoTable({
          startY: y,
          head: [['Negeri', 'Pelajar', 'Dijangka', 'Dikutip', 'Kadar %']],
          body: data.by_negeri.slice(0, 15).map((n) => [
            n.negeri,
            String(n.student_count ?? 0),
            formatRM(n.total_expected),
            formatRM(n.total_collected),
            `${n.collection_rate ?? 0}%`,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [16, 185, 129] },
          margin: { left: 14 },
        });
      }

      doc.save(`Analisis_Kewangan_AI_${data.tahun}.pdf`);
      toast.success('PDF berjaya dijana');
    } catch (e) {
      console.error(e);
      toast.error('Gagal menjana PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const saveChartAsImage = async (element, title) => {
    if (!element) return;
    setSavingChartImage(title);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `Graf_${(title || 'carta').replace(/\s+/g, '_')}_${data?.tahun || new Date().getFullYear()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Imej disimpan');
    } catch (e) {
      console.error(e);
      toast.error('Gagal menyimpan imej');
    } finally {
      setSavingChartImage(null);
    }
  };

  const exportChartsPdf = async () => {
    if (!chartsContainerRef.current) return;
    const cards = chartsContainerRef.current.querySelectorAll('.chart-export-card');
    if (!cards.length) {
      toast.error('Tiada graf untuk dieksport');
      return;
    }
    setExportingChartsPdf(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 10;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2 - 15;

      const pxToMm = 0.35;
      for (let i = 0; i < cards.length; i++) {
        if (i > 0) doc.addPage();
        const canvas = await html2canvas(cards[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/png');
        let w = canvas.width * pxToMm;
        let h = canvas.height * pxToMm;
        if (w > maxW) { h = h * maxW / w; w = maxW; }
        if (h > maxH) { w = w * maxH / h; h = maxH; }
        doc.addImage(imgData, 'PNG', margin, margin, w, h);
      }
      doc.save(`Graf_Analisis_Kewangan_${data?.tahun || new Date().getFullYear()}.pdf`);
      toast.success('PDF graf berjaya dijana');
    } catch (e) {
      console.error(e);
      toast.error('Gagal menjana PDF graf');
    } finally {
      setExportingChartsPdf(false);
    }
  };

  const handleSaveChartImage = (e) => {
    const card = e.currentTarget.closest('.chart-export-card');
    if (card) saveChartAsImage(card, card.getAttribute('data-chart-title') || 'Graf');
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  const summary = data?.summary ?? {};
  const cadangan = data?.ai_cadangan ?? {};
  const byTingkatan = data?.outstanding_by_tingkatan ?? [];
  const byJantina = data?.by_jantina ?? [];
  const byNegeri = data?.by_negeri ?? [];
  const aiNarrative = data?.ai_narrative ?? [];
  const aiScoring = data?.ai_scoring ?? [];
  const aiRecommendations = data?.ai_recommendations ?? [];
  const aiSegments = data?.ai_segments ?? [];

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Disalin ke clipboard'));
  };

  const classificationLabel = (c) => {
    if (c === 'high_engagement') return { text: 'High Engagement', emoji: '🟢', color: 'text-emerald-700 bg-emerald-100' };
    if (c === 'medium_risk') return { text: 'Medium Risk', emoji: '🟡', color: 'text-amber-700 bg-amber-100' };
    if (c === 'critical') return { text: 'Critical – Perlu Intervensi', emoji: '🔴', color: 'text-red-700 bg-red-100' };
    return { text: c || '-', emoji: '', color: 'bg-slate-100 text-slate-700' };
  };

  const progressBarColor = (rate, type = 'rate') => {
    if (type === 'score') {
      if (rate >= 80) return 'bg-emerald-500';
      if (rate >= 60) return 'bg-amber-400';
      return 'bg-orange-500';
    }
    if (rate >= 80) return 'bg-emerald-500';
    if (rate >= 60) return 'bg-amber-400';
    return 'bg-orange-500';
  };

  const ProgressBar = ({ value, max = 100, showLabel = true, colorClass, labelType = 'percent' }) => {
    const pct = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
    const label = labelType === 'score' ? `${value}/100` : `${value}%`;
    const color = colorClass || progressBarColor(value, labelType === 'score' ? 'score' : 'rate');
    return (
      <div className="w-full rounded-full bg-slate-200 overflow-hidden" style={{ height: 32 }}>
        <div
          className={`h-full rounded-full flex items-center justify-end pr-2 ${color} transition-all duration-500`}
          style={{ width: `${pct}%`, minWidth: pct > 0 ? 52 : 0 }}
        >
          {showLabel && pct > 0 && (
            <span className="text-white text-sm font-semibold drop-shadow-sm whitespace-nowrap">
              {label}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Brain className="text-violet-600" size={28} />
            Analisis & Statistik Kewangan (AI)
          </h1>
          <p className="text-slate-600 mt-1">
            Cadangan AI, laporan ikut kelas, jantina dan negeri. Eksport ke PDF.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HelpManualLink anchor="analisis-kewangan-ai" />
          <select
            value={tahun}
            onChange={(e) => setTahun(Number(e.target.value))}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <Button variant="ghost" onClick={fetchData} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Muat semula
          </Button>
          <Button onClick={exportToPdf} disabled={exportingPdf || !data}>
            {exportingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Eksport PDF
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {[
          { id: 'cadangan', label: 'Cadangan AI', icon: Sparkles },
          { id: 'graf', label: 'Graf & Carta', icon: LineChartIcon },
          { id: 'laporan', label: 'Laporan', icon: BarChart3 },
          { id: 'chat', label: 'Chat AI', icon: MessageCircle },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-violet-600 text-violet-700 bg-violet-50'
                : 'border-transparent text-slate-600 hover:bg-slate-50'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'cadangan' && (
          <motion.div
            key="cadangan"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-3xl bg-emerald-50/40 border border-emerald-100 p-6 shadow-sm"
          >
            <div className="space-y-6">
              {/* Ringkasan skor kelas – 3 kad berwarna (gaya attachment) */}
              {aiScoring.length > 0 && (() => {
                const excellent = aiScoring.filter((r) => r.classification === 'high_engagement');
                const good = aiScoring.filter((r) => r.classification === 'medium_risk');
                const risk = aiScoring.filter((r) => r.classification === 'critical');
                const total = aiScoring.length;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-2xl bg-emerald-500 p-5 text-white shadow-md min-h-[100px] flex flex-col justify-between">
                      <div className="text-3xl font-bold">{excellent.length}</div>
                      <div className="text-sm opacity-95">{total ? Math.round((excellent.length / total) * 100) : 0}% daripada tingkatan</div>
                      <div className="text-xs opacity-80 mt-1">Purata skor: {excellent.length ? (excellent.reduce((s, r) => s + r.score, 0) / excellent.length).toFixed(0) : '-'}%</div>
                      <div className="text-xs font-medium mt-2">🟢 High Engagement</div>
                    </div>
                    <div className="rounded-2xl bg-amber-400 p-5 text-amber-900 shadow-md min-h-[100px] flex flex-col justify-between">
                      <div className="text-3xl font-bold">{good.length}</div>
                      <div className="text-sm opacity-95">{total ? Math.round((good.length / total) * 100) : 0}% daripada tingkatan</div>
                      <div className="text-xs opacity-80 mt-1">Purata skor: {good.length ? (good.reduce((s, r) => s + r.score, 0) / good.length).toFixed(0) : '-'}%</div>
                      <div className="text-xs font-medium mt-2">🟡 Medium Risk</div>
                    </div>
                    <div className="rounded-2xl bg-orange-500 p-5 text-white shadow-md min-h-[100px] flex flex-col justify-between">
                      <div className="text-3xl font-bold">{risk.length}</div>
                      <div className="text-sm opacity-95">{total ? Math.round((risk.length / total) * 100) : 0}% daripada tingkatan</div>
                      <div className="text-xs opacity-80 mt-1">Purata skor: {risk.length ? (risk.reduce((s, r) => s + r.score, 0) / risk.length).toFixed(0) : '-'}%</div>
                      <div className="text-xs font-medium mt-2">🔴 Critical – Perlu Intervensi</div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid md:grid-cols-2 gap-4">
                <Card className="p-6 rounded-2xl border border-amber-200 bg-white shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-amber-100 rounded-2xl">
                      <TrendingDown className="text-amber-700" size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">Kelas Paling Lambat Bayar Yuran</h3>
                      <p className="text-sm text-slate-500">Cadangan AI berdasarkan kadar kutipan</p>
                    </div>
                  </div>
                  {cadangan.slowest_class ? (
                    <div className="space-y-2">
                      <p className="text-2xl font-bold text-amber-700">
                        Tingkatan {cadangan.slowest_class.tingkatan}
                      </p>
                      <p className="text-slate-600">
                        Kadar kutipan: <strong>{cadangan.slowest_class.collection_rate}%</strong>
                      </p>
                      <p className="text-sm text-slate-500">
                        {cadangan.slowest_class.student_count} pelajar · Tunggakan{' '}
                        {formatRM(cadangan.slowest_class.outstanding)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-slate-500">Tiada data untuk tahun ini.</p>
                  )}
                </Card>
                <Card className="p-6 rounded-2xl border border-emerald-200 bg-white shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-100 rounded-2xl">
                      <TrendingUp className="text-emerald-700" size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">Kelas Paling Cepat Habis Bayar Yuran</h3>
                      <p className="text-sm text-slate-500">Cadangan AI berdasarkan kadar kutipan</p>
                    </div>
                  </div>
                  {cadangan.fastest_class ? (
                    <div className="space-y-2">
                      <p className="text-2xl font-bold text-emerald-700">
                        Tingkatan {cadangan.fastest_class.tingkatan}
                      </p>
                      <p className="text-slate-600">
                        Kadar kutipan: <strong>{cadangan.fastest_class.collection_rate}%</strong>
                      </p>
                      <p className="text-sm text-slate-500">
                        {cadangan.fastest_class.student_count} pelajar · Dikutip{' '}
                        {formatRM(cadangan.fastest_class.total_collected)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-slate-500">Tiada data untuk tahun ini.</p>
                  )}
                </Card>
              </div>

              {/* AI Narrative */}
              {aiNarrative.length > 0 && (
                <Card className="p-6 rounded-2xl border border-violet-200 bg-white shadow-sm">
                  <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <Sparkles size={18} className="text-violet-600" />
                    Ringkasan AI Pelaporan
                  </h3>
                  <ul className="space-y-2">
                    {aiNarrative.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-slate-700">
                        <span className="text-violet-500 mt-0.5">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* AI Scoring – progress bar menyerlah dan cantik */}
              {aiScoring.length > 0 && (
                <Card className="p-6 rounded-2xl bg-white shadow-sm">
                  <h3 className="font-bold text-slate-900 mb-4">Students Proficiency – Kadar Kutipan & Skor AI</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left p-3 font-semibold text-slate-600">Tingkatan</th>
                          <th className="text-left p-3 font-semibold text-slate-600">% Kutipan</th>
                          <th className="text-left p-3 font-semibold text-slate-600">Skor AI</th>
                          <th className="text-center p-3 font-semibold text-slate-600">Status</th>
                          <th className="text-center p-3 font-semibold text-slate-600">Klasifikasi</th>
                          <th className="text-right p-3 font-semibold text-slate-600">MoM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiScoring.map((row) => {
                          const cl = classificationLabel(row.classification);
                          return (
                            <tr key={row.tingkatan} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="p-3 font-medium">T{row.tingkatan}</td>
                              <td className="p-3 w-40">
                                <ProgressBar value={row.collection_rate} max={100} labelType="percent" />
                              </td>
                              <td className="p-3 w-40">
                                <ProgressBar value={row.score} max={100} labelType="score" />
                              </td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-1 rounded-xl text-xs font-medium ${
                                  row.status === 'Excellent' ? 'bg-emerald-100 text-emerald-700' :
                                  row.status === 'Good' ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'
                                }`}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-medium ${cl.color}`}>
                                  {cl.emoji} {cl.text}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                {row.mom_change_percent != null
                                  ? (row.mom_change_percent >= 0 ? '+' : '') + row.mom_change_percent + '%'
                                  : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* AI Cadangan automatik */}
              {aiRecommendations.length > 0 && (
                <Card className="p-6 rounded-2xl border border-amber-200 bg-white shadow-sm">
                  <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <AlertTriangle size={18} className="text-amber-600" />
                    AI Cadangan Automatik (Action Recommendation)
                  </h3>
                  <div className="space-y-4">
                    {aiRecommendations.map((rec) => (
                      <div key={rec.tingkatan} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <h4 className="font-semibold text-slate-800 mb-2">{rec.title}</h4>
                      {rec.actions && rec.actions.length > 0 && (
                        <ul className="list-disc list-inside text-sm text-slate-600 mb-3 space-y-1">
                          {rec.actions.map((action, i) => (
                            <li key={i}>{action}</li>
                          ))}
                        </ul>
                      )}
                      {rec.suggested_whatsapp && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-500">Mesej cadangan (WhatsApp):</span>
                          <div className="flex-1 min-w-0 flex items-center gap-2 p-2 rounded-lg bg-slate-100 text-sm text-slate-700">
                            <span className="flex-1 truncate">{rec.suggested_whatsapp}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(rec.suggested_whatsapp)}
                              className="p-1.5 rounded hover:bg-slate-200 text-slate-600"
                              title="Salin"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* AI Segmentasi tingkatan */}
              {aiSegments.length > 0 && (
                <Card className="p-6 rounded-2xl bg-white shadow-sm">
                  <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <ThumbsUp size={18} className="text-violet-600" />
                    AI Segmentasi Tingkatan (Behaviour Analysis)
                  </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left p-3 font-semibold">Tingkatan</th>
                        <th className="text-left p-3 font-semibold">Tingkah laku bayaran</th>
                        <th className="text-center p-3 font-semibold">Segment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiSegments.map((row) => {
                        const cl = classificationLabel(row.segment_label);
                        return (
                          <tr key={row.tingkatan} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-3 font-medium">T{row.tingkatan}</td>
                            <td className="p-3 text-slate-700">{row.behaviour}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cl.color}`}>
                                {cl.emoji} {cl.text}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Berdasarkan purata bulan bayaran pertama. Boleh gunakan untuk push notification dan insentif berbeza ikut tingkatan.
                  </p>
                </Card>
              )}

              <div className="flex gap-2">
                <Button onClick={getAIInsights} disabled={chatLoading} className="rounded-xl bg-violet-600 text-white">
                  {chatLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  Jana Insight AI Penuh
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'graf' && (
          <motion.div
            key="graf"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="flex flex-wrap items-center justify-end gap-2 pb-2 border-b border-slate-200">
              <Button
                onClick={exportChartsPdf}
                disabled={exportingChartsPdf || !data}
                variant="outline"
                className="flex items-center gap-2"
              >
                {exportingChartsPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                Eksport semua graf ke PDF
              </Button>
            </div>
            <div ref={chartsContainerRef} className="space-y-8">
            {(() => {
              const tingkatanChartData = byTingkatan.map((t, i) => ({
                name: `T${t.tingkatan}`,
                tingkatan: t.tingkatan,
                dijangka: t.total_expected ?? 0,
                dikutip: t.total_collected ?? 0,
                tunggakan: t.outstanding ?? 0,
                kadar: t.collection_rate ?? 0,
                pelajar: t.student_count ?? 0,
                fill: CHART_COLORS[i % CHART_COLORS.length],
              }));
              const jantinaPieData = byJantina.map((j, i) => ({
                name: j.jantina,
                value: j.total_collected ?? 0,
                count: j.student_count ?? 0,
                fill: CHART_COLORS_JAW[i % CHART_COLORS_JAW.length],
              }));
              const negeriBarData = byNegeri.slice(0, 12).map((n, i) => ({
                name: n.negeri.length > 10 ? n.negeri.slice(0, 10) + '…' : n.negeri,
                fullName: n.negeri,
                jumlah: n.total_collected ?? 0,
                pelajar: n.student_count ?? 0,
                kadar: n.collection_rate ?? 0,
                fill: CHART_COLORS[i % CHART_COLORS.length],
              }));
              const radarData = byTingkatan.map((t) => ({
                subject: `T${t.tingkatan}`,
                kadar: t.collection_rate ?? 0,
                fullMark: 100,
              }));
              const radialData = summary.total_expected
                ? [{ name: 'Kadar', value: summary.collection_rate ?? 0, fill: '#6366f1' }]
                : [];
              const funnelData = byTingkatan
                .slice()
                .sort((a, b) => (b.collection_rate ?? 0) - (a.collection_rate ?? 0))
                .map((t, i) => ({
                  name: `T${t.tingkatan}`,
                  value: t.collection_rate ?? 0,
                  fill: CHART_COLORS[i % CHART_COLORS.length],
                }));

              return (
                <>
                  {/* Row 1: Bar + Stacked Bar + Composed */}
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="chart-export-card relative" data-chart-title="Bar Dijangka vs Dikutip">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Bar: Dijangka vs Dikutip (Tingkatan)</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={tingkatanChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1e6 ? `${v / 1e6}J` : v >= 1e3 ? `${v / 1e3}K` : v)} />
                          <Tooltip formatter={(v) => formatRM(v)} labelFormatter={(_, payload) => payload?.[0]?.payload?.name && `Tingkatan ${payload[0].payload.name}`} />
                          <Legend />
                          <Bar dataKey="dijangka" name="Dijangka" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="dikutip" name="Dikutip" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                    <div className="chart-export-card relative" data-chart-title="Bar Berstack Dikutip Tunggakan">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Bar Berstack: Dikutip + Tunggakan</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={tingkatanChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1e6 ? `${v / 1e6}J` : v >= 1e3 ? `${v / 1e3}K` : v)} />
                          <Tooltip formatter={(v) => formatRM(v)} />
                          <Legend />
                          <Bar dataKey="dikutip" name="Dikutip" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="tunggakan" name="Tunggakan" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                    <div className="chart-export-card relative" data-chart-title="Combo Bar Garis Kadar">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Combo: Bar + Garis Kadar %</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart data={tingkatanChartData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1e6 ? `${v / 1e6}J` : v >= 1e3 ? `${v / 1e3}K` : v)} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                          <Tooltip formatter={(v, name) => (name === 'kadar' ? `${v}%` : formatRM(v))} />
                          <Legend />
                          <Bar yAxisId="left" dataKey="dikutip" name="Dikutip" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Line yAxisId="right" type="monotone" dataKey="kadar" name="Kadar %" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                  </div>

                  {/* Row 2: Line + Area + Pie Tingkatan */}
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="chart-export-card relative" data-chart-title="Graf Garis Kadar Kutipan">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Graf Garis: Kadar Kutipan %</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={tingkatanChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                          <Tooltip formatter={(v) => [`${v}%`, 'Kadar']} />
                          <Line type="monotone" dataKey="kadar" name="Kadar %" stroke="#6366f1" strokeWidth={2} dot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                    <div className="chart-export-card relative" data-chart-title="Graf Luas Jumlah Dikutip">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Graf Luas: Jumlah Dikutip</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={tingkatanChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="areaDikutip" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                              <stop offset="100%" stopColor="#10b981" stopOpacity={0.1} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1e6 ? `${v / 1e6}J` : v >= 1e3 ? `${v / 1e3}K` : v)} />
                          <Tooltip formatter={(v) => [formatRM(v), 'Dikutip']} />
                          <Area type="monotone" dataKey="dikutip" name="Dikutip" stroke="#10b981" fill="url(#areaDikutip)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                    <div className="chart-export-card relative" data-chart-title="Pai Pecahan Tingkatan">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Pai: Pecahan Kutipan mengikut Tingkatan</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={tingkatanChartData}
                            dataKey="dikutip"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {tingkatanChartData.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => formatRM(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                  </div>

                  {/* Row 3: Donut Jantina + Bar Pelajar + Radar */}
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="chart-export-card relative" data-chart-title="Donut Kutipan Jantina">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Donut: Kutipan mengikut Jantina</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={jantinaPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={2}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {jantinaPieData.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS_JAW[i % CHART_COLORS_JAW.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => formatRM(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                    <div className="chart-export-card relative" data-chart-title="Bar Mendatar Pelajar">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Bar Mendatar: Bilangan Pelajar (Tingkatan)</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={tingkatanChartData} layout="vertical" margin={{ top: 8, right: 24, left: 32, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="name" width={32} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [v, 'Pelajar']} />
                          <Bar dataKey="pelajar" name="Pelajar" fill="#6366f1" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                    <div className="chart-export-card relative" data-chart-title="Radar Kadar Tingkatan">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Radar: Kadar Kutipan per Tingkatan</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                          <PolarGrid stroke="#e2e8f0" />
                          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                          <Radar name="Kadar %" dataKey="kadar" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} strokeWidth={2} />
                          <Tooltip formatter={(v) => [`${v}%`, 'Kadar']} />
                        </RadarChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                  </div>

                  {/* Row 4: Radial (gauge) + Bar Negeri + Funnel */}
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="chart-export-card relative" data-chart-title="Gauge Kadar Kutipan">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Gauge: Kadar Kutipan Keseluruhan</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <RadialBarChart
                          innerRadius="60%"
                          outerRadius="100%"
                          data={radialData}
                          startAngle={180}
                          endAngle={0}
                        >
                          <RadialBar background dataKey="value" name="Kadar %" cornerRadius={8} />
                          <Tooltip formatter={(v) => [`${v}%`, 'Kadar kutipan']} />
                          <Legend content={() => <span className="text-sm text-slate-600">{summary.collection_rate ?? 0}% kutipan</span>} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                    <div className="chart-export-card relative" data-chart-title="Bar Top Negeri">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Bar: Top Negeri (Jumlah Dikutip)</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={negeriBarData} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1e6 ? `${v / 1e6}J` : v >= 1e3 ? `${v / 1e3}K` : v)} />
                          <YAxis type="category" dataKey="name" width={56} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v) => formatRM(v)} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName} />
                          <Bar dataKey="jumlah" name="Dikutip" radius={[0, 4, 4, 0]}>
                            {negeriBarData.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                    <div className="chart-export-card relative" data-chart-title="Funnel Kadar Tingkatan">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Funnel: Kadar % (Tingkatan terbaik → terendah)</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <FunnelChart>
                          <Funnel dataKey="value" data={funnelData} isAnimationActive>
                            <LabelList position="center" fill="#fff" stroke="none" dataKey="name" />
                          </Funnel>
                        </FunnelChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                  </div>

                  {/* Row 5: Pai Negeri (top) + Bar perbandingan Dijangka/Dikutip */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="chart-export-card relative" data-chart-title="Pai Pecahan Negeri">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Pai: Pecahan Kutipan mengikut Negeri (Top 8)</h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={byNegeri.slice(0, 8).map((n, i) => ({ ...n, fill: CHART_COLORS[i % CHART_COLORS.length] }))}
                            dataKey="total_collected"
                            nameKey="negeri"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            label={({ negeri, percent }) => `${negeri.slice(0, 8)} ${(percent * 100).toFixed(0)}%`}
                          >
                            {byNegeri.slice(0, 8).map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => formatRM(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                    <div className="chart-export-card relative" data-chart-title="Bar Kumpulan Jantina">
                      <Card className="p-4 relative">
                        <button type="button" onClick={handleSaveChartImage} className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Simpan sebagai imej"><Image size={14} /></button>
                        <h3 className="font-bold text-slate-900 mb-4 text-sm">Bar Kumpulan: Dijangka vs Dikutip (Jantina)</h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={byJantina.map((j, i) => ({ ...j, fill: CHART_COLORS_JAW[i % 3] }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="jantina" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1e6 ? `${v / 1e6}J` : v >= 1e3 ? `${v / 1e3}K` : v)} />
                          <Tooltip formatter={(v) => formatRM(v)} />
                          <Legend />
                          <Bar dataKey="total_expected" name="Dijangka" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="total_collected" name="Dikutip" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      </Card>
                    </div>
                  </div>
                </>
              );
            })()}
            </div>
          </motion.div>
        )}

        {activeTab === 'laporan' && (
          <motion.div
            key="laporan"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <p className="text-sm text-slate-500">Jumlah Pelajar</p>
                <p className="text-xl font-bold text-slate-900">{summary.total_students ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-slate-500">Dijangka</p>
                <p className="text-xl font-bold text-slate-700">{formatRM(summary.total_expected)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-slate-500">Dikutip</p>
                <p className="text-xl font-bold text-emerald-600">{formatRM(summary.total_collected)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-slate-500">Kadar Kutipan</p>
                <p className="text-xl font-bold text-violet-600">{summary.collection_rate ?? 0}%</p>
              </Card>
            </div>

            <Card className="overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                <BarChart3 className="text-slate-600" size={20} />
                <h3 className="font-bold text-slate-900">Mengikut Tingkatan (Kelas)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="p-3">Tingkatan</th>
                      <th className="p-3">Pelajar</th>
                      <th className="p-3">Dijangka</th>
                      <th className="p-3">Dikutip</th>
                      <th className="p-3">Tunggakan</th>
                      <th className="p-3">Kadar %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byTingkatan.map((t) => (
                      <tr key={t.tingkatan} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="p-3 font-medium">T{t.tingkatan}</td>
                        <td className="p-3">{t.student_count}</td>
                        <td className="p-3">{formatRM(t.total_expected)}</td>
                        <td className="p-3 text-emerald-600">{formatRM(t.total_collected)}</td>
                        <td className="p-3 text-amber-600">{formatRM(t.outstanding)}</td>
                        <td className="p-3">{t.collection_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                  <Users className="text-slate-600" size={20} />
                  <h3 className="font-bold text-slate-900">Mengikut Jantina</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        <th className="p-3">Jantina</th>
                        <th className="p-3">Pelajar</th>
                        <th className="p-3">Dikutip</th>
                        <th className="p-3">Kadar %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byJantina.map((j) => (
                        <tr key={j.jantina} className="border-t border-slate-100">
                          <td className="p-3 font-medium">{j.jantina}</td>
                          <td className="p-3">{j.student_count}</td>
                          <td className="p-3">{formatRM(j.total_collected)}</td>
                          <td className="p-3">{j.collection_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card className="overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                  <MapPin className="text-slate-600" size={20} />
                  <h3 className="font-bold text-slate-900">Mengikut Negeri</h3>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left sticky top-0">
                        <th className="p-3">Negeri</th>
                        <th className="p-3">Pelajar</th>
                        <th className="p-3">Dikutip</th>
                        <th className="p-3">Kadar %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byNegeri.map((n) => (
                        <tr key={n.negeri} className="border-t border-slate-100">
                          <td className="p-3 font-medium">{n.negeri}</td>
                          <td className="p-3">{n.student_count}</td>
                          <td className="p-3">{formatRM(n.total_collected)}</td>
                          <td className="p-3">{n.collection_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </motion.div>
        )}

        {activeTab === 'chat' && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <Card className="p-4 min-h-[320px] flex flex-col">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-[200px]">
                {chatMessages.length === 0 && (
                  <p className="text-slate-500 text-sm">
                    Tanya apa-apa tentang yuran dan kutipan. Contoh: &quot;Ringkasan kutipan yuran&quot;, &quot;Cadangan
                    untuk tingkatkan kutipan&quot;
                  </p>
                )}
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                        m.role === 'user'
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 rounded-2xl px-4 py-2">
                      <Loader2 size={18} className="animate-spin text-slate-500" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                  placeholder="Tanya tentang yuran..."
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm"
                />
                <Button onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()}>
                  <Send size={18} />
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
