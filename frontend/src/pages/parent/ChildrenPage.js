import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Users, GraduationCap, Calendar, Building, DoorOpen, MapPin, Plus, X,
  Edit3, Trash2, BookOpen, Home, Sparkles,
  CheckCircle2, Clock, XCircle, Save, User, Heart, Star, Shield, Mail, Phone
} from 'lucide-react';
import api from '../../services/api';
import { usePortalConfig } from '../../context/PortalConfigContext';
import { TINGKATAN_COLORS } from '../../constants';
import { validateEmail, validatePhone } from '../../utils/validation';

const MALAYSIAN_STATES = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya'];

// Medan wajib yang mesti dilengkapkan untuk setiap pelajar
const REQUIRED_CHILD_FIELDS = ['full_name', 'matric_number', 'ic_number', 'form', 'class_name', 'block_name', 'room_number', 'state', 'religion', 'address', 'postcode', 'city', 'email', 'phone'];

const isChildProfileIncomplete = (child) => {
  return REQUIRED_CHILD_FIELDS.some((key) => {
    const v = child[key];
    return v === undefined || v === null || String(v).trim() === '';
  });
};

// Banner notifikasi untuk maklumat pelajar belum lengkap (semua medan)
const IncompleteProfileBanner = ({ count, onView }) => (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-pastel-peach/60 border-2 border-pastel-peach rounded-2xl p-4 mb-6 shadow-pastel-sm"
  >
    <div className="flex items-start gap-4">
      <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
        <User className="w-6 h-6 text-amber-600" />
      </div>
      <div className="flex-1">
        <h4 className="font-bold text-amber-800 flex items-center gap-2">
          Maklumat Pelajar Belum Lengkap
          <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-sm font-bold">{count}</span>
        </h4>
        <p className="text-amber-700 text-sm mt-1">
          {count} anak mempunyai medan yang belum diisi. Sila lengkapkan semua maklumat (nama, no. matrik, no. IC, tingkatan, kelas, blok, bilik, negeri, agama, alamat, poskod, bandar, emel, telefon) dengan klik butang edit.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onView} className="!border-amber-500 !text-amber-700 hover:!bg-amber-100">
        Lihat Senarai
      </Button>
    </div>
  </motion.div>
);

const Spinner = ({ size = 'md' }) => (
  <div className={`animate-spin rounded-full border-2 border-teal-200 border-t-teal-500 ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-6 h-6'}`}></div>
);

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-gradient-to-r from-teal-500 to-violet-500 hover:from-teal-600 hover:to-violet-600 text-white shadow-pastel-sm hover:shadow-pastel',
    secondary: 'bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white',
    outline: 'border-2 border-teal-500 text-teal-600 hover:bg-pastel-mint/40',
    ghost: 'text-slate-600 hover:text-teal-600 hover:bg-slate-100',
    danger: 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-lg shadow-red-500/25',
    success: 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25'
  };
  const sizes = { sm: 'px-3 py-2 text-sm min-h-[44px]', md: 'px-5 py-2.5 text-sm min-h-[44px]', lg: 'px-6 py-3 text-base min-h-[44px]' };
  return (
    <button className={`font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 min-w-[44px] ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : 'transform hover:-translate-y-0.5'}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Input = ({ label, error, icon: Icon, ...props }) => (
  <div className="space-y-2">
    {label && <label className="block text-sm font-semibold text-slate-700">{label}</label>}
    <div className="relative">
      {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon size={18} /></div>}
      <input className={`flex h-12 w-full rounded-xl border-2 bg-white px-4 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all ${Icon ? 'pl-10' : ''} ${error ? 'border-red-400 focus:border-red-500' : 'border-slate-200'}`} {...props} />
    </div>
    {error && <p className="text-sm text-red-500 flex items-center gap-1"><XCircle size={14} />{error}</p>}
  </div>
);

const Select = ({ label, error, children, ...props }) => (
  <div className="space-y-2">
    {label && <label className="block text-sm font-semibold text-slate-700">{label}</label>}
    <select className={`flex h-12 w-full rounded-xl border-2 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all ${error ? 'border-red-400' : 'border-slate-200'}`} {...props}>{children}</select>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const StatusBadge = ({ status }) => {
  const config = {
    approved: { icon: CheckCircle2, label: 'Disahkan', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    pending: { icon: Clock, label: 'Menunggu Pengesahan', className: 'bg-amber-100 text-amber-700 border-amber-200' },
    rejected: { icon: XCircle, label: 'Ditolak', className: 'bg-red-100 text-red-700 border-red-200' }
  };
  const { icon: Icon, label, className } = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${className}`}>
      <Icon size={14} />
      {label}
    </span>
  );
};

