import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { 
  Fingerprint, Mail, Bus, Save, Trash2, Send, AlertCircle, Users, Plus, X, RefreshCw, GraduationCap, Globe, Moon, Power, Building, Edit, Cloud, CheckCircle, ChevronDown, ChevronRight, Smartphone, Image as ImageIcon, Upload, LayoutList
} from 'lucide-react';
import api, { API_URL } from '../../services/api';
import {
  buildHostelBlockPayload,
  formatBedsPerLevel,
  defaultRoomConfigFromLegacy,
  ensureRoomConfigLevels,
  totalBedsForLevelSegments,
  segmentsToBedsPerLevel,
  formatSegmentSummary,
} from '../../utils/hostelBlocks';

// Components
const Spinner = ({ size = 'md' }) => (
  <div className={`spinner ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-primary-700 hover:bg-primary-900 text-white shadow-sm hover:shadow-md',
    secondary: 'bg-secondary-600 hover:bg-amber-700 text-white',
    outline: 'border-2 border-primary-700 text-primary-700 hover:bg-primary-50',
    ghost: 'text-slate-600 hover:text-primary-700 hover:bg-slate-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`font-medium rounded-lg transition-all btn-click flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Input = ({ label, error, icon: Icon, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <div className="relative">
      {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon size={18} /></div>}
      <input className={`flex h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${Icon ? 'pl-10' : ''} ${error ? 'border-red-500' : 'border-slate-200'}`} {...props} />
    </div>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden ${className}`} {...props}>{children}</div>
);

const Badge = ({ status, children }) => {
  const styles = { approved: 'bg-emerald-100 text-emerald-800', pending: 'bg-amber-100 text-amber-800', rejected: 'bg-red-100 text-red-800', paid: 'bg-emerald-100 text-emerald-800', partial: 'bg-blue-100 text-blue-800', overdue: 'bg-red-100 text-red-800', active: 'bg-emerald-100 text-emerald-800', inactive: 'bg-red-100 text-red-800', warning: 'bg-amber-100 text-amber-800' };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

const DEFAULT_LEVELS = ['Tingkat 1', 'Tingkat 2', 'Tingkat 3'];

const SettingsPage = () => {
  const auth = useAuth();
  const user = auth?.user ?? null;
  const [activeTab, setActiveTab] = useState('mydigitalid');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // MyDigital ID State
  const [myDigitalIDSettings, setMyDigitalIDSettings] = useState({
    action: '',
    url: '',
    nonce: ''
  });
  const [isEnabled, setIsEnabled] = useState(false);
  
  // Email State
  const [emailSettings, setEmailSettings] = useState({
    api_key: '',
    sender_email: '',
    sender_name: 'SMART360: Ai Edition'
  });
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  
  // Bus Booking Settings State
  const [busBookingSettings, setBusBookingSettings] = useState({
    require_leave_approval: false
  });

  // Smart 360 AI Edition PWA Settings State
  const [pwaSettings, setPwaSettings] = useState({
    name: 'Smart 360 AI Edition',
    short_name: 'Smart 360 AI',
    theme_color: '#0f766e',
    background_color: '#ffffff',
    description: '',
    page_title: '',
    app_base_url: '',
    pwa_version: '',
    gcm_sender_id: '',
    icon_192_url: '/icons/icon-192x192.png',
    icon_512_url: '/icons/icon-512x512.png',
    splash_title: '',
    splash_tagline: '',
    splash_image_url: ''
  });
  const [pwaSaving, setPwaSaving] = useState(false);
  const [pwaIconUploading, setPwaIconUploading] = useState(false);

  // Landing page hero image (Gambar Landing)
  const [landingSettings, setLandingSettings] = useState({ hero_image_url: '' });
  const [landingSaving, setLandingSaving] = useState(false);
  const [landingUploading, setLandingUploading] = useState(false);

  // Onboarding slides (database driven - diedit Superadmin/Admin)
  const [onboardingSettings, setOnboardingSettings] = useState({ slides: [] });
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingUploadingSlideIndex, setOnboardingUploadingSlideIndex] = useState(null);

  // Portal (tajuk portal & nama institusi - untuk kegunaan pelbagai MRSM)
  const [portalSettings, setPortalSettings] = useState({ portal_title: 'SMART360: Ai Edition', institution_name: 'MRSMKU' });
  const [portalSaving, setPortalSaving] = useState(false);

  // System Config State (Kelas, Bangsa, Agama, Negeri)
  const [systemConfig, setSystemConfig] = useState({
    kelas: ['A', 'B', 'C', 'D', 'E', 'F'],
    bangsa: ['Melayu', 'Cina', 'India', 'Bumiputera Sabah', 'Bumiputera Sarawak', 'Lain-lain'],
    agama: ['Islam', 'Buddha', 'Hindu', 'Kristian', 'Sikh', 'Taoisme', 'Konfusianisme', 'Lain-lain'],
    negeri: ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya']
  });
  const [newKelas, setNewKelas] = useState('');
  const [newBangsa, setNewBangsa] = useState('');
  const [newAgama, setNewAgama] = useState('');
  const [newNegeri, setNewNegeri] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Module On/Off Settings State
  const [moduleSettings, setModuleSettings] = useState({
    tiket_bas: { enabled: true, name: 'Tiket Bas', description: 'Modul tempahan tiket bas' },
    hostel: { enabled: true, name: 'Hostel', description: 'Modul pengurusan asrama' },
    koperasi: { enabled: true, name: 'Koperasi', description: 'Modul kedai koperasi maktab' },
    marketplace: { enabled: true, name: 'Marketplace', description: 'Modul pasaran pelbagai vendor' },
    sickbay: { enabled: true, name: 'Bilik Sakit', description: 'Modul pengurusan bilik sakit' },
    vehicle: { enabled: true, name: 'Kenderaan', description: 'Modul keselamatan kenderaan (QR)' },
    inventory: { enabled: true, name: 'Inventori', description: 'Modul inventori universal' },
    complaints: { enabled: true, name: 'Aduan', description: 'Modul aduan dan maklum balas' },
    agm: { enabled: true, name: 'Mesyuarat AGM', description: 'Modul mesyuarat agung tahunan' }
  });
  const [savingModules, setSavingModules] = useState(false);

  // Asrama (Blok Asrama) - sync dengan pelajar/anak
  const [asramaBlocks, setAsramaBlocks] = useState([]);
  const [asramaLoading, setAsramaLoading] = useState(false);
  const [asramaModalOpen, setAsramaModalOpen] = useState(false);
  const [asramaEditing, setAsramaEditing] = useState(null);
  const [asramaForm, setAsramaForm] = useState({ code: '', name: '', gender: 'lelaki', levels: [], room_config_per_level: [], beds_per_room: '' });
  const [asramaSaving, setAsramaSaving] = useState(false);
  const [asramaExpandedLevelIndex, setAsramaExpandedLevelIndex] = useState(null);
  const [seedLoading, setSeedLoading] = useState(false);

  // E-mel / SES tab
  const [emailStatus, setEmailStatus] = useState({ resend_enabled: false, ses_enabled: false, smtp_enabled: false, dev_mode: true, message: '' });
  const [emailStatusLoading, setEmailStatusLoading] = useState(false);
  const [sesTestEmail, setSesTestEmail] = useState('');
  const [sesTestSending, setSesTestSending] = useState(false);
  const [smtpSettings, setSmtpSettings] = useState({ host: '', port: 587, user: '', password: '', use_tls: true, sender_email: '' });
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpHadExisting, setSmtpHadExisting] = useState(false);
  const [sesSettings, setSesSettings] = useState({ access_key_id: '', secret_access_key: '', region: 'ap-southeast-1', sender_email: '' });
  const [sesSaving, setSesSaving] = useState(false);
  const [sesHadExisting, setSesHadExisting] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchEmailStatus = async () => {
    setEmailStatusLoading(true);
    try {
      const res = await api.get('/api/settings/email-status');
      setEmailStatus(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal muat status e-mel');
      setEmailStatus({ resend_enabled: false, ses_enabled: false, smtp_enabled: false, dev_mode: true, message: '' });
    } finally {
      setEmailStatusLoading(false);
    }
  };

  const fetchSmtpSettings = async () => {
    try {
      const res = await api.get('/api/settings/smtp');
      if (res.data?.enabled) {
        setSmtpHadExisting(true);
        setSmtpSettings({
          host: res.data.host || '',
          port: res.data.port ?? 587,
          user: res.data.user || '',
          password: '',
          use_tls: res.data.use_tls !== false,
          sender_email: res.data.sender_email || '',
        });
      } else {
        setSmtpHadExisting(false);
        setSmtpSettings({ host: '', port: 587, user: '', password: '', use_tls: true, sender_email: '' });
      }
    } catch {
      setSmtpHadExisting(false);
      setSmtpSettings({ host: '', port: 587, user: '', password: '', use_tls: true, sender_email: '' });
    }
  };

  const fetchSesSettings = async () => {
    try {
      const res = await api.get('/api/settings/ses');
      if (res.data?.enabled) {
        setSesHadExisting(true);
        setSesSettings({
          access_key_id: res.data.access_key_id || '',
          secret_access_key: '',
          region: res.data.region || 'ap-southeast-1',
          sender_email: res.data.sender_email || '',
        });
      } else {
        setSesHadExisting(false);
        setSesSettings({ access_key_id: '', secret_access_key: '', region: 'ap-southeast-1', sender_email: '' });
      }
    } catch {
      setSesHadExisting(false);
      setSesSettings({ access_key_id: '', secret_access_key: '', region: 'ap-southeast-1', sender_email: '' });
    }
  };

  useEffect(() => {
    if (activeTab === 'ses') {
      fetchEmailStatus();
      fetchSmtpSettings();
      fetchSesSettings();
    }
  }, [activeTab]);

  const fetchAsramaBlocks = async () => {
    setAsramaLoading(true);
    try {
      const res = await api.get('/api/hostel-blocks');
      setAsramaBlocks(res.data?.blocks || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal muat blok asrama');
      setAsramaBlocks([]);
    } finally {
      setAsramaLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'asrama') fetchAsramaBlocks();
  }, [activeTab]);

  // Muat senarai modul terkini dari server apabila tab Pengurusan Modul dibuka
  useEffect(() => {
    if (activeTab === 'modules') {
      api.get('/api/settings/modules')
        .then((res) => {
          if (res.data?.modules && Object.keys(res.data.modules).length > 0) {
            setModuleSettings(res.data.modules);
          }
        })
        .catch(() => {});
    }
  }, [activeTab]);

  const openAsramaModal = (block = null) => {
    setAsramaEditing(block);
    const levels = block?.levels || [];
    const blockRoomConfig = block?.room_config_per_level;
    const roomConfig =
      Array.isArray(blockRoomConfig) && blockRoomConfig.length === levels.length
        ? blockRoomConfig.map((segments) =>
            (Array.isArray(segments) ? segments : []).map((s) => ({
              rooms: Number(s?.rooms) || 0,
              beds_per_room: Math.max(1, Math.min(20, Number(s?.beds_per_room) || 2)),
            }))
          )
        : defaultRoomConfigFromLegacy(levels, block?.beds_per_level || [], block?.beds_per_room);
    setAsramaForm(block
      ? {
          code: block.code,
          name: block.name,
          gender: block.gender || 'lelaki',
          levels,
          room_config_per_level: ensureRoomConfigLevels(roomConfig, levels.length),
          beds_per_room: block.beds_per_room ?? '',
        }
      : { code: '', name: '', gender: 'lelaki', levels: [], room_config_per_level: [], beds_per_room: '' }
    );
    setAsramaModalOpen(true);
  };

  const closeAsramaModal = () => {
    setAsramaModalOpen(false);
    setAsramaEditing(null);
    setAsramaExpandedLevelIndex(null);
  };

  const handleAsramaSubmit = async (e) => {
    e.preventDefault();
    if (!asramaForm.code?.trim() || !asramaForm.name?.trim()) {
      toast.error('Kod dan Nama blok wajib');
      return;
    }
    setAsramaSaving(true);
    try {
      const payload = buildHostelBlockPayload(asramaForm);
      if (asramaEditing?.id) {
        await api.put(`/api/hostel-blocks/${asramaEditing.id}`, payload);
        toast.success('Blok dikemaskini');
      } else {
        await api.post('/api/hostel-blocks', payload);
        toast.success('Blok ditambah');
      }
      closeAsramaModal();
      fetchAsramaBlocks();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan blok');
    } finally {
      setAsramaSaving(false);
    }
  };

  const handleAsramaDelete = async (block) => {
    if (!window.confirm(`Padam blok "${block.name}"? Pelajar dalam blok ini perlu dikemaskini.`)) return;
    try {
      await api.delete(`/api/hostel-blocks/${block.id}`);
      toast.success('Blok dipadam');
      fetchAsramaBlocks();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam blok');
    }
  };

  const handleSeedAsrama = async () => {
    if (!window.confirm('Masukkan blok asrama default (JA, JB, JC, I, H, G, F, E)? Blok yang sudah wujud akan dilangkau.')) return;
    setSeedLoading(true);
    try {
      const res = await api.post('/api/hostel-blocks/seed-defaults');
      toast.success(res.data?.message || 'Seed selesai');
      fetchAsramaBlocks();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal seed blok');
    } finally {
      setSeedLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const [mydigitalRes, emailRes, busRes, sysConfigRes, moduleRes, pwaRes, landingRes, onboardingRes, portalRes] = await Promise.allSettled([
        api.get('/api/settings/mydigitalid'),
        api.get('/api/settings/email'),
        api.get('/api/settings/bus-booking'),
        api.get('/api/settings/system-config'),
        api.get('/api/settings/modules'),
        api.get('/api/settings/pwa'),
        api.get('/api/settings/landing'),
        api.get('/api/settings/onboarding'),
        api.get('/api/settings/portal')
      ]);
      const get = (p) => (p.status === 'fulfilled' ? p.value?.data : null);

      if (get(mydigitalRes)?.enabled) {
        const d = get(mydigitalRes);
        setMyDigitalIDSettings({
          action: d.action || '',
          url: d.url || '',
          nonce: d.nonce || ''
        });
        setIsEnabled(true);
      }

      const emailData = get(emailRes);
      if (emailData?.enabled) {
        setEmailSettings({
          api_key: '',
          sender_email: emailData.sender_email || '',
          sender_name: emailData.sender_name || 'SMART360: Ai Edition'
        });
        setEmailEnabled(true);
      }

      const busData = get(busRes);
      setBusBookingSettings({
        require_leave_approval: busData?.require_leave_approval ?? false
      });

      const sysData = get(sysConfigRes);
      if (sysData) {
        setSystemConfig({
          kelas: sysData.kelas || ['A', 'B', 'C', 'D', 'E', 'F'],
          bangsa: sysData.bangsa || ['Melayu', 'Cina', 'India', 'Bumiputera Sabah', 'Bumiputera Sarawak', 'Lain-lain'],
          agama: sysData.agama || ['Islam', 'Buddha', 'Hindu', 'Kristian', 'Sikh', 'Taoisme', 'Konfusianisme', 'Lain-lain'],
          negeri: sysData.negeri || ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya']
        });
      }

      const moduleData = get(moduleRes);
      if (moduleData?.modules) {
        setModuleSettings(moduleData.modules);
      }

      const pwaData = get(pwaRes);
      if (pwaData) {
        setPwaSettings({
          name: pwaData.name || 'Smart 360 AI Edition',
          short_name: pwaData.short_name || 'Smart 360 AI',
          theme_color: pwaData.theme_color || '#0f766e',
          background_color: pwaData.background_color || '#ffffff',
          description: pwaData.description || '',
          page_title: pwaData.page_title || '',
          app_base_url: pwaData.app_base_url || '',
          pwa_version: pwaData.pwa_version || '',
          gcm_sender_id: pwaData.gcm_sender_id || '',
          icon_192_url: pwaData.icon_192_url || '/icons/icon-192x192.png',
          icon_512_url: pwaData.icon_512_url || '/icons/icon-512x512.png',
          splash_title: pwaData.splash_title ?? '',
          splash_tagline: pwaData.splash_tagline ?? '',
          splash_image_url: pwaData.splash_image_url ?? ''
        });
      }

      const landingData = get(landingRes);
      if (landingData) {
        setLandingSettings({ hero_image_url: landingData.hero_image_url || '' });
      }

      const onboardingData = get(onboardingRes);
      if (onboardingData?.slides?.length) {
        setOnboardingSettings({ slides: onboardingData.slides });
      } else {
        setOnboardingSettings({
          slides: [
            { order: 0, title: 'Selamat datang ke Smart 360 AI Edition', subtitle: 'Satu platform pengurusan Maktab yang pintar dan bersepadu.', image_url: '/images/onboarding/onboarding-1-welcome.png' },
            { order: 1, title: 'Yuran, Bas & Asrama', subtitle: 'Urus yuran, tiket bas dan asrama dalam satu tempat. Lebih mudah, lebih pantas.', image_url: '/images/onboarding/onboarding-2-yuran-bas.png' },
            { order: 2, title: 'Ibu Bapa & Pelajar', subtitle: 'Pantau anak, bayar yuran, tempah bas dengan mudah dari telefon anda.', image_url: '/images/onboarding/onboarding-3-keluarga.png' },
            { order: 3, title: 'Mulakan pengalaman anda', subtitle: 'Log masuk atau daftar untuk akses penuh ke Smart 360 AI Edition.', image_url: '/images/onboarding/onboarding-4-mula.png' }
          ]
        });
      }

      const portalData = get(portalRes);
      if (portalData) {
        setPortalSettings({
          portal_title: portalData.portal_title || 'SMART360: Ai Edition',
          institution_name: portalData.institution_name || 'MRSMKU'
        });
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
    } finally {
      setLoading(false);
    }
  };

  // MyDigital ID handlers
  const handleSaveMyDigitalID = async () => {
    setSaving(true);
    try {
      await api.post('/api/settings/mydigitalid', myDigitalIDSettings);
      setIsEnabled(true);
      toast.success('Tetapan MyDigital ID disimpan!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan tetapan');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMyDigitalID = async () => {
    if (!window.confirm('Adakah anda pasti mahu memadamkan tetapan MyDigital ID?')) return;
    setSaving(true);
    try {
      await api.delete('/api/settings/mydigitalid');
      setMyDigitalIDSettings({ action: '', url: '', nonce: '' });
      setIsEnabled(false);
      toast.success('Tetapan MyDigital ID dipadam');
    } catch (err) {
      toast.error('Gagal memadamkan tetapan');
    } finally {
      setSaving(false);
    }
  };

  const handleJsonPaste = (e) => {
    const text = e.target.value;
    try {
      const parsed = JSON.parse(text);
      if (parsed.action && parsed.url && parsed.nonce) {
        setMyDigitalIDSettings({
          action: parsed.action,
          url: parsed.url,
          nonce: parsed.nonce
        });
        toast.success('JSON berjaya diimport!');
      }
    } catch {
      // Not valid JSON, ignore
    }
  };

  // Email handlers
  const handleSaveEmail = async () => {
    setSaving(true);
    try {
      await api.post('/api/settings/email', emailSettings);
      setEmailEnabled(true);
      setEmailSettings(prev => ({ ...prev, api_key: '' }));
      toast.success('Tetapan Email Resend disimpan!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan tetapan');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEmail = async () => {
    if (!window.confirm('Adakah anda pasti mahu memadamkan tetapan Email?')) return;
    setSaving(true);
    try {
      await api.delete('/api/settings/email');
      setEmailSettings({ api_key: '', sender_email: '', sender_name: 'SMART360: Ai Edition' });
      setEmailEnabled(false);
      toast.success('Tetapan Email dipadam');
    } catch (err) {
      toast.error('Gagal memadamkan tetapan');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmail) {
      toast.error('Sila masukkan email penerima');
      return;
    }
    setSendingTest(true);
    try {
      const res = await api.post('/api/settings/email/test', { recipient_email: testEmail });
      toast.success(res.data.message);
      setTestEmail('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menghantar email ujian');
    } finally {
      setSendingTest(false);
    }
  };

  const handleSesTestSend = async () => {
    if (!sesTestEmail?.trim()) {
      toast.error('Sila masukkan e-mel penerima');
      return;
    }
    setSesTestSending(true);
    try {
      await api.post('/api/email-templates/send-test', {
        template_key: 'test_email',
        to_email: sesTestEmail.trim(),
        variables: { timestamp: new Date().toISOString() }
      });
      toast.success('E-mel ujian dihantar (SES / Resend / SMTP / mod dev)');
      setSesTestEmail('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal hantar e-mel ujian');
    } finally {
      setSesTestSending(false);
    }
  };

  const handleSaveSmtp = async () => {
    if (!smtpSettings.host?.trim() || !smtpSettings.user?.trim()) {
      toast.error('Host dan User SMTP wajib');
      return;
    }
    if (!smtpSettings.password?.trim() && !smtpHadExisting) {
      toast.error('Kata laluan SMTP wajib untuk tetapan baru');
      return;
    }
    setSmtpSaving(true);
    try {
      await api.post('/api/settings/smtp', {
        host: smtpSettings.host.trim(),
        port: parseInt(smtpSettings.port, 10) || 587,
        user: smtpSettings.user.trim(),
        password: smtpSettings.password || undefined,
        use_tls: smtpSettings.use_tls,
        sender_email: smtpSettings.sender_email?.trim() || undefined,
      });
      toast.success('Tetapan SMTP disimpan. E-mel ujian akan guna tetapan ini jika tiada SES/Resend.');
      setSmtpSettings(prev => ({ ...prev, password: '' }));
      fetchEmailStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan tetapan SMTP');
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleDeleteSmtp = async () => {
    if (!window.confirm('Padam tetapan SMTP? E-mel akan guna env atau mod dev.')) return;
    try {
      await api.delete('/api/settings/smtp');
      toast.success('Tetapan SMTP dipadam');
      setSmtpHadExisting(false);
      setSmtpSettings({ host: '', port: 587, user: '', password: '', use_tls: true, sender_email: '' });
      fetchEmailStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam');
    }
  };

  const handleSaveSes = async () => {
    if (!sesSettings.access_key_id?.trim()) {
      toast.error('Access Key ID wajib');
      return;
    }
    if (!sesSettings.secret_access_key?.trim() && !sesHadExisting) {
      toast.error('Secret Access Key wajib untuk tetapan baru');
      return;
    }
    setSesSaving(true);
    try {
      await api.post('/api/settings/ses', {
        access_key_id: sesSettings.access_key_id.trim(),
        secret_access_key: sesSettings.secret_access_key || undefined,
        region: (sesSettings.region || 'ap-southeast-1').trim(),
        sender_email: sesSettings.sender_email?.trim() || undefined,
      });
      toast.success('Tetapan AWS SES disimpan. E-mel akan guna tetapan ini (prioriti tertinggi).');
      setSesSettings(prev => ({ ...prev, secret_access_key: '' }));
      fetchEmailStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan tetapan SES');
    } finally {
      setSesSaving(false);
    }
  };

  const handleDeleteSes = async () => {
    if (!window.confirm('Padam tetapan AWS SES? E-mel akan guna Resend/SMTP atau mod dev.')) return;
    try {
      await api.delete('/api/settings/ses');
      toast.success('Tetapan AWS SES dipadam');
      setSesHadExisting(false);
      setSesSettings({ access_key_id: '', secret_access_key: '', region: 'ap-southeast-1', sender_email: '' });
      fetchEmailStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam');
    }
  };

  const handleSavePwa = async () => {
    if (!pwaSettings.name?.trim()) {
      toast.error('Nama aplikasi wajib');
      return;
    }
    setPwaSaving(true);
    try {
      await api.post('/api/settings/pwa', {
        name: pwaSettings.name.trim(),
        short_name: (pwaSettings.short_name || pwaSettings.name).trim(),
        theme_color: pwaSettings.theme_color || '#0f766e',
        background_color: pwaSettings.background_color || '#ffffff',
        description: pwaSettings.description?.trim() || null,
        page_title: pwaSettings.page_title?.trim() || null,
        app_base_url: pwaSettings.app_base_url?.trim() || null,
        pwa_version: pwaSettings.pwa_version?.trim() || null,
        gcm_sender_id: pwaSettings.gcm_sender_id?.trim() || null,
        icon_192_url: pwaSettings.icon_192_url?.trim() || '/icons/icon-192x192.png',
        icon_512_url: pwaSettings.icon_512_url?.trim() || '/icons/icon-512x512.png',
        splash_title: pwaSettings.splash_title?.trim() || null,
        splash_tagline: pwaSettings.splash_tagline?.trim() || null,
        splash_image_url: pwaSettings.splash_image_url?.trim() || null
      });
      toast.success('Tetapan Smart 360 AI Edition PWA berjaya disimpan');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan tetapan Smart 360 AI Edition');
    } finally {
      setPwaSaving(false);
    }
  };

  const handlePwaIconUpload = async (file) => {
    if (!file || !file.type?.startsWith('image/')) {
      toast.error('Sila pilih fail gambar (JPG, PNG atau WebP)');
      return;
    }
    setPwaIconUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/upload/app-icon', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data?.url;
      if (url) {
        setPwaSettings(prev => ({
          ...prev,
          icon_192_url: url,
          icon_512_url: url
        }));
        toast.success('Logo ikon rasmi berjaya dimuat naik. Klik Simpan untuk kekal.');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memuat naik logo ikon');
    } finally {
      setPwaIconUploading(false);
    }
  };

  const handleSaveOnboarding = async () => {
    setOnboardingSaving(true);
    try {
      const slides = (onboardingSettings.slides || []).map((s, i) => ({
        order: typeof s.order === 'number' ? s.order : i,
        title: (s.title || '').trim(),
        subtitle: (s.subtitle || '').trim(),
        image_url: (s.image_url || '').trim() || null
      }));
      await api.post('/api/settings/onboarding', { slides });
      toast.success('Tetapan onboarding berjaya disimpan');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan tetapan onboarding');
    } finally {
      setOnboardingSaving(false);
    }
  };

  const handleLandingHeroUpload = async (file) => {
    if (!file || !file.type?.startsWith('image/')) {
      toast.error('Sila pilih fail gambar (JPG, PNG atau WebP)');
      return;
    }
    setLandingUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/upload/landing-hero', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data?.url;
      if (url) {
        setLandingSettings(prev => ({ ...prev, hero_image_url: url }));
        await api.post('/api/settings/landing', { hero_image_url: url });
        toast.success('Gambar hero berjaya dimuat naik dan disimpan.');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memuat naik gambar hero');
    } finally {
      setLandingUploading(false);
    }
  };

  const handleSavePortal = async () => {
    setPortalSaving(true);
    try {
      await api.post('/api/settings/portal', {
        portal_title: portalSettings.portal_title || 'SMART360: Ai Edition',
        institution_name: portalSettings.institution_name || 'MRSMKU'
      });
      toast.success('Tetapan portal berjaya disimpan');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan tetapan portal');
    } finally {
      setPortalSaving(false);
    }
  };

  const handleSaveLanding = async () => {
    setLandingSaving(true);
    try {
      await api.post('/api/settings/landing', { hero_image_url: (landingSettings.hero_image_url || '').trim() || null });
      toast.success('Tetapan halaman landing berjaya disimpan');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan tetapan landing');
    } finally {
      setLandingSaving(false);
    }
  };

  const handleOnboardingSlideUpload = async (slideIndex, file) => {
    if (!file || !file.type?.startsWith('image/')) {
      toast.error('Sila pilih fail gambar (JPG, PNG atau WebP)');
      return;
    }
    setOnboardingUploadingSlideIndex(slideIndex);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/upload/onboarding-slide', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data?.url;
      if (url) {
        const slides = [...(onboardingSettings.slides || [])];
        while (slides.length <= slideIndex) slides.push({ order: slides.length, title: '', subtitle: '', image_url: '' });
        slides[slideIndex] = { ...slides[slideIndex], order: slideIndex, image_url: url };
        setOnboardingSettings({ slides });
        toast.success('Gambar slide berjaya dimuat naik');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memuat naik gambar');
    } finally {
      setOnboardingUploadingSlideIndex(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="settings-page">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 font-heading">Tetapan Sistem</h1>
        <p className="text-slate-600 mt-1">Konfigurasi integrasi dan tetapan sistem</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('mydigitalid')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'mydigitalid' ? 'bg-gradient-to-r from-red-500 via-blue-500 to-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          data-testid="tab-mydigitalid"
        >
          <span className="flex items-center gap-2"><Fingerprint size={16} /> MyDigital ID</span>
        </button>
        <button
          onClick={() => setActiveTab('email')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'email' ? 'bg-gradient-to-r from-teal-500 to-violet-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          data-testid="tab-email"
        >
          <span className="flex items-center gap-2"><Mail size={16} /> Email (Resend)</span>
        </button>
        <button
          onClick={() => setActiveTab('ses')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'ses' ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          data-testid="tab-ses"
        >
          <span className="flex items-center gap-2"><Cloud size={16} /> E-mel / SES</span>
        </button>
        <button
          onClick={() => setActiveTab('bus')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'bus' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          data-testid="tab-bus"
        >
          <span className="flex items-center gap-2"><Bus size={16} /> Tiket Bas</span>
        </button>
        <button
          onClick={() => setActiveTab('pelajar')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'pelajar' ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          data-testid="tab-pelajar"
        >
          <span className="flex items-center gap-2"><Users size={16} /> Data Pelajar</span>
        </button>
        <button
          onClick={() => setActiveTab('modules')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'modules' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          data-testid="tab-modules"
        >
          <span className="flex items-center gap-2"><Power size={16} /> Modul On/Off</span>
        </button>
        <button
          onClick={() => setActiveTab('asrama')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'asrama' ? 'bg-gradient-to-r from-teal-500 to-violet-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          data-testid="tab-asrama"
        >
          <span className="flex items-center gap-2"><Building size={16} /> Asrama</span>
        </button>
        <button
          onClick={() => setActiveTab('pwa')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'pwa' ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          data-testid="tab-pwa"
        >
          <span className="flex items-center gap-2"><Smartphone size={16} /> Smart 360 AI Edition</span>
        </button>
        <button
          onClick={() => setActiveTab('landing')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'landing' ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          data-testid="tab-landing"
        >
          <span className="flex items-center gap-2"><Globe size={16} /> Landing</span>
        </button>
        <button
          onClick={() => setActiveTab('onboarding')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'onboarding' ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          data-testid="tab-onboarding"
        >
          <span className="flex items-center gap-2"><LayoutList size={16} /> Onboarding</span>
        </button>
        <button
          onClick={() => setActiveTab('portal')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'portal' ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          data-testid="tab-portal"
        >
          <span className="flex items-center gap-2"><Building size={16} /> Portal / MRSM</span>
        </button>
      </div>

      {/* MyDigital ID Tab */}
      {activeTab === 'mydigitalid' && (
        <Card>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-red-100 via-blue-100 to-amber-100 rounded-xl flex items-center justify-center">
              <Fingerprint className="text-blue-600" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <span className="text-red-600">my</span>
                <span className="text-blue-600">digital</span>
                <span className="text-amber-500">ID</span>
                {isEnabled && <Badge status="active">Aktif</Badge>}
              </h3>
              <p className="text-sm text-slate-500">Konfigurasi integrasi MyDigital ID untuk log masuk</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-dashed border-slate-300">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Import JSON (Tampal konfigurasi)
              </label>
              <textarea
                className="w-full h-24 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder='{"action": "AUTH_INFO", "url": "wss://...", "nonce": "..."}'
                onChange={handleJsonPaste}
                data-testid="settings-json-import"
              />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <Input 
                label="Action" 
                value={myDigitalIDSettings.action} 
                onChange={(e) => setMyDigitalIDSettings({ ...myDigitalIDSettings, action: e.target.value })}
                placeholder="AUTH_INFO"
                data-testid="settings-action"
              />
              <div className="md:col-span-2">
                <Input 
                  label="WebSocket URL" 
                  value={myDigitalIDSettings.url} 
                  onChange={(e) => setMyDigitalIDSettings({ ...myDigitalIDSettings, url: e.target.value })}
                  placeholder="wss://sso.digital-id.my/wss/mydigitalid"
                  data-testid="settings-url"
                />
              </div>
            </div>
            <Input 
              label="Nonce" 
              value={myDigitalIDSettings.nonce} 
              onChange={(e) => setMyDigitalIDSettings({ ...myDigitalIDSettings, nonce: e.target.value })}
              placeholder="ujZQJIVslFQOkerbQABVh"
              data-testid="settings-nonce"
            />

            {(myDigitalIDSettings.action || myDigitalIDSettings.url || myDigitalIDSettings.nonce) && (
              <div className="p-3 bg-slate-100 rounded-lg">
                <p className="text-xs font-medium text-slate-600 mb-1">Konfigurasi Semasa:</p>
                <code className="text-xs text-slate-700 break-all">
                  {JSON.stringify(myDigitalIDSettings, null, 2)}
                </code>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button 
                onClick={handleSaveMyDigitalID} 
                loading={saving}
                disabled={!myDigitalIDSettings.action || !myDigitalIDSettings.url || !myDigitalIDSettings.nonce}
                data-testid="settings-save"
              >
                <Save size={18} /> Simpan Tetapan
              </Button>
              {isEnabled && (
                <Button variant="danger" onClick={handleDeleteMyDigitalID} disabled={saving} data-testid="settings-delete">
                  <Trash2 size={18} /> Padam
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Email Tab */}
      {activeTab === 'email' && (
        <Card>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-pastel-lavender rounded-xl flex items-center justify-center">
              <Mail className="text-violet-600" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                Tetapan Email (Resend)
                {emailEnabled && <Badge status="active">Aktif</Badge>}
              </h3>
              <p className="text-sm text-slate-500">Konfigurasi integrasi Resend untuk notifikasi email</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-pastel-lavender/60 rounded-lg border border-pastel-lilac">
              <p className="text-sm text-violet-800">
                <strong>Cara mendapatkan API Key Resend:</strong>
              </p>
              <ol className="text-sm text-violet-700 mt-2 list-decimal list-inside space-y-1">
                <li>Daftar akaun di <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">resend.com</a></li>
                <li>Pergi ke bahagian <strong>API Keys</strong></li>
                <li>Klik <strong>Create API Key</strong></li>
                <li>Salin API Key (bermula dengan <code className="bg-white px-1 rounded">re_</code>)</li>
              </ol>
            </div>

            <Input 
              label="API Key Resend" 
              type="password"
              value={emailSettings.api_key} 
              onChange={(e) => setEmailSettings({ ...emailSettings, api_key: e.target.value })}
              placeholder={emailEnabled ? "••••••••••••••••••" : "re_xxxxxxxxxx..."}
              data-testid="email-api-key"
            />
            {emailEnabled && (
              <p className="text-xs text-slate-500 -mt-2">
                API Key sudah dikonfigurasi. Kosongkan untuk mengekalkan API Key sedia ada atau masukkan yang baru untuk dikemaskini.
              </p>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <Input 
                label="Email Pengirim" 
                type="email"
                value={emailSettings.sender_email} 
                onChange={(e) => setEmailSettings({ ...emailSettings, sender_email: e.target.value })}
                placeholder="noreply@mrsmku.edu.my"
                data-testid="email-sender"
              />
              <Input 
                label="Nama Pengirim" 
                value={emailSettings.sender_name} 
                onChange={(e) => setEmailSettings({ ...emailSettings, sender_name: e.target.value })}
                placeholder="SMART360: Ai Edition"
                data-testid="email-sender-name"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button 
                onClick={handleSaveEmail} 
                loading={saving}
                disabled={(!emailSettings.api_key && !emailEnabled) || !emailSettings.sender_email}
                data-testid="email-save"
              >
                <Save size={18} /> Simpan Tetapan Email
              </Button>
              {emailEnabled && (
                <Button variant="danger" onClick={handleDeleteEmail} disabled={saving} data-testid="email-delete">
                  <Trash2 size={18} /> Padam
                </Button>
              )}
            </div>

            {/* Test Email Section */}
            {emailEnabled && (
              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium text-slate-900 mb-3">Hantar Email Ujian</h4>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input 
                      type="email"
                      value={testEmail} 
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="email.penerima@contoh.com"
                      data-testid="email-test-recipient"
                    />
                  </div>
                  <Button 
                    onClick={handleSendTestEmail} 
                    loading={sendingTest}
                    disabled={!testEmail}
                    variant="secondary"
                    data-testid="email-test-send"
                  >
                    <Send size={18} /> Hantar Ujian
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* E-mel / SES Tab */}
      {activeTab === 'ses' && (
        <Card>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-100 to-orange-100 rounded-xl flex items-center justify-center">
              <Cloud className="text-orange-600" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                E-mel / AWS SES
              </h3>
              <p className="text-sm text-slate-500">Status penyedia e-mel dan konfigurasi SES untuk production (AWS)</p>
            </div>
          </div>

          {emailStatusLoading ? (
            <div className="flex items-center justify-center py-8"><Spinner size="lg" /></div>
          ) : (
            <div className="space-y-6">
              {/* Status cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`p-4 rounded-xl border-2 ${emailStatus.ses_enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Cloud size={20} className={emailStatus.ses_enabled ? 'text-emerald-600' : 'text-slate-400'} />
                    <span className="font-medium text-slate-800">AWS SES</span>
                  </div>
                  <p className="text-sm text-slate-600">{emailStatus.ses_enabled ? 'Aktif (env)' : 'Tidak dikonfigurasi'}</p>
                  {emailStatus.ses_enabled && <Badge status="active">Aktif</Badge>}
                </div>
                <div className={`p-4 rounded-xl border-2 ${emailStatus.resend_enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Mail size={20} className={emailStatus.resend_enabled ? 'text-emerald-600' : 'text-slate-400'} />
                    <span className="font-medium text-slate-800">Resend</span>
                  </div>
                  <p className="text-sm text-slate-600">{emailStatus.resend_enabled ? 'Aktif' : 'Tidak dikonfigurasi'}</p>
                  {emailStatus.resend_enabled && <Badge status="active">Aktif</Badge>}
                </div>
                <div className={`p-4 rounded-xl border-2 ${emailStatus.smtp_enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Send size={20} className={emailStatus.smtp_enabled ? 'text-emerald-600' : 'text-slate-400'} />
                    <span className="font-medium text-slate-800">SMTP</span>
                  </div>
                  <p className="text-sm text-slate-600">{emailStatus.smtp_enabled ? 'Aktif (Mailtrap/MailHog/Gmail)' : 'Tidak dikonfigurasi'}</p>
                  {emailStatus.smtp_enabled && <Badge status="active">Aktif</Badge>}
                </div>
                <div className={`p-4 rounded-xl border-2 ${emailStatus.dev_mode ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle size={20} className={emailStatus.dev_mode ? 'text-amber-600' : 'text-slate-400'} />
                    <span className="font-medium text-slate-800">Mod Dev</span>
                  </div>
                  <p className="text-sm text-slate-600">{emailStatus.dev_mode ? 'Log ke konsol' : 'Tidak aktif'}</p>
                  {emailStatus.dev_mode && <Badge status="warning">Localhost</Badge>}
                </div>
              </div>

              <p className="text-sm text-slate-600">{emailStatus.message}</p>

              {/* Tetapan AWS SES — simpan dalam sistem (sama seperti SMTP) */}
              <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200 shadow-sm">
                <h4 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
                  <Cloud size={20} className="text-amber-600" />
                  Tetapan AWS SES (simpan dalam sistem)
                </h4>
                <p className="text-sm text-slate-600 mb-4">
                  Konfigurasi Amazon Simple Email Service untuk production. Tetapan disimpan dalam pangkalan data dan disegerakkan dengan penghantaran e-mel. Alamat pengirim mesti disahkan dalam AWS SES Console.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Access Key ID"
                    value={sesSettings.access_key_id}
                    onChange={(e) => setSesSettings(prev => ({ ...prev, access_key_id: e.target.value }))}
                    placeholder="AKIA..."
                  />
                  <Input
                    label="Secret Access Key"
                    type="password"
                    value={sesSettings.secret_access_key}
                    onChange={(e) => setSesSettings(prev => ({ ...prev, secret_access_key: e.target.value }))}
                    placeholder={sesHadExisting ? 'Kosongkan untuk kekal' : 'Rahsia IAM'}
                  />
                  <Input
                    label="Region"
                    value={sesSettings.region}
                    onChange={(e) => setSesSettings(prev => ({ ...prev, region: e.target.value }))}
                    placeholder="ap-southeast-1"
                  />
                  <Input
                    label="E-mel pengirim (verified dalam SES)"
                    type="email"
                    value={sesSettings.sender_email}
                    onChange={(e) => setSesSettings(prev => ({ ...prev, sender_email: e.target.value }))}
                    placeholder="noreply@domain.com"
                  />
                </div>
                <div className="flex flex-wrap gap-3 mt-4">
                  <Button onClick={handleSaveSes} loading={sesSaving} disabled={!sesSettings.access_key_id?.trim()}>
                    <Save size={18} /> Simpan Tetapan SES
                  </Button>
                  {sesHadExisting && (
                    <Button variant="danger" onClick={handleDeleteSes} disabled={sesSaving}>
                      <Trash2 size={18} /> Padam Tetapan
                    </Button>
                  )}
                  <Button variant="ghost" onClick={fetchSesSettings} disabled={sesSaving}>
                    <RefreshCw size={18} /> Muat Semula
                  </Button>
                </div>
              </div>

              {/* Tetapan SMTP — simpan dalam sistem (user-friendly) */}
              <div className="p-5 bg-pastel-sky/50 rounded-2xl border-2 border-pastel-sky shadow-sm">
                <h4 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
                  <Send size={20} className="text-blue-600" />
                  Tetapan SMTP (simpan dalam sistem)
                </h4>
                <p className="text-sm text-slate-600 mb-4">
                  Konfigurasi SMTP untuk localhost atau server (Mailtrap, MailHog, Gmail). Tetapan disimpan dalam pangkalan data dan disegerakkan dengan penghantaran e-mel.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Host SMTP"
                    value={smtpSettings.host}
                    onChange={(e) => setSmtpSettings(prev => ({ ...prev, host: e.target.value }))}
                    placeholder="cth. sandbox.smtp.mailtrap.io atau localhost"
                  />
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Port</label>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={smtpSettings.port}
                      onChange={(e) => setSmtpSettings(prev => ({ ...prev, port: parseInt(e.target.value, 10) || 587 }))}
                      className="flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-700"
                    />
                  </div>
                  <Input
                    label="Nama pengguna"
                    value={smtpSettings.user}
                    onChange={(e) => setSmtpSettings(prev => ({ ...prev, user: e.target.value }))}
                    placeholder="User SMTP"
                  />
                  <Input
                    label="Kata laluan"
                    type="password"
                    value={smtpSettings.password}
                    onChange={(e) => setSmtpSettings(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={smtpHadExisting ? 'Kosongkan untuk kekal' : 'Kata laluan SMTP'}
                  />
                  <div className="md:col-span-2">
                    <Input
                      label="E-mel pengirim (pilihan)"
                      type="email"
                      value={smtpSettings.sender_email}
                      onChange={(e) => setSmtpSettings(prev => ({ ...prev, sender_email: e.target.value }))}
                      placeholder="noreply@contoh.com"
                    />
                  </div>
                  <div className="flex items-center gap-2 md:col-span-2">
                    <input
                      type="checkbox"
                      id="smtp-use-tls"
                      checked={smtpSettings.use_tls}
                      onChange={(e) => setSmtpSettings(prev => ({ ...prev, use_tls: e.target.checked }))}
                      className="rounded border-slate-300 text-primary-700 focus:ring-primary-700"
                    />
                    <label htmlFor="smtp-use-tls" className="text-sm font-medium text-slate-700">Gunakan TLS (disyorkan untuk port 587)</label>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 mt-4">
                  <Button onClick={handleSaveSmtp} loading={smtpSaving} disabled={!smtpSettings.host?.trim() || !smtpSettings.user?.trim()}>
                    <Save size={18} /> Simpan Tetapan SMTP
                  </Button>
                  {smtpHadExisting && (
                    <Button variant="danger" onClick={handleDeleteSmtp} disabled={smtpSaving}>
                      <Trash2 size={18} /> Padam Tetapan
                    </Button>
                  )}
                  <Button variant="ghost" onClick={fetchSmtpSettings} disabled={smtpSaving}>
                    <RefreshCw size={18} /> Muat Semula
                  </Button>
                </div>
              </div>

              {/* Rujukan env (ringkas) */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-500">
                  <strong>Alternatif:</strong> SES melalui env: <code className="bg-white px-1 rounded">AWS_ACCESS_KEY_ID</code>, <code className="bg-white px-1 rounded">AWS_SECRET_ACCESS_KEY</code>, <code className="bg-white px-1 rounded">AWS_REGION</code>, <code className="bg-white px-1 rounded">SENDER_EMAIL</code>. SMTP: <code className="bg-white px-1 rounded">SMTP_HOST</code>, <code className="bg-white px-1 rounded">SMTP_USER</code>, <code className="bg-white px-1 rounded">SMTP_PASSWORD</code>. Prioriti: SES (tetapan atau env) → Resend → SMTP (tetapan atau env) → mod dev.
                </p>
              </div>

              {/* Hantar e-mel ujian */}
              <div className="border-t border-slate-200 pt-4">
                <h4 className="font-medium text-slate-900 mb-3">Hantar E-mel Ujian</h4>
                <p className="text-sm text-slate-500 mb-3">Guna template &quot;E-mel Ujian&quot; — dihantar melalui SES, Resend, atau mod dev mengikut konfigurasi semasa.</p>
                <div className="flex gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <Input
                      type="email"
                      value={sesTestEmail}
                      onChange={(e) => setSesTestEmail(e.target.value)}
                      placeholder="email.penerima@contoh.com"
                    />
                  </div>
                  <Button
                    onClick={handleSesTestSend}
                    loading={sesTestSending}
                    disabled={!sesTestEmail?.trim()}
                    variant="secondary"
                  >
                    <Send size={18} /> Hantar Ujian
                  </Button>
                  <Button variant="ghost" onClick={fetchEmailStatus} disabled={emailStatusLoading}>
                    <RefreshCw size={18} /> Muat Semula Status
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Bus Booking Settings Tab */}
      {activeTab === 'bus' && (
        <Card>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-100 to-blue-100 rounded-xl flex items-center justify-center">
              <Bus className="text-cyan-600" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                Tetapan Tiket Bas
                {busBookingSettings.require_leave_approval && <Badge status="warning">Perlu Kelulusan</Badge>}
              </h3>
              <p className="text-sm text-slate-500">Konfigurasi keperluan pembelian tiket bas</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Toggle Setting */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-slate-900">Perlu Kelulusan Pulang Bermalam</h4>
                  <p className="text-sm text-slate-600 mt-1">
                    Jika diaktifkan, ibu bapa atau pelajar perlu mendapatkan kelulusan pulang bermalam 
                    daripada warden sebelum boleh membeli tiket bas.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={busBookingSettings.require_leave_approval}
                    onChange={(e) => setBusBookingSettings({ ...busBookingSettings, require_leave_approval: e.target.checked })}
                    className="sr-only peer"
                    data-testid="bus-require-approval-toggle"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                </label>
              </div>
            </div>

            {/* Info box based on setting */}
            <div className={`p-4 rounded-xl ${busBookingSettings.require_leave_approval ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
              <div className="flex items-start gap-3">
                <AlertCircle className={busBookingSettings.require_leave_approval ? 'text-amber-600' : 'text-emerald-600'} size={20} />
                <div>
                  <h4 className={`font-medium ${busBookingSettings.require_leave_approval ? 'text-amber-800' : 'text-emerald-800'}`}>
                    {busBookingSettings.require_leave_approval ? 'Mod Ketat' : 'Mod Bebas'}
                  </h4>
                  <p className={`text-sm mt-1 ${busBookingSettings.require_leave_approval ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {busBookingSettings.require_leave_approval 
                      ? 'Ibu bapa perlu mohon kelulusan pulang bermalam dahulu sebelum boleh beli tiket bas. Warden perlu meluluskan permohonan.'
                      : 'Ibu bapa boleh beli tiket bas terus tanpa perlu kelulusan pulang bermalam.'
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={async () => {
                  setSaving(true);
                  try {
                    await api.post('/api/settings/bus-booking', busBookingSettings);
                    toast.success('Tetapan tiket bas disimpan!');
                  } catch (err) {
                    toast.error(err.response?.data?.detail || 'Gagal menyimpan tetapan');
                  } finally {
                    setSaving(false);
                  }
                }}
                loading={saving}
                data-testid="bus-settings-save"
              >
                <Save size={18} /> Simpan Tetapan
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Data Pelajar Tab */}
      {activeTab === 'pelajar' && (
        <div className="space-y-6">
          {/* Kelas Section */}
          <Card>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-pastel-sky rounded-xl flex items-center justify-center">
                <GraduationCap className="text-blue-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Senarai Kelas</h3>
                <p className="text-sm text-slate-500">Lookup untuk field Kelas pelajar. Disegerakkan dengan semua data pelajar (Tambah/Edit Anak, Daftar, Admin Pelajar).</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {systemConfig.kelas.map((kelas, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  Kelas {kelas}
                  <button 
                    onClick={() => setSystemConfig(prev => ({...prev, kelas: prev.kelas.filter((_, i) => i !== idx)}))}
                    className="ml-1 hover:bg-blue-200 rounded-full p-0.5"
                    data-testid={`remove-kelas-${idx}`}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={newKelas}
                onChange={(e) => setNewKelas(e.target.value.toUpperCase())}
                placeholder="Tambah kelas baru (cth: G)"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="new-kelas-input"
                maxLength={10}
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (newKelas && !systemConfig.kelas.includes(newKelas)) {
                    setSystemConfig(prev => ({...prev, kelas: [...prev.kelas, newKelas]}));
                    setNewKelas('');
                  }
                }}
                disabled={!newKelas || systemConfig.kelas.includes(newKelas)}
                data-testid="add-kelas-btn"
              >
                <Plus size={18} /> Tambah
              </Button>
            </div>
          </Card>

          {/* Bangsa Section */}
          <Card>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-pastel-lavender rounded-xl flex items-center justify-center">
                <Globe className="text-violet-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Senarai Bangsa</h3>
                <p className="text-sm text-slate-500">Urus jenis bangsa/etnik pelajar</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {systemConfig.bangsa.map((bangsa, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 px-3 py-1.5 bg-pastel-lavender text-violet-800 rounded-full text-sm font-medium">
                  {bangsa}
                  <button 
                    onClick={() => setSystemConfig(prev => ({...prev, bangsa: prev.bangsa.filter((_, i) => i !== idx)}))}
                    className="ml-1 hover:bg-pastel-lilac rounded-full p-0.5"
                    data-testid={`remove-bangsa-${idx}`}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={newBangsa}
                onChange={(e) => setNewBangsa(e.target.value)}
                placeholder="Tambah bangsa baru (cth: Orang Asli)"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                data-testid="new-bangsa-input"
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (newBangsa && !systemConfig.bangsa.includes(newBangsa)) {
                    setSystemConfig(prev => ({...prev, bangsa: [...prev.bangsa, newBangsa]}));
                    setNewBangsa('');
                  }
                }}
                disabled={!newBangsa || systemConfig.bangsa.includes(newBangsa)}
                data-testid="add-bangsa-btn"
              >
                <Plus size={18} /> Tambah
              </Button>
            </div>
          </Card>

          {/* Agama Section */}
          <Card>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-xl flex items-center justify-center">
                <Moon className="text-emerald-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Senarai Agama</h3>
                <p className="text-sm text-slate-500">Urus jenis agama pelajar</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {systemConfig.agama.map((agama, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium">
                  {agama}
                  <button 
                    onClick={() => setSystemConfig(prev => ({...prev, agama: prev.agama.filter((_, i) => i !== idx)}))}
                    className="ml-1 hover:bg-emerald-200 rounded-full p-0.5"
                    data-testid={`remove-agama-${idx}`}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={newAgama}
                onChange={(e) => setNewAgama(e.target.value)}
                placeholder="Tambah agama baru"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                data-testid="new-agama-input"
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (newAgama && !systemConfig.agama.includes(newAgama)) {
                    setSystemConfig(prev => ({...prev, agama: [...prev.agama, newAgama]}));
                    setNewAgama('');
                  }
                }}
                disabled={!newAgama || systemConfig.agama.includes(newAgama)}
                data-testid="add-agama-btn"
              >
                <Plus size={18} /> Tambah
              </Button>
            </div>
          </Card>

          {/* Negeri Management */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-pastel-lavender rounded-lg">
                <Globe className="text-violet-600" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Senarai Negeri</h3>
                <p className="text-sm text-slate-500">Urus senarai negeri Malaysia</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {systemConfig.negeri.map((negeri, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 px-3 py-1.5 bg-pastel-lavender text-violet-800 rounded-full text-sm font-medium">
                  {negeri}
                  <button 
                    onClick={() => setSystemConfig(prev => ({...prev, negeri: prev.negeri.filter((_, i) => i !== idx)}))}
                    className="ml-1 hover:bg-pastel-lilac rounded-full p-0.5"
                    data-testid={`remove-negeri-${idx}`}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={newNegeri}
                onChange={(e) => setNewNegeri(e.target.value)}
                placeholder="Tambah negeri baru"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                data-testid="new-negeri-input"
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (newNegeri && !systemConfig.negeri.includes(newNegeri)) {
                    setSystemConfig(prev => ({...prev, negeri: [...prev.negeri, newNegeri]}));
                    setNewNegeri('');
                  }
                }}
                disabled={!newNegeri || systemConfig.negeri.includes(newNegeri)}
                data-testid="add-negeri-btn"
              >
                <Plus size={18} /> Tambah
              </Button>
            </div>
          </Card>

          {/* Save & Sync Buttons */}
          <Card className="bg-slate-50">
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                onClick={async () => {
                  setSaving(true);
                  try {
                    await api.post('/api/settings/system-config', systemConfig);
                    toast.success('Konfigurasi data pelajar berjaya disimpan!');
                  } catch (err) {
                    toast.error(err.response?.data?.detail || 'Gagal menyimpan konfigurasi');
                  } finally {
                    setSaving(false);
                  }
                }}
                loading={saving}
                data-testid="save-system-config"
              >
                <Save size={18} /> Simpan Konfigurasi
              </Button>
              
              <Button 
                variant="secondary"
                onClick={async () => {
                  if (!window.confirm('Sinkronisasi akan kemaskini semua pelajar yang mempunyai data tidak sah kepada nilai pertama dalam senarai. Teruskan?')) return;
                  setSyncing(true);
                  try {
                    const res = await api.post('/api/settings/system-config/sync');
                    toast.success(`Sinkronisasi selesai! Kelas: ${res.data.stats.kelas_updated}, Bangsa: ${res.data.stats.bangsa_updated}, Agama: ${res.data.stats.agama_updated}, Negeri: ${res.data.stats.negeri_updated}`);
                  } catch (err) {
                    toast.error(err.response?.data?.detail || 'Gagal melakukan sinkronisasi');
                  } finally {
                    setSyncing(false);
                  }
                }}
                loading={syncing}
                data-testid="sync-system-config"
              >
                <RefreshCw size={18} /> Sinkronkan ke Database
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              * Sinkronisasi akan kemaskini semua pelajar yang mempunyai kelas/bangsa/agama/negeri yang tidak sah kepada nilai pertama dalam senarai.
            </p>
          </Card>
        </div>
      )}

      {/* Module On/Off Tab */}
      {activeTab === 'modules' && (
        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-red-100 rounded-xl flex items-center justify-center">
                <Power className="text-orange-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Pengurusan Modul Sistem</h3>
                <p className="text-sm text-slate-500">Modul terkini dari sistem. Setiap modul boleh dihidupkan (On) atau dimatikan (Off) mengikut keperluan maktab.</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(moduleSettings).map(([key, module]) => (
                <div 
                  key={key}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    module.enabled 
                      ? 'border-emerald-200 bg-emerald-50' 
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-slate-900">{module.name}</h4>
                    <button
                      onClick={() => setModuleSettings(prev => ({
                        ...prev,
                        [key]: { ...prev[key], enabled: !prev[key].enabled }
                      }))}
                      className={`relative w-12 h-6 rounded-full transition-all ${
                        module.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                      data-testid={`toggle-${key}`}
                    >
                      <span 
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                          module.enabled ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">{module.description}</p>
                  <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                    module.enabled 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {module.enabled ? 'On' : 'Off'}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-6 pt-6 border-t">
              <Button
                onClick={async () => {
                  setSavingModules(true);
                  try {
                    await api.post('/api/settings/modules', { modules: moduleSettings });
                    toast.success('Tetapan modul berjaya disimpan. Sila refresh halaman untuk melihat perubahan menu.');
                  } catch (err) {
                    toast.error(err.response?.data?.detail || 'Gagal menyimpan tetapan modul');
                  } finally {
                    setSavingModules(false);
                  }
                }}
                loading={savingModules}
                data-testid="save-modules"
              >
                <Save size={18} /> Simpan Tetapan Modul
              </Button>
            </div>

            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex gap-2">
                <AlertCircle className="text-amber-600 flex-shrink-0" size={18} />
                <div className="text-sm text-amber-800">
                  <strong>Nota:</strong> Modul yang dimatikan (Off) tidak akan muncul dalam menu navigasi untuk semua pengguna.
                  Data sedia ada tidak dipadam—hanya akses kepada modul tersebut yang dihalang. Perakaunan tidak akan melaporkan pendapatan daripada modul Koperasi atau Marketplace jika modul tersebut dimatikan.
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Asrama (Blok Asrama) Tab - sync dengan pelajar/anak */}
      {activeTab === 'asrama' && (
        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-pastel-lavender rounded-xl flex items-center justify-center">
                <Building className="text-violet-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Blok Asrama</h3>
                <p className="text-sm text-slate-500">Urus blok asrama lelaki dan perempuan. Disegerakkan dengan data pelajar (blok).</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Button onClick={() => openAsramaModal()} data-testid="asrama-add-btn">
                <Plus size={18} /> Tambah Blok
              </Button>
              {user?.role === 'superadmin' && (
                <Button variant="outline" onClick={handleSeedAsrama} loading={seedLoading} data-testid="asrama-seed-btn">
                  <RefreshCw size={18} /> Seed Data Default
                </Button>
              )}
            </div>
            {asramaLoading ? (
              <div className="py-12 flex justify-center"><Spinner size="lg" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600 text-left">
                      <th className="py-2 pr-4">Kod</th>
                      <th className="py-2 pr-4">Nama</th>
                      <th className="py-2 pr-4">Jantina</th>
                    <th className="py-2 pr-4">Tingkat</th>
                    <th className="py-2 pr-4">Katil (per tingkat)</th>
                    <th className="py-2 pr-4">Pelajar</th>
                    <th className="py-2 pr-4">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                    {asramaBlocks.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-slate-500">Tiada blok. Klik Tambah Blok atau Seed Data Default.</td></tr>
                    ) : (
                      asramaBlocks.map((b) => (
                        <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 pr-4 font-medium">{b.code}</td>
                          <td className="py-2 pr-4">{b.name}</td>
                          <td className="py-2 pr-4">{b.gender_display || b.gender}</td>
                          <td className="py-2 pr-4">{(b.levels || []).join(', ') || '-'}</td>
                          <td className="py-2 pr-4 text-slate-600">{formatBedsPerLevel(b.beds_per_level)}</td>
                          <td className="py-2 pr-4">{b.student_count ?? 0}</td>
                          <td className="py-2 pr-4">
                            <div className="flex gap-2">
                              <button type="button" onClick={() => openAsramaModal(b)} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded" title="Edit"><Edit size={16} /></button>
                              <button type="button" onClick={() => handleAsramaDelete(b)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Padam"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Smart 360 AI Edition PWA Tab */}
      {activeTab === 'pwa' && (
        <Card>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-100 to-emerald-100 rounded-xl flex items-center justify-center">
              <Smartphone className="text-teal-600" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Smart 360 AI Edition PWA</h3>
              <p className="text-sm text-slate-500">Nama aplikasi, warna tema, ikon dan notifikasi (Add to Home Screen)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Input
                label="Nama Aplikasi *"
                value={pwaSettings.name}
                onChange={(e) => setPwaSettings(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Smart 360 AI Edition"
              />
              <Input
                label="Nama Pendek (Home Screen)"
                value={pwaSettings.short_name}
                onChange={(e) => setPwaSettings(prev => ({ ...prev, short_name: e.target.value }))}
                placeholder="Smart 360 AI Edition"
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Warna Tema</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={pwaSettings.theme_color}
                    onChange={(e) => setPwaSettings(prev => ({ ...prev, theme_color: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                    title="Pilih warna"
                  />
                  <input
                    type="text"
                    value={pwaSettings.theme_color}
                    onChange={(e) => setPwaSettings(prev => ({ ...prev, theme_color: e.target.value }))}
                    className="flex-1 h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                    placeholder="#0f766e"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Warna Latar Belakang</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={pwaSettings.background_color}
                    onChange={(e) => setPwaSettings(prev => ({ ...prev, background_color: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                    title="Pilih warna"
                  />
                  <input
                    type="text"
                    value={pwaSettings.background_color}
                    onChange={(e) => setPwaSettings(prev => ({ ...prev, background_color: e.target.value }))}
                    className="flex-1 h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                    placeholder="#ffffff"
                  />
                </div>
              </div>
              <Input
                label="Penerangan (optional)"
                value={pwaSettings.description}
                onChange={(e) => setPwaSettings(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Sistem Pengurusan Maktab Bersepadu"
              />
              <Input
                label="Tajuk halaman (tab browser)"
                value={pwaSettings.page_title}
                onChange={(e) => setPwaSettings(prev => ({ ...prev, page_title: e.target.value }))}
                placeholder="Smart 360 AI Edition - Portal MRSM"
              />
              <div>
                <Input
                  label="URL asas aplikasi (optional)"
                  value={pwaSettings.app_base_url}
                  onChange={(e) => setPwaSettings(prev => ({ ...prev, app_base_url: e.target.value }))}
                  placeholder="https://portal.mrsm.edu.my"
                />
                <p className="text-xs text-slate-500 mt-1">Guna bila API dan frontend berbeza domain; manifest akan guna URL penuh untuk ikon dan start_url.</p>
              </div>
            </div>
            <div className="space-y-4">
              <Input
                label="Versi PWA (optional)"
                value={pwaSettings.pwa_version}
                onChange={(e) => setPwaSettings(prev => ({ ...prev, pwa_version: e.target.value }))}
                placeholder="1.0.0"
              />
              <Input
                label="GCM Sender ID (FCM, optional)"
                value={pwaSettings.gcm_sender_id}
                onChange={(e) => setPwaSettings(prev => ({ ...prev, gcm_sender_id: e.target.value }))}
                placeholder="Nombor projek Firebase"
              />
              {/* Logo / Ikon rasmi - muat naik untuk Splash & PWA */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                  <ImageIcon size={18} className="text-teal-600" /> Logo / Ikon rasmi
                </h4>
                <p className="text-sm text-slate-500">Ikon ini dipaparkan pada skrin splash dan ikon PWA (Add to Home Screen). Muat naik untuk kemas kini.</p>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-slate-200 bg-white flex-shrink-0">
                    {(pwaSettings.icon_512_url || pwaSettings.icon_192_url) ? (
                      <img
                        src={(() => {
                          const url = pwaSettings.icon_512_url || pwaSettings.icon_192_url;
                          if (url.startsWith('http')) return url;
                          const base = (url.startsWith('/api/') && API_URL) ? API_URL.replace(/\/$/, '') : (typeof window !== 'undefined' ? window.location.origin : '');
                          return base + (url.startsWith('/') ? url : '/' + url);
                        })()}
                        alt="Ikon rasmi"
                        className="w-full h-full object-contain"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400"><ImageIcon size={24} /></div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      className="hidden"
                      id="pwa-app-icon-file"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePwaIconUpload(f);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={pwaIconUploading}
                      disabled={pwaIconUploading}
                      onClick={() => document.getElementById('pwa-app-icon-file')?.click()}
                    >
                      <Upload size={16} /> Muat naik logo / ikon
                    </Button>
                    <span className="text-xs text-slate-500">JPG, PNG atau WebP (maks 2MB). Akan kemas kini ikon 192 & 512.</span>
                  </div>
                </div>
              </div>
              <Input
                label="URL Ikon 192×192"
                value={pwaSettings.icon_192_url}
                onChange={(e) => setPwaSettings(prev => ({ ...prev, icon_192_url: e.target.value }))}
                placeholder="/icons/icon-192x192.png"
              />
              <Input
                label="URL Ikon 512×512"
                value={pwaSettings.icon_512_url}
                onChange={(e) => setPwaSettings(prev => ({ ...prev, icon_512_url: e.target.value }))}
                placeholder="/icons/icon-512x512.png"
              />
              <div className="pt-2 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                <p className="text-xs text-slate-600 mb-2">Pratonton tema</p>
                <div
                  className="h-14 rounded-lg flex items-center justify-center text-white font-medium text-sm shadow-inner"
                  style={{ backgroundColor: pwaSettings.theme_color }}
                >
                  {pwaSettings.short_name || pwaSettings.name || 'Smart 360 AI Edition'}
                </div>
              </div>
            </div>
          </div>

          {/* Splash Screen - boleh diubah Superadmin/Admin */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <h4 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
              <ImageIcon size={18} className="text-indigo-600" /> Splash Screen
            </h4>
            <p className="text-sm text-slate-500 mb-4">Tajuk, tagline dan gambar yang dipaparkan semasa aplikasi loading. Kosongkan untuk guna nilai default.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Tajuk splash"
                value={pwaSettings.splash_title}
                onChange={(e) => setPwaSettings(prev => ({ ...prev, splash_title: e.target.value }))}
                placeholder="Smart 360 AI Edition"
              />
              <Input
                label="Tagline (teks di bawah tajuk)"
                value={pwaSettings.splash_tagline}
                onChange={(e) => setPwaSettings(prev => ({ ...prev, splash_tagline: e.target.value }))}
                placeholder="Sistem Pengurusan Maktab Bersepadu"
              />
              <div className="md:col-span-2">
                <Input
                  label="URL gambar splash (optional)"
                  value={pwaSettings.splash_image_url}
                  onChange={(e) => setPwaSettings(prev => ({ ...prev, splash_image_url: e.target.value }))}
                  placeholder="/images/splash-hero.webp atau URL penuh"
                />
                <p className="text-xs text-slate-500 mt-1">Kosongkan untuk guna gambar default. Boleh muat naik gambar di modul lain dan paste URL di sini.</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6 pt-6 border-t border-slate-200">
            <Button onClick={handleSavePwa} loading={pwaSaving} data-testid="save-pwa">
              <Save size={18} /> Simpan Tetapan Smart 360 AI Edition
            </Button>
          </div>
        </Card>
      )}

      {/* Landing Tab - hero image halaman landing */}
      {activeTab === 'landing' && (
        <Card>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-sky-100 to-blue-100 rounded-xl flex items-center justify-center">
              <Globe className="text-sky-600" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Halaman Landing</h3>
              <p className="text-sm text-slate-500">Gambar hero yang dipaparkan di halaman utama (belum log masuk). Logo rasmi sistem diedit dalam tab Smart 360 AI Edition.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <ImageIcon size={18} className="text-sky-600" /> Gambar Hero
              </h4>
              <p className="text-sm text-slate-500 mb-3">Paparkan imej rasmi (contoh: papan tanda MRSMKU, bangunan) pada bahagian hero landing page.</p>
              <div className="flex flex-wrap items-start gap-4">
                <div className="w-40 h-28 rounded-lg overflow-hidden border-2 border-slate-200 bg-white flex-shrink-0">
                  {(landingSettings.hero_image_url) ? (
                    <img
                      src={landingSettings.hero_image_url.startsWith('http') ? landingSettings.hero_image_url : `${api.defaults.baseURL || window.location.origin}${landingSettings.hero_image_url.startsWith('/') ? landingSettings.hero_image_url : '/' + landingSettings.hero_image_url}`}
                      alt="Hero"
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400"><ImageIcon size={32} /></div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    className="hidden"
                    id="landing-hero-file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLandingHeroUpload(f);
                      e.target.value = '';
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" loading={landingUploading} disabled={landingUploading} onClick={() => document.getElementById('landing-hero-file')?.click()}>
                    <Upload size={16} /> Muat naik gambar hero
                  </Button>
                  <span className="text-xs text-slate-500">JPG, PNG atau WebP (maks 5MB). Gambar disimpan terus selepas muat naik.</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-6 pt-6 border-t border-slate-200">
            <Button onClick={handleSaveLanding} loading={landingSaving} data-testid="save-landing">
              <Save size={18} /> Simpan Tetapan Landing
            </Button>
          </div>
        </Card>
      )}

      {/* Onboarding Tab - slide pertama kali buka app, database driven */}
      {activeTab === 'onboarding' && (
        <Card>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl flex items-center justify-center">
              <LayoutList className="text-indigo-600" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Onboarding</h3>
              <p className="text-sm text-slate-500">Edit slide yang dipaparkan ketika pengguna pertama kali buka aplikasi. Tajuk, keterangan dan URL gambar setiap slide.</p>
            </div>
          </div>
          <div className="space-y-6">
            {[0, 1, 2, 3].map((idx) => {
              const slide = (onboardingSettings.slides || [])[idx] || { order: idx, title: '', subtitle: '', image_url: '' };
              return (
              <div key={slide.order ?? idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <h4 className="font-medium text-slate-800 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm">{idx + 1}</span>
                  Slide {idx + 1}
                </h4>
                <Input
                  label="Tajuk"
                  value={slide.title || ''}
                  onChange={(e) => {
                    const slides = [...(onboardingSettings.slides || [])];
                    while (slides.length <= idx) slides.push({ order: slides.length, title: '', subtitle: '', image_url: '' });
                    slides[idx] = { ...slides[idx], order: idx, title: e.target.value };
                    setOnboardingSettings({ slides });
                  }}
                  placeholder="Contoh: Selamat datang ke Smart 360 AI Edition"
                />
                <Input
                  label="Keterangan (subtitle)"
                  value={slide.subtitle || ''}
                  onChange={(e) => {
                    const slides = [...(onboardingSettings.slides || [])];
                    while (slides.length <= idx) slides.push({ order: slides.length, title: '', subtitle: '', image_url: '' });
                    slides[idx] = { ...slides[idx], order: idx, subtitle: e.target.value };
                    setOnboardingSettings({ slides });
                  }}
                  placeholder="Contoh: Satu platform pengurusan Maktab yang pintar."
                />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Gambar slide</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      className="hidden"
                      id={`onboarding-slide-file-${idx}`}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleOnboardingSlideUpload(idx, f);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={onboardingUploadingSlideIndex === idx}
                      disabled={onboardingUploadingSlideIndex !== null}
                      onClick={() => document.getElementById(`onboarding-slide-file-${idx}`)?.click()}
                    >
                      <Upload size={16} /> Muat naik gambar
                    </Button>
                    <span className="text-xs text-slate-500">JPG, PNG atau WebP (maks 5MB)</span>
                  </div>
                </div>
                <Input
                  label="URL gambar (atau paste URL selepas muat naik)"
                  value={slide.image_url || ''}
                  onChange={(e) => {
                    const slides = [...(onboardingSettings.slides || [])];
                    while (slides.length <= idx) slides.push({ order: slides.length, title: '', subtitle: '', image_url: '' });
                    slides[idx] = { ...slides[idx], order: idx, image_url: e.target.value };
                    setOnboardingSettings({ slides });
                  }}
                  placeholder="/images/onboarding/onboarding-1-welcome.png atau /api/upload/images/onboarding/..."
                />
              </div>
            ); })}
          </div>
          <div className="flex gap-3 mt-6 pt-6 border-t border-slate-200">
            <Button onClick={handleSaveOnboarding} loading={onboardingSaving} data-testid="save-onboarding">
              <Save size={18} /> Simpan Tetapan Onboarding
            </Button>
          </div>
        </Card>
      )}

      {/* Portal / MRSM Tab - tajuk portal & nama institusi untuk kegunaan pelbagai MRSM */}
      {activeTab === 'portal' && (
        <Card>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-100 to-emerald-100 rounded-xl flex items-center justify-center">
              <Building className="text-teal-600" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Portal & Nama Institusi</h3>
              <p className="text-sm text-slate-500">Sesuaikan tajuk portal dan nama institusi (MRSM) supaya sistem boleh digunakan oleh pelbagai MRSM. Tajuk dipaparkan di header; nama institusi digunakan dalam teks seperti &quot;di MRSMKU&quot;, &quot;Pembantu AI MRSMKU&quot;.</p>
            </div>
          </div>
          <div className="space-y-4 max-w-xl">
            <Input
              label="Tajuk portal (paparan di header)"
              value={portalSettings.portal_title || ''}
              onChange={(e) => setPortalSettings(prev => ({ ...prev, portal_title: e.target.value }))}
              placeholder="SMART360: Ai Edition"
            />
            <Input
              label="Nama institusi (MRSM)"
              value={portalSettings.institution_name || ''}
              onChange={(e) => setPortalSettings(prev => ({ ...prev, institution_name: e.target.value }))}
              placeholder="MRSMKU, MRSM Kuantan, MRSM Besut, dll."
            />
          </div>
          <div className="flex gap-3 mt-6 pt-6 border-t border-slate-200">
            <Button onClick={handleSavePortal} loading={portalSaving} data-testid="save-portal">
              <Save size={18} /> Simpan Tetapan Portal
            </Button>
          </div>
        </Card>
      )}

      {/* Modal Tambah/Edit Blok Asrama */}
      {asramaModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={closeAsramaModal}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl overflow-x-hidden min-w-0" onClick={e => e.stopPropagation()}>
            <div className="p-6 pb-2 flex-shrink-0">
              <h3 className="text-lg font-semibold text-slate-900">{asramaEditing ? 'Edit Blok Asrama' : 'Tambah Blok Asrama'}</h3>
            </div>
            <form onSubmit={handleAsramaSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="px-6 pb-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              <Input
                label="Kod Blok *"
                value={asramaForm.code}
                onChange={(e) => setAsramaForm({ ...asramaForm, code: e.target.value.toUpperCase() })}
                placeholder="JA, JB, I, H, dll"
                maxLength={10}
                required
                disabled={!!asramaEditing}
              />
              <Input
                label="Nama Blok *"
                value={asramaForm.name}
                onChange={(e) => setAsramaForm({ ...asramaForm, name: e.target.value })}
                placeholder="Asrama JA"
                required
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jantina *</label>
                <select
                  value={asramaForm.gender}
                  onChange={(e) => setAsramaForm({ ...asramaForm, gender: e.target.value })}
                  className="w-full h-11 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="lelaki">Lelaki</option>
                  <option value="perempuan">Perempuan</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tingkat (pilih atau tambah)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {DEFAULT_LEVELS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => {
                        const levels = asramaForm.levels.includes(l)
                          ? asramaForm.levels.filter(x => x !== l)
                          : [...asramaForm.levels, l];
                        const idx = asramaForm.levels.indexOf(l);
                        const config = [...(asramaForm.room_config_per_level || [])];
                        const defaultBeds = asramaForm.beds_per_room != null && asramaForm.beds_per_room !== '' ? parseInt(String(asramaForm.beds_per_room), 10) : 2;
                        const newSeg = { rooms: 0, beds_per_room: isNaN(defaultBeds) || defaultBeds < 1 ? 2 : Math.min(20, defaultBeds) };
                        if (levels.length > asramaForm.levels.length) config.push([newSeg]);
                        else if (idx >= 0) config.splice(idx, 1);
                        setAsramaForm({ ...asramaForm, levels, room_config_per_level: config });
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${asramaForm.levels.includes(l) ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Tingkat lain (tekan Enter)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const v = e.target.value.trim();
                      if (v && !asramaForm.levels.includes(v)) {
                        const defaultBeds = asramaForm.beds_per_room != null && asramaForm.beds_per_room !== '' ? parseInt(String(asramaForm.beds_per_room), 10) : 2;
                        const newSeg = { rooms: 0, beds_per_room: isNaN(defaultBeds) || defaultBeds < 1 ? 2 : Math.min(20, defaultBeds) };
                        setAsramaForm({ ...asramaForm, levels: [...asramaForm.levels, v], room_config_per_level: [...(asramaForm.room_config_per_level || []), [newSeg]] });
                        e.target.value = '';
                      }
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Katil per bilik (pilihan)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={asramaForm.beds_per_room ?? ''}
                  onChange={(e) => setAsramaForm({ ...asramaForm, beds_per_room: e.target.value })}
                  placeholder="cth. 2"
                  className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
                <span className="text-xs text-slate-500 ml-2">Untuk laporan bilik kosong &amp; kiraan bilik per tingkat</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tingkat &amp; jenis bilik</label>
                <p className="text-xs text-slate-500 mb-2">Klik baris tingkat untuk edit. Semua tingkat dipaparkan di bawah; scroll jika banyak.</p>
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50 max-h-[40vh] overflow-y-auto">
                  {(asramaForm.levels || []).length === 0 && (
                    <p className="text-sm text-slate-400 p-3">Klik &quot;Tambah tingkat&quot; untuk mula.</p>
                  )}
                  {(asramaForm.levels || []).map((levelName, levelIdx) => {
                    const segments = Array.isArray(asramaForm.room_config_per_level?.[levelIdx]) ? asramaForm.room_config_per_level[levelIdx] : [{ rooms: 0, beds_per_room: 2 }];
                    const levelTotal = totalBedsForLevelSegments(segments);
                    const summary = formatSegmentSummary(segments);
                    const isExpanded = asramaExpandedLevelIndex === levelIdx;
                    return (
                      <div key={`level-${levelIdx}`} className="border-b border-slate-200 last:border-b-0 bg-white">
                        <div
                          className="flex items-center gap-2 py-2 px-3 hover:bg-slate-50 cursor-pointer"
                          onClick={() => setAsramaExpandedLevelIndex(isExpanded ? null : levelIdx)}
                        >
                          <span className="flex-shrink-0 text-slate-400">
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </span>
                          <span className="font-medium text-slate-800 min-w-[6rem] truncate">{levelName || `Tingkat ${levelIdx + 1}`}</span>
                          <span className="text-xs text-slate-500 truncate flex-1">{summary}</span>
                          <span className="text-xs font-medium text-slate-600 flex-shrink-0">{levelTotal} katil</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const levels = (asramaForm.levels || []).filter((_, i) => i !== levelIdx);
                              const config = (asramaForm.room_config_per_level || []).filter((_, i) => i !== levelIdx);
                              setAsramaForm({ ...asramaForm, levels, room_config_per_level: config });
                              if (asramaExpandedLevelIndex === levelIdx) setAsramaExpandedLevelIndex(null);
                              else if (asramaExpandedLevelIndex > levelIdx) setAsramaExpandedLevelIndex(asramaExpandedLevelIndex - 1);
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded flex-shrink-0"
                            title="Padam tingkat"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 border-t border-slate-100 bg-slate-50/80 space-y-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={levelName}
                              onChange={(e) => {
                                const levels = [...(asramaForm.levels || [])];
                                levels[levelIdx] = e.target.value.trim() || levels[levelIdx];
                                setAsramaForm({ ...asramaForm, levels });
                              }}
                              placeholder="Nama tingkat"
                              className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                            />
                            {segments.map((seg, segIdx) => (
                              <div key={`seg-${levelIdx}-${segIdx}`} className="flex items-center gap-2 flex-wrap">
                                <input
                                  type="number"
                                  min={0}
                                  max={999}
                                  placeholder="bilik"
                                  value={seg.rooms ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                    const r = isNaN(val) ? 0 : Math.max(0, Math.min(999, val));
                                    const newConfig = asramaForm.room_config_per_level.map((lev, i) =>
                                      i === levelIdx ? segments.map((s, j) => (j === segIdx ? { ...s, rooms: r } : s)) : lev
                                    );
                                    setAsramaForm({ ...asramaForm, room_config_per_level: newConfig });
                                  }}
                                  className="w-14 px-2 py-1.5 border border-slate-200 rounded text-sm"
                                />
                                <span className="text-xs text-slate-500">bilik ×</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  placeholder="katil"
                                  value={seg.beds_per_room}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 2 : parseInt(e.target.value, 10);
                                    const b = isNaN(val) ? 2 : Math.max(1, Math.min(20, val));
                                    const newConfig = asramaForm.room_config_per_level.map((lev, i) =>
                                      i === levelIdx ? segments.map((s, j) => (j === segIdx ? { ...s, beds_per_room: b } : s)) : lev
                                    );
                                    setAsramaForm({ ...asramaForm, room_config_per_level: newConfig });
                                  }}
                                  className="w-14 px-2 py-1.5 border border-slate-200 rounded text-sm"
                                />
                                <span className="text-xs text-slate-500">katil</span>
                                {segments.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newSegments = segments.filter((_, j) => j !== segIdx);
                                      const newConfig = asramaForm.room_config_per_level.map((lev, i) =>
                                        i === levelIdx ? (newSegments.length ? newSegments : [{ rooms: 0, beds_per_room: 2 }]) : lev
                                      );
                                      setAsramaForm({ ...asramaForm, room_config_per_level: newConfig });
                                    }}
                                    className="p-1 text-slate-400 hover:text-red-600 rounded"
                                    title="Padam baris"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const defaultBeds = asramaForm.beds_per_room != null && asramaForm.beds_per_room !== '' ? parseInt(String(asramaForm.beds_per_room), 10) : 2;
                                const newSegments = [...segments, { rooms: 0, beds_per_room: isNaN(defaultBeds) || defaultBeds < 1 ? 2 : Math.min(20, defaultBeds) }];
                                const newConfig = asramaForm.room_config_per_level.map((lev, i) => (i === levelIdx ? newSegments : lev));
                                setAsramaForm({ ...asramaForm, room_config_per_level: newConfig });
                              }}
                              className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                            >
                              + Tambah jenis bilik
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const n = (asramaForm.levels || []).length + 1;
                      const defaultBeds = asramaForm.beds_per_room != null && asramaForm.beds_per_room !== '' ? parseInt(String(asramaForm.beds_per_room), 10) : 2;
                      const newSeg = { rooms: 0, beds_per_room: isNaN(defaultBeds) || defaultBeds < 1 ? 2 : Math.min(20, defaultBeds) };
                      setAsramaForm({
                        ...asramaForm,
                        levels: [...(asramaForm.levels || []), `Tingkat ${n}`],
                        room_config_per_level: [...(asramaForm.room_config_per_level || []), [newSeg]],
                      });
                      setAsramaExpandedLevelIndex((asramaForm.levels || []).length);
                    }}
                    className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
                  >
                    <Plus size={16} /> Tambah tingkat
                  </button>
                  {(asramaForm.levels || []).length > 0 && (() => {
                    const bedsPerLevel = segmentsToBedsPerLevel(asramaForm.room_config_per_level || []);
                    const totalBeds = bedsPerLevel.reduce((a, b) => a + b, 0);
                    const totalRooms = (asramaForm.room_config_per_level || []).reduce(
                      (sum, segs) => sum + (Array.isArray(segs) ? segs.reduce((s, seg) => s + (Number(seg?.rooms) || 0), 0) : 0),
                      0
                    );
                    if (totalBeds > 0) {
                      return (
                        <span className="text-sm text-slate-600">
                          Jumlah: <strong>{(asramaForm.levels || []).length}</strong> tingkat, <strong>{totalRooms}</strong> bilik, <strong>{totalBeds}</strong> katil
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
              </div>
              <div className="flex gap-2 p-6 pt-4 border-t border-slate-100 flex-shrink-0 bg-white">
                <Button type="button" variant="ghost" onClick={closeAsramaModal} className="flex-1">Batal</Button>
                <Button type="submit" loading={asramaSaving} className="flex-1" data-testid="asrama-save-btn">Simpan</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Info Card - hidden on Landing, Onboarding and Portal tabs */}
      {!['landing', 'onboarding', 'portal'].includes(activeTab) && (
      <Card className="bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <AlertCircle className="text-blue-600 flex-shrink-0" size={20} />
          <div>
            <h4 className="font-medium text-blue-800">Nota Penting</h4>
            <p className="text-sm text-blue-700 mt-1">
              {activeTab === 'mydigitalid' ? (
                <>
                  MyDigital ID adalah sistem pengesahan identiti digital kebangsaan Malaysia. 
                  Tetapan ini membolehkan pengguna log masuk menggunakan aplikasi MyDigital ID.
                  <br/><br/>
                  <strong>Status semasa:</strong> Integrasi ini adalah <span className="font-bold">MOCKED</span> untuk tujuan demonstrasi.
                </>
              ) : activeTab === 'email' ? (
                <>
                  Resend adalah perkhidmatan penghantaran email yang menyediakan API mudah untuk menghantar email transaksional.
                  <br/><br/>
                  <strong>Jenis notifikasi yang disokong:</strong>
                  <ul className="list-disc list-inside mt-2">
                    <li>Peringatan yuran tertunggak</li>
                    <li>Pengesahan pembayaran</li>
                    <li>Pengesahan tempahan bas</li>
                  </ul>
                </>
              ) : activeTab === 'pelajar' ? (
                <>
                  Konfigurasikan senarai kelas, bangsa, dan agama yang boleh dipilih dalam borang pelajar.
                  <br/><br/>
                  <strong>Kelas:</strong> Nama kelas seperti A, B, C, D, E, F
                  <br/>
                  <strong>Bangsa:</strong> Etnik/bangsa pelajar seperti Melayu, Cina, India, dll.
                  <br/>
                  <strong>Agama:</strong> Kepercayaan agama pelajar
                  <br/><br/>
                  <strong>Sinkronisasi:</strong> Akan kemaskini semua pelajar yang mempunyai data tidak sah kepada pilihan pertama dalam senarai.
                </>
              ) : activeTab === 'modules' ? (
                <>
                  Modul On/Off membolehkan anda mengaktifkan atau menyahaktifkan modul tertentu dalam sistem.
                  <br/><br/>
                  <strong>Modul yang boleh dikawal:</strong>
                  <ul className="list-disc list-inside mt-2">
                    <li><strong>Tiket Bas</strong> - Tempahan tiket bas untuk pelajar</li>
                    <li><strong>Hostel</strong> - Pengurusan asrama dan bilik</li>
                    <li><strong>Koperasi</strong> - Kedai koperasi maktab</li>
                    <li><strong>Marketplace</strong> - Pasaran pelbagai vendor</li>
                    <li><strong>Bilik Sakit</strong> - Pengurusan rekod kesihatan</li>
                    <li><strong>Kenderaan</strong> - Keselamatan kenderaan (QR)</li>
                    <li><strong>Inventori</strong> - Inventori universal</li>
                    <li><strong>Aduan</strong> - Sistem aduan dan maklum balas</li>
                    <li><strong>AGM</strong> - Mesyuarat agung tahunan</li>
                  </ul>
                </>
              ) : activeTab === 'asrama' ? (
                <>
                  Blok asrama disegerakkan dengan field <strong>blok</strong> pelajar dan anak. Gunakan <strong>Kod</strong> (cth: JA, I) sebagai nilai blok pelajar untuk statistik betul.
                  <br/><br/>
                  <strong>SuperAdmin:</strong> Boleh tambah, edit, padam dan seed data default. <strong>Admin:</strong> Boleh tambah, edit dan padam. Warden boleh urus blok di menu Blok Asrama.
                </>
              ) : activeTab === 'pwa' ? (
                <>
                  Tetapan Smart 360 AI Edition PWA disimpan dalam pangkalan data dan boleh digunakan untuk manifest, tema dan notifikasi push.
                  <br/><br/>
                  <strong>Ikon:</strong> Muat naik fail <code>icon-192x192.png</code> dan <code>icon-512x512.png</code> ke folder <code>public/icons/</code> atau masukkan URL penuh. <strong>Warna tema</strong> digunakan pada bar status apabila aplikasi dipasang ke skrin utama.
                </>
              ) : (
                <>
                  Tetapan ini mengawal aliran pembelian tiket bas oleh ibu bapa dan pelajar.
                  <br/><br/>
                  <strong>Mod Ketat:</strong> Pelajar perlu mendapat kelulusan pulang bermalam daripada warden sebelum ibu bapa boleh membeli tiket bas.
                  <br/>
                  <strong>Mod Bebas:</strong> Ibu bapa boleh membeli tiket bas pada bila-bila masa tanpa kelulusan.
                </>
              )}
            </p>
          </div>
        </div>
      </Card>
      )}
    </div>
  );
};

export { SettingsPage };
export default SettingsPage;
