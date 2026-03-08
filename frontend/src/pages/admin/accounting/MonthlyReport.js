import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Lock
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { API_URL } from '../../../services/api';

const MALAY_MONTHS = {
  1: 'Januari', 2: 'Februari', 3: 'Mac', 4: 'April',
  5: 'Mei', 6: 'Jun', 7: 'Julai', 8: 'Ogos',
  9: 'September', 10: 'Oktober', 11: 'November', 12: 'Disember'
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ms-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2
  }).format(amount || 0);
};

const MonthlyReport = () => {
  const navigate = useNavigate();
  const { year: paramYear, month: paramMonth } = useParams();
  
  const now = new Date();
  const [year, setYear] = useState(parseInt(paramYear) || now.getFullYear());
  const [month, setMonth] = useState(parseInt(paramMonth) || now.getMonth() + 1);
  
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setUser] = useState(null);

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
      const userData = await userRes.json();
      setUser(userData);

      // Fetch report
      const reportRes = await fetch(
        `${API_URL}/api/accounting-full/reports/monthly?year=${year}&month=${month}`,
        { headers }
      );
      if (reportRes.ok) {
        const reportData = await reportRes.json();
        setReport(reportData);
      }
    } catch (err) {
      console.error('Error fetching report:', err);
    } finally {
      setLoading(false);
    }
  }, [year, month, navigate, getAuthHeader]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const changeMonth = (delta) => {
    let newMonth = month + delta;
    let newYear = year;
    
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    
    setMonth(newMonth);
    setYear(newYear);
    navigate(`/admin/accounting/reports/monthly/${newYear}/${newMonth}`, { replace: true });
  };

  const exportPDF = () => {
    if (!report) return;

    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text(`Penyata Bulanan`, 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`${report.month_name} ${report.year}`, 105, 30, { align: 'center' });
    
    // Summary
    doc.setFontSize(12);
    doc.text(`Ringkasan Kewangan`, 14, 45);
    
    doc.autoTable({
      startY: 50,
      head: [['Keterangan', 'Jumlah (RM)']],
      body: [
        ['Jumlah Wang Masuk', formatCurrency(report.total_income)],
        ['Jumlah Wang Keluar', formatCurrency(report.total_expense)],
        ['Baki Bersih', formatCurrency(report.net_balance)]
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });
    
    // Income breakdown
    if (report.income_by_category?.length > 0) {
      doc.text(`Pecahan Wang Masuk`, 14, doc.lastAutoTable.finalY + 15);
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Kategori', 'Jumlah (RM)']],
        body: report.income_by_category.map(cat => [cat.category_name, formatCurrency(cat.amount)]),
        theme: 'striped',
        headStyles: { fillColor: [34, 197, 94] }
      });
    }
    
    // Expense breakdown
    if (report.expense_by_category?.length > 0) {
      doc.text(`Pecahan Wang Keluar`, 14, doc.lastAutoTable.finalY + 15);
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Kategori', 'Jumlah (RM)']],
        body: report.expense_by_category.map(cat => [cat.category_name, formatCurrency(cat.amount)]),
        theme: 'striped',
        headStyles: { fillColor: [239, 68, 68] }
      });
    }
    
    // Footer
    doc.setFontSize(8);
    doc.text(`Dijana pada: ${new Date().toLocaleString('ms-MY')}`, 14, doc.internal.pageSize.height - 10);
    
    doc.save(`Penyata_Bulanan_${report.month_name}_${report.year}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Memuat laporan...</span>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 min-w-0 overflow-x-hidden" data-testid="monthly-report-page">
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
              <BarChart3 className="w-6 h-6 text-blue-600" />
              Penyata Bulanan
            </h1>
            <p className="text-gray-600">Laporan kewangan bulan {MALAY_MONTHS[month]} {year}</p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Month Navigation */}
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => changeMonth(-1)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 font-medium text-gray-700">
                {MALAY_MONTHS[month]} {year}
              </span>
              <button
                onClick={() => changeMonth(1)}
                className="p-2 hover:bg-gray-100 rounded"
              >
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

      {/* Lock Status */}
      {report?.is_locked && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-700">
          <Lock className="w-5 h-5" />
          <span>Tempoh ini telah dikunci. Transaksi tidak boleh diubah.</span>
        </div>
      )}

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

      {/* Statistics Bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <span className="text-gray-500">Jumlah Transaksi:</span>
            <span className="ml-2 font-semibold text-gray-800">{report?.transaction_count || 0}</span>
          </div>
          <div>
            <span className="text-gray-500">Disahkan:</span>
            <span className="ml-2 font-semibold text-green-600">{report?.verified_count || 0}</span>
          </div>
          <div>
            <span className="text-gray-500">Menunggu:</span>
            <span className="ml-2 font-semibold text-amber-600">{report?.pending_count || 0}</span>
          </div>
        </div>
      </div>

      {/* Category Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income by Category */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Pecahan Wang Masuk
          </h3>
          {report?.income_by_category?.length > 0 ? (
            <div className="space-y-3">
              {report.income_by_category.map((cat, index) => {
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
                    <p className="text-xs text-gray-500 mt-1">{percentage}%</p>
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
            Pecahan Wang Keluar
          </h3>
          {report?.expense_by_category?.length > 0 ? (
            <div className="space-y-3">
              {report.expense_by_category.map((cat, index) => {
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
                    <p className="text-xs text-gray-500 mt-1">{percentage}%</p>
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

export default MonthlyReport;