const ChildCard = ({ child, onEdit, onDelete, onViewDiscipline, index }) => {
  const colors = TINGKATAN_COLORS[child.form] || TINGKATAN_COLORS[1];
  const hasIncompleteProfile = isChildProfileIncomplete(child);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`group bg-white rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden border ${hasIncompleteProfile ? 'border-amber-300 ring-2 ring-amber-200' : 'border-slate-100'} hover:shadow-pastel transition-all duration-300`}
      data-testid={`child-card-${child.id}`}
    >
      {/* Maklumat belum lengkap - semua medan perlu diisi */}
      {hasIncompleteProfile && (
        <div className="bg-amber-50 px-4 py-2 border-b border-amber-200 flex items-center gap-2 text-amber-700 text-sm">
          <User size={14} className="text-amber-600" />
          <span className="font-medium">Semua info anak pelajar perlu diisi</span>
          <button 
            onClick={() => onEdit(child)}
            className="ml-auto text-amber-800 hover:text-amber-900 font-semibold underline"
          >
            Kemaskini
          </button>
        </div>
      )}
      
      {/* Card Header with Gradient */}
      <div className={`relative overflow-hidden bg-gradient-to-r ${colors.bg} p-5 text-white`}>
        <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
        <div className="absolute right-12 top-8 w-8 h-8 rounded-full bg-white/20" />
        
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <GraduationCap className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold">{child.full_name}</h3>
              <p className="text-white/80 text-sm">{child.matric_number}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(child)}
              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
              title="Edit"
              data-testid={`edit-child-${child.id}`}
            >
              <Edit3 size={18} />
            </button>
            <button
              onClick={() => onDelete(child.id)}
              className="p-2 rounded-lg bg-white/20 hover:bg-red-500 transition-colors"
              title="Padam"
              data-testid={`delete-child-${child.id}`}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-5">
        {/* Status */}
        <div className="flex items-center justify-between mb-4">
          <StatusBadge status={child.status} />
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${colors.light} ${colors.text}`}>
            Tingkatan {child.form}
          </span>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`flex items-center gap-3 p-3 rounded-xl ${colors.light} ${colors.border} border`}>
            <div className={`w-8 h-8 rounded-lg ${colors.icon} flex items-center justify-center`}>
              <Calendar size={16} />
            </div>
            <div>
              <p className="text-xs text-slate-500">Tahun</p>
              <p className={`font-semibold ${colors.text}`}>{child.year}</p>
            </div>
          </div>
          
          <div className={`flex items-center gap-3 p-3 rounded-xl ${colors.light} ${colors.border} border`}>
            <div className={`w-8 h-8 rounded-lg ${colors.icon} flex items-center justify-center`}>
              <BookOpen size={16} />
            </div>
            <div>
              <p className="text-xs text-slate-500">Kelas</p>
              <p className={`font-semibold ${colors.text}`}>{child.class_name || '-'}</p>
            </div>
          </div>
          
          <div className={`flex items-center gap-3 p-3 rounded-xl ${colors.light} ${colors.border} border`}>
            <div className={`w-8 h-8 rounded-lg ${colors.icon} flex items-center justify-center`}>
              <Building size={16} />
            </div>
            <div>
              <p className="text-xs text-slate-500">Blok</p>
              <p className={`font-semibold ${colors.text}`}>{child.block_name || '-'}</p>
            </div>
          </div>
          
          <div className={`flex items-center gap-3 p-3 rounded-xl ${colors.light} ${colors.border} border`}>
            <div className={`w-8 h-8 rounded-lg ${colors.icon} flex items-center justify-center`}>
              <DoorOpen size={16} />
            </div>
            <div>
              <p className="text-xs text-slate-500">Bilik/Katil</p>
              <p className={`font-semibold ${colors.text}`}>{child.room_number || '-'}</p>
            </div>
          </div>
        </div>

        {/* Address Info */}
        {(child.address || child.city || child.postcode) && (
          <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-start gap-2 text-slate-600 text-sm">
              <Home size={14} className="mt-0.5 flex-shrink-0" />
              <div>
                {child.address && <p>{child.address}</p>}
                {(child.postcode || child.city) && (
                  <p className="text-slate-500">
                    {child.postcode && child.postcode}{child.postcode && child.city && ' '}{child.city}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* State */}
        {child.state && (
          <div className="mt-3 flex items-center gap-2 text-slate-500 text-sm">
            <MapPin size={14} />
            <span>{child.state}</span>
          </div>
        )}

        {/* Religion if available */}
        {child.religion && (
          <div className="mt-2 flex items-center gap-2 text-slate-500 text-sm">
            <Heart size={14} />
            <span>{child.religion}</span>
          </div>
        )}

        {/* Rekod Disiplin (parent portal) */}
        {onViewDiscipline && (
          <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm text-slate-600 flex items-center gap-2">
              <Shield size={16} className="text-amber-600" />
              Rekod Disiplin
            </span>
            <button
              type="button"
              onClick={() => onViewDiscipline(child)}
              className="text-sm font-medium text-amber-600 hover:text-amber-800"
            >
              Lihat
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export const ChildrenPage = () => {
  const { institution_name } = usePortalConfig();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '', matric_number: '', ic_number: '', year: new Date().getFullYear(),
    form: 1, class_name: '', block_name: '', room_number: '', state: '', religion: 'Islam',
    address: '', postcode: '', city: '', email: '', phone: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [systemConfig, setSystemConfig] = useState({ negeri: MALAYSIAN_STATES, agama: [], kelas: [] });
  const [hostelBlocks, setHostelBlocks] = useState([]);
  const [disciplineChild, setDisciplineChild] = useState(null);
  const [disciplineOffences, setDisciplineOffences] = useState([]);
  const [loadingDiscipline, setLoadingDiscipline] = useState(false);

  const fetchChildren = async () => {
    try {
      const res = await api.get('/api/students');
      setChildren(res.data);
    } catch (err) {
      toast.error('Gagal memuatkan data anak');
    } finally {
      setLoading(false);
    }
  };

  // Load system config and hostel blocks
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await api.get('/api/settings/system-config/public');
        setSystemConfig(prev => ({ ...prev, ...res.data }));
      } catch (err) {
        console.error('Failed to load system config');
      }
    };
    const loadHostelBlocks = async () => {
      try {
        const res = await api.get('/api/hostel-blocks/public');
        setHostelBlocks(res.data?.blocks || []);
      } catch (err) {
        console.error('Failed to load hostel blocks');
      }
    };
    loadConfig();
    loadHostelBlocks();
    fetchChildren();
  }, []);

  const resetForm = () => {
    setFormData({
      full_name: '', matric_number: '', ic_number: '', year: new Date().getFullYear(),
      form: 1, class_name: '', block_name: '', room_number: '', state: '', religion: 'Islam',
      address: '', postcode: '', city: '', email: '', phone: ''
    });
    setFieldErrors({});
    setEditingChild(null);
  };

  const openAddPanel = () => {
    resetForm();
    setShowPanel(true);
  };

  const openDisciplineModal = async (child) => {
    setDisciplineChild(child);
    setLoadingDiscipline(true);
    setDisciplineOffences([]);
    try {
      const res = await api.get(`/api/discipline/offences/student/${child.id}`);
      setDisciplineOffences(res.data || []);
    } catch (err) {
      toast.error('Gagal memuatkan rekod disiplin');
    } finally {
      setLoadingDiscipline(false);
    }
  };

  const openEditPanel = (child) => {
    setEditingChild(child);
    setFormData({
      full_name: child.full_name || '',
      matric_number: child.matric_number || '',
      ic_number: (child.ic_number || '').replace(/[-\s]/g, ''),
      year: child.year || new Date().getFullYear(),
      form: child.form || 1,
      class_name: child.class_name || '',
      block_name: child.block_name || '',
      room_number: child.room_number || '',
      state: child.state || '',
      religion: child.religion || 'Islam',
      address: child.address || '',
      postcode: child.postcode || '',
      city: child.city || '',
      email: child.email || '',
      phone: child.phone || ''
    });
    setFieldErrors({});
    setShowPanel(true);
  };

  // Kira anak yang mempunyai maklumat belum lengkap (mana-mana medan wajib kosong)
  const incompleteProfileCount = children.filter(c => isChildProfileIncomplete(c)).length;

  // Filter anak ikut paparan: semua atau yang belum lengkap sahaja
  const displayedChildren = showIncompleteOnly 
    ? children.filter(c => isChildProfileIncomplete(c))
    : children;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    const emailErr = validateEmail(formData.email);
    if (emailErr) errs.email = emailErr;
    const phoneErr = validatePhone(formData.phone);
    if (phoneErr) errs.phone = phoneErr;
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error('Sila betulkan medan Emel dan/atau Nombor telefon');
      return;
    }
    setSubmitting(true);
    try {
      if (editingChild) {
        await api.put(`/api/students/${editingChild.id}`, formData);
        toast.success('Maklumat anak berjaya dikemaskini');
      } else {
        await api.post('/api/students', formData);
        toast.success('Anak berjaya didaftarkan. Menunggu pengesahan admin.');
      }
      setShowPanel(false);
      resetForm();
      fetchChildren();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan maklumat');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Adakah anda pasti mahu memadamkan rekod anak ini?')) return;
    try {
      await api.delete(`/api/students/${id}`);
      toast.success('Rekod anak berjaya dipadam');
      fetchChildren();
    } catch (err) {
      toast.error('Gagal memadamkan rekod');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Spinner size="lg" />
        <p className="mt-4 text-slate-500">Memuatkan data anak...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8 min-w-0 overflow-x-hidden" data-testid="children-page">
      {/* Page Header */}
      <div className="relative">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-2"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-pastel-lavender/70 rounded-full text-violet-700 font-medium mb-4">
            <Users className="w-4 h-4" />
            Portal Ibu Bapa {institution_name}
          </div>
        </motion.div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <motion.h1 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-4xl font-bold bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-heading"
            >
              Anak Saya
            </motion.h1>
            {children.length > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, delay: 0.2 }}
                className="flex items-center justify-center min-w-[48px] h-12 px-4 bg-gradient-to-r from-teal-500 to-violet-500 text-white text-xl font-bold rounded-full shadow-pastel-sm"
              >
                {children.length}
              </motion.div>
            )}
          </div>
          <Button onClick={openAddPanel} data-testid="add-child-btn" size="lg">
            <Plus size={20} />
            Tambah Anak
          </Button>
        </div>
        <p className="text-slate-600 mt-2 text-center sm:text-left">Urus pendaftaran dan maklumat anak anda di {institution_name}</p>
      </div>

      {/* Stats Summary */}
      {children.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-teal-500 to-violet-500 rounded-2xl p-5 text-white shadow-pastel"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-white/80 text-sm">Jumlah Anak</p>
                <p className="text-3xl font-bold">{children.length}</p>
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
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-slate-500 text-sm">Disahkan</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {children.filter(c => c.status === 'approved').length}
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
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-slate-500 text-sm">Menunggu</p>
                <p className="text-2xl font-bold text-amber-600">
                  {children.filter(c => c.status === 'pending').length}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl p-5 shadow-xl shadow-slate-200/50 border border-slate-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Star className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-slate-500 text-sm">Tingkatan</p>
                <p className="text-2xl font-bold text-blue-600">
                  {[...new Set(children.map(c => c.form))].length} jenis
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Banner: maklumat pelajar belum lengkap */}
      {incompleteProfileCount > 0 && !showIncompleteOnly && (
        <IncompleteProfileBanner 
          count={incompleteProfileCount} 
          onView={() => setShowIncompleteOnly(true)} 
        />
      )}

      {/* Filter: papar anak yang maklumat belum lengkap sahaja */}
      {showIncompleteOnly && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-amber-600" />
            <span className="text-amber-800 font-medium">
              Menunjukkan {displayedChildren.length} anak dengan maklumat belum lengkap (semua info anak pelajar perlu diisi)
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowIncompleteOnly(false)}
            className="!border-amber-500 !text-amber-700"
          >
            Tunjuk Semua
          </Button>
        </div>
      )}

      {/* Children List or Empty State */}
      {displayedChildren.length === 0 && !showIncompleteOnly ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-12 text-center border-2 border-dashed border-slate-200"
        >
          <div className="w-20 h-20 mx-auto rounded-full bg-pastel-lavender/70 flex items-center justify-center mb-4">
            <Users className="w-10 h-10 text-violet-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-700">Tiada Anak Didaftarkan</h3>
          <p className="text-slate-500 mt-2 mb-6">Klik butang di bawah untuk mendaftarkan anak anda ke MRSMKU</p>
          <Button onClick={openAddPanel} size="lg">
            <Plus size={20} />
            Daftar Anak Pertama
          </Button>
        </motion.div>
      ) : displayedChildren.length === 0 && showIncompleteOnly ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-12 text-center border-2 border-emerald-200"
        >
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-emerald-700">Semua Maklumat Lengkap!</h3>
          <p className="text-emerald-600 mt-2 mb-6">Semua anak anda telah melengkapkan semua medan maklumat yang diperlukan.</p>
          <Button variant="outline" onClick={() => setShowIncompleteOnly(false)}>
            Tunjuk Semua Anak
          </Button>
        </motion.div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {displayedChildren.map((child, index) => (
            <ChildCard
              key={child.id}
              child={child}
              index={index}
              onEdit={openEditPanel}
              onDelete={handleDelete}
              onViewDiscipline={openDisciplineModal}
            />
          ))}
        </div>
      )}

      {/* Rekod Disiplin Modal (parent portal) */}
      <AnimatePresence>
        {disciplineChild && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setDisciplineChild(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none" aria-hidden="true">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
              >
              <div className="p-4 border-b flex items-center justify-between bg-amber-50 shrink-0">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2 min-w-0 truncate pr-2">
                  <Shield size={20} className="text-amber-600 flex-shrink-0" />
                  <span className="truncate">Rekod Disiplin — {disciplineChild.full_name}</span>
                </h3>
                <button onClick={() => setDisciplineChild(null)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-amber-100 rounded-lg flex-shrink-0" aria-label="Tutup"><X size={20} /></button>
              </div>
              <div className="p-4 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                {loadingDiscipline ? (
                  <div className="flex justify-center py-8"><Spinner size="lg" /></div>
                ) : disciplineOffences.length === 0 ? (
                  <p className="text-slate-500 text-center py-6">Tiada rekod kesalahan disiplin</p>
                ) : (
                  <ul className="space-y-3">
                    {disciplineOffences.map((o) => (
                      <li key={o.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                        <p className="font-medium text-slate-800">{o.seksyen_display || o.seksyen}</p>
                        <p className="text-slate-600 mt-1">{o.keterangan}</p>
                        <p className="text-slate-500 text-xs mt-2">{o.tarikh_kesalahan} · {o.status}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Add/Edit Child Panel */}
      <AnimatePresence>
        {showPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55]"
              onClick={() => { setShowPanel(false); resetForm(); }}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl z-[60] flex flex-col overflow-x-hidden"
              style={{ marginTop: 0 }}
              data-testid="child-panel"
            >
              {/* Panel Header */}
              <div className={`p-5 bg-gradient-to-r ${editingChild ? 'from-amber-500 to-orange-500' : 'from-teal-500 to-violet-500'} text-white shrink-0`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                      {editingChild ? <Edit3 size={20} /> : <Plus size={20} />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold truncate">
                        {editingChild ? 'Edit Maklumat Anak' : 'Tambah Anak Baru'}
                      </h3>
                      <p className="text-white/80 text-sm truncate">
                        {editingChild ? 'Kemaskini maklumat anak anda' : `Daftarkan anak baru ke ${institution_name}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowPanel(false); resetForm(); }}
                    className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-xl transition-colors flex-shrink-0"
                    aria-label="Tutup"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Panel Content */}
              <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 space-y-5">
                <Input
                  label="Nama Penuh"
                  icon={User}
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Nama seperti dalam IC"
                  required
                  data-testid="child-name"
                />

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="No. Matrik"
                    value={formData.matric_number}
                    onChange={(e) => setFormData({ ...formData, matric_number: e.target.value })}
                    placeholder="M2026XXX"
                    required
                    data-testid="child-matric"
                  />
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">No. Kad Pengenalan *</label>
                    <input
                      className="flex h-12 w-full rounded-xl border-2 bg-white px-4 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all border-slate-200"
                      value={formData.ic_number}
                      onChange={(e) => {
                        // Auto-remove dashes and non-numeric characters from IC number
                        const cleanedIC = e.target.value.replace(/[^0-9]/g, '').slice(0, 12);
                        setFormData({ ...formData, ic_number: cleanedIC });
                      }}
                      placeholder="901201061234"
                      required
                      data-testid="child-ic"
                    />
                    <p className="text-xs text-slate-500">12 digit tanpa &quot;-&quot;</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Tahun"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                    data-testid="child-year"
                  >
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </Select>
                  <Select
                    label="Tingkatan"
                    value={formData.form}
                    onChange={(e) => setFormData({ ...formData, form: parseInt(e.target.value) })}
                    data-testid="child-form"
                  >
                    {[1, 2, 3, 4, 5].map((f) => (
                      <option key={f} value={f}>Tingkatan {f}</option>
                    ))}
                  </Select>
                </div>

                <Select
                  label="Kelas (dari Senarai Kelas)"
                  value={formData.class_name}
                  onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
                  required
                  data-testid="child-class"
                >
                  <option value="">Pilih Kelas</option>
                  {(systemConfig.kelas && systemConfig.kelas.length > 0 ? systemConfig.kelas : ['A', 'B', 'C', 'D', 'E', 'F']).map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </Select>

                <Input
                  label="Emel yang sah *"
                  icon={Mail}
                  type="email"
                  value={formData.email}
                  onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setFieldErrors((prev) => ({ ...prev, email: null })); }}
                  placeholder="cth: nama@email.com"
                  error={fieldErrors.email}
                  required
                  data-testid="child-email"
                />

                <Input
                  label="Nombor telefon yang sah *"
                  icon={Phone}
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => { setFormData({ ...formData, phone: e.target.value }); setFieldErrors((prev) => ({ ...prev, phone: null })); }}
                  placeholder="cth: 0123456789"
                  error={fieldErrors.phone}
                  required
                  data-testid="child-phone"
                />

                <div className="grid grid-cols-2 gap-4">
                  {hostelBlocks.length > 0 ? (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700">Blok Asrama</label>
                      <select
                        value={formData.block_name}
                        onChange={(e) => setFormData({ ...formData, block_name: e.target.value })}
                        className="flex h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        required
                        data-testid="child-block"
                      >
                        <option value="">-- Pilih Blok --</option>
                        {hostelBlocks.map((b) => (
                          <option key={b.code} value={b.code}>{b.name} ({b.gender_display || b.gender})</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <Input
                      label="Nama Blok"
                      icon={Building}
                      value={formData.block_name}
                      onChange={(e) => setFormData({ ...formData, block_name: e.target.value })}
                      placeholder="cth: JA, I"
                      required
                      data-testid="child-block"
                    />
                  )}
                  <Input
                    label="No. Bilik/Katil"
                    icon={DoorOpen}
                    value={formData.room_number}
                    onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
                    placeholder="cth: 101"
                    required
                    data-testid="child-room"
                  />
                </div>

                <Select
                  label="Agama"
                  value={formData.religion}
                  onChange={(e) => setFormData({ ...formData, religion: e.target.value })}
                  data-testid="child-religion"
                >
                  {(systemConfig.agama?.length > 0 ? systemConfig.agama : ['Islam', 'Buddha', 'Hindu', 'Kristian', 'Sikh', 'Lain-lain']).map((agama) => (
                    <option key={agama} value={agama}>{agama}</option>
                  ))}
                </Select>

                {/* Address Section */}
                <div className="border-t pt-5 mt-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Home className="w-5 h-5 text-teal-600" />
                    <h4 className="font-semibold text-slate-700">Alamat Kediaman</h4>
                    {(!formData.address || !formData.postcode || !formData.city) && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                        Perlu Dilengkapkan
                      </span>
                    )}
                  </div>
                  
                  <Input
                    label="Alamat"
                    icon={MapPin}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="No. Rumah, Jalan, Taman"
                    data-testid="child-address"
                  />
                  
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <Input
                      label="Poskod"
                      value={formData.postcode}
                      onChange={(e) => {
                        // Only allow numbers and max 5 digits
                        const cleaned = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
                        setFormData({ ...formData, postcode: cleaned });
                      }}
                      placeholder="00000"
                      data-testid="child-postcode"
                    />
                    <Input
                      label="Bandar"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="Nama bandar"
                      data-testid="child-city"
                    />
                  </div>

                  <Select
                    label="Negeri *"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    required
                    data-testid="child-state"
                  >
                    <option value="">Pilih Negeri</option>
                    {(systemConfig.negeri || MALAYSIAN_STATES).map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </Select>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-700">
                    <p className="font-semibold mb-1">Nota:</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-600">
                      <li>Pastikan semua maklumat adalah tepat</li>
                      <li>Pendaftaran baru memerlukan pengesahan admin</li>
                      <li>Lengkapkan alamat untuk kemudahan penghantaran</li>
                    </ul>
                  </div>
                </div>
              </form>

              {/* Panel Footer */}
              <div className="border-t p-5 bg-slate-50 flex gap-3 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowPanel(false); resetForm(); }}
                >
                  Batal
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="flex-1"
                  loading={submitting}
                  variant={editingChild ? 'secondary' : 'primary'}
                  data-testid="submit-child"
                >
                  <Save size={18} />
                  {editingChild ? 'Simpan Perubahan' : 'Daftar Anak'}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChildrenPage;
