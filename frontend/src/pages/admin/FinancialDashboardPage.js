import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  TrendingUp, TrendingDown, DollarSign, Users, Target, BarChart3,
  PieChart, ArrowUpRight, ArrowDownRight, RefreshCw, Calendar,
  Wallet, Gift, Receipt, Building, Filter,
  FileText, FileSpreadsheet, Search, X, UserCheck
} from 'lucide-react';
import api from '../../services/api';
import { Spinner, HelpManualLink } from '../../components/common';

// Simple Card Components
const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl ${className}`}>{children}</div>
);

const CardHeader = ({ children, className = '' }) => (
  <div className={`p-6 pb-2 ${className}`}>{children}</div>
);

const CardTitle = ({ children, className = '' }) => (
  <h3 className={`text-lg font-bold text-slate-900 ${className}`}>{children}</h3>
);

const CardContent = ({ children, className = '' }) => (
  <div className={`p-6 pt-2 ${className}`}>{children}</div>
);

const Button = ({ children, variant = 'default', onClick, className = '' }) => (
  <button 
    onClick={onClick}
    className={`px-4 py-2 rounded-xl font-medium transition-all ${
      variant === 'outline' 
        ? 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
    } ${className}`}
  >
    {children}
  </button>
);

const StatCard = ({ title, value, icon: Icon, trend, trendValue, color = "emerald", subtitle }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`bg-white rounded-2xl shadow-lg border border-slate-100 p-6 hover:shadow-xl transition-shadow`}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className={`text-3xl font-bold mt-1 text-${color}-600`}>{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </div>
      <div className={`w-12 h-12 bg-${color}-100 rounded-xl flex items-center justify-center`}>
        <Icon className={`text-${color}-600`} size={24} />
      </div>
    </div>
    {trend && (
      <div className={`mt-4 flex items-center gap-1 text-sm ${trend === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
        {trend === 'up' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
        <span className="font-medium">{trendValue}</span>
        <span className="text-slate-400">vs bulan lepas</span>
      </div>
    )}
  </motion.div>
);

