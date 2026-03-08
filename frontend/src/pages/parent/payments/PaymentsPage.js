import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Receipt, History, Download, GraduationCap, Bus, Heart, Package,
  CheckCircle2, RefreshCw, ArrowRight, FileText, Clock3, Users, Wallet, AlertCircle, ChevronDown, ChevronUp, Printer
} from 'lucide-react';
import api from '../../../services/api';
import { Card, Spinner } from '../../../components/common';
import logoMrsm from '../../../assets/invoice/logo-mrsm.png';
import logoMuafakat from '../../../assets/invoice/logo-muafakat.png';
import {
  DEFAULT_INVOICE_TEMPLATE,
  normalizeInvoiceTemplate,
  resolveInvoiceTemplateAssetUrl,
} from '../../../utils/invoiceTemplate';

const PAYMENTS_FILTER_STORAGE_KEY = 'mrsm_payments_filters_v1';
const ALLOWED_CATEGORY_FILTERS = new Set(['all', 'yuran', 'tiket', 'sumbangan', 'lain']);

const getItemIcon = (type) => {
  switch (type) {
    case 'yuran':
    case 'yuran_partial':
    case 'yuran_installment':
    case 'yuran_two_payment':
      return <GraduationCap className="text-amber-500" size={18} />;
    case 'bus':
      return <Bus className="text-cyan-500" size={18} />;
    case 'infaq':
      return <Heart className="text-pink-500" size={18} />;
    default:
      return <Package className="text-slate-400" size={18} />;
  }
};

const filterReceiptByCategory = (receipt, category) => {
  if (category === 'all') return true;
  if (category === 'yuran') return receipt.items?.some((i) => (i.item_type || '').includes('yuran'));
  if (category === 'tiket') return receipt.items?.some((i) => i.item_type === 'bus');
  if (category === 'sumbangan') return receipt.items?.some((i) => i.item_type === 'infaq');
  if (category === 'lain') return true;
  return true;
};

const normalizeTingkatan = (value) => {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const numberMatch = raw.match(/(\d+)/);
  if (numberMatch?.[1]) return numberMatch[1];
  return raw.toLowerCase();
};

const extractItemTingkatan = (item) => {
  const metadata = item?.metadata || {};
  const candidates = [
    metadata.tingkatan,
    metadata.student_tingkatan,
    item?.tingkatan,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeTingkatan(candidate);
    if (normalized) return normalized;
  }
  const description = `${item?.description || ''} ${item?.name || ''}`;
  const fromText = description.match(/tingkatan\s*([0-9]+)/i);
  return fromText?.[1] ? normalizeTingkatan(fromText[1]) : '';
};

const compareTingkatanValues = (a, b) => {
  const aNum = Number(a);
  const bNum = Number(b);
  const aIsNum = !Number.isNaN(aNum);
  const bIsNum = !Number.isNaN(bNum);
  if (aIsNum && bIsNum) return aNum - bNum;
  if (aIsNum) return -1;
  if (bIsNum) return 1;
  return String(a).localeCompare(String(b), 'ms');
};

const getReceiptTingkatanValues = (receipt) => {
  const values = new Set();
  (receipt?.items || []).forEach((item) => {
    const tingkatan = extractItemTingkatan(item);
    if (tingkatan) values.add(tingkatan);
  });
  return Array.from(values).sort(compareTingkatanValues);
};

const getReceiptChildNames = (receipt) => {
  const names = new Set();
  (receipt?.items || []).forEach((item) => {
    const metadata = item?.metadata || {};
    const rawName = String(
      metadata.student_name ||
      metadata.child_name ||
      item?.student_name ||
      item?.child_name ||
      ''
    ).trim();
    if (rawName) names.add(rawName);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'ms'));
};

const getReceiptPrimaryChildName = (receipt) => {
  const names = getReceiptChildNames(receipt);
  return names.length > 0 ? names[0] : 'Anak tidak dikenal pasti';
};

const filterReceiptByTingkatan = (receipt, selectedTingkatan) => {
  if (!selectedTingkatan) return true;
  return (receipt.items || []).some((item) => extractItemTingkatan(item) === selectedTingkatan);
};

const getTingkatanLabel = (tingkatanValue) => {
  const value = String(tingkatanValue || '').trim();
  if (!value) return 'Tingkatan';
  return /^\d+$/.test(value) ? `Tingkatan ${value}` : `Tingkatan ${value.toUpperCase()}`;
};

const getInvoiceStatusLabel = (status) => {
  if (status === 'paid') return 'PAID';
  if (status === 'partial') return 'PARTIAL PAID';
  return 'UNPAID';
};

const getInvoiceStatusMalayLabel = (status) => {
  if (status === 'paid') return 'Lunas';
  if (status === 'partial') return 'Bayaran Belum Selesai';
  return 'Belum Bayar';
};

const getInvoiceStatusClass = (status) => {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'partial') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const formatDateTimeMs = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ms-MY');
};

const formatDateOnlyMs = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatPaymentMethodLabel = (methodValue) => {
  const text = String(methodValue || '').trim();
  if (!text) return 'N/A';
  return text.replace(/_/g, ' ').toUpperCase();
};

const buildInvoiceNumberLabel = (invoice, index) => {
  const explicit = String(invoice?.invoice_number || invoice?.receipt_number || '').trim();
  if (explicit) return explicit;
  const rawId = String(invoice?.id || invoice?._id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (rawId) return `INV-${rawId.slice(-8)}`;
  return `INV-${String(index + 1).padStart(3, '0')}`;
};

const CODE39_PATTERNS = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw',
  B: 'nnwnnwnnw',
  C: 'wnwnnwnnn',
  D: 'nnnnwwnnw',
  E: 'wnnnwwnnn',
  F: 'nnwnwwnnn',
  G: 'nnnnnwwnw',
  H: 'wnnnnwwnn',
  I: 'nnwnnwwnn',
  J: 'nnnnwwwnn',
  K: 'wnnnnnnww',
  L: 'nnwnnnnww',
  M: 'wnwnnnnwn',
  N: 'nnnnwnnww',
  O: 'wnnnwnnwn',
  P: 'nnwnwnnwn',
  Q: 'nnnnnnwww',
  R: 'wnnnnnwwn',
  S: 'nnwnnnwwn',
  T: 'nnnnwnwwn',
  U: 'wwnnnnnnw',
  V: 'nwwnnnnnw',
  W: 'wwwnnnnnn',
  X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn',
  '+': 'nwnnnwnwn',
  '%': 'nnnwnwnwn',
  '*': 'nwnnwnwnn',
};

const sanitizeInvoiceBarcodeValue = (rawValue) => {
  const normalized = String(rawValue || '')
    .toUpperCase()
    .replace(/[^0-9A-Z\-\.\$\/\+\%\s]/g, '-')
    .trim();
  return normalized || 'INV-0001';
};

const buildInvoiceBarcodeValue = (invoice, index) => {
  const explicit = String(invoice?.invoice_barcode || invoice?.barcode_number || invoice?.invoice_barcode_value || '').trim();
  return sanitizeInvoiceBarcodeValue(explicit || buildInvoiceNumberLabel(invoice, index));
};

const InvoiceBarcode = ({ value, className = '' }) => {
  const normalized = sanitizeInvoiceBarcodeValue(value);
  const encoded = `*${normalized}*`;
  const narrowWidth = 2;
  const wideWidth = 5;
  const interCharGap = 2;
  const barcodeHeight = 52;

  const bars = [];
  let cursor = 0;

  encoded.split('').forEach((char, charIdx) => {
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS['-'];
    for (let i = 0; i < pattern.length; i += 1) {
      const isBar = i % 2 === 0;
      const width = pattern[i] === 'w' ? wideWidth : narrowWidth;
      if (isBar) {
        bars.push(
          <rect
            key={`${charIdx}-${i}-${cursor}`}
            x={cursor}
            y={0}
            width={width}
            height={barcodeHeight}
            fill="#0f172a"
          />
        );
      }
      cursor += width;
    }
    if (charIdx < encoded.length - 1) {
      cursor += interCharGap;
    }
  });

  return (
    <div className={`inline-flex flex-col items-start ${className}`}>
      <svg
        role="img"
        aria-label={`Kod bar invois ${normalized}`}
        width={cursor}
        height={barcodeHeight}
        viewBox={`0 0 ${cursor} ${barcodeHeight}`}
      >
        {bars}
      </svg>
      <p className="mt-1 text-[11px] font-medium tracking-[0.2em] text-slate-600">{normalized}</p>
    </div>
  );
};

const getInvoiceItemTotalAmount = (item) => {
  return Number(item?.amount || 0) * Number(item?.quantity || 1);
};

const formatCurrency = (value) => `RM ${Number(value || 0).toFixed(2)}`;

