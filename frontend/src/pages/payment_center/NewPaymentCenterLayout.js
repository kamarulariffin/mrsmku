import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Users, Bus, Heart, Store, ShoppingBag, Wallet,
  ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Plus, CreditCard, Lock,
  GraduationCap, CheckCircle2, X, Check, Trash2,
  Receipt, Download, History, RefreshCw, ArrowRight,
  Package, Bell, Clock3, Info,
  Trophy, Sparkles, Star, PartyPopper
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import api from '../../services/api';
import getUserFriendlyError from '../../utils/errorMessages';

// ============ CONSTANTS ============
import { TINGKATAN_COLORS } from '../../constants';

const DEFAULT_REMINDER_PREFERENCES = {
  default_days_before: 3,
  default_time: '09:00',
  default_source: 'google_calendar',
};

const parseDueDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getDueMeta = (dueDateValue, daysToDueValue) => {
  const dueDate = parseDueDate(dueDateValue);
  if (!dueDate) return null;
  let daysToDue = Number.isFinite(daysToDueValue) ? Number(daysToDueValue) : null;
  if (daysToDue === null) {
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const startDue = new Date(dueDate);
    startDue.setHours(0, 0, 0, 0);
    daysToDue = Math.floor((startDue.getTime() - startToday.getTime()) / (1000 * 60 * 60 * 24));
  }
  return { dueDate, daysToDue };
};

