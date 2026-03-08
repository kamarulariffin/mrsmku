import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Download,
  RefreshCw,
  Calendar,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { API_URL } from '../../../services/api';

const MALAY_MONTHS = {
  1: 'Jan', 2: 'Feb', 3: 'Mac', 4: 'Apr',
  5: 'Mei', 6: 'Jun', 7: 'Jul', 8: 'Ogos',
  9: 'Sep', 10: 'Okt', 11: 'Nov', 12: 'Dis'
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ms-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2
  }).format(amount || 0);
};

const AnnualReport = () => {
  const navigate = useNavigate();
  const { year: paramYear } = useParams();
  
  const [year, setYear] = useState(parseInt(paramYear) || new Date().getFullYear());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const getAuthHeader = useCallback(() => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeader();

      // Fetch user
      const userRes = await fetch(`${API_URL}/api/auth/me`, { headers });
      if (!userRes.ok) {
        navigate('/login');
        return;
      }

      // Fetch report
      const reportRes = await fetch(`${API_URL}/api/accounting-full/reports/annual?year=${year}`, { headers });
      if (reportRes.ok) {
        const reportData = await reportRes.json();
        setReport(reportData);
      }
    } catch (err) {
      console.error('Error fetching report:', err);
    } finally {
      setLoading(false);
    }
  }, [year, navigate, getAuthHeader]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const changeYear = (delta) => {
    const newYear = year + delta;
    setYear(newYear);
    navigate(`/admin/accounting/reports/annual/${newYear}`, { replace: true });
  };

  const exportPDF = () => {
    if (!report) return;

    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text(`Penyata Tahunan ${report.year}`, 105, 20, { align: 'center' });
    
    // Summary
    doc.setFontSize(12);
    doc.text(`Ringkasan Kewangan`, 14, 35);
    
    doc.autoTable({
      startY: 40,
      head: [['Keterangan', 'Jumlah (RM)']],
      body: [
        ['Jumlah Wang Masuk', formatCurrency(report.total_income)],
        ['Jumlah Wang Keluar', formatCurrency(report.total_expense)],
        ['Baki Bersih', formatCurrency(report.net_balance)]
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });
    
    // Monthly Breakdown
    doc.text(`Pecahan Bulanan`, 14, doc.lastAutoTable.finalY + 15);
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 20,
      head: [['Bulan', 'Wang Masuk', 'Wang Keluar', 'Baki']],
      body: report.monthly_breakdown.map(m => [
        m.month_name,
        formatCurrency(m.income),
        formatCurrency(m.expense),
        formatCurrency(m.net)
      ]),
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] }
    });
    
    // Footer
    doc.setFontSize(8);
    doc.text(`Dijana pada: ${new Date().toLocaleString('ms-MY')}`, 14, doc.internal.pageSize.height - 10);
    
    doc.save(`Penyata_Tahunan_${report.year}.pdf`);
  };

  // Find max values for chart scaling
  const maxValue = report?.monthly_breakdown 
    ? Math.max(
        ...report.monthly_breakdown.map(m => Math.max(m.income, m.expense))
      ) 
    : 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Memuat laporan...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 min-w-0 overflow-x-hidden" data-testid="annual-report-page">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/accounting')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Dashboard
        </button>
        
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              Penyata Tahunan
            </h1>
            <p className="text-gray-600">Laporan kewangan tahun {year}</p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Year Navigation */}
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1">
              <button onClick={() => changeYear(-1)} className="p-2 hover:bg-gray-100 rounded">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 font-medium text-gray-700">{year}</span>
              <button onClick={() => changeYear(1)} className="p-2 hover:bg-gray-100 rounded">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            <button
              onClick={exportPDF}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              data-testid="export-pdf-btn"
            >
              <Download className="w-4 h-4" />
              Eksport PDF
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Jumlah Wang Masuk</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {formatCurrency(report?.total_income)}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Jumlah Wang Keluar</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {formatCurrency(report?.total_expense)}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Baki Bersih</p>
              <p className={`text-2xl font-bold mt-1 ${
                (report?.net_balance || 0) >= 0 ? 'text-blue-600' : 'text-red-600'
              }`}>
                {formatCurrency(report?.net_balance)}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Chart */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          Trend Bulanan
        </h3>
        
        {/* Simple Bar Chart */}
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="flex items-end gap-2 h-48 border-b border-gray-200 mb-2">
              {report?.monthly_breakdown?.map((month, index) => (
                <div key={index} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex gap-1 items-end h-full w-full justify-center">
                    {/* Income Bar */}
                    <div
                      className="w-4 bg-green-500 rounded-t"
                      style={{ 
                        height: `${maxValue > 0 ? (month.income / maxValue) * 100 : 0}%`,
                        minHeight: month.income > 0 ? '4px' : '0'
                      }}
                      title={`Wang Masuk: ${formatCurrency(month.income)}`}
                    />
                    {/* Expense Bar */}
                    <div
                      className="w-4 bg-red-500 rounded-t"
                      style={{ 
                        height: `${maxValue > 0 ? (month.expense / maxValue) * 100 : 0}%`,
                        minHeight: month.expense > 0 ? '4px' : '0'
                      }}
                      title={`Wang Keluar: ${formatCurrency(month.expense)}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              {report?.monthly_breakdown?.map((month, index) => (
                <div key={index} className="flex-1 text-center">
                  <span className="text-xs text-gray-500">{MALAY_MONTHS[month.month]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded" />
            <span className="text-sm text-gray-600">Wang Masuk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded" />
            <span className="text-sm text-gray-600">Wang Keluar</span>
          </div>
        </div>
      </div>

      {/* Monthly Breakdown Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Pecahan Bulanan</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="monthly-breakdown-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Bulan</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Wang Masuk</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Wang Keluar</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Baki</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report?.monthly_breakdown?.map((month, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-800 font-medium">{month.month_name}</td>
                  <td className="px-4 py-3 text-right text-green-600">{formatCurrency(month.income)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{formatCurrency(month.expense)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${
                    month.net >= 0 ? 'text-blue-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(month.net)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-800">Jumlah</td>
                <td className="px-4 py-3 text-right font-semibold text-green-600">
                  {formatCurrency(report?.total_income)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-red-600">
                  {formatCurrency(report?.total_expense)}
                </td>
                <td className={`px-4 py-3 text-right font-semibold ${
                  (report?.net_balance || 0) >= 0 ? 'text-blue-600' : 'text-red-600'
                }`}>
                  {formatCurrency(report?.net_balance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Category Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income by Category */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Top Kategori Wang Masuk
          </h3>
          {report?.income_by_category?.length > 0 ? (
            <div className="space-y-3">
              {report.income_by_category.slice(0, 5).map((cat, index) => {
                const percentage = report.total_income > 0 
                  ? (cat.amount / report.total_income * 100).toFixed(1) 
                  : 0;
                return (
                  <div key={index}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{cat.category_name}</span>
                      <span className="font-medium text-green-600">{formatCurrency(cat.amount)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">Tiada data</p>
          )}
        </div>

        {/* Expense by Category */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-600" />
            Top Kategori Wang Keluar
          </h3>
          {report?.expense_by_category?.length > 0 ? (
            <div className="space-y-3">
              {report.expense_by_category.slice(0, 5).map((cat, index) => {
                const percentage = report.total_expense > 0 
                  ? (cat.amount / report.total_expense * 100).toFixed(1) 
                  : 0;
                return (
                  <div key={index}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{cat.category_name}</span>
                      <span className="font-medium text-red-600">{formatCurrency(cat.amount)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">Tiada data</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnnualReport;
