import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { 
  QrCode, Download, RefreshCw, User, Mail, Phone, 
  CreditCard, Shield, CheckCircle, AlertTriangle,
  Users, Calendar, Pencil, X, Lock, Eye, EyeOff
} from 'lucide-react';
import api, { API_URL } from '../../services/api';
import { Input, Select, Button } from '../../components/common';
import { MALAYSIAN_STATES } from '../../constants';

const MyQRCodePage = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    full_name: '', email: '', phone: '', phone_alt: '', ic_number: '',
    gender: '', state: '', address: '', postcode: '', city: ''
  });
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: '', new_password: '', confirm_password: ''
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    fetchProfileWithQR();
  }, [user]);

  const fetchProfileWithQR = async () => {
    // Support both user.id and user._id
    const userId = user?.id || user?._id;
    if (!userId) {
      setLoading(false);
      setError('ID pengguna tidak dijumpai');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/agm/user/profile-with-qr/${userId}`);
      const data = await res.json();
      if (res.ok) {
        setProfileData(data);
        setProfileForm({
          full_name: data.full_name || '',
          email: data.email || '',
          phone: data.phone || '',
          phone_alt: data.phone_alt || '',
          ic_number: (data.ic_number || '').replace(/[-\s]/g, ''),
          gender: data.gender || '',
          state: data.state || '',
          address: data.address || '',
          postcode: data.postcode || '',
          city: data.city || ''
        });
        setError(null);
      } else {
        setError(data.detail || 'Gagal mendapatkan maklumat');
      }
    } catch (err) {
      setError('Ralat rangkaian');
    } finally {
      setLoading(false);
    }
  };

  const downloadQRCode = () => {
    if (!profileData?.qr_code_image) return;
    
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${profileData.qr_code_image}`;
    link.download = `QRCode-${profileData.full_name.replace(/\s+/g, '_')}.png`;
    link.click();
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        full_name: profileForm.full_name || undefined,
        phone: profileForm.phone || undefined,
        phone_alt: profileForm.phone_alt || undefined,
        ic_number: profileForm.ic_number || undefined,
        gender: profileForm.gender || undefined,
        state: profileForm.state || undefined,
        address: profileForm.address || undefined,
        postcode: profileForm.postcode || undefined,
        city: profileForm.city || undefined
      };
      await api.put('/api/auth/me', payload);
      setProfileData(prev => prev ? { ...prev, ...profileForm } : null);
      setEditing(false);
      toast.success('Profil dikemaskini');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan profil');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.new_password.length < 6) {
      toast.error('Kata laluan baru minimum 6 aksara');
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('Kata laluan baru dan pengesahan tidak sepadan');
      return;
    }
    setPasswordSaving(true);
    try {
      await api.put('/api/auth/me/password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password
      });
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      setShowPasswordSection(false);
      toast.success('Kata laluan telah dikemas kini');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menukar kata laluan');
    } finally {
      setPasswordSaving(false);
    }
  };

  const getStatusBadge = (status) => {
    if (!status) return null;
    
    const isAktif = status.status_code === 'aktif';
    
    return (
      <div className={`p-4 rounded-xl ${isAktif ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
        <div className="flex items-center gap-3">
          {isAktif ? (
            <CheckCircle size={28} className="text-green-600" />
          ) : (
            <AlertTriangle size={28} className="text-orange-600" />
          )}
          <div>
            <h3 className={`font-bold text-lg ${isAktif ? 'text-green-800' : 'text-orange-800'}`}>
              {status.status}
            </h3>
            <p className={`text-sm ${isAktif ? 'text-green-600' : 'text-orange-600'}`}>
              {status.sebab}
            </p>
          </div>
        </div>
        
        {/* Additional Info */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-white/60 rounded-lg p-3">
            <p className="text-xs text-slate-500">Tahun</p>
            <p className="font-semibold text-slate-800">{status.tahun}</p>
          </div>
          <div className="bg-white/60 rounded-lg p-3">
            <p className="text-xs text-slate-500">Tarikh Cutoff</p>
            <p className="font-semibold text-slate-800">{status.tarikh_cutoff}</p>
          </div>
          <div className="bg-white/60 rounded-lg p-3">
            <p className="text-xs text-slate-500">Hak Mengundi</p>
            <p className={`font-semibold ${status.boleh_mengundi ? 'text-green-600' : 'text-red-600'}`}>
              {status.boleh_mengundi ? 'Ya' : 'Tidak'}
            </p>
          </div>
          <div className="bg-white/60 rounded-lg p-3">
            <p className="text-xs text-slate-500">Jumlah Anak</p>
            <p className="font-semibold text-slate-800">{status.jumlah_anak}</p>
          </div>
        </div>

        {/* Fee Details */}
        {status.jumlah_anak > 0 && (
          <div className="mt-4 bg-white/60 rounded-lg p-3">
            <p className="text-sm font-medium text-slate-700 mb-2">Yuran Muafakat (RM50/anak)</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-slate-500">Perlu Bayar</p>
                <p className="font-bold text-slate-800">RM {status.jumlah_perlu_bayar?.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Sudah Bayar</p>
                <p className="font-bold text-green-600">RM {status.jumlah_sudah_bayar?.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Baki</p>
                <p className={`font-bold ${status.baki_tertunggak > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  RM {status.baki_tertunggak?.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Children Fee Status */}
        {status.anak_belum_bayar?.length > 0 && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm font-medium text-red-800 mb-2">Anak Belum Bayar Yuran:</p>
            <ul className="list-disc list-inside text-sm text-red-700">
              {status.anak_belum_bayar.map((anak, i) => (
                <li key={i}>{anak}</li>
              ))}
            </ul>
          </div>
        )}
        
        {status.anak_sudah_bayar?.length > 0 && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm font-medium text-green-800 mb-2">Anak Sudah Bayar Yuran:</p>
            <ul className="list-disc list-inside text-sm text-green-700">
              {status.anak_sudah_bayar.map((anak, i) => (
                <li key={i}>{anak}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pastel-mint/20 to-pastel-lavender/20 p-6 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw size={40} className="animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-slate-600">Memuatkan...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pastel-mint/20 to-pastel-lavender/20 p-6 flex items-center justify-center">
        <div className="text-center bg-red-50 p-6 rounded-xl">
          <AlertTriangle size={40} className="text-red-500 mx-auto mb-4" />
          <p className="text-red-700">{error}</p>
          <button 
            onClick={fetchProfileWithQR}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Cuba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pastel-mint/20 to-pastel-lavender/20 p-4 sm:p-6 min-w-0 overflow-x-hidden" data-testid="my-qrcode-page">
      {/* Header: padat pada mobile supaya QR nampak tanpa halangan */}
      <div className="mb-3 sm:mb-6 lg:mb-8">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900" data-testid="page-title">QR Code & Profil</h1>
        <p className="text-slate-600 mt-0.5 sm:mt-1 text-xs sm:text-base hidden sm:block">Kod QR peribadi untuk kehadiran AGM dan aktiviti maktab</p>
      </div>

      {/* Mobile: QR Code dahulu (order-1) supaya paparan sebenar tanpa halangan; desktop: grid biasa */}
      <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4 sm:gap-6">
        {/* QR Code Card - atas sekali pada mobile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="order-1 bg-white rounded-2xl shadow-lg p-4 sm:p-6"
        >
          <div className="text-center">
            {/* Ikon QR disembunyikan pada mobile; paparan desktop sahaja */}
            <div className="hidden sm:inline-flex items-center justify-center w-16 h-16 bg-pastel-mint rounded-2xl mb-4">
              <QrCode size={32} className="text-teal-600" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-1 sm:mb-2">Kod QR Kehadiran</h2>
            <p className="text-xs sm:text-sm text-slate-500 mb-3 sm:mb-6">
              Tunjukkan kod QR ini kepada pengimbas semasa AGM atau aktiviti maktab
            </p>

            {/* QR Code Image - saiz sesuai mobile */}
            {profileData?.qr_code_image ? (
              <div className="bg-white p-3 sm:p-4 rounded-xl border-2 border-dashed border-pastel-lavender inline-block mb-3 sm:mb-4">
                <img 
                  src={`data:image/png;base64,${profileData.qr_code_image}`}
                  alt="QR Code"
                  className="w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 mx-auto"
                  data-testid="qr-code-image"
                />
              </div>
            ) : (
              <div className="bg-slate-100 p-8 rounded-xl text-center mb-4">
                <QrCode size={64} className="text-slate-400 mx-auto" />
                <p className="text-slate-500 mt-2">QR Code tidak tersedia</p>
              </div>
            )}

            {/* QR Code Value */}
            <div className="bg-slate-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-slate-500 mb-1">Kod</p>
              <p className="font-mono text-sm text-slate-700 break-all" data-testid="qr-code-value">
                {profileData?.qr_code || '-'}
              </p>
            </div>

            {/* Download Button */}
            <button
              onClick={downloadQRCode}
              disabled={!profileData?.qr_code_image}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
              data-testid="download-qr-btn"
            >
              <Download size={20} />
              Muat Turun QR Code
            </button>
          </div>
        </motion.div>

        {/* Profile & AGM Status - bawah QR pada mobile */}
        <div className="order-2 space-y-4 sm:space-y-6">
          {/* Profile Info - View / Edit */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl shadow-lg p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <User size={20} className="text-teal-600" />
                Maklumat Pengguna
              </h3>
              {!editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-teal-600 hover:bg-pastel-mint/50 rounded-lg transition-colors"
                >
                  <Pencil size={16} /> Edit Profil
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setEditing(false)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                  <Button size="sm" onClick={handleSaveProfile} loading={saving} disabled={saving}>Simpan</Button>
                </div>
              )}
            </div>
            
            {editing ? (
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <Input label="Nama Penuh" value={profileForm.full_name} onChange={(e) => setProfileForm(f => ({ ...f, full_name: e.target.value }))} required />
                {profileForm.email && (
                  <Input label="Email" type="email" value={profileForm.email} disabled className="bg-slate-50" />
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="No. Telefon" value={profileForm.phone} onChange={(e) => setProfileForm(f => ({ ...f, phone: e.target.value.replace(/[-\s]/g, '') }))} placeholder="0123456789" />
                  <Input label="No. Telefon Alternatif" value={profileForm.phone_alt} onChange={(e) => setProfileForm(f => ({ ...f, phone_alt: e.target.value.replace(/[-\s]/g, '') }))} placeholder="Pilihan" />
                </div>
                <Input label="No. Kad Pengenalan" value={profileForm.ic_number} onChange={(e) => setProfileForm(f => ({ ...f, ic_number: e.target.value.replace(/[-\s]/g, '') }))} placeholder="12 digit tanpa -" maxLength={12} />
                <Select label="Jantina" value={profileForm.gender} onChange={(e) => setProfileForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="">Pilih</option>
                  <option value="male">Lelaki</option>
                  <option value="female">Perempuan</option>
                </Select>
                <Select label="Negeri" value={profileForm.state} onChange={(e) => setProfileForm(f => ({ ...f, state: e.target.value }))}>
                  <option value="">Pilih Negeri</option>
                  {MALAYSIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Input label="Alamat" value={profileForm.address} onChange={(e) => setProfileForm(f => ({ ...f, address: e.target.value }))} placeholder="Alamat penuh" />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Poskod" value={profileForm.postcode} onChange={(e) => setProfileForm(f => ({ ...f, postcode: e.target.value }))} placeholder="Poskod" />
                  <Input label="Bandar" value={profileForm.city} onChange={(e) => setProfileForm(f => ({ ...f, city: e.target.value }))} placeholder="Bandar" />
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <User size={18} className="text-slate-500" />
                  <div><p className="text-xs text-slate-500">Nama Penuh</p><p className="font-medium text-slate-800">{profileData?.full_name || '-'}</p></div>
                </div>
                {profileData?.email && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <Mail size={18} className="text-slate-500" />
                    <div><p className="text-xs text-slate-500">Email</p><p className="font-medium text-slate-800">{profileData.email}</p></div>
                  </div>
                )}
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <Phone size={18} className="text-slate-500" />
                  <div><p className="text-xs text-slate-500">No. Telefon</p><p className="font-medium text-slate-800">{profileData?.phone || '-'}</p></div>
                </div>
                {(profileData?.phone_alt) && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <Phone size={18} className="text-slate-500" />
                    <div><p className="text-xs text-slate-500">No. Telefon Alternatif</p><p className="font-medium text-slate-800">{profileData.phone_alt}</p></div>
                  </div>
                )}
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <CreditCard size={18} className="text-slate-500" />
                  <div><p className="text-xs text-slate-500">No. IC</p><p className="font-medium text-slate-800">{profileData?.ic_number ? profileData.ic_number.replace(/[-\s]/g, '') : '-'}</p></div>
                </div>
                {(profileData?.gender || profileData?.state || profileData?.address) && (
                  <>
                    {profileData?.gender && (
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <div><p className="text-xs text-slate-500">Jantina</p><p className="font-medium text-slate-800">{profileData.gender === 'male' ? 'Lelaki' : profileData.gender === 'female' ? 'Perempuan' : profileData.gender}</p></div>
                      </div>
                    )}
                    {profileData?.state && (
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <div><p className="text-xs text-slate-500">Negeri</p><p className="font-medium text-slate-800">{profileData.state}</p></div>
                      </div>
                    )}
                    {(profileData?.address || profileData?.postcode || profileData?.city) && (
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <div><p className="text-xs text-slate-500">Alamat</p><p className="font-medium text-slate-800">{[profileData?.address, profileData?.postcode, profileData?.city].filter(Boolean).join(', ') || '-'}</p></div>
                      </div>
                    )}
                  </>
                )}
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <Shield size={18} className="text-slate-500" />
                  <div><p className="text-xs text-slate-500">Peranan</p><p className="font-medium text-slate-800 capitalize">{profileData?.role || '-'}</p></div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Tukar Kata Laluan (hanya untuk pengguna yang log masuk dengan email, bukan pelajar matrik) */}
          {profileData?.email && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-white rounded-2xl shadow-lg p-6"
            >
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Lock size={20} className="text-teal-600" />
                Kata Laluan
              </h3>
              {!showPasswordSection ? (
                <button
                  type="button"
                  onClick={() => setShowPasswordSection(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-600 hover:bg-pastel-mint/50 rounded-lg transition-colors border border-pastel-lilac"
                >
                  <Lock size={16} /> Tukar Kata Laluan
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="relative">
                    <Input
                      label="Kata laluan semasa"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={passwordForm.current_password}
                      onChange={(e) => setPasswordForm(f => ({ ...f, current_password: e.target.value }))}
                      required
                      placeholder="Masukkan kata laluan semasa"
                    />
                    <button type="button" className="absolute right-3 top-9 text-slate-400 hover:text-slate-600" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                      {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      label="Kata laluan baru"
                      type={showNewPassword ? 'text' : 'password'}
                      value={passwordForm.new_password}
                      onChange={(e) => setPasswordForm(f => ({ ...f, new_password: e.target.value }))}
                      required
                      minLength={6}
                      placeholder="Minimum 6 aksara"
                    />
                    <button type="button" className="absolute right-3 top-9 text-slate-400 hover:text-slate-600" onClick={() => setShowNewPassword(!showNewPassword)}>
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <Input
                    label="Sahkan kata laluan baru"
                    type="password"
                    value={passwordForm.confirm_password}
                    onChange={(e) => setPasswordForm(f => ({ ...f, confirm_password: e.target.value }))}
                    required
                    minLength={6}
                    placeholder="Ulangi kata laluan baru"
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => { setShowPasswordSection(false); setPasswordForm({ current_password: '', new_password: '', confirm_password: '' }); }}>Batal</Button>
                    <Button type="submit" loading={passwordSaving} disabled={passwordSaving}>Simpan Kata Laluan</Button>
                  </div>
                </form>
              )}
            </motion.div>
          )}

          {/* AGM Status (for parents only) */}
          {profileData?.agm_status && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl shadow-lg p-6"
              data-testid="agm-status-section"
            >
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Calendar size={20} className="text-teal-600" />
                Status Keahlian AGM Muafakat
              </h3>
              
              {getStatusBadge(profileData.agm_status)}
            </motion.div>
          )}

          {/* Children List (for parents only) */}
          {profileData?.children?.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-2xl shadow-lg p-6"
            >
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Users size={20} className="text-teal-600" />
                Senarai Anak ({profileData.children.length})
              </h3>
              
              <div className="space-y-3">
                {profileData.children.map((child, idx) => (
                  <div key={child.id || idx} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-800">{child.full_name}</p>
                        <p className="text-sm text-slate-500">
                          {child.matric_number} • Tingkatan {child.form} {child.class_name}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        child.status === 'approved' ? 'bg-green-100 text-green-700' :
                        child.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {child.status === 'approved' ? 'Disahkan' : 
                         child.status === 'pending' ? 'Menunggu' : child.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-6 bg-blue-50 border border-blue-200 rounded-2xl p-6"
      >
        <h3 className="font-semibold text-blue-900 mb-3">Cara Menggunakan QR Code</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0 text-blue-800 font-bold text-xs">1</span>
            <span>Simpan atau muat turun QR Code anda ke telefon bimbit.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0 text-blue-800 font-bold text-xs">2</span>
            <span>Semasa AGM atau aktiviti maktab, tunjukkan QR Code kepada pengimbas di pintu masuk.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0 text-blue-800 font-bold text-xs">3</span>
            <span>Kehadiran anda akan direkodkan secara automatik.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0 text-blue-800 font-bold text-xs">4</span>
            <span>Status keahlian (Aktif/Pemerhati) ditentukan berdasarkan pembayaran Yuran Muafakat sebelum 30 April.</span>
          </li>
        </ul>
      </motion.div>
    </div>
  );
};

export default MyQRCodePage;
