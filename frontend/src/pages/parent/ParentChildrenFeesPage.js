import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Users, CreditCard, GraduationCap, Check, ChevronRight, X
} from 'lucide-react';
import api from '../../services/api';

// ===================== SHARED COMPONENTS =====================

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

const Input = ({ label, error, icon: Icon, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <div className="relative">
      {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon size={18} /></div>}
      <input className={`flex h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${Icon ? 'pl-10' : ''} ${error ? 'border-red-500' : 'border-slate-200'}`} {...props} />
    </div>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

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

const Badge = ({ status, children }) => {
  const styles = { approved: 'bg-emerald-100 text-emerald-800', pending: 'bg-amber-100 text-amber-800', rejected: 'bg-red-100 text-red-800', paid: 'bg-emerald-100 text-emerald-800', partial: 'bg-blue-100 text-blue-800', overdue: 'bg-red-100 text-red-800', active: 'bg-emerald-100 text-emerald-800', inactive: 'bg-red-100 text-red-800' };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

// ===================== PARENT CHILDREN FEES PAGE =====================

export const ParentChildrenFeesPage = () => {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChild, setSelectedChild] = useState(null);
  const [childFees, setChildFees] = useState([]);
  const [expandedFee, setExpandedFee] = useState(null);
  const [selectedFee, setSelectedFee] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('fpx');
  const [processing, setProcessing] = useState(false);

  const fetchChildren = useCallback(async () => {
    try {
      const res = await api.get('/api/parent/children-fees');
      setChildren(res.data);
      setSelectedChild(prev => {
        if (res.data.length > 0 && !prev) return res.data[0];
        return prev;
      });
    } catch (err) {
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchChildFees = async (studentId) => {
    try {
      const res = await api.get('/api/fees');
      const filtered = res.data.filter(f => f.student_id === studentId);
      setChildFees(filtered);
    } catch (err) {
      console.error('Failed to fetch fees');
    }
  };

  useEffect(() => { fetchChildren(); }, [fetchChildren]);
  useEffect(() => { 
    if (selectedChild) fetchChildFees(selectedChild.student_id); 
  }, [selectedChild]);

  const handlePayment = async () => {
    if (!selectedFee || !paymentAmount) return;
    setProcessing(true);
    try {
      await api.post('/api/payments', { fee_id: selectedFee.id, amount: parseFloat(paymentAmount), payment_method: paymentMethod });
      toast.success('Pembayaran berjaya!');
      setSelectedFee(null);
      setPaymentAmount('');
      fetchChildren();
      if (selectedChild) fetchChildFees(selectedChild.student_id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Pembayaran gagal');
    } finally {
      setProcessing(false);
    }
  };

  const getCategoryColor = (category) => {
    if (category.toUpperCase() === 'MUAFAKAT') return 'bg-pastel-lavender text-violet-600 border-pastel-lilac';
    if (category.toUpperCase() === 'KOPERASI') return 'bg-blue-100 text-blue-600 border-blue-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="parent-fees-page">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 font-heading">Yuran Anak Saya</h1>
        <p className="text-slate-600 mt-1">Lihat dan bayar yuran untuk semua anak anda</p>
      </div>

      {children.length === 0 ? (
        <Card className="text-center py-12">
          <Users className="mx-auto text-slate-300" size={48} />
          <h3 className="mt-4 text-lg font-medium text-slate-700">Tiada anak berdaftar</h3>
          <p className="text-slate-500 mt-2">Sila daftar anak anda terlebih dahulu</p>
        </Card>
      ) : (
        <>
          {/* Children Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {children.map(child => (
              <Card 
                key={child.student_id}
                className={`cursor-pointer transition-all hover:shadow-lg ${selectedChild?.student_id === child.student_id ? 'ring-2 ring-primary-500 border-primary-300' : ''}`}
                onClick={() => setSelectedChild(child)}
                data-testid={`child-card-${child.student_id}`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-primary-100 to-primary-200 rounded-xl flex items-center justify-center">
                    <GraduationCap className="text-primary-600" size={28} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">{child.student_name}</h3>
                    <p className="text-sm text-slate-500">{child.matric_number}</p>
                    <p className="text-xs text-slate-400 mt-1">Tingkatan {child.form} {child.class_name}</p>
                  </div>
                </div>
                
                {/* Progress Circle */}
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Jumlah Yuran</p>
                    <p className="text-lg font-bold text-slate-800">RM {child.total_fees.toFixed(2)}</p>
                  </div>
                  <div className="relative w-16 h-16">
                    <svg className="w-16 h-16 transform -rotate-90">
                      <circle cx="32" cy="32" r="28" stroke="#e2e8f0" strokeWidth="8" fill="none" />
                      <circle 
                        cx="32" cy="32" r="28" 
                        stroke={child.progress_percent === 100 ? '#10b981' : '#0d9488'} 
                        strokeWidth="8" 
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 28}`}
                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - child.progress_percent / 100)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold text-slate-700">{child.progress_percent}%</span>
                    </div>
                  </div>
                </div>

                {/* Status Bar */}
                <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm">
                  <span className="text-emerald-600">Dibayar: RM {child.paid_amount.toFixed(2)}</span>
                  <span className="text-amber-600">Baki: RM {(child.total_fees - child.paid_amount).toFixed(2)}</span>
                </div>
              </Card>
            ))}
          </div>

          {/* Selected Child's Fees Detail */}
          {selectedChild && (
            <Card className="animate-fadeIn">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Senarai Yuran: {selectedChild.student_name}</h2>
                  <p className="text-slate-500">Tingkatan {selectedChild.form} {selectedChild.class_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">Baki Belum Bayar</p>
                  <p className="text-2xl font-bold text-amber-600">RM {(selectedChild.total_fees - selectedChild.paid_amount).toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-4">
                {childFees.map(fee => (
                  <div key={fee.id} className={`border rounded-xl overflow-hidden ${getCategoryColor(fee.category)}`}>
                    <div className="p-4 bg-white">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-slate-900">{fee.category}</h3>
                          <p className="text-sm text-slate-500">{fee.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-slate-900">RM {fee.amount.toFixed(2)}</p>
                          {fee.paid_amount > 0 && (
                            <p className="text-sm text-emerald-600">Dibayar: RM {fee.paid_amount.toFixed(2)}</p>
                          )}
                          <Badge status={fee.status} className="mt-1">
                            {fee.status === 'paid' ? 'Selesai' : fee.status === 'partial' ? 'Separa' : 'Belum Bayar'}
                          </Badge>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-3">
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all ${fee.status === 'paid' ? 'bg-emerald-500' : 'bg-primary-500'}`}
                            style={{ width: `${(fee.paid_amount / fee.amount) * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* Sub-items Toggle */}
                      {fee.sub_items && fee.sub_items.length > 0 && (
                        <button 
                          onClick={() => setExpandedFee(expandedFee === fee.id ? null : fee.id)}
                          className="mt-3 text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1"
                        >
                          <ChevronRight size={16} className={`transition-transform ${expandedFee === fee.id ? 'rotate-90' : ''}`} />
                          {expandedFee === fee.id ? 'Sembunyikan' : `Lihat ${fee.sub_items.length} item pecahan`}
                        </button>
                      )}

                      {/* Expanded Sub-items */}
                      {expandedFee === fee.id && fee.sub_items && (
                        <div className="mt-3 pt-3 border-t space-y-2">
                          {fee.sub_items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs bg-slate-200 px-1.5 py-0.5 rounded">{item.code}</span>
                                <span className="text-slate-700">{item.description}</span>
                                {item.paid && <Check size={14} className="text-emerald-500" />}
                              </div>
                              <span className="font-medium text-slate-900">RM {item.amount.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Pay Button */}
                      {fee.status !== 'paid' && (
                        <div className="mt-4 flex justify-end">
                          <Button 
                            size="sm" 
                            onClick={() => { setSelectedFee(fee); setPaymentAmount((fee.amount - fee.paid_amount).toFixed(2)); }}
                            data-testid={`pay-btn-${fee.id}`}
                          >
                            <CreditCard size={16} /> Bayar Sekarang
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Payment Slide-in Panel */}
      <AnimatePresence>
        {selectedFee && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setSelectedFee(null)} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2"><CreditCard size={24} />Pembayaran Yuran</h3>
                  <button onClick={() => setSelectedFee(null)} className="p-2 hover:bg-white/20 rounded-lg transition"><X size={24} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-600">{selectedFee.category}</p>
                  <p className="font-medium text-slate-800">{selectedFee.description}</p>
                  <p className="text-lg font-bold text-slate-900 mt-1">Baki: RM {(selectedFee.amount - selectedFee.paid_amount).toFixed(2)}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[50, 100, selectedFee.amount - selectedFee.paid_amount].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setPaymentAmount(Math.min(amt, selectedFee.amount - selectedFee.paid_amount).toFixed(2))}
                      className={`py-2 px-3 text-sm rounded-lg border transition-all ${
                        parseFloat(paymentAmount) === Math.min(amt, selectedFee.amount - selectedFee.paid_amount)
                          ? 'bg-primary-600 text-white border-primary-600' 
                          : 'bg-white text-slate-700 border-slate-200 hover:border-primary-300'
                      }`}
                    >
                      RM {Math.min(amt, selectedFee.amount - selectedFee.paid_amount).toFixed(2)}
                    </button>
                  ))}
                </div>
                <Input label="Jumlah Bayaran (RM)" type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required />
                <Select label="Kaedah Pembayaran" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="fpx">FPX Online Banking</option>
                  <option value="card">Kad Kredit/Debit</option>
                </Select>
                <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
                  <strong>Nota:</strong> Ini adalah pembayaran demo (MOCKED).
                </div>
              </div>
              <div className="border-t p-6 bg-white flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setSelectedFee(null)}>Batal</Button>
                <Button className="flex-1" onClick={handlePayment} loading={processing}>Bayar RM {paymentAmount}</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ParentChildrenFeesPage;
