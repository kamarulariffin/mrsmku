import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast, Toaster } from 'sonner';
import {
  Heart, Gift, Users, Share2, Copy, Check,
  ArrowLeft, ChevronLeft, ChevronRight, X, QrCode,
  MessageCircle, Facebook, Loader2, AlertCircle, Calendar
} from 'lucide-react';
import api, { API_URL } from '../../services/api';

// Glassmorphism Card Component
const GlassCard = ({ children, className = '', ...props }) => (
  <div 
    className={`backdrop-blur-xl bg-white/70 border border-white/20 rounded-3xl shadow-xl ${className}`} 
    {...props}
  >
    {children}
  </div>
);

// Progress Ring Component
const ProgressRing = ({ percent, size = 120, strokeWidth = 8, color = '#059669' }) => {
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
          className="transition-all duration-1000"
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
        <span className="text-2xl font-bold text-slate-800">{Math.round(percent)}%</span>
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

  return { current, next, percent, remaining, milestones };
};

const MilestoneProgressBar = ({ campaign }) => {
  const meta = deriveMilestoneMeta(campaign);
  const pointerLeft = Math.min(Math.max(meta.percent, 4), 96);
  const milestonesToShow = [0, ...meta.milestones.slice(0, 3)];

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="relative pt-6">
        <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
            style={{ width: `${meta.percent}%` }}
          />
        </div>
        <div
          className="absolute text-[11px] font-semibold text-emerald-700 whitespace-nowrap"
          style={{ left: `calc(${pointerLeft}% - 24px)`, top: 0 }}
        >
          RM{meta.current.toLocaleString()}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-[11px] text-slate-600">
        {milestonesToShow.map((milestone) => (
          <span key={`${campaign?.id || 'milestone'}-${milestone}`}>{formatMilestoneLabel(milestone)}</span>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-600">
        Baki ke milestone seterusnya: <strong>RM {meta.remaining.toLocaleString()}</strong>
      </p>
    </div>
  );
};

export default function PublicDonatePage() {
  const { campaignId } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [shareData, setShareData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [form, setForm] = useState({
    donor_name: '',
    donor_email: '',
    donor_phone: '',
    slots: 1,
    amount: 50,
    is_anonymous: false,
    message: ''
  });

  const fetchCampaign = useCallback(async () => {
    try {
      const [campaignRes, shareRes] = await Promise.all([
        api.get(`${API_URL}/api/tabung/public/campaigns/${campaignId}`),
        api.get(`${API_URL}/api/tabung/campaigns/${campaignId}/share-data`)
      ]);
      setCampaign(campaignRes.data);
      setShareData(shareRes.data);
      
      // Set default amount
      if (campaignRes.data.campaign_type === 'amount') {
        setForm(f => ({ ...f, amount: campaignRes.data.min_amount || 10 }));
      }
    } catch (err) {
      toast.error('Kempen tidak dijumpai atau tidak aktif');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  const handleDonate = async (e) => {
    e.preventDefault();
    
    if (!form.is_anonymous && !form.donor_name.trim()) {
      toast.error('Sila masukkan nama anda');
      return;
    }
    
    setProcessing(true);
    try {
      const payload = {
        campaign_id: campaignId,
        donor_name: form.donor_name || 'Penderma',
        donor_email: form.donor_email,
        donor_phone: form.donor_phone,
        is_anonymous: form.is_anonymous,
        message: form.message
      };
      
      if (campaign.campaign_type === 'slot') {
        payload.slots = form.slots;
      } else {
        payload.amount = form.amount;
      }
      
      const res = await api.post(`${API_URL}/api/tabung/public/donate`, payload);
      setSuccessData(res.data);
      setShowSuccess(true);
      toast.success('Sumbangan berjaya!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal membuat sumbangan');
    } finally {
      setProcessing(false);
    }
  };

  const copyLink = () => {
    if (shareData?.url) {
      navigator.clipboard.writeText(shareData.url);
      setCopied(true);
      toast.success('Link disalin!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const images = campaign?.images?.length > 0 
    ? campaign.images.map(img => `${API_URL}${img.url}`)
    : campaign?.image_url 
      ? [`${API_URL}${campaign.image_url}`]
      : [];

  const nextImage = () => setCurrentImageIndex(i => (i + 1) % images.length);
  const prevImage = () => setCurrentImageIndex(i => (i - 1 + images.length) % images.length);

  const calculateAmount = () => {
    if (!campaign) return 0;
    return campaign.campaign_type === 'slot' 
      ? form.slots * campaign.price_per_slot 
      : form.amount;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="w-12 h-12 text-emerald-600" />
        </motion.div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center p-4">
        <GlassCard className="p-8 text-center max-w-md">
          <Heart className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Kempen Tidak Dijumpai</h2>
          <p className="text-slate-600 mb-6">Kempen ini mungkin tidak aktif atau telah tamat.</p>
          <Link to="/" className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium">
            <ArrowLeft size={18} /> Kembali ke Laman Utama
          </Link>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50" data-testid="public-donate-page">
      <Toaster position="top-center" richColors />
      
      {/* Floating Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-emerald-300/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-teal-300/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-40 h-40 bg-cyan-300/20 rounded-full blur-3xl" />
      </div>
      
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 border-b border-white/20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-emerald-700 hover:text-emerald-800 transition-colors">
            <ArrowLeft size={20} />
            <span className="font-medium hidden sm:inline">Kembali</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Kongsi:</span>
            <button
              onClick={() => setShowQR(true)}
              className="p-2 hover:bg-emerald-100 rounded-full transition-colors"
              title="QR Code"
            >
              <QrCode size={20} className="text-emerald-600" />
            </button>
            <button
              onClick={copyLink}
              className="p-2 hover:bg-emerald-100 rounded-full transition-colors"
              title="Salin Link"
            >
              {copied ? <Check size={20} className="text-emerald-600" /> : <Copy size={20} className="text-slate-600" />}
            </button>
            {shareData?.share_links && (
              <>
                <a
                  href={shareData.share_links.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-green-100 rounded-full transition-colors"
                >
                  <MessageCircle size={20} className="text-green-600" />
                </a>
                <a
                  href={shareData.share_links.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-blue-100 rounded-full transition-colors"
                >
                  <Facebook size={20} className="text-blue-600" />
                </a>
              </>
            )}
          </div>
        </div>
      </header>
      
      <main className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column - Campaign Info */}
          <div className="space-y-6">
            {/* Image Gallery */}
            {images.length > 0 && (
              <GlassCard className="overflow-hidden">
                <div className="relative aspect-video">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={currentImageIndex}
                      src={images[currentImageIndex]}
                      alt={campaign.title}
                      className="w-full h-full object-cover"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    />
                  </AnimatePresence>
                  
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-white rounded-full shadow-lg transition-all"
                      >
                        <ChevronLeft size={24} />
                      </button>
                      <button
                        onClick={nextImage}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-white rounded-full shadow-lg transition-all"
                      >
                        <ChevronRight size={24} />
                      </button>
                      
                      {/* Dots */}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                        {images.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentImageIndex(i)}
                            className={`w-2 h-2 rounded-full transition-all ${
                              i === currentImageIndex ? 'bg-white w-6' : 'bg-white/50'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
                
                {/* Thumbnails */}
                {images.length > 1 && (
                  <div className="p-4 flex gap-2 overflow-x-auto">
                    {images.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentImageIndex(i)}
                        className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                          i === currentImageIndex ? 'border-emerald-500' : 'border-transparent opacity-60'
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </GlassCard>
            )}
            
            {/* Campaign Details */}
            <GlassCard className="p-6 space-y-6">
              {/* Date Status Alert */}
              {campaign.date_remark && (
                <div className={`p-4 rounded-2xl flex items-center gap-3 ${
                  campaign.date_status === 'upcoming' 
                    ? 'bg-amber-50 border border-amber-200' 
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <div className={`p-2.5 rounded-xl ${
                    campaign.date_status === 'upcoming' ? 'bg-amber-100' : 'bg-red-100'
                  }`}>
                    <Calendar size={22} className={campaign.date_status === 'upcoming' ? 'text-amber-600' : 'text-red-600'} />
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
              
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    campaign.campaign_type === 'slot' 
                      ? 'bg-violet-100 text-violet-700' 
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {campaign.campaign_type === 'slot' ? 'Tabung Slot' : 'Sumbangan'}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">{campaign.title}</h1>
                <p className="text-slate-600">{campaign.description}</p>
              </div>
              
              {/* Progress */}
              {campaign.campaign_type === 'amount' && campaign.is_unlimited ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-emerald-600">
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
                <div className="flex items-center gap-6">
                  <ProgressRing 
                    percent={campaign.progress_percent} 
                    color={campaign.campaign_type === 'slot' ? '#7c3aed' : '#059669'}
                  />
                  <div>
                    <p className="text-3xl font-bold text-emerald-600">
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
              
              {/* Full Description */}
              {campaign.full_description && (
                <div className="pt-4 border-t border-slate-200">
                  <h3 className="font-semibold text-slate-800 mb-2">Penerangan Penuh</h3>
                  <div className="prose prose-sm max-w-none text-slate-600" dangerouslySetInnerHTML={{ __html: campaign.full_description }}>
                  </div>
                </div>
              )}
              
              {/* Recent Donors */}
              {campaign.recent_donations?.length > 0 && (
                <div className="pt-4 border-t border-slate-200">
                  <h3 className="font-semibold text-slate-800 mb-3">Penderma Terkini</h3>
                  <div className="space-y-3">
                    {campaign.recent_donations.slice(0, 5).map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">{d.donor_name}</span>
                        <span className="font-semibold text-emerald-600">RM {d.amount?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          </div>
          
          {/* Right Column - Donation Form */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <GlassCard className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
                  <Gift size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Buat Sumbangan</h2>
                  <p className="text-sm text-slate-500">Setiap sumbangan bermakna</p>
                </div>
              </div>
              
              <form onSubmit={handleDonate} className="space-y-5">
                {/* Amount/Slots Input */}
                {campaign.campaign_type === 'slot' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Bilangan Slot
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, slots: Math.max(campaign.min_slots || 1, f.slots - 1) }))}
                        className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-xl font-bold transition-colors"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={form.slots}
                        onChange={(e) => setForm(f => ({ ...f, slots: parseInt(e.target.value) || 1 }))}
                        className="flex-1 h-14 text-center text-2xl font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        min={campaign.min_slots || 1}
                        max={Math.min(campaign.max_slots || 5000, campaign.slots_available)}
                      />
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, slots: Math.min(campaign.slots_available, f.slots + 1) }))}
                        className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-xl font-bold transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 text-center">
                      RM {campaign.price_per_slot}/slot • {campaign.slots_available} slot tersedia
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Jumlah Sumbangan
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">RM</span>
                      <input
                        type="number"
                        value={form.amount}
                        onChange={(e) => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-14 pl-14 text-2xl font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        min={campaign.min_amount || 1}
                        max={campaign.is_unlimited ? undefined : (campaign.max_amount || 100000)}
                      />
                    </div>
                    <div className="flex gap-2 mt-3">
                      {[10, 50, 100, 500].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, amount: amt }))}
                          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                            form.amount === amt 
                              ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-500' 
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          RM {amt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Donor Info */}
                {!form.is_anonymous && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Anda *</label>
                      <input
                        type="text"
                        value={form.donor_name}
                        onChange={(e) => setForm(f => ({ ...f, donor_name: e.target.value }))}
                        placeholder="Masukkan nama anda"
                        className="w-full h-11 px-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        required={!form.is_anonymous}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Emel</label>
                        <input
                          type="email"
                          value={form.donor_email}
                          onChange={(e) => setForm(f => ({ ...f, donor_email: e.target.value }))}
                          placeholder="contoh@email.com"
                          className="w-full h-11 px-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefon</label>
                        <input
                          type="tel"
                          value={form.donor_phone}
                          onChange={(e) => setForm(f => ({ ...f, donor_phone: e.target.value }))}
                          placeholder="01X-XXXXXXX"
                          className="w-full h-11 px-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Anonymous Toggle */}
                <label className="flex items-center gap-3 cursor-pointer py-2">
                  <input
                    type="checkbox"
                    checked={form.is_anonymous}
                    onChange={(e) => setForm(f => ({ ...f, is_anonymous: e.target.checked }))}
                    className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-700">Sumbangan tanpa nama</span>
                </label>
                
                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Pesanan (pilihan)</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="Doa atau pesanan anda..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                    rows={2}
                  />
                </div>
                
                {/* Total */}
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-4 border border-emerald-100">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700 font-medium">Jumlah Sumbangan</span>
                    <span className="text-3xl font-bold text-emerald-600">
                      RM {calculateAmount().toLocaleString()}
                    </span>
                  </div>
                </div>
                
                {/* Submit */}
                <button
                  type="submit"
                  disabled={processing || !campaign.can_donate}
                  className={`w-full h-14 font-semibold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                    campaign.can_donate 
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white hover:shadow-xl' 
                      : 'bg-slate-300 text-slate-600 cursor-not-allowed'
                  }`}
                  data-testid="donate-submit-btn"
                >
                  {processing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : !campaign.can_donate ? (
                    <>
                      <AlertCircle size={20} />
                      {campaign.date_remark || 'Tidak Boleh Sumbang'}
                    </>
                  ) : (
                    <>
                      <Heart size={20} />
                      Sahkan Sumbangan
                    </>
                  )}
                </button>
              </form>
            </GlassCard>
          </div>
        </div>
      </main>
      
      {/* QR Code Modal */}
      <AnimatePresence>
        {showQR && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setShowQR(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none" aria-hidden="true">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full max-w-sm pointer-events-auto"
              >
              <GlassCard className="p-6 text-center">
                <button
                  onClick={() => setShowQR(false)}
                  className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-lg"
                >
                  <X size={20} />
                </button>
                <h3 className="text-lg font-bold text-slate-900 mb-4">Imbas untuk Menyumbang</h3>
                <div className="bg-white p-4 rounded-2xl inline-block mb-4">
                  <img
                    src={`${API_URL}/api/tabung/campaigns/${campaignId}/qrcode?size=250`}
                    alt="QR Code"
                    className="w-[250px] h-[250px]"
                  />
                </div>
                <p className="text-sm text-slate-600 mb-4">{campaign.title}</p>
                <button
                  onClick={copyLink}
                  className="w-full py-3 bg-emerald-100 text-emerald-700 rounded-xl font-medium hover:bg-emerald-200 transition-colors flex items-center justify-center gap-2"
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                  {copied ? 'Disalin!' : 'Salin Link'}
                </button>
              </GlassCard>
            </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
      
      {/* Success Modal */}
      <AnimatePresence>
        {showSuccess && successData && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md px-4"
            >
              <GlassCard className="p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-6"
                >
                  <Check size={40} className="text-white" />
                </motion.div>
                
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Sumbangan Berjaya!</h3>
                <p className="text-slate-600 mb-6">Terima kasih atas sumbangan anda</p>
                
                <div className="bg-slate-50 rounded-2xl p-4 mb-6 text-left space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Kempen</span>
                    <span className="font-medium text-slate-900 text-right">{successData.campaign_title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Jumlah</span>
                    <span className="font-bold text-emerald-600">RM {successData.amount?.toFixed(2)}</span>
                  </div>
                  {successData.slots && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Slot</span>
                      <span className="font-medium text-violet-600">{successData.slots} slot</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-3 border-t border-slate-200">
                    <span className="text-slate-600">No. Resit</span>
                    <span className="font-mono text-sm text-slate-900">{successData.receipt_number}</span>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => window.location.reload()}
                    className="flex-1 py-3 bg-emerald-100 text-emerald-700 rounded-xl font-medium hover:bg-emerald-200 transition-colors"
                  >
                    Sumbang Lagi
                  </button>
                  <button
                    onClick={copyLink}
                    className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <Share2 size={18} /> Kongsi
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
