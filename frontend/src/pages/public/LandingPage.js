import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users, CreditCard, Heart, ChevronRight, Wallet, Target, Mail, Phone,
  GraduationCap, DoorOpen, Car, TrendingUp, FileText, Bell, Shield,
  Bot, Sparkles, Settings, User, Bus, ShoppingCart, Stethoscope, Home,
  ExternalLink, Link2, Globe, Calendar, MessageSquareDashed, Building,
  Smartphone, Plus
} from 'lucide-react';
import api, { API_URL } from '../../services/api';
import { Spinner, Button } from '../../components/common';
import { usePortalConfig } from '../../context/PortalConfigContext';

const DEFAULT_HERO_IMAGE = '/images/landing-hero.png';

const NOTIFICATION_SUPPORTED = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
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

const deriveMilestoneMeta = (campaign) => {
  const current = Math.max(toNumber(campaign?.collected_amount ?? campaign?.total_collected, 0), 0);
  const milestones = normalizeMilestones(campaign?.milestones);
  let next = toNumber(campaign?.milestone_next, 0);

  if (next <= 0) {
    const found = milestones.find((value) => current < value);
    if (found) {
      next = found;
    } else {
      const step = milestones.length > 1 ? milestones[milestones.length - 1] - milestones[milestones.length - 2] : milestones[0];
      next = milestones[milestones.length - 1] + Math.max(step, 1);
      while (current >= next) next += Math.max(step, 1);
    }
  }

  const floor = milestones.filter((value) => value < next).slice(-1)[0] || 0;
  const computedPercent = ((current - floor) / Math.max(next - floor, 1)) * 100;
  const percent = Math.min(Math.max(toNumber(campaign?.milestone_segment_progress_percent, computedPercent), 0), 100);
  return { current, next, percent };
};

