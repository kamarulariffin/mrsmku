import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Gift, Heart, Wallet, ArrowRight, X, ChevronLeft, ChevronRight,
  CheckCircle, History, User, Users, Share2, Copy, Check, QrCode,
  MessageCircle, Facebook, AlertCircle, Star, Sparkles, Archive, Clock
} from 'lucide-react';
import api, { API_URL } from '../../../services/api';
import { useCart } from '../../../context/CartContext';

// ===================== GLASS COMPONENTS =====================

const GlassCard = ({ children, className = '', onClick, ...props }) => (
  <div 
    className={`backdrop-blur-xl bg-white/80 border border-white/30 rounded-2xl shadow-lg transition-all ${onClick ? 'cursor-pointer hover:shadow-xl hover:-translate-y-1' : ''} ${className}`} 
    onClick={onClick}
    {...props}
  >
    {children}
  </div>
);

const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-t-transparent border-emerald-600 ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`} />
);

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg hover:shadow-xl',
    secondary: 'bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600 text-white',
    outline: 'border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 bg-white/50',
    ghost: 'text-slate-600 hover:text-emerald-700 hover:bg-white/50'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`font-medium rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Badge = ({ type, children }) => {
  const styles = {
    slot: 'bg-violet-100 text-violet-800 border border-violet-200',
    amount: 'bg-emerald-100 text-emerald-800 border border-emerald-200'
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[type] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

const ProgressBar = ({ percent, color = 'emerald' }) => {
  const colors = {
    emerald: 'from-emerald-500 to-teal-500',
    violet: 'from-violet-500 to-fuchsia-500',
    slate: 'from-slate-400 to-slate-500'
  };
  return (
    <div className="w-full bg-slate-200/50 rounded-full h-3 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(percent, 100)}%` }}
        transition={{ duration: 0.8 }}
        className={`h-full rounded-full bg-gradient-to-r ${colors[color]}`}
      />
    </div>
  );
};

// Progress Ring
const ProgressRing = ({ percent, size = 100, strokeWidth = 8, color = '#059669' }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="text-slate-200"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <motion.circle
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke={color}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-slate-800">{Math.round(percent)}%</span>
      </div>
    </div>
  );
};

const DEFAULT_MILESTONES = [50000, 100000, 200000];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeMilestones = (rawMilestones) => {
  const values = Array.isArray(rawMilestones) ? rawMilestones : DEFAULT_MILESTONES;
  const normalized = values
    .map((value) => toNumber(value, 0))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);

  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_MILESTONES];
};

const formatMilestoneLabel = (value) => {
  const amount = toNumber(value, 0);
  if (amount >= 1000000) return `RM${(amount / 1000000).toFixed(1)}j`;
  if (amount >= 1000) return `RM${(amount / 1000).toFixed(0)}k`;
  return `RM${amount.toLocaleString()}`;
};

const deriveMilestoneMeta = (campaign) => {
  const current = Math.max(toNumber(campaign?.total_collected ?? campaign?.collected_amount, 0), 0);
  const milestones = normalizeMilestones(campaign?.milestones);
  let floor = Math.max(toNumber(campaign?.milestone_floor, 0), 0);
  let next = toNumber(campaign?.milestone_next, 0);

  if (!(next > floor)) {
    let previous = 0;
    let found = milestones.find((value) => {
      if (current < value) {
        floor = previous;
        next = value;
        return true;
      }
      previous = value;
      return false;
    });

    if (!found) {
      const step = milestones.length > 1 ? milestones[milestones.length - 1] - milestones[milestones.length - 2] : milestones[0];
      floor = milestones[milestones.length - 1];
      next = floor + Math.max(step, 1);
      while (current >= next) {
        floor = next;
        next += Math.max(step, 1);
      }
    }
  }

  const computedPercent = ((current - floor) / Math.max(next - floor, 1)) * 100;
  const percent = Math.min(
    Math.max(toNumber(campaign?.milestone_segment_progress_percent, computedPercent), 0),
    100
  );
  const remaining = Math.max(next - current, 0);

  return { current, floor, next, percent, remaining, milestones };
};

