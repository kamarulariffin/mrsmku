import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import {
  Gift, ArrowLeft, Save, Image, Upload, X, Trash2, Check, Eye,
  Grid3X3, Wallet, Target, GripVertical, Star, AlertCircle, Calendar
} from 'lucide-react';
import api, { API_URL } from '../../../services/api';

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
    secondary: 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white',
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

const Input = ({ label, error, icon: Icon, helper, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <div className="relative">
      {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon size={18} /></div>}
      <input className={`flex h-12 w-full rounded-xl border bg-white/70 backdrop-blur px-4 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all ${Icon ? 'pl-10' : ''} ${error ? 'border-red-500' : 'border-slate-200'}`} {...props} />
    </div>
    {helper && <p className="text-xs text-slate-500">{helper}</p>}
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Select = ({ label, error, children, helper, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <select className={`flex h-12 w-full rounded-xl border bg-white/70 backdrop-blur px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${error ? 'border-red-500' : 'border-slate-200'}`} {...props}>{children}</select>
    {helper && <p className="text-xs text-slate-500">{helper}</p>}
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

// ===================== WYSIWYG EDITOR WITH IMAGE UPLOAD =====================

// Custom Image Upload Handler for Quill
const imageHandler = function() {
  const input = document.createElement('input');
  input.setAttribute('type', 'file');
  input.setAttribute('accept', 'image/*');
  input.click();
  
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Gambar melebihi 5MB');
      return;
    }
    
    // Show loading toast
    const loadingToast = toast.loading('Memuat naik gambar...');
    
    try {
      // Upload to server
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/api/upload/editor-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Get the editor instance
      const quill = this.quill;
      const range = quill.getSelection(true);
      
      // Insert image at cursor position
      const imageUrl = `${API_URL}${response.data.url}`;
      quill.insertEmbed(range.index, 'image', imageUrl);
      quill.setSelection(range.index + 1);
      
      toast.dismiss(loadingToast);
      toast.success('Gambar berjaya dimuat naik');
    } catch (err) {
      toast.dismiss(loadingToast);
      toast.error('Gagal memuat naik gambar');
      console.error('Image upload error:', err);
    }
  };
};

const quillModules = {
  toolbar: {
    container: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean']
    ],
    handlers: {
      image: imageHandler
    }
  },
};

const quillFormats = [
  'header', 'bold', 'italic', 'underline', 'strike',
  'color', 'background', 'list', 'bullet', 'align', 'link', 'image'
];

const DEFAULT_MILESTONES = [50000, 100000, 200000];

const parseMilestones = (rawValue) => {
  const source = Array.isArray(rawValue)
    ? rawValue
    : String(rawValue || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  const normalized = source
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const unique = [];
  normalized.forEach((value) => {
    if (!unique.includes(value)) unique.push(value);
  });

  return unique.length > 0 ? unique : [...DEFAULT_MILESTONES];
};

const formatMilestonesInput = (values) => parseMilestones(values).join(', ');

const formatShortCurrency = (value) => {
  const amount = Number(value) || 0;
  if (amount >= 1000000) return `RM${(amount / 1000000).toFixed(1)}j`;
  if (amount >= 1000) return `RM${(amount / 1000).toFixed(0)}k`;
  return `RM${amount.toLocaleString()}`;
};

// ===================== IMAGE UPLOADER =====================

const ImageUploader = ({ campaignId, images = [], onUpdate, isNew = false, pendingImages, setPendingImages }) => {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFiles = async (files) => {
    const totalImages = (isNew ? pendingImages.length : images.length) + files.length;
    if (totalImages > 10) {
      toast.error('Maksimum 10 gambar sahaja');
      return;
    }

    if (isNew) {
      // For new campaign, store files locally
      const newPendingImages = [...pendingImages];
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} melebihi 5MB`);
          continue;
        }
        const preview = URL.createObjectURL(file);
        newPendingImages.push({ file, preview, id: Date.now() + Math.random() });
      }
      setPendingImages(newPendingImages);
    } else {
      // For existing campaign, upload immediately
      setUploading(true);
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} melebihi 5MB`);
          continue;
        }
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
    }
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    handleFiles(files);
  };

  const handleDelete = async (imageId, isPending = false) => {
    if (isPending) {
      setPendingImages(pendingImages.filter(img => img.id !== imageId));
    } else {
      try {
        await api.delete(`/api/tabung/campaigns/${campaignId}/images/${imageId}`);
        toast.success('Gambar dipadam');
        onUpdate?.();
      } catch (err) {
        toast.error('Gagal memadam gambar');
      }
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

  const displayImages = isNew ? pendingImages : images;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-medium text-slate-700">Gambar Header</label>
          <p className="text-xs text-slate-500 mt-0.5">{displayImages.length}/10 gambar • Maks 5MB setiap satu</p>
        </div>
      </div>
      
      {/* Drag & Drop Area */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          dragActive 
            ? 'border-emerald-500 bg-emerald-50/50' 
            : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-3">
          {uploading ? (
            <Spinner size="lg" />
          ) : (
            <>
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100">
                <Upload className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Drag & drop gambar header di sini</p>
                <p className="text-xs text-slate-500 mt-1">Gambar ini akan dipaparkan di bahagian atas halaman kempen</p>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Image Grid */}
      {displayImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {displayImages.map((img, i) => (
            <motion.div
              key={img.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative group aspect-square rounded-xl overflow-hidden border-2 border-slate-200 hover:border-emerald-400 transition-all shadow-sm hover:shadow-lg"
            >
              <img 
                src={isNew ? img.preview : `${API_URL}${img.url}`} 
                alt={`Poster ${i + 1}`}
                className="w-full h-full object-cover"
              />
              
              {/* Primary Badge */}
              {i === 0 && (
                <div className="absolute top-2 left-2 px-2 py-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium rounded-full flex items-center gap-1 shadow-lg">
                  <Star size={12} /> Utama
                </div>
              )}
              
              {/* Hover Actions */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-end p-3 gap-2">
                <div className="flex gap-2">
                  {!isNew && i !== 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSetPrimary(img.id); }}
                      className="p-2 bg-white/90 rounded-lg hover:bg-white transition-colors"
                      title="Jadikan utama"
                    >
                      <Star size={16} className="text-amber-500" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(img.id, isNew); }}
                    className="p-2 bg-white/90 rounded-lg hover:bg-red-50 transition-colors"
                    title="Padam"
                  >
                    <Trash2 size={16} className="text-red-600" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

// ===================== MAIN PAGE COMPONENT =====================

export default function CampaignFormPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(campaignId);
  
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [campaign, setCampaign] = useState(null);
  const [pendingImages, setPendingImages] = useState([]);
  
  const [form, setForm] = useState({
    title: '',
    description: '',
    full_description: '',
    campaign_type: 'slot',
    total_slots: 100,
    price_per_slot: 25,
    min_slots: 1,
    max_slots: 5000,
    target_amount: 10000,
    min_amount: 1,
    max_amount: 100000,
    is_unlimited: false,
    milestones_input: formatMilestonesInput(DEFAULT_MILESTONES),
    is_public: true,
    allow_anonymous: true,
    is_permanent: false,
    start_date: '',
    end_date: '',
    status: 'active'
  });

  const [errors, setErrors] = useState({});

  // Fetch campaign data for edit
  const fetchCampaign = useCallback(async () => {
    if (!isEdit) return;
    try {
      const res = await api.get(`/api/tabung/campaigns/${campaignId}`);
      const data = res.data;
      setCampaign(data);
      setForm({
        title: data.title || '',
        description: data.description || '',
        full_description: data.full_description || '',
        campaign_type: data.campaign_type || 'slot',
        total_slots: data.total_slots || 100,
        price_per_slot: data.price_per_slot || 25,
        min_slots: data.min_slots || 1,
        max_slots: data.max_slots || 5000,
        target_amount: data.target_amount ?? 10000,
        min_amount: data.min_amount ?? 1,
        max_amount: data.max_amount ?? 100000,
        is_unlimited: data.is_unlimited === true,
        milestones_input: formatMilestonesInput(data.milestones || DEFAULT_MILESTONES),
        is_public: data.is_public !== false,
        allow_anonymous: data.allow_anonymous !== false,
        is_permanent: data.is_permanent || false,
        start_date: data.start_date ? data.start_date.split('T')[0] : '',
        end_date: data.end_date ? data.end_date.split('T')[0] : '',
        status: data.status || 'active'
      });
    } catch (err) {
      toast.error('Gagal memuatkan kempen');
      navigate('/admin/tabung');
    } finally {
      setLoading(false);
    }
  }, [isEdit, campaignId, navigate]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  // Validate form
  const validateForm = () => {
    const newErrors = {};
    
    if (!form.title.trim()) {
      newErrors.title = 'Nama kempen diperlukan';
    }
    
    if (form.campaign_type === 'slot') {
      if (!form.total_slots || form.total_slots < 1) {
        newErrors.total_slots = 'Jumlah slot tidak sah';
      }
      if (!form.price_per_slot || form.price_per_slot < 1) {
        newErrors.price_per_slot = 'Harga per slot tidak sah';
      }
    } else {
      if (!form.is_unlimited && (!form.target_amount || form.target_amount < 1)) {
        newErrors.target_amount = 'Jumlah sasaran tidak sah';
      }
      if (form.is_unlimited && parseMilestones(form.milestones_input).length === 0) {
        newErrors.milestones_input = 'Sila masukkan sekurang-kurangnya satu milestone';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Save campaign
  const handleSave = async () => {
    if (!validateForm()) {
      toast.error('Sila betulkan ralat dalam borang');
      return;
    }
    
    setSaving(true);
    try {
      let newCampaignId = campaignId;
      const parsedMilestones = parseMilestones(form.milestones_input);
      const payload = {
        ...form,
        milestones: parsedMilestones,
      };
      delete payload.milestones_input;

      if (payload.campaign_type !== 'amount') {
        delete payload.is_unlimited;
        delete payload.milestones;
      } else if (payload.is_unlimited && (!payload.target_amount || payload.target_amount < 1)) {
        payload.target_amount = parsedMilestones[parsedMilestones.length - 1] || DEFAULT_MILESTONES[DEFAULT_MILESTONES.length - 1];
      }
      
      if (isEdit) {
        await api.put(`/api/tabung/campaigns/${campaignId}`, payload);
        toast.success('Kempen berjaya dikemaskini');
      } else {
        const res = await api.post('/api/tabung/campaigns', payload);
        newCampaignId = res.data?.id || res.data?.campaign_id;
        toast.success('Kempen berjaya dicipta');
        
        // Upload pending images for new campaign
        if (pendingImages.length > 0) {
          for (const img of pendingImages) {
            const formData = new FormData();
            formData.append('file', img.file);
            try {
              await api.post(`/api/tabung/campaigns/${newCampaignId}/images`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
              });
            } catch (err) {
              console.error('Failed to upload image:', err);
            }
          }
        }
      }
      
      navigate('/admin/tabung');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Operasi gagal');
    } finally {
      setSaving(false);
    }
  };

  // Calculate estimated target
  const milestoneValues = parseMilestones(form.milestones_input);
  const milestoneTarget = milestoneValues[milestoneValues.length - 1] || 0;
  const milestoneSampleCurrent = campaign?.total_collected || 23450;
  const upcomingMilestone = milestoneValues.find((value) => value > milestoneSampleCurrent) || milestoneTarget;
  const milestonePreviewPercent = Math.min((milestoneSampleCurrent / Math.max(upcomingMilestone, 1)) * 100, 100);
  const estimatedTarget = form.campaign_type === 'slot' 
    ? form.total_slots * form.price_per_slot 
    : (form.is_unlimited ? milestoneTarget : form.target_amount);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/30 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/30 min-w-0 overflow-x-hidden" data-testid="campaign-form-page">
      {/* Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-20 right-20 w-96 h-96 bg-emerald-200/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-teal-200/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-100/10 rounded-full blur-3xl" />
      </div>
      
      {/* Header */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 border-b border-white/30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/admin/tabung')}
                className="p-2 hover:bg-white/50 rounded-xl transition-colors"
              >
                <ArrowLeft size={20} className="text-slate-600" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg">
                  <Gift size={24} />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">
                    {isEdit ? 'Edit Kempen' : 'Kempen Baru'}
                  </h1>
                  <p className="text-sm text-slate-500">
                    {isEdit ? 'Kemaskini maklumat kempen' : 'Cipta kempen tabung atau sumbangan baru'}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => navigate('/admin/tabung')}>
                Batal
              </Button>
              <Button onClick={handleSave} loading={saving} data-testid="save-campaign-btn">
                <Save size={18} />
                {isEdit ? 'Simpan Perubahan' : 'Cipta Kempen'}
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info Card */}
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
                <Target size={20} className="text-emerald-600" />
                Maklumat Asas
              </h2>
              
              <div className="space-y-5">
                <Input
                  label="Nama Kempen *"
                  value={form.title}
                  onChange={(e) => setForm({...form, title: e.target.value})}
                  placeholder="cth: Tabung Surau Al-Hidayah"
                  error={errors.title}
                  data-testid="campaign-title-input"
                />
                
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Penerangan Ringkas</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({...form, description: e.target.value})}
                    placeholder="Penerangan ringkas untuk paparan card..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white/70 backdrop-blur resize-none"
                    rows={2}
                  />
                  <p className="text-xs text-slate-500">Dipaparkan pada card kempen</p>
                </div>

                {/* Highlighted Campaign Type Selection */}
                <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl" data-testid="campaign-type-box">
                  <Select
                    label="Jenis Kempen *"
                    value={form.campaign_type}
                    onChange={(e) => setForm({...form, campaign_type: e.target.value})}
                    disabled={isEdit}
                    helper={isEdit ? 'Jenis kempen tidak boleh diubah' : 'Pilih jenis kutipan'}
                  >
                    <option value="slot">Tabung Slot</option>
                    <option value="amount">Sumbangan Bebas</option>
                  </Select>
                </div>
              </div>
            </GlassCard>
            
            {/* WYSIWYG Editor Card */}
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Eye size={20} className="text-emerald-600" />
                Penerangan Penuh
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Tulis penerangan terperinci untuk halaman detail kempen. Gunakan editor di bawah untuk format teks.
              </p>
              
              {/* Tips Box */}
              <div className="mb-4 p-4 bg-gradient-to-r from-pastel-mint to-pastel-lavender border border-pastel-lilac rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 bg-blue-100 rounded-lg flex-shrink-0">
                    <Image size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-800">💡 Tips: Upload Gambar Poster</p>
                    <p className="text-xs text-blue-600 mt-1">
                      Klik ikon <strong>gambar 🖼️</strong> pada toolbar editor untuk memasukkan gambar poster, flyer, atau infografik terus ke dalam penerangan. 
                      Gambar-gambar ini akan dipaparkan dalam bahagian penerangan penuh.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <ReactQuill
                  theme="snow"
                  value={form.full_description}
                  onChange={(value) => setForm({...form, full_description: value})}
                  modules={quillModules}
                  formats={quillFormats}
                  placeholder="Tulis penerangan penuh di sini..."
                  className="wysiwyg-editor"
                />
              </div>
            </GlassCard>
            
            {/* Header Image Upload Card */}
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Image size={20} className="text-emerald-600" />
                Gambar Header Kempen
              </h2>
              <p className="text-sm text-slate-500 mb-2">
                Gambar ini akan dipaparkan sebagai <strong>header/banner utama</strong> di bahagian atas halaman kempen.
              </p>
              
              {/* Info Box */}
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    <strong>Nota:</strong> Ini BUKAN untuk gambar poster/flyer kempen. Untuk gambar poster sebenar, 
                    sila upload dalam bahagian <strong>"Penerangan Penuh"</strong> di atas menggunakan ikon gambar pada toolbar editor.
                  </p>
                </div>
              </div>
              
              <ImageUploader
                campaignId={campaignId}
                images={campaign?.images || []}
                onUpdate={fetchCampaign}
                isNew={!isEdit}
                pendingImages={pendingImages}
                setPendingImages={setPendingImages}
              />
            </GlassCard>
          </div>
          
          {/* Right Column - Settings */}
          <div className="space-y-6">
            {/* Campaign Type Settings */}
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
                {form.campaign_type === 'slot' ? (
                  <Grid3X3 size={20} className="text-violet-600" />
                ) : (
                  <Wallet size={20} className="text-emerald-600" />
                )}
                {form.campaign_type === 'slot' ? 'Tetapan Slot' : 'Tetapan Sumbangan'}
              </h2>
              
              {form.campaign_type === 'slot' ? (
                <div className="space-y-5">
                  <Input
                    label="Jumlah Slot *"
                    type="number"
                    min="1"
                    value={form.total_slots}
                    onChange={(e) => setForm({...form, total_slots: parseInt(e.target.value) || 0})}
                    error={errors.total_slots}
                    helper="Jumlah slot yang ditawarkan"
                    data-testid="total-slots-input"
                  />
                  
                  <Input
                    label="Harga Per Slot (RM) *"
                    type="number"
                    min="1"
                    step="0.01"
                    value={form.price_per_slot}
                    onChange={(e) => setForm({...form, price_per_slot: parseFloat(e.target.value) || 0})}
                    error={errors.price_per_slot}
                    data-testid="price-per-slot-input"
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Min Slot"
                      type="number"
                      min="1"
                      value={form.min_slots}
                      onChange={(e) => setForm({...form, min_slots: parseInt(e.target.value) || 1})}
                      helper="Per penderma"
                    />
                    <Input
                      label="Max Slot"
                      type="number"
                      min="1"
                      value={form.max_slots}
                      onChange={(e) => setForm({...form, max_slots: parseInt(e.target.value) || 5000})}
                      helper="Per penderma"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <input
                      type="checkbox"
                      checked={form.is_unlimited}
                      onChange={(e) => setForm({ ...form, is_unlimited: e.target.checked })}
                      className="w-5 h-5 mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-sm font-semibold text-emerald-800 block">
                        Sumbangan Bebas (Tanpa Had Sasaran)
                      </span>
                      <span className="text-xs text-emerald-700">
                        Sesuai untuk kempen sumbangan berterusan. Progress akan guna milestone. (Superadmin/Admin/Bendahari/Sub Bendahari)
                      </span>
                    </div>
                  </label>

                  {!form.is_unlimited ? (
                    <Input
                      label="Sasaran (RM) *"
                      type="number"
                      min="1"
                      value={form.target_amount}
                      onChange={(e) => setForm({ ...form, target_amount: parseFloat(e.target.value) || 0 })}
                      error={errors.target_amount}
                      helper="Jumlah sasaran kutipan"
                    />
                  ) : (
                    <div className="space-y-2">
                      <Input
                        label="Milestone (RM)"
                        value={form.milestones_input}
                        onChange={(e) => setForm({ ...form, milestones_input: e.target.value })}
                        error={errors.milestones_input}
                        helper="Contoh: 50000, 100000, 200000"
                      />
                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                        <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                          <span>Milestone Progress Preview</span>
                          <span>Semasa: RM {milestoneSampleCurrent.toLocaleString()}</span>
                        </div>
                        <div className="relative">
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                              style={{ width: `${milestonePreviewPercent}%` }}
                            />
                          </div>
                          <div
                            className="absolute -top-5 text-[11px] font-semibold text-emerald-700 whitespace-nowrap"
                            style={{ left: `calc(${milestonePreviewPercent}% - 36px)` }}
                          >
                            RM {milestoneSampleCurrent.toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-5 text-[11px] text-slate-600">
                          <span>RM0</span>
                          {milestoneValues.slice(0, 4).map((milestone) => (
                            <span key={milestone}>{formatShortCurrency(milestone)}</span>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Milestone seterusnya: <strong>RM {upcomingMilestone.toLocaleString()}</strong>
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Min (RM)"
                      type="number"
                      min="1"
                      value={form.min_amount}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value);
                        setForm({ ...form, min_amount: Number.isFinite(parsed) ? parsed : 1 });
                      }}
                      helper="Per sumbangan"
                    />
                    <Input
                      label="Max (RM)"
                      type="number"
                      min="0"
                      value={form.max_amount}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value);
                        setForm({ ...form, max_amount: Number.isFinite(parsed) ? parsed : 0 });
                      }}
                      helper={form.is_unlimited ? '0 = tiada had per transaksi' : 'Per sumbangan'}
                    />
                  </div>
                </div>
              )}
              
              {/* Estimated Target Display */}
              <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-emerald-700">
                    {form.campaign_type === 'amount' && form.is_unlimited ? 'Milestone Tertinggi' : 'Sasaran Kutipan'}
                  </span>
                  <span className="text-2xl font-bold text-emerald-800">
                    RM {estimatedTarget.toLocaleString()}
                  </span>
                </div>
                {form.campaign_type === 'slot' && (
                  <p className="text-xs text-emerald-600 mt-1">
                    {form.total_slots} slot × RM {form.price_per_slot}/slot
                  </p>
                )}
                {form.campaign_type === 'amount' && form.is_unlimited && (
                  <p className="text-xs text-emerald-600 mt-1">
                    Mode tanpa had aktif. Milestone: {milestoneValues.map((value) => `RM ${value.toLocaleString()}`).join(' • ')}
                  </p>
                )}
              </div>
            </GlassCard>
            
            {/* Sharing Settings */}
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Tetapan Perkongsian</h2>
              
              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.is_public}
                    onChange={(e) => setForm({...form, is_public: e.target.checked})}
                    className="w-5 h-5 mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-700 block">Sumbangan Awam</span>
                    <span className="text-xs text-slate-500">Benarkan orang awam menyumbang tanpa login</span>
                  </div>
                </label>
                
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.allow_anonymous}
                    onChange={(e) => setForm({...form, allow_anonymous: e.target.checked})}
                    className="w-5 h-5 mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-700 block">Sumbangan Tanpa Nama</span>
                    <span className="text-xs text-slate-500">Benarkan penderma menyembunyikan nama</span>
                  </div>
                </label>
              </div>
            </GlassCard>
            
            {/* Campaign Duration */}
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Calendar size={20} className="text-emerald-600" />
                Tempoh Kempen
              </h2>
              
              <div className="space-y-4">
                {/* Permanent Campaign Checkbox */}
                <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <div className="relative mt-0.5">
                      <input
                        type="checkbox"
                        checked={form.is_permanent}
                        onChange={(e) => {
                          const isPermanent = e.target.checked;
                          setForm({
                            ...form, 
                            is_permanent: isPermanent,
                            start_date: isPermanent ? '' : form.start_date,
                            end_date: isPermanent ? '' : form.end_date
                          });
                        }}
                        className="sr-only peer"
                        data-testid="permanent-campaign-checkbox"
                      />
                      <div className="w-6 h-6 border-2 border-emerald-400 rounded-lg bg-white peer-checked:bg-emerald-600 peer-checked:border-emerald-600 transition-all flex items-center justify-center">
                        {form.is_permanent && <Check size={16} className="text-white" />}
                      </div>
                    </div>
                    <div className="flex-1">
                      <span className="font-semibold text-emerald-800 block">Kempen Sepanjang Masa</span>
                      <span className="text-sm text-emerald-600">Tandakan jika kempen ini tidak mempunyai had tarikh dan dibuka sepanjang masa</span>
                    </div>
                  </label>
                </div>
                
                {/* Date Fields - Only show if not permanent */}
                {!form.is_permanent && (
                  <>
                    <Input
                      label="Tarikh Mula"
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm({...form, start_date: e.target.value})}
                      helper="Kempen akan dilancarkan pada tarikh ini"
                      min={new Date().toISOString().split('T')[0]}
                      data-testid="start-date-input"
                    />
                    
                    <Input
                      label="Tarikh Akhir"
                      type="date"
                      value={form.end_date}
                      onChange={(e) => setForm({...form, end_date: e.target.value})}
                      helper="Kempen akan tamat pada tarikh ini"
                      min={form.start_date || undefined}
                    />
                    
                    {/* Date Preview */}
                    {(form.start_date || form.end_date) && (
                      <div className="p-4 bg-slate-50 rounded-xl space-y-2">
                        {form.start_date && new Date(form.start_date) > new Date() && (
                          <div className="flex items-center gap-2 text-amber-600">
                            <Calendar size={16} />
                            <span className="text-sm font-medium">Belum Dilancarkan</span>
                            <span className="text-xs text-slate-500">- akan mula {new Date(form.start_date).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                          </div>
                        )}
                        {form.end_date && (
                          <div className={`flex items-center gap-2 ${new Date(form.end_date) < new Date() ? 'text-red-600' : 'text-slate-600'}`}>
                            <Calendar size={16} />
                            <span className="text-sm font-medium">
                              {new Date(form.end_date) < new Date() ? 'Kutipan Sudah Tamat' : 'Akan tamat'}
                            </span>
                            <span className="text-xs text-slate-500">
                              - {new Date(form.end_date).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                
                {/* Permanent Campaign Info */}
                {form.is_permanent && (
                  <div className="p-4 bg-emerald-100/50 rounded-xl border border-emerald-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-200 rounded-lg flex items-center justify-center">
                        <Check className="text-emerald-700" size={20} />
                      </div>
                      <div>
                        <p className="font-semibold text-emerald-800">Kempen Berterusan</p>
                        <p className="text-sm text-emerald-600">Kempen ini akan dibuka sepanjang masa tanpa had tarikh</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </GlassCard>
            
            {/* Status (Edit only) */}
            {isEdit && (
              <GlassCard className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Status Kempen</h2>
                
                <Select
                  value={form.status}
                  onChange={(e) => setForm({...form, status: e.target.value})}
                >
                  <option value="active">Aktif</option>
                  <option value="paused">Dijeda</option>
                  <option value="completed">Selesai</option>
                </Select>
                
                {campaign && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-xl space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Terkumpul</span>
                      <span className="font-semibold text-emerald-600">
                        RM {(campaign.total_collected || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Penderma</span>
                      <span className="font-medium">{campaign.donor_count || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Progress</span>
                      <span className="font-medium">{(campaign.progress_percent || 0).toFixed(1)}%</span>
                    </div>
                  </div>
                )}
              </GlassCard>
            )}
            
            {/* Help Card */}
            <GlassCard className="p-6 bg-gradient-to-br from-amber-50/80 to-orange-50/80 border-amber-200/50">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-amber-800 mb-1">Tip</h3>
                  <p className="text-sm text-amber-700">
                    Gambar poster yang menarik dan penerangan yang jelas akan meningkatkan sumbangan. 
                    Gunakan WYSIWYG editor untuk format teks dengan baik.
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
      
      {/* Custom WYSIWYG Styles */}
      <style>{`
        .wysiwyg-editor .ql-container {
          font-size: 14px;
          min-height: 250px;
          border: none;
          border-top: 1px solid #e2e8f0;
        }
        .wysiwyg-editor .ql-toolbar {
          border: none;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .wysiwyg-editor .ql-editor {
          min-height: 250px;
          padding: 16px;
        }
        .wysiwyg-editor .ql-editor.ql-blank::before {
          color: #94a3b8;
          font-style: normal;
        }
        .wysiwyg-editor .ql-toolbar button:hover,
        .wysiwyg-editor .ql-toolbar button.ql-active {
          color: #059669;
        }
        .wysiwyg-editor .ql-toolbar button:hover .ql-stroke,
        .wysiwyg-editor .ql-toolbar button.ql-active .ql-stroke {
          stroke: #059669;
        }
        .wysiwyg-editor .ql-toolbar button:hover .ql-fill,
        .wysiwyg-editor .ql-toolbar button.ql-active .ql-fill {
          fill: #059669;
        }
      `}</style>
    </div>
  );
}
