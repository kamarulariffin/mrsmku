import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  GraduationCap, Plus, Edit, Trash2, X, FileText, Receipt, Users,
  ChevronDown, ChevronUp, Save, DollarSign, Calendar, ArrowUpRight,
  CheckCircle2, AlertCircle, Clock, Search, Filter, Copy, Moon
} from 'lucide-react';
import api from '../../../services/api';
import { TINGKATAN_LABELS } from '../../../constants';
import { HelpManualLink } from '../../../components/common';

// Components
const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-primary-200 border-t-primary-700 ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-primary-700 hover:bg-primary-800 text-white shadow-sm',
    secondary: 'bg-amber-500 hover:bg-amber-600 text-white',
    outline: 'border-2 border-primary-700 text-primary-700 hover:bg-primary-50',
    ghost: 'text-slate-600 hover:text-primary-700 hover:bg-slate-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Input = ({ label, error, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <input className={`flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${error ? 'border-red-500' : 'border-slate-200'}`} {...props} />
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Select = ({ label, error, children, className = '', ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <select className={`flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${error ? 'border-red-500' : 'border-slate-200'} ${className}`} {...props}>{children}</select>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 shadow-sm ${className}`} {...props}>{children}</div>
);

const Badge = ({ status, children, className = '' }) => {
  const styles = {
    active: 'bg-emerald-100 text-emerald-800',
    inactive: 'bg-red-100 text-red-800',
    paid: 'bg-emerald-100 text-emerald-800',
    partial: 'bg-amber-100 text-amber-800',
    pending: 'bg-slate-100 text-slate-800'
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'} ${className}`}>{children}</span>;
};

// Default category template
const DEFAULT_CATEGORIES = [
  {
    name: 'MUAFAKAT',
    sub_categories: [
      {
        name: 'Yuran Tetap Muafakat',
        items: [
          { code: 'M01', name: 'Yuran Tahunan Muafakat', amount: 100, mandatory: true },
          { code: 'M02', name: 'Dana Kebajikan', amount: 50, mandatory: true }
        ]
      }
    ]
  },
  {
    name: 'SEKOLAH',
    sub_categories: [
      {
        name: 'Yuran Aktiviti',
        items: [
          { code: 'S01', name: 'Yuran Sukan Tahunan', amount: 30, mandatory: true },
          { code: 'S02', name: 'Yuran Ko-kurikulum', amount: 50, mandatory: true }
        ]
      }
    ]
  }
];

