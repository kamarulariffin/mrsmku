import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Gift, Target, Users, Wallet, Edit, Trash2, Plus, X, Eye,
  TrendingUp, RefreshCw, BarChart3, Grid3X3, Receipt, 
  Share2, Copy, Check, Image, Upload, Download, Star, Sparkles
} from 'lucide-react';
import api, { API_URL } from '../../../services/api';
import { HelpManualLink } from '../../../components/common';

// ===================== GLASS COMPONENTS =====================

const GlassCard = ({ children, className = '', ...props }) => (
  <div className={`backdrop-blur-xl bg-white/80 border border-white/30 rounded-2xl shadow-lg ${className}`} {...props}>
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
    ghost: 'text-slate-600 hover:text-emerald-700 hover:bg-white/50',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`font-medium rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Input = ({ label, error, icon: Icon, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <div className="relative">
      {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon size={18} /></div>}
      <input className={`flex h-11 w-full rounded-xl border bg-white/70 backdrop-blur px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all ${Icon ? 'pl-10' : ''} ${error ? 'border-red-500' : 'border-slate-200'}`} {...props} />
    </div>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Select = ({ label, error, children, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <select className={`flex h-11 w-full rounded-xl border bg-white/70 backdrop-blur px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${error ? 'border-red-500' : 'border-slate-200'}`} {...props}>{children}</select>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Badge = ({ type, children }) => {
  const styles = {
    slot: 'bg-violet-100 text-violet-800 border border-violet-200',
    amount: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    active: 'bg-green-100 text-green-800',
    paused: 'bg-amber-100 text-amber-800',
    completed: 'bg-blue-100 text-blue-800',
    cancelled: 'bg-red-100 text-red-800',
    pending: 'bg-amber-100 text-amber-800',
    success: 'bg-green-100 text-green-800',
    danger: 'bg-red-100 text-red-800',
    upcoming: 'bg-amber-100 text-amber-800',
    ended: 'bg-red-100 text-red-800'
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[type] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

const StatCard = ({ icon: Icon, label, value, subtext, gradient = 'from-emerald-500 to-teal-500' }) => (
  <GlassCard className="p-5 overflow-hidden relative group hover:scale-[1.02] transition-transform">
    <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${gradient} opacity-10 group-hover:opacity-20 transition-opacity`} />
    <div className="flex items-start justify-between relative z-10">
      <div>
        <p className="text-sm text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
      </div>
      <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} text-white shadow-lg`}>
        <Icon size={24} />
      </div>
    </div>
  </GlassCard>
);

const ProgressBar = ({ percent, color = 'emerald' }) => {
  const colors = {
    emerald: 'from-emerald-500 to-teal-500',
    violet: 'from-violet-500 to-fuchsia-500'
  };
  return (
    <div className="w-full bg-slate-200/50 rounded-full h-2.5 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(percent, 100)}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={`h-full rounded-full bg-gradient-to-r ${colors[color]}`}
      />
    </div>
  );
};

const buildCampaignInternalPath = (campaignId) => `/donate/${campaignId}`;

const buildCampaignInternalUrl = (campaignId, rawUrl = '') => {
  const fallbackPath = buildCampaignInternalPath(campaignId);
  if (typeof window === 'undefined') {
    return fallbackPath;
  }

  const normalizePath = (pathValue) => {
    if (!pathValue || typeof pathValue !== 'string') {
      return fallbackPath;
    }
    const trimmedPath = pathValue.trim();
    const routeMatch = trimmedPath.match(/^\/(?:donate|kempen|sedekah)\/([^/?#]+)/i);
    if (routeMatch?.[1]) {
      return buildCampaignInternalPath(routeMatch[1]);
    }
    if (trimmedPath.startsWith('/')) {
      return trimmedPath;
    }
    return fallbackPath;
  };

  try {
    const parsed = new URL(rawUrl || fallbackPath, window.location.origin);
    return `${window.location.origin}${normalizePath(parsed.pathname)}`;
  } catch {
    return `${window.location.origin}${fallbackPath}`;
  }
};

// ===================== IMAGE UPLOADER =====================

const ImageUploader = ({ campaignId, images = [], onUpdate }) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;

    if (images.length + files.length > 10) {
      toast.error('Maksimum 10 gambar sahaja');
      return;
    }

    setUploading(true);
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        await api.post(`/api/tabung/campaigns/${campaignId}/images`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success(`${file.name} dimuat naik`);
      } catch (err) {
        toast.error(`Gagal: ${file.name}`);
      }
    }
    setUploading(false);
    onUpdate?.();
  };

  const handleDelete = async (imageId) => {
    try {
      await api.delete(`/api/tabung/campaigns/${campaignId}/images/${imageId}`);
      toast.success('Gambar dipadam');
      onUpdate?.();
    } catch (err) {
      toast.error('Gagal memadam gambar');
    }
  };

  const handleSetPrimary = async (imageId) => {
    try {
      await api.put(`/api/tabung/campaigns/${campaignId}/images/${imageId}/primary`);
      toast.success('Gambar utama dikemaskini');
      onUpdate?.();
    } catch (err) {
      toast.error('Gagal kemaskini');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700">Gambar Header ({images.length}/10)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          className="hidden"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || images.length >= 10}
        >
          {uploading ? <Spinner size="sm" /> : <Upload size={16} />}
          Muat Naik
        </Button>
      </div>
      
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {images.map((img, i) => (
            <div key={img.id} className="relative group aspect-video rounded-xl overflow-hidden border border-slate-200">
              <img 
                src={`${API_URL}${img.url}`} 
                alt={`Poster ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={() => handleSetPrimary(img.id)}
                  className="p-2 bg-white/90 rounded-lg hover:bg-white transition-colors"
                  title="Set sebagai utama"
                >
                  <Check size={16} className="text-emerald-600" />
                </button>
                <button
                  onClick={() => handleDelete(img.id)}
                  className="p-2 bg-white/90 rounded-lg hover:bg-white transition-colors"
                  title="Padam"
                >
                  <Trash2 size={16} className="text-red-600" />
                </button>
              </div>
              {i === 0 && (
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-emerald-500 text-white text-xs rounded-full">
                  Utama
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {images.length === 0 && (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-500 transition-colors"
        >
          <Image className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Klik untuk muat naik gambar header kempen</p>
          <p className="text-xs text-slate-400 mt-1">Gambar ini akan dipaparkan di bahagian atas halaman kempen</p>
        </div>
      )}
    </div>
  );
};

