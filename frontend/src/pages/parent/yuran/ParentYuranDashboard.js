import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  GraduationCap, CheckCircle2, AlertCircle, Clock,
  ChevronDown, ChevronUp, CreditCard, AlertTriangle, Calendar,
  History, Sparkles, Award, PartyPopper, Wallet,
  BadgeCheck, CircleDollarSign, ArrowRight, School, ShoppingCart
} from 'lucide-react';
import api from '../../../services/api';
import NotificationBell from '../../../components/common/NotificationBell';
import { useCart } from '../../../context/CartContext';
import { TINGKATAN_LABELS, TINGKATAN_COLORS } from '../../../constants';
import getUserFriendlyError from '../../../utils/errorMessages';

const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-teal-200 border-t-teal-500 ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-6 h-6'}`}></div>
);

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-gradient-to-r from-teal-500 to-violet-500 hover:from-teal-600 hover:to-violet-600 text-white shadow-pastel-sm hover:shadow-pastel',
    secondary: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/25',
    outline: 'border-2 border-teal-500 text-teal-600 hover:bg-pastel-mint/40',
    ghost: 'text-slate-600 hover:text-teal-600 hover:bg-slate-100',
    danger: 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-lg shadow-red-500/25',
    success: 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25'
  };
  const sizes = { sm: 'px-4 py-2 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : 'transform hover:-translate-y-0.5'}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const STATUS_LABELS = {
  paid: 'Selesai',
  partial: 'Separuh Bayar',
  pending: 'Belum Bayar'
};

const parseDueDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const getDueDateInfo = (dueDateValue) => {
  const dueDate = parseDueDate(dueDateValue);
  if (!dueDate) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDue = new Date(dueDate);
  startOfDue.setHours(0, 0, 0, 0);
  const daysToDue = Math.floor((startOfDue.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
  return { dueDate, daysToDue };
};

const getDueBadgeStyle = (daysToDue) => {
  if (daysToDue < 0) return 'bg-red-100 text-red-700';
  if (daysToDue <= 7) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

const getDueBadgeLabel = (daysToDue) => {
  if (daysToDue < 0) return `${Math.abs(daysToDue)} hari lewat`;
  if (daysToDue === 0) return 'Hari ini';
  if (daysToDue <= 7) return `${daysToDue} hari lagi`;
  return `${daysToDue} hari lagi`;
};

// Congrats Card - Tiada Tunggakan
const CongratsCard = ({ childName, tingkatan, tahun }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-6 text-white shadow-xl"
  >
    {/* Decorative elements */}
    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
    <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
    <div className="absolute top-4 right-4">
      <motion.div
        animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
      >
        <PartyPopper className="w-8 h-8 text-yellow-300" />
      </motion.div>
    </div>
    
    <div className="relative z-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
          <Award className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold">Tahniah!</h3>
          <p className="text-emerald-100 text-sm">Tiada Tunggakan Tahun Lepas</p>
        </div>
      </div>
      
      <div className="bg-white/20 backdrop-blur rounded-xl p-4 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-100 text-sm">Anak</p>
            <p className="font-semibold text-lg">{childName}</p>
          </div>
          <div className="text-right">
            <p className="text-emerald-100 text-sm">{TINGKATAN_LABELS[tingkatan]}</p>
            <p className="font-semibold">Tahun {tahun}</p>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mt-4 text-emerald-100">
        <BadgeCheck className="w-5 h-5" />
        <span className="text-sm">Semua yuran tahun sebelumnya telah dijelaskan</span>
      </div>
    </div>
  </motion.div>
);

// Outstanding Card - Ada Tunggakan
const OutstandingCard = ({ tingkatan, tahun, outstanding, onPay, isInCart }) => {
  const colors = TINGKATAN_COLORS[tingkatan] || TINGKATAN_COLORS[1];
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-xl border-2 ${colors.border} ${colors.light} p-4`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colors.bg} flex items-center justify-center text-white shadow-md`}>
            <School className="w-5 h-5" />
          </div>
          <div>
            <h4 className={`font-bold ${colors.text}`}>{TINGKATAN_LABELS[tingkatan]}</h4>
            <p className="text-slate-500 text-sm">Tahun {tahun}</p>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-slate-500 text-xs">Tunggakan</p>
          <p className="text-xl font-bold text-red-600">
            RM {outstanding?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>
      
      {onPay && (
        <button
          onClick={onPay}
          className={`mt-3 w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-opacity ${
            isInCart
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90'
              : `bg-gradient-to-r ${colors.bg} text-white hover:opacity-90`
          }`}
        >
          {isInCart ? (
            <>
              <ShoppingCart className="w-4 h-4" />
              Sudah Masuk Ke Troli.
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4" />
              Bayar Sekarang
            </>
          )}
        </button>
      )}
    </motion.div>
  );
};

// Child Fee Card - Kad utama setiap anak
const ChildFeeCard = ({ child, onPayment, isYuranInCart, nearestDue }) => {
  const [expanded, setExpanded] = useState(false);
  const outstanding = child.total_outstanding || 0;
  const progressPercent = child.progress_percent || 0;
  const hasNoOutstanding = outstanding <= 0;
  const colors = TINGKATAN_COLORS[child.current_form] || TINGKATAN_COLORS[1];
  
  // Group outstanding by tingkatan
  const outstandingByTingkatan = child.outstanding_by_tingkatan || [];
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden border border-slate-100"
      data-testid={`child-fee-card-${child.student_id}`}
    >
      {/* Card Header - Gradient based on tingkatan */}
      <div className={`relative overflow-hidden bg-gradient-to-r ${colors.bg} p-6 text-white`}>
        {/* Decorative circles */}
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
        <div className="absolute right-16 top-12 w-8 h-8 rounded-full bg-white/20" />
        
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                <GraduationCap className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold">{child.name}</h3>
                <p className="text-white/80 text-sm">{child.matric_number}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium">
                    {TINGKATAN_LABELS[child.current_form]}
                  </span>
                  <span className="text-white/70 text-xs">{child.class_name}</span>
                  {child.religion && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      child.religion === 'Islam' ? 'bg-emerald-500/30 text-emerald-100' : 'bg-amber-500/30 text-amber-100'
                    }`}>
                      {child.religion}
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {hasNoOutstanding ? (
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur px-3 py-1.5 rounded-full">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">Selesai</span>
              </div>
            ) : (
              <div className="text-right">
                <p className="text-white/70 text-xs">Jumlah Tunggakan</p>
                <p className="text-2xl font-bold">
                  RM {outstanding.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>
          
          {/* Progress bar */}
          <div className="mt-6">
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
            <div className="flex justify-between text-xs mt-1 text-white/70">
              <span>Dibayar: RM {child.total_paid?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</span>
              <span>Jumlah: RM {child.total_fees?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Card Body */}
      <div className="p-6">
        {nearestDue && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <p className="text-sm text-slate-700 truncate">
                  Tarikh akhir terdekat: <strong>{nearestDue.dueDate.toLocaleDateString('ms-MY')}</strong>
                </p>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getDueBadgeStyle(nearestDue.daysToDue)}`}>
                {getDueBadgeLabel(nearestDue.daysToDue)}
              </span>
            </div>
          </div>
        )}

        {/* Status message based on outstanding */}
        {hasNoOutstanding ? (
          <CongratsCard 
            childName={child.name}
            tingkatan={child.current_form}
            tahun={child.current_year}
          />
        ) : (
          <>
            {/* Outstanding alert */}
            <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h4 className="font-bold text-red-800">Tunggakan Perlu Dijelaskan</h4>
                  <p className="text-red-700 text-sm mt-1">
                    Terdapat {outstandingByTingkatan.length} tunggakan dari tingkatan sebelumnya yang perlu dibayar.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Outstanding cards by tingkatan */}
            <div className="grid gap-4 sm:grid-cols-2">
              {outstandingByTingkatan.map((ting, idx) => {
                const yuran = child.all_yuran?.find(y => y.tingkatan === ting.tingkatan && y.tahun === ting.tahun);
                return (
                  <OutstandingCard
                    key={idx}
                    tingkatan={ting.tingkatan}
                    tahun={ting.tahun}
                    outstanding={ting.outstanding}
                    onPay={yuran ? () => onPayment(child, yuran) : undefined}
                    isInCart={yuran ? isYuranInCart(yuran.id) : false}
                  />
                );
              })}
            </div>
          </>
        )}
        
        {/* Expand/collapse for more details */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-6 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:border-teal-300 hover:text-teal-600 transition-all flex items-center justify-center gap-2"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Tutup Butiran
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Lihat Butiran Yuran Tahun Semasa
            </>
          )}
        </button>
        
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-6 space-y-4">
                {/* Current year yuran */}
                {child.current_year_yuran?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-teal-600" />
                      Yuran Tahun {child.current_year}
                    </h4>
                    
                    {child.current_year_yuran.map((yuran) => {
                      const yuranOutstanding = yuran.total_amount - yuran.paid_amount;
                      return (
                        <div key={yuran.id} className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-800">{yuran.set_yuran_nama}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                yuran.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                yuran.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {STATUS_LABELS[yuran.status]}
                              </span>
                            </div>
                            <span className="text-sm font-medium text-slate-600">
                              RM {yuran.paid_amount?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })} / RM {yuran.total_amount?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          
                          <div className="p-4">
                            {/* Items list */}
                            <div className="grid gap-2">
                              {yuran.items?.slice(0, 6).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                                  <div className="flex items-center gap-2">
                                    {item.paid ? (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                      <Clock className="w-4 h-4 text-slate-400" />
                                    )}
                                    <span className={`text-sm ${item.paid ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                      {item.name}
                                    </span>
                                  </div>
                                  <span className={`text-sm font-medium ${item.paid ? 'text-emerald-600' : 'text-slate-700'}`}>
                                    RM {item.amount?.toFixed(2)}
                                  </span>
                                </div>
                              ))}
                              {yuran.items?.length > 6 && (
                                <p className="text-center text-sm text-slate-500 py-2">
                                  + {yuran.items.length - 6} lagi item
                                </p>
                              )}
                            </div>
                            
                            {yuranOutstanding > 0 && (
                              <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
                                <div>
                                  <p className="text-sm text-slate-500">Baki Tertunggak</p>
                                  <p className="text-lg font-bold text-red-600">
                                    RM {yuranOutstanding.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                                <Button
                                  onClick={() => onPayment(child, yuran)}
                                  data-testid={`pay-btn-${yuran.id}`}
                                  variant={isYuranInCart(yuran.id) ? 'success' : 'primary'}
                                  className={isYuranInCart(yuran.id) ? '!bg-gradient-to-r !from-emerald-500 !to-teal-500' : ''}
                                >
                                  {isYuranInCart(yuran.id) ? (
                                    <>
                                      <ShoppingCart className="w-4 h-4" />
                                      Sudah Masuk Ke Troli.
                                    </>
                                  ) : (
                                    <>
                                      <CreditCard className="w-4 h-4" />
                                      Bayar
                                    </>
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* History section */}
                {child.all_yuran?.length > 0 && (
                  <div className="mt-6">
                    <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <History className="w-5 h-5 text-slate-500" />
                      Sejarah Yuran
                    </h4>
                    <div className="space-y-2">
                      {child.all_yuran
                        .filter(y => !(y.tahun === child.current_year && y.tingkatan === child.current_form))
                        .map((yuran) => (
                        <div key={yuran.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-sm">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${TINGKATAN_COLORS[yuran.tingkatan]?.bg || 'from-slate-400 to-slate-500'} flex items-center justify-center text-white text-xs font-bold`}>
                              T{yuran.tingkatan}
                            </div>
                            <div>
                              <span className="font-medium text-slate-700">{TINGKATAN_LABELS[yuran.tingkatan]}</span>
                              <span className="text-slate-500 ml-2">({yuran.tahun})</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              yuran.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                              yuran.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {STATUS_LABELS[yuran.status]}
                            </span>
                            <span className="font-medium text-slate-700">
                              RM {yuran.paid_amount?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
                              <span className="text-slate-400"> / {yuran.total_amount?.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}</span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export const ParentYuranDashboard = () => {
  const navigate = useNavigate();
  const { cart, fetchCart } = useCart();
  const [childrenYuran, setChildrenYuran] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const isYuranInCart = (yuranId) => {
    if (!cart?.items?.length) return false;
    const id = String(yuranId);
    return cart.items.some(
      (item) =>
        (item.item_type === 'yuran' || item.item_type === 'yuran_partial') &&
        String(item.item_id) === id
    );
  };

  const fetchChildrenYuran = async () => {
    try {
      const res = await api.get('/api/yuran/anak-saya');
      setChildrenYuran(res.data);
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Gagal memuatkan data yuran anak.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChildrenYuran();
  }, []);

  /** Semua bayaran melalui Pusat Bayaran; redirect dengan student & yuran untuk preselect */
  const goToPaymentCenter = (child, yuran) => {
    const params = new URLSearchParams();
    if (child?.student_id) params.set('student', String(child.student_id));
    if (yuran?.id) params.set('yuran', String(yuran.id));
    navigate(`/payment-center${params.toString() ? `?${params.toString()}` : ''}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Spinner size="lg" />
        <p className="mt-4 text-slate-500">Memuatkan data yuran...</p>
      </div>
    );
  }

  if (childrenYuran.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-20 h-20 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <GraduationCap className="w-10 h-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-bold text-slate-700">Tiada Data Yuran</h3>
        <p className="text-slate-500 mt-2">Anak anda belum mempunyai rekod yuran yang dikenakan.</p>
      </div>
    );
  }

  // Calculate totals across all children
  const totalFees = childrenYuran.reduce((sum, c) => sum + (c.total_fees || 0), 0);
  const totalPaid = childrenYuran.reduce((sum, c) => sum + (c.total_paid || 0), 0);
  const totalOutstanding = totalFees - totalPaid;
  const allClear = totalOutstanding <= 0;
  const childrenWithDue = childrenYuran.map((child) => {
    const nearestDue = (child.all_yuran || [])
      .map((record) => {
        const outstanding = Number(record.total_amount || 0) - Number(record.paid_amount || 0);
        if (outstanding <= 0) return null;
        const dueInfo = getDueDateInfo(record.due_date);
        if (!dueInfo) return null;
        return {
          ...dueInfo,
          outstanding,
          setName: record.set_yuran_nama || 'Yuran',
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] || null;
    return { ...child, nearestDue };
  });
  const urgentDueChildren = childrenWithDue
    .filter((child) => child.nearestDue)
    .sort((a, b) => a.nearestDue.daysToDue - b.nearestDue.daysToDue);

  return (
    <div className="space-y-8 pb-8 min-w-0 overflow-x-hidden" data-testid="parent-yuran-dashboard">
      {/* Page Header with Notification Bell */}
      <div className="flex items-center justify-between">
        <div className="flex-1 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-pastel-lavender/70 rounded-full text-violet-700 font-medium mb-4"
          >
            <Wallet className="w-4 h-4" />
            Portal Yuran MRSMKU
          </motion.div>
          <div className="flex items-center justify-center gap-3">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-heading">
              Anak Saya
            </h1>
            {childrenYuran.length > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="inline-flex items-center justify-center min-w-[32px] h-8 px-2 bg-gradient-to-r from-teal-500 to-violet-500 text-white text-sm font-bold rounded-full shadow-pastel-sm"
              >
                {childrenYuran.length}
              </motion.span>
            )}
          </div>
          <p className="text-slate-600 mt-2">Pantau dan bayar yuran maktab anak-anak anda dengan mudah</p>
          <Link
            to="/payment-center"
            className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            <Wallet size={16} />
            Bayar yuran, tiket bas & sumbangan di Pusat Bayaran
            <ArrowRight size={14} />
          </Link>
        </div>
        <div className="flex-shrink-0">
          <NotificationBell />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-teal-500 to-violet-500 rounded-2xl p-5 text-white shadow-pastel"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <p className="text-white/80 text-sm">Anak Berdaftar</p>
              <p className="text-3xl font-bold">{childrenYuran.length}</p>
            </div>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-5 shadow-xl shadow-slate-200/50 border border-slate-100"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
              <CircleDollarSign className="w-6 h-6 text-slate-600" />
            </div>
            <div>
              <p className="text-slate-500 text-sm">Jumlah Yuran</p>
              <p className="text-2xl font-bold text-slate-800">
                RM {totalFees.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl p-5 shadow-xl shadow-slate-200/50 border border-slate-100"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-emerald-600 text-sm">Telah Dibayar</p>
              <p className="text-2xl font-bold text-emerald-700">
                RM {totalPaid.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className={`rounded-2xl p-5 shadow-xl border ${
            allClear 
              ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-emerald-500/25' 
              : 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-red-500/25'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              {allClear ? <Sparkles className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            </div>
            <div>
              <p className={allClear ? 'text-emerald-100' : 'text-red-100'} style={{ fontSize: '0.875rem' }}>Tunggakan</p>
              <p className="text-2xl font-bold">
                {allClear ? 'Tiada!' : `RM ${totalOutstanding.toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {!allClear && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-amber-800">Bayar Semua Tunggakan Sekali Klik</h3>
              <p className="text-sm text-amber-700 mt-1">
                Semua yuran tertunggak akan ditambah automatik ke troli Pusat Bayaran untuk semakan akhir sebelum checkout.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/payment-center?bulk=all-yuran"
                className="min-h-[44px] px-4 py-2 inline-flex items-center justify-center rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-colors"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Tambah Semua Ke Troli
              </Link>
              <Link
                to="/payment-center"
                className="min-h-[44px] px-4 py-2 inline-flex items-center justify-center rounded-xl bg-white text-amber-700 border border-amber-300 hover:bg-amber-100 font-semibold text-sm transition-colors"
              >
                Buka Pusat Bayaran
              </Link>
            </div>
          </div>
        </motion.div>
      )}

      {urgentDueChildren.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-bold text-slate-800">Tarikh Akhir Bayaran Terdekat</h3>
          </div>
          <div className="space-y-2">
            {urgentDueChildren.slice(0, 4).map((child) => (
              <div key={child.student_id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">{child.name}</p>
                  <p className="text-xs text-slate-500">
                    {child.nearestDue.setName} - {child.nearestDue.dueDate.toLocaleDateString('ms-MY')}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getDueBadgeStyle(child.nearestDue.daysToDue)}`}>
                  {getDueBadgeLabel(child.nearestDue.daysToDue)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* All clear message */}
      {allClear && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-2 border-emerald-200 rounded-2xl p-6 text-center"
        >
          <div className="flex justify-center mb-4">
            <motion.div
              animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30"
            >
              <PartyPopper className="w-8 h-8" />
            </motion.div>
          </div>
          <h3 className="text-xl font-bold text-emerald-800">Tahniah! Semua Yuran Telah Dijelaskan</h3>
          <p className="text-emerald-700 mt-2">Anda merupakan ibu bapa yang bertanggungjawab. Terima kasih atas komitmen anda!</p>
        </motion.div>
      )}

      {/* Children Fee Cards */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600" />
            Status Yuran Anak
          </h2>
          <span className="text-sm text-slate-500">{childrenYuran.length} orang anak</span>
        </div>
        
        <div className="grid gap-6 lg:grid-cols-2">
          {childrenWithDue.map((child, index) => (
            <motion.div
              key={child.student_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index }}
            >
              <ChildFeeCard
                child={child}
                nearestDue={child.nearestDue}
                onPayment={goToPaymentCenter}
                isYuranInCart={isYuranInCart}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Import Users icon at top
const Users = ({ className, ...props }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);

export default ParentYuranDashboard;
