import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { OnlineStatusIndicator, SplashScreen, SyncStatus, useOfflineSync, PwaMetaUpdater } from './pwa';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import {
  Home, Users, CreditCard, Bell, LogOut, Menu, X,
  Check, AlertCircle, AlertTriangle, FileText, ChevronRight, Building,
  GraduationCap, DoorOpen, Calendar, Mail,
  BarChart3, TrendingUp, Wallet, Receipt, Shield,
  Car, Activity, BookOpen, Gift, Library,
  MessageCircle, Send, Bot, Sparkles, X as XIcon, Settings,
  Bus, Ticket, MapPinned, ChevronDown, ChevronUp, ShoppingCart, Package, ShoppingBag, Brain, QrCode, Store, Box, FolderTree, Calculator, CheckCircle, PieChart, Upload, UserCheck, HelpCircle
} from 'lucide-react';
import QRCode from 'react-qr-code';

// Import Cart Components
import { CartProvider } from './context/CartContext';
import { PortalConfigProvider, usePortalConfig } from './context/PortalConfigContext';
import { CartDrawer, CartIconButton } from './components/cart';

// Import refactored pages
import { LoginPage as NewLoginPage, RegisterPage as NewRegisterPage, ForgotPasswordPage as NewForgotPasswordPage, ResetPasswordPage as NewResetPasswordPage } from './pages/auth';
import { ParentDashboard as NewParentDashboard } from './pages/dashboard';
import { AdminDashboard as NewAdminDashboard } from './pages/admin';
import { BusTicketPage, KoperasiPage, NewPaymentCenterLayout } from './pages/modules';
import { LandingPage, PublicSedekahPage, PublicCampaignDetailPage, InstitutionRegistrationWizardPage } from './pages/public';
import { AnalyticsAIPage, BusAdminAnalyticsPage } from './pages/analytics';
import { AGMPage } from './pages/agm';
import { MyQRCodePage } from './pages/user';
import { WardenDashboard as NewWardenDashboard, WardenAnalyticsPage, WardenAsramaPage, WardenSchedulesPage, WardenPbwPbpPage, WardenARPage } from './pages/warden';
import { SickBayPage as NewSickBayPage } from './pages/sickbay';
import { GuardDashboard as NewGuardDashboard } from './pages/guard';
import { SuperAdminDashboard as NewSuperAdminDashboard, UserManagementPage as NewUserManagementPage, AuditLogPage as NewAuditLogPage, RBACConfigPage as NewRBACConfigPage, SettingsPage as NewSettingsPage, TenantOnboardingPage as NewTenantOnboardingPage } from './pages/superadmin';
import { SampleLayoutPage } from './pages/sample';
import { GuruDashboard as NewGuruDashboard, GuruClassDashboard as NewGuruClassDashboard, TeacherStudentsPage, TeacherFeesPage, GuruNotificationsPage } from './pages/guru';

// Import new modules
import { ComplaintsPage, AdminComplaintsPage } from './pages/complaints';
import { HostelBlocksPage, HostelDashboardPage } from './pages/hostel';
import {
  AdminBusManagementPage as NewAdminBusManagementPage,
  BusAdminDashboardPage,
  BusAdminCompaniesPage,
  BusAdminBusesPage,
  BusAdminRoutesPage,
  BusAdminTripsPage,
  BusAdminBookingsPage,
  BusAdminDriversPage,
} from './pages/admin/bus';
import BusCompanyRegisterPage from './pages/bus/BusCompanyRegisterPage';
import DriverBasDashboardPage from './pages/driver/DriverBasDashboardPage';
import DriverBasTripPage from './pages/driver/DriverBasTripPage';
import BusLiveMapPage from './pages/bus/BusLiveMapPage';
import { ChildrenPage as NewChildrenPage, ParentChildrenFeesPage as NewParentChildrenFeesPage, FeesPage as NewFeesPage, NotificationsPage as NewNotificationsPage, PaymentsPage as NewPaymentsPage, ParentWardenSchedulePage } from './pages/parent';
import ParentHostelPage from './pages/parent/ParentHostelPage';
import { FeePackageManagementPage as NewFeePackageManagementPage, AdminFeesPage as NewAdminFeesPage } from './pages/admin/fees';
import AdminTabungPageNew from './pages/admin/tabung/AdminTabungPageNew';
import CampaignFormPage from './pages/admin/tabung/CampaignFormPage';
import TabungPageNew from './pages/parent/tabung/TabungPageNew';
import PublicDonatePage from './pages/public/PublicDonatePage';
import FinancialDashboardPage from './pages/admin/FinancialDashboardPage';
import FinancialAnalyticsAIPage from './pages/admin/FinancialAnalyticsAIPage';
import ARDashboardPage from './pages/admin/ARDashboardPage';
import AROutstandingPage from './pages/admin/AROutstandingPage';
import ARNotificationReportPage from './pages/admin/ARNotificationReportPage';
import { AdminKoperasiPage as NewAdminKoperasiPage } from './pages/admin/koperasi';
import { AdminStudentsPage as NewAdminStudentsPage } from './pages/admin/students';
import { AdminReportsPage as NewAdminReportsPage } from './pages/admin/reports';
import { ChargesManagementPage, SetYuranManagementPage, StudentYuranListPage, YuranSettingsPage } from './pages/admin/yuran';
import ManualBendahariPage from './pages/admin/ManualBendahariPage';
import ManualBendahariFullPage from './pages/admin/ManualBendahariFullPage';
import KnowledgePage from './pages/admin/KnowledgePage';
import { StudentImportPage } from './pages/admin/student-import';
import { AdminChatboxFAQPage } from './pages/admin/chatbox';
import { GuruKelasManagement } from './pages/admin/GuruKelasManagement';
import DisciplinePage from './pages/admin/DisciplinePage';
import EmailTemplatesPage from './pages/admin/EmailTemplatesPage';
import BendahariEmailTemplatesPage from './pages/admin/BendahariEmailTemplatesPage';
import ClaimStudentPage from './pages/public/ClaimStudentPage';
import { ParentYuranDashboard } from './pages/parent/yuran';
import { PelajarDashboard as NewPelajarDashboard, PelajarHostelPage } from './pages/pelajar';
import { KoperasiOrdersPage as NewKoperasiOrdersPage } from './pages/koperasi';
import { UniversalInventoryPage } from './pages/inventory';
import CategoryManagementPage from './pages/admin/CategoryManagementPage';
import SmartDashboardPage from './pages/admin/SmartDashboardPage';
import { 
  AccountingDashboard,
  TransactionList,
  TransactionForm,
  TransactionDetail,
  VerificationPage,
  CategoryManager,
  MonthlyReport,
  AnnualReport,
  BankAccountsPage,
  BankReconciliationPage,
  FinancialYearPage,
  AGMReportsPage,
  ChartOfAccountsPage,
  ManualPerakaunanPage
} from './pages/admin/accounting';
import {
  AdminMarketplaceDashboard,
  VendorManagementPage,
  ProductManagementPage,
  MarketplaceSettingsPage,
  FinanceDashboardPage,
  PayoutManagementPage,
  AdsManagementPage,
  MonetizationStatsPage,
  SalesAnalyticsPage
} from './pages/admin/marketplace';
import {
  VendorDashboard,
  VendorRegisterPage,
  VendorProductsPage,
  VendorProductFormPage,
  VendorOrdersPage,
  VendorBundlesPage,
  VendorBundleFormPage,
  VendorWalletPage,
  VendorAdsPage,
  VendorSubscriptionPage,
  VendorBoostPage,
  VendorAnalyticsPage
} from './pages/vendor';
import NotificationCenter from './components/notifications/NotificationCenter';
import { OnboardingPage, getOnboardingCompleted } from './pages/onboarding';

import api, { API_URL } from './services/api';

// Auth Context
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Constants reserved for future use
// eslint-disable-next-line no-unused-vars
const MALAYSIAN_STATES = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya'];

const ROLES = {
  superadmin: { name: 'Super Admin', icon: Shield, color: 'bg-red-100 text-red-700' },
  admin: { name: 'Admin MRSMKU', icon: Users, color: 'bg-pastel-lavender text-violet-700' },
  bendahari: { name: 'Bendahari', icon: Wallet, color: 'bg-green-100 text-green-700' },
  sub_bendahari: { name: 'Sub Bendahari', icon: Wallet, color: 'bg-emerald-100 text-emerald-700' },
  guru_kelas: { name: 'Guru Kelas', icon: BookOpen, color: 'bg-blue-100 text-blue-700' },
  guru_homeroom: { name: 'Guru HomeRoom', icon: Home, color: 'bg-pastel-mint text-teal-700' },
  warden: { name: 'Warden', icon: Building, color: 'bg-orange-100 text-orange-700' },
  guard: { name: 'Pengawal', icon: Shield, color: 'bg-slate-100 text-slate-700' },
  bus_admin: { name: 'Admin Bas', icon: Bus, color: 'bg-cyan-100 text-cyan-700' },
  bus_driver: { name: 'Driver Bas', icon: Bus, color: 'bg-amber-100 text-amber-700' },
  koop_admin: { name: 'Admin Koperasi', icon: ShoppingCart, color: 'bg-lime-100 text-lime-700' },
  parent: { name: 'Ibu Bapa', icon: Users, color: 'bg-teal-100 text-teal-700' },
  pelajar: { name: 'Pelajar', icon: GraduationCap, color: 'bg-amber-100 text-amber-700' }
};

// eslint-disable-next-line no-unused-vars
const FEE_CATEGORIES = { yuran_pendaftaran: 'Yuran Pendaftaran', wang_caruman: 'Wang Caruman', muafakat: 'Muafakat', program_kecemerlangan: 'Program Kecemerlangan', koperasi: 'Koperasi', asrama: 'Asrama' };

// eslint-disable-next-line no-unused-vars
const DONATION_CATEGORIES = {
  tabung_pelajar: { name: 'Tabung Pelajar', icon: '🎓', color: 'from-blue-500 to-blue-600' },
  tabung_masjid: { name: 'Tabung Surau', icon: '🕌', color: 'from-green-500 to-green-600' },
  tabung_asrama: { name: 'Tabung Asrama', icon: '🏠', color: 'from-violet-500 to-fuchsia-500' },
  tabung_kecemasan: { name: 'Tabung Kecemasan', icon: '🆘', color: 'from-red-500 to-red-600' },
  tabung_anak_yatim: { name: 'Tabung Anak Yatim', icon: '💝', color: 'from-pink-500 to-pink-600' }
};

// ===================== COMPONENTS =====================