// ===================== CAMPAIGN DETAIL PANEL =====================

const CampaignDetailPanel = ({ campaign, onClose, onUpdate }) => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [shareData, setShareData] = useState(null);
  const scrollContainerRef = useRef(null);

  // Scroll to top when panel opens or campaign changes
  useEffect(() => {
    if (campaign?.id && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [campaign?.id]);

  useEffect(() => {
    if (campaign?.id) {
      api.get(`/api/tabung/campaigns/${campaign.id}/share-data`)
        .then(res => setShareData(res.data))
        .catch(() => {});
    }
  }, [campaign?.id]);

  const campaignPublicPath = campaign?.id ? buildCampaignInternalPath(campaign.id) : '/tabung';
  const campaignPublicUrl = campaign?.id
    ? buildCampaignInternalUrl(campaign.id, shareData?.url)
    : '';

  const copyLink = () => {
    if (campaignPublicUrl) {
      navigator.clipboard.writeText(campaignPublicUrl);
      setCopied(true);
      toast.success('Link disalin!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!campaign) return null;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-y-0 right-0 w-full max-w-2xl h-screen bg-gradient-to-br from-slate-50 to-white shadow-2xl z-[61] flex flex-col"
    >
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Eye size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold">{campaign.title}</h3>
              <p className="text-emerald-100 text-sm">{campaign.campaign_type === 'slot' ? 'Tabung Slot' : 'Sumbangan'}</p>
            </div>
          </div>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition" aria-label="Tutup">
            <X size={24} />
          </button>
        </div>
      </div>
      
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <GlassCard className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">RM {(campaign.total_collected || 0).toLocaleString()}</p>
            <p className="text-xs text-slate-500">Terkumpul</p>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <p className="text-2xl font-bold text-violet-600">{campaign.donor_count || 0}</p>
            <p className="text-xs text-slate-500">Penderma</p>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-800">{campaign.progress_percent?.toFixed(0)}%</p>
            <p className="text-xs text-slate-500">Progress</p>
          </GlassCard>
        </div>
        
        {/* Progress */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600">Progress Kempen</span>
            <span className="text-sm font-semibold text-emerald-600">
              {campaign.campaign_type === 'slot' 
                ? `${campaign.slots_sold}/${campaign.total_slots} slot`
                : `RM ${(campaign.collected_amount || 0).toLocaleString()}/${(campaign.target_amount || 0).toLocaleString()}`
              }
            </span>
          </div>
          <ProgressBar percent={campaign.progress_percent} color={campaign.campaign_type === 'slot' ? 'violet' : 'emerald'} />
        </GlassCard>
        
        {/* Share Section */}
        <GlassCard className="p-4 space-y-4">
          <h4 className="font-semibold text-slate-800 flex items-center gap-2">
            <Share2 size={18} className="text-emerald-600" />
            Kongsi Kempen
          </h4>
          
          {/* QR Code */}
          <div className="flex items-center gap-4">
            <img 
              src={`${API_URL}/api/tabung/campaigns/${campaign.id}/qrcode?size=150`}
              alt="QR Code"
              className="w-[150px] h-[150px] rounded-xl border border-slate-200"
            />
            <div className="flex-1 space-y-2">
              <p className="text-sm text-slate-600">Imbas QR code atau kongsi link:</p>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={campaignPublicUrl} 
                  readOnly 
                  className="flex-1 h-10 px-3 bg-slate-100 rounded-lg text-sm"
                />
                <button
                  onClick={copyLink}
                  className="px-4 h-10 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <a
                  href={`${API_URL}/api/tabung/campaigns/${campaign.id}/qrcode?size=500`}
                  download={`qr-${campaign.id}.png`}
                  className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                  title="Download QR"
                >
                  <Download size={20} />
                </a>
              </div>
            </div>
          </div>
        </GlassCard>
        
        {/* Header Images */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-slate-800">Gambar Header Kempen</h4>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
              Banner/Header sahaja
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Gambar ini dipaparkan di bahagian atas halaman kempen sebagai header/banner.
          </p>
          <ImageUploader 
            campaignId={campaign.id}
            images={campaign.images || []}
            onUpdate={onUpdate}
          />
        </GlassCard>
        
        {/* Description */}
        {campaign.description && (
          <GlassCard className="p-4">
            <h4 className="font-semibold text-slate-800 mb-2">Penerangan Ringkas</h4>
            {/* Render HTML content properly if it contains HTML tags */}
            {campaign.description.includes('<') ? (
              <div 
                className="text-sm text-slate-600 prose prose-sm max-w-none prose-headings:text-slate-800 prose-p:text-slate-600 prose-strong:text-slate-700 prose-ul:text-slate-600 prose-li:text-slate-600"
                dangerouslySetInnerHTML={{ __html: campaign.description }}
              />
            ) : (
              <p className="text-sm text-slate-600">{campaign.description}</p>
            )}
          </GlassCard>
        )}
        
        {campaign.full_description && (
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-slate-800">Penerangan Penuh</h4>
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                Termasuk gambar poster
              </span>
            </div>
            {/* Render HTML content properly if it contains HTML tags */}
            {campaign.full_description.includes('<') ? (
              <div 
                className="text-sm text-slate-600 prose prose-sm max-w-none prose-headings:text-slate-800 prose-p:text-slate-600 prose-strong:text-slate-700 prose-ul:text-slate-600 prose-li:text-slate-600 prose-img:rounded-xl prose-img:shadow-md prose-img:my-4"
                dangerouslySetInnerHTML={{ __html: campaign.full_description }}
              />
            ) : (
              <div className="text-sm text-slate-600 whitespace-pre-wrap">{campaign.full_description}</div>
            )}
          </GlassCard>
        )}
      </div>
      
      {/* Footer */}
      <div className="p-4 border-t bg-white/80 flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => navigate(campaignPublicPath)}
        >
          <Eye size={18} /> Lihat Halaman Kempen
        </Button>
        <Button variant="primary" onClick={onClose} className="flex-1">
          Tutup
        </Button>
      </div>
    </motion.div>
  );
};

// ===================== MAIN PAGE =====================

export default function AdminTabungPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [donations, setDonations] = useState([]);
  const [stats, setStats] = useState(null);
  const [realtimeReport, setRealtimeReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const [campaignsRes, donationsRes, statsRes, realtimeRes] = await Promise.all([
        api.get('/api/tabung/campaigns'),
        api.get('/api/tabung/donations'),
        api.get('/api/tabung/stats'),
        api.get('/api/tabung/reports/real-time')
      ]);
      setCampaigns(campaignsRes.data);
      setDonations(donationsRes.data);
      setStats(statsRes.data);
      setRealtimeReport(realtimeRes.data);
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

  // Navigate to create page
  const handleCreateCampaign = () => {
    navigate('/admin/tabung/new');
  };

  // Navigate to edit page
  const handleEditCampaign = (campaignId) => {
    navigate(`/admin/tabung/${campaignId}/edit`);
  };

  const openDetailPanel = (campaign) => {
    setSelectedCampaign(campaign);
    setShowDetailPanel(true);
  };

  const handleDeleteCampaign = async (campaignId) => {
    if (!window.confirm('Adakah anda pasti ingin membatalkan kempen ini?')) return;
    try {
      await api.delete(`/api/tabung/campaigns/${campaignId}`);
      toast.success('Kempen dibatalkan');
      fetchData();
    } catch (err) {
      toast.error('Gagal membatalkan kempen');
    }
  };

  const handleToggleFeatured = async (campaignId) => {
    try {
      const res = await api.put(`/api/tabung/campaigns/${campaignId}/featured`);
      toast.success(res.data.message);
      fetchData();
    } catch (err) {
      toast.error('Gagal menukar status pilihan utama');
    }
  };

  const filteredCampaigns = campaigns.filter(c => {
    if (filterType !== 'all' && c.campaign_type !== filterType) return false;
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    return true;
  });

  const filteredDonations = donations.filter(d => {
    if (filterType !== 'all' && d.campaign_type !== filterType) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/30 p-6 space-y-6 min-w-0 overflow-x-hidden" data-testid="admin-tabung-page">
      {/* Floating Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-20 right-20 w-96 h-96 bg-emerald-200/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-teal-200/20 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
            <Gift size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tabung & Sumbangan</h1>
            <p className="text-slate-600">Pengurusan bersepadu kempen derma</p>
            <HelpManualLink sectionId="tabung" label="Manual bahagian ini" className="mt-1 inline-block" />
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw size={18} /> Muat Semula
          </Button>
          <Button onClick={handleCreateCampaign} data-testid="add-campaign-btn">
            <Plus size={18} /> Kempen Baru
          </Button>
        </div>
      </div>

      {/* Real-time Banner */}
      {realtimeReport && (
        <GlassCard className="p-5 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-200/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-medium text-emerald-700">Kutipan Hari Ini</span>
              </div>
              <span className="text-3xl font-bold text-emerald-800">RM {(realtimeReport.today?.total || 0).toLocaleString()}</span>
              <span className="text-sm text-slate-600">({realtimeReport.today?.count || 0} sumbangan)</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Bulan Ini</p>
              <p className="text-xl font-bold text-emerald-700">RM {(realtimeReport.this_month?.total || 0).toLocaleString()}</p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={Target} 
          label="Kempen Aktif" 
          value={stats?.campaigns?.active || 0}
          subtext={`${stats?.campaigns?.slot_based || 0} slot, ${stats?.campaigns?.amount_based || 0} sumbangan`}
          gradient="from-emerald-500 to-teal-500"
        />
        <StatCard 
          icon={Users} 
          label="Penderma Unik" 
          value={stats?.donations?.unique_donors || 0}
          subtext={`${stats?.donations?.total_donations || 0} jumlah sumbangan`}
          gradient="from-violet-500 to-fuchsia-500"
        />
        <StatCard 
          icon={Grid3X3} 
          label="Slot Terjual" 
          value={(stats?.donations?.total_slots_sold || 0).toLocaleString()}
          subtext={`RM ${(stats?.by_type?.slot?.total || 0).toLocaleString()}`}
          gradient="from-amber-500 to-orange-500"
        />
        <StatCard 
          icon={Wallet} 
          label="Jumlah Terkumpul" 
          value={`RM ${(stats?.donations?.total_amount || 0).toLocaleString()}`}
          subtext={`${stats?.campaigns?.completed || 0} kempen selesai`}
          gradient="from-teal-500 to-violet-500"
        />
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {[
            { key: 'featured', label: 'Pilihan Utama', icon: Sparkles },
            { key: 'campaigns', label: 'Kempen', icon: Target },
            { key: 'donations', label: 'Sumbangan', icon: Receipt },
            { key: 'reports', label: 'Laporan', icon: BarChart3 }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.key 
                  ? tab.key === 'featured' 
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30' 
                  : 'bg-white/70 backdrop-blur text-slate-600 hover:bg-white hover:shadow-md'
              }`}
              data-testid={`tab-${tab.key}`}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.key === 'featured' && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
                  {campaigns.filter(c => c.is_featured).length}
                </span>
              )}
            </button>
          ))}
        </div>
        
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white/70 backdrop-blur text-sm focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Semua Jenis</option>
            <option value="slot">Slot (Infaq)</option>
            <option value="amount">Sumbangan (Sedekah)</option>
          </select>
          
          {(activeTab === 'campaigns' || activeTab === 'featured') && (
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white/70 backdrop-blur text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="paused">Dijeda</option>
              <option value="completed">Selesai</option>
              <option value="cancelled">Dibatal</option>
            </select>
          )}
        </div>
      </div>

      {/* Featured Campaigns Tab */}
      {activeTab === 'featured' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
            <Sparkles className="text-amber-600" size={24} />
            <div>
              <h3 className="font-semibold text-amber-800">Kempen Pilihan Utama</h3>
              <p className="text-sm text-amber-600">Kempen yang dipaparkan di bahagian utama untuk perhatian pengguna</p>
            </div>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.filter(c => c.is_featured).map((campaign) => (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -4 }}
              >
                <GlassCard className="overflow-hidden ring-2 ring-amber-400 shadow-amber-200/50">
                  <div className="aspect-video bg-gradient-to-br from-amber-50 to-orange-50 relative">
                    {campaign.image_url ? (
                      <img src={`${API_URL}${campaign.image_url}`} alt={campaign.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Gift className="w-12 h-12 text-amber-300" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full text-xs font-semibold flex items-center gap-1.5">
                      <Star size={12} fill="currentColor" /> Pilihan Utama
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <h3 className="font-bold text-slate-900">{campaign.title}</h3>
                    <ProgressBar percent={campaign.progress_percent} color="emerald" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">{campaign.donor_count || 0} penderma</span>
                      <span className="font-bold text-emerald-600">RM {(campaign.total_collected || 0).toLocaleString()}</span>
                    </div>
                    <button
                      onClick={() => handleToggleFeatured(campaign.id)}
                      className="w-full py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
                      data-testid={`remove-featured-${campaign.id}`}
                    >
                      Buang dari Pilihan Utama
                    </button>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
            
            {campaigns.filter(c => c.is_featured).length === 0 && (
              <div className="col-span-full">
                <GlassCard className="py-12 text-center">
                  <Sparkles className="w-12 h-12 text-amber-300 mx-auto mb-4" />
                  <p className="text-slate-500">Tiada kempen pilihan utama</p>
                  <p className="text-sm text-slate-400 mt-1">Klik ikon bintang pada kempen untuk tetapkan sebagai pilihan</p>
                </GlassCard>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Campaigns Tab - Card Grid */}
      {activeTab === 'campaigns' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCampaigns.map((campaign) => (
            <motion.div
              key={campaign.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2 }}
            >
              <GlassCard className="overflow-hidden cursor-pointer group" onClick={() => openDetailPanel(campaign)}>
                {/* Image */}
                <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                  {campaign.image_url ? (
                    <img 
                      src={`${API_URL}${campaign.image_url}`}
                      alt={campaign.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
                    <Badge type={campaign.status}>
                      {campaign.status === 'active' ? 'Aktif' : 
                       campaign.status === 'paused' ? 'Dijeda' :
                       campaign.status === 'completed' ? 'Selesai' : 'Dibatal'}
                    </Badge>
                    {/* Date Status Badge */}
                    {campaign.date_remark && (
                      <Badge type={campaign.date_status === 'upcoming' ? 'pending' : 'danger'}>
                        {campaign.date_remark}
                      </Badge>
                    )}
                    {/* Featured Badge */}
                    {campaign.is_featured && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-400 to-orange-500 text-white flex items-center gap-1">
                        <Star size={10} fill="currentColor" /> Pilihan
                      </span>
                    )}
                  </div>
                  {campaign.images?.length > 1 && (
                    <div className="absolute top-3 right-3 px-2 py-1 bg-black/50 text-white text-xs rounded-full flex items-center gap-1">
                      <Image size={12} /> {campaign.images.length}
                    </div>
                  )}
                </div>
                
                {/* Content */}
                <div className="p-4 space-y-3">
                  <h3 className="font-bold text-slate-900 line-clamp-1">{campaign.title}</h3>
                  
                  {/* Date info */}
                  {(campaign.start_date || campaign.end_date) && (
                    <div className="text-xs text-slate-500">
                      {campaign.start_date && (
                        <span>Mula: {new Date(campaign.start_date).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      )}
                      {campaign.start_date && campaign.end_date && <span className="mx-1">•</span>}
                      {campaign.end_date && (
                        <span>Tamat: {new Date(campaign.end_date).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      )}
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <ProgressBar 
                      percent={campaign.progress_percent} 
                      color={campaign.campaign_type === 'slot' ? 'violet' : 'emerald'} 
                    />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">
                        {campaign.campaign_type === 'slot' 
                          ? `${campaign.slots_sold}/${campaign.total_slots} slot`
                          : `${campaign.progress_percent?.toFixed(0)}%`
                        }
                      </span>
                      <span className="font-bold text-emerald-600">
                        RM {(campaign.total_collected || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  
                  {/* Button Ketahui Lebih Lanjut */}
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/donate/${campaign.id}`); }}
                    className="w-full py-2.5 mt-3 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors flex items-center justify-center gap-2"
                    data-testid={`admin-campaign-detail-btn-${campaign.id}`}
                  >
                    <Eye size={16} /> Ketahui Lebih Lanjut
                  </button>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-sm text-slate-500 flex items-center gap-1">
                      <Users size={14} /> {campaign.donor_count || 0}
                    </span>
                    <div className="flex gap-1">
                      {/* Featured Toggle Button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleFeatured(campaign.id); }}
                        className={`p-2 rounded-lg transition-colors ${
                          campaign.is_featured 
                            ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' 
                            : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                        }`}
                        title={campaign.is_featured ? 'Buang dari Pilihan Utama' : 'Tetapkan Pilihan Utama'}
                        data-testid={`toggle-featured-${campaign.id}`}
                      >
                        <Star size={16} fill={campaign.is_featured ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditCampaign(campaign.id); }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openDetailPanel(campaign); }}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Lihat & Kongsi"
                      >
                        <Share2 size={16} />
                      </button>
                      {campaign.status === 'active' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(campaign.id); }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Batalkan"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
          
          {filteredCampaigns.length === 0 && (
            <div className="col-span-full">
              <GlassCard className="py-12 text-center">
                <Gift className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">Tiada kempen dijumpai</p>
              </GlassCard>
            </div>
          )}
        </div>
      )}

      {/* Donations Tab */}
      {activeTab === 'donations' && (
        <GlassCard className="overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Senarai Sumbangan</h3>
            <span className="text-sm text-slate-500">{filteredDonations.length} rekod</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="text-left py-4 px-4 font-semibold text-slate-600">Tarikh</th>
                  <th className="text-left py-4 px-4 font-semibold text-slate-600">Penderma</th>
                  <th className="text-left py-4 px-4 font-semibold text-slate-600">Kempen</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-600">Jenis</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-600">Slot</th>
                  <th className="text-right py-4 px-4 font-semibold text-slate-600">Jumlah</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-600">Status</th>
                  <th className="text-left py-4 px-4 font-semibold text-slate-600">No. Resit</th>
                </tr>
              </thead>
              <tbody>
                {filteredDonations.slice(0, 100).map((donation) => (
                  <tr key={donation.id} className="border-b border-slate-100 hover:bg-white/50 transition-colors">
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(donation.created_at).toLocaleDateString('ms-MY', { 
                        day: '2-digit', month: 'short', year: 'numeric' 
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">
                        {donation.is_anonymous ? 'Tanpa Nama' : donation.donor_name}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{donation.campaign_title}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge type={donation.campaign_type || (donation.is_slot_based ? 'slot' : 'amount')}>
                        {donation.is_slot_based ? 'Slot' : 'Sumbangan'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-center font-medium">
                      {donation.slots ? donation.slots : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-600">
                      RM {donation.amount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge type={donation.payment_status === 'completed' ? 'success' : 'pending'}>
                        {donation.payment_status === 'completed' ? 'Berjaya' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-500">
                      {donation.receipt_number}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Top Donors */}
          <GlassCard className="p-6">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Users size={20} className="text-emerald-600" />
              Top 10 Penderma
            </h3>
            <div className="space-y-3">
              {stats?.top_donors?.map((donor, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-white/50 rounded-xl hover:bg-white transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-lg ${
                      i === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600' : 
                      i === 1 ? 'bg-gradient-to-br from-slate-400 to-slate-500' : 
                      i === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-800' : 
                      'bg-slate-300'
                    }`}>
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{donor.name}</p>
                      <p className="text-xs text-slate-500">{donor.count} sumbangan</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-emerald-600">RM {donor.total.toLocaleString()}</p>
                </div>
              ))}
              {(!stats?.top_donors || stats.top_donors.length === 0) && (
                <p className="text-center text-slate-500 py-8">Tiada data penderma</p>
              )}
            </div>
          </GlassCard>

          {/* Monthly Trend */}
          <GlassCard className="p-6">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-emerald-600" />
              Trend Bulanan
            </h3>
            <div className="space-y-3">
              {stats?.monthly_trend?.slice(0, 6).map((month, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="w-20 text-sm text-slate-600">{month.month}</span>
                  <div className="flex-1">
                    <ProgressBar 
                      percent={(month.total / (stats?.monthly_trend?.[0]?.total || 1)) * 100} 
                      color="emerald" 
                    />
                  </div>
                  <span className="w-32 text-right font-medium text-slate-900">
                    RM {month.total.toLocaleString()}
                  </span>
                  <span className="w-20 text-right text-sm text-slate-500">
                    {month.count}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* Detail Panel */}
      <AnimatePresence>
        {showDetailPanel && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" 
              onClick={() => setShowDetailPanel(false)} 
            />
            <CampaignDetailPanel
              campaign={selectedCampaign}
              onClose={() => setShowDetailPanel(false)}
              onUpdate={fetchData}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
