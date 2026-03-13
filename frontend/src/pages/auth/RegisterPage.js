import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { 
  GraduationCap, User, Mail, Phone, CreditCard, MapPin,
  Eye, EyeOff, AlertCircle, Plus, Trash2, ChevronRight, Home
} from 'lucide-react';
import { useAuth } from '../../App';
import api from '../../services/api';
import { Input, Select, Button } from '../../components/common';
import { MALAYSIAN_STATES } from '../../constants';
import { validateName, validatePhone, validateIC, validateMatric, validateClassName } from '../../utils/validation';

const RegisterPage = () => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({ 
    full_name: '', email: '', phone: '', phone_alt: '', ic_number: '', 
    password: '', confirmPassword: '', address: '', 
    postcode: '', city: '', state: '', gender: ''
  });
  const [children, setChildren] = useState([{ 
    matric_number: '', full_name: '', form: 1, 
    class_name: '', gender: '', relationship: 'BAPA',
    ic_number: '', state: '',
    block_name: '', room_number: '',
    phone: '', email: '', address: '', postcode: '', city: '',
    sameAddress: false
  }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [systemConfig, setSystemConfig] = useState({ negeri: [], kelas: [], bangsa: [], agama: [] });
  const [hostelBlocks, setHostelBlocks] = useState([]);
  const navigate = useNavigate();
  const { login } = useAuth();
  const tenantCodeHint = React.useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return (params.get('tenant_code') || params.get('tenant') || '').trim().toLowerCase();
    } catch {
      return '';
    }
  }, []);
  
  // Load system config and hostel blocks on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await api.get('/api/settings/system-config/public');
        setSystemConfig(res.data);
      } catch (err) {
        console.error('Failed to load system config:', err);
      }
    };
    loadConfig();
  }, []);
  useEffect(() => {
    const loadBlocks = async () => {
      try {
        const res = await api.get('/api/hostel-blocks/public');
        setHostelBlocks(res.data?.blocks || []);
      } catch (err) {
        console.error('Failed to load hostel blocks:', err);
      }
    };
    loadBlocks();
  }, []);

  const addChild = () => {
    setChildren([...children, { 
      matric_number: '', full_name: '', form: 1, 
      class_name: '', gender: '', relationship: 'BAPA',
      ic_number: '', state: '',
      block_name: '', room_number: '',
      phone: '', email: '', address: '', postcode: '', city: '',
      sameAddress: false
    }]);
  };

  const removeChild = (index) => {
    if (children.length > 1) {
      setChildren(children.filter((_, i) => i !== index));
    }
  };

  const updateChild = (index, field, value) => {
    const updated = [...children];
    updated[index][field] = value;
    
    // Handle sameAddress checkbox
    if (field === 'sameAddress' && value) {
      updated[index].address = formData.address;
      updated[index].postcode = formData.postcode;
      updated[index].city = formData.city;
    }
    
    setChildren(updated);
    
    // Clear field error on change
    setFieldErrors(prev => ({ ...prev, [`child_${index}_${field}`]: null }));
  };

  // Validate parent data
  const validateStep1 = () => {
    const errors = {};
    
    const nameErr = validateName(formData.full_name);
    if (nameErr) errors.full_name = nameErr;
    
    if (!formData.email) errors.email = 'Email tidak boleh kosong';
    
    const phoneErr = validatePhone(formData.phone);
    if (phoneErr) errors.phone = phoneErr;
    
    // IC Number is now mandatory
    const icErr = validateIC(formData.ic_number);
    if (icErr) errors.ic_number = icErr;
    
    if (!formData.password || formData.password.length < 6) {
      errors.password = 'Kata laluan minimum 6 aksara';
    }
    
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Kata laluan tidak sepadan';
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Validate children data
  const validateStep2 = () => {
    const errors = {};
    
    children.forEach((child, idx) => {
      // Only validate if child has some data
      if (child.matric_number || child.full_name) {
        const nameErr = validateName(child.full_name);
        if (nameErr) errors[`child_${idx}_full_name`] = nameErr;
        
        const matricErr = validateMatric(child.matric_number);
        if (matricErr) errors[`child_${idx}_matric_number`] = matricErr;
        
        const kelasList = systemConfig.kelas?.length > 0 ? systemConfig.kelas : ['A', 'B', 'C', 'D', 'E', 'F'];
        const classErr = validateClassName(child.class_name, kelasList);
        if (classErr) errors[`child_${idx}_class_name`] = classErr;
        
        // IC Number is now mandatory for children
        const icErr = validateIC(child.ic_number);
        if (icErr) errors[`child_${idx}_ic_number`] = icErr;
      }
    });
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (step === 1) {
      if (!validateStep1()) {
        toast.error('Sila betulkan ralat dalam borang');
        return;
      }
      setStep(2); 
      return;
    }
    
    // Step 2 - validate children and submit
    if (!validateStep2()) {
      toast.error('Sila betulkan ralat dalam borang anak');
      return;
    }
    
    const validChildren = children.filter(c => c.matric_number && c.full_name && c.class_name && c.ic_number);
    
    setLoading(true);
    try {
      const payload = {
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        phone_alt: formData.phone_alt || null,  // No. Telefon Alternatif
        ic_number: formData.ic_number,
        gender: formData.gender || null,
        password: formData.password,
        address: formData.address,
        postcode: formData.postcode,
        city: formData.city,
        state: formData.state,
        tenant_code: tenantCodeHint || null,
        children: validChildren.length > 0 ? validChildren : null
      };
      const res = await api.post('/api/auth/register', payload);
      login(res.data);
      toast.success(`Pendaftaran berjaya! ${validChildren.length > 0 ? validChildren.length + ' anak didaftarkan.' : ''}`);
      navigate('/dashboard');
    } catch (err) {
      // Extract validation error message from API response
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        // Pydantic validation errors
        const messages = detail.map(d => d.msg || d.message).filter(Boolean);
        setError(messages.join(', ') || 'Ralat pendaftaran');
      } else if (typeof detail === 'string') {
        setError(detail);
      } else {
        setError('Ralat pendaftaran. Sila semak data anda.');
      }
      toast.error('Pendaftaran gagal');
    } finally {
      setLoading(false);
    }
  };

  // Helper to show field error
  const FieldError = ({ field }) => {
    const error = fieldErrors[field];
    if (!error) return null;
    return (
      <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
        <AlertCircle size={12} /> {error}
      </p>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient px-4 py-12 min-w-0 overflow-x-hidden">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
<div className="w-20 h-20 bg-gradient-to-br from-teal-400 via-violet-400 to-fuchsia-300 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-pastel-lg border border-white/40 animate-float hover:scale-105 transition-transform">
            <GraduationCap className="text-white" size={40} />
          </div>
          </Link>
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-heading">Daftar Akaun</h1>
          <p className="text-slate-600 mt-2 font-medium">MRSMKU Smart 360 AI Edition</p>
          <Link to="/" className="inline-flex items-center gap-1 mt-3 text-sm text-teal-600 hover:text-violet-700 font-medium transition-colors">
            <Home size={14} /> Kembali ke Laman Utama
          </Link>
          
          <div className="flex items-center justify-center gap-4 mt-6">
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-full transition-all ${step >= 1 ? 'bg-gradient-to-r from-teal-500 to-violet-500 text-white shadow-pastel-sm' : 'bg-slate-200 text-slate-500'}`}>
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">1</span>
              <span className="text-sm font-semibold">Maklumat Ibu Bapa</span>
            </div>
            <ChevronRight className="text-slate-400" size={20} />
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-full transition-all ${step >= 2 ? 'bg-gradient-to-r from-teal-500 to-violet-500 text-white shadow-pastel-sm' : 'bg-slate-200 text-slate-500'}`}>
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">2</span>
              <span className="text-sm font-semibold">Maklumat Anak</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-pastel-lg border border-white/60 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-4 bg-pastel-rose/50 border border-pastel-rose rounded-xl text-red-700 text-sm flex items-center gap-2 font-medium">
                <AlertCircle size={18} />{error}
              </div>
            )}
            
            {step === 1 ? (
              <>
                <h3 className="font-semibold text-slate-900 border-b pb-2">Maklumat Ibu Bapa / Penjaga</h3>
                
                {/* Arahan penting */}
                <div className="p-4 bg-pastel-sky/50 border border-pastel-sky rounded-xl text-slate-800 text-sm">
                  <p className="font-semibold mb-1">💡 Penting:</p>
                  <p>Sila pastikan yang mendaftar adalah <strong>ibu bapa atau penjaga</strong> yang akan menguruskan bayaran yuran anak. Ini memudahkan proses pembayaran dan penerimaan resit kemudian.</p>
                </div>
                {tenantCodeHint ? (
                  <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-cyan-700 text-sm">
                    Pendaftaran ini akan dipautkan ke institusi tenant: <span className="font-mono font-semibold">{tenantCodeHint}</span>
                  </div>
                ) : null}
                
                <div className="grid md:grid-cols-2 gap-4">
                  <Input label="Nama Penuh" icon={User} placeholder="Nama seperti dalam IC" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} required data-testid="register-name" />
                  <Input label="No. Kad Pengenalan * (tanpa -)" icon={CreditCard} placeholder="901201061234" value={formData.ic_number} onChange={(e) => setFormData({ ...formData, ic_number: e.target.value.replace(/[-\s]/g, '').slice(0, 12) })} required data-testid="register-ic" />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <Input label="Email" type="email" icon={Mail} placeholder="email@contoh.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required data-testid="register-email" />
                  <Input label="No. Telefon *" icon={Phone} placeholder="0123456789 atau +60123456789" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/[-\s]/g, '') })} required data-testid="register-phone" />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <Input 
                    label="No. Telefon Alternatif" 
                    icon={Phone} 
                    placeholder="No. telefon saudara mara / pasangan" 
                    value={formData.phone_alt} 
                    onChange={(e) => setFormData({ ...formData, phone_alt: e.target.value.replace(/[-\s]/g, '') })} 
                    data-testid="register-phone-alt" 
                  />
                  <Select label="Jantina" value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value })} data-testid="register-gender">
                    <option value="">Pilih Jantina</option>
                    <option value="male">Lelaki</option>
                    <option value="female">Perempuan</option>
                  </Select>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Kata Laluan</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? 'text' : 'password'} 
                        className="flex h-12 w-full rounded-xl border-2 border-slate-200 bg-white pl-4 pr-11 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all" 
                        placeholder="Minimum 6 aksara" 
                        value={formData.password} 
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
                        required 
                        data-testid="register-password" 
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-600 transition-colors">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Sahkan Kata Laluan</label>
                    <div className="relative">
                      <input 
                        type={showConfirmPassword ? 'text' : 'password'} 
                        className="flex h-12 w-full rounded-xl border-2 border-slate-200 bg-white pl-4 pr-11 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all" 
                        placeholder="Ulangi kata laluan" 
                        value={formData.confirmPassword} 
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} 
                        required 
                        data-testid="register-confirm-password" 
                      />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-600 transition-colors">
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
                
                <h4 className="font-medium text-slate-700 border-b pb-2 pt-2 flex items-center gap-2">
                  <MapPin size={18} className="text-primary-600" />
                  Alamat Kediaman
                </h4>
                <Input label="Alamat" icon={MapPin} placeholder="No. Rumah, Jalan, Taman" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} data-testid="register-address" />
                <div className="grid md:grid-cols-3 gap-4">
                  <Input label="Poskod" placeholder="00000" value={formData.postcode} onChange={(e) => setFormData({ ...formData, postcode: e.target.value })} data-testid="register-postcode" />
                  <Input label="Bandar" placeholder="Nama bandar" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} data-testid="register-city" />
                  <Select label="Negeri *" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} data-testid="register-state">
                    <option value="">Pilih Negeri</option>
                    {(systemConfig.negeri?.length > 0 ? systemConfig.negeri : MALAYSIAN_STATES).map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </div>
                
                <Button type="submit" className="w-full" data-testid="register-next">
                  Seterusnya <ChevronRight size={18} />
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="font-semibold text-slate-900">Maklumat Anak</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addChild}>
                    <Plus size={16} /> Tambah Anak
                  </Button>
                </div>
                
                <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2">
                  {children.map((child, index) => (
                    <div key={index} className="p-4 bg-slate-50 rounded-xl space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2">
                          <GraduationCap size={18} className="text-primary-600" />
                          Anak {index + 1}
                        </h4>
                        {children.length > 1 && (
                          <button type="button" onClick={() => removeChild(index)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      
                      {/* Hubungan dengan pendaftar */}
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700">Hubungan dengan Anak *</label>
                        <div className="flex gap-4">
                          {['BAPA', 'IBU', 'PENJAGA'].map((rel) => (
                            <label key={rel} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`relationship-${index}`}
                                value={rel}
                                checked={child.relationship === rel}
                                onChange={(e) => updateChild(index, 'relationship', e.target.value)}
                                className="w-4 h-4 text-violet-600 border-slate-300 focus:ring-teal-500"
                                data-testid={`child-${index}-relationship-${rel.toLowerCase()}`}
                              />
                              <span className="text-sm text-slate-700">{rel}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      
                      <div className="grid md:grid-cols-2 gap-3">
                        <Input 
                          label="No. Matrik *" 
                          placeholder="T12026001" 
                          value={child.matric_number} 
                          onChange={(e) => updateChild(index, 'matric_number', e.target.value)}
                          required
                          data-testid={`child-${index}-matric`}
                        />
                        <Input 
                          label="Nama Penuh Anak *" 
                          placeholder="Nama pelajar (tanpa nombor)" 
                          value={child.full_name} 
                          onChange={(e) => updateChild(index, 'full_name', e.target.value)}
                          required
                          data-testid={`child-${index}-name`}
                        />
                      </div>
                      
                      <Input 
                        label="No. Kad Pengenalan Anak * (tanpa -)" 
                        placeholder="901201061234" 
                        value={child.ic_number} 
                        onChange={(e) => updateChild(index, 'ic_number', e.target.value.replace(/[-\s]/g, '').slice(0, 12))}
                        required
                        data-testid={`child-${index}-ic`}
                      />
                      
                      <div className="grid md:grid-cols-3 gap-3">
                        <Select 
                          label="Tingkatan *" 
                          value={child.form} 
                          onChange={(e) => updateChild(index, 'form', parseInt(e.target.value))}
                          data-testid={`child-${index}-form`}
                        >
                          {[1, 2, 3, 4, 5].map(f => <option key={f} value={f}>Tingkatan {f}</option>)}
                        </Select>
                        <Select 
                          label="Kelas * (dari Senarai Kelas)" 
                          value={child.class_name} 
                          onChange={(e) => updateChild(index, 'class_name', e.target.value)}
                          required
                          data-testid={`child-${index}-class`}
                        >
                          <option value="">Pilih Kelas</option>
                          {(systemConfig.kelas && systemConfig.kelas.length > 0 ? systemConfig.kelas : ['A', 'B', 'C', 'D', 'E', 'F']).map((k) => (
                            <option key={k} value={k}>{k}</option>
                          ))}
                        </Select>
                        <Select 
                          label="Jantina" 
                          value={child.gender} 
                          onChange={(e) => updateChild(index, 'gender', e.target.value)}
                          data-testid={`child-${index}-gender`}
                        >
                          <option value="">Pilih Jantina</option>
                          <option value="male">Lelaki</option>
                          <option value="female">Perempuan</option>
                        </Select>
                      </div>
                      
                      <div className="grid md:grid-cols-2 gap-3">
                        <Select 
                          label="Blok Asrama" 
                          value={child.block_name} 
                          onChange={(e) => updateChild(index, 'block_name', e.target.value)}
                          data-testid={`child-${index}-block`}
                        >
                          <option value="">Pilih Blok</option>
                          {hostelBlocks.map((b) => (
                            <option key={b.code} value={b.code}>{b.name} ({b.gender_display || b.gender})</option>
                          ))}
                        </Select>
                        <Input 
                          label="No. Bilik/Katil" 
                          placeholder="Contoh: 101" 
                          value={child.room_number} 
                          onChange={(e) => updateChild(index, 'room_number', e.target.value)}
                          data-testid={`child-${index}-room`}
                        />
                      </div>
                      
                      <div className="grid md:grid-cols-2 gap-3">
                        <Input 
                          label="No. Telefon Anak" 
                          placeholder="0123456789 (pilihan)" 
                          value={child.phone} 
                          onChange={(e) => updateChild(index, 'phone', e.target.value.replace(/[-\s]/g, ''))}
                          data-testid={`child-${index}-phone`}
                        />
                        <Input 
                          label="Email Anak" 
                          type="email"
                          placeholder="email@pelajar.com (pilihan)" 
                          value={child.email} 
                          onChange={(e) => updateChild(index, 'email', e.target.value)}
                          data-testid={`child-${index}-email`}
                        />
                      </div>
                      
                      {/* Address Section for Child */}
                      <div className="border-t pt-3 mt-2">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <MapPin size={12} /> Alamat Anak (pilihan)
                          </p>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={child.sameAddress}
                              onChange={(e) => updateChild(index, 'sameAddress', e.target.checked)}
                              className="w-4 h-4 text-violet-600 border-slate-300 rounded focus:ring-teal-500"
                              data-testid={`child-${index}-same-address`}
                            />
                            <span className="text-xs text-slate-600">Sama dengan ibu bapa</span>
                          </label>
                        </div>
                        <Input 
                          label="Alamat" 
                          placeholder="No. Rumah, Jalan, Taman" 
                          value={child.address} 
                          onChange={(e) => updateChild(index, 'address', e.target.value)}
                          disabled={child.sameAddress}
                          data-testid={`child-${index}-address`}
                        />
                        <div className="grid md:grid-cols-2 gap-3 mt-2">
                          <Input 
                            label="Poskod" 
                            placeholder="00000" 
                            value={child.postcode} 
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
                              updateChild(index, 'postcode', cleaned);
                            }}
                            disabled={child.sameAddress}
                            data-testid={`child-${index}-postcode`}
                          />
                          <Input 
                            label="Bandar" 
                            placeholder="Nama bandar" 
                            value={child.city} 
                            onChange={(e) => updateChild(index, 'city', e.target.value)}
                            disabled={child.sameAddress}
                            data-testid={`child-${index}-city`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                    Kembali
                  </Button>
                  <Button type="submit" className="flex-1" loading={loading} data-testid="register-submit">
                    Daftar Sekarang
                  </Button>
                </div>
                
                <p className="text-xs text-slate-500 text-center">
                  * Pelajar yang didaftarkan bersama data ibu bapa akan diluluskan secara automatik
                </p>
              </>
            )}
          </form>
          
          {step === 1 && (
            <div className="mt-6 text-center">
              <p className="text-sm text-slate-600">
                Sudah ada akaun? <Link to="/login" className="text-teal-600 font-semibold hover:text-violet-600 hover:underline transition-colors">Log masuk</Link>
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default RegisterPage;
