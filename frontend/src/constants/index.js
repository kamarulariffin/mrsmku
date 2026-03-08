import { 
  Shield, Users, Wallet, BookOpen, Home, Building, Bus, 
  ShoppingCart, GraduationCap 
} from 'lucide-react';

export const MALAYSIAN_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 
  'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 
  'Sarawak', 'Selangor', 'Terengganu', 'W.P. Kuala Lumpur', 
  'W.P. Labuan', 'W.P. Putrajaya'
];

export const ROLES = {
  superadmin: { name: 'Super Admin', icon: Shield, color: 'bg-red-100 text-red-700' },
  admin: { name: 'Admin MRSMKU', icon: Users, color: 'bg-pastel-lavender text-violet-700' },
  bendahari: { name: 'Bendahari', icon: Wallet, color: 'bg-green-100 text-green-700' },
  sub_bendahari: { name: 'Sub Bendahari', icon: Wallet, color: 'bg-emerald-100 text-emerald-700' },
  guru_kelas: { name: 'Guru Kelas', icon: BookOpen, color: 'bg-blue-100 text-blue-700' },
  guru_homeroom: { name: 'Guru HomeRoom', icon: Home, color: 'bg-pastel-mint text-teal-700' },
  warden: { name: 'Warden', icon: Building, color: 'bg-orange-100 text-orange-700' },
  guard: { name: 'Pengawal', icon: Shield, color: 'bg-slate-100 text-slate-700' },
  bus_admin: { name: 'Admin Bas', icon: Bus, color: 'bg-cyan-100 text-cyan-700' },
  koop_admin: { name: 'Admin Koperasi', icon: ShoppingCart, color: 'bg-lime-100 text-lime-700' },
  parent: { name: 'Ibu Bapa', icon: Users, color: 'bg-teal-100 text-teal-700' },
  pelajar: { name: 'Pelajar', icon: GraduationCap, color: 'bg-amber-100 text-amber-700' }
};

export const FEE_CATEGORIES = { 
  yuran_pendaftaran: 'Yuran Pendaftaran', 
  wang_caruman: 'Wang Caruman', 
  muafakat: 'Muafakat', 
  program_kecemerlangan: 'Program Kecemerlangan', 
  koperasi: 'Koperasi', 
  asrama: 'Asrama' 
};

export const DONATION_CATEGORIES = {
  tabung_pelajar: { name: 'Tabung Pelajar', icon: '🎓', color: 'from-blue-500 to-blue-600' },
  tabung_masjid: { name: 'Tabung Surau', icon: '🕌', color: 'from-green-500 to-green-600' },
  tabung_asrama: { name: 'Tabung Asrama', icon: '🏠', color: 'from-violet-500 to-fuchsia-500' },
  tabung_kecemasan: { name: 'Tabung Kecemasan', icon: '🆘', color: 'from-red-500 to-red-600' },
  tabung_anak_yatim: { name: 'Tabung Anak Yatim', icon: '💝', color: 'from-pink-500 to-pink-600' }
};

/** Label dan warna tingkatan (T1–T5) – satu sumber untuk UI */
export const TINGKATAN_LABELS = {
  1: 'Tingkatan 1',
  2: 'Tingkatan 2',
  3: 'Tingkatan 3',
  4: 'Tingkatan 4',
  5: 'Tingkatan 5'
};

export const TINGKATAN_COLORS = {
  1: { bg: 'from-blue-500 to-cyan-500', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', glow: 'shadow-blue-500/30', icon: 'bg-blue-100 text-blue-600' },
  2: { bg: 'from-violet-500 to-fuchsia-500', light: 'bg-pastel-lavender', text: 'text-violet-700', border: 'border-pastel-lilac', glow: 'shadow-pastel', icon: 'bg-pastel-lavender text-violet-600' },
  3: { bg: 'from-amber-500 to-orange-500', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', glow: 'shadow-amber-500/30', icon: 'bg-amber-100 text-amber-600' },
  4: { bg: 'from-emerald-500 to-teal-500', light: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', glow: 'shadow-emerald-500/30', icon: 'bg-emerald-100 text-emerald-600' },
  5: { bg: 'from-rose-500 to-red-500', light: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', glow: 'shadow-rose-500/30', icon: 'bg-rose-100 text-rose-600' }
};
