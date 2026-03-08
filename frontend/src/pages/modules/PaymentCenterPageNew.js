import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  ShoppingCart, Trash2, CreditCard, AlertCircle, Check, CheckCircle2,
  Bus, Package, Heart, Wallet, X, Plus, Minus,
  Receipt, Download, Eye, Sparkles, Clock, FileText,
  GraduationCap, Calendar, RefreshCw, ShoppingBag, ChevronDown,
  ChevronUp, CalendarClock, Coins, List, Award, School, 
  AlertTriangle, History, PartyPopper, BadgeCheck, TrendingUp
} from 'lucide-react';
import { useAuth } from '../../App';
import api from '../../services/api';
import { HelpManualLink } from '../../components/common';

// ============ CONSTANTS ============
import { TINGKATAN_LABELS, TINGKATAN_COLORS } from '../../constants';

// ============ UI COMPONENTS ============

const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-current border-t-transparent ${
    size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'
  }`} />
);

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-gradient-to-r from-teal-500 to-violet-500 hover:from-teal-600 hover:to-violet-600 text-white shadow-pastel-sm hover:shadow-pastel',
    secondary: 'bg-slate-800 hover:bg-slate-900 text-white',
    outline: 'border-2 border-teal-500 text-teal-600 hover:bg-pastel-mint/40',
    ghost: 'text-slate-600 hover:text-teal-600 hover:bg-slate-100',
    danger: 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-lg shadow-red-500/25',
    success: 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25',
    amber: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/25'
  };
  const sizes = { 
    sm: 'px-3 py-1.5 text-xs', 
    md: 'px-5 py-2.5 text-sm', 
    lg: 'px-6 py-3 text-base' 
  };
  return (
    <button 
      className={`font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : 'transform hover:-translate-y-0.5 active:scale-95'}`} 
      disabled={disabled || loading} 
      {...props}
    >
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-2xl border border-slate-200/60 shadow-xl shadow-slate-200/50 ${className}`} {...props}>
    {children}
  </div>
);

// ============ ITEM TYPE HELPERS ============
const getItemIcon = (type) => {
  switch (type) {
    case 'yuran': case 'yuran_partial': case 'yuran_installment': case 'yuran_two_payment': return <GraduationCap className="text-amber-500" size={20} />;
    case 'koperasi': return <Package className="text-lime-500" size={20} />;
    case 'bus': return <Bus className="text-cyan-500" size={20} />;
    case 'infaq': return <Heart className="text-pink-500" size={20} />;
    default: return <Wallet className="text-slate-400" size={20} />;
  }
};

const getItemColor = (type) => {
  switch (type) {
    case 'yuran': case 'yuran_partial': case 'yuran_installment': case 'yuran_two_payment': return 'bg-amber-50 border-amber-200';
    case 'koperasi': return 'bg-lime-50 border-lime-200';
    case 'bus': return 'bg-cyan-50 border-cyan-200';
    case 'infaq': return 'bg-pink-50 border-pink-200';
    default: return 'bg-slate-50 border-slate-200';
  }
};

const getItemLabel = (type) => {
  switch (type) {
    case 'yuran': return 'Yuran Penuh';
    case 'yuran_partial': return 'Bayaran Sebahagian Yuran';
    case 'yuran_installment': case 'yuran_two_payment': return '2 Bayaran';
    case 'koperasi': return 'Koperasi';
    case 'bus': return 'Tiket Bas';
    case 'infaq': return 'Tabung & Sumbangan';
    default: return 'Lain-lain';
  }
};

