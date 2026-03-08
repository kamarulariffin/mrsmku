import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileSpreadsheet, Download, CheckCircle, XCircle, AlertTriangle,
  Users, FileText, RefreshCw, ChevronDown, ChevronUp, Search, Filter,
  Printer, QrCode, Eye, Copy, X, ArrowRight, ShieldAlert
} from 'lucide-react';
import api from '../../../services/api';

const StudentImportPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('import');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  
  // User info for guru_kelas restriction
  const [currentUser, setCurrentUser] = useState(null);
  const isGuruKelas = currentUser?.role === 'guru_kelas';
  const assignedTingkatan = currentUser?.assigned_form;
  const assignedKelas = currentUser?.assigned_class;
  
  // Claim codes state
  const [claimCodes, setClaimCodes] = useState([]);
  const [claimCodesLoading, setClaimCodesLoading] = useState(false);
  const [claimCodesStats, setClaimCodesStats] = useState({
    total: 0,
    pending: 0,
    claimed: 0,
    expired: 0
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 1
  });
  const [filters, setFilters] = useState({
    status: '',
    tingkatan: '',
    kelas: '',
    search: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Import stats
  const [importStats, setImportStats] = useState(null);
  
  // Slip preview
  const [selectedSlip, setSelectedSlip] = useState(null);
  
  // Portal URL config
  const [portalUrl, setPortalUrl] = useState('https://portal.mrsmku.edu.my');
  
  // Fetch current user on mount
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentUser(user);
      } catch (e) {
        console.error('Error parsing user:', e);
      }
    }
  }, []);
  
  useEffect(() => {
    if (activeTab === 'claim-codes') {
      fetchClaimCodes();
    }
    fetchImportStats();
  }, [activeTab]);
  
  const fetchImportStats = async () => {
    try {
      const res = await api.get('/api/student-import/stats');
      setImportStats(res.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };
  
  const fetchClaimCodes = async (page = 1) => {
    setClaimCodesLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', pagination.limit);
      
      if (filters.status) params.append('status', filters.status);
      if (filters.tingkatan) params.append('tingkatan', filters.tingkatan);
      if (filters.kelas) params.append('kelas', filters.kelas);
      if (filters.search) params.append('search', filters.search);
      
      const res = await api.get(`/api/student-import/claim-codes?${params.toString()}`);
      setClaimCodes(res.data.claim_codes);
      setClaimCodesStats(res.data.stats);
      setPagination(res.data.pagination);
    } catch (error) {
      toast.error('Gagal memuatkan senarai claim codes');
    } finally {
      setClaimCodesLoading(false);
    }
  };
  
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);
  
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, []);
  
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };
  
  const handleFileUpload = async (file) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('Hanya fail Excel (.xlsx, .xls) dibenarkan');
      return;
    }
    
    // Check if guru_kelas has assigned class
    if (isGuruKelas && (!assignedTingkatan || !assignedKelas)) {
      toast.error('Anda belum ditugaskan kepada mana-mana kelas. Sila hubungi pentadbir.');
      return;
    }
    
    setUploading(true);
    setUploadResult(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Add guru_kelas restriction params
      let url = '/api/student-import/upload?year=2026';
      if (isGuruKelas) {
        url += `&restrict_tingkatan=${assignedTingkatan}&restrict_kelas=${assignedKelas}`;
      }
      
      const res = await api.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setUploadResult(res.data);
      toast.success(`Import selesai: ${res.data.imported} berjaya, ${res.data.skipped} dilangkau, ${res.data.failed} gagal`);
      
      // Refresh stats
      fetchImportStats();
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Gagal memuat naik fail');
    } finally {
      setUploading(false);
    }
  };
  
  const downloadTemplate = async () => {
    try {
      const res = await api.get('/api/student-import/template', {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Template_Import_Pelajar.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Template dimuat turun');
    } catch (error) {
      toast.error('Gagal memuat turun template');
    }
  };
  
  const exportClaimCodes = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.tingkatan) params.append('tingkatan', filters.tingkatan);
      if (filters.kelas) params.append('kelas', filters.kelas);
      
      const res = await api.get(`/api/student-import/claim-codes/export?${params.toString()}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Claim_Codes_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Claim codes dimuat turun');
    } catch (error) {
      toast.error('Gagal memuat turun claim codes');
    }
  };
  
  const downloadSlip = async (claimCode) => {
    try {
      const res = await api.get(`/api/student-import/claim-codes/${claimCode}/slip?portal_url=${encodeURIComponent(portalUrl)}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Slip_Tuntutan_${claimCode}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Slip dimuat turun');
    } catch (error) {
      toast.error('Gagal memuat turun slip');
    }
  };
  
  const copyClaimCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success('Kod disalin ke clipboard');
  };
  
  const handleSearch = (e) => {
    e.preventDefault();
    fetchClaimCodes(1);
  };
  
  const clearFilters = () => {
    setFilters({ status: '', tingkatan: '', kelas: '', search: '' });
    setTimeout(() => fetchClaimCodes(1), 100);
  };

  return (
    <div className="p-6 space-y-6 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Upload Data Pelajar</h1>
          <p className="text-slate-500 mt-1">Import data pelajar secara pukal & urus claim codes</p>
        </div>
      </div>
      
      {/* Stats Cards */}
      {importStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white"
          >
            <Users className="w-8 h-8 mb-2 opacity-80" />
            <p className="text-2xl font-bold">{importStats.students.total}</p>
            <p className="text-sm opacity-80">Jumlah Pelajar</p>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 text-white"
          >
            <CheckCircle className="w-8 h-8 mb-2 opacity-80" />
            <p className="text-2xl font-bold">{importStats.students.with_parent}</p>
            <p className="text-sm opacity-80">Dengan Ibu Bapa</p>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white"
          >
            <QrCode className="w-8 h-8 mb-2 opacity-80" />
            <p className="text-2xl font-bold">{importStats.claim_codes.pending}</p>
            <p className="text-sm opacity-80">Claim Code Aktif</p>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-teal-500 to-violet-500 rounded-xl p-4 text-white"
          >
            <FileText className="w-8 h-8 mb-2 opacity-80" />
            <p className="text-2xl font-bold">{importStats.claim_codes.claimed}</p>
            <p className="text-sm opacity-80">Sudah Dituntut</p>
          </motion.div>
        </div>
      )}
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('import')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-all ${
            activeTab === 'import'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          data-testid="tab-import"
        >
          <Upload className="w-4 h-4 inline mr-2" />
          Import Excel
        </button>
        <button
          onClick={() => setActiveTab('claim-codes')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-all ${
            activeTab === 'claim-codes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          data-testid="tab-claim-codes"
        >
          <QrCode className="w-4 h-4 inline mr-2" />
          Claim Codes
          {claimCodesStats.pending > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">
              {claimCodesStats.pending}
            </span>
          )}
        </button>
      </div>
      
      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'import' && (
          <motion.div
            key="import"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Download Template */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900">Template Excel</p>
                  <p className="text-sm text-blue-700">Muat turun template untuk format data yang betul</p>
                </div>
              </div>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                data-testid="download-template-btn"
              >
                <Download className="w-4 h-4" />
                Muat Turun Template
              </button>
            </div>
            
            {/* Guru Kelas Warning */}
            {isGuruKelas && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-4" data-testid="guru-kelas-warning">
                <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                  <ShieldAlert className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-amber-800 mb-1">Amaran: Sekatan Upload untuk Guru Kelas</h4>
                  <p className="text-sm text-amber-700 mb-2">
                    Anda hanya boleh memuat naik data pelajar untuk <strong>kelas anda sendiri sahaja</strong>.
                  </p>
                  {assignedTingkatan && assignedKelas ? (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 rounded-lg">
                      <span className="text-sm text-amber-800">Kelas Anda:</span>
                      <span className="font-bold text-amber-900">Tingkatan {assignedTingkatan} Kelas {assignedKelas}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-red-600 font-medium">
                      ⚠️ Anda belum ditugaskan kepada mana-mana kelas. Sila hubungi pentadbir.
                    </p>
                  )}
                  <p className="text-xs text-amber-600 mt-2">
                    Data pelajar dari kelas lain akan ditolak secara automatik semasa proses import.
                  </p>
                </div>
              </div>
            )}
            
            {/* Upload Area */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                dragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-300 hover:border-slate-400'
              } ${isGuruKelas && (!assignedTingkatan || !assignedKelas) ? 'opacity-50 pointer-events-none' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              data-testid="upload-dropzone"
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-slate-600">Memproses fail...</p>
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-slate-700 mb-2">
                    Seret & lepas fail Excel di sini
                  </p>
                  <p className="text-sm text-slate-500 mb-4">atau</p>
                  <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                    <FileSpreadsheet className="w-5 h-5" />
                    Pilih Fail
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileSelect}
                      className="hidden"
                      data-testid="file-input"
                    />
                  </label>
                  <p className="text-xs text-slate-400 mt-4">Format: .xlsx, .xls</p>
                </>
              )}
            </div>
            
            {/* Upload Result */}
            {uploadResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                <div className="p-4 bg-slate-50 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-900">Hasil Import</h3>
                </div>
                
                {/* Summary */}
                <div className="p-4 grid grid-cols-3 gap-4 border-b border-slate-200">
                  <div className="text-center p-3 bg-emerald-50 rounded-lg">
                    <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-emerald-600">{uploadResult.imported}</p>
                    <p className="text-xs text-emerald-700">Berjaya</p>
                  </div>
                  <div className="text-center p-3 bg-amber-50 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-amber-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-amber-600">{uploadResult.skipped}</p>
                    <p className="text-xs text-amber-700">Dilangkau</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <XCircle className="w-6 h-6 text-red-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-red-600">{uploadResult.failed}</p>
                    <p className="text-xs text-red-700">Gagal</p>
                  </div>
                </div>
                
                {/* Imported Students */}
                {uploadResult.imported_students.length > 0 && (
                  <div className="p-4 border-b border-slate-200">
                    <h4 className="font-medium text-emerald-700 mb-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Pelajar Berjaya Diimport ({uploadResult.imported_students.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {uploadResult.imported_students.map((student, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-emerald-50 rounded-lg text-sm">
                          <div>
                            <span className="font-medium">{student.name}</span>
                            <span className="text-slate-500 ml-2">({student.matric_number})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded text-xs font-mono">
                              {student.claim_code}
                            </span>
                            <button
                              onClick={() => copyClaimCode(student.claim_code)}
                              className="p-1 hover:bg-emerald-200 rounded"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Skipped Students */}
                {uploadResult.skipped_students.length > 0 && (
                  <div className="p-4 border-b border-slate-200">
                    <h4 className="font-medium text-amber-700 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Pelajar Dilangkau ({uploadResult.skipped_students.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {uploadResult.skipped_students.map((student, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg text-sm">
                          <div>
                            <span className="font-medium">{student.name}</span>
                            <span className="text-slate-500 ml-2">({student.matric_number})</span>
                          </div>
                          <span className="text-xs text-amber-700">{student.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Failed Students */}
                {uploadResult.failed_students.length > 0 && (
                  <div className="p-4">
                    <h4 className="font-medium text-red-700 mb-3 flex items-center gap-2">
                      <XCircle className="w-4 h-4" />
                      Pelajar Gagal ({uploadResult.failed_students.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {uploadResult.failed_students.map((student, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-red-50 rounded-lg text-sm">
                          <div>
                            <span className="font-medium">Baris {student.row}</span>
                            {student.name && <span className="text-slate-500 ml-2">({student.name})</span>}
                          </div>
                          <span className="text-xs text-red-700">{student.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Actions */}
                <div className="p-4 bg-slate-50 flex justify-end gap-2">
                  <button
                    onClick={() => setActiveTab('claim-codes')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Lihat Claim Codes
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
            
            {/* Info Box */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h4 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Cara Smart Import Berfungsi
              </h4>
              <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                <li>Sistem akan semak No. Matrik dan No. IC untuk mengesan pertindihan</li>
                <li>Pelajar yang sudah didaftarkan oleh ibu bapa akan <strong>DILANGKAU</strong></li>
                <li>Pelajar baru atau tanpa ibu bapa akan diimport dan dijana <strong>Claim Code</strong></li>
                <li>Claim Code boleh dicetak dan diedarkan kepada ibu bapa untuk tuntut anak</li>
              </ul>
            </div>
          </motion.div>
        )}
        
        {activeTab === 'claim-codes' && (
          <motion.div
            key="claim-codes"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Actions Bar */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-2">
                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Cari nama, matrik, kod..."
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                      className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      data-testid="search-input"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                  >
                    Cari
                  </button>
                </form>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    showFilters ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  Tapis
                </button>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={exportClaimCodes}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  data-testid="export-btn"
                >
                  <Download className="w-4 h-4" />
                  Export Excel
                </button>
              </div>
            </div>
            
            {/* Filters Panel */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-slate-50 rounded-xl p-4 border border-slate-200"
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                      <select
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        data-testid="filter-status"
                      >
                        <option value="">Semua Status</option>
                        <option value="pending">Belum Dituntut</option>
                        <option value="claimed">Sudah Dituntut</option>
                        <option value="expired">Tamat Tempoh</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tingkatan</label>
                      <select
                        value={filters.tingkatan}
                        onChange={(e) => setFilters({ ...filters, tingkatan: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        data-testid="filter-tingkatan"
                      >
                        <option value="">Semua Tingkatan</option>
                        <option value="1">Tingkatan 1</option>
                        <option value="2">Tingkatan 2</option>
                        <option value="3">Tingkatan 3</option>
                        <option value="4">Tingkatan 4</option>
                        <option value="5">Tingkatan 5</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Kelas</label>
                      <select
                        value={filters.kelas}
                        onChange={(e) => setFilters({ ...filters, kelas: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        data-testid="filter-kelas"
                      >
                        <option value="">Semua Kelas</option>
                        <option value="A">Kelas A</option>
                        <option value="B">Kelas B</option>
                        <option value="C">Kelas C</option>
                        <option value="D">Kelas D</option>
                        <option value="E">Kelas E</option>
                        <option value="F">Kelas F</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-2">
                      <button
                        onClick={() => fetchClaimCodes(1)}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Tapis
                      </button>
                      <button
                        onClick={clearFilters}
                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Portal URL Config */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-blue-800 mb-1">URL Portal (untuk QR Code)</label>
                  <input
                    type="text"
                    value={portalUrl}
                    onChange={(e) => setPortalUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm"
                    placeholder="https://portal.mrsmku.edu.my"
                    data-testid="portal-url-input"
                  />
                </div>
                <p className="text-xs text-blue-600">URL ini akan dipaparkan pada slip tuntutan</p>
              </div>
            </div>
            
            {/* Claim Codes Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {claimCodesLoading ? (
                <div className="p-8 text-center">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-slate-500">Memuatkan...</p>
                </div>
              ) : claimCodes.length === 0 ? (
                <div className="p-8 text-center">
                  <QrCode className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">Tiada claim code dijumpai</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Claim Code</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Nama Pelajar</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">No. Matrik</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tingkatan</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Kelas</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {claimCodes.map((cc) => (
                        <tr key={cc.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-emerald-700">{cc.claim_code}</span>
                              <button
                                onClick={() => copyClaimCode(cc.claim_code)}
                                className="p-1 hover:bg-slate-200 rounded"
                                title="Salin kod"
                              >
                                <Copy className="w-3 h-3 text-slate-400" />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">{cc.student_name}</td>
                          <td className="px-4 py-3 text-slate-500">{cc.matric_number}</td>
                          <td className="px-4 py-3 text-slate-500">T{cc.tingkatan}</td>
                          <td className="px-4 py-3 text-slate-500">{cc.kelas || cc.nama_kelas}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              cc.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              cc.status === 'claimed' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {cc.status === 'pending' ? 'Belum Dituntut' :
                               cc.status === 'claimed' ? 'Sudah Dituntut' : 'Tamat Tempoh'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => downloadSlip(cc.claim_code)}
                                className="p-2 hover:bg-blue-100 rounded-lg text-blue-600"
                                title="Muat turun slip"
                                data-testid={`download-slip-${cc.claim_code}`}
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {/* Pagination */}
              {pagination.total_pages > 1 && (
                <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
                  <p className="text-sm text-slate-500">
                    Halaman {pagination.page} daripada {pagination.total_pages} ({pagination.total} rekod)
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchClaimCodes(pagination.page - 1)}
                      disabled={!pagination.has_prev}
                      className="px-3 py-1 border border-slate-200 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                    >
                      Sebelum
                    </button>
                    <button
                      onClick={() => fetchClaimCodes(pagination.page + 1)}
                      disabled={!pagination.has_next}
                      className="px-3 py-1 border border-slate-200 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                    >
                      Seterusnya
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StudentImportPage;
