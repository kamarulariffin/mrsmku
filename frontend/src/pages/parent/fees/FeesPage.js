import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { CreditCard, FileText, Heart, Building, ChevronRight, X } from 'lucide-react';
import { api } from '../../../services/api';
import { Card, Button, Input, Select, Badge, Spinner } from '../../../components/common';
import { useAuth } from '../../../App';

const toNum = (v) => (v != null && v !== '' ? Number(v) : 0) || 0;

export const FeesPage = () => {
  const { user } = useAuth();
  const isPelajar = user?.role === 'pelajar';
  const [fees, setFees] = useState([]);
  const [feeStructure, setFeeStructure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFee, setSelectedFee] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('fpx');
  const [processing, setProcessing] = useState(false);
  const [expandedFee, setExpandedFee] = useState(null);

  const fetchFees = async () => {
    try {
      const [feesRes, structureRes] = await Promise.all([
        api.get('/api/fees'),
        api.get('/api/fees/structure?year=2026')
      ]);
      const list = Array.isArray(feesRes.data) ? feesRes.data : [];
      setFees(list);
      setFeeStructure(structureRes.data || null);
    } catch (err) {
      const msg = err.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : 'Gagal memuatkan data yuran');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFees(); }, []);

  const handlePayment = async () => {
    if (!selectedFee || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Sila masukkan jumlah yang sah');
      return;
    }
    setProcessing(true);
    try {
      await api.post('/api/payments', { fee_id: selectedFee.id, amount, payment_method: paymentMethod });
      toast.success('Pembayaran berjaya!');
      setSelectedFee(null);
      setPaymentAmount('');
      fetchFees();
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(Array.isArray(d) ? d.map((x) => x.msg || x.loc?.join('.')).join(', ') : (typeof d === 'string' ? d : 'Pembayaran gagal'));
    } finally {
      setProcessing(false);
    }
  };

  const getCategoryIcon = (category) => {
    const c = (category || '').toString().toUpperCase();
    if (c === 'MUAFAKAT') return Heart;
    if (c === 'KOPERASI') return Building;
    return CreditCard;
  };

  const getCategoryColor = (category) => {
    const c = (category || '').toString().toLowerCase();
    if (c === 'muafakat') return 'bg-pastel-lavender text-violet-600';
    if (c === 'koperasi') return 'bg-blue-100 text-blue-600';
    return 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="fees-page">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 font-heading">Yuran</h1>
        <p className="text-slate-600 mt-1">Senarai yuran dan status pembayaran</p>
      </div>
      
      {/* Fee Structure Info Card */}
      {feeStructure && (feeStructure.packages?.length > 0 || feeStructure.grand_total != null) && (
        <Card className="bg-gradient-to-r from-primary-50 to-blue-50 border-primary-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
              <FileText className="text-primary-600" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-primary-900">Struktur Yuran MRSMKU {feeStructure.year ?? ''}</h3>
              <p className="text-sm text-primary-700 mt-1">
                Jumlah Keseluruhan: <span className="font-bold">RM {(Number(feeStructure.grand_total) || 0).toFixed(2)}</span>/tahun
              </p>
              {feeStructure.note && (
                <p className="text-xs text-amber-700 mt-2 bg-amber-50 inline-block px-2 py-1 rounded">
                  {feeStructure.note}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
      ) : fees.length === 0 ? (
        <Card className="text-center py-12">
          <CreditCard className="mx-auto text-slate-300" size={48} />
          <h3 className="mt-4 text-lg font-medium text-slate-700">Tiada yuran</h3>
          <p className="text-slate-500 mt-2">
            {isPelajar ? 'Yuran akan dijana oleh pentadbir. Sila semak semula nanti.' : 'Yuran akan dijana selepas anak anda disahkan.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {fees.map((fee) => {
            const amount = toNum(fee.amount);
            const paidAmount = toNum(fee.paid_amount);
            const balance = Math.max(0, amount - paidAmount);
            const progressPercent = amount > 0 ? Math.min(100, (paidAmount / amount) * 100) : 0;
            const IconComponent = getCategoryIcon(fee.category);
            const colorClass = getCategoryColor(fee.category);
            const isExpanded = expandedFee === fee.id;
            const subItems = fee.sub_items && Array.isArray(fee.sub_items) ? fee.sub_items : [];

            return (
              <Card key={fee.id} className="animate-fadeIn overflow-hidden">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClass}`}>
                      <IconComponent size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-slate-900">{fee.description || 'Yuran'}</h3>
                        <Badge status={fee.status}>{fee.status === 'paid' ? 'Selesai' : fee.status === 'partial' ? 'Separa' : 'Belum Bayar'}</Badge>
                      </div>
                      {!isPelajar && fee.student_name && <p className="text-sm text-slate-500 mt-1">{fee.student_name}</p>}
                      <p className="text-xs text-slate-400 mt-1">Tarikh Akhir: {fee.due_date ? new Date(fee.due_date).toLocaleDateString('ms-MY') : '—'}</p>
                      <div className="mt-3 w-full max-w-[16rem] sm:w-64 min-w-0">
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                          <span>Kemajuan Pembayaran</span>
                          <span>{progressPercent.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${fee.status === 'paid' ? 'bg-emerald-500' : 'bg-primary-500'}`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-slate-900">RM {amount.toFixed(2)}</p>
                    {paidAmount > 0 && <p className="text-sm text-emerald-600">Dibayar: RM {paidAmount.toFixed(2)}</p>}
                    {balance > 0 && <p className="text-sm text-amber-600">Baki: RM {balance.toFixed(2)}</p>}
                  </div>
                </div>
                {subItems.length > 0 && (
                  <button
                    onClick={() => setExpandedFee(isExpanded ? null : fee.id)}
                    className="mt-4 min-h-[44px] text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1"
                  >
                    <ChevronRight size={16} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    {isExpanded ? 'Sembunyikan pecahan' : `Lihat ${subItems.length} pecahan bayaran`}
                  </button>
                )}
                {isExpanded && subItems.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="grid gap-2">
                      {subItems.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg text-sm">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${item.paid ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <span className="text-slate-700">{item.description || '—'}</span>
                          </div>
                          <span className="font-medium text-slate-900">RM {(toNum(item.amount)).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {fee.status !== 'paid' && balance > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                    <Button size="sm" onClick={() => { setSelectedFee(fee); setPaymentAmount(balance.toFixed(2)); }} data-testid={`pay-fee-${fee.id}`}>
                      <CreditCard size={16} />Bayar Sekarang
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
          <Card className="bg-slate-50 border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Jumlah Keseluruhan Yuran</p>
                <p className="text-2xl font-bold text-slate-900">RM {fees.reduce((sum, f) => sum + toNum(f.amount), 0).toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-600">Baki Belum Bayar</p>
                <p className="text-2xl font-bold text-amber-600">RM {fees.reduce((sum, f) => sum + Math.max(0, toNum(f.amount) - toNum(f.paid_amount)), 0).toFixed(2)}</p>
              </div>
            </div>
          </Card>
        </div>
      )}
      
      {/* Payment Slide-in Panel */}
      <AnimatePresence>
        {selectedFee && (() => {
          const selAmount = toNum(selectedFee.amount);
          const selPaid = toNum(selectedFee.paid_amount);
          const selBalance = Math.max(0, selAmount - selPaid);
          return (
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
                    <button type="button" onClick={() => setSelectedFee(null)} className="min-w-[44px] min-h-[44px] p-2 hover:bg-white/20 rounded-lg transition"><X size={24} /></button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">{selectedFee.description || 'Yuran'}</p>
                    <p className="text-lg font-bold text-slate-900 mt-1">Baki: RM {selBalance.toFixed(2)}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[50, 100, selBalance].filter((a) => Number.isFinite(a) && a > 0).slice(0, 3).map((amt) => {
                      const val = Math.min(amt, selBalance);
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setPaymentAmount(val.toFixed(2))}
                          className={`min-h-[44px] py-2 px-3 text-sm rounded-lg border transition-all ${
                            parseFloat(paymentAmount) === val ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-700 border-slate-200 hover:border-primary-300'
                          }`}
                        >
                          RM {val.toFixed(2)}
                        </button>
                      );
                    })}
                  </div>
                  <Input label="Jumlah Bayaran (RM)" type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} max={selBalance} min={0} required data-testid="payment-amount" />
                  <Select label="Kaedah Pembayaran" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} data-testid="payment-method">
                    <option value="fpx">FPX Online Banking</option>
                    <option value="card">Kad Kredit/Debit</option>
                  </Select>
                  <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
                    <strong>Nota:</strong> Ini adalah pembayaran demo. Tiada transaksi sebenar.
                  </div>
                </div>
                <div className="border-t p-6 bg-white flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setSelectedFee(null)}>Batal</Button>
                  <Button className="flex-1" onClick={handlePayment} loading={processing} data-testid="confirm-payment">Bayar RM {paymentAmount || '0.00'}</Button>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

export default FeesPage;