// ============ PAYMENT SLIDER PANEL ============
const PaymentSliderPanel = ({ 
  isOpen, 
  onClose, 
  selectedItem, 
  paymentOptions, 
  loadingOptions,
  onPayment,
  processingPayment
}) => {
  const [paymentType, setPaymentType] = useState('full');
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedTwoPaymentNumber, setSelectedTwoPaymentNumber] = useState(1);  // 1 or 2 for two_payments
  const [paymentMethod, setPaymentMethod] = useState('fpx');

  useEffect(() => {
    if (isOpen) {
      setPaymentType('full');
      setSelectedItems([]);
      setSelectedTwoPaymentNumber(1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (paymentType === 'two_payments' && paymentOptions?.payment_options?.two_payments?.options?.length) {
      const first = paymentOptions.payment_options.two_payments.options[0];
      if (first?.payment_number) setSelectedTwoPaymentNumber(first.payment_number);
    }
  }, [paymentType, paymentOptions?.payment_options?.two_payments?.options]);

  // Get unpaid items from category_breakdown (only applicable items)
  const getUnpaidItems = () => {
    if (!paymentOptions?.category_breakdown) return [];
    return paymentOptions.category_breakdown.filter(
      item => item.status !== 'paid' && item.balance > 0 && item.applicable !== false
    );
  };

  // Get ALL items including non-applicable ones for display
  const getAllItemsForDisplay = () => {
    if (!paymentOptions?.category_breakdown) return [];
    // Filter out paid items but show non-applicable items
    return paymentOptions.category_breakdown.filter(
      item => item.status !== 'paid' || item.applicable === false
    );
  };

  // Toggle item selection for category payment (only for applicable items)
  const toggleItemSelection = (itemCode, isApplicable = true) => {
    if (!isApplicable) return; // Don't allow selection of non-applicable items
    
    setSelectedItems(prev => {
      if (prev.includes(itemCode)) {
        return prev.filter(c => c !== itemCode);
      } else {
        return [...prev, itemCode];
      }
    });
  };

  // Select/Deselect all unpaid AND applicable items
  const selectAllItems = () => {
    const unpaidItems = getUnpaidItems();
    setSelectedItems(unpaidItems.filter(item => item.applicable !== false).map(item => item.code || item.name));
  };

  const deselectAllItems = () => {
    setSelectedItems([]);
  };

  // Calculate selected amount for category payment
  const getSelectedAmount = () => {
    if (!paymentOptions?.category_breakdown) return 0;
    return paymentOptions.category_breakdown
      .filter(item => selectedItems.includes(item.code || item.name))
      .reduce((sum, item) => sum + (item.balance || 0), 0);
  };

  const getPaymentAmount = () => {
    if (!paymentOptions) return 0;
    if (paymentType === 'full') return paymentOptions.outstanding || 0;
    if (paymentType === 'category') return getSelectedAmount();
    if (paymentType === 'two_payments') {
      const opts = paymentOptions.payment_options?.two_payments?.options || [];
      const opt = opts.find(o => o.payment_number === selectedTwoPaymentNumber);
      return opt ? opt.amount : 0;
    }
    return 0;
  };

  const handleConfirmPayment = () => {
    let selectedItemsDetails = [];
    if (paymentType === 'category' && paymentOptions?.category_breakdown) {
      selectedItemsDetails = paymentOptions.category_breakdown.filter(
        item => selectedItems.includes(item.code || item.name)
      );
    }
    onPayment({
      paymentType,
      paymentMethod,
      selectedItems: selectedItemsDetails,
      selectedTwoPaymentNumber: paymentType === 'two_payments' ? selectedTwoPaymentNumber : undefined,
      amount: getPaymentAmount()
    });
  };

  const unpaidItems = getUnpaidItems();

  return (
    <AnimatePresence>
      {isOpen && selectedItem && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-[60] flex flex-col"
            data-testid="payment-slider-panel"
          >
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-400 text-white flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Bayar Yuran</h3>
                    <p className="text-white/80 text-sm">{selectedItem?.studentName || 'Pelajar'}</p>
                    <Link to="/admin/manual-bendahari#pusat-bayaran-panel-slider" className="text-white/90 text-xs hover:underline mt-0.5 inline-block">Manual panel ini</Link>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loadingOptions ? (
                <div className="flex items-center justify-center h-48">
                  <div className="text-center">
                    <Spinner size="lg" />
                    <p className="mt-3 text-slate-500">Memuatkan pilihan...</p>
                  </div>
                </div>
              ) : paymentOptions && (
                <div className="p-4 space-y-4">
                  {/* Lock Warning */}
                  {paymentOptions.is_locked && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3"
                    >
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-800 text-sm">Kaedah Bayaran Dikunci</p>
                        <p className="text-xs text-amber-700">Sila selesaikan Bayaran 2 atau bayar mengikut kategori.</p>
                      </div>
                    </motion.div>
                  )}

                  {/* Outstanding Summary */}
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-slate-900 via-teal-900 to-violet-900"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
                    
                    <div className="relative z-10 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white/70">{selectedItem?.setName || 'Yuran Sekolah'}</p>
                        <p className="text-xs text-white/60 mt-0.5">
                          Tingkatan {paymentOptions.tingkatan || selectedItem?.tingkatan} • {paymentOptions.tahun || selectedItem?.tahun}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-white/70">Baki Tertunggak</p>
                        <p className="text-3xl font-bold text-white">
                          RM {paymentOptions.outstanding?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                    
                    {/* Progress */}
                    {paymentOptions.paid_amount > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <div className="flex justify-between text-xs text-white/70 mb-2">
                          <span>Progress Bayaran</span>
                          <span>{((paymentOptions.paid_amount / (paymentOptions.paid_amount + paymentOptions.outstanding)) * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(paymentOptions.paid_amount / (paymentOptions.paid_amount + paymentOptions.outstanding)) * 100}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full"
                          />
                        </div>
                      </div>
                    )}
                  </motion.div>

                  {/* Category Breakdown - Yuran Terperinci */}
                  {paymentOptions.category_breakdown && paymentOptions.category_breakdown.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-lg"
                    >
                      <div className="px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                        <h4 className="font-bold text-sm flex items-center gap-2">
                          <List className="w-4 h-4" />
                          Senarai Yuran Terperinci
                        </h4>
                        <p className="text-xs text-amber-100 mt-1">
                          Pecahan yuran mengikut kategori 
                          {paymentOptions.student_religion && (
                            <span className="ml-1">• Pelajar: {paymentOptions.student_religion}</span>
                          )}
                        </p>
                      </div>
                      <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                        {paymentOptions.category_breakdown.map((item, idx) => {
                          const isNotApplicable = item.applicable === false || item.status === 'not_applicable';
                          
                          return (
                            <div key={idx} className={`px-4 py-3 flex items-center justify-between transition-colors ${
                              isNotApplicable ? 'bg-slate-100/50 opacity-60' :
                              item.status === 'paid' ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                            }`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                  isNotApplicable ? 'bg-slate-200' :
                                  item.status === 'paid' ? 'bg-emerald-100' : 
                                  item.status === 'partial' ? 'bg-amber-100' : 'bg-red-100'
                                }`}>
                                  {isNotApplicable ? (
                                    <X className="w-5 h-5 text-slate-400" />
                                  ) : item.status === 'paid' ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                  ) : item.status === 'partial' ? (
                                    <Clock className="w-5 h-5 text-amber-600" />
                                  ) : (
                                    <AlertCircle className="w-5 h-5 text-red-500" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <span className={`text-sm font-semibold block ${isNotApplicable ? 'text-slate-400' : 'text-slate-800'}`}>
                                    {item.name}
                                    {item.islam_only && (
                                      <span className="ml-1.5 text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                        Islam
                                      </span>
                                    )}
                                  </span>
                                  {(item.category || item.sub_category) && (
                                    <p className={`text-xs font-medium truncate ${isNotApplicable ? 'text-slate-400' : 'text-teal-600'}`}>
                                      {item.category}{item.sub_category ? ` › ${item.sub_category}` : ''}
                                    </p>
                                  )}
                                  <p className={`text-xs mt-0.5 ${isNotApplicable ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Asal: RM {(item.original_amount || item.amount || 0).toFixed(2)}
                                    {item.paid_amount > 0 && ` • Dibayar: RM ${item.paid_amount.toFixed(2)}`}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0 ml-2">
                                {isNotApplicable ? (
                                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-200 text-slate-500 rounded-full text-xs font-bold">
                                    <X className="w-3 h-3" />
                                    TIDAK BERKAITAN
                                  </span>
                                ) : item.status === 'paid' ? (
                                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                                    <CheckCircle2 className="w-3 h-3" />
                                    LUNAS
                                  </span>
                                ) : item.status === 'partial' ? (
                                  <div>
                                    <p className="text-lg font-bold text-amber-600">
                                      RM {(item.balance || 0).toFixed(2)}
                                    </p>
                                    <p className="text-xs text-amber-500">Separa</p>
                                  </div>
                                ) : (
                                  <div>
                                    <p className="text-lg font-bold text-red-600">
                                      RM {(item.balance || item.original_amount || 0).toFixed(2)}
                                    </p>
                                    <p className="text-xs text-slate-500">Baki</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Summary Footer */}
                      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-600">
                          Jumlah Baki Tertunggak
                        </span>
                        <span className="text-lg font-bold text-red-600">
                          RM {paymentOptions.category_breakdown
                            .filter(c => c.status !== 'paid' && c.applicable !== false)
                            .reduce((sum, c) => sum + (c.balance || 0), 0)
                            .toFixed(2)}
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {/* Payment Type Selection */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <label className="block text-sm font-semibold text-slate-700 mb-3">Pilih Kaedah Bayaran</label>
                    <div className="space-y-2">
                      {/* Full Payment */}
                      {paymentOptions.payment_options?.full?.enabled !== false && (
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setPaymentType('full')}
                          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                            paymentType === 'full'
                              ? 'border-teal-500 bg-gradient-to-r from-pastel-mint to-pastel-lavender shadow-pastel'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                paymentType === 'full' ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-500'
                              }`}>
                                <Sparkles className="w-5 h-5" />
                              </div>
                              <div>
                                <span className={`font-semibold ${paymentType === 'full' ? 'text-teal-700' : 'text-slate-700'}`}>
                                  Bayar Penuh
                                </span>
                                <p className="text-xs text-slate-500">Jelaskan semua baki sekaligus</p>
                              </div>
                            </div>
                            <span className={`text-lg font-bold ${paymentType === 'full' ? 'text-teal-700' : 'text-slate-600'}`}>
                              RM {paymentOptions.outstanding?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </motion.button>
                      )}

                      {/* Category Payment - Show if there are unpaid items */}
                      {unpaidItems.length > 0 && (
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setPaymentType('category')}
                          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                            paymentType === 'category'
                              ? 'border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 shadow-lg shadow-amber-500/20'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                paymentType === 'category' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
                              }`}>
                                <Award className="w-5 h-5" />
                              </div>
                              <div>
                                <span className={`font-semibold ${paymentType === 'category' ? 'text-amber-700' : 'text-slate-700'}`}>
                                  Bayar Mengikut Kategori
                                </span>
                                <p className="text-xs text-slate-500">Pilih item yuran tertentu ({unpaidItems.length} item belum bayar)</p>
                              </div>
                            </div>
                            {paymentType === 'category' && selectedItems.length > 0 && (
                              <span className="text-lg font-bold text-amber-700">
                                RM {getSelectedAmount().toFixed(2)}
                              </span>
                            )}
                          </div>
                        </motion.button>
                      )}

                      {/* Installment Payment */}
                      {paymentOptions.payment_options?.two_payments?.enabled && (
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setPaymentType('two_payments')}
                          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                            paymentType === 'two_payments'
                              ? 'border-emerald-500 bg-gradient-to-r from-emerald-50 to-teal-50 shadow-lg shadow-emerald-500/20'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                              paymentType === 'two_payments' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                              <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                              <span className={`font-semibold ${paymentType === 'two_payments' ? 'text-emerald-700' : 'text-slate-700'}`}>
                                2 Bayaran
                              </span>
                              <p className="text-xs text-slate-500">
                                {paymentOptions.payment_options.two_payments.description || 'Bayar dalam 2 kali (sebelum bulan 10)'}
                              </p>
                            </div>
                          </div>
                        </motion.button>
                      )}
                    </div>
                  </motion.div>

                  {/* Category Selection - Item Checkboxes */}
                  <AnimatePresence>
                    {paymentType === 'category' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3 overflow-hidden"
                      >
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-semibold text-slate-700">
                            Pilih Item Untuk Dibayar
                            {paymentOptions?.student_religion && (
                              <span className="ml-2 text-xs font-normal text-slate-500">
                                (Agama: {paymentOptions.student_religion})
                              </span>
                            )}
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={selectAllItems}
                              className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                            >
                              Pilih Semua
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              onClick={deselectAllItems}
                              className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                            >
                              Nyah Pilih
                            </button>
                          </div>
                        </div>
                        
                        {/* Show all items including non-applicable ones */}
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {paymentOptions?.category_breakdown?.filter(item => item.status !== 'paid').map((item, idx) => {
                            const itemKey = item.code || item.name;
                            const isSelected = selectedItems.includes(itemKey);
                            const isNotApplicable = item.applicable === false || item.status === 'not_applicable';
                            const isDisabled = isNotApplicable || item.balance <= 0;
                            
                            return (
                              <motion.div
                                key={idx}
                                whileHover={!isDisabled ? { scale: 1.01 } : {}}
                                onClick={() => !isDisabled && toggleItemSelection(itemKey, !isNotApplicable)}
                                className={`p-3 rounded-xl border-2 transition-all ${
                                  isDisabled 
                                    ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
                                    : isSelected
                                      ? 'border-amber-500 bg-amber-50 shadow-md shadow-amber-500/20 cursor-pointer'
                                      : 'border-slate-200 hover:border-amber-300 bg-white cursor-pointer'
                                }`}
                                data-testid={`item-checkbox-${itemKey}`}
                              >
                                <div className="flex items-center gap-3">
                                  {/* Checkbox */}
                                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                    isDisabled
                                      ? 'bg-slate-200 border-slate-300'
                                      : isSelected
                                        ? 'bg-amber-500 border-amber-500'
                                        : 'border-slate-300 bg-white'
                                  }`}>
                                    {isSelected && !isDisabled && <Check className="w-3 h-3 text-white" />}
                                    {isDisabled && <X className="w-3 h-3 text-slate-400" />}
                                  </div>
                                  
                                  {/* Item Info */}
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-semibold ${
                                      isDisabled ? 'text-slate-400' : isSelected ? 'text-amber-800' : 'text-slate-700'
                                    }`}>
                                      {item.name}
                                      {item.islam_only && (
                                        <span className="ml-1.5 text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                          Islam
                                        </span>
                                      )}
                                    </p>
                                    {(item.category || item.sub_category) && (
                                      <p className={`text-xs truncate ${isDisabled ? 'text-slate-400' : 'text-teal-600'}`}>
                                        {item.category}{item.sub_category ? ` › ${item.sub_category}` : ''}
                                      </p>
                                    )}
                                    {isNotApplicable && (
                                      <p className="text-xs text-slate-400 mt-0.5 italic">
                                        Tidak berkaitan dengan pelajar ini
                                      </p>
                                    )}
                                  </div>
                                  
                                  {/* Amount / Status */}
                                  <div className="text-right flex-shrink-0">
                                    {isNotApplicable ? (
                                      <span className="text-xs px-2 py-1 bg-slate-200 text-slate-500 rounded-full font-medium">
                                        N/A
                                      </span>
                                    ) : (
                                      <p className={`text-sm font-bold ${
                                        isDisabled ? 'text-slate-400' : isSelected ? 'text-amber-700' : 'text-red-600'
                                      }`}>
                                        RM {(item.balance || 0).toFixed(2)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>

                        {/* Selected Summary */}
                        {selectedItems.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-4 text-white shadow-lg shadow-amber-500/30"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-amber-100 text-sm">{selectedItems.length} item dipilih</p>
                                <p className="text-2xl font-bold mt-1">
                                  RM {getSelectedAmount().toFixed(2)}
                                </p>
                              </div>
                              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                                <Award className="w-6 h-6" />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Pilihan Bayaran 1 atau 2 */}
                  <AnimatePresence>
                    {paymentType === 'two_payments' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3 overflow-hidden"
                      >
                        <label className="block text-sm font-semibold text-slate-700">Pilih Bayaran</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(paymentOptions.payment_options?.two_payments?.options || []).map((opt) => (
                            <motion.button
                              key={opt.payment_number}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setSelectedTwoPaymentNumber(opt.payment_number)}
                              className={`py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                                selectedTwoPaymentNumber === opt.payment_number
                                  ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                                  : 'border-slate-200 hover:border-emerald-300 text-slate-600 bg-white'
                              }`}
                            >
                              {opt.label || `Bayaran ${opt.payment_number}`}
                            </motion.button>
                          ))}
                        </div>
                        {(paymentOptions.payment_options?.two_payments?.options || []).length > 0 && (() => {
                          const opt = paymentOptions.payment_options.two_payments.options.find(o => o.payment_number === selectedTwoPaymentNumber);
                          const amt = opt ? opt.amount : 0;
                          return (
                            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-5 text-white text-center shadow-lg shadow-emerald-500/30">
                              <p className="text-sm text-emerald-100">Bayaran {selectedTwoPaymentNumber}/2</p>
                              <p className="text-3xl font-bold mt-1">RM {Number(amt).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</p>
                            </div>
                          );
                        })()}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Payment Method */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <label className="block text-sm font-semibold text-slate-700 mb-3">Kaedah Pembayaran</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'fpx', label: 'FPX Online', icon: '🏦', desc: 'Bank Transfer' },
                        { value: 'card', label: 'Kad Kredit', icon: '💳', desc: 'Visa/Master' },
                        { value: 'qr', label: 'DuitNow QR', icon: '🔲', desc: 'Scan & Pay' }
                      ].map((method) => (
                        <motion.button
                          key={method.value}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setPaymentMethod(method.value)}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${
                            paymentMethod === method.value
                              ? 'border-teal-500 bg-pastel-mint/50 shadow-pastel'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <span className="text-2xl">{method.icon}</span>
                          <p className={`text-sm font-semibold mt-1 ${paymentMethod === method.value ? 'text-teal-700' : 'text-slate-700'}`}>
                            {method.label}
                          </p>
                          <p className="text-xs text-slate-500">{method.desc}</p>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>

                  {/* Payment Summary */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-gradient-to-br from-teal-500 via-violet-500 to-fuchsia-400 rounded-2xl p-5 text-white shadow-pastel"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white/80 text-sm">Jumlah Bayaran</p>
                        <p className="text-3xl font-bold mt-1">
                          RM {getPaymentAmount().toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-white/80 text-sm">
                          {paymentType === 'full' && 'Bayaran Penuh'}
                          {paymentType === 'category' && `${selectedItems.length} item dipilih`}
                          {paymentType === 'two_payments' && `Bayaran ${selectedTwoPaymentNumber}/2`}
                        </p>
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mt-2 ml-auto">
                          <CreditCard className="w-6 h-6" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </div>

            {/* Footer - Always Visible */}
            <div className="border-t p-4 flex gap-3 bg-slate-50 flex-shrink-0">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Batal
              </Button>
              <Button 
                variant="primary" 
                className="flex-1" 
                onClick={handleConfirmPayment} 
                loading={processingPayment}
                disabled={loadingOptions || (paymentType === 'category' && selectedItems.length === 0)}
                data-testid="confirm-payment-btn"
              >
                <ShoppingCart className="w-4 h-4" />
                Masuk Troli
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ============ YURAN CARD COMPONENT ============
const YuranCard = ({ yuran, onOpenPayment }) => {
  const [expanded, setExpanded] = useState(false);
  const outstanding = yuran.amount || 0;
  const progressPercent = ((yuran.paid_amount || 0) / (yuran.original_amount || 1)) * 100;
  const colors = TINGKATAN_COLORS[yuran.tingkatan] || TINGKATAN_COLORS[1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden border border-slate-100"
      data-testid={`yuran-card-${yuran.item_id}`}
    >
      {/* Card Header */}
      <div className={`relative overflow-hidden bg-gradient-to-r ${colors.bg} p-5 text-white`}>
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
        <div className="absolute right-16 top-12 w-8 h-8 rounded-full bg-white/20" />
        
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                <GraduationCap className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold">{yuran.student_name || yuran.name}</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium">
                    {TINGKATAN_LABELS[yuran.tingkatan] || `Tingkatan ${yuran.tingkatan}`}
                  </span>
                  <span className="text-white/70 text-xs">{yuran.tahun}</span>
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <p className="text-white/70 text-xs">Baki</p>
              <p className="text-2xl font-bold">
                RM {outstanding.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-white/80">Progress Bayaran</span>
              <span className="font-semibold">{progressPercent.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progressPercent, 100)}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-white rounded-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-slate-500">{yuran.description}</p>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className="text-emerald-600">
                Dibayar: RM {(yuran.paid_amount || 0).toFixed(2)}
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">
                Jumlah: RM {(yuran.original_amount || 0).toFixed(2)}
              </span>
            </div>
          </div>
          
          <Button
            variant="primary"
            onClick={() => onOpenPayment(yuran)}
            data-testid={`pay-btn-${yuran.item_id}`}
          >
            <CreditCard className="w-4 h-4" />
            Bayar
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

// ============ MAIN COMPONENT ============
const PaymentCenterPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  // Initialize activeTab from URL query param or default to 'yuran'
  const getInitialTab = () => {
    const tabParam = searchParams.get('tab');
    // Map 'troli' to 'cart' for internal use
    if (tabParam === 'troli') return 'cart';
    if (['yuran', 'two_payments', 'infaq', 'receipts', 'cart'].includes(tabParam)) return tabParam;
    return 'yuran';
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab);
  
  // Update URL when tab changes
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    // Map 'cart' back to 'troli' for URL
    const urlTab = tabId === 'cart' ? 'troli' : tabId;
    setSearchParams({ tab: urlTab }, { replace: true });
  };
  
  // Cart state
  const [cart, setCart] = useState({ items: [], total_amount: 0, item_count: 0 });
  
  // Pending items state
  const [pendingItems, setPendingItems] = useState({
    yuran: [],
    yuran_detailed: [],
    two_payments: [],
    koperasi: [],
    bus: [],
    infaq: []
  });
  
  // Payment Panel State
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [selectedYuran, setSelectedYuran] = useState(null);
  const [paymentOptions, setPaymentOptions] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  
  // Expanded yuran for detailed view
  const [expandedYuran, setExpandedYuran] = useState({});
  const [selectedItems, setSelectedItems] = useState({});
  
  // Receipt state
  const [receipts, setReceipts] = useState([]);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  
  // Infaq amount/slots input
  const [infaqInputs, setInfaqInputs] = useState({});

  const authContext = useAuth();
  const user = authContext?.user;

  // ============ DATA FETCHING ============
  const fetchCart = useCallback(async () => {
    try {
      const res = await api.get('/api/payment-center/cart');
      setCart(res.data);
    } catch (err) {
      console.error('Failed to fetch cart:', err);
    }
  }, []);

  const fetchPendingItems = useCallback(async () => {
    try {
      const res = await api.get('/api/payment-center/pending-items');
      setPendingItems(res.data);
    } catch (err) {
      console.error('Failed to fetch pending items:', err);
    }
  }, []);

  const fetchReceipts = useCallback(async () => {
    try {
      const res = await api.get('/api/payment-center/receipts?limit=20');
      setReceipts(res.data.receipts || []);
    } catch (err) {
      console.error('Failed to fetch receipts:', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchCart(), fetchPendingItems(), fetchReceipts()]);
      setLoading(false);
    };
    loadData();
  }, [fetchCart, fetchPendingItems, fetchReceipts]);

  // ============ PAYMENT PANEL ACTIONS ============
  const openPaymentPanel = async (yuran) => {
    setSelectedYuran(yuran);
    setShowPaymentPanel(true);
    setLoadingOptions(true);
    
    try {
      // Try to fetch payment options from yuran API
      const res = await api.get(`/api/yuran/anak-saya/${yuran.item_id}/payment-options`);
      
      // Also get yuran_detailed to show item breakdown
      const yuranDetailData = pendingItems.yuran_detailed?.find(
        y => y.yuran_id === yuran.item_id
      );
      
      // Build category breakdown from yuran_detailed if available
      let enhancedOptions = { ...res.data };
      
      // Use ALL items from yuran_detailed (including paid ones) for complete picture
      if (yuranDetailData?.items && yuranDetailData.items.length > 0) {
        // Show items individually (no grouping) for clearer display
        const itemsList = yuranDetailData.items.map(item => ({
          name: item.name,
          code: item.code || item.name.replace(/\s+/g, '_').toLowerCase(),
          category: item.category || '',
          sub_category: item.sub_category || '',
          original_amount: item.amount || 0,
          paid_amount: item.paid_amount || 0,
          balance: item.balance || (item.amount - (item.paid_amount || 0)),
          status: item.status || (item.balance <= 0 ? 'paid' : (item.paid_amount > 0 ? 'partial' : 'pending')),
          islam_only: item.islam_only || false,
          applicable: item.applicable !== false  // Default to true if not specified
        }));
        
        enhancedOptions.category_breakdown = itemsList;
        enhancedOptions.student_religion = yuranDetailData.student_religion || yuran.student_religion || 'Islam';
      }
      
      setPaymentOptions(enhancedOptions);
    } catch (err) {
      console.error('Failed to fetch payment options:', err);
      // Fallback to basic options
      setPaymentOptions({
        outstanding: yuran.amount,
        paid_amount: yuran.paid_amount || 0,
        tingkatan: yuran.tingkatan,
        tahun: yuran.tahun,
        payment_options: {
          full: { enabled: true, amount: yuran.amount },
          category: { enabled: false, categories: [] },
          two_payments: { enabled: false, max_payments: 2, options: [] }
        }
      });
    } finally {
      setLoadingOptions(false);
    }
  };

  const handlePaymentFromPanel = async (paymentData) => {
    if (!selectedYuran) return;
    
    setProcessingPayment(true);
    try {
      // Add to cart based on payment type
      let itemType = 'yuran';
      let metadata = {};
      
      if (paymentData.paymentType === 'category') {
        itemType = 'yuran_partial';
        metadata = {
          selected_items: paymentData.selectedItems.map(item => ({
            code: item.code || item.name,
            name: item.name,
            category: item.category,
            sub_category: item.sub_category,
            amount: item.balance || item.original_amount
          }))
        };
      } else if (paymentData.paymentType === 'two_payments') {
        itemType = 'yuran_two_payment';
        metadata = {
          payment_number: paymentData.selectedTwoPaymentNumber,
          max_payments: 2
        };
      }

      // Add to cart
      const res = await api.post('/api/payment-center/cart/add', {
        item_type: itemType,
        item_id: selectedYuran.item_id,
        quantity: 1,
        metadata
      });
      
      setCart(res.data.cart);
      toast.success('Item ditambah ke troli!');
      setShowPaymentPanel(false);
      setActiveTab('cart');
      
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menambah item');
    } finally {
      setProcessingPayment(false);
    }
  };

  // ============ CART ACTIONS ============
  const addToCart = async (itemType, itemId, metadata = {}) => {
    try {
      const res = await api.post('/api/payment-center/cart/add', {
        item_type: itemType,
        item_id: itemId,
        quantity: 1,
        metadata
      });
      setCart(res.data.cart);
      toast.success('Item ditambah ke troli!');
      setActiveTab('cart');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menambah item');
    }
  };

  const addSelectedItemsToCart = async (yuranId) => {
    const codes = selectedItems[yuranId] || [];
    if (codes.length === 0) {
      toast.error('Sila pilih sekurang-kurangnya satu item');
      return;
    }
    
    try {
      const res = await api.post('/api/payment-center/cart/add-items', {
        yuran_id: yuranId,
        item_codes: codes
      });
      setCart(res.data.cart);
      setSelectedItems(prev => ({ ...prev, [yuranId]: [] }));
      toast.success('Item yuran ditambah ke troli!');
      setActiveTab('cart');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menambah item');
    }
  };

  const addTwoPaymentToCart = async (yuranId) => {
    try {
      const res = await api.post('/api/payment-center/cart/add-two-payment', {
        yuran_id: yuranId
      });
      setCart(res.data.cart);
      toast.success('Bayaran 2 kali ditambah ke troli!');
      setActiveTab('cart');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menambah bayaran');
    }
  };

  const removeFromCart = async (cartItemId) => {
    try {
      const res = await api.delete(`/api/payment-center/cart/remove/${cartItemId}`);
      setCart(res.data.cart);
      toast.success('Item dibuang dari troli');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal membuang item');
    }
  };

  const updateQuantity = async (cartItemId, quantity) => {
    try {
      const res = await api.put(`/api/payment-center/cart/update/${cartItemId}?quantity=${quantity}`);
      setCart(res.data.cart);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal mengemas kini kuantiti');
    }
  };

  const clearCart = async () => {
    try {
      const res = await api.delete('/api/payment-center/cart/clear');
      setCart(res.data.cart);
      toast.success('Troli dikosongkan');
    } catch (err) {
      toast.error('Gagal mengosongkan troli');
    }
  };

  // ============ CHECKOUT ============
  const handleCheckout = async () => {
    if (cart.items.length === 0) {
      toast.error('Troli kosong!');
      return;
    }

    setProcessing(true);
    try {
      const res = await api.post('/api/payment-center/checkout', {
        payment_method: 'fpx_mock'
      });

      toast.success('Pembayaran berjaya!', {
        description: `No. Resit: ${res.data.receipt.receipt_number}`
      });

      setSelectedReceipt(res.data.receipt);
      setShowReceiptModal(true);

      await Promise.all([fetchCart(), fetchPendingItems(), fetchReceipts()]);

    } catch (err) {
      toast.error(err.response?.data?.detail || 'Pembayaran gagal');
    } finally {
      setProcessing(false);
    }
  };

  // ============ ITEM SELECTION FOR PARTIAL PAYMENT ============
  const toggleItemSelection = (yuranId, itemCode) => {
    setSelectedItems(prev => {
      const current = prev[yuranId] || [];
      if (current.includes(itemCode)) {
        return { ...prev, [yuranId]: current.filter(c => c !== itemCode) };
      } else {
        return { ...prev, [yuranId]: [...current, itemCode] };
      }
    });
  };

  const selectAllItems = (yuranId, items) => {
    const allCodes = items.map(i => i.code);
    setSelectedItems(prev => ({ ...prev, [yuranId]: allCodes }));
  };

  const deselectAllItems = (yuranId) => {
    setSelectedItems(prev => ({ ...prev, [yuranId]: [] }));
  };

  // ============ RECEIPT ACTIONS ============
  const viewReceipt = async (receiptId) => {
    try {
      const res = await api.get(`/api/payment-center/receipts/${receiptId}`);
      setSelectedReceipt(res.data);
      setShowReceiptModal(true);
    } catch (err) {
      toast.error('Gagal memuatkan resit');
    }
  };

  const downloadReceiptPdf = async (receiptId, receiptNumber) => {
    try {
      const res = await api.get(`/api/payment-center/receipts/${receiptId}/pdf`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `resit_${receiptNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('PDF dimuat turun');
    } catch (err) {
      toast.error('Gagal memuat turun PDF');
    }
  };

  // ============ CHECK IF ITEM IN CART ============
  const isInCart = (itemId, itemType) => {
    return cart.items.some(item => item.item_id === itemId && item.item_type === itemType);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-500 font-medium">Memuatkan Pusat Bayaran...</p>
        </div>
      </div>
    );
  }

  // Calculate selected amount for partial payment
  const getSelectedAmount = (yuranId, items) => {
    const codes = selectedItems[yuranId] || [];
    return items.filter(i => codes.includes(i.code)).reduce((sum, i) => sum + i.balance, 0);
  };

  // Calculate totals
  const totalOutstanding = (pendingItems.yuran || []).reduce((sum, y) => sum + (y.amount || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pastel-mint/20 to-pastel-lavender/20" data-testid="payment-center-page">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-14 h-14 bg-gradient-to-br from-teal-500 via-violet-500 to-fuchsia-400 rounded-2xl flex items-center justify-center shadow-pastel"
              >
                <Wallet className="text-white" size={28} />
              </motion.div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-heading">
                  Pusat Bayaran
                </h1>
                <p className="text-sm text-slate-500">Bayar semua yuran dalam satu tempat</p>
                <HelpManualLink sectionId="pusat-bayaran" label="Manual bahagian ini" className="mt-1 inline-block text-teal-600" />
              </div>
            </div>
            
            {/* Quick Stats */}
            <div className="hidden md:flex items-center gap-6">
              <div className="text-right">
                <p className="text-xs text-slate-500">Jumlah Tertunggak</p>
                <p className="text-xl font-bold text-red-600">
                  RM {totalOutstanding.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="h-10 w-px bg-slate-200" />
              <Button variant="ghost" size="sm" onClick={() => { fetchCart(); fetchPendingItems(); }}>
                <RefreshCw size={16} /> Muat Semula
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-5 overflow-x-auto pb-2 scrollbar-hide">
            {[
              { id: 'yuran', label: 'Yuran Saya', icon: GraduationCap, count: pendingItems.yuran?.length || 0, color: 'amber' },
              { id: 'two_payments', label: '2 Bayaran', icon: CalendarClock, count: pendingItems.two_payments?.length || 0, color: 'purple' },
              { id: 'infaq', label: 'Tabung', icon: Heart, count: pendingItems.infaq?.length || 0, color: 'pink' },
              { id: 'receipts', label: 'Resit', icon: Receipt, count: receipts.length, color: 'slate' },
              { id: 'cart', label: 'Troli', icon: ShoppingCart, count: cart.item_count, color: 'indigo' }
            ].map(tab => (
              <motion.button
                key={tab.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? `bg-gradient-to-r from-${tab.color}-500 to-${tab.color}-600 text-white shadow-lg shadow-${tab.color}-500/30` 
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                }`}
                data-testid={`tab-${tab.id}`}
              >
                <tab.icon size={18} />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {/* ============ YURAN TAB ============ */}
          {activeTab === 'yuran' && (
            <motion.div
              key="yuran"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {(pendingItems.yuran?.length || 0) === 0 ? (
                <Card className="p-12 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/30"
                  >
                    <CheckCircle2 className="text-white" size={48} />
                  </motion.div>
                  <h3 className="text-2xl font-bold text-slate-800 mb-2">Tahniah!</h3>
                  <p className="text-slate-500">Tiada yuran tertunggak. Semua yuran telah dijelaskan.</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {pendingItems.yuran.map((yuran, index) => (
                    <YuranCard 
                      key={yuran.item_id} 
                      yuran={yuran} 
                      onOpenPayment={openPaymentPanel}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ============ CART TAB ============ */}
          {activeTab === 'cart' && (
            <motion.div
              key="cart"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid lg:grid-cols-3 gap-6"
            >
              {/* Cart Items */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <ShoppingCart className="text-teal-600" size={22} />
                      Troli Anda ({cart.item_count} item)
                    </h2>
                    {cart.items.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearCart}>
                        <Trash2 size={14} /> Kosongkan
                      </Button>
                    )}
                  </div>

                  {cart.items.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ShoppingBag className="text-slate-400" size={40} />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-700 mb-2">Troli Kosong</h3>
                      <p className="text-slate-500 mb-6">Pilih item dari tab Yuran Saya atau Tabung</p>
                      <Button variant="outline" onClick={() => setActiveTab('yuran')}>
                        Lihat Yuran Tertunggak
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.items.map((item, index) => (
                        <motion.div
                          key={item.cart_item_id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className={`p-4 rounded-xl border-2 ${getItemColor(item.item_type)}`}
                        >
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                              {getItemIcon(item.item_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    {getItemLabel(item.item_type)}
                                  </span>
                                  <h4 className="font-bold text-slate-800 mt-1">{item.name}</h4>
                                  
                                  {/* For yuran_partial, show items as listing */}
                                  {item.item_type === 'yuran_partial' && item.metadata?.selected_items ? (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-xs font-medium text-slate-600">Senarai Bayaran:</p>
                                      <ul className="text-sm text-slate-600 space-y-0.5">
                                        {item.metadata.selected_items.map((subItem, idx) => (
                                          <li key={idx} className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full flex-shrink-0"></span>
                                            <span>{subItem.name}</span>
                                            <span className="text-slate-400 ml-auto text-xs">RM {subItem.amount?.toFixed(2)}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : item.description && (
                                    <p className="text-sm text-slate-500 mt-1">{item.description}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => removeFromCart(item.cart_item_id)}
                                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  data-testid={`remove-item-${item.cart_item_id}`}
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                              
                              <div className="flex items-center justify-between mt-3">
                                {['koperasi', 'bus'].includes(item.item_type) ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => updateQuantity(item.cart_item_id, Math.max(1, item.quantity - 1))}
                                      className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm hover:shadow-md transition-all"
                                    >
                                      <Minus size={14} />
                                    </button>
                                    <span className="w-10 text-center font-bold">{item.quantity}</span>
                                    <button
                                      onClick={() => updateQuantity(item.cart_item_id, item.quantity + 1)}
                                      className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm hover:shadow-md transition-all"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-sm text-slate-500">
                                    {item.item_type === 'yuran_partial' 
                                      ? `${item.metadata?.selected_items?.length || 0} item dipilih`
                                      : 'Kuantiti: 1'
                                    }
                                  </span>
                                )}
                                <div className="text-right">
                                  <p className="text-xl font-bold text-teal-600">
                                    RM {(item.amount * item.quantity).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* Checkout Summary */}
              <div className="lg:col-span-1">
                <div className="sticky top-32">
                  <Card className="p-6 bg-gradient-to-br from-teal-500 via-violet-500 to-fuchsia-400 text-white overflow-hidden relative shadow-pastel">
                    <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full" />
                    <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-white/10 rounded-full" />
                    
                    <div className="relative z-10">
                      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <CreditCard size={22} />
                        Ringkasan Bayaran
                      </h3>

                      <div className="space-y-3 mb-6">
                        {Object.entries(
                          cart.items.reduce((acc, item) => {
                            const label = getItemLabel(item.item_type);
                            acc[label] = (acc[label] || 0) + (item.amount * item.quantity);
                            return acc;
                          }, {})
                        ).map(([label, amount]) => (
                          <div key={label} className="flex justify-between text-white/80">
                            <span>{label}</span>
                            <span className="font-medium">RM {amount.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-white/20 pt-4 mb-6">
                        <div className="flex justify-between text-2xl font-bold">
                          <span>Jumlah</span>
                          <span>RM {cart.total_amount.toFixed(2)}</span>
                        </div>
                      </div>

                      <button
                        className="w-full px-6 py-3 text-base font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-red-500/25 hover:shadow-emerald-500/25 disabled:opacity-60 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:scale-95"
                        onClick={handleCheckout}
                        disabled={cart.items.length === 0 || processing}
                        data-testid="checkout-btn"
                      >
                        {processing ? (
                          <>
                            <div className="animate-spin rounded-full border-2 border-current border-t-transparent w-4 h-4" />
                            Memproses...
                          </>
                        ) : (
                          <>
                            <CreditCard size={18} />
                            Bayar Sekarang
                          </>
                        )}
                      </button>

                      <div className="mt-4 p-3 bg-white/10 rounded-xl text-center backdrop-blur">
                        <p className="text-xs text-white/70">
                          <AlertCircle className="inline mr-1" size={12} />
                          SIMULASI - Pembayaran sebenar tidak diproses
                        </p>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </motion.div>
          )}

          {/* ============ 2 BAYARAN TAB ============ */}
          {activeTab === 'two_payments' && (
            <motion.div
              key="two_payments"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <CalendarClock className="text-violet-500" size={22} />
                  2 Bayaran
                </h2>
                <p className="text-sm text-slate-500 mb-6">Yuran yang boleh dibayar dalam 2 kali (sebelum bulan 10)</p>

                {(pendingItems.two_payments?.length || 0) === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CalendarClock className="text-slate-400" size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-slate-700 mb-2">Tiada Yuran 2 Bayaran</h3>
                    <p className="text-slate-500">Tiada yuran layak untuk 2 bayaran pada masa ini (atau sudah lepas bulan 9)</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {pendingItems.two_payments.map((item, index) => {
                      const plan = item.two_payment_plan || {};
                      const nextNum = plan.next_payment_number || 1;
                      const nextAmt = plan.next_payment_amount ?? item.balance;
                      const progress = ((plan.payments_made || 0) / (plan.max_payments || 2)) * 100;

                      return (
                        <motion.div
                          key={item.yuran_id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="p-5 bg-gradient-to-br from-pastel-lavender to-pastel-rose border-2 border-pastel-lilac rounded-2xl"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-bold text-slate-800">{item.student_name}</h4>
                              <p className="text-sm text-slate-500">{item.set_name}</p>
                            </div>
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-violet-500 text-white">
                              Bayaran {nextNum}/2
                            </span>
                          </div>

                          <div className="space-y-2 mb-4">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-500">Progress:</span>
                              <span className="text-violet-600 font-semibold">{plan.payments_made || 0}/{plan.max_payments || 2}</span>
                            </div>
                            <div className="flex justify-between font-bold">
                              <span className="text-slate-700">Bayaran Seterusnya:</span>
                              <span className="text-violet-600">RM {Number(nextAmt).toFixed(2)}</span>
                            </div>
                          </div>

                          <div className="mb-4">
                            <div className="h-2.5 bg-pastel-lavender rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-400 rounded-full"
                              />
                            </div>
                          </div>

                          <Button
                            variant={isInCart(item.yuran_id, 'yuran_two_payment') ? 'ghost' : 'primary'}
                            size="sm"
                            className="w-full"
                            onClick={() => addTwoPaymentToCart(item.yuran_id)}
                            disabled={isInCart(item.yuran_id, 'yuran_two_payment')}
                          >
                            {isInCart(item.yuran_id, 'yuran_two_payment') ? (
                              <><Check size={16} /> Dalam Troli</>
                            ) : (
                              <><Coins size={16} /> Bayar {nextNum}/2 - RM {Number(nextAmt).toFixed(2)}</>
                            )}
                          </Button>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {/* ============ INFAQ/TABUNG TAB ============ */}
          {activeTab === 'infaq' && (
            <motion.div
              key="infaq"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <Heart className="text-pink-500" size={22} />
                  Tabung & Sumbangan
                </h2>
                <p className="text-sm text-slate-500 mb-6">Kempen infaq dan sumbangan aktif</p>

                {(pendingItems.infaq?.length || 0) === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Heart className="text-slate-400" size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-slate-700 mb-2">Tiada Kempen Aktif</h3>
                    <p className="text-slate-500">Kempen akan dipaparkan di sini apabila aktif</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {pendingItems.infaq.map((campaign, index) => {
                      const isSlot = campaign.campaign_type === 'slot';
                      
                      return (
                        <motion.div
                          key={campaign.item_id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="p-5 bg-gradient-to-br from-pink-50 to-rose-50 border-2 border-pink-200 rounded-2xl"
                        >
                          {campaign.is_featured && (
                            <div className="flex items-center gap-1 text-xs font-bold text-pink-600 mb-2">
                              <Sparkles size={14} /> Pilihan Utama
                            </div>
                          )}
                          <h4 className="font-bold text-slate-800 mb-2">{campaign.name}</h4>
                          <p className="text-sm text-slate-500 mb-4 line-clamp-2">{campaign.description}</p>

                          <div className="mb-4">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-500">Terkumpul</span>
                              <span className="font-semibold text-pink-600">
                                {isSlot 
                                  ? `${campaign.slots_sold}/${campaign.total_slots} slot`
                                  : `RM ${campaign.collected_amount?.toFixed(2)} / RM ${campaign.target_amount?.toFixed(2)}`
                                }
                              </span>
                            </div>
                            <div className="h-2.5 bg-pink-200 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, campaign.progress_percent || 0)}%` }}
                                className="h-full bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"
                              />
                            </div>
                          </div>

                          {/* Input for amount/slots */}
                          {isSlot ? (
                            <div className="mb-4">
                              <label className="text-sm font-semibold text-slate-700 mb-2 block">Bilangan Slot:</label>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setInfaqInputs(prev => ({ 
                                    ...prev, 
                                    [campaign.item_id]: Math.max(1, (prev[campaign.item_id]?.slots || 1) - 1)
                                  }))}
                                  className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm hover:shadow-md"
                                >
                                  <Minus size={16} />
                                </button>
                                <span className="w-16 text-center font-bold text-lg">
                                  {infaqInputs[campaign.item_id]?.slots || 1}
                                </span>
                                <button
                                  onClick={() => setInfaqInputs(prev => ({ 
                                    ...prev, 
                                    [campaign.item_id]: Math.min(campaign.slots_available, (prev[campaign.item_id]?.slots || 1) + 1)
                                  }))}
                                  className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm hover:shadow-md"
                                >
                                  <Plus size={16} />
                                </button>
                                <span className="text-sm text-slate-500 ml-2">
                                  × RM {campaign.price_per_slot?.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="mb-4">
                              <label className="text-sm font-semibold text-slate-700 mb-2 block">Pilih Jumlah:</label>
                              <div className="flex flex-wrap gap-2">
                                {(campaign.suggested_amounts || [10, 20, 50, 100]).map(amt => (
                                  <button
                                    key={amt}
                                    onClick={() => setInfaqInputs(prev => ({ 
                                      ...prev, 
                                      [campaign.item_id]: { amount: amt }
                                    }))}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                      infaqInputs[campaign.item_id]?.amount === amt
                                        ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/30'
                                        : 'bg-white text-slate-600 hover:bg-pink-100 border border-slate-200'
                                    }`}
                                  >
                                    RM {amt}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full bg-gradient-to-r from-pink-500 to-rose-500"
                            onClick={() => {
                              if (isSlot) {
                                const slots = infaqInputs[campaign.item_id]?.slots || 1;
                                addToCart('infaq', campaign.item_id, { 
                                  slots,
                                  price_per_slot: campaign.price_per_slot,
                                  amount: slots * campaign.price_per_slot
                                });
                              } else {
                                addToCart('infaq', campaign.item_id, { 
                                  amount: infaqInputs[campaign.item_id]?.amount || 10 
                                });
                              }
                            }}
                            data-testid={`add-infaq-${campaign.item_id}`}
                          >
                            <Heart size={16} /> 
                            {isSlot 
                              ? `Infaq ${infaqInputs[campaign.item_id]?.slots || 1} Slot (RM ${((infaqInputs[campaign.item_id]?.slots || 1) * campaign.price_per_slot).toFixed(2)})`
                              : `Infaq RM ${infaqInputs[campaign.item_id]?.amount || 10}`
                            }
                          </Button>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {/* ============ RECEIPTS TAB ============ */}
          {activeTab === 'receipts' && (
            <motion.div
              key="receipts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Receipt className="text-teal-500" size={22} />
                  Sejarah Resit Pembayaran
                </h2>

                {receipts.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="text-slate-400" size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-slate-700 mb-2">Tiada Resit</h3>
                    <p className="text-slate-500">Resit pembayaran akan dipaparkan selepas pembayaran berjaya</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {receipts.map((receipt, index) => (
                      <motion.div
                        key={receipt.receipt_id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-pastel-mint rounded-xl flex items-center justify-center">
                            <Receipt className="text-teal-600" size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{receipt.receipt_number}</p>
                            <p className="text-sm text-slate-500">
                              {new Date(receipt.payment_date).toLocaleDateString('ms-MY', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                              {' • '}
                              {receipt.item_count} item
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold text-teal-600 text-lg">RM {receipt.total_amount.toFixed(2)}</p>
                            <p className={`text-xs font-semibold ${
                              receipt.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'
                            }`}>
                              {receipt.status === 'completed' ? 'Selesai' : receipt.status}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => viewReceipt(receipt.receipt_id)}
                              className="p-2 text-slate-500 hover:text-teal-600 hover:bg-pastel-mint/50 rounded-lg transition-colors"
                              data-testid={`view-receipt-${receipt.receipt_id}`}
                            >
                              <Eye size={18} />
                            </button>
                            <button
                              onClick={() => downloadReceiptPdf(receipt.receipt_id, receipt.receipt_number)}
                              className="p-2 text-slate-500 hover:text-teal-600 hover:bg-pastel-mint/50 rounded-lg transition-colors"
                              data-testid={`download-receipt-${receipt.receipt_id}`}
                            >
                              <Download size={18} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Payment Slider Panel */}
      <PaymentSliderPanel
        isOpen={showPaymentPanel}
        onClose={() => setShowPaymentPanel(false)}
        selectedItem={selectedYuran}
        paymentOptions={paymentOptions}
        loadingOptions={loadingOptions}
        onPayment={handlePaymentFromPanel}
        processingPayment={processingPayment}
      />

      {/* ============ RECEIPT MODAL ============ */}
      <AnimatePresence>
        {showReceiptModal && selectedReceipt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
            onClick={() => setShowReceiptModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Receipt Header */}
              <div className="bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-400 p-6 text-white text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3"
                >
                  <CheckCircle2 size={40} />
                </motion.div>
                <h3 className="text-xl font-bold mb-1">Pembayaran Berjaya!</h3>
                <p className="text-white/80 text-sm">{selectedReceipt.receipt_number}</p>
              </div>

              {/* Receipt Body */}
              <div className="p-6">
                {/* Organization Info */}
                {selectedReceipt.organization && (
                  <div className="text-center mb-6 pb-6 border-b border-slate-200">
                    <h4 className="font-bold text-slate-800">{selectedReceipt.organization.name}</h4>
                    <p className="text-sm text-slate-500">{selectedReceipt.organization.address}</p>
                    <p className="text-sm text-slate-500">{selectedReceipt.organization.phone}</p>
                  </div>
                )}

                {/* Payment Info */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Tarikh</p>
                    <p className="font-semibold text-slate-800">
                      {new Date(selectedReceipt.payment_date).toLocaleDateString('ms-MY')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Kaedah</p>
                    <p className="font-semibold text-slate-800">{selectedReceipt.payment_method?.toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Pembayar</p>
                    <p className="font-semibold text-slate-800">{selectedReceipt.payer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
                    <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                      Selesai
                    </span>
                  </div>
                </div>

                {/* Items */}
                <div className="mb-6">
                  <h5 className="font-bold text-slate-800 mb-3">Butiran Pembayaran</h5>
                  <div className="space-y-2">
                    {selectedReceipt.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between py-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          {getItemIcon(item.item_type)}
                          <div>
                            <p className="font-medium text-slate-800">{item.name}</p>
                            {item.quantity > 1 && (
                              <p className="text-xs text-slate-500">× {item.quantity}</p>
                            )}
                          </div>
                        </div>
                        <p className="font-bold text-slate-800">
                          RM {(item.amount * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total */}
                <div className="bg-pastel-mint/50 rounded-xl p-4 flex justify-between items-center mb-6">
                  <span className="font-bold text-teal-800">Jumlah Keseluruhan</span>
                  <span className="text-2xl font-bold text-teal-600">
                    RM {selectedReceipt.total_amount?.toFixed(2)}
                  </span>
                </div>

                {/* Simulation Notice */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center mb-6">
                  <p className="text-sm text-amber-700 font-semibold">
                    SIMULASI - Pembayaran sebenar tidak diproses
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowReceiptModal(false)}
                  >
                    Tutup
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => downloadReceiptPdf(selectedReceipt.receipt_id, selectedReceipt.receipt_number)}
                  >
                    <Download size={16} /> Muat Turun PDF
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PaymentCenterPage;