const hasFooterBoxContent = (box) => {
  if (!box || typeof box !== 'object') return false;
  if (String(box.image_url || '').trim()) return true;
  if (String(box.title || '').trim()) return true;
  if (Array.isArray(box.rows) && box.rows.some((row) => String(row || '').trim())) return true;
  return Array.isArray(box.upload_rows)
    && box.upload_rows.some((row) => String(row?.image_url || '').trim() || String(row?.caption || '').trim());
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const getDaysUntilDueDate = (dueDateValue) => {
  if (!dueDateValue) return null;
  const dueDate = new Date(dueDateValue);
  if (Number.isNaN(dueDate.getTime())) return null;
  const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((dueStart - todayStart) / DAY_IN_MS);
};

const getChildDueUrgencyMeta = ({ dueDate, outstandingAmount }) => {
  if (Number(outstandingAmount || 0) <= 0) {
    return {
      level: 'none',
      label: 'Tiada tindakan segera',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      cardClass: 'border-slate-200 bg-white',
      textClass: 'text-slate-500',
      showTodayBadge: false,
    };
  }

  const daysUntilDue = getDaysUntilDueDate(dueDate);
  if (daysUntilDue === null) {
    return {
      level: 'unknown',
      label: 'Tarikh akhir belum ditetapkan',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      cardClass: 'border-slate-300 bg-slate-50/40',
      textClass: 'text-slate-600',
      showTodayBadge: false,
    };
  }

  if (daysUntilDue < 0) {
    return {
      level: 'overdue',
      label: `Lewat ${Math.abs(daysUntilDue)} hari`,
      badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
      cardClass: 'border-rose-300 bg-rose-50/30',
      textClass: 'text-rose-700',
      showTodayBadge: false,
    };
  }

  if (daysUntilDue === 0) {
    return {
      level: 'today',
      label: 'Perlu tindakan hari ini',
      badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
      cardClass: 'border-rose-300 bg-rose-50/40',
      textClass: 'text-rose-700',
      showTodayBadge: true,
    };
  }

  if (daysUntilDue <= 3) {
    return {
      level: 'soon',
      label: `Tarikh akhir ${daysUntilDue} hari lagi`,
      badgeClass: 'bg-orange-100 text-orange-700 border-orange-200',
      cardClass: 'border-orange-200 bg-orange-50/30',
      textClass: 'text-orange-700',
      showTodayBadge: false,
    };
  }

  if (daysUntilDue <= 7) {
    return {
      level: 'watch',
      label: `Tarikh akhir ${daysUntilDue} hari lagi`,
      badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
      cardClass: 'border-amber-200 bg-amber-50/25',
      textClass: 'text-amber-700',
      showTodayBadge: false,
    };
  }

  return {
    level: 'healthy',
    label: `Tarikh akhir ${daysUntilDue} hari lagi`,
    badgeClass: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    cardClass: 'border-cyan-200 bg-cyan-50/20',
    textClass: 'text-cyan-700',
    showTodayBadge: false,
  };
};

const getChildPaymentStatusMeta = ({ outstandingAmount, paidAmount, dueUrgencyLevel }) => {
  if (Number(outstandingAmount || 0) <= 0) {
    return {
      label: 'Semua invoice selesai',
      badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      progressClass: 'bg-emerald-500',
    };
  }

  if (dueUrgencyLevel === 'today' || dueUrgencyLevel === 'overdue') {
    return {
      label: 'Tindakan segera diperlukan',
      badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
      progressClass: 'bg-rose-500',
    };
  }

  if (dueUrgencyLevel === 'soon' || dueUrgencyLevel === 'watch') {
    return {
      label: 'Perlu perhatian segera',
      badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
      progressClass: 'bg-amber-500',
    };
  }

  if (Number(paidAmount || 0) > 0) {
    return {
      label: 'Masih berbaki (separa)',
      badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
      progressClass: 'bg-amber-500',
    };
  }
  return {
    label: 'Belum bayar',
    badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
    progressClass: 'bg-rose-500',
  };
};

const loadSavedPaymentsFilters = () => {
  const fallback = {
    selectedYear: null,
    categoryFilter: 'all',
    selectedTingkatan: null,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(PAYMENTS_FILTER_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);

    const parsedYear = Number(parsed?.selectedYear);
    const selectedYear = Number.isFinite(parsedYear) ? parsedYear : null;

    const categoryRaw = String(parsed?.categoryFilter || '').trim();
    const categoryFilter = ALLOWED_CATEGORY_FILTERS.has(categoryRaw) ? categoryRaw : 'all';

    const selectedTingkatan = normalizeTingkatan(parsed?.selectedTingkatan) || null;

    return { selectedYear, categoryFilter, selectedTingkatan };
  } catch {
    return fallback;
  }
};

const persistPaymentsFilters = ({ selectedYear, categoryFilter, selectedTingkatan }) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PAYMENTS_FILTER_STORAGE_KEY,
      JSON.stringify({
        selectedYear: selectedYear ?? null,
        categoryFilter: ALLOWED_CATEGORY_FILTERS.has(categoryFilter) ? categoryFilter : 'all',
        selectedTingkatan: selectedTingkatan || null,
      })
    );
  } catch {
    // Ignore storage failures, page should still work normally.
  }
};