export const SetYuranManagementPage = () => {
  const [setYuranList, setSetYuranList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [availableYears, setAvailableYears] = useState([]);
  const [editingSet, setEditingSet] = useState(null);
  const [syncExistingInvoices, setSyncExistingInvoices] = useState(true);
  const [expandedSet, setExpandedSet] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years = new Set();
    for (let y = currentYear - 1; y <= currentYear + 4; y += 1) {
      years.add(y);
    }
    (availableYears || []).forEach((entry) => {
      if (entry?.tahun) years.add(entry.tahun);
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [availableYears, currentYear]);
  
  // Copy form state
  const [copyForm, setCopyForm] = useState({
    source_year: new Date().getFullYear() - 1,
    target_year: new Date().getFullYear(),
    tingkatan: null // null = all
  });
  
  // Form state
  const [formData, setFormData] = useState({
    tahun: new Date().getFullYear(),
    tingkatan: 1,
    nama: '',
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES))
  });

  const fetchSetYuran = async () => {
    try {
      const res = await api.get(`/api/yuran/set-yuran?tahun=${selectedYear}`);
      setSetYuranList(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuatkan Set Yuran');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableYears = async () => {
    try {
      const res = await api.get('/api/yuran/set-yuran/available-years');
      setAvailableYears(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStatistics = async () => {
    try {
      const res = await api.get(`/api/yuran/statistik?tahun=${selectedYear}`);
      setStatistics(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSetYuran();
    fetchStatistics();
    fetchAvailableYears();
  }, [selectedYear]);

  const handleCreate = async () => {
    if (!formData.nama.trim()) {
      toast.error('Sila masukkan nama Set Yuran');
      return;
    }
    
    try {
      await api.post('/api/yuran/set-yuran', formData);
      toast.success('Set Yuran berjaya dicipta');
      setShowAddModal(false);
      resetForm();
      fetchSetYuran();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal mencipta Set Yuran');
    }
  };

  const handleUpdate = async () => {
    try {
      const res = await api.put(
        `/api/yuran/set-yuran/${editingSet.id}?sync_existing_invoices=${syncExistingInvoices ? 'true' : 'false'}`,
        formData
      );
      toast.success('Set Yuran berjaya dikemaskini');
      const syncSummary = res.data?.sync_summary;
      if (syncExistingInvoices && syncSummary) {
        const updated = Number(syncSummary.updated_invoices || 0);
        const skippedPaid = Number(syncSummary.skipped_paid || 0);
        if (updated > 0 || skippedPaid > 0) {
          toast.info(`Sync invoice: ${updated} dikemas kini, ${skippedPaid} sudah PAID (tidak diubah).`);
        }
      }
      setEditingSet(null);
      resetForm();
      fetchSetYuran();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal mengemaskini Set Yuran');
    }
  };

  const handleDelete = async (setId) => {
    if (!window.confirm('Adakah anda pasti mahu padam Set Yuran ini?')) return;
    try {
      await api.delete(`/api/yuran/set-yuran/${setId}`);
      toast.success('Set Yuran berjaya dipadam');
      fetchSetYuran();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam Set Yuran');
    }
  };

  const handleAssignByTingkatan = async (tingkatan) => {
    const confirmMessage = selectedYear > currentYear
      ? `Assign Set Yuran Tingkatan ${tingkatan} Tahun ${selectedYear}?\n\nUntuk tahun hadapan, sistem akan cuba pre-billing kepada pelajar semasa cohort sebelumnya supaya ibu bapa boleh bayar awal.`
      : `Assign Set Yuran kepada SEMUA pelajar Tingkatan ${tingkatan}?`;
    if (!window.confirm(confirmMessage)) return;
    try {
      const res = await api.post(`/api/yuran/assign-by-tingkatan?tahun=${selectedYear}&tingkatan=${tingkatan}`);
      toast.success(res.data.message);
      if (res.data.assignment_mode === 'prebill_next_year_from_current_students') {
        const source = res.data.source_cohort || {};
        toast.info(
          `Pre-billing: cohort semasa Tingkatan ${source.tingkatan || '-'} Tahun ${source.tahun || '-'} menerima invoice awal untuk tahun hadapan.`
        );
      } else if (res.data.pending_auto_assign) {
        toast.info('Cohort belum tersedia. Invoice akan auto-assign bila data pelajar tersedia/naik tingkatan.');
      }
      fetchSetYuran();
      fetchStatistics();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal assign yuran');
    }
  };

  const handleCopyFromYear = async () => {
    try {
      const res = await api.post('/api/yuran/set-yuran/copy', copyForm);
      toast.success(res.data.message);
      if (res.data.skipped?.length > 0) {
        toast.info(`Dilangkau: ${res.data.skipped.join(', ')}`);
      }
      setShowCopyModal(false);
      setSelectedYear(copyForm.target_year);
      fetchSetYuran();
      fetchAvailableYears();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyalin Set Yuran');
    }
  };

  const resetForm = () => {
    setFormData({
      tahun: selectedYear,
      tingkatan: 1,
      nama: '',
      categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES))
    });
    setSyncExistingInvoices(true);
  };

  const openEditModal = (set) => {
    setFormData({
      tahun: set.tahun,
      tingkatan: set.tingkatan,
      nama: set.nama,
      categories: set.categories || []
    });
    setSyncExistingInvoices(true);
    setEditingSet(set);
  };

  // Category management
  const addCategory = () => {
    setFormData(prev => ({
      ...prev,
      categories: [...prev.categories, { name: '', sub_categories: [{ name: '', items: [] }] }]
    }));
  };

  const removeCategory = (catIdx) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.filter((_, i) => i !== catIdx)
    }));
  };

  const updateCategory = (catIdx, field, value) => {
    setFormData(prev => {
      const newCats = [...prev.categories];
      newCats[catIdx] = { ...newCats[catIdx], [field]: value };
      return { ...prev, categories: newCats };
    });
  };

  const addSubCategory = (catIdx) => {
    setFormData(prev => {
      const newCats = [...prev.categories];
      newCats[catIdx].sub_categories.push({ name: '', items: [] });
      return { ...prev, categories: newCats };
    });
  };

  const removeSubCategory = (catIdx, subIdx) => {
    setFormData(prev => {
      const newCats = [...prev.categories];
      newCats[catIdx].sub_categories = newCats[catIdx].sub_categories.filter((_, i) => i !== subIdx);
      return { ...prev, categories: newCats };
    });
  };

  const updateSubCategory = (catIdx, subIdx, field, value) => {
    setFormData(prev => {
      const newCats = [...prev.categories];
      newCats[catIdx].sub_categories[subIdx] = { ...newCats[catIdx].sub_categories[subIdx], [field]: value };
      return { ...prev, categories: newCats };
    });
  };

  const addItem = (catIdx, subIdx) => {
    setFormData(prev => {
      const newCats = [...prev.categories];
      newCats[catIdx].sub_categories[subIdx].items.push({ code: '', name: '', amount: 0, mandatory: true, islam_only: false, bukan_islam_only: false });
      return { ...prev, categories: newCats };
    });
  };

  const removeItem = (catIdx, subIdx, itemIdx) => {
    setFormData(prev => {
      const newCats = [...prev.categories];
      newCats[catIdx].sub_categories[subIdx].items = newCats[catIdx].sub_categories[subIdx].items.filter((_, i) => i !== itemIdx);
      return { ...prev, categories: newCats };
    });
  };

  const updateItem = (catIdx, subIdx, itemIdx, field, value) => {
    setFormData(prev => {
      const newCats = [...prev.categories];
      newCats[catIdx].sub_categories[subIdx].items[itemIdx] = {
        ...newCats[catIdx].sub_categories[subIdx].items[itemIdx],
        [field]: value
      };
      return { ...prev, categories: newCats };
    });
  };

  const calculateTotal = () => {
    return formData.categories.reduce((total, cat) => {
      return total + cat.sub_categories.reduce((subTotal, sub) => {
        return subTotal + sub.items.reduce((itemTotal, item) => itemTotal + (parseFloat(item.amount) || 0), 0);
      }, 0);
    }, 0);
  };

  const calculateTotalByReligion = () => {
    let totalIslam = 0;
    let totalBukanIslam = 0;
    let islamOnlyItems = [];
    let bukanIslamOnlyItems = [];
    
    formData.categories.forEach(cat => {
      cat.sub_categories.forEach(sub => {
        sub.items.forEach(item => {
          const amount = parseFloat(item.amount) || 0;
          
          // Item "islam_only" - hanya untuk pelajar Islam
          if (item.islam_only) {
            totalIslam += amount;
            islamOnlyItems.push({ name: item.name, amount });
          }
          // Item "bukan_islam_only" - hanya untuk pelajar Bukan Islam
          else if (item.bukan_islam_only) {
            totalBukanIslam += amount;
            bukanIslamOnlyItems.push({ name: item.name, amount });
          }
          // Item biasa - untuk semua pelajar
          else {
            totalIslam += amount;
            totalBukanIslam += amount;
          }
        });
      });
    });
    
    return {
      totalIslam,
      totalBukanIslam,
      difference: totalIslam - totalBukanIslam,
      islamOnlyItems,
      bukanIslamOnlyItems
    };
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="set-yuran-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Pengurusan Set Yuran</h1>
          <p className="text-slate-600 mt-1">Konfigurasi set yuran mengikut tingkatan dan tahun akademik</p>
          <HelpManualLink sectionId="pakej-yuran" label="Manual bahagian ini" className="mt-1 inline-block" />
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} data-testid="year-filter">
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Button variant="secondary" onClick={() => setShowCopyModal(true)} data-testid="copy-set-yuran-btn">
            <Copy size={18} /> Salin dari Tahun Lain
          </Button>
          <Button onClick={() => { resetForm(); setShowAddModal(true); }} data-testid="add-set-yuran-btn">
            <Plus size={18} /> Tambah Set Yuran
          </Button>
        </div>
      </div>

      <Card className="p-4 border-violet-200 bg-violet-50">
        <p className="text-sm text-violet-800">
          Set yuran untuk <strong>tahun hadapan</strong> boleh disediakan lebih awal.
          Sistem akan auto-assign invoice apabila proses naik tingkatan/tahun dijalankan.
        </p>
      </Card>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <DollarSign className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Jumlah Dijangka</p>
                <p className="text-lg font-bold text-slate-900">RM {statistics.total_expected?.toLocaleString('ms-MY', { minimumFractionDigits: 2 }) || '0.00'}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="text-emerald-600" size={20} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Jumlah Dikutip</p>
                <p className="text-lg font-bold text-emerald-600">RM {statistics.total_collected?.toLocaleString('ms-MY', { minimumFractionDigits: 2 }) || '0.00'}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertCircle className="text-red-600" size={20} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Tunggakan</p>
                <p className="text-lg font-bold text-red-600">RM {statistics.total_outstanding?.toLocaleString('ms-MY', { minimumFractionDigits: 2 }) || '0.00'}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Users className="text-amber-600" size={20} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Pelajar</p>
                <p className="text-lg font-bold text-slate-900">{statistics.total_students || 0}</p>
                <p className="text-xs text-slate-500">{statistics.paid_students || 0} selesai bayar</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tingkatan Cards */}
      <div className="grid md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map(tingkatan => {
          const setYuran = setYuranList.find(s => s.tingkatan === tingkatan);
          return (
            <Card
              key={tingkatan}
              className={`p-4 cursor-pointer transition-all hover:shadow-md ${setYuran ? 'border-emerald-200 bg-emerald-50/50' : 'border-dashed border-slate-300'}`}
              onClick={() => setYuran && setExpandedSet(expandedSet === setYuran.id ? null : setYuran.id)}
              data-testid={`tingkatan-card-${tingkatan}`}
            >
              <div className="text-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${setYuran ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                  <GraduationCap size={24} />
                </div>
                <h3 className="font-semibold text-slate-800">{TINGKATAN_LABELS[tingkatan]}</h3>
                {setYuran ? (
                  <>
                    <p className="text-lg font-bold text-emerald-600 mt-2">
                      RM {setYuran.total_islam?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                    </p>
                    {setYuran.total_islam !== setYuran.total_bukan_islam && (
                      <p className="text-xs text-amber-600">
                        Bukan Islam: RM {setYuran.total_bukan_islam?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                      </p>
                    )}
                    <div className="flex items-center justify-center gap-1 mt-2">
                      <Users size={14} className="text-slate-400" />
                      <span className="text-xs text-slate-500">{setYuran.student_count || 0} pelajar</span>
                    </div>
                    <Badge status="active" className="mt-2">Aktif</Badge>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 mt-3">Belum dikonfigurasi</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Expanded Set Details */}
      <AnimatePresence>
        {expandedSet && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {(() => {
              const set = setYuranList.find(s => s.id === expandedSet);
              if (!set) return null;
              return (
                <Card className="p-6" data-testid="expanded-set-details">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{set.nama}</h2>
                      <p className="text-slate-500">{TINGKATAN_LABELS[set.tingkatan]} - Tahun {set.tahun}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => handleAssignByTingkatan(set.tingkatan)} data-testid="assign-btn" title={`Assign pakej ini kepada cohort sasaran. Untuk tahun hadapan, sistem akan pre-billing kepada pelajar semasa cohort sebelumnya.`}>
                        <Users size={16} /> Assign ke Semua Tingkatan {set.tingkatan}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEditModal(set)} data-testid="edit-btn">
                        <Edit size={16} /> Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(set.id)} data-testid="delete-btn">
                        <Trash2 size={16} /> Padam
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {set.categories?.map((cat, catIdx) => (
                      <div key={catIdx} className="border rounded-lg overflow-hidden">
                        <div className="bg-primary-50 px-4 py-3 flex items-center justify-between">
                          <h3 className="font-semibold text-primary-800">{cat.name}</h3>
                          <span className="text-sm font-medium text-primary-600">
                            RM {cat.sub_categories?.reduce((sum, sub) => sum + sub.items?.reduce((s, i) => s + (i.amount || 0), 0), 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="divide-y">
                          {cat.sub_categories?.map((sub, subIdx) => (
                            <div key={subIdx} className="px-4 py-3">
                              <p className="font-medium text-slate-700 mb-2">{sub.name}</p>
                              <div className="space-y-1 pl-4">
                                {sub.items?.map((item, itemIdx) => (
                                  <div key={itemIdx} className="flex items-center justify-between text-sm">
                                    <span className="text-slate-600">
                                      <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded mr-2">{item.code}</span>
                                      {item.name}
                                      {!item.mandatory && <span className="ml-2 text-xs text-amber-600">(Pilihan)</span>}
                                      {item.islam_only && <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Islam Sahaja</span>}
                                    </span>
                                    <span className="font-medium text-slate-800">RM {item.amount?.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-4 border-t flex items-center justify-between">
                    <span className="text-lg font-semibold text-slate-700">Jumlah Keseluruhan:</span>
                    <span className="text-2xl font-bold text-primary-700">RM {set.total_amount?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</span>
                  </div>
                </Card>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <div className="flex items-center justify-center h-32">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && setYuranList.length === 0 && (
        <Card className="text-center py-12 px-6">
          <FileText className="mx-auto text-slate-300" size={48} />
          <h3 className="mt-4 text-lg font-medium text-slate-700">Tiada Set Yuran</h3>
          <p className="text-slate-500 mt-2">Sila tambah Set Yuran untuk tahun {selectedYear}</p>
          <Button className="mt-4" onClick={() => { resetForm(); setShowAddModal(true); }}>
            <Plus size={18} /> Tambah Set Yuran Pertama
          </Button>
        </Card>
      )}

      {/* Add/Edit Slide-in Panel */}
      <AnimatePresence>
        {(showAddModal || editingSet) && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => { setShowAddModal(false); setEditingSet(null); }}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-6xl bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b bg-gradient-to-r from-primary-700 to-primary-900 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Receipt size={24} />
                    {editingSet ? 'Edit Set Yuran' : 'Tambah Set Yuran Baru'}
                  </h3>
                  <button
                    onClick={() => { setShowAddModal(false); setEditingSet(null); }}
                    className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Nama Set Yuran"
                    placeholder="cth: Set Yuran Tingkatan 1 2026"
                    value={formData.nama}
                    onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                    data-testid="input-nama"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      label="Tahun"
                      value={formData.tahun}
                      onChange={(e) => setFormData({ ...formData, tahun: parseInt(e.target.value) })}
                      data-testid="input-tahun"
                    >
                      {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                    </Select>
                    <Select
                      label="Tingkatan"
                      value={formData.tingkatan}
                      onChange={(e) => setFormData({ ...formData, tingkatan: parseInt(e.target.value) })}
                      data-testid="input-tingkatan"
                    >
                      {[1, 2, 3, 4, 5].map(t => <option key={t} value={t}>Tingkatan {t}</option>)}
                    </Select>
                  </div>
                </div>

                {/* Categories */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-slate-800">Kategori Yuran</h4>
                    <Button variant="outline" size="sm" onClick={addCategory}>
                      <Plus size={16} /> Tambah Kategori
                    </Button>
                  </div>

                  {formData.categories.map((cat, catIdx) => (
                    <div key={catIdx} className="border rounded-lg overflow-hidden">
                      <div className="bg-slate-50 px-4 py-3 flex items-center gap-3">
                        <Input
                          placeholder="Nama Kategori (cth: MUAFAKAT)"
                          value={cat.name}
                          onChange={(e) => updateCategory(catIdx, 'name', e.target.value)}
                          className="flex-1"
                        />
                        <button onClick={() => removeCategory(catIdx)} className="text-red-500 hover:text-red-700">
                          <Trash2 size={18} />
                        </button>
                      </div>

                      <div className="p-4 space-y-4">
                        {cat.sub_categories.map((sub, subIdx) => (
                          <div key={subIdx} className="pl-4 border-l-2 border-slate-200">
                            <div className="flex items-center gap-2 mb-2">
                              <Input
                                placeholder="Nama Sub-Kategori"
                                value={sub.name}
                                onChange={(e) => updateSubCategory(catIdx, subIdx, 'name', e.target.value)}
                                className="flex-1"
                              />
                              <button onClick={() => removeSubCategory(catIdx, subIdx)} className="text-red-500 hover:text-red-700">
                                <X size={16} />
                              </button>
                            </div>

                            {/* Items */}
                            <div className="space-y-2 ml-4">
                              {sub.items.map((item, itemIdx) => (
                                <div key={itemIdx} className="flex items-center gap-2 text-sm">
                                  <input
                                    placeholder="Kod"
                                    value={item.code}
                                    onChange={(e) => updateItem(catIdx, subIdx, itemIdx, 'code', e.target.value)}
                                    className="w-16 px-2 py-1 border rounded text-xs font-mono"
                                  />
                                  <input
                                    placeholder="Nama Item"
                                    value={item.name}
                                    onChange={(e) => updateItem(catIdx, subIdx, itemIdx, 'name', e.target.value)}
                                    className="flex-1 px-2 py-1 border rounded"
                                  />
                                  <div className="flex items-center">
                                    <span className="text-slate-400 text-xs mr-1">RM</span>
                                    <input
                                      type="number"
                                      placeholder="0.00"
                                      value={item.amount}
                                      onChange={(e) => updateItem(catIdx, subIdx, itemIdx, 'amount', parseFloat(e.target.value) || 0)}
                                      className="w-20 px-2 py-1 border rounded text-right"
                                    />
                                  </div>
                                  <label className="flex items-center gap-1 text-xs">
                                    <input
                                      type="checkbox"
                                      checked={item.mandatory}
                                      onChange={(e) => updateItem(catIdx, subIdx, itemIdx, 'mandatory', e.target.checked)}
                                    />
                                    Wajib
                                  </label>
                                  <label className="flex items-center gap-1 text-xs bg-emerald-50 px-2 py-1 rounded" title="Tandakan jika item ini hanya untuk pelajar Islam (cth: Kelas Al-Quran)">
                                    <input
                                      type="checkbox"
                                      checked={item.islam_only || false}
                                      onChange={(e) => {
                                        updateItem(catIdx, subIdx, itemIdx, 'islam_only', e.target.checked);
                                        if (e.target.checked) updateItem(catIdx, subIdx, itemIdx, 'bukan_islam_only', false);
                                      }}
                                      disabled={item.bukan_islam_only}
                                    />
                                    <Moon size={12} className="text-emerald-600" />
                                    Islam
                                  </label>
                                  <label className="flex items-center gap-1 text-xs bg-amber-50 px-2 py-1 rounded" title="Tandakan jika item ini hanya untuk pelajar Bukan Islam (cth: Pendidikan Moral)">
                                    <input
                                      type="checkbox"
                                      checked={item.bukan_islam_only || false}
                                      onChange={(e) => {
                                        updateItem(catIdx, subIdx, itemIdx, 'bukan_islam_only', e.target.checked);
                                        if (e.target.checked) updateItem(catIdx, subIdx, itemIdx, 'islam_only', false);
                                      }}
                                      disabled={item.islam_only}
                                    />
                                    <FileText size={12} className="text-amber-600" />
                                    Bkn Islam
                                  </label>
                                  <button onClick={() => removeItem(catIdx, subIdx, itemIdx)} className="text-red-400 hover:text-red-600">
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => addItem(catIdx, subIdx)}
                                className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1"
                              >
                                <Plus size={14} /> Tambah Item
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => addSubCategory(catIdx)}
                          className="text-sm text-slate-600 hover:text-slate-800 flex items-center gap-1 ml-4"
                        >
                          <Plus size={16} /> Tambah Sub-Kategori
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="bg-primary-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary-800">Jumlah (Pelajar Islam):</span>
                    <span className="text-2xl font-bold text-primary-700">
                      RM {calculateTotalByReligion().totalIslam.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-amber-700">Jumlah (Pelajar Bukan Islam):</span>
                    <span className="text-xl font-bold text-amber-600">
                      RM {calculateTotalByReligion().totalBukanIslam.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {calculateTotalByReligion().islamOnlyItems.length > 0 && (
                    <div className="text-sm text-slate-600 border-t pt-2 mt-2">
                      <p className="font-medium mb-1 text-emerald-700">Item Islam Sahaja:</p>
                      {calculateTotalByReligion().islamOnlyItems.map((item, idx) => (
                        <p key={idx} className="flex justify-between text-xs">
                          <span>• {item.name}</span>
                          <span>RM {item.amount.toFixed(2)}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  {calculateTotalByReligion().bukanIslamOnlyItems.length > 0 && (
                    <div className="text-sm text-slate-600 border-t pt-2 mt-2">
                      <p className="font-medium mb-1 text-amber-700">Item Bukan Islam Sahaja:</p>
                      {calculateTotalByReligion().bukanIslamOnlyItems.map((item, idx) => (
                        <p key={idx} className="flex justify-between text-xs">
                          <span>• {item.name}</span>
                          <span>RM {item.amount.toFixed(2)}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {editingSet && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <label className="flex items-start gap-3 text-sm text-amber-900">
                      <input
                        type="checkbox"
                        checked={syncExistingInvoices}
                        onChange={(e) => setSyncExistingInvoices(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <strong>Sync perubahan ke invoice sedia ada</strong> (pending/partial sahaja). Invoice
                        yang sudah <strong>PAID</strong> tidak diubah untuk elak ganggu rekod audit.
                      </span>
                    </label>
                  </div>
                )}
              </div>

              <div className="border-t p-6 bg-white flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setShowAddModal(false); setEditingSet(null); }}>
                  Batal
                </Button>
                <Button className="flex-1" onClick={editingSet ? handleUpdate : handleCreate} data-testid="save-btn">
                  <Save size={18} /> {editingSet ? 'Kemaskini' : 'Simpan'}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Copy Set Yuran Modal */}
      <AnimatePresence>
        {showCopyModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowCopyModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[20%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-md bg-white rounded-xl shadow-2xl z-50 overflow-hidden"
              data-testid="copy-modal"
            >
              <div className="p-6 border-b">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Copy size={24} className="text-amber-500" />
                  Salin Set Yuran dari Tahun Lain
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  Salin semua set yuran dari tahun sebelumnya dan edit untuk tahun baru
                </p>
              </div>

              <div className="p-6 space-y-4">
                <Select
                  label="Tahun Sumber (Salin Dari)"
                  value={copyForm.source_year}
                  onChange={(e) => setCopyForm({ ...copyForm, source_year: parseInt(e.target.value) })}
                >
                  {availableYears.length > 0 ? (
                    availableYears.map(y => (
                      <option key={y.tahun} value={y.tahun}>
                        {y.tahun} ({y.set_count} set {y.complete ? '✓' : ''})
                      </option>
                    ))
                  ) : (
                    [2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)
                  )}
                </Select>

                <Select
                  label="Tahun Sasaran (Salin Ke)"
                  value={copyForm.target_year}
                  onChange={(e) => setCopyForm({ ...copyForm, target_year: parseInt(e.target.value) })}
                >
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </Select>

                <Select
                  label="Tingkatan"
                  value={copyForm.tingkatan || ''}
                  onChange={(e) => setCopyForm({ ...copyForm, tingkatan: e.target.value ? parseInt(e.target.value) : null })}
                >
                  <option value="">Semua Tingkatan (T1-T5)</option>
                  {[1, 2, 3, 4, 5].map(t => <option key={t} value={t}>Tingkatan {t} sahaja</option>)}
                </Select>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  <p className="font-medium flex items-center gap-2">
                    <AlertCircle size={16} />
                    Nota:
                  </p>
                  <ul className="list-disc list-inside mt-1 text-xs space-y-1">
                    <li>Set yuran yang sudah wujud untuk tahun sasaran akan dilangkau</li>
                    <li>Anda boleh edit jumlah selepas salin</li>
                    <li>Item "Islam Sahaja" akan dikekalkan</li>
                  </ul>
                </div>
              </div>

              <div className="border-t p-6 bg-slate-50 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowCopyModal(false)}>
                  Batal
                </Button>
                <Button variant="secondary" className="flex-1" onClick={handleCopyFromYear} data-testid="copy-confirm-btn">
                  <Copy size={18} /> Salin & Edit
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SetYuranManagementPage;
