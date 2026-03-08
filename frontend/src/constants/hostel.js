/**
 * Shared constants for hostel-related pages (pelajar & parent).
 */

/** Format date string (YYYY-MM-DD or ISO) to Malaysian dd-mm-yyyy for display. */
export function formatDateDMY(dateStr) {
  if (!dateStr) return '';
  const s = String(dateStr).trim().slice(0, 10);
  const parts = s.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
  }
  return s;
}

export const STATUS_MAP = {
  pending: { label: 'Menunggu', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  approved: { label: 'Lulus', color: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  rejected: { label: 'Ditolak', color: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
};

export const LEAVE_KATEGORI_OPTIONS = [
  { value: 'pertandingan', label: 'Pertandingan' },
  { value: 'lawatan', label: 'Lawatan' },
  { value: 'aktiviti', label: 'Aktiviti' },
  { value: 'kem_motivasi', label: 'Kem Motivasi' },
  { value: 'kecemasan', label: 'Kecemasan' },
  { value: 'sakit', label: 'Sakit' },
  { value: 'program_rasmi', label: 'Program Rasmi' },
];

/** Kategori untuk tab Aktiviti Rasmi Maktab sahaja (kecemasan & sakit ada tab sendiri). */
export const LEAVE_KATEGORI_OPTIONS_URUSAN_LAIN = LEAVE_KATEGORI_OPTIONS.filter((o) => o.value !== 'kecemasan' && o.value !== 'sakit');

/** Cara pulang bermalam — disegerakkan dengan backend (hostel) dan data keluar/masuk pelajar. */
export const CARA_PULANG_OPTIONS = [
  { value: 'ibu_bapa', label: 'Dibawa pulang oleh ibu bapa' },
  { value: 'bas', label: 'Pulang menaiki bas' },
  { value: 'ibu_saudara', label: 'Kenderaan ibu saudara' },
  { value: 'bapa_saudara', label: 'Kenderaan bapa saudara' },
  { value: 'adik_beradik', label: 'Kenderaan adik-beradik' },
  { value: 'saudara', label: 'Kenderaan saudara (umum)' },
  { value: 'kenalan', label: 'Menumpang kereta kenalan' },
  { value: 'lain_lain', label: 'Lain-lain (nyatakan dalam catatan)' },
];

/** Nilai cara_pulang yang memerlukan No. Plat Kenderaan. */
export const CARA_PULANG_NEEDS_PLATE = [
  'ibu_bapa', 'ibu_saudara', 'bapa_saudara', 'adik_beradik', 'saudara', 'kenalan',
];

/** Nilai cara_pulang yang memerlukan catatan (bas: remarks bas; lain_lain: nyatakan cara). */
export const CARA_PULANG_NEEDS_REMARKS = ['bas', 'lain_lain'];

export const MAX_LEAVE_FILES = 5;

export const ACCEPT_LEAVE_FILES = '.pdf,.jpg,.jpeg,.png,.webp';