export const PaymentsPage = () => {
  const [activeTab, setActiveTab] = useState('receipts');
  const [receipts, setReceipts] = useState([]);
  const [, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedTingkatan, setSelectedTingkatan] = useState(null);
  const [selectedReceiptChild, setSelectedReceiptChild] = useState('');
  const [hasHydratedSavedFilters, setHasHydratedSavedFilters] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [invoicesByChild, setInvoicesByChild] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const [invoiceYearFilter, setInvoiceYearFilter] = useState(null);
  const [invoiceTingkatanFilter, setInvoiceTingkatanFilter] = useState(null);
  const [selectedInvoiceChild, setSelectedInvoiceChild] = useState('');
  const [showAdvancedReceiptFilters, setShowAdvancedReceiptFilters] = useState(false);
  const [showAdvancedInvoiceFilters, setShowAdvancedInvoiceFilters] = useState(false);
  const [showChildInvoiceModal, setShowChildInvoiceModal] = useState(false);
  const [selectedChildInvoiceProfile, setSelectedChildInvoiceProfile] = useState(null);
  const [selectedChildInvoiceId, setSelectedChildInvoiceId] = useState('');
  const [invoiceGeneratedAt, setInvoiceGeneratedAt] = useState(() => new Date().toISOString());
  const [downloadingInvoicePdf, setDownloadingInvoicePdf] = useState(false);
  const [invoiceTemplateSettings, setInvoiceTemplateSettings] = useState(DEFAULT_INVOICE_TEMPLATE);
  const [invoiceTemplateMeta, setInvoiceTemplateMeta] = useState({ updated_at: null, updated_by: '' });
  const invoiceDocumentRef = useRef(null);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/payment-center/receipts?limit=200');
      setReceipts(res.data.receipts || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toast.error('Gagal memuatkan sejarah pembayaran');
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const res = await api.get('/api/yuran/anak-saya');
      setInvoicesByChild(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error('Gagal memuatkan invoice yuran');
      setInvoicesByChild([]);
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  const fetchInvoiceTemplateSettings = useCallback(async () => {
    try {
      const res = await api.get('/api/yuran/settings/invoice-template');
      setInvoiceTemplateSettings(normalizeInvoiceTemplate(res.data?.template));
      setInvoiceTemplateMeta({
        updated_at: res.data?.updated_at || null,
        updated_by: res.data?.updated_by || '',
      });
    } catch (err) {
      console.error('Gagal memuatkan tetapan template invois:', err);
      setInvoiceTemplateSettings(DEFAULT_INVOICE_TEMPLATE);
      setInvoiceTemplateMeta({ updated_at: null, updated_by: '' });
    }
  }, []);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    fetchInvoiceTemplateSettings();
  }, [fetchInvoiceTemplateSettings]);

  useEffect(() => {
    const savedFilters = loadSavedPaymentsFilters();
    setSelectedYear(savedFilters.selectedYear);
    setCategoryFilter(savedFilters.categoryFilter);
    setSelectedTingkatan(savedFilters.selectedTingkatan);
    setHasHydratedSavedFilters(true);
  }, []);

  const years = React.useMemo(() => {
    const set = new Set();
    (receipts || []).forEach((r) => {
      const d = r.payment_date ? new Date(r.payment_date) : null;
      if (d && !isNaN(d.getFullYear())) set.add(d.getFullYear());
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [receipts]);

  const tingkatanOptions = React.useMemo(() => {
    const values = new Set();
    (receipts || []).forEach((receipt) => {
      (receipt.items || []).forEach((item) => {
        const tingkatan = extractItemTingkatan(item);
        if (tingkatan) values.add(tingkatan);
      });
    });
    return Array.from(values).sort(compareTingkatanValues);
  }, [receipts]);

  const receiptChildOptions = React.useMemo(() => {
    const values = new Set();
    (receipts || []).forEach((receipt) => {
      getReceiptChildNames(receipt).forEach((name) => values.add(name));
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'ms'));
  }, [receipts]);

  useEffect(() => {
    if (selectedYear !== null && !years.includes(selectedYear)) {
      setSelectedYear(null);
    }
  }, [selectedYear, years]);

  useEffect(() => {
    if (selectedTingkatan && !tingkatanOptions.includes(selectedTingkatan)) {
      setSelectedTingkatan(null);
    }
  }, [selectedTingkatan, tingkatanOptions]);

  useEffect(() => {
    if (selectedReceiptChild && !receiptChildOptions.includes(selectedReceiptChild)) {
      setSelectedReceiptChild('');
    }
  }, [selectedReceiptChild, receiptChildOptions]);

  useEffect(() => {
    if (selectedTingkatan !== null) {
      setShowAdvancedReceiptFilters(true);
    }
  }, [selectedTingkatan]);

  useEffect(() => {
    if (!hasHydratedSavedFilters) return;
    persistPaymentsFilters({
      selectedYear,
      categoryFilter,
      selectedTingkatan,
    });
  }, [hasHydratedSavedFilters, selectedYear, categoryFilter, selectedTingkatan]);

  const filteredReceipts = React.useMemo(() => {
    let list = receipts || [];
    if (selectedYear !== null) {
      list = list.filter((r) => {
        const d = r.payment_date ? new Date(r.payment_date) : null;
        return d && d.getFullYear() === selectedYear;
      });
    }
    return list.filter((receipt) => {
      const childMatch = !selectedReceiptChild || getReceiptChildNames(receipt).includes(selectedReceiptChild);
      return (
        filterReceiptByCategory(receipt, categoryFilter) &&
        filterReceiptByTingkatan(receipt, selectedTingkatan) &&
        childMatch
      );
    });
  }, [receipts, selectedYear, categoryFilter, selectedTingkatan, selectedReceiptChild]);

  const invoiceRecords = React.useMemo(() => {
    const flattened = [];
    (invoicesByChild || []).forEach((child) => {
      const allInvoices = child?.all_yuran || [];
      allInvoices.forEach((invoice, invoiceIndex) => {
        flattened.push({
          ...invoice,
          student_name: child?.name || invoice?.student_name || '',
          matric_number: child?.matric_number || invoice?.matric_number || '',
          student_id: child?.student_id || invoice?.student_id || '',
          current_form: child?.current_form || invoice?.tingkatan || null,
          current_year: child?.current_year || null,
          invoice_number_label: buildInvoiceNumberLabel(invoice, invoiceIndex),
          invoice_barcode_value: buildInvoiceBarcodeValue(invoice, invoiceIndex),
        });
      });
    });
    return flattened.sort((a, b) =>
      Number(b?.tahun || 0) - Number(a?.tahun || 0) ||
      Number(b?.tingkatan || 0) - Number(a?.tingkatan || 0) ||
      String(a?.student_name || '').localeCompare(String(b?.student_name || ''), 'ms')
    );
  }, [invoicesByChild]);

  const childReceiptStats = React.useMemo(() => {
    const statsByChild = new Map();
    (receipts || []).forEach((receipt) => {
      const groupedByChild = new Map();
      (receipt.items || []).forEach((item) => {
        const metadata = item?.metadata || {};
        const childId = String(metadata.student_id || metadata.child_id || item?.student_id || '').trim();
        const childName = String(metadata.student_name || metadata.child_name || item?.student_name || '').trim();
        const childKey = childId ? `id:${childId}` : childName ? `name:${childName.toLowerCase()}` : '';
        if (!childKey) return;
        const current = groupedByChild.get(childKey) || { amount: 0 };
        current.amount += Number(item?.amount || 0) * Number(item?.quantity || 1);
        groupedByChild.set(childKey, current);
      });

      groupedByChild.forEach((entry, childKey) => {
        const currentStats = statsByChild.get(childKey) || {
          receipt_count: 0,
          paid_total: 0,
          latest_payment_date: null,
        };
        const receiptDateMs = receipt?.payment_date ? new Date(receipt.payment_date).getTime() : 0;
        const latestDateMs = currentStats.latest_payment_date ? new Date(currentStats.latest_payment_date).getTime() : 0;
        const allocatedAmount = Number(entry.amount || 0);
        currentStats.receipt_count += 1;
        currentStats.paid_total += allocatedAmount > 0 ? allocatedAmount : Number(receipt?.total_amount || 0);
        if (receiptDateMs > latestDateMs) {
          currentStats.latest_payment_date = receipt?.payment_date || currentStats.latest_payment_date;
        }
        statsByChild.set(childKey, currentStats);
      });
    });
    return statsByChild;
  }, [receipts]);

  const childPaymentBoxes = React.useMemo(() => {
    return (invoicesByChild || []).map((child, index) => {
      const allInvoices = Array.isArray(child?.all_yuran) ? child.all_yuran : [];
      const childId = String(child?.student_id || '').trim();
      const childName = String(child?.name || child?.student_name || `Anak ${index + 1}`).trim();
      const childIdKey = childId ? `id:${childId}` : '';
      const childNameKey = childName ? `name:${childName.toLowerCase()}` : '';
      const matchedReceiptStats = (childIdKey && childReceiptStats.get(childIdKey))
        || (childNameKey && childReceiptStats.get(childNameKey))
        || { receipt_count: 0, paid_total: 0, latest_payment_date: null };

      let totalInvoiceAmount = 0;
      let totalPaidAmount = 0;
      let totalOutstandingAmount = 0;
      let activeInvoiceCount = 0;
      let nearestDueDate = null;

      const normalizedChildInvoices = allInvoices.map((invoice, invoiceIndex) => {
        const totalAmount = Number(invoice?.total_amount || 0);
        const paidAmount = Number(invoice?.paid_amount || 0);
        const outstandingAmount = Math.max(
          0,
          Number(
            invoice?.balance !== undefined && invoice?.balance !== null
              ? invoice.balance
              : totalAmount - paidAmount
          )
        );
        totalInvoiceAmount += totalAmount;
        totalPaidAmount += paidAmount;
        totalOutstandingAmount += outstandingAmount;
        if (outstandingAmount > 0) {
          activeInvoiceCount += 1;
        }
        if (invoice?.due_date) {
          const dueDateMs = new Date(invoice.due_date).getTime();
          const nearestDueDateMs = nearestDueDate ? new Date(nearestDueDate).getTime() : Number.POSITIVE_INFINITY;
          if (dueDateMs > 0 && dueDateMs < nearestDueDateMs) {
            nearestDueDate = invoice.due_date;
          }
        }
        const sortedPayments = [...(invoice?.payments || [])].sort(
          (a, b) => new Date(b?.paid_at || 0).getTime() - new Date(a?.paid_at || 0).getTime()
        );

        return {
          ...invoice,
          id: invoice?.id || invoice?._id || `${childId || 'child'}-${invoiceIndex + 1}`,
          total_amount_value: totalAmount,
          paid_amount_value: paidAmount,
          outstanding_amount_value: outstandingAmount,
          payment_history: sortedPayments,
          invoice_number_label: buildInvoiceNumberLabel(invoice, invoiceIndex),
          invoice_barcode_value: buildInvoiceBarcodeValue(invoice, invoiceIndex),
        };
      }).sort((a, b) =>
        Number(b?.tahun || 0) - Number(a?.tahun || 0) ||
        Number(b?.tingkatan || 0) - Number(a?.tingkatan || 0) ||
        String(a?.set_yuran_nama || '').localeCompare(String(b?.set_yuran_nama || ''), 'ms')
      );

      const progressPercent = totalInvoiceAmount > 0
        ? Math.round(Math.min(100, (totalPaidAmount / totalInvoiceAmount) * 100))
        : 0;

      return {
        child_id: childId,
        child_name: childName,
        matric_number: child?.matric_number || '-',
        current_form_label: getTingkatanLabel(child?.current_form || allInvoices?.[0]?.tingkatan || ''),
        invoice_count: allInvoices.length,
        active_invoice_count: activeInvoiceCount,
        total_invoice_amount: totalInvoiceAmount,
        total_paid_amount: totalPaidAmount,
        total_outstanding_amount: totalOutstandingAmount,
        progress_percent: progressPercent,
        nearest_due_date: nearestDueDate,
        receipt_count: Number(matchedReceiptStats?.receipt_count || 0),
        receipt_paid_total: Number(matchedReceiptStats?.paid_total || 0),
        latest_receipt_date: matchedReceiptStats?.latest_payment_date || null,
        child_invoices: normalizedChildInvoices,
      };
    }).sort((a, b) =>
      Number(b.total_outstanding_amount || 0) - Number(a.total_outstanding_amount || 0) ||
      String(a.child_name || '').localeCompare(String(b.child_name || ''), 'ms')
    );
  }, [invoicesByChild, childReceiptStats]);

  const childPaymentSummary = React.useMemo(() => {
    return childPaymentBoxes.reduce(
      (acc, child) => {
        acc.totalChildren += 1;
        acc.totalOutstanding += Number(child.total_outstanding_amount || 0);
        acc.totalPaid += Number(child.total_paid_amount || 0);
        if (Number(child.total_outstanding_amount || 0) <= 0) {
          acc.settledChildren += 1;
        } else if (Number(child.total_paid_amount || 0) > 0) {
          acc.partialChildren += 1;
        }
        return acc;
      },
      {
        totalChildren: 0,
        totalOutstanding: 0,
        totalPaid: 0,
        settledChildren: 0,
        partialChildren: 0,
      }
    );
  }, [childPaymentBoxes]);

  const invoiceYears = React.useMemo(() => {
    const yearsSet = new Set();
    invoiceRecords.forEach((invoice) => {
      const parsedYear = Number(invoice?.tahun);
      if (Number.isFinite(parsedYear) && parsedYear > 0) yearsSet.add(parsedYear);
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [invoiceRecords]);

  const invoiceTingkatanOptions = React.useMemo(() => {
    const tingkatanSet = new Set();
    invoiceRecords.forEach((invoice) => {
      const normalized = normalizeTingkatan(invoice?.tingkatan);
      if (normalized) tingkatanSet.add(normalized);
    });
    return Array.from(tingkatanSet).sort(compareTingkatanValues);
  }, [invoiceRecords]);

  const invoiceChildOptions = React.useMemo(() => {
    const values = new Set();
    invoiceRecords.forEach((invoice) => {
      const childName = String(invoice?.student_name || '').trim();
      if (childName) values.add(childName);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'ms'));
  }, [invoiceRecords]);

  useEffect(() => {
    if (invoiceYearFilter !== null && !invoiceYears.includes(invoiceYearFilter)) {
      setInvoiceYearFilter(null);
    }
  }, [invoiceYearFilter, invoiceYears]);

  useEffect(() => {
    if (invoiceTingkatanFilter && !invoiceTingkatanOptions.includes(invoiceTingkatanFilter)) {
      setInvoiceTingkatanFilter(null);
    }
  }, [invoiceTingkatanFilter, invoiceTingkatanOptions]);

  useEffect(() => {
    if (selectedInvoiceChild && !invoiceChildOptions.includes(selectedInvoiceChild)) {
      setSelectedInvoiceChild('');
    }
  }, [selectedInvoiceChild, invoiceChildOptions]);

  useEffect(() => {
    if (invoiceTingkatanFilter !== null) {
      setShowAdvancedInvoiceFilters(true);
    }
  }, [invoiceTingkatanFilter]);

  const filteredInvoices = React.useMemo(() => {
    return invoiceRecords.filter((invoice) => {
      const yearMatch = invoiceYearFilter === null || Number(invoice?.tahun) === Number(invoiceYearFilter);
      const tingkatanMatch = invoiceTingkatanFilter === null || normalizeTingkatan(invoice?.tingkatan) === invoiceTingkatanFilter;
      const statusMatch = invoiceStatusFilter === 'all' || String(invoice?.status || '') === invoiceStatusFilter;
      const childMatch = !selectedInvoiceChild || String(invoice?.student_name || '').trim() === selectedInvoiceChild;
      return yearMatch && tingkatanMatch && statusMatch && childMatch;
    });
  }, [invoiceRecords, invoiceYearFilter, invoiceTingkatanFilter, invoiceStatusFilter, selectedInvoiceChild]);

  const openChildInvoiceModal = useCallback((childBox) => {
    const invoices = Array.isArray(childBox?.child_invoices) ? childBox.child_invoices : [];
    fetchInvoiceTemplateSettings();
    setSelectedChildInvoiceProfile(childBox || null);
    setSelectedChildInvoiceId(invoices?.[0]?.id ? String(invoices[0].id) : '');
    setInvoiceGeneratedAt(new Date().toISOString());
    setShowChildInvoiceModal(true);
  }, [fetchInvoiceTemplateSettings]);

  const closeChildInvoiceModal = useCallback(() => {
    setShowChildInvoiceModal(false);
    setSelectedChildInvoiceProfile(null);
    setSelectedChildInvoiceId('');
    setInvoiceGeneratedAt(new Date().toISOString());
  }, []);

  const selectedChildInvoices = React.useMemo(() => {
    const invoices = Array.isArray(selectedChildInvoiceProfile?.child_invoices)
      ? selectedChildInvoiceProfile.child_invoices
      : [];
    if (!invoices.length) return [];

    const profileStudentId = String(selectedChildInvoiceProfile?.student_id || selectedChildInvoiceProfile?.child_id || '').trim();
    const profileMatric = String(selectedChildInvoiceProfile?.matric_number || '').trim().toLowerCase();
    const profileName = String(selectedChildInvoiceProfile?.child_name || '').trim().toLowerCase();

    const filtered = invoices.filter((invoice) => {
      const invoiceStudentId = String(invoice?.student_id || invoice?.child_id || '').trim();
      const invoiceMatric = String(invoice?.matric_number || '').trim().toLowerCase();
      const invoiceName = String(invoice?.student_name || '').trim().toLowerCase();

      if (profileStudentId && invoiceStudentId && profileStudentId === invoiceStudentId) return true;
      if (profileMatric && invoiceMatric && profileMatric === invoiceMatric) return true;
      if (profileName && invoiceName && profileName === invoiceName) return true;
      return !invoiceStudentId && !invoiceMatric && !invoiceName;
    });

    return filtered.length > 0 ? filtered : invoices;
  }, [selectedChildInvoiceProfile]);

  const activeChildInvoice = React.useMemo(() => {
    if (!selectedChildInvoices.length) return null;
    if (selectedChildInvoiceId) {
      const matched = selectedChildInvoices.find((invoice) => String(invoice?.id) === String(selectedChildInvoiceId));
      if (matched) return matched;
    }
    return selectedChildInvoices[0];
  }, [selectedChildInvoices, selectedChildInvoiceId]);

  const activeChildInvoiceItems = React.useMemo(() => {
    return Array.isArray(activeChildInvoice?.items) ? activeChildInvoice.items : [];
  }, [activeChildInvoice]);

  const activeChildInvoicePayments = React.useMemo(() => {
    if (Array.isArray(activeChildInvoice?.payment_history)) return activeChildInvoice.payment_history;
    return Array.isArray(activeChildInvoice?.payments) ? activeChildInvoice.payments : [];
  }, [activeChildInvoice]);

  const activeChildPaymentTotal = React.useMemo(() => {
    return activeChildInvoicePayments.reduce((sum, payment) => sum + Number(payment?.amount || 0), 0);
  }, [activeChildInvoicePayments]);

  const activeChildInvoiceFinancials = React.useMemo(() => {
    const total = Number(activeChildInvoice?.total_amount_value || activeChildInvoice?.total_amount || 0);
    const paid = Number(activeChildInvoice?.paid_amount_value || activeChildInvoice?.paid_amount || 0);
    const balance = Number(
      activeChildInvoice?.outstanding_amount_value
      ?? activeChildInvoice?.balance
      ?? Math.max(0, total - paid)
    );
    return { total, paid, balance };
  }, [activeChildInvoice]);
  const isActiveInvoiceFullyPaid = React.useMemo(() => {
    if (!activeChildInvoice) return false;
    const statusPaid = String(activeChildInvoice?.status || '').toLowerCase() === 'paid';
    return statusPaid || Number(activeChildInvoiceFinancials.balance || 0) <= 0;
  }, [activeChildInvoice, activeChildInvoiceFinancials.balance]);

  const invoiceTemplate = React.useMemo(
    () => normalizeInvoiceTemplate(invoiceTemplateSettings),
    [invoiceTemplateSettings]
  );
  const invoiceTemplateUpdatedLabel = React.useMemo(() => {
    if (!invoiceTemplateMeta?.updated_at) return 'Template default aktif';
    const byText = invoiceTemplateMeta?.updated_by ? ` oleh ${invoiceTemplateMeta.updated_by}` : '';
    return `Template dikemas kini: ${formatDateTimeMs(invoiceTemplateMeta.updated_at)}${byText}`;
  }, [invoiceTemplateMeta]);
  const invoiceHeaderLeftLogo = resolveInvoiceTemplateAssetUrl(invoiceTemplate?.header?.left_logo_url) || logoMrsm;
  const invoiceHeaderRightLogo = resolveInvoiceTemplateAssetUrl(invoiceTemplate?.header?.right_logo_url) || logoMuafakat;

  const prepareInvoiceExportNode = useCallback((generatedAtIso) => {
    if (typeof window === 'undefined' || !invoiceDocumentRef.current) return null;

    const clone = invoiceDocumentRef.current.cloneNode(true);
    clone.querySelectorAll('[data-html2canvas-ignore="true"], [data-export-ignore="true"]').forEach((el) => {
      el.remove();
    });
    clone.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-x-auto"]').forEach((el) => {
      el.style.overflow = 'visible';
      el.style.maxHeight = 'none';
      el.style.height = 'auto';
    });
    clone.style.overflow = 'visible';
    clone.style.maxHeight = 'none';
    clone.style.height = 'auto';
    clone.style.minHeight = 'auto';
    clone.querySelectorAll('[data-invoice-generated-at]').forEach((el) => {
      el.textContent = `Tarikh Invoice dijana: ${formatDateTimeMs(generatedAtIso)}`;
    });

    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-10000px';
    host.style.top = '0';
    host.style.width = '1024px';
    host.style.zIndex = '-1';
    host.style.background = '#ffffff';
    host.style.padding = '0';
    host.appendChild(clone);
    document.body.appendChild(host);

    return { host, clone };
  }, [invoiceDocumentRef]);

  const printActiveInvoice = useCallback(() => {
    if (typeof window === 'undefined' || !activeChildInvoice) return;

    const generatedAtIso = new Date().toISOString();
    setInvoiceGeneratedAt(generatedAtIso);

    const exportNode = prepareInvoiceExportNode(generatedAtIso);
    if (!exportNode?.clone) {
      toast.error('Paparan invois tidak ditemui untuk dicetak.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) {
      if (exportNode?.host?.parentNode) {
        exportNode.host.parentNode.removeChild(exportNode.host);
      }
      toast.error('Popup cetakan disekat oleh pelayar.');
      return;
    }

    const styleNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join('\n');

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${activeChildInvoice?.invoice_number_label || ''}</title>
  ${styleNodes}
  <style>
    @page { size: A4; margin: 10mm; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>${exportNode.clone.outerHTML}</body>
</html>`);
    printWindow.document.close();

    const triggerPrint = () => {
      const imageElements = Array.from(printWindow.document.images || []);
      Promise.all(
        imageElements.map((imgEl) => {
          if (imgEl.complete && imgEl.naturalWidth > 0) return Promise.resolve();
          return new Promise((resolve) => {
            imgEl.onload = () => resolve();
            imgEl.onerror = () => resolve();
          });
        })
      ).finally(() => {
        printWindow.focus();
        printWindow.print();
        setTimeout(() => {
          printWindow.close();
        }, 250);
      });
    };
    if (printWindow.document.readyState === 'complete') {
      triggerPrint();
    } else {
      printWindow.onload = triggerPrint;
    }

    if (exportNode?.host?.parentNode) {
      exportNode.host.parentNode.removeChild(exportNode.host);
    }
  }, [activeChildInvoice, prepareInvoiceExportNode]);

  const downloadActiveInvoicePdf = useCallback(async () => {
    if (!invoiceDocumentRef.current || !activeChildInvoice) return;
    setDownloadingInvoicePdf(true);
    const generatedAtIso = new Date().toISOString();
    setInvoiceGeneratedAt(generatedAtIso);
    let exportNode = null;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      exportNode = prepareInvoiceExportNode(generatedAtIso);
      if (!exportNode?.clone) {
        toast.error('Paparan invois tidak ditemui untuk PDF.');
        return;
      }

      const imageElements = Array.from(exportNode.clone.querySelectorAll('img'));
      await Promise.all(
        imageElements.map((imgEl) => {
          if (imgEl.complete && imgEl.naturalWidth > 0) {
            return Promise.resolve();
          }
          return new Promise((resolve) => {
            imgEl.onload = () => resolve();
            imgEl.onerror = () => resolve();
          });
        })
      );

      const canvas = await html2canvas(exportNode.clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollY: 0,
        windowWidth: exportNode.clone.scrollWidth,
        windowHeight: exportNode.clone.scrollHeight,
      });
      const imageData = canvas.toDataURL('image/png');

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 8;
      const renderWidth = pageWidth - margin * 2;
      const renderHeight = (canvas.height * renderWidth) / canvas.width;

      let heightLeft = renderHeight;
      let positionY = margin;

      doc.addImage(imageData, 'PNG', margin, positionY, renderWidth, renderHeight, undefined, 'FAST');
      heightLeft -= (pageHeight - margin * 2);

      while (heightLeft > 0) {
        doc.addPage();
        positionY = margin - (renderHeight - heightLeft);
        doc.addImage(imageData, 'PNG', margin, positionY, renderWidth, renderHeight, undefined, 'FAST');
        heightLeft -= (pageHeight - margin * 2);
      }

      const sanitizeFilenamePart = (value, fallback) => {
        const cleaned = String(value || '')
          .trim()
          .replace(/[\\/:*?"<>|]+/g, '')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '');
        return cleaned || fallback;
      };

      const invoiceNumberPart = sanitizeFilenamePart(
        activeChildInvoice?.invoice_number_label || activeChildInvoice?.id,
        'INV'
      );
      const studentNamePart = sanitizeFilenamePart(
        selectedChildInvoiceProfile?.child_name || activeChildInvoice?.student_name,
        'Pelajar'
      );
      doc.save(`${invoiceNumberPart}_${studentNamePart}.pdf`);
      toast.success('Invois berjaya dimuat turun (PDF).');
    } catch (error) {
      console.error('Gagal jana PDF invois:', error);
      toast.error('Gagal memuat turun invois PDF.');
    } finally {
      if (exportNode?.host?.parentNode) {
        exportNode.host.parentNode.removeChild(exportNode.host);
      }
      setDownloadingInvoicePdf(false);
    }
  }, [activeChildInvoice, selectedChildInvoiceProfile, invoiceDocumentRef, prepareInvoiceExportNode]);

  const viewReceipt = async (receiptId) => {
    try {
      const res = await api.get(`/api/payment-center/receipts/${receiptId}`);
      setSelectedReceipt(res.data);
      setShowReceiptModal(true);
    } catch (err) {
      toast.error('Gagal memuatkan resit');
    }
  };

  const downloadPdf = async () => {
    if (!selectedReceipt?.receipt_id) return;
    setDownloadingPdf(true);
    try {
      const res = await api.get(`/api/payment-center/receipts/${selectedReceipt.receipt_id}/pdf`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', `resit-${selectedReceipt.receipt_number || selectedReceipt.receipt_id}.pdf`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF berjaya dimuat turun');
    } catch (err) {
      toast.error('Gagal memuat turun PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };
  const applyTingkatanFilter = (tingkatanValue, { closeModal = false } = {}) => {
    if (!tingkatanValue) return;
    setShowAdvancedReceiptFilters(true);
    setSelectedTingkatan(tingkatanValue);
    if (closeModal) {
      setShowReceiptModal(false);
    }
    const scrollToFilter = () => {
      const filterSection = document.getElementById('payments-tingkatan-filter');
      if (filterSection) {
        filterSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(scrollToFilter);
    } else {
      scrollToFilter();
    }
    toast.success(`${getTingkatanLabel(tingkatanValue)} dipilih sebagai filter.`);
  };
  const hasActiveFilters =
    selectedYear !== null ||
    categoryFilter !== 'all' ||
    selectedTingkatan !== null ||
    Boolean(selectedReceiptChild);

  const pendingInvoiceSummary = React.useMemo(() => {
    return invoiceRecords.reduce(
      (acc, invoice) => {
        const totalAmount = Number(invoice?.total_amount || 0);
        const paidAmount = Number(invoice?.paid_amount || 0);
        const balanceValue = Number(invoice?.balance ?? Math.max(0, totalAmount - paidAmount));
        const outstandingAmount = Math.max(0, balanceValue);
        if (outstandingAmount > 0) {
          acc.count += 1;
          acc.amount += outstandingAmount;
        }
        return acc;
      },
      { count: 0, amount: 0 }
    );
  }, [invoiceRecords]);

  const filteredCount = filteredReceipts.length;
  const totalCount = receipts.length;
  const resetAllFilters = () => {
    setSelectedYear(null);
    setCategoryFilter('all');
    setSelectedTingkatan(null);
    setSelectedReceiptChild('');
    setShowAdvancedReceiptFilters(false);
    toast.success('Semua filter telah ditetapkan semula.');
  };

  const categoryFilters = [
    { id: 'all', label: 'Semua' },
    { id: 'yuran', label: 'Yuran' },
    { id: 'tiket', label: 'Tiket' },
    { id: 'sumbangan', label: 'Sumbangan' },
    { id: 'lain', label: 'Lain-lain' }
  ];

  return (
    <div className="space-y-6 pb-8 min-w-0 overflow-x-hidden" data-testid="payments-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-heading">
            {activeTab === 'receipts' ? 'Resit Bayaran Anak' : 'Invoice Yuran Anak'}
          </h1>
          <p className="text-slate-600 mt-1">
            {activeTab === 'receipts'
              ? 'Paparan khas ibu bapa: resit pembayaran mengikut rekod anak'
              : 'Status invoice mengikut setiap anak, termasuk progress dan history payment'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/payment-center"
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 bg-gradient-to-r from-teal-500 to-violet-500 text-white rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
          >
            <Receipt size={18} />
            Pusat Bayaran
            <ArrowRight size={16} />
          </Link>
          <button
            onClick={() => {
              if (activeTab === 'receipts') {
                fetchReceipts();
              } else {
                fetchInvoices();
              }
            }}
            disabled={activeTab === 'receipts' ? loading : loadingInvoices}
            className="min-w-[44px] min-h-[44px] p-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Muat semula"
          >
            <RefreshCw size={20} className={(activeTab === 'receipts' ? loading : loadingInvoices) ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="inline-flex w-full sm:w-auto rounded-xl border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveTab('receipts')}
          className={`flex-1 sm:flex-none min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'receipts' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Resit Bayaran ({receipts.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={`flex-1 sm:flex-none min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'invoices' ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Invoice Yuran ({invoiceRecords.length})
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4 border-teal-100 bg-gradient-to-br from-teal-50 to-white">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Jumlah Anak</p>
            <Users size={16} className="text-teal-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{childPaymentSummary.totalChildren}</p>
          <p className="mt-1 text-xs text-slate-600">
            {childPaymentSummary.settledChildren} selesai penuh, {childPaymentSummary.partialChildren} separa.
          </p>
        </Card>
        <Card className="p-4 border-amber-100 bg-gradient-to-br from-amber-50 to-white">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Jumlah Baki Tertunggak</p>
            <AlertCircle size={16} className="text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(childPaymentSummary.totalOutstanding)}</p>
          <p className="mt-1 text-xs text-slate-600">Fokus pada invoice aktif untuk setiap anak.</p>
        </Card>
        <Card className="p-4 border-emerald-100 bg-gradient-to-br from-emerald-50 to-white">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Jumlah Telah Dibayar</p>
            <Wallet size={16} className="text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(childPaymentSummary.totalPaid)}</p>
          <p className="mt-1 text-xs text-slate-600">Merangkumi semua pembayaran yang direkodkan pada invoice.</p>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-800">Senarai Status Mengikut Anak</h2>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            {childPaymentBoxes.length} anak dipaparkan
          </span>
        </div>
        {loadingInvoices && childPaymentBoxes.length === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" />
          </div>
        ) : childPaymentBoxes.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-sm text-slate-600">Tiada rekod anak untuk dipaparkan buat masa ini.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {childPaymentBoxes.map((childBox) => {
              const dueUrgencyMeta = getChildDueUrgencyMeta({
                dueDate: childBox.nearest_due_date,
                outstandingAmount: childBox.total_outstanding_amount,
              });
              const statusMeta = getChildPaymentStatusMeta({
                outstandingAmount: childBox.total_outstanding_amount,
                paidAmount: childBox.total_paid_amount,
                dueUrgencyLevel: dueUrgencyMeta.level,
              });
              return (
                <Card
                  key={`${childBox.child_id || childBox.child_name}`}
                  className={`p-4 shadow-sm ${dueUrgencyMeta.cardClass}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-800 truncate">{childBox.child_name}</p>
                        <button
                          type="button"
                          onClick={() => openChildInvoiceModal(childBox)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <FileText size={12} />
                          Paparkan Invois
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {childBox.matric_number || '-'} · {childBox.current_form_label}
                      </p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusMeta.badgeClass}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-[11px] text-slate-500">Jumlah Invoice</p>
                      <p className="font-semibold text-slate-800">{formatCurrency(childBox.total_invoice_amount)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-3 py-2">
                      <p className="text-[11px] text-emerald-700">Jumlah Dibayar</p>
                      <p className="font-semibold text-emerald-700">{formatCurrency(childBox.total_paid_amount)}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-3 py-2">
                      <p className="text-[11px] text-amber-700">Baki</p>
                      <p className="font-semibold text-amber-800">{formatCurrency(childBox.total_outstanding_amount)}</p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="w-full bg-slate-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${statusMeta.progressClass}`}
                        style={{ width: `${childBox.progress_percent}%` }}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-[11px] text-slate-500">Progress bayaran: {childBox.progress_percent}%</p>
                      {Number(childBox.total_outstanding_amount || 0) > 0 && (
                        <p className={`text-[11px] font-semibold ${dueUrgencyMeta.textClass}`}>
                          Urgensi: {dueUrgencyMeta.label}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                      {childBox.active_invoice_count} invoice aktif / {childBox.invoice_count} invoice
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                      {childBox.receipt_count} resit direkodkan
                    </span>
                    {childBox.nearest_due_date && (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${dueUrgencyMeta.badgeClass}`}>
                        Tarikh akhir terdekat: {formatDateTimeMs(childBox.nearest_due_date)}
                      </span>
                    )}
                    {dueUrgencyMeta.showTodayBadge && (
                      <span className="inline-flex items-center rounded-full bg-rose-600 px-2 py-0.5 font-semibold text-white">
                        Perlu tindakan hari ini
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      to="/payment-center"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 transition-colors"
                    >
                      Bayar Sekarang
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {activeTab === 'receipts' ? (
        loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : receipts.length === 0 ? (
          <Card className="text-center py-12">
            <Receipt className="mx-auto text-slate-300" size={48} />
            <h3 className="mt-4 text-lg font-medium text-slate-700">Belum ada resit bayaran direkodkan</h3>
            <p className="text-sm text-slate-500 mt-2">
              Selepas anda membuat bayaran, resit digital akan dipaparkan di sini untuk rujukan.
            </p>
            {pendingInvoiceSummary.count > 0 && (
              <div className="mt-4 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Anda ada {pendingInvoiceSummary.count} invoice belum selesai (Baki: {formatCurrency(pendingInvoiceSummary.amount)}).
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Link
                to="/payment-center"
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 transition-colors"
              >
                Bayar Sekarang
                <ArrowRight size={14} />
              </Link>
              <button
                type="button"
                onClick={() => setActiveTab('invoices')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Lihat Invoice Anak
              </button>
            </div>
          </Card>
        ) : (
          <>
            {/* Year tabs - only when there are receipts from multiple years */}
            {years.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <span className="text-sm font-medium text-slate-500 self-center mr-1">Tahun:</span>
                <button
                  onClick={() => setSelectedYear(null)}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    selectedYear === null
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua
                </button>
                {years.map((y) => (
                  <button
                    key={y}
                    onClick={() => setSelectedYear(y)}
                    className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      selectedYear === y ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}

            {/* Category filter */}
            <div className="flex flex-wrap gap-2">
              {categoryFilters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setCategoryFilter(f.id)}
                  className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    categoryFilter === f.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {receiptChildOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="receipt-child-filter" className="text-sm font-medium text-slate-500">
                  Anak:
                </label>
                <select
                  id="receipt-child-filter"
                  value={selectedReceiptChild}
                  onChange={(event) => setSelectedReceiptChild(event.target.value)}
                  className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                >
                  <option value="">Semua Anak</option>
                  {receiptChildOptions.map((childName) => (
                    <option key={childName} value={childName}>
                      {childName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {tingkatanOptions.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setShowAdvancedReceiptFilters((prev) => !prev)}
                  className="w-full flex items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Filter Lanjutan</p>
                    <p className="text-xs text-slate-500">Tapis ikut tingkatan jika perlu.</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                    {showAdvancedReceiptFilters ? 'Sembunyikan' : 'Papar'}
                    {showAdvancedReceiptFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </span>
                </button>
                {showAdvancedReceiptFilters && (
                  <div id="payments-tingkatan-filter" className="mt-3 flex flex-wrap gap-2">
                    <span className="text-sm font-medium text-slate-500 self-center mr-1">Tingkatan:</span>
                    <button
                      onClick={() => setSelectedTingkatan(null)}
                      className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                        selectedTingkatan === null ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Semua
                    </button>
                    {tingkatanOptions.map((tingkatan) => (
                      <button
                        key={tingkatan}
                        onClick={() => setSelectedTingkatan(tingkatan)}
                        className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                          selectedTingkatan === tingkatan ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {getTingkatanLabel(tingkatan)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Reset semua filter
                </button>
                <span className="text-xs text-slate-500">
                  Kembali ke paparan semua tahun, kategori, tingkatan dan anak.
                </span>
              </div>
            )}
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-sm font-medium text-slate-700">
                {hasActiveFilters
                  ? `${filteredCount} rekod dipaparkan daripada ${totalCount} rekod.`
                  : `${totalCount} rekod dipaparkan.`}
                {selectedReceiptChild ? ` Anak dipilih: ${selectedReceiptChild}.` : ''}
              </p>
              {hasActiveFilters && (
                <span className="text-xs font-semibold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
                  Filter aktif
                </span>
              )}
            </div>

            {/* Receipt list */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-100">
                {filteredReceipts.length === 0 ? (
                  <div className="p-12 text-center">
                    <History className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500">
                      {hasActiveFilters
                        ? 'Tiada rekod untuk filter semasa.'
                        : 'Tiada rekod resit ditemui.'}
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="mt-3 inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        Reset semua filter
                      </button>
                    )}
                  </div>
                ) : (
                  filteredReceipts.map((receipt, idx) => {
                    const receiptTingkatanValues = getReceiptTingkatanValues(receipt);
                    const receiptChildNames = getReceiptChildNames(receipt);
                    return (
                      <motion.div
                        key={receipt.receipt_id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                        className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => viewReceipt(receipt.receipt_id)}
                      >
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          {getItemIcon(receipt.items?.[0]?.item_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 truncate">
                            {receipt.items?.[0]?.name || 'Pembayaran'}
                          </p>
                          <p className="text-xs text-slate-500">
                            Anak: {getReceiptPrimaryChildName(receipt)}
                            {receiptChildNames.length > 1 ? ` (+${receiptChildNames.length - 1} lagi)` : ''}
                          </p>
                          <p className="text-sm text-slate-500">
                            {receipt.payment_date
                              ? new Date(receipt.payment_date).toLocaleDateString('ms-MY', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                })
                              : '-'}
                            {receipt.receipt_number && ` · ${receipt.receipt_number}`}
                          </p>
                          {receiptTingkatanValues.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {receiptTingkatanValues.slice(0, 2).map((tingkatanValue) => (
                                <button
                                  type="button"
                                  key={`${receipt.receipt_id}-${tingkatanValue}`}
                                  className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                                  title={`Tapis ikut ${getTingkatanLabel(tingkatanValue)}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    applyTingkatanFilter(tingkatanValue);
                                  }}
                                >
                                  {getTingkatanLabel(tingkatanValue)}
                                </button>
                              ))}
                              {receiptTingkatanValues.length > 2 && (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  +{receiptTingkatanValues.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-slate-800">RM {(receipt.total_amount || 0).toFixed(2)}</p>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                            <CheckCircle2 size={12} />
                            Berjaya
                          </span>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )
      ) : loadingInvoices ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : invoiceRecords.length === 0 ? (
        <Card className="text-center py-12">
          <FileText className="mx-auto text-slate-300" size={48} />
          <h3 className="mt-4 text-lg font-medium text-slate-700">Tiada invoice yuran</h3>
          <p className="text-sm text-slate-500 mt-2">
            Invoice akan dijana apabila set yuran ditetapkan oleh bendahari.
          </p>
        </Card>
      ) : (
        <>
          {invoiceYears.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm font-medium text-slate-500 self-center mr-1">Tahun:</span>
              <button
                onClick={() => setInvoiceYearFilter(null)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  invoiceYearFilter === null ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua
              </button>
              {invoiceYears.map((yearValue) => (
                <button
                  key={yearValue}
                  onClick={() => setInvoiceYearFilter(yearValue)}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    invoiceYearFilter === yearValue ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {yearValue}
                </button>
              ))}
            </div>
          )}

          {invoiceTingkatanOptions.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <button
                type="button"
                onClick={() => setShowAdvancedInvoiceFilters((prev) => !prev)}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-700">Filter Lanjutan</p>
                  <p className="text-xs text-slate-500">Tapis senarai invoice ikut tingkatan jika perlu.</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                  {showAdvancedInvoiceFilters ? 'Sembunyikan' : 'Papar'}
                  {showAdvancedInvoiceFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {showAdvancedInvoiceFilters && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-sm font-medium text-slate-500 self-center mr-1">Tingkatan:</span>
                  <button
                    onClick={() => setInvoiceTingkatanFilter(null)}
                    className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      invoiceTingkatanFilter === null ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Semua
                  </button>
                  {invoiceTingkatanOptions.map((tingkatanValue) => (
                    <button
                      key={tingkatanValue}
                      onClick={() => setInvoiceTingkatanFilter(tingkatanValue)}
                      className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        invoiceTingkatanFilter === tingkatanValue ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {getTingkatanLabel(tingkatanValue)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'Semua Status' },
              { id: 'pending', label: 'UNPAID' },
              { id: 'partial', label: 'PARTIAL PAID' },
              { id: 'paid', label: 'PAID' },
            ].map((statusOption) => (
              <button
                key={statusOption.id}
                onClick={() => setInvoiceStatusFilter(statusOption.id)}
                className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  invoiceStatusFilter === statusOption.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {statusOption.label}
              </button>
            ))}
          </div>

          {invoiceChildOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="invoice-child-filter" className="text-sm font-medium text-slate-500">
                Anak:
              </label>
              <select
                id="invoice-child-filter"
                value={selectedInvoiceChild}
                onChange={(event) => setSelectedInvoiceChild(event.target.value)}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <option value="">Semua Anak</option>
                {invoiceChildOptions.map((childName) => (
                  <option key={childName} value={childName}>
                    {childName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-sm font-medium text-slate-700">
              {filteredInvoices.length} invoice dipaparkan daripada {invoiceRecords.length} invoice
              {selectedInvoiceChild ? ` untuk ${selectedInvoiceChild}` : ''}.
            </p>
            <span className="text-xs font-semibold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
              Sync dengan status semasa
            </span>
          </div>

          <div className="space-y-3">
            {filteredInvoices.length === 0 ? (
              <Card className="text-center py-10">
                <FileText className="mx-auto text-slate-300" size={40} />
                <p className="mt-3 text-slate-600">Tiada invoice untuk kombinasi filter ini.</p>
              </Card>
            ) : (
              filteredInvoices.map((invoice, idx) => {
                const totalAmount = Number(invoice?.total_amount || 0);
                const paidAmount = Number(invoice?.paid_amount || 0);
                const outstandingAmount = Math.max(0, totalAmount - paidAmount);
                const progressPercent = totalAmount > 0 ? Math.round(Math.min(100, (paidAmount / totalAmount) * 100)) : 0;
                const isEarlyInvoice = Number(invoice?.current_year || 0) > 0 && Number(invoice?.tahun || 0) > Number(invoice?.current_year || 0);
                const paymentHistory = [...(invoice?.payments || [])].sort((a, b) =>
                  new Date(b?.paid_at || 0).getTime() - new Date(a?.paid_at || 0).getTime()
                );
                return (
                  <motion.div
                    key={invoice?.id || `${invoice?.student_id || 'invoice'}-${idx}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.25) }}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">{invoice?.student_name || 'Pelajar'}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {invoice?.matric_number || '-'} · {getTingkatanLabel(invoice?.tingkatan)} · Tahun {invoice?.tahun || '-'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{invoice?.set_yuran_nama || 'Set Yuran'}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Tarikh akhir: {invoice?.due_date ? formatDateTimeMs(invoice.due_date) : '-'}
                        </p>
                        {isEarlyInvoice && (
                          <span className="mt-1 inline-flex items-center rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                            Bayaran Awal Tahun Hadapan
                          </span>
                        )}
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getInvoiceStatusClass(invoice?.status)}`}>
                        {getInvoiceStatusLabel(invoice?.status)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">Jumlah Invoice</p>
                        <p className="font-semibold text-slate-800">RM {totalAmount.toFixed(2)}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 px-3 py-2">
                        <p className="text-[11px] text-emerald-600">Jumlah Dibayar</p>
                        <p className="font-semibold text-emerald-700">RM {paidAmount.toFixed(2)}</p>
                      </div>
                      <div className="rounded-lg bg-amber-50 px-3 py-2">
                        <p className="text-[11px] text-amber-700">Baki</p>
                        <p className="font-semibold text-amber-800">RM {outstandingAmount.toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="w-full bg-slate-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            invoice?.status === 'paid' ? 'bg-emerald-500' : invoice?.status === 'partial' ? 'bg-amber-500' : 'bg-slate-400'
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">Progress bayaran: {progressPercent}%</p>
                    </div>

                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <Clock3 size={13} />
                        History Payment
                      </p>
                      {paymentHistory.length === 0 ? (
                        <p className="text-xs text-slate-500 mt-1.5">Belum ada history payment untuk invoice ini.</p>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          {paymentHistory.map((payment, paymentIdx) => (
                            <div key={`${invoice?.id || idx}-payment-${paymentIdx}`} className="flex items-center justify-between text-xs">
                              <div className="min-w-0">
                                <p className="font-medium text-slate-700 truncate">
                                  {formatDateTimeMs(payment?.paid_at)} · {formatPaymentMethodLabel(payment?.payment_method)}
                                </p>
                                <p className="text-slate-500 truncate">
                                  Resit: {payment?.receipt_number || '-'}
                                  {payment?.reference_number ? ` · Ref: ${payment.reference_number}` : ''}
                                  {payment?.paid_by_name ? ` · Oleh: ${payment.paid_by_name}` : ''}
                                </p>
                              </div>
                              <span className="font-semibold text-slate-800 ml-3">RM {Number(payment?.amount || 0).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {outstandingAmount > 0 && (
                      <div className="mt-3 flex justify-end">
                        <Link
                          to="/payment-center"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 transition-colors"
                        >
                          Bayar Sekarang
                          <ArrowRight size={14} />
                        </Link>
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Modal Invois Anak */}
      <AnimatePresence>
        {showChildInvoiceModal && selectedChildInvoiceProfile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={closeChildInvoiceModal}
            />
            <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ type: 'spring', damping: 24, stiffness: 280 }}
                className="w-full max-w-5xl h-[calc(100dvh-1rem)] sm:h-auto sm:max-h-[90dvh] bg-white rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
              >
                <div ref={invoiceDocumentRef} className="flex min-h-0 flex-1 flex-col">
                <div className="p-4 sm:p-6 border-b border-slate-200 bg-slate-50">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <img src={invoiceHeaderLeftLogo} alt="Logo Header Kiri" className="h-11 w-11 rounded-lg border border-slate-200 bg-white p-1 object-contain flex-shrink-0" />
                        <img src={invoiceHeaderRightLogo} alt="Logo Header Kanan" className="h-11 w-11 rounded-lg border border-slate-200 bg-white p-1 object-contain flex-shrink-0" />
                        <div className="min-w-0 space-y-0.5">
                          {(invoiceTemplate?.header?.rows || []).map((row, idx) => (
                            <p
                              key={`invoice-header-row-${idx}`}
                              className={idx === 0
                                ? 'text-xs uppercase tracking-wide font-semibold text-slate-500'
                                : idx === 1
                                  ? 'text-lg font-bold text-slate-900'
                                  : 'text-sm text-slate-700'}
                            >
                              {row}
                            </p>
                          ))}
                        </div>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-2xl font-extrabold uppercase tracking-wide text-slate-800">
                          {invoiceTemplate?.header?.right_title || 'Invois'}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500" data-html2canvas-ignore="true">
                          {invoiceTemplateUpdatedLabel}
                        </p>
                      </div>
                    </div>

                    <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap" data-html2canvas-ignore="true">
                      <button
                        type="button"
                        onClick={downloadActiveInvoicePdf}
                        disabled={!activeChildInvoice || downloadingInvoicePdf}
                        className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-60"
                      >
                        {downloadingInvoicePdf ? <Spinner size="sm" /> : <Download size={14} />}
                        Muat Turun PDF
                      </button>
                      <button
                        type="button"
                        onClick={printActiveInvoice}
                        className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <Printer size={14} />
                        Cetak
                      </button>
                      <button
                        type="button"
                        onClick={closeChildInvoiceModal}
                        className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 transition-colors"
                      >
                        Tutup
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-xs text-slate-500">Nama Anak</p>
                      <p className="font-semibold text-slate-800">{selectedChildInvoiceProfile.child_name}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {selectedChildInvoiceProfile.matric_number || '-'} · {selectedChildInvoiceProfile.current_form_label}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-xs text-slate-500">Ringkasan Invois Dipilih</p>
                      <p className="font-semibold text-slate-800">
                        Jumlah Invois: {formatCurrency(activeChildInvoiceFinancials.total)}
                      </p>
                      <p className="font-semibold text-slate-800 mt-1">
                        Jumlah telah dibayar setakat ini: {formatCurrency(activeChildInvoiceFinancials.paid)}
                      </p>
                      <p className="text-xs font-semibold text-amber-700 mt-1">Baki Tertunggak: {formatCurrency(activeChildInvoiceFinancials.balance)}</p>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                  {selectedChildInvoices.length > 1 && (
                    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center" data-html2canvas-ignore="true">
                      <label htmlFor="child-invoice-select" className="text-sm font-medium text-slate-600">
                        Pilih Invois:
                      </label>
                      <select
                        id="child-invoice-select"
                        value={selectedChildInvoiceId}
                        onChange={(event) => setSelectedChildInvoiceId(event.target.value)}
                        className="min-h-[42px] w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                      >
                        {selectedChildInvoices.map((invoice, idx) => (
                          <option key={invoice?.id || idx} value={String(invoice?.id || '')}>
                            {invoice.invoice_number_label} · {invoice?.set_yuran_nama || 'Set Yuran'} · Tahun {invoice?.tahun || '-'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {activeChildInvoice ? (
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {isActiveInvoiceFullyPaid && (
                        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
                          <span className="select-none text-[72px] sm:text-[120px] md:text-[150px] font-extrabold tracking-[0.35em] text-emerald-500/20 -rotate-[28deg]">
                            PAID
                          </span>
                        </div>
                      )}
                      <div className="relative z-10 border-b border-slate-200 p-4 sm:p-5">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">No. Invois</p>
                            <p className="text-lg font-bold text-slate-900">{activeChildInvoice.invoice_number_label}</p>
                            <p className="text-sm text-slate-600 mt-1">
                              {activeChildInvoice?.set_yuran_nama || 'Set Yuran'} · Tingkatan {activeChildInvoice?.tingkatan || '-'} · Tahun {activeChildInvoice?.tahun || '-'}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              Tarikh keluaran: {formatDateOnlyMs(activeChildInvoice?.created_at || activeChildInvoice?.updated_at || new Date())}
                              {' · '}
                              Tarikh akhir: {formatDateOnlyMs(activeChildInvoice?.due_date)}
                            </p>
                          </div>
                          <div className="flex flex-col items-start md:items-end gap-2">
                            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getInvoiceStatusClass(activeChildInvoice?.status)}`}>
                              {getInvoiceStatusMalayLabel(activeChildInvoice?.status)}
                            </span>
                            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-slate-500">Kod Bar Invois</p>
                              <InvoiceBarcode value={activeChildInvoice?.invoice_barcode_value || activeChildInvoice?.invoice_number_label} className="mt-1" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="relative z-10 p-4 sm:p-5 space-y-4">
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-100 text-slate-700">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold">Perihal</th>
                                <th className="px-3 py-2 text-right font-semibold">Kuantiti</th>
                                <th className="px-3 py-2 text-right font-semibold">Harga Seunit</th>
                                <th className="px-3 py-2 text-right font-semibold">Jumlah</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {activeChildInvoiceItems.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                                    Tiada pecahan item invois direkodkan.
                                  </td>
                                </tr>
                              ) : (
                                activeChildInvoiceItems.map((item, idx) => {
                                  const quantity = Number(item?.quantity || 1);
                                  const unitAmount = Number(item?.amount || 0);
                                  return (
                                    <tr key={`${activeChildInvoice?.id || 'inv'}-item-${idx}`}>
                                      <td className="px-3 py-2 text-slate-700">
                                        <p className="font-medium">{item?.name || item?.description || 'Item Yuran'}</p>
                                        {item?.description && item?.name !== item?.description && (
                                          <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-700">{quantity}</td>
                                      <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(unitAmount)}</td>
                                      <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatCurrency(getInvoiceItemTotalAmount(item))}</td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-[11px] text-slate-500">Jumlah Invois</p>
                            <p className="font-semibold text-slate-900">{formatCurrency(activeChildInvoiceFinancials.total)}</p>
                          </div>
                          <div className="rounded-lg bg-emerald-50 px-3 py-2">
                            <p className="text-[11px] text-emerald-700">Jumlah Dibayar</p>
                            <p className="font-semibold text-emerald-700">{formatCurrency(activeChildInvoiceFinancials.paid)}</p>
                          </div>
                          <div className="rounded-lg bg-amber-50 px-3 py-2">
                            <p className="text-[11px] text-amber-700">Baki Tertunggak</p>
                            <p className="font-semibold text-amber-800">{formatCurrency(activeChildInvoiceFinancials.balance)}</p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200">
                          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
                            <p className="text-lg font-extrabold text-red-600">Butiran Bayaran (Bayaran Belum Selesai)</p>
                            {Number(activeChildInvoiceFinancials.balance || 0) <= 0 && (
                              <p className="mt-1 text-base font-bold text-emerald-700">
                                Terima kasih kerana membayar semua yuran.
                              </p>
                            )}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-white text-slate-600">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold">Tarikh</th>
                                  <th className="px-3 py-2 text-right font-semibold">Amaun</th>
                                  <th className="px-3 py-2 text-left font-semibold">Mod Bayaran</th>
                                  <th className="px-3 py-2 text-left font-semibold">Catatan</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {activeChildInvoicePayments.length === 0 ? (
                                  <tr>
                                    <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                                      Belum ada bayaran direkodkan untuk invois ini.
                                    </td>
                                  </tr>
                                ) : (
                                  activeChildInvoicePayments.map((payment, idx) => (
                                    <tr key={`${activeChildInvoice?.id || 'inv'}-payment-${idx}`}>
                                      <td className="px-3 py-2 text-slate-700">{formatDateOnlyMs(payment?.paid_at)}</td>
                                      <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatCurrency(payment?.amount)}</td>
                                      <td className="px-3 py-2 text-slate-700">{formatPaymentMethodLabel(payment?.payment_method)}</td>
                                      <td className="px-3 py-2 text-slate-600">
                                        Resit: {payment?.receipt_number || '-'}
                                        {payment?.reference_number ? ` · Rujukan: ${payment.reference_number}` : ''}
                                        {payment?.paid_by_name ? ` · Oleh: ${payment.paid_by_name}` : ''}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                              {activeChildInvoicePayments.length > 0 && (
                                <tfoot className="bg-slate-50 border-t border-slate-200">
                                  <tr>
                                    <td className="px-3 py-2 font-semibold text-slate-700">Jumlah Bayaran</td>
                                    <td className="px-3 py-2 text-right font-bold text-slate-900">{formatCurrency(activeChildPaymentTotal)}</td>
                                    <td colSpan={2}></td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </div>

                        {(hasFooterBoxContent(invoiceTemplate?.footer?.left_box) || hasFooterBoxContent(invoiceTemplate?.footer?.right_box)) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {[
                              { key: 'left', box: invoiceTemplate?.footer?.left_box },
                              { key: 'right', box: invoiceTemplate?.footer?.right_box },
                            ]
                              .filter(({ box }) => hasFooterBoxContent(box))
                              .map(({ key, box }, idx) => {
                                const imageUrl = resolveInvoiceTemplateAssetUrl(box?.image_url);
                              return (
                                <div
                                  key={`footer-box-${key}-${idx}`}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left"
                                >
                                  {imageUrl && (
                                    <img
                                      src={imageUrl}
                                      alt={`Footer Box ${idx + 1}`}
                                      className="h-14 w-auto object-contain mb-2"
                                    />
                                  )}
                                  {box?.title && (
                                    <p className="text-sm font-semibold text-slate-800">{box.title}</p>
                                  )}
                                  {(box?.rows || []).map((row, rowIndex) => (
                                    <p key={`footer-box-${idx}-row-${rowIndex}`} className="text-xs text-slate-600 mt-1">
                                      {row}
                                    </p>
                                  ))}
                                  {(box?.upload_rows || []).map((row, rowIndex) => {
                                    const uploadImageUrl = resolveInvoiceTemplateAssetUrl(row?.image_url);
                                    if (!uploadImageUrl && !row?.caption) return null;
                                    return (
                                      <div key={`footer-box-${idx}-upload-row-${rowIndex}`} className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                                        {uploadImageUrl && (
                                          <img
                                            src={uploadImageUrl}
                                            alt={`Lampiran Footer ${idx + 1}-${rowIndex + 1}`}
                                            className="h-10 w-auto object-contain"
                                          />
                                        )}
                                        {row?.caption && (
                                          <p className="mt-1 text-[11px] text-slate-600">{row.caption}</p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="border-t border-slate-200 pt-4 text-center">
                          {(invoiceTemplate?.footer?.rows || []).map((row, idx) => (
                            <p
                              key={`invoice-footer-row-${idx}`}
                              className={idx === 0 ? 'text-sm font-semibold text-slate-800' : 'mt-1 text-xs text-slate-600'}
                            >
                              {row}
                            </p>
                          ))}
                          <p className="mt-1 text-xs text-slate-500" data-invoice-generated-at>
                            Tarikh Invoice dijana: {formatDateTimeMs(invoiceGeneratedAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Card className="text-center py-8">
                      <p className="text-slate-600">Tiada invois untuk anak ini.</p>
                    </Card>
                  )}
                </div>
                </div>

                <div className="p-4 border-t border-slate-200 bg-white flex flex-col sm:flex-row sm:flex-wrap sm:justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeChildInvoiceModal}
                    className="w-full sm:w-auto rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Tutup
                  </button>
                  <Link
                    to="/payment-center"
                    onClick={closeChildInvoiceModal}
                    className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 transition-colors"
                  >
                    Bayar Sekarang
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Receipt detail modal */}
      <AnimatePresence>
        {showReceiptModal && selectedReceipt && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setShowReceiptModal(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen pointer-events-none" aria-hidden="true">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-md max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
              >
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-6 text-white text-center flex-shrink-0">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-xl font-bold">Pembayaran Berjaya!</h3>
                <p className="text-emerald-100 text-sm mt-1">No. Resit: {selectedReceipt.receipt_number}</p>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Nama</p>
                      <p className="font-semibold text-slate-800">{selectedReceipt.payer_name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Email</p>
                      <p className="text-sm text-slate-600">{selectedReceipt.payer_email || '-'}</p>
                    </div>
                  </div>
                </div>
                <div className="text-center pb-4 border-b border-slate-200">
                  <p className="text-3xl font-bold text-slate-800">
                    RM {(selectedReceipt.total_amount || 0).toFixed(2)}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    {selectedReceipt.payment_date
                      ? new Date(selectedReceipt.payment_date).toLocaleString('ms-MY')
                      : '-'}
                  </p>
                </div>
                <div className="space-y-3">
                  {selectedReceipt.items?.map((item, idx) => {
                    const itemTingkatan = extractItemTingkatan(item);
                    return (
                      <div key={idx} className="bg-slate-50 rounded-xl p-4">
                        {item.metadata?.student_name && (
                          <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-200">
                            <div className="flex items-center gap-2 min-w-0">
                              <GraduationCap size={16} className="text-teal-500" />
                              <div className="min-w-0">
                                <p className="text-xs text-slate-400">Nama Anak</p>
                                <p className="font-semibold text-slate-800 truncate">{item.metadata.student_name}</p>
                              </div>
                            </div>
                            {itemTingkatan && (
                              <button
                                type="button"
                                onClick={() => applyTingkatanFilter(itemTingkatan, { closeModal: true })}
                                className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 flex-shrink-0"
                                title={`Tapis ikut ${getTingkatanLabel(itemTingkatan)}`}
                              >
                                {getTingkatanLabel(itemTingkatan)}
                              </button>
                            )}
                          </div>
                        )}
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="font-medium text-slate-800">{item.name}</p>
                            {itemTingkatan && !item.metadata?.student_name && (
                              <button
                                type="button"
                                onClick={() => applyTingkatanFilter(itemTingkatan, { closeModal: true })}
                                className="mt-1 inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                                title={`Tapis ikut ${getTingkatanLabel(itemTingkatan)}`}
                              >
                                {getTingkatanLabel(itemTingkatan)}
                              </button>
                            )}
                            {item.description && !item.metadata?.student_name && (
                              <p className="text-sm text-slate-500 mt-1">{item.description}</p>
                            )}
                          </div>
                          <span className="font-bold text-slate-800">
                            RM {(item.amount * (item.quantity || 1)).toFixed(2)}
                          </span>
                        </div>
                        {item.metadata?.selected_items?.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <p className="text-xs text-slate-500 font-medium mb-2">Item yang dibayar:</p>
                            <div className="space-y-1.5">
                              {item.metadata.selected_items.map((subItem, subIdx) => (
                                <div key={subIdx} className="flex justify-between text-sm">
                                  <span className="text-slate-600 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                    {subItem.name}
                                  </span>
                                  <span className="text-slate-700">RM {(subItem.amount || 0).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-3 p-4 border-t border-slate-200 bg-white flex-shrink-0">
                <button
                  onClick={() => setShowReceiptModal(false)}
                  className="flex-1 py-3 border border-slate-300 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                >
                  Tutup
                </button>
                <button
                  onClick={downloadPdf}
                  disabled={downloadingPdf}
                  className="flex-1 py-3 bg-gradient-to-r from-teal-600 to-violet-600 text-white rounded-xl font-medium hover:from-teal-700 hover:to-violet-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {downloadingPdf ? <Spinner size="sm" /> : <Download size={18} />}
                  Muat Turun PDF
                </button>
              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PaymentsPage;