const Spinner = ({ size = 'md' }) => <div className={`spinner ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>;

// eslint-disable-next-line no-unused-vars
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

// eslint-disable-next-line no-unused-vars
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

// eslint-disable-next-line no-unused-vars
const Select = ({ label, error, children, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <select className={`flex h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-700 focus:ring-offset-2 ${error ? 'border-red-500' : 'border-slate-200'}`} {...props}>{children}</select>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Card = ({ children, className = '', hover = false, ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden ${hover ? 'card-hover cursor-pointer' : ''} ${className}`} {...props}>{children}</div>
);

// eslint-disable-next-line no-unused-vars
const Badge = ({ status, children }) => {
  const styles = { approved: 'bg-emerald-100 text-emerald-800', pending: 'bg-amber-100 text-amber-800', rejected: 'bg-red-100 text-red-800', paid: 'bg-emerald-100 text-emerald-800', partial: 'bg-blue-100 text-blue-800', overdue: 'bg-red-100 text-red-800', active: 'bg-emerald-100 text-emerald-800', inactive: 'bg-red-100 text-red-800' };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

// eslint-disable-next-line no-unused-vars
const StatCard = ({ icon: Icon, label, value, subtext, color = 'primary' }) => {
  const colors = { primary: 'bg-primary-100 text-primary-700', secondary: 'bg-amber-100 text-amber-700', success: 'bg-emerald-100 text-emerald-700', warning: 'bg-orange-100 text-orange-700', danger: 'bg-red-100 text-red-700' };
  return (
    <Card className="animate-fadeIn">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-heading">{value}</p>
          {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-lg ${colors[color]}`}><Icon size={24} /></div>
      </div>
    </Card>
  );
};

// eslint-disable-next-line no-unused-vars
const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }} aria-hidden="true">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`w-full flex-shrink-0 bg-white rounded-xl shadow-xl p-6 max-h-[90vh] overflow-y-auto overflow-x-hidden pointer-events-auto ${size === 'lg' ? 'max-w-2xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-lg'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 font-heading">{title}</h3>
              <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
            </div>
            {children}
          </motion.div>
        </div>
      </>
    )}
  </AnimatePresence>
);

// ===================== AI CHAT WIDGET =====================

const AI_CHAT_CLOSED_KEY = 'ai_chat_widget_closed';

const AIChatWidget = () => {
  const { user } = useAuth();
  const { institution_name } = usePortalConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [widgetClosed, setWidgetClosed] = useState(() => {
    try { return localStorage.getItem(AI_CHAT_CLOSED_KEY) === '1'; } catch { return false; }
  });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [chatTab, setChatTab] = useState('bebual'); // 'bebual' | 'faq'
  const [faqList, setFaqList] = useState([]);
  const [faqOpenIndex, setFaqOpenIndex] = useState(null);
  const messagesEndRef = React.useRef(null);

  useEffect(() => {
    if (isOpen && chatTab === 'faq' && faqList.length === 0) {
      api.get('/api/ai/faq')
        .then(res => setFaqList(res.data.faq || []))
        .catch(() => setFaqList([]));
    }
  }, [isOpen, chatTab, faqList.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    
    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Hantar sejarah perbualan (last 20 mesej) supaya AI boleh bebual dengan konteks
      const historyForApi = [...messages, userMsg].slice(-20).map(m => ({ role: m.role, content: m.content }));
      const res = await api.post('/api/ai/chat', {
        message: text,
        session_id: sessionId,
        history: historyForApi
      });
      setSessionId(res.data.session_id);
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
    } catch (err) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Maaf, saya menghadapi masalah. Sila cuba lagi. 🙏' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setSessionId(null);
  };

  // Nama untuk salam (full_name atau email)
  const displayName = user?.full_name || user?.email?.split('@')[0] || 'ibu bapa';

  // Render kandungan mesej AI: baris yang ada "tertunggak" dipaparkan warna merah
  const renderMessageContent = (content) => {
    if (!content) return null;
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      const hasTertunggak = /tertunggak/i.test(line);
      return (
        <span key={idx}>
          {hasTertunggak ? (
            <span className="text-red-600 font-medium">{line}</span>
          ) : (
            <span>{line}</span>
          )}
          {idx < lines.length - 1 ? '\n' : ''}
        </span>
      );
    });
  };

  // Posisi ikon chat (ibu bapa sahaja) - boleh alih dalam skrin, disimpan di localStorage
  const CHAT_BTN_SIZE = 56;
  const STORAGE_KEY = 'ai_chat_button_position';
  const getStoredPosition = () => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) {
        const p = JSON.parse(s);
        if (typeof p.x === 'number' && typeof p.y === 'number') return p;
      }
    } catch {}
    return null;
  };
  const [chatButtonPos, setChatButtonPos] = useState(getStoredPosition);
  const chatButtonRef = useRef(null);
  const chatSafeAreaRef = useRef(null);

  const clampChatPosition = (x, y) => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    const pad = 8;
    const mobileNav = window.innerWidth < 768 ? 88 : 0;
    return {
      x: Math.max(pad, Math.min(window.innerWidth - CHAT_BTN_SIZE - pad, x)),
      y: Math.max(pad, Math.min(window.innerHeight - CHAT_BTN_SIZE - pad - mobileNav, y)),
    };
  };

  const handleChatDragEnd = () => {
    if (!chatButtonRef.current) return;
    const r = chatButtonRef.current.getBoundingClientRect();
    const clamped = clampChatPosition(r.left, r.top);
    setChatButtonPos(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
    } catch {}
  };

  const closeWidget = () => {
    setIsOpen(false);
    setWidgetClosed(true);
    try { localStorage.setItem(AI_CHAT_CLOSED_KEY, '1'); } catch {}
  };

  const openWidget = () => {
    setWidgetClosed(false);
    try { localStorage.setItem(AI_CHAT_CLOSED_KEY, '0'); } catch {}
  };

  // Hanya untuk ibu bapa sahaja (parent role)
  if (!user || user.role !== 'parent') return null;

  // Widget ditutup oleh pengguna: tunjuk butang kecil untuk buka semula
  if (widgetClosed) {
    return (
      <motion.button
        type="button"
        onClick={openWidget}
        className="fixed bottom-24 right-6 z-50 px-4 py-2 rounded-full bg-primary-600 text-white text-sm font-medium shadow-lg hover:bg-primary-700"
        data-testid="ai-chat-reopen"
      >
        Buka Pembantu AI
      </motion.button>
    );
  }

  const buttonStyle = {
    boxShadow: isOpen
      ? '0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1)'
      : '0 16px 40px -12px rgba(220,38,38,0.5), 0 12px 24px -8px rgba(185,28,28,0.35), 0 0 0 1px rgba(0,0,0,0.06)',
    ...(chatButtonPos
      ? { left: chatButtonPos.x, top: chatButtonPos.y }
      : { right: 24, bottom: 24 }),
  };

  return (
    <>
      {/* Kawasan selamat seret: dalam skrin, elak bottom nav (mobile) */}
      <div
        ref={chatSafeAreaRef}
        className="fixed pointer-events-none z-0"
        style={{ top: 8, left: 8, right: 8, bottom: 96 }}
        aria-hidden
      />
      {/* Floating Button - ibu bapa boleh seret posisi dalam skrin sahaja; posisi disimpan */}
      <motion.button
        ref={chatButtonRef}
        onClick={() => setIsOpen(!isOpen)}
        drag
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={chatSafeAreaRef}
        onDragEnd={handleChatDragEnd}
        className="fixed z-50 w-14 h-14 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center text-white transition-colors hover:from-red-600 hover:to-red-700 cursor-grab active:cursor-grabbing touch-none"
        style={buttonStyle}
        animate={isOpen ? { scale: 1 } : { scale: [1, 1.06, 1] }}
        transition={
          isOpen
            ? { duration: 0.2 }
            : { repeat: Infinity, duration: 2.2, repeatType: 'reverse' }
        }
        whileHover={{ scale: isOpen ? 1 : 1.1 }}
        whileTap={{ scale: 0.95 }}
        data-testid="ai-chat-button"
      >
        {isOpen ? <XIcon size={24} /> : <MessageCircle size={24} />}
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-700 to-primary-900 p-4 text-white">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <Bot size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold">Pembantu AI {institution_name}</h3>
                    <p className="text-xs text-white/80 flex items-center gap-1">
                      <Sparkles size={12} />
                      Bebual dengan AI (Ibu bapa)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={startNewChat}
                      className="text-xs text-white/90 hover:text-white underline"
                    >
                      Mula baru
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeWidget}
                    className="text-xs text-white/90 hover:text-white underline"
                    title="Tutup Pembantu AI"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs: Bebual | FAQ */}
            <div className="flex border-b border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setChatTab('bebual')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${chatTab === 'bebual' ? 'text-primary-700 border-b-2 border-primary-700 bg-primary-50/50' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'}`}
              >
                <MessageCircle size={18} />
                Bebual
              </button>
              <button
                type="button"
                onClick={() => setChatTab('faq')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${chatTab === 'faq' ? 'text-primary-700 border-b-2 border-primary-700 bg-primary-50/50' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'}`}
              >
                <HelpCircle size={18} />
                FAQ
              </button>
            </div>

            {/* Content by tab */}
            {chatTab === 'faq' ? (
              <div className="h-80 overflow-y-auto bg-slate-50 p-3">
                <p className="text-xs text-slate-500 mb-3 px-1">Soalan lazim — klik untuk baca jawapan</p>
                {faqList.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">Memuatkan FAQ...</p>
                ) : (
                  <div className="space-y-2">
                    {faqList.map((item, idx) => (
                      <div key={idx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setFaqOpenIndex(faqOpenIndex === idx ? null : idx)}
                          className="w-full flex items-center justify-between text-left px-4 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors"
                        >
                          <span className="pr-2">{item.q}</span>
                          {faqOpenIndex === idx ? <ChevronUp size={18} className="flex-shrink-0 text-slate-500" /> : <ChevronDown size={18} className="flex-shrink-0 text-slate-500" />}
                        </button>
                        {faqOpenIndex === idx && (
                          <div className="px-4 pb-3 pt-0">
                            <p className="text-sm text-slate-600 whitespace-pre-wrap border-t border-slate-100 pt-3">{item.a}</p>
                            {item.attachments?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {item.attachments.map((att, i) => (
                                  <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium">
                                    📎 {att.original_name || 'Lampiran'}
                                  </a>
                                ))}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => { sendMessage(item.q); setChatTab('bebual'); setFaqOpenIndex(null); }}
                              className="mt-2 text-xs text-primary-600 hover:text-primary-800 font-medium"
                            >
                              Tanya dalam chat →
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
            <>
            {/* Messages */}
            <div className="h-80 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.length === 0 ? (
                <div className="text-center py-4">
                  <Bot className="mx-auto text-primary-300 mb-3" size={48} />
                  <p className="text-slate-600 mb-4">
                    Assalamualaikum dan selamat sejahtera, <strong>{displayName}</strong>! 👋<br/>
                    Saya boleh bantu anda.
                  </p>
                  <p className="text-sm text-slate-500">
                    Anda boleh rujuk ruangan <strong>FAQ</strong> di bahagian atas untuk tanya soalan lazim.
                  </p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-2xl ${
                        msg.role === 'user'
                          ? 'bg-primary-700 text-white rounded-br-sm'
                          : 'bg-white text-slate-700 rounded-bl-sm shadow-sm border border-slate-100'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.role === 'assistant' ? renderMessageContent(msg.content) : msg.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white p-3 rounded-2xl rounded-bl-sm shadow-sm border border-slate-100">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-white border-t border-slate-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Taip untuk bebual..."
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  disabled={loading}
                  data-testid="ai-chat-input"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={loading || !input.trim()}
                  className="w-10 h-10 bg-primary-700 text-white rounded-full flex items-center justify-center hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  data-testid="ai-chat-send"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
            </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// ===================== MYDIGITAL ID MODAL =====================

// eslint-disable-next-line no-unused-vars
const MyDigitalIDModal = ({ isOpen, onClose, onSuccess }) => {
  const [countdown, setCountdown] = useState(180); // 3 minutes
  const [status, setStatus] = useState('waiting'); // waiting, scanning, success, error
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (isOpen) {
      // Fetch MyDigital ID settings
      api.get('/api/settings/mydigitalid')
        .then(res => setSettings(res.data))
        .catch(() => setSettings({ enabled: false }));
      
      setCountdown(180);
      setStatus('waiting');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || status !== 'waiting') return;
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto login after 5 seconds for demo
    const autoLogin = setTimeout(() => {
      setStatus('scanning');
      setTimeout(() => {
        handleMockLogin();
      }, 2000);
    }, 5000);

    return () => {
      clearInterval(timer);
      clearTimeout(autoLogin);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, status]);

  const handleMockLogin = async () => {
    try {
      const res = await api.post('/api/auth/mydigitalid/mock-login');
      setStatus('success');
      setTimeout(() => {
        onSuccess(res.data);
      }, 1000);
    } catch (err) {
      setStatus('error');
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} MINIT ${secs.toString().padStart(2, '0')} SAAT`;
  };

  const qrValue = settings?.url 
    ? JSON.stringify({ action: settings.action, url: settings.url, nonce: settings.nonce })
    : 'https://mydigitalid.gov.my';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 bg-black/60 z-50" 
            onClick={onClose} 
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }} aria-hidden="true">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md flex-shrink-0 bg-white rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
            >
              {/* Header with MyDigital ID Logo */}
            <div className="bg-white pt-6 pb-4 text-center border-b">
              <div className="flex items-center justify-center gap-1 mb-2">
                <span className="text-2xl font-bold text-red-600">my</span>
                <span className="text-2xl font-bold text-blue-600">digital</span>
                <span className="text-2xl font-bold text-amber-500">ID</span>
              </div>
              <h2 className="text-lg font-bold text-slate-800">LOG MASUK</h2>
            </div>

            {/* Session Timer */}
            <div className="bg-amber-400 py-2 text-center">
              <p className="text-sm font-bold text-amber-900 italic">
                SESI AKAN TAMAT DALAM MASA
              </p>
              <p className="text-lg font-bold text-amber-900">
                {formatTime(countdown)}
              </p>
            </div>

            {/* Content */}
            <div className="p-6 text-center">
              {status === 'waiting' && (
                <>
                  <p className="text-slate-600 mb-4">
                    Imbas kod QR menggunakan<br/>
                    aplikasi MyDigital ID
                  </p>
                  
                  {/* QR Code */}
                  <div className="bg-slate-100 p-4 rounded-xl inline-block mb-4">
                    <QRCode 
                      value={qrValue}
                      size={200}
                      level="M"
                      data-testid="mydigitalid-qr"
                    />
                  </div>

                  <p className="text-xs text-slate-400 mb-4">
                    (Demo: Auto log masuk dalam 5 saat)
                  </p>
                </>
              )}

              {status === 'scanning' && (
                <div className="py-8">
                  <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-blue-600 font-medium">Mengesahkan identiti...</p>
                </div>
              )}

              {status === 'success' && (
                <div className="py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="text-green-600" size={32} />
                  </div>
                  <p className="text-green-600 font-medium">Pengesahan berjaya!</p>
                </div>
              )}

              {status === 'error' && (
                <div className="py-8">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="text-red-600" size={32} />
                  </div>
                  <p className="text-red-600 font-medium">Pengesahan gagal. Sila cuba lagi.</p>
                </div>
              )}

              {/* Cancel Button */}
              <button
                onClick={onClose}
                className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-full transition-colors"
                data-testid="mydigitalid-cancel"
              >
                Batal
              </button>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 py-4 text-center border-t">
              <p className="text-sm font-semibold text-slate-700">
                Lindungi Identiti Digital Anda
              </p>
              <p className="text-sm font-semibold text-slate-700">
                Dengan MyDigital ID
              </p>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};


// ===================== AUTH PAGES =====================
// NOTE: LoginPage, RegisterPage refactored to /pages/auth/
// NOTE: LandingPage, PublicSedekahPage, PublicCampaignDetailPage refactored to /pages/public/

// ===================== DASHBOARD LAYOUT =====================

const DashboardLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moduleSettings, setModuleSettings] = useState({});
  const [appIconUrl, setAppIconUrl] = useState('');
  const [appIconError, setAppIconError] = useState(false);
  const { user, logout } = useAuth();
  const { portal_title } = usePortalConfig();
  const navigate = useNavigate();
  const location = useLocation();

  // Ikon rasmi sistem (dari tetapan PWA)
  useEffect(() => {
    let cancelled = false;
    api.get('/api/public/settings/pwa')
      .then((res) => {
        if (cancelled || !res.data) return;
        const icon = res.data.icon_512_url || res.data.icon_192_url;
        if (icon) {
          const url = icon.startsWith('http') ? icon : `${(API_URL || '').replace(/\/$/, '')}${icon.startsWith('/') ? icon : '/' + icon}`;
          setAppIconUrl(url);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load module settings on mount
  useEffect(() => {
    const loadModuleSettings = async () => {
      try {
        const tenantCode = user?.tenant_code || '';
        const res = await api.get('/api/settings/modules', {
          params: tenantCode ? { tenant_code: tenantCode } : {},
        });
        const modules = res.data.modules || {};
        const enabledMap = {};
        Object.keys(modules).forEach(key => {
          enabledMap[key] = modules[key]?.enabled !== false;
        });
        setModuleSettings(enabledMap);
      } catch (err) {
        console.error('Failed to load module settings');
        // Default all enabled if error
        setModuleSettings({
          tiket_bas: true, hostel: true, koperasi: true, marketplace: true,
          sickbay: true, vehicle: true, inventory: true, complaints: true, agm: true
        });
      }
    };
    loadModuleSettings();
  }, [user?.tenant_code]);

  // Helper to check if module is enabled
  const isModuleEnabled = (moduleKey) => moduleSettings[moduleKey] !== false;

  // Pengelompokan menu mengikut modul (accordion)
  const SECTION_ORDER = ['utama', 'kewangan', 'pengguna', 'asrama', 'disiplin', 'pengangkutan', 'perdagangan', 'laporan', 'sokongan', 'sistem'];
  const SECTION_LABELS = {
    utama: 'Utama',
    kewangan: 'Kewangan & Perakaunan',
    pengguna: 'Pengguna & Pelajar',
    asrama: 'Asrama & Hostel',
    disiplin: 'Disiplin & Aduan',
    pengangkutan: 'Pengangkutan',
    perdagangan: 'Koperasi & Perdagangan',
    laporan: 'Laporan & Analitik',
    sokongan: 'Sokongan',
    sistem: 'Sistem & Tetapan',
  };
  const normalizeNavPath = (path) => String(path || '').split('#')[0];
  const pathToSection = (path) => {
    const normalizedPath = normalizeNavPath(path);
    if (!normalizedPath) return 'utama';
    if (normalizedPath === '/superadmin' || normalizedPath === '/admin' || normalizedPath === '/warden' || normalizedPath === '/guru' || normalizedPath === '/pelajar' || normalizedPath === '/dashboard' || normalizedPath === '/guard' || normalizedPath === '/koop-admin' || normalizedPath === '/bus-admin' || normalizedPath === '/driver-bas') return 'utama';
    if (normalizedPath.includes('smart-dashboard') || normalizedPath === '/my-qrcode' || normalizedPath === '/children' || normalizedPath === '/tabung') return 'utama';
    if (normalizedPath === '/payment-center' || normalizedPath === '/payments' || normalizedPath === '/payment-parent' || normalizedPath === '/payments-parent' || normalizedPath.includes('financial-dashboard') || normalizedPath.includes('ar-dashboard') || normalizedPath.includes('ar-outstanding') || normalizedPath.includes('ar-notification-report') || normalizedPath.includes('warden/ar') || normalizedPath.includes('accounting') || normalizedPath.includes('yuran') || normalizedPath.includes('tabung') || normalizedPath.includes('manual-bendahari')) return 'kewangan';
    if (normalizedPath.includes('users') || normalizedPath.includes('students') || normalizedPath.includes('guru-kelas') || normalizedPath.includes('rbac') || normalizedPath.includes('student-import')) return 'pengguna';
    if (normalizedPath.includes('hostel') || normalizedPath.includes('jadual-guru-asrama') || normalizedPath.includes('warden/schedules') || normalizedPath.includes('warden/pbw-pbp') || normalizedPath.includes('warden/asrama') || normalizedPath.includes('sickbay')) return 'asrama';
    if (normalizedPath.includes('discipline') || normalizedPath.includes('complaints')) return 'disiplin';
    if (normalizedPath.includes('bus') || normalizedPath.includes('vehicles') || normalizedPath.includes('bus-tickets')) return 'pengangkutan';
    if (normalizedPath.includes('koperasi') || normalizedPath.includes('marketplace') || normalizedPath.includes('inventory') || normalizedPath.includes('categories') || normalizedPath === '/vendor') return 'perdagangan';
    if (normalizedPath.includes('reports') || normalizedPath.includes('analytics')) return 'laporan';
    if (normalizedPath.includes('chatbox-faq') || normalizedPath.includes('notifications') || normalizedPath.includes('email-templates')) return 'sokongan';
    if (normalizedPath.includes('audit') || normalizedPath.includes('settings')) return 'sistem';
    return 'utama';
  };

  const getNavItems = () => {
    const role = user?.role;
    
    // Helper to filter items based on module settings
    const filterByModule = (items) => {
      return items.filter(item => {
        // Map paths to module keys
        if (item.path?.includes('bus') || item.path?.includes('tiket')) return isModuleEnabled('tiket_bas');
        if (item.path?.includes('hostel') || item.path?.includes('asrama')) return isModuleEnabled('hostel');
        if (item.path?.includes('koperasi') || item.path?.includes('koop')) return isModuleEnabled('koperasi');
        if (item.path?.includes('marketplace')) return isModuleEnabled('marketplace');
        if (item.path?.includes('sickbay')) return isModuleEnabled('sickbay');
        if (item.path?.includes('vehicle') || item.path?.includes('guard')) return isModuleEnabled('vehicle');
        if (item.path?.includes('inventory')) return isModuleEnabled('inventory');
        if (item.path?.includes('complaints') || item.path?.includes('aduan')) return isModuleEnabled('complaints');
        if (item.path?.includes('agm')) return isModuleEnabled('agm');
        return true; // Default show
      });
    };
    
    if (role === 'superadmin') return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/superadmin' },
      { icon: Building, label: 'Onboarding Institusi', path: '/superadmin/tenant-onboarding' },
      { icon: TrendingUp, label: 'Dashboard Pintar', path: '/admin/smart-dashboard' },
      { icon: PieChart, label: 'Dashboard Kewangan', path: '/admin/financial-dashboard' },
      { icon: Brain, label: 'Analisis Kewangan AI', path: '/admin/financial-analytics-ai' },
      { icon: Calculator, label: 'Sistem Perakaunan', path: '/admin/accounting-full' },
      { icon: CheckCircle, label: 'Reconcile Bank', path: '/admin/accounting/bank-reconciliation' },
      { icon: FileText, label: 'Laporan Khas AGM', path: '/admin/agm-reports' },
      { icon: Users, label: 'Pengguna', path: '/superadmin/users' },
      { icon: Shield, label: 'RBAC', path: '/superadmin/rbac' },
      { icon: GraduationCap, label: 'Pelajar', path: '/admin/students' },
      { icon: UserCheck, label: 'Guru Kelas', path: '/admin/guru-kelas' },
      { icon: CreditCard, label: 'Pakej Yuran', path: '/admin/yuran/set-yuran' },
      { icon: Wallet, label: 'Semua Yuran', path: '/admin/yuran/pelajar' },
      { icon: Receipt, label: 'Caj Tambahan', path: '/admin/yuran/charges' },
      { icon: Settings, label: 'Tetapan Invois & AGM', path: '/admin/yuran/settings' },
      { icon: Gift, label: 'Tabung & Sumbangan', path: '/admin/tabung' },
      { icon: Bus, label: 'Pengurusan Bas', path: '/admin/bus' },
      { icon: ShoppingCart, label: 'Koperasi', path: '/admin/koperasi' },
      { icon: Store, label: 'Marketplace', path: '/admin/marketplace' },
      { icon: Box, label: 'Inventori Universal', path: '/admin/inventory' },
      { icon: FolderTree, label: 'Kategori', path: '/admin/categories' },
      { icon: DoorOpen, label: 'e-Asrama Pintar', path: '/hostel' },
      { icon: Building, label: 'Blok Asrama', path: '/hostel/blocks' },
      { icon: Shield, label: 'Disiplin & OLAT', path: '/admin/discipline' },
      { icon: AlertCircle, label: 'Aduan', path: '/admin/complaints' },
      { icon: Calendar, label: 'Jadual Warden', path: '/warden/schedules' },
      { icon: Calendar, label: 'Jadual PBW/PBP', path: '/warden/pbw-pbp' },
      { icon: Calendar, label: 'Mesyuarat AGM', path: '/agm' },
      { icon: BarChart3, label: 'Laporan', path: '/admin/reports' },
      { icon: Brain, label: 'Analitik AI', path: '/analytics' },
      { icon: MessageCircle, label: 'FAQ Chatbox', path: '/admin/chatbox-faq' },
      { icon: Mail, label: 'E-mel Template', path: '/admin/email-templates' },
      { icon: Upload, label: 'Upload Data Pelajar', path: '/admin/student-import' },
      { icon: FileText, label: 'Audit Log', path: '/superadmin/audit' },
      { icon: Library, label: 'Pusat Pengetahuan', path: '/admin/knowledge' },
      { icon: Settings, label: 'Tetapan', path: '/superadmin/settings' },
    ]);
    if (role === 'bendahari') return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/admin' },
      { icon: CheckCircle, label: 'Reconcile Bank (Prioriti)', path: '/admin/accounting/bank-reconciliation' },
      { icon: Calculator, label: 'Sistem Perakaunan', path: '/admin/accounting-full' },
      { icon: BarChart3, label: 'AR (Akaun Belum Terima)', path: '/admin/ar-dashboard' },
      { icon: Send, label: 'Hantar Peringatan Yuran Tertunggak', path: '/admin/ar-outstanding' },
      { icon: FileText, label: 'Laporan Notifikasi AR', path: '/admin/ar-notification-report' },
      { icon: Wallet, label: 'Semua Yuran', path: '/admin/yuran/pelajar' },
      { icon: CreditCard, label: 'Pakej Yuran', path: '/admin/yuran/set-yuran' },
      { icon: Receipt, label: 'Caj Tambahan', path: '/admin/yuran/charges' },
      { icon: Settings, label: 'Tetapan Invois & AGM', path: '/admin/yuran/settings' },
      { icon: HelpCircle, label: 'Checklist Operasi Bendahari', path: '/admin/manual-bendahari#checklist-priority' },
      { icon: PieChart, label: 'Dashboard Kewangan', path: '/admin/financial-dashboard' },
      { icon: Brain, label: 'Analisis Kewangan AI', path: '/admin/financial-analytics-ai' },
      { icon: FileText, label: 'Laporan Khas AGM', path: '/admin/agm-reports' },
      { icon: BarChart3, label: 'Laporan', path: '/admin/reports' },
      { icon: Gift, label: 'Tabung & Sumbangan', path: '/admin/tabung' },
      { icon: ShoppingCart, label: 'Koperasi', path: '/admin/koperasi' },
      { icon: Mail, label: 'E-mel Template', path: '/admin/email-templates' },
      { icon: Library, label: 'Pusat Pengetahuan', path: '/admin/knowledge' },
    ]);
    if (role === 'admin') return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/admin' },
      { icon: CheckCircle, label: 'Reconcile Bank (Prioriti)', path: '/admin/accounting/bank-reconciliation' },
      { icon: Calculator, label: 'Sistem Perakaunan', path: '/admin/accounting-full' },
      { icon: BarChart3, label: 'AR (Akaun Belum Terima)', path: '/admin/ar-dashboard' },
      { icon: Send, label: 'Hantar Peringatan Yuran Tertunggak', path: '/admin/ar-outstanding' },
      { icon: FileText, label: 'Laporan Notifikasi AR', path: '/admin/ar-notification-report' },
      { icon: HelpCircle, label: 'Checklist Operasi Bendahari', path: '/admin/manual-bendahari#checklist-priority' },
      { icon: PieChart, label: 'Dashboard Kewangan', path: '/admin/financial-dashboard' },
      { icon: Brain, label: 'Analisis Kewangan AI', path: '/admin/financial-analytics-ai' },
      { icon: TrendingUp, label: 'Dashboard Pintar', path: '/admin/smart-dashboard' },
      { icon: FileText, label: 'Laporan Khas AGM', path: '/admin/agm-reports' },
      { icon: Users, label: 'Pengguna', path: '/superadmin/users' },
      { icon: Users, label: 'Pelajar', path: '/admin/students' },
      { icon: GraduationCap, label: 'Guru Kelas', path: '/admin/guru-kelas' },
      { icon: Wallet, label: 'Semua Yuran', path: '/admin/yuran/pelajar' },
      { icon: CreditCard, label: 'Pakej Yuran', path: '/admin/yuran/set-yuran' },
      { icon: Receipt, label: 'Caj Tambahan', path: '/admin/yuran/charges' },
      { icon: Settings, label: 'Tetapan Invois & AGM', path: '/admin/yuran/settings' },
      { icon: Gift, label: 'Tabung & Sumbangan', path: '/admin/tabung' },
      { icon: Bus, label: 'Pengurusan Bas', path: '/admin/bus' },
      { icon: ShoppingCart, label: 'Koperasi', path: '/admin/koperasi' },
      { icon: Store, label: 'Marketplace', path: '/admin/marketplace' },
      { icon: Box, label: 'Inventori Universal', path: '/admin/inventory' },
      { icon: FolderTree, label: 'Kategori', path: '/admin/categories' },
      { icon: DoorOpen, label: 'e-Asrama Pintar', path: '/hostel' },
      { icon: Building, label: 'Blok Asrama', path: '/hostel/blocks' },
      { icon: Shield, label: 'Disiplin & OLAT', path: '/admin/discipline' },
      { icon: AlertCircle, label: 'Aduan', path: '/admin/complaints' },
      { icon: Calendar, label: 'Jadual Warden', path: '/warden/schedules' },
      { icon: Calendar, label: 'Jadual PBW/PBP', path: '/warden/pbw-pbp' },
      { icon: Calendar, label: 'Mesyuarat AGM', path: '/agm' },
      { icon: BarChart3, label: 'Laporan', path: '/admin/reports' },
      { icon: Brain, label: 'Analitik AI', path: '/analytics' },
      { icon: MessageCircle, label: 'FAQ Chatbox', path: '/admin/chatbox-faq' },
      { icon: Mail, label: 'E-mel Template', path: '/admin/email-templates' },
      { icon: Settings, label: 'Tetapan Sistem', path: '/superadmin/settings' },
    ]);
    if (role === 'sub_bendahari') return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/admin' },
      { icon: CheckCircle, label: 'Reconcile Bank (Prioriti)', path: '/admin/accounting/bank-reconciliation' },
      { icon: Calculator, label: 'Sistem Perakaunan', path: '/admin/accounting-full' },
      { icon: BarChart3, label: 'AR (Akaun Belum Terima)', path: '/admin/ar-dashboard' },
      { icon: Send, label: 'Hantar Peringatan Yuran Tertunggak', path: '/admin/ar-outstanding' },
      { icon: FileText, label: 'Laporan Notifikasi AR', path: '/admin/ar-notification-report' },
      { icon: Wallet, label: 'Semua Yuran', path: '/admin/yuran/pelajar' },
      { icon: CreditCard, label: 'Pakej Yuran', path: '/admin/yuran/set-yuran' },
      { icon: Receipt, label: 'Caj Tambahan', path: '/admin/yuran/charges' },
      { icon: Settings, label: 'Tetapan Invois & AGM', path: '/admin/yuran/settings' },
      { icon: HelpCircle, label: 'Checklist Operasi Bendahari', path: '/admin/manual-bendahari#checklist-priority' },
      { icon: FileText, label: 'Laporan Khas AGM', path: '/admin/agm-reports' },
      { icon: BarChart3, label: 'Laporan', path: '/admin/reports' },
      { icon: ShoppingCart, label: 'Koperasi', path: '/admin/koperasi' },
      { icon: Mail, label: 'E-mel Template', path: '/admin/email-templates' },
      { icon: Library, label: 'Pusat Pengetahuan', path: '/admin/knowledge' },
    ]);
    if (['juruaudit'].includes(role)) return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/admin' },
      { icon: Calculator, label: 'Sistem Perakaunan', path: '/admin/accounting-full' },
      { icon: CheckCircle, label: 'Reconcile Bank', path: '/admin/accounting/bank-reconciliation' },
      { icon: FileText, label: 'Laporan Khas AGM', path: '/admin/agm-reports' },
      { icon: CheckCircle, label: 'Pengesahan', path: '/admin/accounting/verification' },
      { icon: Mail, label: 'E-mel Template', path: '/admin/email-templates' },
      { icon: BarChart3, label: 'Laporan', path: '/admin/reports' },
      { icon: FileText, label: 'Log Audit', path: '/admin/accounting/audit-logs' },
      { icon: Library, label: 'Pusat Pengetahuan', path: '/admin/knowledge' },
    ]);
    if (role === 'koop_admin') return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/koop-admin' },
      { icon: Package, label: 'Kit', path: '/koop-admin' },
      { icon: ShoppingBag, label: 'Produk', path: '/koop-admin' },
      { icon: Receipt, label: 'Pesanan', path: '/koop-admin' },
      { icon: Box, label: 'Inventori Universal', path: '/admin/inventory' },
      { icon: FolderTree, label: 'Kategori', path: '/admin/categories' },
      { icon: Mail, label: 'E-mel Template', path: '/admin/email-templates' },
      { icon: Brain, label: 'Analitik AI', path: '/analytics' },
    ]);
    if (role === 'bus_admin') return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/bus-admin' },
      { icon: Building, label: 'Syarikat Bas', path: '/bus-admin/company' },
      { icon: Bus, label: 'Senarai Bas', path: '/bus-admin/buses' },
      { icon: Users, label: 'Driver Bas', path: '/bus-admin/drivers' },
      { icon: MapPinned, label: 'Routes', path: '/bus-admin/routes' },
      { icon: Calendar, label: 'Trips', path: '/bus-admin/trips' },
      { icon: Ticket, label: 'Tempahan', path: '/bus-admin/bookings' },
      { icon: BarChart3, label: 'Analitik Pengangkutan', path: '/analytics' },
    ]);
    if (role === 'bus_driver') return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/driver-bas' },
    ]);
    if (['guru_kelas', 'guru_homeroom'].includes(role)) return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/guru' },
      { icon: BarChart3, label: 'Dashboard Kelas', path: '/guru/class-dashboard' },
      { icon: Users, label: 'Pelajar Kelas', path: '/guru/students' },
      { icon: Upload, label: 'Upload Data Pelajar', path: '/admin/student-import' },
      { icon: CreditCard, label: 'Status Yuran', path: '/guru/fees' },
      { icon: Bell, label: 'Pusat Notifikasi', path: '/guru/notifications' },
      { icon: Mail, label: 'E-mel Template', path: '/admin/email-templates' },
      { icon: Calendar, label: 'Mesyuarat AGM', path: '/agm' },
      { icon: Brain, label: 'Analitik AI', path: '/analytics' },
    ]);
    if (role === 'warden') return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/warden' },
      { icon: DoorOpen, label: 'Hostel', path: '/warden/hostel' },
      { icon: Building, label: 'Pengurusan Asrama', path: '/warden/asrama' },
      { icon: Calendar, label: 'Jadual PBW/PBP', path: '/warden/pbw-pbp' },
      { icon: Calendar, label: 'Jadual Tugas', path: '/warden/schedules' },
      { icon: Activity, label: 'Bilik Sakit', path: '/warden/sickbay' },
      { icon: BarChart3, label: 'Tertunggak Yuran (AR)', path: '/warden/ar' },
      { icon: Shield, label: 'Disiplin & OLAT', path: '/admin/discipline' },
      { icon: AlertCircle, label: 'Aduan', path: '/admin/complaints' },
      { icon: Mail, label: 'E-mel Template', path: '/admin/email-templates' },
      { icon: Brain, label: 'Analitik AI', path: '/warden/analytics' },
    ]);
    if (role === 'guard') return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/guard' },
      { icon: Car, label: 'Kenderaan', path: '/guard/vehicles' },
      { icon: Mail, label: 'E-mel Template', path: '/admin/email-templates' },
      { icon: Brain, label: 'Analitik AI', path: '/analytics' },
    ]);
    if (role === 'pelajar') return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/pelajar' },
      { icon: QrCode, label: 'QR Code & Profil', path: '/my-qrcode' },
      { icon: CreditCard, label: 'Yuran Saya', path: '/pelajar/fees' },
      { icon: DoorOpen, label: 'Hostel', path: '/pelajar/hostel' },
      { icon: ShoppingCart, label: 'Koperasi', path: '/koperasi' },
    ]);
    // Parent default
    return filterByModule([
      { icon: Home, label: 'Dashboard', path: '/dashboard' },
      { icon: QrCode, label: 'QR Code & Profil', path: '/my-qrcode' },
      { icon: Users, label: 'Anak Saya', path: '/children' },
      { icon: Gift, label: 'Tabung & Sumbangan', path: '/tabung' },
      { icon: Store, label: 'Vendor', path: '/vendor' },
      { icon: Bus, label: 'Tiket Bas', path: '/bus-tickets' },
      { icon: FileText, label: 'Laporan Keberadaan', path: '/hostel' },
      { icon: Send, label: 'Permohonan Keluar', path: '/hostel/permohonan' },
      { icon: Calendar, label: 'Jadual Guru Asrama', path: '/jadual-guru-asrama' },
      { icon: ShoppingCart, label: 'Koperasi', path: '/koperasi' },
      { icon: CreditCard, label: 'Yuran', path: '/yuran' },
      { icon: AlertCircle, label: 'Aduan', path: '/complaints' },
      { icon: Wallet, label: 'Pusat Bayaran', path: '/payment-center' },
      { icon: Receipt, label: 'Bayaran Anak', path: '/payments-parent' },
      { icon: Bell, label: 'Notifikasi', path: '/notifications' },
    ]);
  };

  const rawNavItems = getNavItems();
  const navItems = rawNavItems.map((item) => ({ ...item, normalizedPath: normalizeNavPath(item.path), section: pathToSection(item.path) }));

  // Group by section for accordion (kekal order)
  const sectionOrder = SECTION_ORDER.filter((id) => navItems.some((i) => i.section === id));
  const getSectionLabel = (sectionId) => {
    if (user?.role === 'parent' && sectionId === 'kewangan') return 'Bayaran Yuran';
    return SECTION_LABELS[sectionId] || sectionId;
  };
  const navBySection = sectionOrder.map((sectionId) => ({
    sectionId,
    sectionLabel: getSectionLabel(sectionId),
    items: navItems.filter((i) => i.section === sectionId),
  })).filter((g) => g.items.length > 0);

  // Accordion: buka section yang mengandungi halaman semasa
  const currentSection = navItems.find((i) => i.normalizedPath === location.pathname)?.section;
  const [openSections, setOpenSections] = useState(() => {
    const o = {};
    sectionOrder.forEach((id) => {
      o[id] = id === currentSection || (id === 'utama' && !currentSection);
    });
    return o;
  });
  useEffect(() => {
    const curr = navItems.find((i) => i.normalizedPath === location.pathname)?.section;
    if (curr) setOpenSections((prev) => ({ ...prev, [curr]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleSection = (sectionId) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const roleInfo = ROLES[user?.role] || ROLES.parent;

  const handleLogout = () => {
    api.post('/api/auth/logout').catch(() => {}).finally(() => {
      logout();
      navigate('/');
      toast.success('Log keluar berjaya');
    });
  };

  return (
    <div className="min-h-screen min-h-[100dvh] mesh-gradient">
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-gradient-to-b from-slate-900 via-teal-950 to-violet-950 text-white">
        <div className="flex items-center gap-3 h-16 px-4 lg:px-6 border-b border-white/10 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 overflow-hidden bg-gradient-to-br from-teal-400 to-violet-500">
            {appIconUrl && !appIconError ? (
              <img src={appIconUrl} alt="" className="w-full h-full object-contain" onError={() => setAppIconError(true)} />
            ) : (
              <GraduationCap className="text-white" size={24} />
            )}
          </div>
          <span className="text-base lg:text-lg font-bold bg-gradient-to-r from-white to-teal-200 bg-clip-text text-transparent font-heading truncate">{portal_title}</span>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
          {navBySection.map((group) => (
            <div key={group.sectionId} className="rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection(group.sectionId)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-slate-200 hover:bg-white/10 hover:text-white rounded-lg transition-all"
              >
                <span className="font-medium text-sm">{group.sectionLabel}</span>
                {openSections[group.sectionId] ? <ChevronDown size={18} className="shrink-0" /> : <ChevronRight size={18} className="shrink-0" />}
              </button>
              <AnimatePresence initial={false}>
                {openSections[group.sectionId] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pl-1 pb-1 space-y-0.5">
                      {group.items.map((item) => (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm ${location.pathname === item.normalizedPath ? 'bg-gradient-to-r from-teal-400/90 to-violet-400/90 text-white shadow-lg' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
                        >
                          <item.icon size={18} />{item.label}
                        </Link>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </nav>
      </aside>

      {/* Desktop Top Header Bar */}
      <header className="hidden md:flex fixed top-0 left-64 right-0 z-40 h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 items-center justify-end px-6 gap-4">
        <CartIconButton showCategoryCounts />
        <NotificationCenter />
        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-400 to-orange-400 text-white shadow-pastel-sm`}><roleInfo.icon size={16} /></div>
          <span className="text-sm font-medium text-slate-700">{user?.full_name}</span>
          <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" data-testid="logout-btn" title="Log Keluar">
            <LogOut size={18} /> Log Keluar
          </button>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="md:hidden glass fixed top-0 left-0 right-0 z-40 h-14 min-h-[56px] flex items-center justify-between px-3 sm:px-4 safe-area-top" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center shadow-lg overflow-hidden bg-gradient-to-br from-teal-400 to-violet-500">
            {appIconUrl && !appIconError ? (
              <img src={appIconUrl} alt="" className="w-full h-full object-contain" onError={() => setAppIconError(true)} />
            ) : (
              <GraduationCap className="text-white" size={18} />
            )}
          </div>
          <span className="text-sm sm:text-base font-bold bg-gradient-to-r from-teal-600 to-violet-600 bg-clip-text text-transparent font-heading truncate">{portal_title}</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <CartIconButton />
          <NotificationCenter />
          <button onClick={handleLogout} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all" title="Log Keluar" data-testid="logout-btn"><LogOut size={20} /></button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-pastel-mint/50 rounded-xl text-teal-500" aria-label="Menu">{sidebarOpen ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
      </header>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => setSidebarOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} className="md:hidden fixed top-0 left-0 bottom-0 w-[min(18rem,85vw)] max-w-[320px] bg-gradient-to-b from-slate-900 via-teal-950 to-violet-950 z-50 shadow-2xl flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
              <div className="flex items-center justify-between h-14 min-h-[56px] px-4 border-b border-white/10 flex-shrink-0">
                <span className="font-bold text-white font-heading text-base">Menu</span>
                <button onClick={() => setSidebarOpen(false)} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/70 hover:text-white rounded-xl" aria-label="Tutup"><X size={22} /></button>
              </div>
              <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto overflow-x-hidden">
                {navBySection.map((group) => (
                  <div key={group.sectionId} className="rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection(group.sectionId)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-3 min-h-[48px] text-left text-slate-200 hover:bg-white/10 hover:text-white rounded-lg transition-all"
                    >
                      <span className="font-medium text-sm">{group.sectionLabel}</span>
                      {openSections[group.sectionId] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                    <AnimatePresence initial={false}>
                      {openSections[group.sectionId] && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="pl-1 pb-1 space-y-0.5">
                            {group.items.map((item) => (
                              <Link
                                key={item.path}
                                to={item.path}
                                onClick={() => setSidebarOpen(false)}
                                className={`flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl transition-all duration-200 text-sm ${location.pathname === item.normalizedPath ? 'bg-gradient-to-r from-teal-400/90 to-violet-400/90 text-white shadow-lg' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
                              >
                                <item.icon size={18} />{item.label}
                              </Link>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <nav className="md:hidden mobile-nav bg-white/90 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <div className="flex justify-around items-center py-2 px-1">
          {navItems.slice(0, 5).map((item) => (
            <Link key={item.path} to={item.path} className={`flex flex-col items-center gap-0.5 min-w-[52px] min-h-[48px] justify-center rounded-lg active:bg-slate-100 transition-colors ${location.pathname === item.normalizedPath ? 'text-teal-600' : 'text-slate-500'}`}>
              <item.icon size={22} strokeWidth={2} /><span className="text-[11px] font-semibold leading-tight text-center max-w-[64px] truncate">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Mobile: tiada overflow mendatar; zoom dibenarkan (viewport di index.html) */}
      <main className="md:ml-64 pt-14 md:pt-16 main-content overflow-x-hidden">
        {/* Selamat Datang + nama penuh – paparan desktop & mobile */}
        <div className="welcome-bar px-4 py-2.5 sm:px-6 md:py-3 bg-gradient-to-r from-teal-50/90 via-white to-violet-50/80 border-b border-slate-200/60">
          <p className="text-sm sm:text-base text-slate-700 max-w-[1600px] mx-auto">
            <span className="font-medium text-slate-500">Selamat Datang,</span>{' '}
            <span className="font-semibold text-slate-800">{user?.full_name || user?.email?.split('@')[0] || 'Pengguna'}</span>
          </p>
        </div>
        <div className="dashboard-page p-4 pb-24 sm:pb-6 md:p-6 lg:p-8 max-w-[1600px] mx-auto min-w-0 overflow-x-hidden">{children}</div>
      </main>

      {/* Troli berpusat - satu drawer untuk semua pembayaran */}
      <CartDrawer />
    </div>
  );
};

// NOTE: SuperAdminDashboard refactored to /pages/superadmin/SuperAdminDashboard.js
// NOTE: UserManagementPage refactored to /pages/superadmin/UserManagementPage.js
// NOTE: AuditLogPage refactored to /pages/superadmin/AuditLogPage.js
// NOTE: RBACConfigPage refactored to /pages/superadmin/RBACConfigPage.js
// NOTE: SettingsPage refactored to /pages/superadmin/SettingsPage.js

// ===================== PARENT PAGES =====================
// NOTE: ParentDashboard refactored to /pages/dashboard/ParentDashboard.js

// ===================== BUS TICKET PAGE (Parent View) =====================
// NOTE: BusTicketPage refactored to /pages/modules/BusTicketPage.js

// NOTE: AdminBusManagementPage refactored to /pages/admin/bus/AdminBusManagementPage.js

// NOTE: ChildrenPage refactored to /pages/parent/ChildrenPage.js

// ===================== FEE PACKAGE MANAGEMENT (SUPERADMIN/BENDAHARI) =====================
// NOTE: FeePackageManagementPage refactored to /pages/admin/fees/FeePackageManagementPage.js

// ===================== PARENT CHILDREN FEES PAGE =====================
// NOTE: ParentChildrenFeesPage refactored to /pages/parent/ParentChildrenFeesPage.js

// NOTE: FeesPage refactored to /pages/parent/fees/FeesPage.js

// NOTE: PaymentsPage refactored to /pages/parent/payments/PaymentsPage.js

// NOTE: NotificationsPage refactored to /pages/parent/notifications/NotificationsPage.js

// ===================== DONATION FLOW (UNIFIED) =====================
// NOTE: Canonical donation experience is /tabung (TabungPageNew) and checkout via centralized cart.
// NOTE: Legacy parent/module pages (SedekahPage, InfaqPage, TabungPage) are deprecated and now redirect to /tabung.
// NOTE: Legacy admin aliases (/admin/sedekah, /admin/infaq) redirect to /admin/tabung.

// ===================== ADMIN PAGES =====================
// NOTE: AdminDashboard refactored to /pages/admin/AdminDashboard.js

// NOTE: AdminStudentsPage refactored to /pages/admin/students/AdminStudentsPage.js

// NOTE: AdminFeesPage refactored to /pages/admin/fees/AdminFeesPage.js

// NOTE: AdminReportsPage refactored to /pages/admin/reports/AdminReportsPage.js

// ===================== ROLE-SPECIFIC DASHBOARDS =====================

// NOTE: PelajarDashboard refactored to /pages/pelajar/PelajarDashboard.js

// NOTE: WardenDashboard, SickBayPage, GuardDashboard refactored to /pages/warden/, /pages/sickbay/, /pages/guard/
// NOTE: GuruDashboard refactored to /pages/guru/GuruDashboard.js


// ===================== KOPERASI PAGE (Parent) =====================
// NOTE: KoperasiPage refactored to /pages/modules/KoperasiPage.js

// ===================== KOPERASI ORDERS PAGE =====================
// NOTE: KoperasiOrdersPage refactored to /pages/koperasi/KoperasiOrdersPage.js

// ===================== ADMIN KOPERASI MANAGEMENT PAGE =====================
// NOTE: AdminKoperasiPage refactored to /pages/admin/koperasi/AdminKoperasiPage.js

// ===================== MUST CHANGE PASSWORD GATE =====================
// Peringatan automatik apabila admin/superadmin tetapkan kata laluan – user diminta tukar untuk keselamatan.

const MustChangePasswordGate = () => {
  const { user, updateUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('Kata laluan baru minimum 6 aksara');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Kata laluan baru dan pengesahan tidak sepadan');
      return;
    }
    setLoading(true);
    try {
      const res = await api.put('/api/auth/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success('Kata laluan telah dikemas kini');
      if (res.data?.user) updateUser(res.data.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal menukar kata laluan. Sila semak kata laluan semasa.');
    } finally {
      setLoading(false);
    }
  };

  if (!user?.must_change_password) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen bg-black/60">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border-2 border-amber-200"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="text-amber-600" size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Peringatan Keselamatan</h2>
            <p className="text-sm text-slate-600">Kata laluan anda telah ditetapkan oleh pentadbir. Sila tukar kepada kata laluan baru untuk melindungi data anda.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kata laluan semasa</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Kata laluan yang diberikan pentadbir"
              required
              className="w-full h-11 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kata laluan baru</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 aksara"
              required
              minLength={6}
              className="w-full h-11 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sahkan kata laluan baru</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi kata laluan baru"
              required
              minLength={6}
              className="w-full h-11 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 transition-all"
          >
            {loading ? 'Menyimpan...' : 'Tukar Kata Laluan'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

// ===================== MAIN APP =====================

const SPLASH_CACHE_KEY = 'app_splash_config';
const ONBOARDING_CACHE_KEY = 'app_onboarding_config';

const getCachedSplashConfig = () => {
  try {
    const c = localStorage.getItem(SPLASH_CACHE_KEY);
    return c ? JSON.parse(c) : null;
  } catch {
    return null;
  }
};

const getCachedOnboardingConfig = () => {
  try {
    const c = localStorage.getItem(ONBOARDING_CACHE_KEY);
    return c ? JSON.parse(c) : null;
  } catch {
    return null;
  }
};

const App = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [splashConfig, setSplashConfig] = useState(getCachedSplashConfig);
  const [onboardingConfig, setOnboardingConfig] = useState(getCachedOnboardingConfig);

  useEffect(() => {
    let cancelled = false;
    const done = () => { if (!cancelled) setLoading(false); };
    try {
      const savedToken = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');
      if (savedToken && savedUser) {
        setToken(savedToken);
        const parsed = JSON.parse(savedUser);
        if (parsed && typeof parsed === 'object') setUser(parsed);
      }
    } catch {
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } catch {
        // Ignore cleanup errors (e.g. private mode)
      }
    } finally {
      done();
    }
    const fallback = setTimeout(done, 1500);
    api.get('/api/public/settings/pwa').then((res) => {
      if (cancelled) return;
      const d = res.data || {};
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const iconPath = (d.icon_512_url || d.icon_192_url || '/icons/icon-512x512.png').trim();
      const cfg = {
        title: (d.splash_title || '').trim(),
        tagline: (d.splash_tagline || '').trim(),
        imageUrl: (d.splash_image_url || '').trim(),
        iconUrl: base + (iconPath.startsWith('/') ? iconPath : '/' + iconPath)
      };
      setSplashConfig(cfg);
      try {
        localStorage.setItem(SPLASH_CACHE_KEY, JSON.stringify(cfg));
      } catch {}
    }).catch(() => {});
    api.get('/api/public/settings/onboarding').then((res) => {
      if (cancelled) return;
      const d = res.data || {};
      const slides = Array.isArray(d.slides) ? d.slides : [];
      setOnboardingConfig(slides.length ? { slides } : null);
      try {
        if (slides.length) localStorage.setItem(ONBOARDING_CACHE_KEY, JSON.stringify({ slides }));
        else localStorage.removeItem(ONBOARDING_CACHE_KEY);
      } catch {}
    }).catch(() => {});
    return () => { cancelled = true; clearTimeout(fallback); };
  }, []);

  // Bila loading selesai, papar kandungan + splash overlay; kemudian fade out splash
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setShowSplash(false), 80);
      return () => clearTimeout(t);
    }
  }, [loading]);

  const [onboardingCompleted, setOnboardingCompleted] = useState(() => getOnboardingCompleted());
  const { syncing } = useOfflineSync();

  const login = (data) => {
    if (!data || typeof data !== 'object' || !data.access_token || !data.user) return;
    try {
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.access_token);
      setUser(data.user);
    } catch (e) {
      console.error('Login state update failed', e);
    }
  };
  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setToken(null); setUser(null); };
  const updateUser = (userData) => { setUser(userData); localStorage.setItem('user', JSON.stringify(userData)); };

  const getDefaultRoute = () => {
    if (!user) return '/';
    const role = user.role;
    if (role === 'superadmin') return '/superadmin';
    if (['admin', 'bendahari', 'sub_bendahari'].includes(role)) return '/admin';
    if (['guru_kelas', 'guru_homeroom'].includes(role)) return '/guru';
    if (role === 'warden') return '/warden';
    if (role === 'guard') return '/guard';
    if (role === 'pelajar') return '/pelajar';
    return '/dashboard';
  };

  const mainContent = !loading && (
    !onboardingCompleted
      ? <OnboardingPage config={onboardingConfig} onComplete={() => setOnboardingCompleted(true)} />
      : (
        <PortalConfigProvider>
        <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      <MustChangePasswordGate />
      <CartProvider>
        <BrowserRouter>
          <PwaMetaUpdater />
          <OnlineStatusIndicator />
          <SyncStatus syncing={syncing} />
            <Routes>
            <Route path="/" element={user ? <Navigate to={getDefaultRoute()} /> : <LandingPage />} />
            <Route path="/login" element={user ? <Navigate to={getDefaultRoute()} /> : <NewLoginPage />} />
            <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <NewRegisterPage />} />
            <Route path="/daftar-institusi" element={user ? <Navigate to={getDefaultRoute()} /> : <InstitutionRegistrationWizardPage />} />
            <Route path="/institusi/daftar" element={<Navigate to="/daftar-institusi" replace />} />
            <Route path="/forgot-password" element={user ? <Navigate to={getDefaultRoute()} /> : <NewForgotPasswordPage />} />
            <Route path="/reset-password" element={user ? <Navigate to={getDefaultRoute()} /> : <NewResetPasswordPage />} />
          
          {/* Public donation page; logged-in users are redirected to canonical /tabung flow */}
          <Route path="/donate/:campaignId" element={user ? <Navigate to="/tabung" replace /> : <PublicDonatePage />} />
          
          {/* Public Campaign Detail Page */}
          <Route path="/kempen/:campaignId" element={<PublicCampaignDetailPage />} />
          
          {/* Public Claim Student Page */}
          <Route path="/claim/:claimCode?" element={<ClaimStudentPage />} />

          {/* Daftar Syarikat Bas (awam, tanpa login) */}
          <Route path="/daftar-syarikat-bas" element={<BusCompanyRegisterPage />} />
          
          {/* Canonical Tabung & Sumbangan route (centralized cart checkout) */}
          <Route path="/tabung" element={user ? <DashboardLayout><TabungPageNew /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Legacy aliases keep backward compatibility but redirect logged-in users to /tabung */}
          <Route path="/sedekah" element={user ? <Navigate to="/tabung" replace /> : <PublicSedekahPage />} />
          <Route path="/sedekah/:campaignId" element={user ? <Navigate to="/tabung" replace /> : <PublicCampaignDetailPage />} />
          <Route path="/infaq" element={<Navigate to="/tabung" replace />} />
          
          {/* Parent Routes */}
          <Route path="/dashboard" element={user ? <DashboardLayout><NewParentDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/my-qrcode" element={user ? <DashboardLayout><MyQRCodePage user={user} /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/children" element={user ? <DashboardLayout><NewChildrenPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/bus-tickets" element={user?.role === 'parent' ? <DashboardLayout><BusTicketPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/fees" element={user?.role === 'parent' ? <DashboardLayout><NewParentChildrenFeesPage /></DashboardLayout> : user ? <DashboardLayout><NewFeesPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/yuran" element={user?.role === 'parent' ? <DashboardLayout><ParentYuranDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/payments-parent" element={user?.role === 'parent' ? <DashboardLayout><NewPaymentsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/payment-parent" element={user?.role === 'parent' ? <Navigate to="/payments-parent" replace /> : <Navigate to="/login" />} />
          <Route path="/payments" element={user?.role === 'parent' ? <Navigate to="/payments-parent" replace /> : <Navigate to="/login" />} />
          <Route path="/payment-center" element={user?.role === 'parent' ? <DashboardLayout><NewPaymentCenterLayout /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/notifications" element={user ? <DashboardLayout><NewNotificationsPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* SuperAdmin Routes */}
          <Route path="/superadmin" element={user?.role === 'superadmin' ? <DashboardLayout><NewSuperAdminDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/superadmin/users" element={user && ['superadmin', 'admin'].includes(user?.role) ? <DashboardLayout><NewUserManagementPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/superadmin/tenant-onboarding" element={user?.role === 'superadmin' ? <DashboardLayout><NewTenantOnboardingPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/superadmin/rbac" element={user?.role === 'superadmin' ? <DashboardLayout><NewRBACConfigPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/superadmin/audit" element={user?.role === 'superadmin' ? <DashboardLayout><NewAuditLogPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/superadmin/settings" element={user && ['superadmin', 'admin'].includes(user.role) ? <DashboardLayout><NewSettingsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/sample-layout" element={user?.role === 'superadmin' ? <DashboardLayout><SampleLayoutPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Student Import Module - SuperAdmin & Guru Kelas */}
          <Route path="/admin/student-import" element={user && ['superadmin', 'admin', 'guru_kelas'].includes(user.role) ? <DashboardLayout><StudentImportPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><NewAdminDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/smart-dashboard" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><SmartDashboardPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/students" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><NewAdminStudentsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/fee-packages" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><NewFeePackageManagementPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/fees" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><NewAdminFeesPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/tabung" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><AdminTabungPageNew /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/tabung/new" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><CampaignFormPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/tabung/:campaignId/edit" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><CampaignFormPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/chatbox-faq" element={user && ['superadmin', 'admin'].includes(user?.role) ? <DashboardLayout><AdminChatboxFAQPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/financial-dashboard" element={user && ['admin', 'bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><FinancialDashboardPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/financial-analytics-ai" element={user && ['admin', 'bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><FinancialAnalyticsAIPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/ar-dashboard" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><ARDashboardPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/ar-outstanding" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><AROutstandingPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/ar-notification-report" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><ARNotificationReportPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/agm-reports" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><AGMReportsPage /></DashboardLayout> : <Navigate to="/login" />} />
          {/* Legacy Admin aliases -> canonical /admin/tabung */}
          <Route path="/admin/sedekah" element={<Navigate to="/admin/tabung" replace />} />
          <Route path="/admin/infaq" element={<Navigate to="/admin/tabung" replace />} />
          <Route path="/admin/bus" element={user && ['admin', 'superadmin'].includes(user.role) ? <DashboardLayout><NewAdminBusManagementPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/reports" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><NewAdminReportsPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Yuran Module Routes */}
          <Route path="/admin/yuran/set-yuran" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><SetYuranManagementPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/yuran/pelajar" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><StudentYuranListPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/yuran/charges" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><ChargesManagementPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/yuran/settings" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><YuranSettingsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/manual-bendahari" element={user && ['bendahari', 'sub_bendahari', 'admin', 'superadmin'].includes(user.role) ? <DashboardLayout><ManualBendahariPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/manual-bendahari/full" element={user && ['bendahari', 'sub_bendahari', 'admin', 'superadmin'].includes(user.role) ? <DashboardLayout><ManualBendahariFullPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/knowledge" element={user && ['bendahari', 'sub_bendahari', 'admin', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><KnowledgePage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/email-templates" element={!user ? <Navigate to="/login" /> : ['bendahari', 'sub_bendahari'].includes(user?.role) ? <DashboardLayout><BendahariEmailTemplatesPage /></DashboardLayout> : ['superadmin', 'admin', 'warden', 'guru_kelas', 'guru_homeroom', 'juruaudit', 'koop_admin', 'guard'].includes(user?.role) ? <DashboardLayout><EmailTemplatesPage /></DashboardLayout> : <Navigate to="/bus-admin" replace />} />
          
          <Route
            path="/admin/accounting"
            element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role)
              ? <Navigate to="/admin/accounting-full" replace />
              : <Navigate to="/login" />}
          />
          
          {/* Full Accounting Module Routes */}
          <Route path="/admin/accounting-full" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><AccountingDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/transactions" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><TransactionList /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/transactions/new" element={user && ['admin', 'bendahari', 'sub_bendahari', 'superadmin'].includes(user.role) ? <DashboardLayout><TransactionForm /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/transactions/:id" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><TransactionDetail /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/verification" element={user && ['juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><VerificationPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/categories" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><CategoryManager /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/reports/monthly" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><MonthlyReport /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/reports/monthly/:year/:month" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><MonthlyReport /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/reports/annual" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><AnnualReport /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/reports/annual/:year" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><AnnualReport /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Bank Accounts & Financial Year Routes */}
          <Route path="/admin/accounting/bank-accounts" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><BankAccountsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/bank-reconciliation" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><BankReconciliationPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/financial-years" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><FinancialYearPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/agm-reports" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><AGMReportsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/chart-of-accounts" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><ChartOfAccountsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/accounting/manual" element={user && ['admin', 'bendahari', 'sub_bendahari', 'juruaudit', 'superadmin'].includes(user.role) ? <DashboardLayout><ManualPerakaunanPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Analytics AI Route - All Staff Access */}
          <Route path="/analytics" element={user && ['superadmin', 'admin', 'bendahari', 'sub_bendahari', 'guru_kelas', 'guru_homeroom', 'warden', 'guard', 'bus_admin', 'koop_admin'].includes(user.role) ? <DashboardLayout>{user.role === 'bus_admin' ? <BusAdminAnalyticsPage /> : <AnalyticsAIPage />}</DashboardLayout> : <Navigate to="/login" />} />
          
          {/* AGM Route - SuperAdmin, Admin, Guru Access */}
          <Route path="/agm" element={user && ['superadmin', 'admin', 'bendahari', 'sub_bendahari', 'guru_kelas', 'guru_homeroom'].includes(user.role) ? <DashboardLayout><AGMPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Bus Admin Routes */}
          <Route path="/bus-admin" element={user?.role === 'bus_admin' ? <DashboardLayout><BusAdminDashboardPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/bus-admin/company" element={user?.role === 'bus_admin' ? <DashboardLayout><BusAdminCompaniesPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/bus-admin/buses" element={user?.role === 'bus_admin' ? <DashboardLayout><BusAdminBusesPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/bus-admin/routes" element={user?.role === 'bus_admin' ? <DashboardLayout><BusAdminRoutesPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/bus-admin/trips" element={user?.role === 'bus_admin' ? <DashboardLayout><BusAdminTripsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/bus-admin/bookings" element={user?.role === 'bus_admin' ? <DashboardLayout><BusAdminBookingsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/bus-admin/drivers" element={user?.role === 'bus_admin' ? <DashboardLayout><BusAdminDriversPage /></DashboardLayout> : <Navigate to="/login" />} />

          {/* Driver Bas Routes */}
          <Route path="/driver-bas" element={user?.role === 'bus_driver' ? <DashboardLayout><DriverBasDashboardPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/driver-bas/trip/:tripId" element={user?.role === 'bus_driver' ? <DashboardLayout><DriverBasTripPage /></DashboardLayout> : <Navigate to="/login" />} />

          {/* Ibu bapa: Peta live bas */}
          <Route path="/bus-tickets/live-map" element={user?.role === 'parent' ? <DashboardLayout><BusLiveMapPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/bus-tickets/live-map/:tripId" element={user ? <DashboardLayout><BusLiveMapPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Koperasi Routes */}
          <Route path="/koperasi" element={user?.role === 'parent' ? <DashboardLayout><KoperasiPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/koperasi/orders" element={user?.role === 'parent' ? <DashboardLayout><NewKoperasiOrdersPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/koop-admin" element={['superadmin', 'admin', 'koop_admin'].includes(user?.role) ? <DashboardLayout><NewAdminKoperasiPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/koperasi" element={['superadmin', 'admin', 'koop_admin', 'bendahari', 'sub_bendahari'].includes(user?.role) ? <DashboardLayout><NewAdminKoperasiPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Universal Inventory Management */}
          <Route path="/admin/inventory" element={['superadmin', 'admin', 'koop_admin'].includes(user?.role) ? <DashboardLayout><UniversalInventoryPage token={token} /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/categories" element={['superadmin', 'admin', 'koop_admin'].includes(user?.role) ? <DashboardLayout><CategoryManagementPage token={token} /></DashboardLayout> : <Navigate to="/login" />} />

          {/* Multi-Vendor Marketplace Routes */}
          <Route path="/admin/marketplace" element={['superadmin', 'admin', 'bendahari'].includes(user?.role) ? <DashboardLayout><AdminMarketplaceDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/marketplace/vendors" element={['superadmin', 'admin'].includes(user?.role) ? <DashboardLayout><VendorManagementPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/marketplace/products" element={['superadmin', 'admin'].includes(user?.role) ? <DashboardLayout><ProductManagementPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/marketplace/settings" element={user?.role === 'superadmin' ? <DashboardLayout><MarketplaceSettingsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/marketplace/finance" element={['superadmin', 'admin', 'bendahari'].includes(user?.role) ? <DashboardLayout><FinanceDashboardPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/marketplace/payouts" element={['superadmin', 'admin', 'bendahari'].includes(user?.role) ? <DashboardLayout><PayoutManagementPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/marketplace/ads" element={['superadmin', 'admin'].includes(user?.role) ? <DashboardLayout><AdsManagementPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/marketplace/monetization" element={['superadmin', 'admin', 'bendahari'].includes(user?.role) ? <DashboardLayout><MonetizationStatsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/marketplace/analytics" element={['superadmin', 'admin', 'bendahari'].includes(user?.role) ? <DashboardLayout><SalesAnalyticsPage /></DashboardLayout> : <Navigate to="/login" />} />

          {/* Vendor Dashboard Routes (Parents who are vendors) */}
          <Route path="/vendor" element={user?.role === 'parent' ? <DashboardLayout><VendorDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/register" element={user?.role === 'parent' ? <DashboardLayout><VendorRegisterPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/products" element={user?.role === 'parent' ? <DashboardLayout><VendorProductsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/products/new" element={user?.role === 'parent' ? <DashboardLayout><VendorProductFormPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/products/:productId/edit" element={user?.role === 'parent' ? <DashboardLayout><VendorProductFormPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/orders" element={user?.role === 'parent' ? <DashboardLayout><VendorOrdersPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/bundles" element={user?.role === 'parent' ? <DashboardLayout><VendorBundlesPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/bundles/new" element={user?.role === 'parent' ? <DashboardLayout><VendorBundleFormPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/bundles/:bundleId/edit" element={user?.role === 'parent' ? <DashboardLayout><VendorBundleFormPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/wallet" element={user?.role === 'parent' ? <DashboardLayout><VendorWalletPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/ads" element={user?.role === 'parent' ? <DashboardLayout><VendorAdsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/subscription" element={user?.role === 'parent' ? <DashboardLayout><VendorSubscriptionPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/boost" element={user?.role === 'parent' ? <DashboardLayout><VendorBoostPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/vendor/analytics" element={user?.role === 'parent' ? <DashboardLayout><VendorAnalyticsPage /></DashboardLayout> : <Navigate to="/login" />} />

          {/* Parent: Jadual Guru Asrama (read-only) */}
          <Route path="/jadual-guru-asrama" element={user?.role === 'parent' ? <DashboardLayout><ParentWardenSchedulePage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/hostel" element={user?.role === 'parent' ? <DashboardLayout><ParentHostelPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/hostel/permohonan" element={user?.role === 'parent' ? <DashboardLayout><ParentHostelPage /></DashboardLayout> : <Navigate to="/login" />} />
          {/* Complaints Routes */}
          <Route path="/complaints" element={user && ['parent', 'pelajar', 'superadmin'].includes(user.role) ? <DashboardLayout><ComplaintsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/complaints" element={user && ['admin', 'superadmin', 'warden', 'bendahari'].includes(user.role) ? <DashboardLayout><AdminComplaintsPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Warden Management Routes */}
          <Route path="/warden/schedules" element={user && ['admin', 'superadmin', 'warden'].includes(user.role) ? <DashboardLayout><WardenSchedulesPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/warden/pbw-pbp" element={user && ['admin', 'superadmin', 'warden'].includes(user.role) ? <DashboardLayout><WardenPbwPbpPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/warden/ar" element={user && ['admin', 'superadmin', 'warden', 'bendahari', 'sub_bendahari'].includes(user?.role) ? <DashboardLayout><WardenARPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Guru Kelas Management (Admin/SuperAdmin) */}
          <Route path="/admin/guru-kelas" element={user && ['admin', 'superadmin'].includes(user.role) ? <DashboardLayout><GuruKelasManagement /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/admin/discipline" element={user && ['admin', 'superadmin', 'warden'].includes(user.role) ? <DashboardLayout><DisciplinePage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Hostel / e-Asrama Pintar (integrated, real MongoDB) */}
          <Route path="/hostel" element={user && ['admin', 'superadmin', 'warden'].includes(user.role) ? <DashboardLayout><HostelDashboardPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/hostel/blocks" element={user && ['admin', 'superadmin', 'warden'].includes(user.role) ? <DashboardLayout><HostelBlocksPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Guru Routes */}
          <Route path="/guru" element={user && ['guru_kelas', 'guru_homeroom'].includes(user.role) ? <DashboardLayout><NewGuruDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/guru/students" element={user && ['guru_kelas', 'guru_homeroom'].includes(user.role) ? <DashboardLayout><TeacherStudentsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/guru/fees" element={user && ['guru_kelas', 'guru_homeroom'].includes(user.role) ? <DashboardLayout><TeacherFeesPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/guru/notifications" element={user && ['guru_kelas', 'guru_homeroom'].includes(user.role) ? <DashboardLayout><GuruNotificationsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/guru/class-dashboard" element={user && ['guru_kelas', 'guru_homeroom'].includes(user.role) ? <DashboardLayout><NewGuruClassDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Warden Routes */}
          <Route path="/warden" element={user?.role === 'warden' ? <DashboardLayout><NewWardenDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/warden/hostel" element={user?.role === 'warden' ? <DashboardLayout><NewWardenDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/warden/sickbay" element={user?.role === 'warden' ? <DashboardLayout><NewSickBayPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/warden/analytics" element={user?.role === 'warden' ? <DashboardLayout><WardenAnalyticsPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/warden/asrama" element={user?.role === 'warden' ? <DashboardLayout><WardenAsramaPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Guard Routes */}
          <Route path="/guard" element={user?.role === 'guard' ? <DashboardLayout><NewGuardDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/guard/vehicles" element={user?.role === 'guard' ? <DashboardLayout><NewGuardDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          
          {/* Pelajar Routes (Hostel) */}
          <Route path="/pelajar" element={user?.role === 'pelajar' ? <DashboardLayout><NewPelajarDashboard /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/pelajar/fees" element={user?.role === 'pelajar' ? <DashboardLayout><NewFeesPage /></DashboardLayout> : <Navigate to="/login" />} />
          <Route path="/pelajar/hostel" element={user?.role === 'pelajar' ? <DashboardLayout><PelajarHostelPage /></DashboardLayout> : <Navigate to="/login" />} />
          
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        <AIChatWidget />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
      </CartProvider>
        </AuthContext.Provider>
        </PortalConfigProvider>
      )
  );

  return (
    <>
      {mainContent}
      {(loading || showSplash) && (
        <AnimatePresence>
          <SplashScreen key="splash" config={splashConfig} />
        </AnimatePresence>
      )}
    </>
  );
};

export default App;