const FinancialDashboardPage = () => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [summary, setSummary] = useState(null);
  const [, setTrends] = useState([]);
  const [breakdown, setBreakdown] = useState({ income_breakdown: [], expense_breakdown: [] });
  const [campaigns, setCampaigns] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [exporting, setExporting] = useState({ pdf: false, excel: false });
  const [yuranBreakdown, setYuranBreakdown] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, yuran, detailed
  
  // Detailed Report State
  const [detailedReport, setDetailedReport] = useState(null);
  const [detailedLoading, setDetailedLoading] = useState(false);
  const [kategoriBayaranOptions, setKategoriBayaranOptions] = useState([]);
  const [reportFilters, setReportFilters] = useState({
    tingkatan: '',
    kelas: '',
    jantina: '',
    kategori_bayaran: '',
    tarikh_mula: '',
    tarikh_akhir: ''
  });

  useEffect(() => {
    fetchAllData();
  }, [period]);

  // Fetch kategori bayaran options when tingkatan changes
  useEffect(() => {
    const fetchKategoriBayaran = async () => {
      try {
        const currentYear = new Date().getFullYear();
        const params = new URLSearchParams({ tahun: currentYear });
        if (reportFilters.tingkatan) {
          params.append('tingkatan', reportFilters.tingkatan);
        }
        const response = await api.get(`/api/financial-dashboard/kategori-bayaran?${params.toString()}`);
        
        // If tingkatan is selected, use categories for that tingkatan
        // Otherwise use all categories
        if (reportFilters.tingkatan && response.data.categories_by_tingkatan) {
          const tingkatanCategories = response.data.categories_by_tingkatan[reportFilters.tingkatan] || [];
          setKategoriBayaranOptions(tingkatanCategories);
        } else {
          setKategoriBayaranOptions(response.data.categories || []);
        }
      } catch (err) {
        console.error('Failed to fetch kategori bayaran:', err);
      }
    };
    
    fetchKategoriBayaran();
  }, [reportFilters.tingkatan]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const currentYear = new Date().getFullYear();
      const [summaryRes, trendsRes, breakdownRes, campaignsRes, transactionsRes, yuranRes] = await Promise.all([
        api.get(`/api/financial-dashboard/summary?period=${period}`),
        api.get(`/api/financial-dashboard/donation-trends?period=${period}`),
        api.get(`/api/financial-dashboard/income-expense-breakdown?period=${period}`),
        api.get('/api/financial-dashboard/campaign-performance'),
        api.get('/api/financial-dashboard/recent-transactions?limit=10'),
        api.get(`/api/financial-dashboard/yuran-breakdown?tahun=${currentYear}`)
      ]);

      setSummary(summaryRes.data);
      setTrends(trendsRes.data.trends);
      setBreakdown(breakdownRes.data);
      setCampaigns(campaignsRes.data);
      setRecentTransactions(transactionsRes.data.transactions);
      setYuranBreakdown(yuranRes.data);
    } catch (err) {
      toast.error('Gagal memuatkan data dashboard');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch detailed report with filters
  const fetchDetailedReport = async () => {
    setDetailedLoading(true);
    try {
      const currentYear = new Date().getFullYear();
      const params = new URLSearchParams({ tahun: currentYear });
      
      if (reportFilters.tingkatan) params.append('tingkatan', reportFilters.tingkatan);
      if (reportFilters.kelas) params.append('kelas', reportFilters.kelas);
      if (reportFilters.jantina) params.append('jantina', reportFilters.jantina);
      if (reportFilters.kategori_bayaran) params.append('kategori_bayaran', reportFilters.kategori_bayaran);
      if (reportFilters.tarikh_mula) params.append('tarikh_mula', reportFilters.tarikh_mula);
      if (reportFilters.tarikh_akhir) params.append('tarikh_akhir', reportFilters.tarikh_akhir);
      
      const response = await api.get(`/api/financial-dashboard/yuran-detailed-report?${params.toString()}`);
      setDetailedReport(response.data);
    } catch (err) {
      toast.error('Gagal memuatkan laporan terperinci');
      console.error(err);
    } finally {
      setDetailedLoading(false);
    }
  };

  // Fetch detailed report when tab changes to 'detailed'
  useEffect(() => {
    if (activeTab === 'detailed' && !detailedReport) {
      fetchDetailedReport();
    }
  }, [activeTab]);

  const clearFilters = () => {
    setReportFilters({
      tingkatan: '',
      kelas: '',
      jantina: '',
      kategori_bayaran: '',
      tarikh_mula: '',
      tarikh_akhir: ''
    });
  };

  const handleExportPDF = async () => {
    setExporting(prev => ({ ...prev, pdf: true }));
    try {
      const response = await api.get(`/api/financial-dashboard/export/pdf?period=${period}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = `Laporan_Kewangan_${period}.pdf`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch) filename = filenameMatch[1];
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Laporan PDF berjaya dimuat turun!');
    } catch (err) {
      toast.error('Gagal menjana laporan PDF');
      console.error(err);
    } finally {
      setExporting(prev => ({ ...prev, pdf: false }));
    }
  };

  const handleExportExcel = async () => {
    setExporting(prev => ({ ...prev, excel: true }));
    try {
      const response = await api.get(`/api/financial-dashboard/export/excel?period=${period}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = `Laporan_Kewangan_${period}.xlsx`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch) filename = filenameMatch[1];
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Laporan Excel berjaya dimuat turun!');
    } catch (err) {
      toast.error('Gagal menjana laporan Excel');
      console.error(err);
    } finally {
      setExporting(prev => ({ ...prev, excel: false }));
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ms-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100 p-6 min-w-0 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard Kewangan</h1>
            <p className="text-slate-500 mt-1">Laporan bersepadu Tabung & Perakaunan</p>
            <HelpManualLink sectionId="dashboard-kewangan" label="Manual bahagian ini" className="mt-1 inline-block" />
          </div>
          
          <div className="flex items-center gap-3">
            {/* Export Buttons */}
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={handleExportPDF}
                disabled={exporting.pdf}
                className="flex items-center gap-2"
                data-testid="export-pdf-btn"
              >
                {exporting.pdf ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <FileText size={16} className="text-red-500" />
                )}
                <span className="hidden sm:inline">PDF</span>
              </Button>
              <Button 
                variant="outline" 
                onClick={handleExportExcel}
                disabled={exporting.excel}
                className="flex items-center gap-2"
                data-testid="export-excel-btn"
              >
                {exporting.excel ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={16} className="text-green-600" />
                )}
                <span className="hidden sm:inline">Excel</span>
              </Button>
            </div>

            {/* Period Filter */}
            <div className="flex bg-white rounded-xl p-1 shadow-sm border border-slate-200">
              {[
                { value: 'month', label: 'Bulan Ini' },
                { value: 'quarter', label: 'Suku Tahun' },
                { value: 'year', label: 'Tahun Ini' },
                { value: 'all', label: 'Semua' }
              ].map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    period === p.value
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            
            <Button variant="outline" onClick={fetchAllData} className="flex items-center gap-2">
              <RefreshCw size={16} /> Muat Semula
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-white rounded-xl p-1 shadow-sm border border-slate-200 w-fit">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <PieChart size={16} />
            Gambaran Keseluruhan
          </button>
          <button
            onClick={() => setActiveTab('yuran')}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'yuran'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Receipt size={16} />
            Pecahan Yuran
          </button>
          <button
            onClick={() => setActiveTab('detailed')}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'detailed'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BarChart3 size={16} />
            Laporan Terperinci
          </button>
        </div>

        {activeTab === 'overview' && (
          <>
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Jumlah Kutipan Tabung"
            value={formatCurrency(summary?.tabung?.total_donations)}
            icon={Gift}
            color="emerald"
            subtitle={`${summary?.tabung?.donation_count || 0} sumbangan`}
          />
          <StatCard
            title="Jumlah Pendapatan"
            value={formatCurrency(summary?.accounting?.total_income)}
            icon={TrendingUp}
            color="blue"
            subtitle={`${summary?.accounting?.income_count || 0} transaksi`}
          />
          <StatCard
            title="Jumlah Perbelanjaan"
            value={formatCurrency(summary?.accounting?.total_expense)}
            icon={TrendingDown}
            color="orange"
            subtitle={`${summary?.accounting?.expense_count || 0} transaksi`}
          />
          <StatCard
            title="Baki Bersih"
            value={formatCurrency(summary?.combined?.surplus_deficit)}
            icon={Wallet}
            color={summary?.combined?.surplus_deficit >= 0 ? "emerald" : "red"}
            subtitle={summary?.combined?.health_status === 'surplus' ? 'Lebihan' : 
                     summary?.combined?.health_status === 'deficit' ? 'Defisit' : 'Seimbang'}
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="Penderma Unik"
            value={summary?.tabung?.unique_donors || 0}
            icon={Users}
            color="purple"
          />
          <StatCard
            title="Kempen Aktif"
            value={summary?.tabung?.active_campaigns || 0}
            icon={Target}
            color="teal"
          />
          <StatCard
            title="Kempen Selesai"
            value={summary?.tabung?.completed_campaigns || 0}
            icon={Building}
            color="slate"
          />
        </div>

        {/* Charts and Tables Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Income Breakdown */}
          <Card className="shadow-lg border-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <PieChart className="text-blue-600" size={20} />
                Pecahan Pendapatan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {breakdown.income_breakdown?.length > 0 ? (
                <div className="space-y-3">
                  {breakdown.income_breakdown.map((item, idx) => {
                    const total = breakdown.income_breakdown.reduce((sum, i) => sum + i.total, 0);
                    const percentage = total > 0 ? (item.total / total * 100).toFixed(1) : 0;
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium text-slate-700">{item.category_name}</span>
                            <span className="text-sm text-slate-500">{formatCurrency(item.total)}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 0.5, delay: idx * 0.1 }}
                              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                            />
                          </div>
                        </div>
                        <span className="text-sm font-bold text-blue-600 w-14 text-right">{percentage}%</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-400 text-center py-8">Tiada data pendapatan</p>
              )}
            </CardContent>
          </Card>

          {/* Expense Breakdown */}
          <Card className="shadow-lg border-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="text-orange-600" size={20} />
                Pecahan Perbelanjaan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {breakdown.expense_breakdown?.length > 0 ? (
                <div className="space-y-3">
                  {breakdown.expense_breakdown.map((item, idx) => {
                    const total = breakdown.expense_breakdown.reduce((sum, i) => sum + i.total, 0);
                    const percentage = total > 0 ? (item.total / total * 100).toFixed(1) : 0;
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium text-slate-700">{item.category_name}</span>
                            <span className="text-sm text-slate-500">{formatCurrency(item.total)}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 0.5, delay: idx * 0.1 }}
                              className="h-full bg-gradient-to-r from-orange-500 to-orange-600 rounded-full"
                            />
                          </div>
                        </div>
                        <span className="text-sm font-bold text-orange-600 w-14 text-right">{percentage}%</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-400 text-center py-8">Tiada data perbelanjaan</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Campaign Performance */}
        <Card className="shadow-lg border-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="text-emerald-600" size={20} />
              Prestasi Kempen
              <span className="ml-auto text-sm font-normal text-slate-500">
                Keseluruhan: {campaigns?.overall_progress || 0}% tercapai
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {campaigns?.campaigns?.length > 0 ? (
              <div className="space-y-4">
                {campaigns.campaigns.slice(0, 5).map((campaign, idx) => (
                  <motion.div
                    key={campaign.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      campaign.progress_percent >= 100 ? 'bg-emerald-100' :
                      campaign.progress_percent >= 50 ? 'bg-blue-100' : 'bg-amber-100'
                    }`}>
                      <Target className={`${
                        campaign.progress_percent >= 100 ? 'text-emerald-600' :
                        campaign.progress_percent >= 50 ? 'text-blue-600' : 'text-amber-600'
                      }`} size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 truncate">{campaign.title}</p>
                        {campaign.is_featured && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">Pilihan</span>
                        )}
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          campaign.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                          campaign.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {campaign.status === 'active' ? 'Aktif' : campaign.status === 'completed' ? 'Selesai' : campaign.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(campaign.progress_percent, 100)}%` }}
                            transition={{ duration: 0.5, delay: idx * 0.1 }}
                            className={`h-full rounded-full ${
                              campaign.progress_percent >= 100 ? 'bg-emerald-500' :
                              campaign.progress_percent >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                            }`}
                          />
                        </div>
                        <span className="text-sm font-bold text-slate-700 w-14 text-right">
                          {campaign.progress_percent}%
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-600">{formatCurrency(campaign.collected)}</p>
                      <p className="text-xs text-slate-500">/ {formatCurrency(campaign.target)}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-8">Tiada kempen</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="shadow-lg border-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="text-teal-600" size={20} />
              Transaksi Terkini
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentTransactions?.length > 0 ? (
              <div className="space-y-3">
                {recentTransactions.map((tx, idx) => (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      tx.type === 'donation' ? 'bg-emerald-100' :
                      tx.type === 'income' ? 'bg-blue-100' : 'bg-orange-100'
                    }`}>
                      {tx.type === 'donation' ? (
                        <Gift className="text-emerald-600" size={18} />
                      ) : tx.type === 'income' ? (
                        <TrendingUp className="text-blue-600" size={18} />
                      ) : (
                        <TrendingDown className="text-orange-600" size={18} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{tx.description}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{tx.reference}</span>
                        <span>•</span>
                        <span>{formatDate(tx.created_at)}</span>
                        <span>•</span>
                        <span className={`px-1.5 py-0.5 rounded ${
                          tx.source === 'tabung' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {tx.source === 'tabung' ? 'Tabung' : 'Perakaunan'}
                        </span>
                      </div>
                    </div>
                    <p className={`font-bold ${
                      tx.type === 'expense' ? 'text-orange-600' : 'text-emerald-600'
                    }`}>
                      {tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}
                    </p>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-8">Tiada transaksi</p>
            )}
          </CardContent>
        </Card>
          </>
        )}

        {/* YURAN TAB */}
        {activeTab === 'yuran' && yuranBreakdown && (
          <div className="space-y-6">
            {/* Yuran Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Jumlah Dijangka"
                value={formatCurrency(yuranBreakdown.summary?.total_expected)}
                icon={Target}
                color="blue"
                subtitle={`${yuranBreakdown.summary?.total_students || 0} pelajar`}
              />
              <StatCard
                title="Jumlah Terkutip"
                value={formatCurrency(yuranBreakdown.summary?.total_collected)}
                icon={TrendingUp}
                color="emerald"
                subtitle={`${yuranBreakdown.summary?.collection_rate || 0}% kutipan`}
              />
              <StatCard
                title="Tunggakan"
                value={formatCurrency(yuranBreakdown.summary?.total_outstanding)}
                icon={TrendingDown}
                color="red"
                subtitle={`${yuranBreakdown.summary?.students_with_outstanding || 0} pelajar`}
              />
              <StatCard
                title="Selesai Bayar"
                value={yuranBreakdown.summary?.students_fully_paid || 0}
                icon={Users}
                color="teal"
                subtitle="Pelajar langsai yuran"
              />
            </div>

            {/* Category Breakdown & Payment Method */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pecahan Mengikut Kategori */}
              <Card className="shadow-lg border-0">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <PieChart className="text-blue-600" size={20} />
                    Kutipan Mengikut Kategori Yuran
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {yuranBreakdown.category_breakdown?.length > 0 ? (
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {yuranBreakdown.category_breakdown.map((cat, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl">
                          <div className="flex justify-between mb-2">
                            <span className="text-sm font-medium text-slate-700">{cat.name}</span>
                            <span className="text-sm font-bold text-emerald-600">{cat.collection_rate}%</span>
                          </div>
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${cat.collection_rate}%` }}
                              transition={{ duration: 0.5, delay: idx * 0.1 }}
                              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                            />
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>Terkutip: {formatCurrency(cat.total_collected)}</span>
                            <span>Sasaran: {formatCurrency(cat.total_expected)}</span>
                          </div>
                          {cat.outstanding > 0 && (
                            <div className="mt-1 text-xs text-red-500">
                              Tunggakan: {formatCurrency(cat.outstanding)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-center py-8">Tiada data kategori</p>
                  )}
                </CardContent>
              </Card>

              {/* Pecahan Mengikut Kaedah Bayaran */}
              <Card className="shadow-lg border-0">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BarChart3 className="text-teal-600" size={20} />
                    Kaedah Bayaran
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Bayar Penuh */}
                    <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                          <DollarSign className="text-emerald-600" size={24} />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-emerald-700">
                            {yuranBreakdown.payment_method_breakdown?.bayar_penuh?.label || 'Bayaran Penuh'}
                          </p>
                          <p className="text-sm text-slate-500">
                            {yuranBreakdown.payment_method_breakdown?.bayar_penuh?.description}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-emerald-600">
                            {yuranBreakdown.payment_method_breakdown?.bayar_penuh?.unique_students || 0}
                          </p>
                          <p className="text-xs text-slate-500">pelajar</p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-emerald-200">
                        <p className="text-sm text-emerald-700">
                          Jumlah: {formatCurrency(yuranBreakdown.payment_method_breakdown?.bayar_penuh?.total_collected)}
                        </p>
                      </div>
                    </div>

                    {/* Bayar Ansuran */}
                    <div className="p-4 bg-gradient-to-r from-pastel-mint to-pastel-lavender rounded-xl border border-pastel-lilac">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                          <Calendar className="text-blue-600" size={24} />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-blue-700">
                            {yuranBreakdown.payment_method_breakdown?.ansuran?.label || 'Bayaran Ansuran'}
                          </p>
                          <p className="text-sm text-slate-500">
                            {yuranBreakdown.payment_method_breakdown?.ansuran?.description}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">
                            {yuranBreakdown.payment_method_breakdown?.ansuran?.unique_students || 0}
                          </p>
                          <p className="text-xs text-slate-500">pelajar</p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-pastel-lilac">
                        <p className="text-sm text-blue-700">
                          Jumlah: {formatCurrency(yuranBreakdown.payment_method_breakdown?.ansuran?.total_collected)}
                        </p>
                      </div>
                    </div>

                    {/* Bayar Separa */}
                    <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                          <ArrowDownRight className="text-amber-600" size={24} />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-amber-700">
                            {yuranBreakdown.payment_method_breakdown?.separa?.label || 'Bayaran Separa'}
                          </p>
                          <p className="text-sm text-slate-500">
                            {yuranBreakdown.payment_method_breakdown?.separa?.description}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-amber-600">
                            {yuranBreakdown.payment_method_breakdown?.separa?.unique_students || 0}
                          </p>
                          <p className="text-xs text-slate-500">pelajar</p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-amber-200">
                        <p className="text-sm text-amber-700">
                          Jumlah: {formatCurrency(yuranBreakdown.payment_method_breakdown?.separa?.total_collected)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tunggakan Mengikut Tingkatan */}
            <Card className="shadow-lg border-0">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingDown className="text-red-600" size={20} />
                  Tunggakan Mengikut Tingkatan
                  <span className="ml-auto text-sm font-normal text-red-500">
                    Jumlah: {formatCurrency(yuranBreakdown.summary?.total_outstanding)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {yuranBreakdown.outstanding_by_tingkatan?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {yuranBreakdown.outstanding_by_tingkatan.map((ting, idx) => (
                      <motion.div
                        key={ting.tingkatan}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.1 }}
                        className={`p-4 rounded-xl border-2 ${
                          ting.outstanding > 0 
                            ? 'bg-red-50 border-red-200' 
                            : 'bg-emerald-50 border-emerald-200'
                        }`}
                      >
                        <div className="text-center">
                          <p className={`text-3xl font-bold ${
                            ting.outstanding > 0 ? 'text-red-600' : 'text-emerald-600'
                          }`}>
                            T{ting.tingkatan}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {ting.student_count} pelajar
                          </p>
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Dijangka:</span>
                            <span className="font-medium">{formatCurrency(ting.total_expected)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Terkutip:</span>
                            <span className="font-medium text-emerald-600">{formatCurrency(ting.total_collected)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Tunggakan:</span>
                            <span className={`font-bold ${ting.outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {formatCurrency(ting.outstanding)}
                            </span>
                          </div>
                          {ting.students_with_outstanding > 0 && (
                            <div className="text-xs text-red-500 text-center mt-2">
                              {ting.students_with_outstanding} pelajar belum selesai
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-center py-8">Tiada data tunggakan</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===================== DETAILED REPORT TAB ===================== */}
        {activeTab === 'detailed' && (
          <div className="space-y-6">
            {/* Filter Section */}
            <Card className="shadow-lg border-0">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Filter className="text-teal-600" size={20} />
                  Penapis Laporan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
                  {/* Tingkatan Filter */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Tingkatan</label>
                    <select
                      value={reportFilters.tingkatan}
                      onChange={(e) => setReportFilters(prev => ({ ...prev, tingkatan: e.target.value, kategori_bayaran: '' }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      data-testid="filter-tingkatan"
                    >
                      <option value="">Semua Tingkatan</option>
                      {[1, 2, 3, 4, 5].map(t => (
                        <option key={t} value={t}>Tingkatan {t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Kelas Filter */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Kelas</label>
                    <select
                      value={reportFilters.kelas}
                      onChange={(e) => setReportFilters(prev => ({ ...prev, kelas: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      data-testid="filter-kelas"
                    >
                      <option value="">Semua Kelas</option>
                      {(detailedReport?.filter_options?.kelas || ['A', 'B', 'C', 'D', 'Dinamik', 'Elit']).map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>

                  {/* Jantina Filter */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Jantina</label>
                    <select
                      value={reportFilters.jantina}
                      onChange={(e) => setReportFilters(prev => ({ ...prev, jantina: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      data-testid="filter-jantina"
                    >
                      <option value="">Semua Jantina</option>
                      <option value="male">Lelaki</option>
                      <option value="female">Perempuan</option>
                    </select>
                  </div>

                  {/* Kategori Bayaran Filter */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Kategori Bayaran</label>
                    <select
                      value={reportFilters.kategori_bayaran}
                      onChange={(e) => setReportFilters(prev => ({ ...prev, kategori_bayaran: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      data-testid="filter-kategori-bayaran"
                    >
                      <option value="">Semua Kategori</option>
                      {(kategoriBayaranOptions.length > 0 ? kategoriBayaranOptions : (detailedReport?.filter_options?.kategori_bayaran || [])).map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>

                  {/* Tarikh Mula */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Tarikh Mula</label>
                    <input
                      type="date"
                      value={reportFilters.tarikh_mula}
                      onChange={(e) => setReportFilters(prev => ({ ...prev, tarikh_mula: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      data-testid="filter-tarikh-mula"
                    />
                  </div>

                  {/* Tarikh Akhir */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Tarikh Akhir</label>
                    <input
                      type="date"
                      value={reportFilters.tarikh_akhir}
                      onChange={(e) => setReportFilters(prev => ({ ...prev, tarikh_akhir: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      data-testid="filter-tarikh-akhir"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-end gap-2">
                    <button
                      onClick={fetchDetailedReport}
                      disabled={detailedLoading}
                      className="flex-1 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      data-testid="btn-jana-report"
                    >
                      {detailedLoading ? <Spinner size="sm" /> : <Search size={16} />}
                      Jana
                    </button>
                    <button
                      onClick={clearFilters}
                      className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                      data-testid="btn-clear-filters"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {detailedLoading ? (
              <div className="flex items-center justify-center py-20">
                <Spinner size="lg" />
              </div>
            ) : detailedReport ? (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <StatCard
                    title="Jumlah Pelajar"
                    value={detailedReport.summary?.total_students || 0}
                    icon={Users}
                    color="purple"
                  />
                  <StatCard
                    title="Jumlah Dijangka"
                    value={formatCurrency(detailedReport.summary?.total_expected)}
                    icon={Target}
                    color="blue"
                  />
                  <StatCard
                    title="Jumlah Terkutip"
                    value={formatCurrency(detailedReport.summary?.total_collected)}
                    icon={TrendingUp}
                    color="emerald"
                  />
                  <StatCard
                    title="Tunggakan"
                    value={formatCurrency(detailedReport.summary?.total_outstanding)}
                    icon={TrendingDown}
                    color="red"
                  />
                  <StatCard
                    title="Kadar Kutipan"
                    value={`${detailedReport.summary?.collection_rate || 0}%`}
                    icon={BarChart3}
                    color="teal"
                  />
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Category Breakdown Chart */}
                  <Card className="shadow-lg border-0">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <PieChart className="text-teal-600" size={20} />
                        Kutipan Mengikut Kategori
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {detailedReport.category_breakdown?.length > 0 ? (
                        <div className="space-y-3">
                          {detailedReport.category_breakdown.map((cat, idx) => {
                            const colors = ['bg-teal-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500'];
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span className="font-medium text-slate-700">{cat.name}</span>
                                  <span className="text-slate-500">{cat.percentage}%</span>
                                </div>
                                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${cat.percentage}%` }}
                                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                                    className={`h-full ${colors[idx % colors.length]} rounded-full`}
                                  />
                                </div>
                                <div className="flex justify-between text-xs text-slate-500">
                                  <span>Terkutip: {formatCurrency(cat.collected)}</span>
                                  <span>Tunggakan: {formatCurrency(cat.outstanding)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-slate-400 text-center py-8">Tiada data kategori</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Gender Breakdown */}
                  <Card className="shadow-lg border-0">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <UserCheck className="text-blue-600" size={20} />
                        Kutipan Mengikut Jantina
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Lelaki */}
                        <div className="p-4 bg-gradient-to-br from-pastel-mint to-pastel-lavender rounded-xl border border-pastel-lilac">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                              <Users className="text-blue-600" size={24} />
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-blue-600">
                                {detailedReport.gender_breakdown?.male?.student_count || 0}
                              </p>
                              <p className="text-sm text-slate-500">Lelaki</p>
                            </div>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Dijangka:</span>
                              <span className="font-medium">{formatCurrency(detailedReport.gender_breakdown?.male?.expected)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Terkutip:</span>
                              <span className="font-medium text-emerald-600">{formatCurrency(detailedReport.gender_breakdown?.male?.collected)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Kadar:</span>
                              <span className="font-bold text-blue-600">{detailedReport.gender_breakdown?.male?.percentage || 0}%</span>
                            </div>
                          </div>
                          <div className="mt-3 h-2 bg-blue-100 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${detailedReport.gender_breakdown?.male?.percentage || 0}%` }}
                              transition={{ duration: 0.5 }}
                              className="h-full bg-blue-500 rounded-full"
                            />
                          </div>
                        </div>

                        {/* Perempuan */}
                        <div className="p-4 bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl border border-pink-200">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center">
                              <Users className="text-pink-600" size={24} />
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-pink-600">
                                {detailedReport.gender_breakdown?.female?.student_count || 0}
                              </p>
                              <p className="text-sm text-slate-500">Perempuan</p>
                            </div>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Dijangka:</span>
                              <span className="font-medium">{formatCurrency(detailedReport.gender_breakdown?.female?.expected)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Terkutip:</span>
                              <span className="font-medium text-emerald-600">{formatCurrency(detailedReport.gender_breakdown?.female?.collected)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Kadar:</span>
                              <span className="font-bold text-pink-600">{detailedReport.gender_breakdown?.female?.percentage || 0}%</span>
                            </div>
                          </div>
                          <div className="mt-3 h-2 bg-pink-100 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${detailedReport.gender_breakdown?.female?.percentage || 0}%` }}
                              transition={{ duration: 0.5 }}
                              className="h-full bg-pink-500 rounded-full"
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Tingkatan and Kelas Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Tingkatan Breakdown */}
                  <Card className="shadow-lg border-0">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <BarChart3 className="text-emerald-600" size={20} />
                        Kutipan Mengikut Tingkatan
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {detailedReport.tingkatan_breakdown?.length > 0 ? (
                        <div className="space-y-4">
                          {detailedReport.tingkatan_breakdown.map((ting, idx) => (
                            <motion.div
                              key={ting.tingkatan}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.1 }}
                              className="p-4 bg-gradient-to-r from-slate-50 to-emerald-50/50 rounded-xl border border-slate-100"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <span className="text-xl font-bold text-emerald-600">T{ting.tingkatan}</span>
                                  <span className="text-sm text-slate-500">{ting.student_count} pelajar</span>
                                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">{ting.male_count}L</span>
                                  <span className="text-xs px-2 py-0.5 bg-pink-100 text-pink-600 rounded-full">{ting.female_count}P</span>
                                </div>
                                <span className={`text-lg font-bold ${ting.percentage >= 80 ? 'text-emerald-600' : ting.percentage >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {ting.percentage}%
                                </span>
                              </div>
                              <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${ting.percentage}%` }}
                                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                                  className={`h-full rounded-full ${ting.percentage >= 80 ? 'bg-emerald-500' : ting.percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                />
                              </div>
                              <div className="flex justify-between text-xs text-slate-500">
                                <span>Terkutip: {formatCurrency(ting.collected)}</span>
                                <span>Tunggakan: {formatCurrency(ting.outstanding)}</span>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 text-center py-8">Tiada data tingkatan</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Kelas Breakdown */}
                  <Card className="shadow-lg border-0">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Building className="text-amber-600" size={20} />
                        Kutipan Mengikut Kelas
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {detailedReport.kelas_breakdown?.length > 0 ? (
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {detailedReport.kelas_breakdown.map((kelas, idx) => (
                            <motion.div
                              key={kelas.class_name}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="p-3 bg-slate-50 rounded-xl hover:bg-amber-50/50 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-700">{kelas.class_name}</span>
                                  <span className="text-xs text-slate-400">{kelas.student_count} pelajar</span>
                                </div>
                                <span className={`text-sm font-bold ${kelas.percentage >= 80 ? 'text-emerald-600' : kelas.percentage >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {kelas.percentage}%
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${kelas.percentage}%` }}
                                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                                  className={`h-full rounded-full ${kelas.percentage >= 80 ? 'bg-emerald-500' : kelas.percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                />
                              </div>
                              <div className="flex justify-between text-xs text-slate-500 mt-1">
                                <span>{formatCurrency(kelas.collected)} / {formatCurrency(kelas.expected)}</span>
                                <span>{kelas.male_count}L / {kelas.female_count}P</span>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 text-center py-8">Tiada data kelas</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Monthly Trend Chart */}
                {detailedReport.monthly_trend?.length > 0 && (
                  <Card className="shadow-lg border-0">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <TrendingUp className="text-teal-600" size={20} />
                        Trend Kutipan Bulanan
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64 flex items-end gap-2">
                        {detailedReport.monthly_trend.map((item, idx) => {
                          const maxValue = Math.max(...detailedReport.monthly_trend.map(i => i.collected));
                          const heightPercent = maxValue > 0 ? (item.collected / maxValue) * 100 : 0;
                          const monthNames = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
                          const monthIndex = parseInt(item.month.split('-')[1]) - 1;
                          
                          return (
                            <div key={item.month} className="flex-1 flex flex-col items-center gap-1">
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${heightPercent}%` }}
                                transition={{ duration: 0.5, delay: idx * 0.1 }}
                                className="w-full bg-gradient-to-t from-teal-600 to-teal-400 rounded-t-lg min-h-[4px] relative group"
                              >
                                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                  {formatCurrency(item.collected)}
                                </div>
                              </motion.div>
                              <span className="text-xs text-slate-500">{monthNames[monthIndex]}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card className="shadow-lg border-0">
                <CardContent className="py-20 text-center">
                  <BarChart3 className="mx-auto text-slate-300 mb-4" size={48} />
                  <p className="text-slate-500">Klik "Jana" untuk menjana laporan terperinci</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialDashboardPage;