const getDueBadgeTone = (daysToDue) => {
  if (daysToDue < 0) return 'bg-red-100 text-red-700';
  if (daysToDue <= 7) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

const getDueBadgeLabel = (daysToDue) => {
  if (daysToDue < 0) return `${Math.abs(daysToDue)} hari lewat`;
  if (daysToDue === 0) return 'Hari ini';
  return `${daysToDue} hari lagi`;
};

const formatCalendarDateTime = (date) => {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
};

const buildReminderDateTime = (dueDate, daysBefore = 3, timeValue = '09:00') => {
  const [hourRaw, minuteRaw] = String(timeValue || '09:00').split(':');
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  const reminderDate = new Date(dueDate);
  reminderDate.setDate(reminderDate.getDate() - Number(daysBefore || 0));
  reminderDate.setHours(Number.isNaN(hour) ? 9 : hour, Number.isNaN(minute) ? 0 : minute, 0, 0);
  return reminderDate;
};

const saveReminderToLocal = (payload) => {
  try {
    const existing = JSON.parse(localStorage.getItem('mrsm_payment_reminders') || '[]');
    const next = [payload, ...existing].slice(0, 30);
    localStorage.setItem('mrsm_payment_reminders', JSON.stringify(next));
  } catch {
    // Ignore localStorage failure, calendar actions should still work.
  }
};

const openGoogleCalendarReminder = ({ title, description, reminderAt }) => {
  const endDate = new Date(reminderAt.getTime() + 30 * 60 * 1000);
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(description)}&dates=${formatCalendarDateTime(reminderAt)}/${formatCalendarDateTime(endDate)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const downloadReminderIcs = ({ title, description, reminderAt, uidSeed }) => {
  const endDate = new Date(reminderAt.getTime() + 30 * 60 * 1000);
  const uid = `${uidSeed || 'mrsm'}-${Date.now()}@mrsmku`;
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MRSMKU//Payment Reminder//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatCalendarDateTime(new Date())}`,
    `DTSTART:${formatCalendarDateTime(reminderAt)}`,
    `DTEND:${formatCalendarDateTime(endDate)}`,
    `SUMMARY:${title.replace(/\n/g, ' ')}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `peringatan-yuran-${uidSeed || 'mrsm'}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ============ UI COMPONENTS ============
const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-current border-t-transparent ${
    size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'
  }`} />
);

// ============ CART SLIDER ============
const CartSlider = ({ isOpen, onClose, cart, onCheckout, onClearCart, onRemoveItem, processing }) => {
  const [expandedPartialItems, setExpandedPartialItems] = useState({});

  useEffect(() => {
    if (!isOpen) {
      setExpandedPartialItems({});
    }
  }, [isOpen]);

  const getPartialSelectedItems = (item) => {
    const selectedItems = item?.metadata?.selected_items;
    if (!Array.isArray(selectedItems)) return [];
    return selectedItems
      .map((selectedItem) => ({
        code: String(selectedItem?.code || ''),
        name: String(selectedItem?.name || 'Item yuran'),
        amount: Number(selectedItem?.amount || 0),
      }))
      .filter((selectedItem) => selectedItem.name || selectedItem.amount > 0);
  };

  const togglePartialItem = (itemKey) => {
    setExpandedPartialItems((prev) => ({ ...prev, [itemKey]: !prev[itemKey] }));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* Slider Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
            data-testid="cart-slider"
          >
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-teal-500 to-violet-500 text-white flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                    <ShoppingBag size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Troli Anda</h3>
                    <p className="text-white/80 text-sm">{cart?.items?.length || 0} item</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                  data-testid="close-cart-slider"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            
            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {(!cart?.items || cart.items.length === 0) ? (
                <div className="text-center py-12">
                  <ShoppingBag className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-500">Troli kosong</p>
                </div>
              ) : (
                cart.items.map((item, idx) => {
                  const itemKey = String(item.cart_item_id || `${item.item_type || 'item'}-${idx}`);
                  const partialSelectedItems = item.item_type === 'yuran_partial' ? getPartialSelectedItems(item) : [];
                  const canExpandPartial = partialSelectedItems.length > 0;
                  const isPartialExpanded = Boolean(expandedPartialItems[itemKey]);
                  const itemTotalAmount = Number(item.amount || 0) * Number(item.quantity || 1);
                  const partialSubtotal = partialSelectedItems.reduce(
                    (sum, selectedItem) => sum + Number(selectedItem.amount || 0),
                    0
                  );
                  const subtotalMatchesItemTotal = Math.abs(partialSubtotal - itemTotalAmount) < 0.01;

                  return (
                    <motion.div
                      key={itemKey}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-slate-50 rounded-xl p-4 border border-slate-200"
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          item.item_type?.includes('yuran') ? 'bg-amber-100' :
                          item.item_type === 'bus' ? 'bg-cyan-100' :
                          item.item_type === 'infaq' ? 'bg-pink-100' :
                          item.item_type === 'koperasi' ? 'bg-pastel-lavender' : 'bg-slate-100'
                        }`}>
                          {item.item_type?.includes('yuran') ? <GraduationCap className="text-amber-600" size={20} /> :
                           item.item_type === 'bus' ? <Bus className="text-cyan-600" size={20} /> :
                           item.item_type === 'infaq' ? <Heart className="text-pink-600" size={20} /> :
                           item.item_type === 'koperasi' ? <Package className="text-violet-600" size={20} /> :
                           <Package className="text-slate-400" size={20} />}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-slate-800 truncate">{item.name}</h4>
                          {item.description && (
                            <p className="text-sm text-slate-500 truncate">{item.description}</p>
                          )}
                          <p className="text-lg font-bold text-teal-600 mt-1">
                            RM {((item.amount || 0) * (item.quantity || 1)).toFixed(2)}
                          </p>
                        </div>
                        
                        {/* Remove Button */}
                        <button
                          onClick={() => onRemoveItem(item.cart_item_id)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          data-testid={`remove-item-${item.cart_item_id}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      {canExpandPartial && (
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <button
                            type="button"
                            onClick={() => togglePartialItem(itemKey)}
                            className="w-full min-h-[36px] rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors flex items-center justify-between"
                            data-testid={`toggle-partial-detail-${itemKey}`}
                          >
                            <span>Pecahan Yuran ({partialSelectedItems.length} item)</span>
                            {isPartialExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>

                          {isPartialExpanded && (
                            <div className="mt-2 space-y-1.5">
                              {partialSelectedItems.map((selectedItem, selectedIndex) => (
                                <div
                                  key={`${itemKey}-selected-${selectedItem.code || selectedIndex}`}
                                  className="rounded-lg bg-white border border-slate-100 px-2.5 py-2 flex items-start justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-slate-700 truncate">
                                      {selectedItem.name || 'Item yuran'}
                                    </p>
                                    {selectedItem.code ? (
                                      <p className="text-[10px] text-slate-500">Kod: {selectedItem.code}</p>
                                    ) : null}
                                  </div>
                                  <p className="text-xs font-semibold text-slate-800 flex-shrink-0">
                                    RM {Number(selectedItem.amount || 0).toFixed(2)}
                                  </p>
                                </div>
                              ))}

                              <div className={`rounded-lg border px-2.5 py-2 ${
                                subtotalMatchesItemTotal
                                  ? 'bg-emerald-50 border-emerald-100'
                                  : 'bg-amber-50 border-amber-100'
                              }`}>
                                <div className="flex items-center justify-between text-[11px] text-slate-700">
                                  <span>Subtotal pecahan</span>
                                  <span className="font-semibold">RM {partialSubtotal.toFixed(2)}</span>
                                </div>
                                <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-600">
                                  <span>Jumlah item troli</span>
                                  <span className="font-medium">RM {itemTotalAmount.toFixed(2)}</span>
                                </div>
                                <p className={`mt-1 text-[10px] ${
                                  subtotalMatchesItemTotal ? 'text-emerald-700' : 'text-amber-700'
                                }`}>
                                  {subtotalMatchesItemTotal
                                    ? 'Jumlah pecahan sepadan dengan jumlah item troli.'
                                    : 'Jumlah pecahan tidak sepadan dengan jumlah item troli.'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
            
            {/* Footer */}
            {cart?.items && cart.items.length > 0 && (
              <div className="border-t border-slate-200 p-5 bg-white flex-shrink-0">
                {/* Total */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-slate-600 font-medium">Jumlah</span>
                  <span className="text-2xl font-bold text-slate-800">
                    RM {(cart.total_amount || 0).toFixed(2)}
                  </span>
                </div>
                
                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={onClearCart}
                    className="flex-1 py-3 border-2 border-slate-300 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                    data-testid="clear-cart-btn"
                  >
                    Kosongkan
                  </button>
                  <button
                    onClick={onCheckout}
                    disabled={processing}
                    className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25"
                    data-testid="checkout-btn"
                  >
                    {processing ? <Spinner size="sm" /> : <Lock size={18} />}
                    Bayar Sekarang
                  </button>
                </div>
                
                {/* Payment Note */}
                <p className="text-xs text-center text-slate-400 mt-3">
                  * Pembayaran akan diproses melalui FPX (SIMULASI)
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ============ SAMPLE AVATARS ============
// Male and hijab-wearing female student avatars
const MALE_AVATARS = [
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
];

const FEMALE_AVATARS = [
  'https://images.unsplash.com/photo-1657781069385-1b6a599ace70?w=150&h=150&fit=crop&crop=face', // Hijab
  'https://images.unsplash.com/photo-1623813793124-da525390a1b2?w=150&h=150&fit=crop&crop=face', // Hijab blue
  'https://images.unsplash.com/photo-1657781069918-7aba90d68b62?w=150&h=150&fit=crop&crop=face', // Hijab white
];

// Custom avatars for specific students (by name) - use /images/ folder or leave empty to use default pool
const CUSTOM_AVATARS = {};

// Check if name is likely male based on common Malay/Muslim male names
const isMaleName = (name) => {
  const maleIndicators = ['ahmad', 'muhammad', 'mohd', 'ali', 'abu', 'bin', 'danish', 'amir', 'hafiz', 'amin', 'adam', 'irfan', 'arif', 'haziq', 'daniel', 'zul', 'farhan', 'hakim', 'imran', 'faris', 'haikal', 'syafiq', 'izzat', 'aiman', 'nazrul', 'afiq', 'harris', 'izzuddin', 'azlan', 'aziz'];
  const lowerName = name?.toLowerCase() || '';
  return maleIndicators.some(indicator => lowerName.includes(indicator));
};

// Get appropriate avatar based on student name
const getStudentAvatar = (studentName, index) => {
  const lowerName = studentName?.toLowerCase() || '';
  
  // Check for custom avatar first
  for (const [key, url] of Object.entries(CUSTOM_AVATARS)) {
    if (lowerName.includes(key)) {
      return url;
    }
  }
  
  // Fall back to gender-based avatars
  if (isMaleName(studentName)) {
    return MALE_AVATARS[index % MALE_AVATARS.length];
  }
  return FEMALE_AVATARS[index % FEMALE_AVATARS.length];
};

// ============ STUDENT CAROUSEL ============
const StudentCarousel = ({ students, selectedStudent, onSelectStudent, onTambahAnak }) => {
  const scroll = (direction) => {
    const container = document.getElementById('student-carousel');
    if (container) {
      const scrollAmount = direction === 'left' ? -300 : 300;
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (!students || students.length === 0) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-3xl p-10 text-center shadow-lg shadow-slate-200/50">
        <div className="w-20 h-20 bg-gradient-to-br from-slate-200 to-slate-300 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
          <Users className="w-10 h-10 text-slate-400" />
        </div>
        <p className="text-slate-500 font-medium">Tiada anak didaftarkan</p>
        {onTambahAnak && (
          <button
            onClick={onTambahAnak}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-violet-500 text-white text-sm font-semibold rounded-xl hover:from-teal-600 hover:to-violet-600 transition-all shadow-lg shadow-pastel-sm mx-auto"
            data-testid="tambah-anak-empty"
          >
            <Plus size={16} />
            Tambah Anak
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-br from-white via-slate-50/50 to-pastel-lavender/20 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl sm:shadow-2xl shadow-slate-300/50 sm:shadow-slate-300/60 border border-slate-100/80">
      {/* Header - padat pada mobile */}
      <div className="flex items-center justify-between mb-3 sm:mb-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-teal-500 to-violet-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-pastel flex-shrink-0">
            <Users className="text-white" size={18} />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">Anak-Anak Saya</h2>
        </div>
        <button
          type="button"
          onClick={onTambahAnak}
          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 min-h-[44px] bg-gradient-to-r from-teal-500 to-violet-500 text-white text-xs sm:text-sm font-semibold rounded-xl hover:from-teal-600 hover:to-violet-600 transition-all shadow-lg shadow-pastel-sm hover:shadow-xl hover:shadow-blue-500/30"
          data-testid="tambah-anak-btn"
        >
          <Plus size={14} className="sm:w-4 sm:h-4" />
          Tambah Anak
        </button>
      </div>
      
      {/* Carousel Controls - desktop: arrows; mobile: swipe */}
      {students.length > 2 && (
        <>
          <div className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 mt-4 hidden sm:flex">
            <button 
              onClick={() => scroll('left')}
              type="button"
              className="w-10 h-10 bg-white shadow-xl shadow-slate-300/50 rounded-full flex items-center justify-center hover:bg-slate-50 hover:scale-110 transition-all border border-slate-100"
              aria-label="Anak sebelumnya"
            >
              <ChevronLeft size={20} className="text-slate-600" />
            </button>
          </div>
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10 mt-4 hidden sm:flex">
            <button 
              onClick={() => scroll('right')}
              type="button"
              className="w-10 h-10 bg-white shadow-xl shadow-slate-300/50 rounded-full flex items-center justify-center hover:bg-slate-50 hover:scale-110 transition-all border border-slate-100"
              aria-label="Anak seterusnya"
            >
              <ChevronRight size={20} className="text-slate-600" />
            </button>
          </div>
        </>
      )}
      
      {/* Hint swipe pada mobile */}
      {students.length > 1 && (
        <p className="text-xs text-slate-500 mb-2 sm:mb-0 text-center sm:text-left px-1 sm:hidden">Swipe kiri atau kanan untuk lihat anak lain</p>
      )}
      
      {/* Student Cards - swipeable horizontal (touch + mouse) */}
      <div 
        id="student-carousel"
        className="flex gap-4 sm:gap-5 overflow-x-auto overflow-y-hidden scrollbar-hide scroll-smooth pb-2 px-1 touch-pan-x"
        style={{ 
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollPaddingLeft: '0.25rem',
          scrollPaddingRight: '0.25rem',
        }}
      >
        {/* Sort students: unpaid/partial first (left), fully paid last (right) */}
        {[...students].sort((a, b) => {
          const aBalance = a.amount || 0;
          const bBalance = b.amount || 0;
          const aFullyPaid = aBalance <= 0;
          const bFullyPaid = bBalance <= 0;
          
          // Unpaid first, fully paid last
          if (aFullyPaid && !bFullyPaid) return 1;
          if (!aFullyPaid && bFullyPaid) return -1;
          
          // Among unpaid, sort by balance (highest first)
          if (!aFullyPaid && !bFullyPaid) return bBalance - aBalance;
          
          return 0;
        }).map((student, index) => {
          const colors = TINGKATAN_COLORS[student.tingkatan] || TINGKATAN_COLORS[1];
          const isSelected = selectedStudent?.student_id === student.student_id;
          const avatarUrl = getStudentAvatar(student.student_name, index);
          
          // Calculate progress percentage
          const totalAmount = student.original_amount || student.total_amount || 0;
          const paidAmount = student.paid_amount || 0;
          const progressPercent = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;
          const balance = student.amount || 0;
          const dueMeta = getDueMeta(student.due_date, student.days_to_due);
          
          // Check if fully paid
          const isFullyPaid = progressPercent >= 100 || balance <= 0;
          
          // Circle progress values
          const circleSize = 56;
          const strokeWidth = 5;
          const radius = (circleSize - strokeWidth) / 2;
          const circumference = 2 * Math.PI * radius;
          const strokeDashoffset = circumference - (progressPercent / 100) * circumference;
          
          // Fully paid card - special green design
          if (isFullyPaid) {
            return (
              <motion.div
                key={student.student_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  scale: isSelected ? 1.02 : 1,
                }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -4, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectStudent(student)}
                className={`flex-shrink-0 w-80 rounded-2xl overflow-hidden cursor-pointer scroll-snap-start relative ${
                  isSelected ? 'ring-3 ring-emerald-400 z-10' : ''
                }`}
                style={{
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
                  boxShadow: isSelected 
                    ? '0 0 40px rgba(16, 185, 129, 0.5), 0 25px 50px -12px rgba(16, 185, 129, 0.3)' 
                    : '0 10px 40px -10px rgba(16, 185, 129, 0.4)'
                }}
                data-testid={`student-card-${student.student_id}`}
              >
                {/* Sparkles animation background */}
                <div className="absolute inset-0 overflow-hidden">
                  <motion.div
                    className="absolute w-32 h-32 bg-white/20 rounded-full blur-xl"
                    animate={{ 
                      x: [0, 100, 0], 
                      y: [0, 50, 0],
                      scale: [1, 1.2, 1]
                    }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                    style={{ top: '-20%', left: '-10%' }}
                  />
                  <motion.div
                    className="absolute w-24 h-24 bg-white/10 rounded-full blur-lg"
                    animate={{ 
                      x: [0, -50, 0], 
                      y: [0, 30, 0],
                      scale: [1, 1.3, 1]
                    }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    style={{ bottom: '-10%', right: '-5%' }}
                  />
                </div>
                
                {/* Confetti/Stars decorations */}
                <motion.div
                  className="absolute top-3 right-3"
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles size={20} className="text-yellow-300" />
                </motion.div>
                <motion.div
                  className="absolute top-8 right-10"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Star size={14} className="text-yellow-200 fill-yellow-200" />
                </motion.div>
                
                <div className="p-5 relative z-10">
                  <div className="flex items-start gap-4">
                    {/* Avatar with crown/trophy */}
                    <div className="relative">
                      <motion.div
                        className="absolute -top-3 -right-1 z-20"
                        animate={{ y: [0, -3, 0], rotate: [-5, 5, -5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Trophy size={24} className="text-yellow-300 drop-shadow-lg" />
                      </motion.div>
                      <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-xl ring-3 ring-white/50">
                        <img 
                          src={avatarUrl} 
                          alt={student.student_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                        <div className="w-full h-full bg-white/30 items-center justify-center text-white text-xl font-bold hidden">
                          {student.student_name?.charAt(0) || 'A'}
                        </div>
                      </div>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white truncate text-base drop-shadow">{student.student_name}</h3>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/20 rounded-lg mt-1 backdrop-blur-sm">
                        <GraduationCap size={14} className="text-white" />
                        <span className="text-xs font-semibold text-white">
                          Tingkatan {student.tingkatan} • {student.tahun}
                        </span>
                      </div>
                    </div>
                    
                    {/* Check badge */}
                    <motion.div 
                      className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center"
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <CheckCircle2 size={32} className="text-white" />
                    </motion.div>
                  </div>
                  
                  {/* Success Banner */}
                  <motion.div 
                    className="mt-4 py-3 px-4 bg-white/20 backdrop-blur-sm rounded-xl text-center"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <motion.div
                      animate={{ scale: [1, 1.02, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <PartyPopper size={20} className="text-yellow-300" />
                        <span className="font-bold text-white text-sm">Yuran Sudah Dibayar!</span>
                        <PartyPopper size={20} className="text-yellow-300 transform scale-x-[-1]" />
                      </div>
                      <p className="text-xs text-emerald-100 mt-1">Tahniah! Semua yuran telah dijelaskan</p>
                    </motion.div>
                  </motion.div>
                  
                  {/* Total Paid */}
                  <div className="mt-3 flex items-center justify-between text-white">
                    <div>
                      <p className="text-xs text-emerald-100">Jumlah Dibayar</p>
                      <p className="text-xl font-bold">RM {paidAmount.toFixed(2)}</p>
                    </div>
                    <motion.div 
                      className="px-3 py-1.5 bg-white/20 rounded-full"
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                    >
                      <span className="text-sm font-bold">100%</span>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            );
          }
          
          // Regular card for unpaid students
          return (
            <motion.div
              key={student.student_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ 
                opacity: 1, 
                y: 0,
                scale: isSelected ? 1.02 : 1,
                boxShadow: isSelected 
                  ? '0 0 30px rgba(99, 102, 241, 0.4), 0 25px 50px -12px rgba(99, 102, 241, 0.25)' 
                  : '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
              }}
              transition={{ 
                delay: index * 0.1,
                scale: { duration: 0.3, ease: "easeOut" },
                boxShadow: { duration: 0.3 }
              }}
              whileHover={{ y: -4, scale: 1.01, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectStudent(student)}
              className={`flex-shrink-0 w-80 bg-white rounded-2xl overflow-hidden cursor-pointer scroll-snap-start ${
                isSelected 
                  ? 'ring-3 ring-teal-500 z-10' 
                  : 'border border-slate-100 hover:border-slate-200'
              }`}
              style={{
                background: isSelected 
                  ? 'linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%)' 
                  : '#ffffff'
              }}
              data-testid={`student-card-${student.student_id}`}
            >
              {/* Colored Header Bar - Animated for selected */}
              <motion.div 
                className={`h-3 bg-gradient-to-r ${colors.bg}`}
                animate={{ height: isSelected ? '4px' : '3px' }}
                transition={{ duration: 0.2 }}
              />
              
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Avatar with Image */}
                  <motion.div 
                    className="relative"
                    animate={{ scale: isSelected ? 1.05 : 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className={`w-14 h-14 rounded-2xl overflow-hidden shadow-xl shadow-slate-300/50 ring-3 ${isSelected ? 'ring-teal-200' : 'ring-white'}`}>
                      <img 
                        src={avatarUrl} 
                        alt={student.student_name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                      <div className={`w-full h-full bg-gradient-to-br ${colors.bg} items-center justify-center text-white text-xl font-bold hidden`}>
                        {student.student_name?.charAt(0) || 'A'}
                      </div>
                    </div>
                  </motion.div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 truncate text-base">{student.student_name}</h3>
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 ${colors.light} rounded-lg mt-1`}>
                      <GraduationCap size={14} className={colors.text} />
                      <span className={`text-xs font-semibold ${colors.text}`}>
                        Tingkatan {student.tingkatan} • {student.tahun}
                      </span>
                    </div>
                  </div>
                  
                  {/* Circular Progress */}
                  <div className="relative flex-shrink-0">
                    <svg width={circleSize} height={circleSize} className="transform -rotate-90">
                      {/* Background circle */}
                      <circle
                        cx={circleSize / 2}
                        cy={circleSize / 2}
                        r={radius}
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth={strokeWidth}
                      />
                      {/* Progress circle */}
                      <circle
                        cx={circleSize / 2}
                        cy={circleSize / 2}
                        r={radius}
                        fill="none"
                        stroke={progressPercent >= 100 ? '#10b981' : progressPercent > 50 ? '#f59e0b' : '#ef4444'}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    {/* Progress text in center */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-xs font-bold ${progressPercent >= 100 ? 'text-emerald-600' : progressPercent > 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {progressPercent}%
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent my-4" />
                
                {/* Fee Info Section */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Baki</p>
                    <p className="text-xl font-bold text-slate-800">
                      RM {balance.toFixed(2)}
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-xs text-slate-400 font-medium">Dibayar</p>
                    <p className="text-sm font-semibold text-emerald-600">
                      RM {paidAmount.toFixed(2)}
                    </p>
                  </div>
                </div>

                {dueMeta && (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-600">
                      Tarikh akhir: {dueMeta.dueDate.toLocaleDateString('ms-MY')}
                    </p>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${getDueBadgeTone(dueMeta.daysToDue)}`}>
                      {getDueBadgeLabel(dueMeta.daysToDue)}
                    </span>
                  </div>
                )}
                
                {/* View Fee List Button */}
                <button 
                  className={`w-full mt-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    isSelected 
                      ? 'bg-teal-600 text-white shadow-pastel' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectStudent(student);
                  }}
                >
                  <Receipt size={16} />
                  Lihat Senarai Bayaran
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// ============ QUICK ACTIONS ============
const QuickActions = ({ onAction }) => {
  const actions = [
    { id: 'bus', icon: Bus, label: 'Tiket Bas', color: 'from-cyan-500 to-blue-500', count: 2 },
    { id: 'tabung', icon: Heart, label: 'Tabung & Sumbangan', color: 'from-pink-500 to-rose-500' },
    { id: 'marketplace', icon: Store, label: 'Marketplace', color: 'from-orange-500 to-amber-500', count: 5 },
    { id: 'koperasi', icon: ShoppingBag, label: 'Koperasi', color: 'from-violet-500 to-teal-500' },
  ];

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-sm">
      <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2 sm:mb-3">Bayaran Pantas</h3>
      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
        {actions.map((action) => (
          <motion.button
            key={action.id}
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onAction(action.id)}
            className={`relative bg-gradient-to-br ${action.color} p-2.5 sm:p-3 min-h-[44px] rounded-xl text-white text-left shadow-md transition-all overflow-hidden flex flex-col justify-center`}
            data-testid={`quick-action-${action.id}`}
          >
            {/* Background decoration */}
            <div className="absolute -right-2 -bottom-2 w-12 h-12 bg-white/10 rounded-full" />
            
            <action.icon size={20} className="mb-1.5" />
            <p className="font-medium text-xs leading-tight">{action.label}</p>
            
            {action.count && (
              <span className="absolute top-2 right-2 w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold">
                {action.count}
              </span>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
};

const ReminderCenter = ({
  reminders = [],
  loading = false,
  onRefresh,
  onCancel,
  cancellingReminderId = '',
}) => {
  const getStatusMeta = (item) => {
    const status = String(item?.status || '').toLowerCase();
    if (status === 'scheduled') return { label: 'Dijadualkan', tone: 'bg-violet-100 text-violet-700' };
    if (status === 'sent') return { label: 'Dihantar', tone: 'bg-emerald-100 text-emerald-700' };
    if (status === 'failed') {
      if (item?.retry_exhausted) return { label: 'Gagal (Muktamad)', tone: 'bg-red-100 text-red-700' };
      return { label: 'Gagal (Akan Cuba Lagi)', tone: 'bg-amber-100 text-amber-700' };
    }
    if (status === 'cancelled') return { label: 'Dibatalkan', tone: 'bg-slate-200 text-slate-600' };
    return { label: item?.status || 'Status', tone: 'bg-slate-100 text-slate-700' };
  };

  const sortedReminders = [...(reminders || [])].sort((a, b) => {
    const rank = { scheduled: 0, failed: 1, sent: 2, cancelled: 3 };
    const aStatus = String(a?.status || '').toLowerCase();
    const bStatus = String(b?.status || '').toLowerCase();
    const rankDiff = (rank[aStatus] ?? 99) - (rank[bStatus] ?? 99);
    if (rankDiff !== 0) return rankDiff;
    const aTime = new Date(a?.remind_at || '').getTime() || 0;
    const bTime = new Date(b?.remind_at || '').getTime() || 0;
    if (aStatus === 'scheduled') return aTime - bTime;
    return bTime - aTime;
  });

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-violet-600" />
          <h3 className="text-xs sm:text-sm font-bold text-slate-800">Reminder Saya</h3>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="min-h-[32px] px-2 rounded-lg text-xs text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Muat Semula
        </button>
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center text-slate-500">
          <Spinner size="sm" />
        </div>
      ) : sortedReminders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500">
          Tiada reminder lagi. Tekan butang <strong>Ingatkan</strong> pada rekod yuran untuk mula.
        </div>
      ) : (
        <div className="space-y-2">
          {sortedReminders.slice(0, 6).map((item) => {
            const statusMeta = getStatusMeta(item);
            const remindAt = new Date(item.remind_at || '');
            const dueDate = parseDueDate(item.due_date);
            const isScheduled = String(item.status || '').toLowerCase() === 'scheduled';
            const isFailed = String(item.status || '').toLowerCase() === 'failed';
            const nextRetryAt = item.next_retry_at ? new Date(item.next_retry_at) : null;
            return (
              <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {item.student_name || 'Pelajar'} - {item.set_name || 'Yuran'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      RM {Number(item.amount || 0).toFixed(2)}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusMeta.tone}`}>
                    {statusMeta.label}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                  <div className="flex items-center gap-1 min-w-0">
                    <Clock3 className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">
                      {Number.isNaN(remindAt.getTime()) ? '-' : remindAt.toLocaleString('ms-MY')}
                    </span>
                  </div>
                  {dueDate && (
                    <span className="text-[10px] text-slate-500">
                      Due: {dueDate.toLocaleDateString('ms-MY')}
                    </span>
                  )}
                </div>
                {isFailed && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    {item.retry_exhausted
                      ? 'Percubaan auto-retry telah tamat. Anda boleh jadualkan semula reminder baharu.'
                      : `Auto-retry ${item.retry_count || 0}/${item.max_retries || 3}${
                          nextRetryAt && !Number.isNaN(nextRetryAt.getTime())
                            ? ` pada ${nextRetryAt.toLocaleString('ms-MY')}`
                            : ''
                        }.`}
                  </p>
                )}
                {isScheduled && (
                  <button
                    type="button"
                    onClick={() => onCancel(item.id)}
                    disabled={cancellingReminderId === item.id}
                    className="mt-2 w-full min-h-[36px] rounded-lg border border-slate-300 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-60"
                  >
                    {cancellingReminderId === item.id ? 'Membatalkan...' : 'Batal Reminder'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ReminderPreferencesCard = ({
  preferences = DEFAULT_REMINDER_PREFERENCES,
  loading = false,
  saving = false,
  onChange,
  onSave,
}) => {
  const activeSource = preferences?.default_source === 'ics_download' ? 'ics_download' : 'google_calendar';

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs sm:text-sm font-bold text-slate-800">Tetapan Reminder</h3>
        {loading ? <Spinner size="sm" /> : null}
      </div>
      <p className="text-[11px] text-slate-500 mb-3">
        Tetapan ini digunakan automatik setiap kali anda tekan butang <strong>Ingatkan</strong>.
      </p>

      <div className="space-y-3">
        <div>
          <p className="text-[11px] font-medium text-slate-700 mb-1">Hari sebelum due date</p>
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 3, 7].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => onChange({ ...preferences, default_days_before: days })}
                className={`min-h-[40px] rounded-lg text-xs font-semibold border transition-colors ${
                  Number(preferences?.default_days_before || 0) === days
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-violet-300'
                }`}
              >
                {days === 0 ? 'Hari ini' : `${days} hari`}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-700 mb-1">Masa default</label>
          <input
            type="time"
            value={preferences?.default_time || '09:00'}
            onChange={(event) => onChange({ ...preferences, default_time: event.target.value })}
            className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <div>
          <p className="text-[11px] font-medium text-slate-700 mb-1">Aksi pilihan utama</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...preferences, default_source: 'google_calendar' })}
              className={`min-h-[40px] rounded-lg text-xs font-semibold border transition-colors ${
                activeSource === 'google_calendar'
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-violet-300'
              }`}
            >
              Google
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...preferences, default_source: 'ics_download' })}
              className={`min-h-[40px] rounded-lg text-xs font-semibold border transition-colors ${
                activeSource === 'ics_download'
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-violet-300'
              }`}
            >
              .ics
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="w-full min-h-[42px] rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? <Spinner size="sm" /> : <Check size={14} />}
          Simpan Tetapan
        </button>
      </div>
    </div>
  );
};

// ============ YURAN DETAIL VIEW ============
const YuranDetailView = ({ yuranList, selectedStudent, onAddToCart, onAddItemToCart, twoPaymentPlans = [] }) => {
  const [selectedItems, setSelectedItems] = useState({});
  const [presetSelectionMeta, setPresetSelectionMeta] = useState({});

  // Filter yuran for selected student only
  const filteredYuranList = selectedStudent 
    ? yuranList.filter(y => y.student_id === selectedStudent.student_id)
    : [];

  // Toggle item selection
  const toggleItemSelection = (yuranId, itemIdx, item) => {
    const key = `${yuranId}-${itemIdx}`;
    setSelectedItems(prev => {
      const newState = { ...prev };
      if (newState[key]) {
        delete newState[key];
      } else {
        newState[key] = { yuranId, itemIdx, item };
      }
      return newState;
    });
    setPresetSelectionMeta((prev) => {
      const yuranKey = String(yuranId || '');
      if (!yuranKey || !prev[yuranKey]) return prev;
      const next = { ...prev };
      delete next[yuranKey];
      return next;
    });
  };

  // Check if item is selected
  const isItemSelected = (yuranId, itemIdx) => {
    return !!selectedItems[`${yuranId}-${itemIdx}`];
  };

  // Get selected items for a yuran
  const getSelectedCount = (yuranId) => {
    return Object.keys(selectedItems).filter(k => k.startsWith(`${yuranId}-`)).length;
  };

  // Get total amount of selected items for a yuran
  const getSelectedTotal = (yuranId) => {
    return Object.entries(selectedItems)
      .filter(([k]) => k.startsWith(`${yuranId}-`))
      .reduce((sum, [, v]) => sum + (v.item.balance || v.item.amount || 0), 0);
  };

  // Add selected items to cart
  const handleAddSelectedToCart = (yuran) => {
    const selected = Object.entries(selectedItems)
      .filter(([k]) => k.startsWith(`${yuran.yuran_id}-`))
      .map(([, v]) => v.item);
    
    if (selected.length > 0) {
      onAddItemToCart(yuran, selected);
      // Clear selection for this yuran
      setSelectedItems(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(k => {
          if (k.startsWith(`${yuran.yuran_id}-`)) {
            delete newState[k];
          }
        });
        return newState;
      });
      setPresetSelectionMeta((prev) => {
        const yuranKey = String(yuran.yuran_id || '');
        if (!yuranKey || !prev[yuranKey]) return prev;
        const next = { ...prev };
        delete next[yuranKey];
        return next;
      });
    }
  };

  // Select all unpaid items
  const selectAllUnpaid = (yuran) => {
    const newSelections = {};
    yuran.items?.forEach((item, idx) => {
      const isNotApplicable = item.applicable === false || item.status === 'not_applicable';
      const isPaid = item.status === 'paid' || item.balance <= 0;
      if (!isNotApplicable && !isPaid) {
        newSelections[`${yuran.yuran_id}-${idx}`] = { yuranId: yuran.yuran_id, itemIdx: idx, item };
      }
    });
    setSelectedItems(prev => ({ ...prev, ...newSelections }));
    setPresetSelectionMeta((prev) => {
      const yuranKey = String(yuran.yuran_id || '');
      if (!yuranKey || !prev[yuranKey]) return prev;
      const next = { ...prev };
      delete next[yuranKey];
      return next;
    });
  };

  // Clear all selections for a yuran
  const clearSelection = (yuranId) => {
    setSelectedItems(prev => {
      const newState = { ...prev };
      Object.keys(newState).forEach(k => {
        if (k.startsWith(`${yuranId}-`)) {
          delete newState[k];
        }
      });
      return newState;
    });
    setPresetSelectionMeta((prev) => {
      const yuranKey = String(yuranId || '');
      if (!yuranKey || !prev[yuranKey]) return prev;
      const next = { ...prev };
      delete next[yuranKey];
      return next;
    });
  };

  const applyInstallmentPreset = (yuran, targetAmount, installmentMeta = null) => {
    const unpaidApplicableItems = (yuran.items || [])
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => {
        const isNotApplicable = item.applicable === false || item.status === 'not_applicable';
        const isPaid = item.status === 'paid' || Number(item.balance || 0) <= 0;
        return !isNotApplicable && !isPaid;
      })
      .sort((a, b) => Number(a.item.balance || a.item.amount || 0) - Number(b.item.balance || b.item.amount || 0));

    if (unpaidApplicableItems.length === 0) {
      toast.info('Tiada item tertunggak yang boleh dipilih untuk ansuran.');
      return;
    }

    const totalPayable = unpaidApplicableItems.reduce(
      (sum, entry) => sum + Number(entry.item.balance || entry.item.amount || 0),
      0
    );
    if (totalPayable <= 0) {
      toast.info('Tiada baki item untuk preset ansuran.');
      return;
    }

    const maxPayments = Math.max(1, Number(installmentMeta?.max_payments || 1));
    const paymentsMade = Math.max(0, Number(installmentMeta?.payments_made || 0));
    const remainingInstallments = Math.max(1, maxPayments - paymentsMade);

    let effectiveTarget = Number(targetAmount || 0);
    if (!Number.isFinite(effectiveTarget) || effectiveTarget <= 0) {
      effectiveTarget = totalPayable / remainingInstallments;
    }
    // Elak situasi target terlalu tinggi (contoh kes data lama), supaya preset tidak auto pilih semua item.
    if (effectiveTarget >= totalPayable && remainingInstallments > 1) {
      effectiveTarget = totalPayable / remainingInstallments;
    }
    effectiveTarget = Math.max(0.01, Math.min(effectiveTarget, totalPayable));

    const selectedByPreset = [];
    let runningTotal = 0;
    for (const entry of unpaidApplicableItems) {
      const amount = Number(entry.item.balance || entry.item.amount || 0);
      if (amount <= 0) continue;
      const nextTotal = runningTotal + amount;

      if (nextTotal < effectiveTarget) {
        selectedByPreset.push(entry);
        runningTotal = nextTotal;
        continue;
      }

      const diffIfSkip = Math.abs(effectiveTarget - runningTotal);
      const diffIfTake = Math.abs(nextTotal - effectiveTarget);
      if (selectedByPreset.length === 0 || diffIfTake <= diffIfSkip) {
        selectedByPreset.push(entry);
        runningTotal = nextTotal;
      }
      break;
    }

    if (selectedByPreset.length === 0 && unpaidApplicableItems.length > 0) {
      const first = unpaidApplicableItems[0];
      selectedByPreset.push(first);
      runningTotal = Number(first.item.balance || first.item.amount || 0);
    }

    setSelectedItems((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${yuran.yuran_id}-`)) {
          delete next[key];
        }
      });
      selectedByPreset.forEach(({ item, idx }) => {
        next[`${yuran.yuran_id}-${idx}`] = { yuranId: yuran.yuran_id, itemIdx: idx, item };
      });
      return next;
    });
    setPresetSelectionMeta((prev) => ({
      ...prev,
      [String(yuran.yuran_id)]: {
        selectedAmount: Number(runningTotal.toFixed(2)),
        targetAmount: Number(effectiveTarget.toFixed(2)),
        selectedCount: selectedByPreset.length,
      },
    }));

    toast.success(`Preset ansuran dipilih: RM ${runningTotal.toFixed(2)} (${selectedByPreset.length} item).`);
  };

  // Show message if no student selected
  if (!selectedStudent) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <Users className="w-16 h-16 mx-auto text-slate-300 mb-4" />
        <h3 className="text-lg font-bold text-slate-800 mb-2">Pilih Anak</h3>
        <p className="text-slate-500">Sila klik pada kad anak di atas untuk melihat senarai yuran.</p>
      </div>
    );
  }

  if (!filteredYuranList || filteredYuranList.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
        <h3 className="text-xl font-bold text-slate-800 mb-2">Tahniah!</h3>
        <p className="text-slate-500">Tiada yuran tertunggak untuk {selectedStudent?.student_name}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredYuranList.map((yuran, index) => {
        const selectedCount = getSelectedCount(yuran.yuran_id);
        const selectedTotal = getSelectedTotal(yuran.yuran_id);
        const isMuslimStudentProfile = yuran.student_religion === 'Islam' || yuran.religion === 'Islam';
        const payableItems = (yuran.items || []).filter((item) => {
          const isNonMuslimOnly = item.bukan_islam_only === true || item.non_muslim_only === true;
          const isNotApplicable = item.applicable === false ||
            item.status === 'not_applicable' ||
            (isMuslimStudentProfile && isNonMuslimOnly) ||
            (!isMuslimStudentProfile && item.islam_only);
          const isPaid = item.status === 'paid' || Number(item.balance || 0) <= 0;
          return !isNotApplicable && !isPaid;
        });
        const unpaidCount = payableItems.length;
        const totalYuranKenaBayar = payableItems.reduce(
          (sum, item) => sum + Number(item.balance || item.amount || 0),
          0
        );
        const dueMeta = getDueMeta(yuran.due_date, yuran.days_to_due);
        const installmentPlan = twoPaymentPlans.find((plan) => String(plan.yuran_id) === String(yuran.yuran_id));
        const installmentMeta = installmentPlan?.two_payment_plan || null;
        const nextInstallmentAmount = Number(installmentMeta?.next_payment_amount || 0);
        const maxInstallmentPayments = Math.max(0, Number(installmentMeta?.max_payments || 0));
        const paymentsMadeInstallment = Math.max(0, Number(installmentMeta?.payments_made || 0));
        const remainingInstallmentCount = maxInstallmentPayments > 0
          ? Math.max(0, maxInstallmentPayments - paymentsMadeInstallment)
          : 0;
        const presetMeta = presetSelectionMeta[String(yuran.yuran_id)] || null;
        const presetSelectedAmount = Number(presetMeta?.selectedAmount || 0);
        const presetTargetAmount = Number(presetMeta?.targetAmount || 0);
        const presetDiffAmount = Number((presetSelectedAmount - presetTargetAmount).toFixed(2));
        const presetHasDiff = Math.abs(presetDiffAmount) >= 0.01;
        
        return (
          <motion.div
            key={yuran.yuran_id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
            data-testid={`yuran-detail-${yuran.yuran_id}`}
          >
            {/* Simple Header - Just set name */}
            <div className="px-5 py-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-800">{yuran.set_name}</h3>
                  <p className="text-sm text-slate-500">Tahun {yuran.tahun}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Jumlah Item</p>
                  <p className="font-semibold text-slate-700">{yuran.items?.length || 0} item</p>
                  {nextInstallmentAmount > 0 && (
                    <div className="mt-0.5">
                      <p className="text-[11px] text-violet-600 font-semibold">
                        Ansuran cadangan: RM {nextInstallmentAmount.toFixed(2)}
                      </p>
                      <p className="text-[11px] text-slate-600 font-medium">
                        Jumlah yuran kena bayar: RM {totalYuranKenaBayar.toFixed(2)}
                      </p>
                      {maxInstallmentPayments > 0 && (
                        <p className="text-[10px] text-slate-500">
                          Cadangan ini ikut tetapan bendahari: maksimum {maxInstallmentPayments} kali ansuran
                          {remainingInstallmentCount > 0 ? ` (baki ${remainingInstallmentCount} kali lagi).` : '.'}
                        </p>
                      )}
                    </div>
                  )}
                  {dueMeta && (
                    <div className="mt-1 flex flex-col items-end gap-1">
                      <p className="text-[11px] text-slate-500">{dueMeta.dueDate.toLocaleDateString('ms-MY')}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${getDueBadgeTone(dueMeta.daysToDue)}`}>
                        {getDueBadgeLabel(dueMeta.daysToDue)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Quick Actions */}
            {unpaidCount > 0 && (
              <>
                <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                  <span className="text-sm text-blue-700">
                    {selectedCount > 0 ? (
                      <span className="font-semibold">{selectedCount} item dipilih (RM {selectedTotal.toFixed(2)})</span>
                    ) : (
                      <span>Pilih item untuk bayar</span>
                    )}
                  </span>
                  <div className="flex gap-2">
                    {selectedCount > 0 && (
                      <button
                        onClick={() => clearSelection(yuran.yuran_id)}
                        className="text-xs px-3 py-1.5 min-h-[44px] text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        Batal
                      </button>
                    )}
                    {nextInstallmentAmount > 0 && (
                      <div className="flex items-center gap-1">
                        <button
                        onClick={() => applyInstallmentPreset(yuran, nextInstallmentAmount, installmentMeta)}
                          className="text-xs px-3 py-1.5 min-h-[44px] bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
                        >
                          Preset Ansuran
                        </button>
                        <div className="relative group">
                          <button
                            type="button"
                            className="min-h-[36px] min-w-[36px] rounded-lg border border-violet-200 bg-white text-violet-600 hover:bg-violet-50 transition-colors flex items-center justify-center"
                            aria-label="Info preset ansuran"
                          >
                            <Info size={14} />
                          </button>
                          <div className="pointer-events-none absolute right-0 top-full mt-1 w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 shadow-lg opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 z-20">
                            Preset ansuran auto pilih item tertunggak sehingga capai jumlah ansuran cadangan. Butang <strong>Pilih Semua</strong> pula memilih semua item tertunggak.
                          </div>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => selectAllUnpaid(yuran)}
                      className="text-xs px-3 py-1.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Pilih Semua
                    </button>
                  </div>
                </div>

                {nextInstallmentAmount > 0 && (
                  <div className="px-5 py-2.5 bg-violet-50 border-b border-violet-100">
                    <div className="flex items-start gap-2">
                      <Info size={14} className="text-violet-600 mt-0.5 flex-shrink-0" />
                      <div className="text-[11px] text-violet-700 space-y-0.5">
                        <p className="font-semibold">Parent boleh bayar ansuran.</p>
                        <p>
                          <strong>Preset Ansuran</strong> memilih item secara automatik ikut jumlah ansuran cadangan.
                          <strong> Pilih Semua</strong> memilih semua item tertunggak.
                        </p>
                        <p>Cara mudah: tekan Preset Ansuran → semak item dipilih → klik “Tambah Item Dipilih”.</p>
                        {presetMeta && (
                          <div className={`mt-1.5 rounded-lg border px-2 py-1.5 ${
                            presetHasDiff
                              ? 'border-violet-200 bg-white/80 text-violet-700'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          }`}>
                            <p className="font-semibold">
                              Preset pilih RM {presetSelectedAmount.toFixed(2)} daripada sasaran RM {presetTargetAmount.toFixed(2)}.
                            </p>
                            <p className="mt-0.5">
                              {presetHasDiff
                                ? `${presetDiffAmount > 0 ? 'Lebih' : 'Kurang'} RM ${Math.abs(presetDiffAmount).toFixed(2)} daripada sasaran.`
                                : 'Jumlah preset sepadan dengan sasaran ansuran.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            
            {/* Item List - Always visible */}
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {yuran.items?.map((item, idx) => {
                      // Check if student is Muslim
                      const isMuslimStudent = yuran.student_religion === 'Islam' || yuran.religion === 'Islam';
                      
                      // Item is for non-Muslims only (bukan_islam_only flag or explicitly marked)
                      const isNonMuslimOnly = item.bukan_islam_only === true || item.non_muslim_only === true;
                      
                      // Item is not applicable if:
                      // 1. Already marked as not applicable
                      // 2. Muslim student + non-Muslim only item
                      // 3. Non-Muslim student + Islam only item
                      const isNotApplicable = item.applicable === false || 
                                              item.status === 'not_applicable' ||
                                              (isMuslimStudent && isNonMuslimOnly) ||
                                              (!isMuslimStudent && item.islam_only);
                      
                      const isPaid = item.status === 'paid' || item.balance <= 0;
                      const isSelected = isItemSelected(yuran.yuran_id, idx);
                      const canSelect = !isNotApplicable && !isPaid;
                      
                      // Determine the reason for not applicable
                      const notApplicableReason = (isMuslimStudent && isNonMuslimOnly) 
                        ? 'Bukan Islam Sahaja' 
                        : (!isMuslimStudent && item.islam_only) 
                          ? 'Islam Sahaja' 
                          : 'Tidak Berkenaan';
                      
                      return (
                        <div 
                          key={idx} 
                          className={`px-5 py-3 flex items-center gap-3 transition-colors ${
                            isNotApplicable ? 'bg-slate-50 opacity-60' :
                            isPaid ? 'bg-emerald-50/50' : 
                            isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* Checkbox / Status Icon */}
                          <div className="flex-shrink-0">
                            {isPaid ? (
                              // Paid - Show checkmark
                              <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                                <Check size={14} className="text-white" />
                              </div>
                            ) : isNotApplicable ? (
                              // Not applicable - Show X
                              <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center">
                                <X size={14} className="text-white" />
                              </div>
                            ) : (
                              // Unpaid - Checkbox
                              <button
                                onClick={() => toggleItemSelection(yuran.yuran_id, idx, item)}
                                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                                  isSelected 
                                    ? 'bg-blue-600 border-blue-600' 
                                    : 'border-slate-300 hover:border-blue-400'
                                }`}
                                data-testid={`checkbox-${yuran.yuran_id}-${idx}`}
                              >
                                {isSelected && <Check size={14} className="text-white" />}
                              </button>
                            )}
                          </div>
                          
                          {/* Item Info */}
                          <div 
                            className={`flex-1 min-w-0 ${canSelect ? 'cursor-pointer' : ''}`}
                            onClick={() => canSelect && toggleItemSelection(yuran.yuran_id, idx, item)}
                          >
                            <p className={`text-sm font-medium ${
                              isNotApplicable ? 'text-slate-400' : 
                              isPaid ? 'text-emerald-700' : 'text-slate-700'
                            }`}>
                              {item.name}
                              {item.islam_only && (
                                <span className="ml-1.5 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Islam</span>
                              )}
                              {isNonMuslimOnly && (
                                <span className="ml-1.5 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">Bukan Islam</span>
                              )}
                            </p>
                            {item.category && (
                              <p className="text-xs text-slate-500">{item.category} › {item.sub_category}</p>
                            )}
                          </div>
                          
                          {/* Amount / Status */}
                          <div className="text-right flex-shrink-0">
                            {isNotApplicable ? (
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-xs text-slate-400 line-through">RM {(item.amount || 0).toFixed(2)}</span>
                                <span className="text-xs px-2 py-1 bg-slate-200 text-slate-500 rounded-full">{notApplicableReason}</span>
                              </div>
                            ) : isPaid ? (
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-sm text-emerald-600 line-through">RM {(item.amount || 0).toFixed(2)}</span>
                                <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full font-medium">LUNAS</span>
                              </div>
                            ) : (
                              <span className={`text-sm font-bold ${isSelected ? 'text-blue-600' : 'text-red-600'}`}>
                                RM {(item.balance || item.amount || 0).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
            </div>
            
            {/* Footer Actions - Dynamic based on selection */}
            <div className="px-5 py-4 flex items-center justify-between bg-white border-t border-slate-100">
              <div className="text-sm text-slate-500">
                <Link
                  to="/payments-parent"
                  className="font-medium text-teal-700 hover:text-teal-800 hover:underline"
                  title="Lihat sejarah bayaran"
                >
                  Jumlah telah dibayar:
                </Link>{' '}
                RM {(yuran.paid_amount || 0).toFixed(2)} / RM {(yuran.total_amount || 0).toFixed(2)}
              </div>
              
              {selectedCount > 0 ? (
                // Show add selected items button
                <button
                  onClick={() => handleAddSelectedToCart(yuran)}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl text-sm font-semibold hover:from-emerald-600 hover:to-teal-600 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/25"
                  data-testid={`add-selected-btn-${yuran.yuran_id}`}
                >
                  <ShoppingBag size={16} />
                  Tambah {selectedCount} Item (RM {selectedTotal.toFixed(2)})
                </button>
              ) : (
                // Show bayar semua button
                <button
                  onClick={() => onAddToCart(yuran)}
                  className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:from-teal-700 hover:to-violet-700 transition-colors flex items-center gap-2 shadow-lg shadow-pastel-sm"
                  data-testid={`add-cart-btn-${yuran.yuran_id}`}
                >
                  <CreditCard size={16} />
                  Bayar Semua
                </button>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

// ============ PAYMENT SUMMARY SIDEBAR (Static - Right side) ============
const PaymentSummaryCard = ({
  totalOutstanding,
  breakdown,
  onOpenCart,
  cartCount,
  cartTotal = 0,
  childrenCount = 0,
  outstandingYuranCount = 0,
  dueSoonCount = 0,
  overdueCount = 0,
  safeMinimumCount = 0,
  safeMinimumAmount = 0,
  safeMinimumCoveragePercent = 100,
  onAddMinimumSafe,
  addingMinimumSafe = false,
  checkoutCoveragePercent = 0,
  checkoutConfidenceLabel = '',
  checkoutConfidenceTone = 'slate',
  onAddAllYuran,
  addingAllYuran = false,
}) => {
  const confidenceToneClass = checkoutConfidenceTone === 'emerald'
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : checkoutConfidenceTone === 'red'
      ? 'text-red-700 bg-red-50 border-red-200'
      : checkoutConfidenceTone === 'amber'
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-slate-700 bg-slate-50 border-slate-200';
  const confidenceBarClass = checkoutConfidenceTone === 'emerald'
    ? 'from-emerald-500 to-teal-500'
    : checkoutConfidenceTone === 'red'
      ? 'from-red-500 to-rose-500'
      : checkoutConfidenceTone === 'amber'
        ? 'from-amber-500 to-orange-500'
        : 'from-slate-500 to-slate-600';

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Total Outstanding - padat pada mobile */}
      <div className="bg-gradient-to-br from-slate-900 via-teal-900 to-violet-900 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-white">
        <p className="text-white/70 text-xs sm:text-sm font-medium">Jumlah Perlu Dibayar</p>
        <p className="text-2xl sm:text-3xl font-bold mt-0.5 sm:mt-1">
          RM {(totalOutstanding || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90">
          <Users size={12} />
          {childrenCount} anak
        </div>
        
        {/* Breakdown */}
        {breakdown && (
          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/10 space-y-1.5 sm:space-y-2">
            {breakdown.yuran > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-white/70">Yuran Anak</span>
                <span>RM {breakdown.yuran.toFixed(2)}</span>
              </div>
            )}
            {breakdown.bus > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-white/70">Tiket Bas</span>
                <span>RM {breakdown.bus.toFixed(2)}</span>
              </div>
            )}
            {breakdown.infaq > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-white/70">Sumbangan</span>
                <span>RM {breakdown.infaq.toFixed(2)}</span>
              </div>
            )}
            {breakdown.koperasi > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-white/70">Koperasi</span>
                <span>RM {breakdown.koperasi.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`rounded-xl border px-3 py-3 ${confidenceToneClass}`}>
        <div className="flex items-center justify-between text-xs font-semibold">
          <span>Confidence Checkout</span>
          <span>{Math.max(0, Math.min(100, Number(checkoutCoveragePercent || 0)))}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/70 overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${confidenceBarClass}`}
            style={{ width: `${Math.max(0, Math.min(100, Number(checkoutCoveragePercent || 0)))}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed">
          {checkoutConfidenceLabel || 'Semak troli sebelum checkout untuk kurangkan risiko tertinggal item penting.'}
        </p>
      </div>

      {safeMinimumCount > 0 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-3">
          <p className="text-xs font-semibold text-violet-800">Bayaran Minimum Selamat</p>
          <p className="text-lg font-bold text-violet-700 mt-1">
            RM {Number(safeMinimumAmount || 0).toFixed(2)}
          </p>
          <p className="text-[11px] text-violet-700 mt-1">
            {safeMinimumCount} rekod kritikal (lewat / 7 hari). Liputan dalam troli: {safeMinimumCoveragePercent}%.
          </p>
          <button
            type="button"
            onClick={onAddMinimumSafe}
            disabled={addingMinimumSafe}
            className="mt-2 w-full min-h-[44px] rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors disabled:opacity-60"
          >
            {addingMinimumSafe ? 'Menambah...' : 'Tambah Minimum Selamat'}
          </button>
        </div>
      )}
      
      {outstandingYuranCount > 0 && (
        <button
          type="button"
          onClick={onAddAllYuran}
          disabled={addingAllYuran}
          className="w-full min-h-[44px] py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold hover:from-amber-600 hover:to-orange-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          data-testid="add-all-yuran-btn"
        >
          {addingAllYuran ? <Spinner size="sm" /> : <CreditCard size={18} />}
          Tambah Semua Yuran ({outstandingYuranCount})
        </button>
      )}

      {overdueCount > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {overdueCount} rekod yuran sudah melepasi tarikh akhir.
        </div>
      )}
      {dueSoonCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {dueSoonCount} rekod yuran akan tamat tempoh dalam 7 hari.
        </div>
      )}

      {/* Cart Button - Only show if has items */}
      {cartCount > 0 && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onOpenCart}
          className="w-full py-4 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-semibold hover:from-red-600 hover:to-rose-700 transition-colors flex items-center justify-center gap-3 shadow-lg shadow-red-500/25"
          data-testid="open-cart-btn"
        >
          <ShoppingBag size={20} />
          Lihat Troli ({cartCount} item) - RM {Number(cartTotal || 0).toFixed(2)}
        </motion.button>
      )}
    </div>
  );
};

const PaymentUrgencyCenter = ({ urgentItems = [], onQuickAdd, onOpenReminder, isInCart }) => {
  if (!urgentItems.length) return null;

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs sm:text-sm font-bold text-slate-800">Keutamaan Minggu Ini</h3>
        <span className="text-[11px] text-slate-500">{urgentItems.length} rekod</span>
      </div>
      <div className="space-y-2">
        {urgentItems.map((item) => {
          const inCart = isInCart(item.item_id || item.yuran_id);
          return (
            <div key={item.item_id || item.yuran_id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.student_name}</p>
                  <p className="text-xs text-slate-500 truncate">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {item._dueMeta ? item._dueMeta.dueDate.toLocaleDateString('ms-MY') : 'Tarikh akhir tidak tersedia'}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-red-600">RM {(item.amount || 0).toFixed(2)}</p>
                  {item._dueMeta && (
                    <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${getDueBadgeTone(item._dueMeta.daysToDue)}`}>
                      {getDueBadgeLabel(item._dueMeta.daysToDue)}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onQuickAdd(item)}
                  disabled={inCart}
                  className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors ${
                    inCart ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  {inCart ? 'Dalam Troli' : 'Tambah'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenReminder(item)}
                  className="min-h-[44px] rounded-lg text-xs font-semibold bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                >
                  Ingatkan
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PushReadinessCard = ({
  status = {},
  loading = false,
  scheduledReminderCount = 0,
  onOpenPushSettings,
  onRefresh,
}) => {
  const configured = Boolean(status?.configured);
  const isSubscribed = Boolean(status?.is_subscribed);
  const deviceCount = Math.max(0, Number(status?.device_count || 0));

  let badgeLabel = 'Perlu Tindakan';
  let badgeTone = 'bg-amber-100 text-amber-700';
  let title = 'Push belum diaktifkan';
  let description = 'Reminder masih akan dihantar dalam app. Aktifkan push supaya peringatan muncul walaupun aplikasi ditutup.';
  let buttonLabel = 'Aktifkan Push Sekarang';

  if (!configured) {
    badgeLabel = 'Belum Konfigurasi';
    badgeTone = 'bg-slate-200 text-slate-700';
    title = 'Push belum disediakan di server';
    description = 'Sistem masih hantar in-app reminder. Jika anda perlukan popup notifikasi, hubungi pentadbir untuk aktifkan konfigurasi push.';
    buttonLabel = 'Buka Pusat Notifikasi';
  } else if (isSubscribed) {
    badgeLabel = 'Aktif';
    badgeTone = 'bg-emerald-100 text-emerald-700';
    title = `Push aktif pada ${deviceCount} peranti`;
    description = scheduledReminderCount > 0
      ? `${scheduledReminderCount} reminder dijadualkan. Sistem akan cuba hantar in-app + push.`
      : 'Push sudah aktif. Reminder akan dihantar sebagai in-app dan push bila ada jadual.';
    buttonLabel = 'Urus Push Notification';
  }

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-teal-600" />
          <h3 className="text-xs sm:text-sm font-bold text-slate-800">Status Push Reminder</h3>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="min-h-[32px] px-2 rounded-lg text-xs text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Semak
        </button>
      </div>

      {loading ? (
        <div className="py-4 flex items-center justify-center text-slate-500">
          <Spinner size="sm" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-800">{title}</p>
              <p className="text-[11px] text-slate-600 mt-1">{description}</p>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeTone}`}>
              {badgeLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenPushSettings}
            className="mt-3 w-full min-h-[42px] rounded-lg bg-gradient-to-r from-teal-500 to-violet-500 text-white text-xs font-semibold hover:from-teal-600 hover:to-violet-600 transition-colors"
          >
            {buttonLabel}
          </button>
        </>
      )}
    </div>
  );
};

// ============ MAIN COMPONENT ============
const NewPaymentCenterLayout = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { cart, fetchCart, clearCart: clearCartContext, removeFromCart } = useCart();
  
  // State
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [addingAllYuran, setAddingAllYuran] = useState(false);
  const [addingMinimumSafe, setAddingMinimumSafe] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [reminderDaysBefore, setReminderDaysBefore] = useState(3);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [schedulingReminder, setSchedulingReminder] = useState(false);
  const [reminderPreferences, setReminderPreferences] = useState(DEFAULT_REMINDER_PREFERENCES);
  const [loadingReminderPreferences, setLoadingReminderPreferences] = useState(false);
  const [savingReminderPreferences, setSavingReminderPreferences] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [cancellingReminderId, setCancellingReminderId] = useState('');
  const [pushStatus, setPushStatus] = useState({
    configured: false,
    is_subscribed: false,
    device_count: 0,
  });
  const [loadingPushStatus, setLoadingPushStatus] = useState(false);
  
  // Data state
  const [pendingItems, setPendingItems] = useState({
    yuran: [],
    yuran_detailed: [],
    two_payments: [],
    koperasi: [],
    bus: [],
    infaq: []
  });
  // Receipt modal (untuk papar resit selepas checkout)
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  // ============ DATA FETCHING ============
  const fetchPendingItems = useCallback(async () => {
    try {
      const res = await api.get('/api/payment-center/pending-items');
      setPendingItems(res.data);
      
      const studentIdFromUrl = searchParams.get('student');
      const yuranList = res.data?.yuran || [];
      
      // Pre-select student from URL (from /yuran "Bayar Sekarang") or first student
      setSelectedStudent(prev => {
        if (studentIdFromUrl && yuranList.length > 0) {
          const fromUrl = yuranList.find(y => String(y.student_id) === String(studentIdFromUrl));
          if (fromUrl) return fromUrl;
        }
        if (!prev && yuranList.length > 0) return yuranList[0];
        return prev;
      });
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Gagal memuatkan data pending items.'));
    }
  }, [searchParams]);

  const fetchReminderPreferences = useCallback(async (silent = false) => {
    if (!silent) setLoadingReminderPreferences(true);
    try {
      const res = await api.get('/api/payment-center/reminder-preferences');
      setReminderPreferences({
        default_days_before: Number(res.data?.default_days_before ?? DEFAULT_REMINDER_PREFERENCES.default_days_before),
        default_time: String(res.data?.default_time || DEFAULT_REMINDER_PREFERENCES.default_time),
        default_source: String(res.data?.default_source || DEFAULT_REMINDER_PREFERENCES.default_source),
      });
    } catch (err) {
      if (!silent) {
        toast.error(getUserFriendlyError(err, 'Gagal memuatkan tetapan reminder.'));
      }
    } finally {
      if (!silent) setLoadingReminderPreferences(false);
    }
  }, []);

  const fetchReminders = useCallback(async (silent = false) => {
    if (!silent) setLoadingReminders(true);
    try {
      const res = await api.get('/api/payment-center/reminders', {
        params: { limit: 30 },
      });
      setReminders(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (err) {
      if (!silent) {
        toast.error(getUserFriendlyError(err, 'Gagal memuatkan senarai reminder.'));
      }
    } finally {
      if (!silent) setLoadingReminders(false);
    }
  }, []);

  const fetchPushStatus = useCallback(async (silent = false) => {
    if (!silent) setLoadingPushStatus(true);
    try {
      const [statusRes, keyRes] = await Promise.all([
        api.get('/api/notifications/push/status'),
        api.get('/api/notifications/push/public-key'),
      ]);
      const publicKey = String(keyRes?.data?.public_key || '').trim();
      setPushStatus({
        configured: Boolean(keyRes?.data?.configured || publicKey),
        is_subscribed: Boolean(statusRes?.data?.is_subscribed),
        device_count: Math.max(0, Number(statusRes?.data?.device_count || 0)),
      });
    } catch (err) {
      if (!silent) {
        toast.error(getUserFriendlyError(err, 'Gagal menyemak status push notification.'));
      }
    } finally {
      if (!silent) setLoadingPushStatus(false);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchCart(), fetchPendingItems(), fetchReminders(), fetchReminderPreferences(), fetchPushStatus(true)]);
      setLoading(false);
    };
    loadData();
  }, [fetchCart, fetchPendingItems, fetchReminders, fetchReminderPreferences, fetchPushStatus]);

  const pushReturnHandledRef = React.useRef(false);
  useEffect(() => {
    const pushParam = String(searchParams.get('push') || '').toLowerCase();
    if (pushParam !== 'activated' || pushReturnHandledRef.current) return;
    pushReturnHandledRef.current = true;
    toast.success('Push notification aktif. Reminder kini boleh dihantar terus ke peranti anda.');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('push');
    const nextQuery = nextParams.toString();
    navigate(nextQuery ? `/payment-center?${nextQuery}` : '/payment-center', { replace: true });
  }, [searchParams, navigate]);

  const handleSaveReminderPreferences = useCallback(async () => {
    const safeDays = Math.max(0, Math.min(30, Number(reminderPreferences?.default_days_before ?? 3)));
    const safeTime = String(reminderPreferences?.default_time || '').trim();
    const safeSource = reminderPreferences?.default_source === 'ics_download' ? 'ics_download' : 'google_calendar';

    if (!/^\d{2}:\d{2}$/.test(safeTime)) {
      toast.error('Format masa tidak sah. Guna format HH:MM.');
      return;
    }

    setSavingReminderPreferences(true);
    try {
      const res = await api.put('/api/payment-center/reminder-preferences', {
        default_days_before: safeDays,
        default_time: safeTime,
        default_source: safeSource,
      });
      const prefs = res.data?.preferences || {};
      setReminderPreferences({
        default_days_before: Number(prefs.default_days_before ?? safeDays),
        default_time: String(prefs.default_time || safeTime),
        default_source: String(prefs.default_source || safeSource),
      });
      toast.success('Tetapan reminder disimpan.');
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Gagal menyimpan tetapan reminder.'));
    } finally {
      setSavingReminderPreferences(false);
    }
  }, [reminderPreferences]);

  const isYuranInCart = useCallback((yuranId) => {
    const id = String(yuranId || '');
    if (!id) return false;
    return (cart?.items || []).some((item) =>
      (item.item_type === 'yuran' || item.item_type === 'yuran_partial' || item.item_type === 'yuran_two_payment') &&
      String(item.item_id) === id
    );
  }, [cart]);

  // From /yuran: auto-add specified yuran to cart and open cart (once per landing)
  const addedFromUrlRef = React.useRef(false);
  useEffect(() => {
    if (loading || addedFromUrlRef.current) return;
    const yuranIdFromUrl = searchParams.get('yuran');
    if (!yuranIdFromUrl || !pendingItems?.yuran?.length) return;
    const yuran = pendingItems.yuran.find(y => String(y.yuran_id || y.item_id) === String(yuranIdFromUrl));
    if (!yuran) return;
    addedFromUrlRef.current = true;
    api.post('/api/payment-center/cart/add', {
      item_type: 'yuran',
      item_id: yuran.yuran_id || yuran.item_id,
      quantity: 1
    })
      .then(() => { fetchCart(); setIsCartOpen(true); toast.success('Yuran ditambah ke troli. Sila selesaikan bayaran di bawah.'); })
      .catch((err) => {
        const detail = String(err?.response?.data?.detail || '').toLowerCase();
        if (detail.includes('sudah ada')) {
          fetchCart();
          setIsCartOpen(true);
          return;
        }
        toast.error(getUserFriendlyError(err, 'Gagal menambah yuran ke troli.'));
      });
  }, [loading, searchParams, pendingItems, fetchCart]);

  const handleAddAllOutstandingYuranToCart = useCallback(async (openCart = true) => {
    const outstandingYuran = (pendingItems?.yuran || []).filter((item) => Number(item.amount || 0) > 0);
    if (outstandingYuran.length === 0) {
      toast.info('Tiada tunggakan yuran untuk ditambah.');
      return;
    }

    const yuranIdsInCart = new Set(
      (cart?.items || [])
        .filter((item) => item.item_type === 'yuran' || item.item_type === 'yuran_partial' || item.item_type === 'yuran_two_payment')
        .map((item) => String(item.item_id))
    );

    const toAdd = outstandingYuran.filter((item) => {
      const itemId = String(item.yuran_id || item.item_id || '');
      return itemId && !yuranIdsInCart.has(itemId);
    });

    if (toAdd.length === 0) {
      toast.info('Semua yuran tertunggak sudah ada dalam troli.');
      if (openCart && (cart?.items?.length || 0) > 0) {
        setIsCartOpen(true);
      }
      return;
    }

    setAddingAllYuran(true);
    let addedCount = 0;
    let failedCount = 0;
    let firstError = null;
    try {
      for (const item of toAdd) {
        const itemId = String(item.yuran_id || item.item_id || '');
        if (!itemId) continue;
        try {
          await api.post('/api/payment-center/cart/add', {
            item_type: 'yuran',
            item_id: itemId,
            quantity: 1,
          });
          addedCount += 1;
        } catch (err) {
          const detail = String(err?.response?.data?.detail || '').toLowerCase();
          if (detail.includes('sudah ada')) {
            continue;
          }
          failedCount += 1;
          if (!firstError) firstError = err;
        }
      }

      await fetchCart();

      if (addedCount > 0) {
        toast.success(`${addedCount} tunggakan yuran ditambah ke troli.`);
        if (openCart) setIsCartOpen(true);
      }
      if (failedCount > 0) {
        toast.error(getUserFriendlyError(firstError, `${failedCount} item gagal ditambah ke troli.`));
      }
    } finally {
      setAddingAllYuran(false);
    }
  }, [pendingItems, cart, fetchCart]);

  const handleAddMinimumSafeYuranToCart = useCallback(async (openCart = true) => {
    const urgentOutstanding = (pendingItems?.yuran || [])
      .filter((item) => Number(item.amount || 0) > 0)
      .map((item) => ({ ...item, _dueMeta: getDueMeta(item.due_date, item.days_to_due) }))
      .filter((item) => item._dueMeta && item._dueMeta.daysToDue <= 7);

    if (urgentOutstanding.length === 0) {
      toast.info('Tiada rekod kritikal untuk minimum selamat.');
      return;
    }

    const yuranIdsInCart = new Set(
      (cart?.items || [])
        .filter((item) => item.item_type === 'yuran' || item.item_type === 'yuran_partial' || item.item_type === 'yuran_two_payment')
        .map((item) => String(item.item_id))
    );

    const toAdd = urgentOutstanding.filter((item) => {
      const itemId = String(item.yuran_id || item.item_id || '');
      return itemId && !yuranIdsInCart.has(itemId);
    });

    if (toAdd.length === 0) {
      toast.info('Semua rekod minimum selamat sudah ada dalam troli.');
      if (openCart && (cart?.items?.length || 0) > 0) {
        setIsCartOpen(true);
      }
      return;
    }

    setAddingMinimumSafe(true);
    let addedCount = 0;
    let failedCount = 0;
    let firstError = null;
    try {
      for (const item of toAdd) {
        const itemId = String(item.yuran_id || item.item_id || '');
        if (!itemId) continue;
        try {
          await api.post('/api/payment-center/cart/add', {
            item_type: 'yuran',
            item_id: itemId,
            quantity: 1,
          });
          addedCount += 1;
        } catch (err) {
          const detail = String(err?.response?.data?.detail || '').toLowerCase();
          if (detail.includes('sudah ada')) {
            continue;
          }
          failedCount += 1;
          if (!firstError) firstError = err;
        }
      }

      await fetchCart();

      if (addedCount > 0) {
        toast.success(`${addedCount} rekod minimum selamat ditambah ke troli.`);
        if (openCart) setIsCartOpen(true);
      }
      if (failedCount > 0) {
        toast.error(getUserFriendlyError(firstError, `${failedCount} item gagal ditambah ke troli.`));
      }
    } finally {
      setAddingMinimumSafe(false);
    }
  }, [pendingItems, cart, fetchCart]);

  // From /yuran: auto-add all outstanding yuran to cart and open cart.
  const addedAllFromUrlRef = React.useRef(false);
  useEffect(() => {
    if (loading || addedAllFromUrlRef.current) return;
    if (searchParams.get('bulk') !== 'all-yuran') return;
    addedAllFromUrlRef.current = true;
    handleAddAllOutstandingYuranToCart(true);
  }, [loading, searchParams, handleAddAllOutstandingYuranToCart]);

  // ============ ACTIONS ============
  const handleQuickAction = (actionId) => {
    switch (actionId) {
      case 'bus': navigate('/bus-tickets'); break;
      case 'tabung': navigate('/tabung'); break;
      case 'marketplace': navigate('/marketplace'); break;
      case 'koperasi': navigate('/koperasi'); break;
      default: break;
    }
  };

  const handleAddToCart = async (yuran) => {
    const yuranId = String(yuran?.yuran_id || yuran?.item_id || '');
    if (!yuranId) {
      toast.error('Rekod yuran tidak sah.');
      return;
    }
    if (isYuranInCart(yuranId)) {
      toast.info('Rekod ini sudah ada dalam troli.');
      setIsCartOpen(true);
      return;
    }
    try {
      await api.post('/api/payment-center/cart/add', {
        item_type: 'yuran',
        item_id: yuranId,
        quantity: 1
      });
      await fetchCart();
      toast.success('Item ditambah ke troli!');
      setIsCartOpen(true); // Open cart slider when item added
    } catch (err) {
      const detail = String(err?.response?.data?.detail || '').toLowerCase();
      if (detail.includes('sudah ada')) {
        toast.info('Rekod ini sudah ada dalam troli.');
        setIsCartOpen(true);
        return;
      }
      toast.error(getUserFriendlyError(err, 'Gagal menambah item ke troli.'));
    }
  };

  // Add specific yuran items to cart
  const handleAddItemsToCart = async (yuran, selectedItems) => {
    try {
      // Format selected items for backend
      const formattedItems = selectedItems.map(item => ({
        name: item.name,
        amount: item.balance || item.amount || 0,
        category: item.category,
        sub_category: item.sub_category
      }));

      // Use yuran_partial type which is supported by backend
      await api.post('/api/payment-center/cart/add', {
        item_type: 'yuran_partial',
        item_id: yuran.yuran_id,
        quantity: 1,
        metadata: {
          selected_items: formattedItems
        }
      });
      
      await fetchCart();
      toast.success(`${selectedItems.length} item ditambah ke troli!`);
      setIsCartOpen(true);
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Gagal menambah item pilihan ke troli.'));
    }
  };

  const handleClearCart = async () => {
    try {
      await clearCartContext();
      setIsCartOpen(false);
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Gagal mengosongkan troli.'));
    }
  };

  const handleRemoveItem = async (cartItemId) => {
    try {
      await removeFromCart(cartItemId);
      // Close cart if empty after removal
      if (cart?.items?.length <= 1) {
        setIsCartOpen(false);
      }
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Gagal membuang item dari troli.'));
    }
  };

  const handleCancelReminder = useCallback(async (reminderId) => {
    if (!reminderId) return;
    setCancellingReminderId(reminderId);
    try {
      await api.delete(`/api/payment-center/reminders/${encodeURIComponent(reminderId)}`);
      toast.success('Reminder dibatalkan.');
      await fetchReminders(true);
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Gagal membatalkan reminder.'));
    } finally {
      setCancellingReminderId('');
    }
  }, [fetchReminders]);

  const openReminderScheduler = useCallback((item) => {
    if (!item) return;
    const dueMeta = item._dueMeta || getDueMeta(item.due_date, item.days_to_due);
    if (!dueMeta) {
      toast.error('Tarikh akhir tidak tersedia untuk rekod ini.');
      return;
    }
    const prefDays = Math.max(0, Number(reminderPreferences?.default_days_before ?? 3));
    let suggestedDaysBefore = prefDays;
    if (Number.isFinite(dueMeta.daysToDue)) {
      if (dueMeta.daysToDue < 0) {
        suggestedDaysBefore = 0;
      } else {
        suggestedDaysBefore = Math.min(prefDays, dueMeta.daysToDue);
      }
    }
    const prefTime = String(reminderPreferences?.default_time || '09:00');
    setReminderTarget({ ...item, _dueMeta: dueMeta });
    setReminderDaysBefore(suggestedDaysBefore);
    setReminderTime(prefTime);
    setShowReminderModal(true);
  }, [reminderPreferences]);

  const buildReminderPayload = useCallback(() => {
    if (!reminderTarget) return null;
    const dueMeta = reminderTarget._dueMeta || getDueMeta(reminderTarget.due_date, reminderTarget.days_to_due);
    if (!dueMeta) return null;

    const safeDaysBefore = Math.max(0, Number(reminderDaysBefore || 0));
    let reminderAt = buildReminderDateTime(dueMeta.dueDate, safeDaysBefore, reminderTime);
    if (reminderAt.getTime() < Date.now()) {
      reminderAt = new Date(Date.now() + 5 * 60 * 1000);
    }

    const title = `Peringatan Yuran - ${reminderTarget.student_name || 'Pelajar'}`;
    const description = [
      `Set Yuran: ${reminderTarget.name || 'Yuran MRSM'}`,
      `Jumlah tertunggak: RM ${(Number(reminderTarget.amount || 0)).toFixed(2)}`,
      `Tarikh akhir: ${dueMeta.dueDate.toLocaleDateString('ms-MY')}`,
      'Portal: MRSMKU Payment Center',
    ].join('\n');

    return {
      title,
      description,
      reminderAt,
      dueDate: dueMeta.dueDate,
      uidSeed: String(reminderTarget.item_id || reminderTarget.yuran_id || reminderTarget.student_id || 'mrsm'),
      daysBefore: safeDaysBefore,
      itemId: String(reminderTarget.item_id || reminderTarget.yuran_id || ''),
      studentId: String(reminderTarget.student_id || ''),
      studentName: reminderTarget.student_name || '',
      setName: reminderTarget.name || 'Yuran MRSM',
      amount: Number(reminderTarget.amount || 0),
    };
  }, [reminderTarget, reminderDaysBefore, reminderTime]);

  const saveReminderToBackend = useCallback(async (payload, source) => {
    if (!payload?.itemId) return false;
    try {
      await api.post('/api/payment-center/reminders', {
        item_id: payload.itemId,
        student_id: payload.studentId,
        student_name: payload.studentName,
        set_name: payload.setName,
        amount: payload.amount,
        due_date: payload.dueDate.toISOString().slice(0, 10),
        remind_at: payload.reminderAt.toISOString(),
        days_before: payload.daysBefore,
        source,
      });
      await fetchReminders(true);
      return true;
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Peringatan in-app gagal disimpan.'));
      return false;
    }
  }, [fetchReminders]);

  const handleScheduleGoogleReminder = useCallback(async () => {
    const payload = buildReminderPayload();
    if (!payload) {
      toast.error('Maklumat peringatan tidak lengkap.');
      return;
    }
    setSchedulingReminder(true);
    try {
      const savedToBackend = await saveReminderToBackend(payload, 'google_calendar');
      openGoogleCalendarReminder(payload);
      saveReminderToLocal({
        title: payload.title,
        reminder_at: payload.reminderAt.toISOString(),
        due_date: payload.dueDate.toISOString(),
        days_before: payload.daysBefore,
        source: 'google_calendar',
        created_at: new Date().toISOString(),
      });
      toast.success(savedToBackend
        ? 'Google Calendar dibuka dan peringatan in-app dijadualkan.'
        : 'Google Calendar dibuka. Sila simpan peringatan.');
      setShowReminderModal(false);
    } finally {
      setSchedulingReminder(false);
    }
  }, [buildReminderPayload, saveReminderToBackend]);

  const handleDownloadReminderFile = useCallback(async () => {
    const payload = buildReminderPayload();
    if (!payload) {
      toast.error('Maklumat peringatan tidak lengkap.');
      return;
    }
    setSchedulingReminder(true);
    try {
      const savedToBackend = await saveReminderToBackend(payload, 'ics_download');
      downloadReminderIcs(payload);
      saveReminderToLocal({
        title: payload.title,
        reminder_at: payload.reminderAt.toISOString(),
        due_date: payload.dueDate.toISOString(),
        days_before: payload.daysBefore,
        source: 'ics_download',
        created_at: new Date().toISOString(),
      });
      toast.success(savedToBackend
        ? 'Fail .ics dimuat turun dan peringatan in-app dijadualkan.'
        : 'Fail peringatan (.ics) dimuat turun.');
      setShowReminderModal(false);
    } finally {
      setSchedulingReminder(false);
    }
  }, [buildReminderPayload, saveReminderToBackend]);

  const handleCheckout = async () => {
    if (!cart?.items || cart.items.length === 0) {
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
      setIsCartOpen(false);

      await Promise.all([fetchCart(), fetchPendingItems()]);
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Pembayaran gagal.'));
    } finally {
      setProcessing(false);
    }
  };

  // ============ CALCULATIONS ============
  const totalOutstanding = (pendingItems.yuran || []).reduce((sum, y) => sum + (y.amount || 0), 0);
  const breakdown = {
    yuran: (pendingItems.yuran || []).reduce((sum, y) => sum + (y.amount || 0), 0),
    bus: (pendingItems.bus || []).reduce((sum, b) => sum + (b.amount || 0), 0),
    infaq: 0,
    koperasi: (pendingItems.koperasi || []).reduce((sum, k) => sum + (k.amount || 0), 0)
  };
  const outstandingYuranCount = (pendingItems.yuran || []).filter((y) => Number(y.amount || 0) > 0).length;
  const overdueCount = (pendingItems.yuran || []).filter((y) => {
    if (Number(y.amount || 0) <= 0) return false;
    const dueMeta = getDueMeta(y.due_date, y.days_to_due);
    return dueMeta ? dueMeta.daysToDue < 0 : false;
  }).length;
  const dueSoonCount = (pendingItems.yuran || []).filter((y) => {
    if (Number(y.amount || 0) <= 0) return false;
    const dueMeta = getDueMeta(y.due_date, y.days_to_due);
    return dueMeta ? dueMeta.daysToDue >= 0 && dueMeta.daysToDue <= 7 : false;
  }).length;
  const safeMinimumCandidates = (pendingItems.yuran || [])
    .filter((item) => Number(item.amount || 0) > 0)
    .map((item) => ({ ...item, _dueMeta: getDueMeta(item.due_date, item.days_to_due) }))
    .filter((item) => item._dueMeta && item._dueMeta.daysToDue <= 7)
    .sort((a, b) => a._dueMeta.daysToDue - b._dueMeta.daysToDue || Number(b.amount || 0) - Number(a.amount || 0));
  const safeMinimumCount = safeMinimumCandidates.length;
  const safeMinimumAmount = safeMinimumCandidates.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const safeMinimumInCartCount = safeMinimumCandidates.filter((item) => isYuranInCart(item.item_id || item.yuran_id)).length;
  const safeMinimumCoveragePercent = safeMinimumCount > 0
    ? Math.round((safeMinimumInCartCount / safeMinimumCount) * 100)
    : 100;
  const cartTotalAmount = Number(cart?.total_amount || 0);
  const cartYuranAmount = (cart?.items || [])
    .filter((item) => item.item_type === 'yuran' || item.item_type === 'yuran_partial' || item.item_type === 'yuran_two_payment')
    .reduce((sum, item) => sum + (Number(item.amount || 0) * Number(item.quantity || 1)), 0);
  const yuranOutstandingAmount = Number(breakdown.yuran || 0);
  const checkoutCoveragePercent = yuranOutstandingAmount > 0
    ? Math.round(Math.min(100, (cartYuranAmount / yuranOutstandingAmount) * 100))
    : ((cart?.items?.length || 0) > 0 ? 100 : 0);
  let checkoutConfidenceTone = 'slate';
  let checkoutConfidenceLabel = 'Troli masih kosong. Tambah rekod untuk mula checkout dengan yakin.';
  if ((cart?.items?.length || 0) > 0) {
    checkoutConfidenceTone = 'amber';
    checkoutConfidenceLabel = 'Semak semula item troli dan teruskan checkout.';
  }
  if (safeMinimumCount > 0 && safeMinimumCoveragePercent < 100) {
    checkoutConfidenceTone = overdueCount > 0 ? 'red' : 'amber';
    checkoutConfidenceLabel = `Masih ada ${safeMinimumCount - safeMinimumInCartCount} rekod kritikal belum masuk troli.`;
  } else if (checkoutCoveragePercent >= 100 || yuranOutstandingAmount <= 0) {
    checkoutConfidenceTone = 'emerald';
    checkoutConfidenceLabel = 'Liputan bayaran sudah lengkap. Anda boleh checkout sekarang.';
  } else if (checkoutCoveragePercent >= 60) {
    checkoutConfidenceTone = 'amber';
    checkoutConfidenceLabel = 'Kebanyakan yuran sudah dalam troli. Tambah baki untuk selesaikan sekali jalan.';
  }
  const preferredReminderSource = reminderPreferences?.default_source === 'ics_download' ? 'ics_download' : 'google_calendar';
  const scheduledReminderCount = (reminders || []).filter(
    (item) => String(item?.status || '').toLowerCase() === 'scheduled'
  ).length;
  const urgentYuranItems = (pendingItems.yuran || [])
    .filter((y) => Number(y.amount || 0) > 0)
    .map((item) => ({ ...item, _dueMeta: getDueMeta(item.due_date, item.days_to_due) }))
    .filter((item) => item._dueMeta && item._dueMeta.daysToDue <= 7)
    .sort((a, b) => a._dueMeta.daysToDue - b._dueMeta.daysToDue || Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 5);
  const nextActionYuranItems = (pendingItems.yuran || [])
    .filter((item) => Number(item.amount || 0) > 0)
    .map((item) => ({ ...item, _dueMeta: getDueMeta(item.due_date, item.days_to_due) }))
    .sort((a, b) => {
      const aDue = a._dueMeta ? a._dueMeta.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b._dueMeta ? b._dueMeta.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) return aDue - bDue;
      return Number(b.amount || 0) - Number(a.amount || 0);
    });
  const nextActionPrimary = nextActionYuranItems[0] || null;
  const remainingYuranAfterPayment = nextActionYuranItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  // Get students list from yuran data
  const students = pendingItems.yuran || [];
  const uniqueChildrenCount = (() => {
    const uniqueKeys = new Set();
    students.forEach((student) => {
      const studentId = student?.student_id ?? student?.id ?? null;
      const studentName = String(student?.student_name || '').trim().toLowerCase();
      const key = studentId != null && String(studentId).trim() !== ''
        ? `id:${String(studentId)}`
        : studentName
          ? `name:${studentName}`
          : '';
      if (key) {
        uniqueKeys.add(key);
      }
    });
    return uniqueKeys.size;
  })();
  
  // Get yuran details for selected student or all
  const yuranDetailList = pendingItems.yuran_detailed || [];

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

  return (
    <div className="min-h-screen pb-4" data-testid="new-payment-center-layout">
      {/* Header - padat pada mobile supaya lebih ruang untuk kotak */}
      <div className="mb-3 sm:mb-4 md:mb-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 flex-shrink-0 bg-gradient-to-br from-teal-500 via-violet-500 to-fuchsia-400 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-pastel">
              <Wallet className="text-white" size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-heading truncate">
                Pusat Bayaran
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">Bayar semua yuran dalam satu tempat</p>
              <Link
                to="/yuran"
                className="inline-flex items-center gap-1 mt-0.5 sm:mt-1 text-xs sm:text-sm font-medium text-teal-600 hover:text-teal-700"
              >
                Ringkasan yuran anak
                <ArrowRight size={12} className="sm:w-3.5 sm:h-3.5" />
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { fetchCart(); fetchPendingItems(); fetchReminders(); fetchReminderPreferences(); fetchPushStatus(); }}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors text-slate-500 flex-shrink-0"
            aria-label="Muat semula"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>
      
      {/* Main: mobile = Summary + Quick dulu (nampak satu skrin), kemudian Anak + Yuran + Sejarah */}
      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Kanan: Ringkasan & Bayaran Pantas - pada mobile muncul dulu (order-1) supaya kotak nampak */}
        <div className="order-1 lg:order-2 lg:col-span-1">
          <div className="sticky top-4 space-y-3 md:space-y-4">
            <PaymentSummaryCard 
              totalOutstanding={totalOutstanding}
              breakdown={breakdown}
              onOpenCart={() => setIsCartOpen(true)}
              cartCount={cart?.items?.length || 0}
              cartTotal={cartTotalAmount}
              childrenCount={uniqueChildrenCount}
              outstandingYuranCount={outstandingYuranCount}
              dueSoonCount={dueSoonCount}
              overdueCount={overdueCount}
              safeMinimumCount={safeMinimumCount}
              safeMinimumAmount={safeMinimumAmount}
              safeMinimumCoveragePercent={safeMinimumCoveragePercent}
              onAddMinimumSafe={() => handleAddMinimumSafeYuranToCart(true)}
              addingMinimumSafe={addingMinimumSafe}
              checkoutCoveragePercent={checkoutCoveragePercent}
              checkoutConfidenceLabel={checkoutConfidenceLabel}
              checkoutConfidenceTone={checkoutConfidenceTone}
              onAddAllYuran={() => handleAddAllOutstandingYuranToCart(true)}
              addingAllYuran={addingAllYuran}
            />
            <PaymentUrgencyCenter
              urgentItems={urgentYuranItems}
              onQuickAdd={handleAddToCart}
              onOpenReminder={openReminderScheduler}
              isInCart={isYuranInCart}
            />
            <ReminderCenter
              reminders={reminders}
              loading={loadingReminders}
              onRefresh={() => fetchReminders()}
              onCancel={handleCancelReminder}
              cancellingReminderId={cancellingReminderId}
            />
            <ReminderPreferencesCard
              preferences={reminderPreferences}
              loading={loadingReminderPreferences}
              saving={savingReminderPreferences}
              onChange={setReminderPreferences}
              onSave={handleSaveReminderPreferences}
            />
            <PushReadinessCard
              status={pushStatus}
              loading={loadingPushStatus}
              scheduledReminderCount={scheduledReminderCount}
              onRefresh={() => fetchPushStatus()}
              onOpenPushSettings={() => navigate('/notifications?focus=push&source=payment-center')}
            />
            <QuickActions onAction={handleQuickAction} />
          </div>
        </div>
        
        {/* Kiri: Anak-anak, Yuran, Sejarah */}
        <div className="order-2 lg:order-1 lg:col-span-2 space-y-4 md:space-y-6">
          <StudentCarousel
            students={students}
            selectedStudent={selectedStudent}
            onSelectStudent={setSelectedStudent}
            onTambahAnak={() => navigate('/children')}
          />
          
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-800 mb-2 sm:mb-4">
              {selectedStudent 
                ? `Senarai Yuran - ${selectedStudent.student_name}`
                : 'Yuran Tertunggak'
              }
            </h2>
            <YuranDetailView 
              yuranList={yuranDetailList}
              selectedStudent={selectedStudent}
              onAddToCart={handleAddToCart}
              onAddItemToCart={handleAddItemsToCart}
              twoPaymentPlans={pendingItems.two_payments || []}
            />
          </div>
          
          {/* Sejarah Bayaran - padat pada mobile */}
          <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:border-b border-slate-100">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-800">Sejarah Bayaran</h2>
                <p className="text-xs text-slate-500">Rekod dan resit pembayaran</p>
              </div>
              <Link
                to="/payments-parent"
                className="flex items-center justify-center gap-2 py-2.5 sm:py-3 px-4 rounded-xl bg-gradient-to-r from-teal-500 to-violet-500 text-white font-medium text-sm hover:opacity-90 transition-opacity min-h-[44px]"
              >
                <History size={16} />
                Lihat Semua
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Reminder Scheduler Modal */}
      <AnimatePresence>
        {showReminderModal && reminderTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowReminderModal(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 pointer-events-auto"
              >
                <div className="p-5 border-b border-slate-200">
                  <h3 className="text-lg font-bold text-slate-800">Jadualkan Peringatan Bayaran</h3>
                  <p className="text-sm text-slate-500 mt-1">Tetapkan peringatan supaya tidak terlepas tarikh akhir.</p>
                  <p className="text-xs text-violet-600 mt-1">Nota: sistem juga akan hantar notifikasi in-app automatik pada masa dipilih.</p>
                </div>

                <div className="p-5 space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-800">{reminderTarget.student_name}</p>
                    <p className="text-xs text-slate-600">{reminderTarget.name}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-slate-600">
                      <span>Baki: RM {(Number(reminderTarget.amount || 0)).toFixed(2)}</span>
                      <span>
                        Tarikh akhir: {reminderTarget._dueMeta?.dueDate ? reminderTarget._dueMeta.dueDate.toLocaleDateString('ms-MY') : '-'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Ingatkan saya sebelum tarikh akhir</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[0, 1, 3, 7].map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setReminderDaysBefore(days)}
                          className={`min-h-[44px] rounded-lg text-sm font-semibold border transition-colors ${
                            reminderDaysBefore === days
                              ? 'bg-violet-600 border-violet-600 text-white'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-violet-300'
                          }`}
                        >
                          {days === 0 ? 'Hari ini' : `${days} hari`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Masa peringatan</label>
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={(event) => setReminderTime(event.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>

                  <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 text-xs text-violet-700">
                    Masa peringatan: {buildReminderDateTime(reminderTarget._dueMeta?.dueDate || new Date(), reminderDaysBefore, reminderTime).toLocaleString('ms-MY')}
                  </div>
                </div>

                <div className="p-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReminderModal(false)}
                    className="min-h-[44px] rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleScheduleGoogleReminder}
                    disabled={schedulingReminder}
                    className={`min-h-[44px] rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60 ${
                      preferredReminderSource === 'google_calendar'
                        ? 'bg-violet-600 hover:bg-violet-700 ring-2 ring-violet-300'
                        : 'bg-violet-500 hover:bg-violet-600'
                    }`}
                  >
                    {schedulingReminder ? 'Menyimpan...' : `Google Calendar${preferredReminderSource === 'google_calendar' ? ' (Default)' : ''}`}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadReminderFile}
                    disabled={schedulingReminder}
                    className={`min-h-[44px] rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60 ${
                      preferredReminderSource === 'ics_download'
                        ? 'bg-teal-600 hover:bg-teal-700 ring-2 ring-teal-300'
                        : 'bg-teal-500 hover:bg-teal-600'
                    }`}
                  >
                    {schedulingReminder ? 'Menyimpan...' : `Muat Turun .ics${preferredReminderSource === 'ics_download' ? ' (Default)' : ''}`}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
      
      {/* Cart Slider - Only active when has items */}
      <CartSlider
        isOpen={isCartOpen && cart?.items?.length > 0}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onCheckout={handleCheckout}
        onClearCart={handleClearCart}
        onRemoveItem={handleRemoveItem}
        processing={processing}
      />
      
      {/* Receipt Modal */}
      <AnimatePresence>
        {showReceiptModal && selectedReceipt && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setShowReceiptModal(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none" aria-hidden="true">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="w-full max-w-md max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
              >
                {/* Receipt Header */}
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-6 text-white text-center flex-shrink-0">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-xl font-bold">Pembayaran Berjaya!</h3>
                <p className="text-emerald-100 text-sm mt-1">No. Resit: {selectedReceipt.receipt_number}</p>
              </div>
              
              {/* Receipt Content - Scrollable */}
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                {/* Payer Info */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Nama Ibu Bapa</p>
                      <p className="font-semibold text-slate-800">{selectedReceipt.payer_name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Email</p>
                      <p className="text-sm text-slate-600">{selectedReceipt.payer_email || '-'}</p>
                    </div>
                  </div>
                </div>
                
                <div className="text-center pb-4 border-b border-slate-200">
                  <p className="text-3xl font-bold text-slate-800">
                    RM {(selectedReceipt.total_amount || 0).toFixed(2)}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    {selectedReceipt.payment_date ? new Date(selectedReceipt.payment_date).toLocaleString('ms-MY') : '-'}
                  </p>
                </div>
                
                {/* Items */}
                <div className="space-y-3">
                  {selectedReceipt.items?.map((item, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-4">
                      {/* Student name - if available in metadata */}
                      {item.metadata?.student_name && (
                        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-200">
                          <GraduationCap size={16} className="text-teal-500" />
                          <div>
                            <p className="text-xs text-slate-400">Nama Anak</p>
                            <p className="font-semibold text-slate-800">{item.metadata.student_name}</p>
                          </div>
                        </div>
                      )}
                      
                      {/* Main item header */}
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-slate-800">{item.name}</p>
                          {item.description && !item.metadata?.student_name && (
                            <p className="text-sm text-slate-500">{item.description}</p>
                          )}
                        </div>
                        <span className="font-bold text-slate-800">RM {(item.amount * (item.quantity || 1)).toFixed(2)}</span>
                      </div>
                      
                      {/* Show detailed items paid (from metadata.selected_items) */}
                      {item.metadata?.selected_items && item.metadata.selected_items.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <p className="text-xs text-slate-500 font-medium mb-2">Item yang dibayar:</p>
                          <div className="space-y-1.5">
                            {item.metadata.selected_items.map((subItem, subIdx) => (
                              <div key={subIdx} className="flex justify-between text-sm">
                                <span className="text-slate-600 flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                  {subItem.name}
                                </span>
                                <span className="text-slate-700">RM {(subItem.amount || 0).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Post-payment next action card */}
                {nextActionPrimary ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <h4 className="font-semibold text-amber-900">Langkah Seterusnya</h4>
                    <p className="text-sm text-amber-800 mt-1">
                      Masih ada {nextActionYuranItems.length} rekod yuran tertunggak (RM {remainingYuranAfterPayment.toFixed(2)}).
                    </p>
                    <div className="mt-3 rounded-lg bg-white border border-amber-100 p-3">
                      <p className="text-sm font-semibold text-slate-800">{nextActionPrimary.student_name}</p>
                      <p className="text-xs text-slate-600">{nextActionPrimary.name}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-bold text-red-600">RM {(nextActionPrimary.amount || 0).toFixed(2)}</span>
                        {nextActionPrimary._dueMeta && (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${getDueBadgeTone(nextActionPrimary._dueMeta.daysToDue)}`}>
                            {getDueBadgeLabel(nextActionPrimary._dueMeta.daysToDue)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setShowReceiptModal(false);
                          await handleAddAllOutstandingYuranToCart(true);
                        }}
                        className="min-h-[44px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors"
                      >
                        Tambah Semua Ke Troli
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowReceiptModal(false);
                          openReminderScheduler(nextActionPrimary);
                        }}
                        className="min-h-[44px] rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                      >
                        Set Peringatan
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <h4 className="font-semibold text-emerald-900">Semua Yuran Selesai</h4>
                    <p className="text-sm text-emerald-800 mt-1">
                      Tiada tunggakan yuran yang perlu tindakan seterusnya. Terima kasih!
                    </p>
                  </div>
                )}
              </div>
              
              {/* Footer - Fixed at bottom */}
              <div className="flex gap-3 p-4 border-t border-slate-200 bg-white flex-shrink-0">
                <button 
                  onClick={() => setShowReceiptModal(false)}
                  className="flex-1 py-3 border border-slate-300 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                >
                  Tutup
                </button>
                <button className="flex-1 py-3 bg-gradient-to-r from-teal-600 to-violet-600 text-white rounded-xl font-medium hover:from-teal-700 hover:to-violet-700 transition-colors flex items-center justify-center gap-2">
                  <Download size={18} />
                  Muat Turun PDF
                </button>
              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NewPaymentCenterLayout;
