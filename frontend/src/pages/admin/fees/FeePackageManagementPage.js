import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  GraduationCap, Plus, Edit, Trash2, X, FileText, Receipt
} from 'lucide-react';
import api from '../../../services/api';

// Simple Components
const Spinner = ({ size = 'md' }) => <div className={`spinner ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>;

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-primary-700 hover:bg-primary-900 text-white shadow-sm hover:shadow-md',
    secondary: 'bg-secondary-600 hover:bg-amber-700 text-white',
    outline: 'border-2 border-primary-700 text-primary-700 hover:bg-primary-50',
    ghost: 'text-slate-600 hover:text-primary-700 hover:bg-slate-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`font-medium rounded-lg transition-all btn-click flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Select = ({ label, error, children, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <select className={`flex h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-700 focus:ring-offset-2 ${error ? 'border-red-500' : 'border-slate-200'}`} {...props}>{children}</select>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Card = ({ children, className = '', hover = false, ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden ${hover ? 'card-hover cursor-pointer' : ''} ${className}`} {...props}>{children}</div>
);

const Badge = ({ status, children, className = '' }) => {
  const styles = { approved: 'bg-emerald-100 text-emerald-800', pending: 'bg-amber-100 text-amber-800', rejected: 'bg-red-100 text-red-800', paid: 'bg-emerald-100 text-emerald-800', partial: 'bg-blue-100 text-blue-800', overdue: 'bg-red-100 text-red-800', active: 'bg-emerald-100 text-emerald-800', inactive: 'bg-red-100 text-red-800' };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'} ${className}`}>{children}</span>;
};

const FORM_LABELS = {
  1: 'Tingkatan 1',
  2: 'Tingkatan 2',
  3: 'Tingkatan 3',
  4: 'Tingkatan 4',
  5: 'Tingkatan 5'
};

export const FeePackageManagementPage = () => {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [expandedPackage, setExpandedPackage] = useState(null);

  const fetchPackages = async () => {
    try {
      const res = await api.get(`/api/fee-packages?year=${selectedYear}`);
      setPackages(res.data);
    } catch (err) {
      toast.error('Gagal memuatkan pakej yuran');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPackages(); }, [selectedYear]);

  const handleDelete = async (packageId) => {
    if (!window.confirm('Adakah anda pasti mahu padam pakej ini?')) return;
    try {
      await api.delete(`/api/fee-packages/${packageId}`);
      toast.success('Pakej berjaya dipadam');
      fetchPackages();
    } catch (err) {
      toast.error('Gagal memadam pakej');
    }
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="fee-package-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Pengurusan Pakej Yuran</h1>
          <p className="text-slate-600 mt-1">Konfigurasi pakej yuran mengikut tingkatan dan tahun</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} data-testid="year-filter">
            {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Button onClick={() => setShowAddModal(true)} data-testid="add-package-btn">
            <Plus size={18} /> Tambah Pakej
          </Button>
        </div>
      </div>

      {/* Package Overview Cards */}
      <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map(form => {
          const pkg = packages.find(p => p.form === form);
          return (
            <Card 
              key={form} 
              className={`cursor-pointer transition-all hover:shadow-lg ${pkg ? 'border-emerald-200 bg-emerald-50' : 'border-dashed border-slate-300 bg-slate-50'}`}
              onClick={() => pkg && setExpandedPackage(expandedPackage === pkg.id ? null : pkg.id)}
            >
              <div className="text-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${pkg ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                  <GraduationCap size={24} />
                </div>
                <h3 className="font-semibold text-slate-800">{FORM_LABELS[form]}</h3>
                {pkg ? (
                  <>
                    <p className="text-lg font-bold text-emerald-600 mt-1">RM {pkg.total_amount.toFixed(2)}</p>
                    <Badge status="active" className="mt-2">Aktif</Badge>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 mt-2">Belum dikonfigurasi</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Expanded Package Details */}
      {expandedPackage && (
        <Card className="animate-fadeIn">
          {(() => {
            const pkg = packages.find(p => p.id === expandedPackage);
            if (!pkg) return null;
            return (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{pkg.name}</h2>
                    <p className="text-slate-500">{FORM_LABELS[pkg.form]} - Tahun {pkg.year}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingPackage(pkg)}>
                      <Edit size={16} /> Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(pkg.id)}>
                      <Trash2 size={16} /> Padam
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  {pkg.categories.map((cat, catIdx) => (
                    <div key={catIdx} className="border rounded-lg overflow-hidden">
                      <div className="bg-primary-50 px-4 py-3 flex items-center justify-between">
                        <h3 className="font-semibold text-primary-800">{cat.name}</h3>
                        <span className="text-sm font-medium text-primary-600">
                          RM {cat.sub_categories.reduce((sum, sub) => sum + sub.items.reduce((s, i) => s + i.amount, 0), 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="divide-y">
                        {cat.sub_categories.map((sub, subIdx) => (
                          <div key={subIdx} className="px-4 py-3">
                            <p className="font-medium text-slate-700 mb-2">{sub.name}</p>
                            <div className="space-y-1 pl-4">
                              {sub.items.map((item, itemIdx) => (
                                <div key={itemIdx} className="flex items-center justify-between text-sm">
                                  <span className="text-slate-600">
                                    <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded mr-2">{item.code}</span>
                                    {item.name}
                                    {!item.mandatory && <span className="ml-2 text-xs text-amber-600">(Pilihan)</span>}
                                  </span>
                                  <span className="font-medium text-slate-800">RM {item.amount.toFixed(2)}</span>
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
                  <span className="text-2xl font-bold text-primary-700">RM {pkg.total_amount.toFixed(2)}</span>
                </div>
              </>
            );
          })()}
        </Card>
      )}

      {loading && <div className="flex items-center justify-center h-32"><Spinner size="lg" /></div>}

      {!loading && packages.length === 0 && (
        <Card className="text-center py-12">
          <FileText className="mx-auto text-slate-300" size={48} />
          <h3 className="mt-4 text-lg font-medium text-slate-700">Tiada pakej yuran</h3>
          <p className="text-slate-500 mt-2">Sila tambah pakej yuran untuk tahun {selectedYear}</p>
        </Card>
      )}

      {/* Add/Edit Slide-in Panel */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowAddModal(false)} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2"><Receipt size={24} />Tambah Pakej Yuran</h3>
                  <button onClick={() => setShowAddModal(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition" aria-label="Tutup"><X size={24} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <p className="text-slate-600 text-sm">
                  Untuk menambah pakej yuran baru, sila gunakan API endpoint atau hubungi pentadbir sistem.
                </p>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Endpoint:</strong> POST /api/fee-packages<br/>
                    <strong>Role:</strong> SuperAdmin atau Bendahari
                  </p>
                </div>
              </div>
              <div className="border-t p-6 bg-white">
                <Button variant="outline" className="w-full" onClick={() => setShowAddModal(false)}>Tutup</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FeePackageManagementPage;