const LandingPage = () => {
  const navigate = useNavigate();
  const { portal_title, institution_name } = usePortalConfig();
  const [campaigns, setCampaigns] = useState([]);
  const [donationStats, setDonationStats] = useState(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [landingHeroUrl, setLandingHeroUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoLoadError, setLogoLoadError] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(() =>
    NOTIFICATION_SUPPORTED ? Notification.permission : 'unsupported'
  );
  const [notificationRequesting, setNotificationRequesting] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchLandingAndPwa = async () => {
      try {
        const [landingRes, pwaRes] = await Promise.all([
          api.get('/api/settings/landing/public'),
          api.get('/api/public/settings/pwa')
        ]);
        if (cancelled) return;
        if (landingRes.data?.hero_image_url) setLandingHeroUrl(landingRes.data.hero_image_url);
        const icon = pwaRes.data?.icon_512_url || pwaRes.data?.icon_192_url;
        if (icon) setLogoUrl(icon.startsWith('http') ? icon : `${API_URL}${icon.replace(/^\//, '')}`);
      } catch {
        if (!cancelled) setLandingHeroUrl('');
      }
    };
    fetchLandingAndPwa();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) setPwaInstalled(true);
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => { setPwaInstalled(true); setShowInstallBanner(false); setDeferredPrompt(null); });
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const done = () => { if (!cancelled) setLoadingCampaigns(false); };
    const fetchData = async () => {
      try {
        const [campaignsRes, statsRes] = await Promise.all([
          api.get('/api/tabung/public/campaigns', { params: { limit: 6 } }),
          api.get('/api/tabung/public/stats')
        ]);
        if (cancelled) return;
        setCampaigns(campaignsRes.data || []);
        setDonationStats(statsRes.data ? {
          total_collected: statsRes.data.total_collected,
          total_campaigns: statsRes.data.active_campaigns,
          unique_donors: statsRes.data.unique_donors,
          total_donations: statsRes.data.total_donations
        } : null);
      } catch (err) {
        if (!cancelled) console.error('Failed to load campaigns', err);
      } finally {
        done();
      }
    };
    fetchData();
    const fallback = setTimeout(done, 8000);
    return () => { cancelled = true; clearTimeout(fallback); };
  }, []);

  const base = typeof window !== 'undefined' ? window.location.origin : (API_URL || '');
  const apiOrigin = (API_URL || '').replace(/\/$/, '');
  const heroImageSrc = landingHeroUrl
    ? (landingHeroUrl.startsWith('http') ? landingHeroUrl : `${apiOrigin}/${landingHeroUrl.replace(/^\//, '')}`)
    : (process.env?.PUBLIC_URL || base) + DEFAULT_HERO_IMAGE;
  const heroImageFallback = (process.env?.PUBLIC_URL || base) + DEFAULT_HERO_IMAGE;

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setPwaInstalled(true);
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const handleRequestNotificationPermission = async () => {
    if (!NOTIFICATION_SUPPORTED || notificationPermission !== 'default') return;
    setNotificationRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
    } catch (err) {
      console.warn('Notification request failed', err);
    } finally {
      setNotificationRequesting(false);
    }
  };

  const getCategoryLabel = (cat) => {
    const labels = {
      'tabung_pelajar': 'Tabung Pelajar',
      'tabung_masjid': 'Tabung Surau',
      'tabung_asrama': 'Tabung Asrama',
      'tabung_kecemasan': 'Tabung Kecemasan',
      'tabung_anak_yatim': 'Tabung Anak Yatim'
    };
    return labels[cat] || cat;
  };

  return (
    <div className="min-h-screen mesh-gradient min-h-[100dvh] min-w-0 overflow-x-hidden">
      <header className="glass fixed top-0 left-0 right-0 z-40 safe-area-padding" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {logoUrl && !logoLoadError ? (
              <img src={logoUrl} alt={`Logo ${institution_name}`} className="w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 rounded-lg sm:rounded-xl object-contain bg-white/10 shadow-pastel-sm" onError={() => setLogoLoadError(true)} />
            ) : (
              <div className="w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 bg-gradient-to-br from-teal-400 to-violet-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-pastel-sm">
                <GraduationCap className="text-white" size={22} />
              </div>
            )}
            <span className="text-sm sm:text-base md:text-lg font-bold bg-gradient-to-r from-teal-600 to-violet-600 bg-clip-text text-transparent font-heading truncate">{portal_title}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <a href="http://kuantan.mrsm.edu.my/" target="_blank" rel="noopener noreferrer" className="hidden lg:flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-all">
              <Globe size={14} /> Portal MRSM <ExternalLink size={12} />
            </a>
            <a href="https://linktr.ee/MuafakatMRSMKuantan" target="_blank" rel="noopener noreferrer" className="hidden lg:flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all">
              <Link2 size={14} /> Linktree <ExternalLink size={12} />
            </a>
            <a href="https://muafakatmrsmkuantan.x10.mx/" target="_blank" rel="noopener noreferrer" className="hidden lg:flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-pastel-lavender rounded-lg transition-all">
              <Globe size={14} /> Muafakat <ExternalLink size={12} />
            </a>
            <div className="hidden lg:block w-px h-6 bg-slate-300 mx-1" />
            <Button variant="ghost" onClick={() => navigate('/daftar-institusi')} className="hidden md:flex hover:bg-cyan-50 hover:text-cyan-700 text-sm">
              <Building size={16} className="mr-1" /> Daftar Institusi
            </Button>
            <Button variant="ghost" onClick={() => navigate('/sedekah')} className="hidden sm:flex hover:bg-pink-50 hover:text-pink-600 text-sm" data-testid="nav-sedekah"><Heart size={18} className="mr-1" /> Tabung & Sumbangan</Button>
            <Button variant="ghost" onClick={() => navigate('/login')} className="px-3 py-2 sm:px-4 sm:py-2.5 text-sm hover:bg-pastel-mint/50 hover:text-teal-600 min-h-[44px]" data-testid="login-btn">Log Masuk</Button>
            <button onClick={() => navigate('/register')} className="px-4 py-2.5 sm:px-5 sm:py-2.5 bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-400 text-white font-semibold text-sm sm:text-base rounded-xl shadow-pastel-sm hover:shadow-pastel transition-all active:scale-[0.98] min-h-[44px]" data-testid="register-btn">Daftar</button>
          </div>
        </div>
      </header>

      <main className="pt-[calc(3.5rem+env(safe-area-inset-top))] sm:pt-24 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Hero Section - mobile-first */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="lg:pr-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-amber-100 to-orange-100 rounded-full mb-3 sm:mb-4">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-xs sm:text-sm font-semibold text-amber-700">Excellence By Design</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-extrabold leading-tight font-heading tracking-tight">
              <span className="bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">{institution_name} – {portal_title}</span>
            </h1>
            <p className="mt-3 sm:mt-4 md:mt-6 text-base sm:text-lg text-slate-600 leading-snug sm:leading-relaxed">Urus Anak, Kewangan & Muafakat Dalam Satu Sistem</p>

            <div className="mt-4 sm:mt-6 inline-flex items-center gap-2 px-3 py-2 sm:px-5 sm:py-2.5 bg-pastel-lavender/80 rounded-full border border-pastel-lilac max-w-full">
              <Sparkles className="text-violet-600 animate-pulse flex-shrink-0" size={18} />
              <span className="text-xs sm:text-sm font-semibold text-violet-700">Dikuasakan AI · Tanya apa sahaja (Ibu Bapa)</span>
            </div>

            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/register')}
                className="w-full sm:w-auto px-6 py-3.5 sm:py-4 bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-400 text-white font-bold text-base sm:text-lg rounded-xl sm:rounded-2xl shadow-pastel hover:shadow-pastel-lg transition-all flex items-center justify-center gap-2 min-h-[48px]"
                data-testid="hero-register-btn"
              >
                Daftar Sekarang <ChevronRight size={20} />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/login')}
                className="w-full sm:w-auto px-6 py-3.5 sm:py-4 bg-white text-slate-700 font-bold text-base sm:text-lg rounded-xl sm:rounded-2xl shadow-md border-2 border-slate-200 hover:border-teal-300 transition-all min-h-[48px]"
                data-testid="hero-login-btn"
              >
                Log Masuk
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/daftar-institusi')}
                className="w-full sm:w-auto px-6 py-3.5 sm:py-4 bg-cyan-50 text-cyan-700 font-semibold text-base rounded-xl sm:rounded-2xl shadow-sm border-2 border-cyan-200 hover:border-cyan-300 transition-all min-h-[48px] flex items-center justify-center gap-2"
                data-testid="hero-register-institution-btn"
              >
                <Building size={18} /> Daftar Institusi
              </motion.button>
              {NOTIFICATION_SUPPORTED && notificationPermission === 'default' && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleRequestNotificationPermission}
                  disabled={notificationRequesting}
                  className="w-full sm:w-auto px-5 py-3 bg-amber-50 text-amber-800 font-semibold text-sm rounded-xl border-2 border-amber-200 hover:border-amber-400 hover:bg-amber-100 transition-all flex items-center justify-center gap-2 disabled:opacity-70 min-h-[44px]"
                  data-testid="landing-enable-notifications"
                >
                  <Bell size={18} />
                  {notificationRequesting ? 'Meminta…' : 'Terima notifikasi'}
                </motion.button>
              )}
              {NOTIFICATION_SUPPORTED && notificationPermission === 'granted' && (
                <span className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium border border-emerald-200">
                  <Bell size={18} /> Notifikasi diaktifkan
                </span>
              )}
              {showInstallBanner && deferredPrompt && !pwaInstalled && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleInstallPwa}
                  className="w-full sm:w-auto px-5 py-3 bg-slate-800 text-white font-semibold text-sm rounded-xl border-2 border-slate-600 hover:bg-slate-700 transition-all flex items-center justify-center gap-2 min-h-[44px]"
                  data-testid="landing-add-to-home"
                >
                  <Smartphone size={18} />
                  <Plus size={16} />
                  Tambah ikon ke skrin utama
                </motion.button>
              )}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6 lg:hidden w-full"
            >
              <div className="relative rounded-xl sm:rounded-2xl overflow-hidden border border-white/60 shadow-lg">
                <img
                  src={heroImageSrc}
                  alt={`Kampus ${institution_name}`}
                  className="w-full aspect-[16/10] sm:aspect-[4/3] object-cover"
                  onError={(e) => { if (e.target.src !== heroImageFallback) { e.target.onerror = null; e.target.src = heroImageFallback; } }}
                />
              </div>
              <p className="mt-2 sm:mt-3 text-center italic text-xs sm:text-sm bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-medium">
                ❤️ Dibina untuk warga {institution_name} ❤️
              </p>
            </motion.div>

            <div className="mt-8 sm:mt-10 grid grid-cols-2 gap-3 sm:gap-4">
                {[
                  { icon: Users, text: 'Urus Data Anak', color: 'from-blue-500 to-cyan-500', bg: 'bg-blue-50' },
                  { icon: CreditCard, text: 'Bayar Yuran Online', color: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-50' },
                  { icon: Bot, text: 'Pembantu AI 24/7', color: 'from-violet-500 to-fuchsia-400', bg: 'bg-pastel-lavender' },
                  { icon: Heart, text: 'Tabung & Sumbangan', color: 'from-pink-500 to-rose-500', bg: 'bg-pink-50' }
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 + i * 0.08 }}
                    className={`flex items-center gap-2.5 sm:gap-3 p-3 sm:p-4 ${item.bg} rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group`}
                  >
                    <div className={`p-2 sm:p-2.5 bg-gradient-to-br ${item.color} rounded-lg sm:rounded-xl text-white shadow-md flex-shrink-0 group-hover:scale-105 transition-transform`}>
                      <item.icon size={18} className="sm:w-5 sm:h-5" />
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 line-clamp-2">{item.text}</span>
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="mt-5 sm:mt-6 p-4 sm:p-6 bg-gradient-to-r from-pastel-mint via-pastel-lavender to-pastel-rose rounded-xl sm:rounded-2xl border border-pastel-lavender shadow-pastel relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-amber-400/30 to-orange-400/30 rounded-full -translate-x-1/2 -translate-y-1/2 blur-xl" />
                <div className="absolute bottom-0 right-0 w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-pink-400/30 to-rose-400/30 rounded-full translate-x-1/2 translate-y-1/2 blur-xl" />
                <div className="relative text-center space-y-1.5 sm:space-y-2">
                  <p className="text-slate-600 font-medium text-sm sm:text-base md:text-lg italic">...Dan banyak lagi fungsi pintar untuk anda.</p>
                  <p className="text-slate-700 font-semibold text-sm sm:text-base">Kita adalah komuniti yang <span className="bg-gradient-to-r from-teal-600 via-violet-600 to-teal-600 bg-clip-text text-transparent">Bersama</span> dan <span className="bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 bg-clip-text text-transparent">Bersatu</span></p>
                </div>
              </motion.div>
          </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.2 }} className="hidden lg:block relative mt-8 lg:mt-0">
              <div className="absolute -inset-4 bg-gradient-to-r from-teal-400 via-violet-400 to-fuchsia-400 rounded-3xl opacity-20 blur-2xl animate-pulse" />
              <img src={heroImageSrc} alt={`Kampus ${institution_name}`} className="relative rounded-3xl shadow-2xl border-4 border-white/50 w-full object-cover" onError={(e) => { if (e.target.src !== heroImageFallback) { e.target.onerror = null; e.target.src = heroImageFallback; } }} />
              <p className="mt-4 text-center italic text-sm bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-medium tracking-wide">
                ❤️ Dibina dengan penuh kasih sayang untuk warga {institution_name} ❤️
              </p>
            </motion.div>
        </div>

        {/* Donation Stats Section */}
        {donationStats && (
          <div className="mt-12 sm:mt-16 lg:mt-20">
            <div className="relative overflow-hidden bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-500 rounded-2xl sm:rounded-3xl p-6 sm:p-8 lg:p-10 text-white shadow-pastel-lg">
              <div className="absolute top-0 right-0 w-64 sm:w-96 h-64 sm:h-96 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
              <div className="absolute bottom-0 left-0 w-48 sm:w-64 h-48 sm:h-64 bg-amber-400/20 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
              <div className="relative text-center mb-6 sm:mb-8 lg:mb-10">
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold font-heading">Impak Tabung & Sumbangan Anda</h2>
                <p className="text-white/80 mt-1 sm:mt-2 text-sm sm:text-base lg:text-lg">Bersama membina masa depan pelajar {institution_name}</p>
              </div>
              <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                {[
                  { value: `RM ${donationStats.total_collected?.toLocaleString() || '0'}`, label: 'Jumlah Terkumpul', icon: Wallet },
                  { value: donationStats.total_campaigns || 0, label: 'Kempen Aktif', icon: Target },
                  { value: donationStats.unique_donors || 0, label: 'Penderma', icon: Users },
                  { value: donationStats.total_donations || 0, label: 'Sumbangan', icon: Heart }
                ].map((stat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    className="text-center p-3 sm:p-4 bg-white/10 rounded-xl sm:rounded-2xl backdrop-blur-sm"
                  >
                    <stat.icon className="mx-auto mb-1.5 sm:mb-2 text-amber-300" size={24} />
                    <div className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-extrabold truncate" title={String(stat.value)}>{stat.value}</div>
                    <p className="text-white/70 text-xs sm:text-sm mt-0.5 sm:mt-1">{stat.label}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* All Modules Section */}
        <div className="mt-14 sm:mt-16 lg:mt-24">
          <div className="text-center mb-8 sm:mb-10 lg:mb-14">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-pastel-lavender/80 rounded-full mb-3 sm:mb-4 border border-pastel-lilac">
                <Sparkles className="text-violet-600" size={16} />
                <span className="text-xs sm:text-sm font-semibold text-violet-700">Sistem Bersepadu</span>
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-heading">Modul-Modul Utama</h2>
              <p className="text-slate-600 mt-2 sm:mt-3 max-w-2xl mx-auto text-sm sm:text-base lg:text-lg px-1">Sistem pengurusan kewangan maktab yang lengkap untuk semua keperluan MRSMKU</p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
            {[
              { icon: Wallet, title: 'Pengurusan Yuran', desc: 'Urus pakej yuran, bil dan pembayaran pelajar', color: 'from-blue-500 to-teal-500', bg: 'bg-blue-50' },
              { icon: CreditCard, title: 'Pembayaran Online', desc: 'Bayar yuran secara dalam talian dengan mudah', color: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50' },
              { icon: Bell, title: 'Notifikasi & Peringatan', desc: 'Terima peringatan yuran tertunggak automatik', color: 'from-amber-500 to-orange-600', bg: 'bg-amber-50' },
              { icon: TrendingUp, title: 'AI Ramalan Kewangan', desc: 'Ramalan kutipan yuran dengan AI', color: 'from-violet-500 to-fuchsia-400', bg: 'bg-pastel-lavender' },
              { icon: FileText, title: 'Perakaunan', desc: 'Lejar am, imbangan duga dan laporan kewangan', color: 'from-cyan-500 to-blue-600', bg: 'bg-cyan-50' },
              { icon: DoorOpen, title: 'Hostel', desc: 'Imbas QR/Barcode IC, rekod keluar masuk pelajar, sistem merit/demerit & sekatan outing automatik', color: 'from-pink-500 to-rose-600', bg: 'bg-pink-50' },
              { icon: MessageSquareDashed, title: 'Aduan Digital', desc: 'Sistem aduan lengkap dengan penjejakan status', color: 'from-orange-500 to-red-600', bg: 'bg-orange-50' },
              { icon: Building, title: 'Pengurusan Warden', desc: 'Jadual bertugas & auto-assign aduan', color: 'from-teal-500 to-emerald-600', bg: 'bg-teal-50' },
              { icon: Stethoscope, title: 'Sick Bay', desc: 'Rekod kesihatan dan rawatan pelajar', color: 'from-red-500 to-pink-600', bg: 'bg-red-50' },
              { icon: Car, title: 'Keselamatan Kenderaan', desc: 'Sistem QR kawalan keluar masuk kenderaan ibu bapa dengan laporan kekerapan lawatan & ketepatan masa', color: 'from-slate-500 to-gray-700', bg: 'bg-slate-50' },
              { icon: Heart, title: 'Tabung & Sumbangan', desc: 'Platform sumbangan dan kempen derma', color: 'from-rose-500 to-red-600', bg: 'bg-rose-50' },
              { icon: Bus, title: `GBS ${institution_name}`, desc: 'Geng Bas Sekolah (GBS) - Tempah tiket bas untuk pulang bermalam', color: 'from-cyan-500 to-sky-600', bg: 'bg-cyan-50' },
              { icon: ShoppingCart, title: 'Koperasi Maktab', desc: 'Beli kit dan kelengkapan Maktab', color: 'from-lime-500 to-green-600', bg: 'bg-lime-50' },
              { icon: Calendar, title: 'Mesyuarat AGM', desc: 'Pengurusan AGM, kehadiran QR & pelaporan', color: 'from-amber-500 to-orange-600', bg: 'bg-amber-50' },
              { icon: Users, title: 'Pengurusan Pengguna', desc: '12 peranan dengan Sistem Role-Based Access Control (RBAC) dinamik', color: 'from-teal-500 to-violet-500', bg: 'bg-pastel-mint' },
              { icon: Bot, title: 'Pembantu AI', desc: 'Chatbot pintar untuk soal jawab 24/7', color: 'from-violet-500 to-fuchsia-400', bg: 'bg-pastel-lavender' }
            ].map((module, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.04 }}
                whileHover={{ y: -4 }}
                className={`${module.bg} p-4 sm:p-5 lg:p-6 rounded-xl sm:rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer border border-white/50 group`}
              >
                <div className={`w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br ${module.color} rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4 shadow-lg group-hover:scale-105 transition-all duration-300`}>
                  <module.icon className="text-white" size={22} />
                </div>
                <h3 className="font-bold text-slate-900 text-base sm:text-lg mb-1.5 sm:mb-2">{module.title}</h3>
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed line-clamp-2 sm:line-clamp-none">{module.desc}</p>
              </motion.div>
            ))}

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              whileHover={{ y: -4 }}
              className="bg-teal-50 p-4 sm:p-5 lg:p-6 rounded-xl sm:rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer border border-white/50 group"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4 shadow-lg p-2">
                <img src="/images/mydigital-logo.svg" alt="MyDigital ID" className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling?.classList.remove('hidden'); }} />
                <span className="hidden text-xs font-bold text-slate-600">MyDigital ID</span>
              </div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg mb-1.5 sm:mb-2">MyDigital ID</h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">Log masuk selamat dengan MyDigital ID</p>
            </motion.div>
          </div>
        </div>

        {/* Roles Section */}
        <div className="mt-14 sm:mt-16 lg:mt-24">
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-teal-950 to-violet-950 rounded-2xl sm:rounded-3xl p-6 sm:p-8 lg:p-10 text-white shadow-2xl">
            <div className="absolute top-0 right-0 w-48 sm:w-80 h-48 sm:h-80 bg-teal-500/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-40 sm:w-60 h-40 sm:h-60 bg-pink-500/20 rounded-full blur-3xl" />

            <div className="relative text-center mb-6 sm:mb-8 lg:mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-white/10 rounded-full mb-3 sm:mb-4 border border-white/20">
                <Shield className="text-amber-400" size={16} />
                <span className="text-xs sm:text-sm font-semibold">12 Peranan Pengguna</span>
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold font-heading">Akses Berasaskan Peranan</h2>
              <p className="text-white/70 mt-1 sm:mt-2 max-w-xl mx-auto text-sm sm:text-base">Sistem RBAC yang fleksibel untuk pelbagai jenis pengguna</p>
            </div>

            <div className="relative grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
              {[
                { name: 'Super Admin', icon: Shield, color: 'from-red-500 to-rose-600' },
                { name: 'Admin', icon: Settings, color: 'from-blue-500 to-teal-500' },
                { name: 'Bendahari', icon: Wallet, color: 'from-emerald-500 to-teal-600' },
                { name: 'Sub Bendahari', icon: Wallet, color: 'from-green-500 to-emerald-600' },
                { name: 'Guru Kelas', icon: GraduationCap, color: 'from-violet-500 to-fuchsia-500' },
                { name: 'Guru HomeRoom', icon: Home, color: 'from-teal-500 to-cyan-600' },
                { name: 'Warden', icon: Building, color: 'from-amber-500 to-orange-600' },
                { name: 'Pengawal', icon: Car, color: 'from-slate-500 to-gray-600' },
                { name: 'Admin Bas', icon: Bus, color: 'from-cyan-500 to-sky-600' },
                { name: 'Admin Koperasi', icon: ShoppingCart, color: 'from-lime-500 to-green-600' },
                { name: 'Ibu Bapa', icon: Users, color: 'from-pink-500 to-rose-600' },
                { name: 'Pelajar', icon: User, color: 'from-teal-500 to-violet-500' }
              ].map((role, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + i * 0.04 }}
                  whileHover={{ scale: 1.03 }}
                  className="bg-white/10 backdrop-blur-sm p-2.5 sm:p-4 rounded-lg sm:rounded-xl border border-white/10 text-center hover:bg-white/20 transition-all cursor-pointer"
                >
                  <div className={`w-9 h-9 sm:w-12 sm:h-12 bg-gradient-to-br ${role.color} rounded-lg sm:rounded-xl flex items-center justify-center mx-auto mb-2 sm:mb-3 shadow-lg`}>
                    <role.icon className="text-white" size={18} />
                  </div>
                  <p className="text-[10px] sm:text-xs md:text-sm font-semibold leading-tight line-clamp-2">{role.name}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Donation Campaigns Section */}
        <div className="mt-14 sm:mt-16 lg:mt-20">
          <div className="text-center mb-8 sm:mb-10 lg:mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-pink-100 rounded-full mb-3 sm:mb-4">
              <Heart className="text-pink-600" size={16} />
              <span className="text-xs sm:text-sm font-medium text-pink-700">Program Tabung & Sumbangan</span>
            </div>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-primary-900 font-heading">Kempen Tabung & Sumbangan Aktif</h2>
            <p className="text-slate-600 mt-1 sm:mt-2 max-w-2xl mx-auto text-sm sm:text-base px-1">Hulurkan bantuan untuk pelajar dan institusi {institution_name}.</p>
          </div>

          {loadingCampaigns ? (
            <div className="flex justify-center py-10 sm:py-12"><Spinner size="lg" /></div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-10 sm:py-12 text-slate-500 text-sm">Tiada kempen aktif buat masa ini</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
              {              campaigns.map((campaign, idx) => (
                <motion.div
                  key={campaign.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  whileHover={{ y: -4 }}
                  className="bg-white rounded-xl sm:rounded-2xl shadow-md overflow-hidden border border-slate-100 cursor-pointer group hover:shadow-pastel transition-all duration-300"
                  onClick={() => navigate(`/tabung`)}
                  data-testid={`campaign-card-${campaign.id}`}
                >
                  <div className="relative h-40 sm:h-48 overflow-hidden">
                    <img 
                      src={campaign.image_url || 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=400&h=200&fit=crop'} 
                      alt={campaign.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                    <div className="absolute top-2 left-2 sm:top-3 sm:left-3">
                      <span className="px-2 py-1 sm:px-3 sm:py-1.5 bg-white/95 backdrop-blur rounded-full text-[10px] sm:text-xs font-bold text-violet-700 shadow-lg">
                        {getCategoryLabel(campaign.category || 'tabung_pelajar')}
                      </span>
                    </div>
                    <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3">
                      {campaign.is_unlimited ? (
                        <span className="px-2 py-1 sm:px-3 sm:py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full text-[10px] sm:text-xs font-bold text-white shadow-lg">
                          Milestone
                        </span>
                      ) : (
                      <span className="px-2 py-1 sm:px-3 sm:py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full text-[10px] sm:text-xs font-bold text-white shadow-lg">
                        {campaign.progress_percent?.toFixed(0) || 0}%
                      </span>
                      )}
                    </div>
                  </div>
                  <div className="p-4 sm:p-5">
                    <h3 className="font-bold text-base sm:text-lg text-slate-900 mb-1.5 sm:mb-2 line-clamp-2 group-hover:text-teal-600 transition-colors">{campaign.title}</h3>
                    <p className="text-slate-600 text-xs sm:text-sm mb-3 sm:mb-4 line-clamp-2">{campaign.description}</p>

                    <div className="mb-2 sm:mb-3">
                      {campaign.is_unlimited ? (
                        (() => {
                          const milestoneMeta = deriveMilestoneMeta(campaign);
                          return (
                            <>
                              <div className="flex justify-between text-xs sm:text-sm mb-1.5 sm:mb-2">
                                <span className="font-bold text-teal-600">RM {milestoneMeta.current.toLocaleString()}</span>
                                <span className="text-slate-500">Milestone RM {milestoneMeta.next.toLocaleString()}</span>
                              </div>
                              <div className="h-2.5 sm:h-3 bg-slate-100 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${milestoneMeta.percent}%` }}
                                  transition={{ duration: 1, ease: "easeOut" }}
                                  className="h-full bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-400 rounded-full relative"
                                >
                                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                                </motion.div>
                              </div>
                            </>
                          );
                        })()
                      ) : (
                        <>
                          <div className="flex justify-between text-xs sm:text-sm mb-1.5 sm:mb-2">
                            <span className="font-bold text-teal-600">RM {(campaign.collected_amount ?? campaign.total_collected)?.toLocaleString()}</span>
                            <span className="text-slate-500">/ RM {(campaign.target_amount ?? ((campaign.total_slots || 0) * (campaign.price_per_slot || 0) || 0))?.toLocaleString()}</span>
                          </div>
                          <div className="h-2.5 sm:h-3 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(campaign.progress_percent || 0, 100)}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className="h-full bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-400 rounded-full relative"
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                            </motion.div>
                          </div>
                        </>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between text-xs sm:text-sm pt-2 border-t border-slate-100">
                      <span className="text-slate-500 flex items-center gap-1"><Users size={14} /> {campaign.donor_count ?? 0} penderma</span>
                      <span className="text-pink-600 font-bold flex items-center gap-1"><Heart size={14} /> Derma</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <div className="text-center mt-8 sm:mt-10 lg:mt-12">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/tabung')}
              className="w-full sm:w-auto px-6 py-3.5 sm:px-8 sm:py-4 bg-white text-teal-600 font-bold text-base sm:text-lg rounded-xl sm:rounded-2xl shadow-lg border-2 border-pastel-mint hover:border-teal-400 hover:shadow-pastel transition-all inline-flex items-center justify-center gap-2 min-h-[48px]"
              data-testid="view-all-campaigns"
            >
              Lihat Semua Kempen <ChevronRight size={20} />
            </motion.button>
          </div>
        </div>
      </main>

      <footer className="bg-gradient-to-br from-slate-900 via-teal-950 to-violet-950 text-white py-10 sm:py-12 lg:py-16 mt-14 sm:mt-16 lg:mt-20 relative overflow-hidden" style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}>
        <div className="absolute top-0 left-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-48 sm:w-64 h-48 sm:h-64 bg-pink-500/10 rounded-full blur-3xl" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 sm:gap-10 lg:gap-12">
            <div>
              <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-teal-500 to-violet-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-pastel"><GraduationCap className="text-white" size={22} /></div>
                <span className="text-lg sm:text-xl font-bold font-heading bg-gradient-to-r from-white to-teal-200 bg-clip-text text-transparent">{portal_title}</span>
              </div>
              <p className="text-slate-400 text-sm sm:text-base leading-relaxed">Urus Anak, Kewangan & Muafakat Dalam Satu Sistem</p>
              <p className="text-amber-400 font-semibold mt-3 sm:mt-4 text-sm sm:text-base">Excellence By Design</p>
            </div>
            <div>
              <h4 className="font-bold text-base sm:text-lg mb-4 sm:mb-6 text-white">Pautan Pantas</h4>
              <ul className="space-y-2.5 sm:space-y-3">
                <li><button onClick={() => navigate('/login')} className="text-slate-400 hover:text-pink-400 transition flex items-center gap-2 text-sm sm:text-base py-1"><ChevronRight size={16} />Log Masuk</button></li>
                <li><button onClick={() => navigate('/register')} className="text-slate-400 hover:text-pink-400 transition flex items-center gap-2 text-sm sm:text-base py-1"><ChevronRight size={16} />Daftar Akaun</button></li>
                <li><button onClick={() => navigate('/daftar-syarikat-bas')} className="text-slate-400 hover:text-cyan-400 transition flex items-center gap-2 text-sm sm:text-base py-1"><Bus size={16} />Daftar Syarikat Bas</button></li>
                <li><button onClick={() => navigate('/sedekah')} className="text-slate-400 hover:text-pink-400 transition flex items-center gap-2 text-sm sm:text-base py-1"><ChevronRight size={16} />Program Tabung & Sumbangan</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-base sm:text-lg mb-4 sm:mb-6 text-white">Hubungi Kami</h4>
              <ul className="space-y-2.5 sm:space-y-3 text-slate-400 text-sm sm:text-base">
                <li className="flex items-center gap-3"><div className="p-2 bg-teal-500/20 rounded-lg flex-shrink-0"><Mail size={16} className="text-teal-400" /></div> info@muafakat.link</li>
                <li className="flex items-center gap-3"><div className="p-2 bg-pink-500/20 rounded-lg flex-shrink-0"><Phone size={16} className="text-pink-400" /></div> +603-1234 5678</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700/50 mt-8 sm:mt-10 lg:mt-12 pt-6 sm:pt-8 text-center">
            <p className="text-slate-500 text-xs sm:text-sm">© 2026 {portal_title}. Hak Cipta Terpelihara.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