const MilestoneProgressBar = ({ campaign, compact = false }) => {
  const meta = deriveMilestoneMeta(campaign);
  const pointerLeft = Math.min(Math.max(meta.percent, 4), 96);
  const milestonesToShow = [0, ...meta.milestones.slice(0, 3)];

  return (
    <div className={`rounded-xl border border-emerald-200 bg-emerald-50/60 ${compact ? 'p-2.5' : 'p-3.5'}`}>
      <div className={`relative ${compact ? 'pt-5' : 'pt-6'}`}>
        <div className={`bg-slate-200 rounded-full overflow-hidden ${compact ? 'h-2' : 'h-2.5'}`}>
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
            style={{ width: `${meta.percent}%` }}
          />
        </div>
        <div
          className={`absolute text-emerald-700 whitespace-nowrap ${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold`}
          style={{ left: `calc(${pointerLeft}% - 24px)`, top: 0 }}
        >
          RM{meta.current.toLocaleString()}
        </div>
      </div>

      <div className={`mt-4 flex items-center justify-between text-slate-600 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
        {milestonesToShow.map((milestone) => (
          <span key={`${campaign?.id || 'milestone'}-${milestone}`}>{formatMilestoneLabel(milestone)}</span>
        ))}
      </div>
      {!compact && (
        <p className="mt-1.5 text-xs text-slate-600">
          Baki ke milestone seterusnya: <strong>RM {meta.remaining.toLocaleString()}</strong>
        </p>
      )}
    </div>
  );
};

// ===================== CAMPAIGN DETAIL VIEW =====================

const CampaignDetailView = ({ campaign, onClose }) => {
  const navigate = useNavigate();
  const { addToCart, fetchCart } = useCart();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareData, setShareData] = useState(null);
  const [donating, setDonating] = useState(false);
  const [donationSuccess, setDonationSuccess] = useState(null);
  
  const [form, setForm] = useState({
    slots: campaign?.min_slots || 1,
    amount: campaign?.min_amount || 10,
    is_anonymous: false,
    message: ''
  });

  useEffect(() => {
    if (campaign?.id) {
      api.get(`/api/tabung/campaigns/${campaign.id}/share-data`)
        .then(res => setShareData(res.data))
        .catch(() => {});
    }
  }, [campaign?.id]);

  const images = campaign?.images?.length > 0 
    ? campaign.images.map(img => `${API_URL}${img.url}`)
    : campaign?.image_url 
      ? [`${API_URL}${campaign.image_url}`]
      : [];

  const nextImage = () => setCurrentImageIndex(i => (i + 1) % images.length);
  const prevImage = () => setCurrentImageIndex(i => (i - 1 + images.length) % images.length);

  const copyLink = () => {
    if (shareData?.url) {
      navigator.clipboard.writeText(shareData.url);
      setCopied(true);
      toast.success('Link disalin!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const calculateAmount = () => {
    if (!campaign) return 0;
    return campaign.campaign_type === 'slot' 
      ? form.slots * campaign.price_per_slot 
      : form.amount;
  };

  const handleDonate = async () => {
    if (!campaign?.can_donate) return;

    const amount = calculateAmount();
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Jumlah sumbangan tidak sah.');
      return;
    }

    setDonating(true);
    try {
      const metadata = {
        amount,
        is_anonymous: form.is_anonymous,
        message: form.message,
        campaign_type: campaign.campaign_type || 'amount'
      };

      if (campaign.campaign_type === 'slot') {
        metadata.slots = Math.max(1, Number(form.slots || 1));
      }

      const result = await addToCart('infaq', {
        item_id: campaign.id,
        quantity: 1,
        metadata
      });

      if (!result?.success) {
        toast.error(result?.error || 'Gagal menambah sumbangan ke troli.');
        return;
      }

      await fetchCart();

      setDonationSuccess({
        added_to_cart: true,
        campaign_title: campaign.title,
        amount,
        slots: metadata.slots || null
      });
      toast.success('Sumbangan ditambah ke troli berpusat.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menambah sumbangan ke troli');
    } finally {
      setDonating(false);
    }
  };

  if (!campaign) return null;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 h-full w-full sm:max-w-xl bg-gradient-to-br from-slate-50 to-white shadow-2xl z-50 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="relative flex-shrink-0">
        {images.length > 0 ? (
          <div className="relative aspect-[16/10]">
            <AnimatePresence mode="wait">
              <motion.img
                key={currentImageIndex}
                src={images[currentImageIndex]}
                alt={campaign.title}
                className="w-full h-full object-cover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </AnimatePresence>
            
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            
            {/* Navigation */}
            {images.length > 1 && (
              <>
                <button onClick={prevImage} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-white rounded-full shadow-lg">
                  <ChevronLeft size={24} />
                </button>
                <button onClick={nextImage} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-white rounded-full shadow-lg">
                  <ChevronRight size={24} />
                </button>
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentImageIndex(i)}
                      className={`w-2 h-2 rounded-full transition-all ${i === currentImageIndex ? 'bg-white w-6' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
              </>
            )}
            
            {/* Close Button */}
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white/80 hover:bg-white rounded-full shadow-lg transition-colors"
            >
              <X size={20} />
            </button>
            
            {/* Title on Image */}
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
              <Badge type={campaign.campaign_type}>
                {campaign.campaign_type === 'slot' ? 'Tabung Slot' : 'Sumbangan'}
              </Badge>
              <h2 className="text-2xl font-bold mt-2">{campaign.title}</h2>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-full">
              <X size={20} />
            </button>
            <Badge type={campaign.campaign_type}>
              {campaign.campaign_type === 'slot' ? 'Tabung Slot' : 'Sumbangan'}
            </Badge>
            <h2 className="text-2xl font-bold mt-2">{campaign.title}</h2>
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {donationSuccess ? (
          // Success View
          <div className="p-6 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-6"
            >
              <CheckCircle size={40} className="text-white" />
            </motion.div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Ditambah ke Troli</h3>
            <p className="text-slate-600 mb-6">Lengkapkan pembayaran di Pusat Bayaran untuk sahkan sumbangan.</p>
            
            <GlassCard className="p-4 mb-6 text-left space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-600">Kempen</span>
                <span className="font-medium text-slate-900">{donationSuccess.campaign_title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Jumlah</span>
                <span className="font-bold text-emerald-600">RM {donationSuccess.amount?.toFixed(2)}</span>
              </div>
              {donationSuccess.slots && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Slot</span>
                  <span className="font-medium text-violet-600">{donationSuccess.slots} slot</span>
                </div>
              )}
              <div className="flex justify-between pt-3 border-t border-slate-200">
                <span className="text-slate-600">Status</span>
                <span className="font-medium text-amber-600">Menunggu checkout</span>
              </div>
            </GlassCard>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDonationSuccess(null)}
                className="flex-1"
              >
                Tambah Lagi
              </Button>
              <Button
                onClick={() => {
                  onClose?.();
                  navigate('/payment-center?tab=troli');
                }}
                className="flex-1"
              >
                <Wallet size={18} /> Pergi ke Troli
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Date Status Alert */}
            {campaign.date_remark && (
              <div className={`p-4 rounded-xl flex items-center gap-3 ${
                campaign.date_status === 'upcoming' 
                  ? 'bg-amber-50 border border-amber-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className={`p-2 rounded-lg ${
                  campaign.date_status === 'upcoming' ? 'bg-amber-100' : 'bg-red-100'
                }`}>
                  <AlertCircle size={20} className={campaign.date_status === 'upcoming' ? 'text-amber-600' : 'text-red-600'} />
                </div>
                <div>
                  <p className={`font-semibold ${campaign.date_status === 'upcoming' ? 'text-amber-800' : 'text-red-800'}`}>
                    {campaign.date_remark}
                  </p>
                  <p className="text-sm text-slate-600">
                    {campaign.date_status === 'upcoming' && campaign.start_date
                      ? `Akan dilancarkan pada ${new Date(campaign.start_date).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })}`
                      : campaign.end_date
                        ? `Tamat pada ${new Date(campaign.end_date).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })}`
                        : ''
                    }
                  </p>
                </div>
              </div>
            )}
            
            {/* Progress */}
            {campaign.campaign_type === 'amount' && campaign.is_unlimited ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-emerald-600">
                      RM {(campaign.total_collected || 0).toLocaleString()}
                    </p>
                    <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                      <Users size={14} /> {campaign.donor_count || 0} penderma
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Milestone seterusnya</p>
                    <p className="text-base font-semibold text-slate-700">
                      RM {toNumber(campaign.milestone_next, 0).toLocaleString()}
                    </p>
                  </div>
                </div>
                <MilestoneProgressBar campaign={campaign} />
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ProgressRing
                  percent={campaign.progress_percent}
                  color={campaign.campaign_type === 'slot' ? '#7c3aed' : '#059669'}
                />
                <div>
                  <p className="text-2xl font-bold text-emerald-600">
                    RM {(campaign.total_collected || 0).toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-500">
                    {campaign.campaign_type === 'slot'
                      ? `${campaign.slots_sold}/${campaign.total_slots} slot terjual`
                      : `daripada RM ${(campaign.target_amount || 0).toLocaleString()}`
                    }
                  </p>
                  <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                    <Users size={14} /> {campaign.donor_count || 0} penderma
                  </p>
                </div>
              </div>
            )}
            
            {/* Description */}
            {campaign.description && (
              <p className="text-slate-600">{campaign.description}</p>
            )}
            
            {campaign.full_description && (
              <div className="pt-4 border-t border-slate-200">
                <h4 className="font-semibold text-slate-800 mb-2">Penerangan</h4>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{campaign.full_description}</p>
              </div>
            )}
            
            {/* Share */}
            <GlassCard className="p-4">
              <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Share2 size={18} className="text-emerald-600" /> Kongsi Kempen
              </h4>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowQR(true)} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                  <QrCode size={20} className="text-slate-600" />
                </button>
                <button onClick={copyLink} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                  {copied ? <Check size={20} className="text-emerald-600" /> : <Copy size={20} className="text-slate-600" />}
                </button>
                {shareData?.share_links && (
                  <>
                    <a href={shareData.share_links.whatsapp} target="_blank" rel="noopener noreferrer" className="p-2 bg-green-100 rounded-lg hover:bg-green-200">
                      <MessageCircle size={20} className="text-green-600" />
                    </a>
                    <a href={shareData.share_links.facebook} target="_blank" rel="noopener noreferrer" className="p-2 bg-blue-100 rounded-lg hover:bg-blue-200">
                      <Facebook size={20} className="text-blue-600" />
                    </a>
                  </>
                )}
              </div>
            </GlassCard>
            
            {/* Donation Form */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <h4 className="font-semibold text-slate-800">Buat Sumbangan</h4>
              
              {campaign.campaign_type === 'slot' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Bilangan Slot</label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setForm(f => ({ ...f, slots: Math.max(campaign.min_slots || 1, f.slots - 1) }))}
                      className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-xl font-bold"
                    >-</button>
                    <input
                      type="number"
                      value={form.slots}
                      onChange={(e) => setForm(f => ({ ...f, slots: parseInt(e.target.value) || 1 }))}
                      className="flex-1 h-12 text-center text-2xl font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                      min={campaign.min_slots || 1}
                      max={Math.min(campaign.max_slots || 5000, campaign.slots_available)}
                    />
                    <button
                      onClick={() => setForm(f => ({ ...f, slots: Math.min(campaign.slots_available, f.slots + 1) }))}
                      className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-xl font-bold"
                    >+</button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 text-center">
                    RM {campaign.price_per_slot}/slot • {campaign.slots_available} tersedia
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Jumlah (RM)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">RM</span>
                    <input
                      type="number"
                      value={form.amount}
                      onChange={(e) => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                      className="w-full h-14 pl-14 text-2xl font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                      min={campaign.min_amount || 1}
                      max={campaign.max_amount || 100000}
                    />
                  </div>
                  <div className="flex gap-2 mt-3">
                    {[10, 50, 100, 500].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setForm(f => ({ ...f, amount: amt }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                          form.amount === amt 
                            ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-500' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >RM {amt}</button>
                    ))}
                  </div>
                </div>
              )}
              
              <label className="flex items-center gap-3 cursor-pointer py-2">
                <input
                  type="checkbox"
                  checked={form.is_anonymous}
                  onChange={(e) => setForm(f => ({ ...f, is_anonymous: e.target.checked }))}
                  className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-700">Sumbangan tanpa nama</span>
              </label>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Pesanan <span className="text-slate-400 font-normal">Contoh: Semoga menjadi amal jariah untuk ibu bapa saya</span> (pilihan)
                </label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="Doa atau pesanan anda..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
                  rows={2}
                  data-testid="donation-message-input"
                />
              </div>
              
              {/* Total */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 font-medium">Jumlah</span>
                  <span className="text-2xl font-bold text-emerald-600">RM {calculateAmount().toLocaleString()}</span>
                </div>
              </div>
              
              <Button 
                className="w-full" 
                size="lg" 
                onClick={handleDonate} 
                loading={donating} 
                disabled={!campaign.can_donate}
                data-testid="confirm-donate-btn"
              >
                {campaign.can_donate ? (
                  <>
                    <Wallet size={20} /> Tambah ke Troli
                  </>
                ) : (
                  <>
                    <AlertCircle size={20} /> {campaign.date_remark || 'Tidak Boleh Sumbang'}
                  </>
                )}
              </Button>
            </div>
            
            {/* Recent Donors */}
            {campaign.recent_donations?.length > 0 && (
              <div className="pt-4 border-t border-slate-200">
                <h4 className="font-semibold text-slate-800 mb-3">Penderma Terkini</h4>
                <div className="space-y-2">
                  {campaign.recent_donations.slice(0, 5).map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-sm p-2 bg-slate-50 rounded-lg">
                      <span className="text-slate-700">{d.donor_name}</span>
                      <span className="font-semibold text-emerald-600">RM {d.amount?.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* QR Modal */}
      <AnimatePresence>
        {showQR && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[60]"
              onClick={() => setShowQR(false)}
            />
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none" aria-hidden="true">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full max-w-sm pointer-events-auto"
              >
              <GlassCard className="p-6 text-center">
                <button onClick={() => setShowQR(false)} className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-lg">
                  <X size={20} />
                </button>
                <h3 className="text-lg font-bold text-slate-900 mb-4">Imbas untuk Menyumbang</h3>
                <div className="bg-white p-4 rounded-2xl inline-block mb-4">
                  <img
                    src={`${API_URL}/api/tabung/campaigns/${campaign.id}/qrcode?size=200`}
                    alt="QR Code"
                    className="w-[200px] h-[200px]"
                  />
                </div>
                <p className="text-sm text-slate-600 mb-4">{campaign.title}</p>
                <button onClick={copyLink} className="w-full py-3 bg-emerald-100 text-emerald-700 rounded-xl font-medium hover:bg-emerald-200 flex items-center justify-center gap-2">
                  {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'Disalin!' : 'Salin Link'}
                </button>
              </GlassCard>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ===================== MAIN PAGE =====================

export default function TabungPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [myDonations, setMyDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [selectedCampaign, setSelectedCampaign] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [campaignsRes, donationsRes] = await Promise.all([
        api.get('/api/tabung/campaigns?active_only=true'),
        api.get('/api/tabung/donations/my')
      ]);
      setCampaigns(campaignsRes.data);
      setMyDonations(donationsRes.data);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCampaignClick = async (campaign) => {
    // Fetch full campaign details
    try {
      const res = await api.get(`/api/tabung/campaigns/${campaign.id}`);
      setSelectedCampaign(res.data);
    } catch (err) {
      setSelectedCampaign(campaign);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/30 p-4 sm:p-6 min-w-0 overflow-x-hidden" data-testid="tabung-page">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-20 right-20 w-96 h-96 bg-emerald-200/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-teal-200/20 rounded-full blur-3xl" />
      </div>
      
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex p-4 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white mb-4 shadow-lg shadow-emerald-500/30">
          <Gift size={36} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Tabung & Sumbangan</h1>
        <p className="text-slate-600 mt-1">Hulurkan sumbangan anda untuk kebaikan bersama</p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center gap-2 mb-8 flex-wrap">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'campaigns' 
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30' 
              : 'bg-white/70 backdrop-blur text-slate-600 hover:bg-white hover:shadow-md'
          }`}
          data-testid="tab-kempen-aktif"
        >
          <Heart size={18} /> Kempen Aktif
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
            {campaigns.filter(c => c.date_status !== 'ended' && c.status === 'active').length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('arkib')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'arkib' 
              ? 'bg-gradient-to-r from-slate-600 to-slate-700 text-white shadow-lg shadow-slate-500/30' 
              : 'bg-white/70 backdrop-blur text-slate-600 hover:bg-white hover:shadow-md'
          }`}
          data-testid="tab-arkib"
        >
          <Archive size={18} /> Arkib
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
            {campaigns.filter(c => c.date_status === 'ended' || c.status === 'completed').length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'history' 
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30' 
              : 'bg-white/70 backdrop-blur text-slate-600 hover:bg-white hover:shadow-md'
          }`}
          data-testid="tab-sejarah"
        >
          <History size={18} /> Sejarah Saya
        </button>
      </div>

      {/* Featured Campaigns Section - Only show on campaigns tab */}
      {activeTab === 'campaigns' && campaigns.filter(c => c.is_featured && c.date_status !== 'ended').length > 0 && (
        <div className="max-w-6xl mx-auto mb-10">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Kempen Pilihan</h2>
              <p className="text-sm text-slate-500">Kempen yang disyorkan untuk anda</p>
            </div>
          </div>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.filter(c => c.is_featured && c.date_status !== 'ended').slice(0, 3).map((campaign) => (
              <motion.div
                key={`featured-${campaign.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -4, scale: 1.02 }}
                transition={{ duration: 0.3 }}
              >
                <div 
                  onClick={() => handleCampaignClick(campaign)}
                  className="relative overflow-hidden rounded-2xl cursor-pointer group"
                >
                  {/* Gradient Border Effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 rounded-2xl p-[3px]">
                    <div className="w-full h-full bg-white rounded-2xl" />
                  </div>
                  
                  <div className="relative bg-white rounded-2xl overflow-hidden">
                    {/* Image */}
                    <div className="aspect-[16/10] bg-gradient-to-br from-amber-50 to-orange-50 relative overflow-hidden">
                      {campaign.image_url ? (
                        <img 
                          src={`${API_URL}${campaign.image_url}`}
                          alt={campaign.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Gift className="w-16 h-16 text-amber-200" />
                        </div>
                      )}
                      {/* Overlay gradient */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      
                      {/* Featured Badge */}
                      <div className="absolute top-3 left-3 px-3 py-1.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full text-xs font-bold flex items-center gap-1.5 shadow-lg">
                        <Star size={12} fill="currentColor" /> Pilihan Utama
                      </div>
                      
                      {/* Title on image */}
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <h3 className="font-bold text-white text-lg line-clamp-2 drop-shadow-lg">{campaign.title}</h3>
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div className="p-4 space-y-3">
                      {campaign.campaign_type === 'amount' && campaign.is_unlimited ? (
                        <>
                          <MilestoneProgressBar campaign={campaign} compact />
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-slate-600">
                              <span className="font-bold text-emerald-600 text-lg">RM {(campaign.total_collected || 0).toLocaleString()}</span>
                              <span className="text-slate-400"> / RM {toNumber(campaign.milestone_next, 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-slate-500">
                              <Users size={14} /> {campaign.donor_count || 0}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <ProgressBar 
                            percent={campaign.progress_percent} 
                            color={campaign.campaign_type === 'slot' ? 'violet' : 'emerald'} 
                          />
                          
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-slate-600">
                              <span className="font-bold text-emerald-600 text-lg">RM {(campaign.total_collected || 0).toLocaleString()}</span>
                              <span className="text-slate-400"> / RM {(campaign.target_amount || campaign.total_slots * campaign.price_per_slot || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-slate-500">
                              <Users size={14} /> {campaign.donor_count || 0}
                            </div>
                          </div>
                        </>
                      )}
                      
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="md" 
                          className="flex-1"
                          onClick={(e) => { e.stopPropagation(); handleCampaignClick(campaign); }}
                          data-testid={`featured-detail-btn-${campaign.id}`}
                        >
                          Ketahui Lebih Lanjut
                        </Button>
                        <Button className="flex-1" size="md">
                          Sumbang <ArrowRight size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Active Campaigns */}
      {activeTab === 'campaigns' && (
        <>
          {/* Section Header for Active Campaigns */}
          {campaigns.filter(c => c.is_featured && c.date_status !== 'ended').length > 0 && (
            <div className="max-w-6xl mx-auto mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
                  <Heart size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Semua Kempen Aktif</h2>
                  <p className="text-sm text-slate-500">Pilih kempen untuk menyumbang</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
            {campaigns.filter(c => c.date_status !== 'ended' && c.status === 'active').map((campaign) => {
            // Determine ring color based on status
            // Red = ended, Yellow = ending within 2 weeks, Green = active
            const getRingStyle = () => {
              if (campaign.date_status === 'ended') {
                return 'ring-4 ring-red-400 shadow-red-200/50';
              } else if (campaign.days_remaining !== null && campaign.days_remaining <= 14 && campaign.days_remaining > 0) {
                return 'ring-4 ring-amber-400 shadow-amber-200/50';
              } else if (campaign.date_status === 'active' || campaign.can_donate) {
                return 'ring-4 ring-emerald-400 shadow-emerald-200/50';
              }
              return '';
            };
            
            const ringStyle = getRingStyle();
            
            return (
            <motion.div
              key={campaign.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4 }}
            >
              <GlassCard onClick={() => handleCampaignClick(campaign)} className={`overflow-hidden ${ringStyle}`}>
                {/* Image */}
                <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative">
                  {campaign.image_url ? (
                    <img 
                      src={`${API_URL}${campaign.image_url}`}
                      alt={campaign.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Gift className="w-12 h-12 text-slate-300" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex gap-2">
                    <Badge type={campaign.campaign_type}>
                      {campaign.campaign_type === 'slot' ? 'Slot' : 'Sumbangan'}
                    </Badge>
                    {/* Featured badge */}
                    {campaign.is_featured && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg">
                        Pilihan Utama
                      </span>
                    )}
                  </div>
                  {campaign.images?.length > 1 && (
                    <div className="absolute top-3 right-3 px-2 py-1 bg-black/50 text-white text-xs rounded-full">
                      {campaign.images.length} gambar
                    </div>
                  )}
                  {/* Status indicator at bottom of image */}
                  {campaign.date_status === 'ended' && (
                    <div className="absolute bottom-0 left-0 right-0 py-2 bg-red-600/90 text-white text-center text-sm font-semibold">
                      Kutipan Sudah Tamat
                    </div>
                  )}
                  {campaign.days_remaining !== null && campaign.days_remaining <= 14 && campaign.days_remaining > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 py-2 bg-amber-500/90 text-white text-center text-sm font-semibold">
                      {campaign.days_remaining} hari lagi
                    </div>
                  )}
                </div>
                
                <div className="p-5 space-y-4">
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg line-clamp-1">{campaign.title}</h3>
                    {campaign.description && (
                      <p className="text-sm text-slate-600 mt-1 line-clamp-2">{campaign.description}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    {campaign.campaign_type === 'amount' && campaign.is_unlimited ? (
                      <>
                        <MilestoneProgressBar campaign={campaign} compact />
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">
                            Ke milestone RM {toNumber(campaign.milestone_next, 0).toLocaleString()}
                          </span>
                          <span className="font-bold text-emerald-600">
                            RM {(campaign.total_collected || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <User size={14} /> {campaign.donor_count || 0} penderma
                          </span>
                          <span>Baki RM {Math.max(toNumber(campaign.milestone_remaining, 0), 0).toLocaleString()}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <ProgressBar 
                          percent={campaign.progress_percent} 
                          color={campaign.campaign_type === 'slot' ? 'violet' : 'emerald'} 
                        />
                        
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">
                            {campaign.campaign_type === 'slot' 
                              ? `${campaign.slots_sold}/${campaign.total_slots} slot`
                              : `${campaign.progress_percent?.toFixed(0)}% tercapai`
                            }
                          </span>
                          <span className="font-bold text-emerald-600">
                            RM {(campaign.total_collected || 0).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <User size={14} /> {campaign.donor_count || 0} penderma
                          </span>
                          {campaign.campaign_type === 'slot' && (
                            <span>RM {campaign.price_per_slot}/slot</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="md" 
                      className="flex-1"
                      onClick={(e) => { e.stopPropagation(); handleCampaignClick(campaign); }}
                      data-testid={`campaign-detail-btn-${campaign.id}`}
                    >
                      Ketahui Lebih Lanjut
                    </Button>
                    <Button className="flex-1" size="md" disabled={!campaign.can_donate}>
                      {campaign.can_donate ? 'Sumbang' : 'Tamat'} <ArrowRight size={16} />
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          );})}
          
          {campaigns.length === 0 && (
            <div className="col-span-full">
              <GlassCard className="py-12 text-center">
                <Heart size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500">Tiada kempen aktif buat masa ini</p>
              </GlassCard>
            </div>
          )}
          
          {campaigns.filter(c => c.date_status !== 'ended' && c.status === 'active').length === 0 && (
            <div className="col-span-full">
              <GlassCard className="py-12 text-center">
                <Heart size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500">Tiada kempen aktif buat masa ini</p>
              </GlassCard>
            </div>
          )}
        </div>
        </>
      )}

      {/* Arkib Tab - Ended Campaigns */}
      {activeTab === 'arkib' && (
        <div className="max-w-6xl mx-auto">
          {/* Arkib Header */}
          <div className="flex items-center gap-3 mb-6 p-4 bg-gradient-to-r from-slate-100 to-slate-50 rounded-2xl border border-slate-200">
            <div className="p-3 rounded-xl bg-slate-600 text-white">
              <Archive size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Arkib Kempen</h2>
              <p className="text-sm text-slate-500">Kempen yang telah tamat tempoh kutipan</p>
            </div>
          </div>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.filter(c => c.date_status === 'ended' || c.status === 'completed').map((campaign) => (
              <motion.div
                key={`arkib-${campaign.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2 }}
              >
                <GlassCard 
                  onClick={() => handleCampaignClick(campaign)} 
                  className="overflow-hidden opacity-80 hover:opacity-100 transition-opacity"
                >
                  {/* Image with grayscale */}
                  <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative">
                    {campaign.image_url ? (
                      <img 
                        src={`${API_URL}${campaign.image_url}`}
                        alt={campaign.title}
                        className="w-full h-full object-cover grayscale"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Gift className="w-12 h-12 text-slate-300" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-2">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-600 text-white">
                        Tamat
                      </span>
                      <Badge type={campaign.campaign_type}>
                        {campaign.campaign_type === 'slot' ? 'Slot' : 'Sumbangan'}
                      </Badge>
                    </div>
                    {/* Completed overlay */}
                    <div className="absolute bottom-0 left-0 right-0 py-2 bg-slate-800/90 text-white text-center text-sm font-medium flex items-center justify-center gap-2">
                      <CheckCircle size={16} /> Kutipan Sudah Tamat
                    </div>
                  </div>
                  
                  <div className="p-5 space-y-4">
                    <div>
                      <h3 className="font-bold text-slate-700 text-lg line-clamp-1">{campaign.title}</h3>
                      {campaign.end_date && (
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                          <Clock size={12} /> Tamat: {new Date(campaign.end_date).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      {campaign.campaign_type === 'amount' && campaign.is_unlimited ? (
                        <>
                          <MilestoneProgressBar campaign={campaign} compact />
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">
                              Milestone akhir dicapai: RM {(campaign.total_collected || 0).toLocaleString()}
                            </span>
                            <span className="font-bold text-slate-600">
                              RM {(campaign.total_collected || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm text-slate-400">
                            <span className="flex items-center gap-1">
                              <User size={14} /> {campaign.donor_count || 0} penderma
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <ProgressBar 
                            percent={campaign.progress_percent} 
                            color="slate" 
                          />
                          
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">
                              {campaign.campaign_type === 'slot' 
                                ? `${campaign.slots_sold}/${campaign.total_slots} slot`
                                : `${campaign.progress_percent?.toFixed(0)}% tercapai`
                              }
                            </span>
                            <span className="font-bold text-slate-600">
                              RM {(campaign.total_collected || 0).toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-sm text-slate-400">
                            <span className="flex items-center gap-1">
                              <User size={14} /> {campaign.donor_count || 0} penderma
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    <Button 
                      variant="outline" 
                      size="md" 
                      className="w-full border-slate-300 text-slate-600 hover:bg-slate-50"
                      onClick={(e) => { e.stopPropagation(); handleCampaignClick(campaign); }}
                    >
                      Lihat Rekod Kempen
                    </Button>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
            
            {campaigns.filter(c => c.date_status === 'ended' || c.status === 'completed').length === 0 && (
              <div className="col-span-full">
                <GlassCard className="py-12 text-center">
                  <Archive size={48} className="mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-500">Tiada kempen dalam arkib</p>
                </GlassCard>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <div className="max-w-3xl mx-auto">
          <GlassCard className="overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Sejarah Sumbangan Saya</h3>
            </div>
            
            {myDonations.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {myDonations.map((donation) => (
                  <div key={donation.id} className="p-4 hover:bg-white/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{donation.campaign_title}</p>
                        <p className="text-sm text-slate-500 mt-0.5">
                          {new Date(donation.created_at).toLocaleDateString('ms-MY', {
                            day: '2-digit', month: 'long', year: 'numeric'
                          })}
                        </p>
                        {donation.slots && (
                          <Badge type="slot" className="mt-2">{donation.slots} slot</Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-emerald-600">RM {donation.amount.toFixed(2)}</p>
                        <p className="text-xs text-slate-400 mt-1 font-mono">{donation.receipt_number}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <History size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500">Anda belum membuat sebarang sumbangan</p>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* Campaign Detail Slide Panel */}
      <AnimatePresence>
        {selectedCampaign && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" 
              onClick={() => setSelectedCampaign(null)} 
            />
            <CampaignDetailView
              campaign={selectedCampaign}
              onClose={() => setSelectedCampaign(null)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
