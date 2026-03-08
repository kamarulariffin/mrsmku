import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { api } from '../../../services/api';
import { Card, Spinner } from '../../../components/common';
import { FEE_CATEGORIES } from '../../../constants';
import { 
  Download, FileText, Calendar, Filter, RefreshCw, 
  TrendingUp, TrendingDown, DollarSign, Users, CreditCard,
  BarChart3, PieChart, Printer, Search, Settings2
} from 'lucide-react';

const MONTH_SHORT = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogs', 'Sep', 'Okt', 'Nov', 'Dis'];

// Monthly Report Component
const MonthlyReportSection = ({ report }) => {
  if (!report) return null;
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
          <p className="text-sm text-emerald-600 font-medium">Jumlah Kutipan</p>
          <p className="text-2xl font-bold text-emerald-700">RM {(report.total_collected || 0).toLocaleString()}</p>
          {report.change_percent !== undefined && (
            <p className={`text-xs mt-1 ${report.change_percent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {report.change_percent >= 0 ? <TrendingUp size={12} className="inline mr-1" /> : <TrendingDown size={12} className="inline mr-1" />}
              {report.change_percent > 0 ? '+' : ''}{report.change_percent.toFixed(1)}% dari bulan lepas
            </p>
          )}
        </div>
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
          <p className="text-sm text-blue-600 font-medium">Bil. Transaksi</p>
          <p className="text-2xl font-bold text-blue-700">{report.total_transactions || 0}</p>
        </div>
        <div className="bg-pastel-lavender p-4 rounded-xl border border-pastel-lilac">
          <p className="text-sm text-violet-600 font-medium">Pelajar Aktif</p>
          <p className="text-2xl font-bold text-violet-700">{report.active_students || 0}</p>
        </div>
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
          <p className="text-sm text-amber-600 font-medium">Purata Bayaran</p>
          <p className="text-2xl font-bold text-amber-700">RM {(report.average_payment || 0).toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};

export const AdminReportsPage = () => {
  const [feeReport, setFeeReport] = useState(null);
  const [collectionReport, setCollectionReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [reportType, setReportType] = useState('fees'); // fees, collection, monthly, yearly
  const reportRef = useRef(null);

  // Laporan Tahunan Pelajar
  const [yearlyReport, setYearlyReport] = useState(null);
  const [yearlyYear, setYearlyYear] = useState(new Date().getFullYear());
  const [yearlySetYuran, setYearlySetYuran] = useState('');
  const [yearlyLoading, setYearlyLoading] = useState(false);
  const [yearlySearch, setYearlySearch] = useState('');

  const months = [
    { value: 1, label: 'Januari' },
    { value: 2, label: 'Februari' },
    { value: 3, label: 'Mac' },
    { value: 4, label: 'April' },
    { value: 5, label: 'Mei' },
    { value: 6, label: 'Jun' },
    { value: 7, label: 'Julai' },
    { value: 8, label: 'Ogos' },
    { value: 9, label: 'September' },
    { value: 10, label: 'Oktober' },
    { value: 11, label: 'November' },
    { value: 12, label: 'Disember' }
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    if (reportType === 'monthly') {
      fetchMonthlyReport();
    }
  }, [selectedMonth, selectedYear, reportType]);

  const fetchReports = async () => {
    try {
      const [fees, collection] = await Promise.all([
        api.get('/api/reports/fees'),
        api.get('/api/reports/collection')
      ]);
      setFeeReport(fees.data);
      setCollectionReport(collection.data);
    } catch (err) {
      toast.error('Gagal memuatkan laporan');
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthlyReport = async () => {
    try {
      const res = await api.get('/api/reports/monthly', {
        params: { month: selectedMonth, year: selectedYear }
      });
      setMonthlyReport(res.data);
    } catch (err) {
      // Use fallback data if endpoint doesn't exist
      setMonthlyReport({
        total_collected: collectionReport?.total_collected || 0,
        total_transactions: feeReport?.by_status?.paid || 0,
        active_students: feeReport?.total_students || 0,
        average_payment: (collectionReport?.total_collected || 0) / Math.max(feeReport?.by_status?.paid || 1, 1),
        change_percent: 0
      });
    }
  };

  const fetchYearlyReport = async () => {
    setYearlyLoading(true);
    try {
      const params = { year: yearlyYear };
      if (yearlySetYuran) params.set_yuran_id = yearlySetYuran;
      const res = await api.get('/api/reports/yearly-students', { params });
      setYearlyReport(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memuatkan laporan tahunan pelajar');
      setYearlyReport(null);
    } finally {
      setYearlyLoading(false);
    }
  };

  const exportToPDF = async () => {
    setExporting(true);
    
    try {
      // Generate PDF content using html2pdf approach (client-side)
      const reportContent = reportRef.current;
      if (!reportContent) {
        toast.error('Tiada kandungan untuk diexport');
        return;
      }

      // Create printable version
      const printWindow = window.open('', '_blank');
      const monthName = months.find(m => m.value === selectedMonth)?.label || '';
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Laporan ${reportType === 'monthly' ? `Bulanan ${monthName} ${selectedYear}` : reportType === 'fees' ? 'Yuran' : 'Kutipan'} - MRSMKU</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #6366f1; padding-bottom: 20px; }
            .header h1 { color: #4f46e5; margin: 0; font-size: 24px; }
            .header p { color: #64748b; margin: 5px 0 0; }
            .logo { font-size: 32px; color: #4f46e5; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            th { background: #f1f5f9; color: #475569; font-weight: 600; }
            .text-right { text-align: right; }
            .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
            .stat-card { background: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; }
            .stat-value { font-size: 24px; font-weight: bold; color: #1e293b; }
            .stat-label { font-size: 12px; color: #64748b; margin-top: 5px; }
            .success { color: #059669; }
            .warning { color: #d97706; }
            .danger { color: #dc2626; }
            .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">🎓</div>
            <h1>Portal MRSMKU Smart 360 AI Edition</h1>
            <p>Laporan ${reportType === 'monthly' ? `Bulanan - ${monthName} ${selectedYear}` : reportType === 'fees' ? 'Yuran' : 'Kutipan'}</p>
            <p style="font-size: 11px; color: #94a3b8;">Dijana pada: ${new Date().toLocaleString('ms-MY')}</p>
          </div>
          
          ${reportType === 'fees' ? `
            <h3>📊 Laporan Yuran Mengikut Kategori</h3>
            <table>
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th class="text-right">Bil.</th>
                  <th class="text-right">Jumlah (RM)</th>
                  <th class="text-right">Terkumpul (RM)</th>
                  <th class="text-right">Kadar</th>
                </tr>
              </thead>
              <tbody>
                ${feeReport?.by_category ? Object.entries(feeReport.by_category).map(([cat, data]) => `
                  <tr>
                    <td>${FEE_CATEGORIES[cat] || cat}</td>
                    <td class="text-right">${data.count}</td>
                    <td class="text-right">${data.total.toFixed(2)}</td>
                    <td class="text-right">${data.collected.toFixed(2)}</td>
                    <td class="text-right ${(data.collected / data.total * 100) >= 70 ? 'success' : 'warning'}">${((data.collected / data.total) * 100).toFixed(1)}%</td>
                  </tr>
                `).join('') : '<tr><td colspan="5">Tiada data</td></tr>'}
              </tbody>
            </table>
            
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-value success">${feeReport?.by_status?.paid || 0}</div>
                <div class="stat-label">Yuran Selesai</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" style="color: #3b82f6;">${feeReport?.by_status?.partial || 0}</div>
                <div class="stat-label">Separa Bayar</div>
              </div>
              <div class="stat-card">
                <div class="stat-value warning">${feeReport?.by_status?.pending || 0}</div>
                <div class="stat-label">Belum Bayar</div>
              </div>
              <div class="stat-card">
                <div class="stat-value danger">${feeReport?.by_status?.overdue || 0}</div>
                <div class="stat-label">Tertunggak</div>
              </div>
            </div>
          ` : reportType === 'monthly' ? `
            <h3>📅 Laporan Bulanan - ${monthName} ${selectedYear}</h3>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-value success">RM ${(monthlyReport?.total_collected || 0).toLocaleString()}</div>
                <div class="stat-label">Jumlah Kutipan</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" style="color: #3b82f6;">${monthlyReport?.total_transactions || 0}</div>
                <div class="stat-label">Bil. Transaksi</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" style="color: #8b5cf6;">${monthlyReport?.active_students || 0}</div>
                <div class="stat-label">Pelajar Aktif</div>
              </div>
              <div class="stat-card">
                <div class="stat-value warning">RM ${(monthlyReport?.average_payment || 0).toFixed(2)}</div>
                <div class="stat-label">Purata Bayaran</div>
              </div>
            </div>
          ` : `
            <h3>💰 Laporan Kutipan</h3>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-value success">RM ${(collectionReport?.total_collected || 0).toLocaleString()}</div>
                <div class="stat-label">Jumlah Kutipan</div>
              </div>
              <div class="stat-card">
                <div class="stat-value warning">RM ${(collectionReport?.total_outstanding || 0).toLocaleString()}</div>
                <div class="stat-label">Tertunggak</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" style="color: #3b82f6;">${(collectionReport?.collection_rate || 0).toFixed(1)}%</div>
                <div class="stat-label">Kadar Kutipan</div>
              </div>
            </div>
          `}
          
          <div class="footer">
            <p>Laporan dijana oleh Sistem Portal MRSMKU Smart 360 AI Edition</p>
            <p>© ${new Date().getFullYear()} MRSM Kuantan - Hak Cipta Terpelihara</p>
          </div>
        </body>
        </html>
      `);
      
      printWindow.document.close();
      
      // Trigger print dialog after content loads
      setTimeout(() => {
        printWindow.print();
      }, 500);
      
      toast.success('Laporan dibuka untuk dicetak/simpan sebagai PDF');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Gagal mengexport laporan');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="admin-reports-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Laporan</h1>
          <p className="text-slate-600 mt-1">Analisis dan statistik kewangan</p>
        </div>
        <button
          onClick={exportToPDF}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-all shadow-lg shadow-pastel disabled:opacity-50"
          data-testid="export-pdf-btn"
        >
          {exporting ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
          Export PDF
        </button>
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-2 bg-white rounded-xl p-1.5 border border-slate-200 w-fit">
        <button
          onClick={() => setReportType('fees')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            reportType === 'fees' 
              ? 'bg-teal-600 text-white shadow-pastel' 
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CreditCard size={16} className="inline mr-2" />
          Yuran
        </button>
        <button
          onClick={() => setReportType('collection')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            reportType === 'collection' 
              ? 'bg-teal-600 text-white shadow-pastel' 
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <DollarSign size={16} className="inline mr-2" />
          Kutipan
        </button>
        <button
          onClick={() => setReportType('monthly')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            reportType === 'monthly' 
              ? 'bg-teal-600 text-white shadow-pastel' 
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar size={16} className="inline mr-2" />
          Bulanan
        </button>
        <button
          onClick={() => setReportType('yearly')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            reportType === 'yearly' 
              ? 'bg-teal-600 text-white shadow-pastel' 
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText size={16} className="inline mr-2" />
          Tahunan Pelajar
        </button>
      </div>

      {/* Month/Year Filter (for Monthly Report) */}
      {reportType === 'monthly' && (
        <div className="flex gap-4 items-center bg-white p-4 rounded-xl border border-slate-200">
          <Filter size={18} className="text-slate-400" />
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Laporan Tahunan Pelajar: filter + generate */}
      {reportType === 'yearly' && (
        <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-xl border border-slate-200">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Tahun</label>
            <select
              value={yearlyYear}
              onChange={(e) => setYearlyYear(Number(e.target.value))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Set Yuran (pilihan)</label>
            <select
              value={yearlySetYuran}
              onChange={(e) => setYearlySetYuran(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 min-w-[200px]"
            >
              <option value="">Semua set yuran</option>
              {(yearlyReport?.set_yuran_options || []).map(opt => (
                <option key={opt.id} value={opt.id}>[{opt.nama}] {opt.count} pelajar</option>
              ))}
            </select>
          </div>
          <button
            onClick={fetchYearlyReport}
            disabled={yearlyLoading}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            {yearlyLoading ? <RefreshCw size={18} className="animate-spin" /> : <Settings2 size={18} />}
            Jana Laporan
          </button>
        </div>
      )}

      {/* Report Content */}
      <div ref={reportRef}>
        {reportType === 'fees' && (
          <>
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="text-teal-600" size={20} />
                <h3 className="font-semibold text-slate-900">Laporan Yuran Mengikut Kategori</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Kategori</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600">Bil.</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600">Jumlah</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600">Terkumpul</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600">Kadar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeReport?.by_category && Object.entries(feeReport.by_category).map(([cat, data]) => (
                      <tr key={cat} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">{FEE_CATEGORIES[cat] || cat}</td>
                        <td className="py-3 px-4 text-right">{data.count}</td>
                        <td className="py-3 px-4 text-right">RM {data.total.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right">RM {data.collected.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={(data.collected / data.total * 100) >= 70 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                            {((data.collected / data.total) * 100).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-50 p-5 rounded-xl border border-emerald-200 text-center"
              >
                <p className="text-3xl font-bold text-emerald-600">{feeReport?.by_status?.paid || 0}</p>
                <p className="text-sm text-emerald-700 mt-2 font-medium">Yuran Selesai</p>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-blue-50 p-5 rounded-xl border border-blue-200 text-center"
              >
                <p className="text-3xl font-bold text-blue-600">{feeReport?.by_status?.partial || 0}</p>
                <p className="text-sm text-blue-700 mt-2 font-medium">Separa Bayar</p>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-amber-50 p-5 rounded-xl border border-amber-200 text-center"
              >
                <p className="text-3xl font-bold text-amber-600">{feeReport?.by_status?.pending || 0}</p>
                <p className="text-sm text-amber-700 mt-2 font-medium">Belum Bayar</p>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-red-50 p-5 rounded-xl border border-red-200 text-center"
              >
                <p className="text-3xl font-bold text-red-600">{feeReport?.by_status?.overdue || 0}</p>
                <p className="text-sm text-red-700 mt-2 font-medium">Tertunggak</p>
              </motion.div>
            </div>
          </>
        )}

        {reportType === 'collection' && (
          <Card>
            <div className="flex items-center gap-2 mb-6">
              <PieChart className="text-teal-600" size={20} />
              <h3 className="font-semibold text-slate-900">Laporan Kutipan Keseluruhan</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-2xl text-white">
                <DollarSign size={32} className="mb-3 opacity-80" />
                <p className="text-3xl font-bold">RM {(collectionReport?.total_collected || 0).toLocaleString()}</p>
                <p className="text-emerald-100 mt-2">Jumlah Kutipan</p>
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 rounded-2xl text-white">
                <TrendingDown size={32} className="mb-3 opacity-80" />
                <p className="text-3xl font-bold">RM {(collectionReport?.total_outstanding || 0).toLocaleString()}</p>
                <p className="text-amber-100 mt-2">Tertunggak</p>
              </div>
              <div className="bg-gradient-to-br from-teal-500 to-violet-500 p-6 rounded-2xl text-white">
                <TrendingUp size={32} className="mb-3 opacity-80" />
                <p className="text-3xl font-bold">{(collectionReport?.collection_rate || 0).toFixed(1)}%</p>
                <p className="text-white/80 mt-2">Kadar Kutipan</p>
              </div>
            </div>
          </Card>
        )}

        {reportType === 'monthly' && (
          <Card>
            <div className="flex items-center gap-2 mb-6">
              <Calendar className="text-teal-600" size={20} />
              <h3 className="font-semibold text-slate-900">
                Laporan Bulanan - {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
              </h3>
            </div>
            <MonthlyReportSection report={monthlyReport} />
          </Card>
        )}

        {reportType === 'yearly' && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-semibold text-slate-900">Laporan Tahunan Pelajar</h3>
                <p className="text-sm text-slate-500 mt-0.5">View payment yearly report from the list below</p>
              </div>
              {yearlyReport && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const headers = ['No Matrik', 'No KP', 'Nama Pelajar', 'Nama Set Yuran', ...MONTH_SHORT, 'Jumlah Bayar', 'Status'];
                      const rows = (yearlyReport.rows || [])
                        .filter(r => !yearlySearch || [r.asset_no, r.ic_no, r.student_name, r.event_name].some(f => String(f || '').toLowerCase().includes(yearlySearch.toLowerCase())))
                        .map(r => [
                          r.asset_no,
                          r.ic_no,
                          r.student_name,
                          r.event_name,
                          ...MONTH_SHORT.map((_, i) => r.months[i + 1] != null ? r.months[i + 1] : 'X'),
                          r.total_paid,
                          r.status
                        ]);
                      const csv = [headers.join(','), ...rows.map(row => row.map(c => `"${c}"`).join(','))].join('\n');
                      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = `laporan-tahunan-pelajar-${yearlyReport.year}.csv`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                      toast.success('CSV berjaya dimuat turun');
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                  >
                    <Download size={16} /> CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                  >
                    <Printer size={16} /> Print
                  </button>
                </div>
              )}
            </div>
            {yearlyReport && (
              <>
                <div className="mb-4 flex justify-end">
                  <div className="relative w-56">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search keyword..."
                      value={yearlySearch}
                      onChange={(e) => setYearlySearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
                {yearlyReport.summary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                      <p className="text-xs text-emerald-600 font-medium">Jumlah Pelajar</p>
                      <p className="text-lg font-bold text-emerald-700">{yearlyReport.summary.total_students}</p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <p className="text-xs text-blue-600 font-medium">Jumlah Dijangka</p>
                      <p className="text-lg font-bold text-blue-700">RM {(yearlyReport.summary.total_expected || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-teal-50 p-3 rounded-lg border border-teal-200">
                      <p className="text-xs text-teal-600 font-medium">Jumlah Kutipan</p>
                      <p className="text-lg font-bold text-teal-700">RM {(yearlyReport.summary.total_collected || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                      <p className="text-xs text-amber-600 font-medium">Kadar Kutipan</p>
                      <p className="text-lg font-bold text-amber-700">{(yearlyReport.summary.collection_rate || 0)}%</p>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm print:text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">No Matrik</th>
                        <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">No KP</th>
                        <th className="text-left py-2 px-3 font-medium text-slate-600">Nama Set Yuran</th>
                        {MONTH_SHORT.map(m => (
                          <th key={m} className="text-center py-2 px-1 font-medium text-slate-600 w-12">{m}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(yearlyReport.rows || [])
                        .filter(r => !yearlySearch || [r.asset_no, r.ic_no, r.student_name, r.event_name].some(f => String(f || '').toLowerCase().includes(yearlySearch.toLowerCase())))
                        .map((r, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2 px-3 font-medium">{r.asset_no}</td>
                            <td className="py-2 px-3 text-slate-600">{r.ic_no || '-'}</td>
                            <td className="py-2 px-3">{r.event_name}</td>
                            {MONTH_SHORT.map((_, i) => (
                              <td key={i} className="py-2 px-1 text-center">
                                {r.months[i + 1] != null ? (
                                  <span className="text-emerald-600 font-medium">{(r.months[i + 1]).toFixed(2)}</span>
                                ) : (
                                  <span className="text-slate-300">X</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {(!yearlyReport.rows || yearlyReport.rows.length === 0) && (
                  <p className="text-center py-8 text-slate-500">Tiada rekod untuk tahun {yearlyReport.year}. Jana laporan untuk tahun lain atau semak data yuran.</p>
                )}
              </>
            )}
            {!yearlyReport && !yearlyLoading && (
              <p className="text-center py-12 text-slate-500">Pilih tahun dan klik &quot;Jana Laporan&quot; untuk paparkan laporan tahunan pelajar.</p>
            )}
            {yearlyLoading && (
              <div className="flex items-center justify-center py-12"><RefreshCw size={32} className="animate-spin text-teal-600" /></div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminReportsPage;
