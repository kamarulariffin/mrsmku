import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  CircleDashed,
  FileUp,
  Filter,
  Loader2,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  ShieldX,
  Target,
  UploadCloud,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { API_URL } from '../../../services/api';

const OPERATOR_ROLES = ['superadmin', 'admin', 'bendahari', 'sub_bendahari'];
const VIEW_ROLES = [...OPERATOR_ROLES, 'juruaudit'];

const STEP_CONFIG = [
  { id: 1, title: 'Upload Statement', desc: 'Muat naik fail CSV/PDF' },
  { id: 2, title: 'Preview', desc: 'Semak data bacaan sistem' },
  { id: 3, title: 'Auto-Match', desc: 'Padankan transaksi automatik' },
  { id: 4, title: 'Review', desc: 'Semak item perlu tindakan' },
  { id: 5, title: 'Summary', desc: 'Semak beza & ringkasan akhir' },
  { id: 6, title: 'Submit/Approve', desc: 'Hantar dan luluskan' },
];

const ONBOARDING_STEPS = [
  {
    step: 1,
    title: 'Upload + Pilih profile CSV',
    help: 'Mulakan dengan fail statement, pilih profile mapping jika bank guna header khusus.',
  },
  {
    step: 2,
    title: 'Semak parser output',
    help: 'Pastikan akaun bank, tempoh, parser type dan profile mapping adalah betul.',
  },
  {
    step: 3,
    title: 'Run auto-match',
    help: 'Guna tolerance konservatif dahulu, kemudian laras ikut hasil.',
  },
  {
    step: 4,
    title: 'Review item & bulk action',
    help: 'Gunakan bulk action untuk item banyak (guna cadangan / exception / unmatch).',
  },
  {
    step: 5,
    title: 'Sahkan difference',
    help: 'Sistem hanya benarkan submit jika unresolved = 0 dan difference = 0.00.',
  },
  {
    step: 6,
    title: 'Submit & maker-checker',
    help: 'Pengguna yang submit tidak boleh approve statement yang sama.',
  },
];

const BULK_ACTION_OPTIONS = [
  { value: 'apply_suggested', label: 'Guna Semua Cadangan (Dipilih)' },
  { value: 'exception', label: 'Tanda Pengecualian (Dipilih)' },
  { value: 'unmatch', label: 'Set Belum Dipadankan (Dipilih)' },
];

const ROLE_CHECKLIST_GUIDE = {
  admin:
    'Fokus admin: pantau semua akaun bank, kosongkan queue Sedia Kelulusan, dan pastikan maker-checker dipatuhi.',
  bendahari:
    'Fokus bendahari: selesaikan unresolved + difference dahulu, kemudian submit/approve ikut SOP.',
  sub_bendahari:
    'Fokus sub bendahari: upload, review, remark lengkap, kemudian eskalasi statement yang sudah bersih.',
};

const ROLE_SOP_TEMPLATE = {
  admin: [
    'Pantau queue semua akaun bank dan kosongkan item kritikal dahulu.',
    'Sahkan maker-checker dipatuhi untuk setiap statement ready-for-approval.',
    'Tutup operasi harian selepas semak tiada difference alert tertinggal.',
  ],
  bendahari: [
    'Selesaikan semua item unresolved terlebih dahulu dan lengkapkan remark.',
    'Pastikan difference = 0.00 sebelum tekan submit untuk kelulusan.',
    'Gunakan cadangan sistem + bulk action untuk jimat masa semakan.',
  ],
  sub_bendahari: [
    'Semak parser output (akaun bank/tempoh/warning) sebaik selepas upload.',
    'Fokus tab Perlu Semakan/Belum Dipadankan dan pastikan remark audit trail lengkap.',
    'Eskalasi statement bersih kepada checker tanpa langkau SOP.',
  ],
  juruaudit: [
    'Semak audit trail item manual, termasuk remark dan kategori remark.',
    'Semak konsistensi status statement vs unresolved/difference.',
    'Dokumentasi penemuan ralat untuk tindakan admin/bendahari.',
  ],
};

const BEST_CANDIDATE_RULE = {
  minScore: 85,
  maxAmountDiff: 0.01,
  maxDayGap: 3,
  minScoreGap: 10,
};

const SIMPLE_MODE_STORAGE_KEY = 'bank_reconciliation_simple_mode';

const isStatementNeedsDailyAction = (statement) => {
  if (!statement) return false;
  if (['uploaded', 'in_review', 'rejected', 'ready_for_approval'].includes(statement.status)) {
    return true;
  }
  const unresolvedCount = Number(statement.summary?.unresolved_items || 0);
  const differenceAbs = Math.abs(Number(statement.summary?.difference || 0));
  return unresolvedCount > 0 || differenceAbs > 0.01;
};

const evaluateBestCandidate = (candidates) => {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { candidate: null, reason: 'Tiada calon transaksi untuk dinilai.' };
  }
  const best = candidates[0];
  const second = candidates[1];
  const score = toNumber(best?.score, 0);
  const amountDiff = toNumber(best?.amountDiff, 9999);
  const dayGap = toNumber(best?.dayGap, 9999);
  const scoreGap = second ? score - toNumber(second?.score, 0) : 999;

  if (score < BEST_CANDIDATE_RULE.minScore) {
    return {
      candidate: null,
      reason: `Skor terbaik ${score.toFixed(0)} masih di bawah ambang ${BEST_CANDIDATE_RULE.minScore}.`,
    };
  }
  if (amountDiff > BEST_CANDIDATE_RULE.maxAmountDiff) {
    return {
      candidate: null,
      reason: `Amount diff ${formatCurrency(amountDiff)} melebihi had ${formatCurrency(
        BEST_CANDIDATE_RULE.maxAmountDiff
      )}.`,
    };
  }
  if (dayGap > BEST_CANDIDATE_RULE.maxDayGap) {
    return {
      candidate: null,
      reason: `Jurang tarikh ${dayGap} hari melebihi had ${BEST_CANDIDATE_RULE.maxDayGap} hari.`,
    };
  }
  if (second && scoreGap < BEST_CANDIDATE_RULE.minScoreGap) {
    return {
      candidate: null,
      reason: `Beza skor calon #1 dan #2 terlalu rapat (${scoreGap.toFixed(0)} mata).`,
    };
  }

  return { candidate: best, reason: '' };
};

const STATUS_STYLE = {
  uploaded: 'bg-slate-100 text-slate-700 border-slate-200',
  in_review: 'bg-amber-100 text-amber-700 border-amber-200',
  ready_for_approval: 'bg-blue-100 text-blue-700 border-blue-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  auto_matched: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  manual_matched: 'bg-blue-100 text-blue-700 border-blue-200',
  needs_review: 'bg-amber-100 text-amber-700 border-amber-200',
  unmatched: 'bg-red-100 text-red-700 border-red-200',
  exception: 'bg-violet-100 text-violet-700 border-violet-200',
};

const STATUS_LABEL = {
  uploaded: 'Dimuat Naik',
  in_review: 'Dalam Semakan',
  ready_for_approval: 'Sedia Kelulusan',
  approved: 'Diluluskan',
  rejected: 'Ditolak',
  auto_matched: 'Padanan Automatik',
  manual_matched: 'Padanan Manual',
  needs_review: 'Perlu Semakan',
  unmatched: 'Belum Dipadankan',
  exception: 'Pengecualian',
};

const STATUS_TOOLTIP = {
  uploaded: 'Statement telah dimuat naik dan menunggu proses padanan.',
  in_review: 'Statement sedang disemak untuk padanan dan remark audit trail.',
  ready_for_approval: 'Statement lengkap untuk checker membuat keputusan approve/reject.',
  approved: 'Rekonsiliasi selesai dan telah diluluskan.',
  rejected: 'Statement dipulangkan semula untuk pembetulan.',
  auto_matched: 'Item dipadankan automatik oleh sistem dengan skor keyakinan tinggi.',
  manual_matched: 'Item dipadankan secara manual oleh operator.',
  needs_review: 'Item memerlukan semakan manusia sebelum keputusan akhir.',
  unmatched: 'Item masih belum mempunyai padanan transaksi yang meyakinkan.',
  exception: 'Item ditanda pengecualian untuk siasatan atau bukti tambahan.',
};

const PRIORITY_LEVEL_LABEL = {
  critical: 'Kritikal',
  high: 'Tinggi',
  medium: 'Sederhana',
  low: 'Rendah',
};

const PRIORITY_LEVEL_STYLE = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
};

const NEXT_ACTION_TONE_STYLE = {
  info: 'border-blue-100 bg-blue-50 text-blue-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('ms-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const getStatusLabel = (status) => STATUS_LABEL[status] || status || '-';

const getStatusTooltip = (status) =>
  STATUS_TOOLTIP[status] || 'Status ini memerlukan semakan lanjut di panel butiran statement.';

const formatDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ms-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const stepFromStatus = (status) => {
  switch (status) {
    case 'uploaded':
      return 2;
    case 'in_review':
      return 4;
    case 'ready_for_approval':
      return 6;
    case 'approved':
      return 6;
    case 'rejected':
      return 4;
    default:
      return 1;
  }
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeText = (value) => String(value || '').toLowerCase().trim();

const parseDateText = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const dateToYmd = (dateObj) => {
  if (!dateObj || Number.isNaN(dateObj.getTime?.())) return '';
  return dateObj.toISOString().slice(0, 10);
};

const addDays = (dateObj, days) => {
  if (!dateObj || Number.isNaN(dateObj.getTime?.())) return null;
  const next = new Date(dateObj);
  next.setDate(next.getDate() + days);
  return next;
};

const daysBetween = (a, b) => {
  const d1 = parseDateText(a);
  const d2 = parseDateText(b);
  if (!d1 || !d2) return 99;
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

const startOfDayLocal = (dateObj) => {
  if (!dateObj || Number.isNaN(dateObj.getTime?.())) return null;
  const normalized = new Date(dateObj);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const getDaysToPeriodEnd = (periodEnd) => {
  const endDate = startOfDayLocal(parseDateText(periodEnd));
  const today = startOfDayLocal(new Date());
  if (!endDate || !today) return null;
  return Math.round((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const deriveStatementPriority = (statement) => {
  if (!statement) {
    return {
      score: 0,
      level: 'low',
      levelLabel: PRIORITY_LEVEL_LABEL.low,
      levelStyle: PRIORITY_LEVEL_STYLE.low,
      dueLabel: 'Tempoh tidak diketahui',
      dueStyle: 'bg-slate-100 text-slate-700 border-slate-200',
      reasons: [],
      nextAction: 'Pilih statement dahulu',
      daysToDue: null,
    };
  }

  const summary = statement.summary || {};
  const status = String(statement.status || '');
  const unresolvedItems = toNumber(summary.unresolved_items, 0);
  const differenceAbs = Math.abs(toNumber(summary.difference, 0));
  const parserWarnings = Array.isArray(statement.parser_warnings) ? statement.parser_warnings.length : 0;
  const daysToDue = getDaysToPeriodEnd(statement.period_end);

  let score = 0;
  const reasons = [];
  let nextAction = 'Teruskan semakan standard.';

  if (status === 'rejected') {
    score += 45;
    reasons.push('Statement ditolak dan perlu semakan semula.');
    nextAction = 'Semak sebab reject dan kemas kini item bermasalah.';
  } else if (status === 'ready_for_approval') {
    score += 42;
    reasons.push('Menunggu tindakan checker (approve/reject).');
    nextAction = 'Checker perlu buat keputusan approve/reject.';
  } else if (status === 'in_review') {
    score += 30;
    reasons.push('Masih dalam fasa review reconciliation.');
    nextAction = 'Selesaikan item Perlu Semakan/Belum Dipadankan.';
  } else if (status === 'uploaded') {
    score += 24;
    reasons.push('Baru upload, auto-match belum dijalankan.');
    nextAction = 'Jalankan Auto-Match AI.';
  } else if (status === 'approved') {
    score = Math.max(score - 20, 0);
    nextAction = 'Selesai. Teruskan statement seterusnya.';
  }

  if (unresolvedItems > 0) {
    score += Math.min(36, unresolvedItems * 2.5);
    reasons.push(`${unresolvedItems} item unresolved masih belum selesai.`);
  }
  if (differenceAbs > 0.01) {
    score += 38;
    reasons.push(`Difference masih ${formatCurrency(differenceAbs)}.`);
  }
  if (parserWarnings > 0) {
    score += Math.min(18, parserWarnings * 6);
    reasons.push(`${parserWarnings} parser warning perlu semakan.`);
  }

  let dueLabel = 'Tempoh tidak diketahui';
  let dueStyle = 'bg-slate-100 text-slate-700 border-slate-200';
  if (daysToDue !== null) {
    if (daysToDue < 0) {
      const overdueDays = Math.abs(daysToDue);
      score += Math.min(35, 20 + overdueDays * 2);
      dueLabel = `Overdue ${overdueDays} hari`;
      dueStyle = 'bg-red-100 text-red-700 border-red-200';
      reasons.push(`Period end telah lepas ${overdueDays} hari.`);
    } else if (daysToDue <= 3) {
      score += 20;
      dueLabel = `Due ${daysToDue} hari lagi`;
      dueStyle = 'bg-amber-100 text-amber-700 border-amber-200';
      reasons.push('Tempoh hampir tamat.');
    } else if (daysToDue <= 7) {
      score += 12;
      dueLabel = `Due ${daysToDue} hari lagi`;
      dueStyle = 'bg-blue-100 text-blue-700 border-blue-200';
    } else {
      dueLabel = `Due ${daysToDue} hari lagi`;
    }
  }

  score = Math.round(Math.max(0, Math.min(100, score)));
  let level = 'low';
  if (score >= 85) level = 'critical';
  else if (score >= 65) level = 'high';
  else if (score >= 40) level = 'medium';

  return {
    score,
    level,
    levelLabel: PRIORITY_LEVEL_LABEL[level],
    levelStyle: PRIORITY_LEVEL_STYLE[level],
    dueLabel,
    dueStyle,
    reasons: reasons.slice(0, 3),
    nextAction,
    daysToDue,
  };
};

const resolveItemFlowType = (item) => {
  const debit = toNumber(item?.debit, 0);
  const credit = toNumber(item?.credit, 0);
  if (credit > 0 && debit === 0) return 'income';
  if (debit > 0 && credit === 0) return 'expense';
  return toNumber(item?.amount, 0) >= 0 ? 'income' : 'expense';
};

const composeDefaultManualRemark = (action, item, transactionId = '') => {
  const txInfo = transactionId ? ` (Tx: ${transactionId})` : '';
  if (action === 'match') {
    const category =
      String(item?.suggested_transaction_id || '') === String(transactionId || '')
        ? 'suggested_match'
        : 'timing_difference';
    return {
      text: `Padanan manual disahkan berdasarkan amaun/tarikh/rujukan yang sepadan${txInfo}.`,
      category,
    };
  }
  if (action === 'unmatch') {
    return {
      text: 'Item ditandakan unmatch kerana tiada padanan transaksi yang meyakinkan buat masa ini.',
      category: 'pending_investigation',
    };
  }
  return {
    text: 'Item ditanda sebagai exception untuk semakan lanjut dan bukti tambahan oleh bendahari/checker.',
    category: 'manual_exception',
  };
};

const composeDefaultBulkRemark = (action, itemCount) => {
  const countText = `${itemCount || 0} item`;
  if (action === 'apply_suggested') {
    return {
      text: `Cadangan auto-match digunakan secara bulk untuk ${countText} selepas semakan ringkas operator.`,
      category: 'suggested_match',
    };
  }
  if (action === 'unmatch') {
    return {
      text: `${countText} ditetapkan kepada unmatch secara bulk kerana padanan belum cukup meyakinkan.`,
      category: 'pending_investigation',
    };
  }
  return {
    text: `${countText} ditanda exception secara bulk untuk semakan lanjut/eviden tambahan.`,
    category: 'manual_exception',
  };
};

export default function BankReconciliationPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [activeStep, setActiveStep] = useState(1);
  const [error, setError] = useState('');

  const [bankAccounts, setBankAccounts] = useState([]);
  const [allStatements, setAllStatements] = useState([]);
  const [statements, setStatements] = useState([]);
  const [activeStatementId, setActiveStatementId] = useState('');
  const [activeStatement, setActiveStatement] = useState(null);
  const [statementItems, setStatementItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsStatusFilter, setItemsStatusFilter] = useState('');
  const [statementsBankFilter, setStatementsBankFilter] = useState('');
  const [todayOnlyMode, setTodayOnlyMode] = useState(false);
  const [autoPriorityMode, setAutoPriorityMode] = useState(true);
  const [criticalOnlyMode, setCriticalOnlyMode] = useState(false);

  const [autoMatchLoading, setAutoMatchLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [simpleMode, setSimpleMode] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem(SIMPLE_MODE_STORAGE_KEY);
    if (saved === null) return true;
    return saved !== 'false';
  });

  const [uploadForm, setUploadForm] = useState({
    bank_account_id: '',
    period_start: '',
    period_end: '',
    opening_balance: '',
    closing_balance: '',
    statement_remark: '',
    parser_profile_id: '',
    file: null,
  });
  const [uploading, setUploading] = useState(false);
  const [csvProfiles, setCsvProfiles] = useState([]);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    profile_name: '',
    bank_name: '',
    notes: '',
    delimiter: ',',
    date_column: '',
    description_column: '',
    reference_column: '',
    debit_column: '',
    credit_column: '',
    amount_column: '',
    balance_column: '',
  });

  const [autoMatchConfig, setAutoMatchConfig] = useState({
    date_tolerance_days: 3,
    min_confidence_for_suggestion: 70,
    min_confidence_for_auto: 95,
    amount_tolerance: 0.01,
  });
  const [aiAssist, setAiAssist] = useState(null);
  const [aiAssistLoading, setAiAssistLoading] = useState(false);

  const [submitRemark, setSubmitRemark] = useState('');
  const [approvalRemark, setApprovalRemark] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const [itemActionForms, setItemActionForms] = useState({});
  const [adjustForms, setAdjustForms] = useState({});
  const [manualMatchCandidates, setManualMatchCandidates] = useState({});
  const [manualMatchLoadingByItem, setManualMatchLoadingByItem] = useState({});
  const [manualMatchSearchByItem, setManualMatchSearchByItem] = useState({});
  const [manualMatchTouchedByItem, setManualMatchTouchedByItem] = useState({});
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkWizardStep, setBulkWizardStep] = useState(1);
  const [bulkActionForm, setBulkActionForm] = useState({
    action: 'apply_suggested',
    remark_text: '',
    remark_category: '',
  });

  const canOperate = useMemo(() => OPERATOR_ROLES.includes(user?.role), [user]);
  const isReadOnlyAuditor = user?.role === 'juruaudit';

  const authHeader = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchJson = useCallback(
    async (path, options = {}) => {
      const headers = {
        ...(options.headers || {}),
        ...authHeader(),
      };
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (err) {
        payload = null;
      }
      if (!response.ok) {
        const detail =
          payload?.detail ||
          payload?.message ||
          `Request failed (${response.status})`;
        throw new Error(detail);
      }
      return payload;
    },
    [authHeader]
  );

  const fetchItems = useCallback(
    async (statementId, status = '') => {
      if (!statementId) return;
      setItemsLoading(true);
      try {
        const query = new URLSearchParams({ limit: '500' });
        if (status) query.set('status', status);
        const data = await fetchJson(
          `/api/accounting-full/bank-reconciliation/${statementId}/items?${query.toString()}`
        );
        const rows = data.items || [];
        setStatementItems(rows);
        const validIdSet = new Set(rows.map((item) => String(item.id)));
        setSelectedItemIds((prev) =>
          prev.filter((id) => rows.some((item) => String(item.id) === String(id)))
        );
        setManualMatchCandidates((prev) => {
          const next = {};
          Object.entries(prev || {}).forEach(([itemId, value]) => {
            if (validIdSet.has(String(itemId))) next[itemId] = value;
          });
          return next;
        });
        setManualMatchSearchByItem((prev) => {
          const next = {};
          Object.entries(prev || {}).forEach(([itemId, value]) => {
            if (validIdSet.has(String(itemId))) next[itemId] = value;
          });
          return next;
        });
        setManualMatchLoadingByItem((prev) => {
          const next = {};
          Object.entries(prev || {}).forEach(([itemId, value]) => {
            if (validIdSet.has(String(itemId))) next[itemId] = value;
          });
          return next;
        });
        setManualMatchTouchedByItem((prev) => {
          const next = {};
          Object.entries(prev || {}).forEach(([itemId, value]) => {
            if (validIdSet.has(String(itemId))) next[itemId] = value;
          });
          return next;
        });
      } catch (err) {
        toast.error(`Gagal memuat item statement: ${err.message}`);
      } finally {
        setItemsLoading(false);
      }
    },
    [fetchJson]
  );

  const fetchStatementDetail = useCallback(
    async (statementId) => {
      if (!statementId) {
        setActiveStatement(null);
        return null;
      }
      try {
        const detail = await fetchJson(
          `/api/accounting-full/bank-reconciliation/statements/${statementId}`
        );
        setActiveStatement(detail);
        setActiveStep(stepFromStatus(detail.status));
        return detail;
      } catch (err) {
        toast.error(`Gagal memuat butiran statement: ${err.message}`);
        return null;
      }
    },
    [fetchJson]
  );

  const fetchAiAssist = useCallback(
    async (statementId) => {
      if (!statementId) {
        setAiAssist(null);
        return null;
      }
      setAiAssistLoading(true);
      try {
        const data = await fetchJson(`/api/accounting-full/bank-reconciliation/${statementId}/ai-assist`);
        setAiAssist(data || null);
        return data || null;
      } catch (err) {
        setAiAssist(null);
        return null;
      } finally {
        setAiAssistLoading(false);
      }
    },
    [fetchJson]
  );

  const fetchStatements = useCallback(async (forcedBankAccountId = null) => {
    try {
      const query = new URLSearchParams({ page: '1', limit: '100' });
      const bankFilterValue =
        forcedBankAccountId !== null ? forcedBankAccountId : statementsBankFilter;
      if (bankFilterValue) {
        query.set('bank_account_id', bankFilterValue);
      }
      const data = await fetchJson(
        `/api/accounting-full/bank-reconciliation/statements?${query.toString()}`
      );
      const rows = data.statements || [];
      setStatements(rows);

      const activeExists = rows.some((row) => row.id === activeStatementId);
      if (activeExists) {
        return;
      }
      if (rows.length > 0) {
        const latestId = rows[0].id;
        setActiveStatementId(latestId);
        await fetchStatementDetail(latestId);
        await fetchItems(latestId, itemsStatusFilter);
      } else {
        setActiveStatementId('');
        setActiveStatement(null);
        setStatementItems([]);
      }
    } catch (err) {
      toast.error(`Gagal memuat senarai statement: ${err.message}`);
    }
  }, [
    activeStatementId,
    fetchItems,
    fetchJson,
    fetchStatementDetail,
    itemsStatusFilter,
    statementsBankFilter,
  ]);

  const fetchAllStatementsOverview = useCallback(async () => {
    try {
      const data = await fetchJson(
        '/api/accounting-full/bank-reconciliation/statements?page=1&limit=500'
      );
      const rows = data?.statements || [];
      setAllStatements(rows);
    } catch (err) {
      toast.error(`Gagal memuat ringkasan semua akaun: ${err.message}`);
    }
  }, [fetchJson]);

  const refreshStatements = useCallback(
    async (forcedBankAccountId = null) => {
      await Promise.all([
        fetchAllStatementsOverview(),
        fetchStatements(forcedBankAccountId),
      ]);
    },
    [fetchAllStatementsOverview, fetchStatements]
  );

  const fetchBankAccounts = useCallback(async () => {
    try {
      const rows = await fetchJson(
        '/api/accounting-full/bank-accounts?include_inactive=false'
      );
      const list = Array.isArray(rows) ? rows : [];
      setBankAccounts(list);
      if (!uploadForm.bank_account_id && list.length > 0) {
        setUploadForm((prev) => ({ ...prev, bank_account_id: list[0].id }));
      }
    } catch (err) {
      toast.error(`Gagal memuat akaun bank: ${err.message}`);
    }
  }, [fetchJson, uploadForm.bank_account_id]);

  const fetchCsvProfiles = useCallback(async () => {
    try {
      const data = await fetchJson(
        '/api/accounting-full/bank-reconciliation/profiles?include_inactive=false'
      );
      const rows = data?.profiles || [];
      setCsvProfiles(rows);
      setUploadForm((prev) => {
        if (!prev.parser_profile_id) return prev;
        const exists = rows.some((profile) => profile.id === prev.parser_profile_id);
        if (exists) return prev;
        return { ...prev, parser_profile_id: '' };
      });
    } catch (err) {
      toast.error(`Gagal memuat CSV profile: ${err.message}`);
    }
  }, [fetchJson]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const me = await fetchJson('/api/auth/me');
      if (!VIEW_ROLES.includes(me.role)) {
        setError('Anda tiada kebenaran untuk mengakses modul reconciliation.');
        return;
      }
      setUser(me);
      await fetchBankAccounts();
      await fetchCsvProfiles();
      await refreshStatements();
    } catch (err) {
      if (String(err.message).toLowerCase().includes('401')) {
        navigate('/login');
        return;
      }
      setError(err.message || 'Gagal memuat modul reconciliation');
    } finally {
      setLoading(false);
    }
  }, [fetchBankAccounts, fetchCsvProfiles, fetchJson, navigate, refreshStatements]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIMPLE_MODE_STORAGE_KEY, simpleMode ? 'true' : 'false');
  }, [simpleMode]);

  useEffect(() => {
    if (!activeStatementId) {
      setAiAssist(null);
      return;
    }
    fetchAiAssist(activeStatementId);
  }, [activeStatement?.updated_at, activeStatementId, fetchAiAssist]);

  useEffect(() => {
    setBulkWizardStep(1);
  }, [activeStatementId]);

  useEffect(() => {
    if (selectedItemIds.length === 0 && bulkWizardStep !== 1) {
      setBulkWizardStep(1);
    }
  }, [bulkWizardStep, selectedItemIds.length]);

  const selectStatement = async (statementId) => {
    setActiveStatementId(statementId);
    await fetchStatementDetail(statementId);
    await fetchItems(statementId, itemsStatusFilter);
  };

  const resetUploadForm = () => {
    setUploadForm((prev) => ({
      ...prev,
      period_start: '',
      period_end: '',
      opening_balance: '',
      closing_balance: '',
      statement_remark: '',
      file: null,
    }));
  };

  const resetProfileForm = useCallback(() => {
    setProfileForm({
      profile_name: '',
      bank_name: '',
      notes: '',
      delimiter: ',',
      date_column: '',
      description_column: '',
      reference_column: '',
      debit_column: '',
      credit_column: '',
      amount_column: '',
      balance_column: '',
    });
  }, []);

  const fillProfileFormFromProfile = useCallback((profile) => {
    const mapping = profile?.mapping || {};
    setProfileForm({
      profile_name: profile?.profile_name || '',
      bank_name: profile?.bank_name || '',
      notes: profile?.notes || '',
      delimiter: mapping.delimiter || ',',
      date_column: mapping.date_column || '',
      description_column: mapping.description_column || '',
      reference_column: mapping.reference_column || '',
      debit_column: mapping.debit_column || '',
      credit_column: mapping.credit_column || '',
      amount_column: mapping.amount_column || '',
      balance_column: mapping.balance_column || '',
    });
  }, []);

  const openProfileEditor = () => {
    const selectedProfile = csvProfiles.find(
      (profile) => profile.id === uploadForm.parser_profile_id
    );
    if (selectedProfile) {
      fillProfileFormFromProfile(selectedProfile);
    } else {
      resetProfileForm();
    }
    setProfileEditorOpen(true);
  };

  const saveCsvProfile = async (mode) => {
    if (!canOperate) return;
    const profileName = String(profileForm.profile_name || '').trim();
    const dateColumn = String(profileForm.date_column || '').trim();
    if (!profileName || profileName.length < 2) {
      toast.error('Nama profile perlu sekurang-kurangnya 2 aksara');
      return;
    }
    if (!dateColumn) {
      toast.error('Date column wajib diisi untuk profile mapping');
      return;
    }

    setProfileSaving(true);
    try {
      const payload = {
        profile_name: profileName,
        bank_name: profileForm.bank_name || undefined,
        notes: profileForm.notes || undefined,
        is_active: true,
        mapping: {
          date_column: dateColumn,
          description_column: profileForm.description_column || undefined,
          reference_column: profileForm.reference_column || undefined,
          debit_column: profileForm.debit_column || undefined,
          credit_column: profileForm.credit_column || undefined,
          amount_column: profileForm.amount_column || undefined,
          balance_column: profileForm.balance_column || undefined,
          delimiter: profileForm.delimiter || undefined,
        },
      };

      let data = null;
      if (mode === 'update' && uploadForm.parser_profile_id) {
        data = await fetchJson(
          `/api/accounting-full/bank-reconciliation/profiles/${uploadForm.parser_profile_id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        toast.success('CSV profile berjaya dikemaskini');
      } else {
        data = await fetchJson('/api/accounting-full/bank-reconciliation/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('CSV profile berjaya dicipta');
      }

      await fetchCsvProfiles();
      const nextProfileId = data?.profile?.id || uploadForm.parser_profile_id || '';
      if (nextProfileId) {
        setUploadForm((prev) => ({ ...prev, parser_profile_id: nextProfileId }));
      }
      setProfileEditorOpen(false);
    } catch (err) {
      toast.error(`Gagal simpan CSV profile: ${err.message}`);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!canOperate) return;
    if (!uploadForm.file) {
      toast.error('Sila pilih fail statement (CSV/PDF)');
      return;
    }
    if (!uploadForm.bank_account_id || !uploadForm.period_start || !uploadForm.period_end) {
      toast.error('Sila lengkapkan akaun bank dan tempoh statement');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('bank_account_id', uploadForm.bank_account_id);
      formData.append('period_start', uploadForm.period_start);
      formData.append('period_end', uploadForm.period_end);
      formData.append('statement_remark', uploadForm.statement_remark || '');
      if (uploadForm.parser_profile_id) {
        formData.append('parser_profile_id', uploadForm.parser_profile_id);
      }
      if (uploadForm.opening_balance !== '') {
        formData.append('opening_balance', String(uploadForm.opening_balance));
      }
      if (uploadForm.closing_balance !== '') {
        formData.append('closing_balance', String(uploadForm.closing_balance));
      }
      formData.append('file', uploadForm.file);

      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/accounting-full/bank-reconciliation/statements/upload`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.detail || payload?.message || 'Upload gagal');
      }

      toast.success(
        `Statement berjaya dimuat naik (${payload.parsed_transactions || 0} transaksi)`
      );
      const newStatementId = payload.statement_id;
      const uploadedBankAccountId = uploadForm.bank_account_id;
      resetUploadForm();
      let nextFilter = statementsBankFilter || '';
      if (nextFilter && nextFilter !== uploadedBankAccountId) {
        nextFilter = uploadedBankAccountId;
        setStatementsBankFilter(uploadedBankAccountId);
      }
      await refreshStatements(nextFilter);
      if (newStatementId) {
        await selectStatement(newStatementId);
      }
      setActiveStep(2);
    } catch (err) {
      toast.error(`Upload gagal: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRunAutoMatch = async (overrideConfig = null) => {
    if (!canOperate || !activeStatementId) return;
    setAutoMatchLoading(true);
    try {
      const sourceConfig = overrideConfig || autoMatchConfig;
      const payload = {
        ...sourceConfig,
        date_tolerance_days: toNumber(sourceConfig.date_tolerance_days, 3),
        min_confidence_for_suggestion: toNumber(
          sourceConfig.min_confidence_for_suggestion,
          70
        ),
        min_confidence_for_auto: toNumber(sourceConfig.min_confidence_for_auto, 95),
        amount_tolerance: toNumber(sourceConfig.amount_tolerance, 0.01),
      };
      const result = await fetchJson(
        `/api/accounting-full/bank-reconciliation/${activeStatementId}/auto-match`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      toast.success(
        `Auto-match selesai. Auto: ${result.auto_matched || 0}, Need review: ${
          result.needs_review || 0
        }`
      );
      await fetchStatementDetail(activeStatementId);
      await fetchItems(activeStatementId, itemsStatusFilter);
      await refreshStatements();
      setActiveStep(4);
    } catch (err) {
      toast.error(`Auto-match gagal: ${err.message}`);
    } finally {
      setAutoMatchLoading(false);
    }
  };

  const applyAiSuggestedConfig = () => {
    const cfg = aiAssist?.recommended_config;
    if (!cfg) {
      toast.error('Cadangan AI belum tersedia.');
      return;
    }
    setAutoMatchConfig({
      date_tolerance_days: toNumber(cfg.date_tolerance_days, 3),
      min_confidence_for_suggestion: toNumber(cfg.min_confidence_for_suggestion, 70),
      min_confidence_for_auto: toNumber(cfg.min_confidence_for_auto, 95),
      amount_tolerance: toNumber(cfg.amount_tolerance, 0.01),
    });
    toast.success('Cadangan konfigurasi AI telah diterapkan.');
  };

  const runAutoMatchWithAi = async () => {
    const cfg = aiAssist?.recommended_config;
    if (!cfg) {
      toast.error('Cadangan AI belum tersedia.');
      return;
    }
    await handleRunAutoMatch(cfg);
  };

  const ensureActionForm = (itemId, item) => {
    setItemActionForms((prev) => {
      if (prev[itemId]) return prev;
      return {
        ...prev,
        [itemId]: {
          transaction_id: item?.suggested_transaction_id || '',
          remark_text: '',
          remark_category: '',
        },
      };
    });
  };

  const patchActionForm = (itemId, patch) => {
    setItemActionForms((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {
          transaction_id: '',
          remark_text: '',
          remark_category: '',
        }),
        ...patch,
      },
    }));
  };

  const updateActionForm = (itemId, key, value) => {
    patchActionForm(itemId, { [key]: value });
  };

  const setManualSearchText = (itemId, value) => {
    setManualMatchSearchByItem((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  };

  const fetchManualMatchCandidates = useCallback(
    async (item, forceRefresh = false) => {
      const itemId = String(item?.id || '');
      if (!itemId) return;

      if (
        !forceRefresh &&
        Array.isArray(manualMatchCandidates[itemId]) &&
        manualMatchCandidates[itemId].length > 0
      ) {
        return manualMatchCandidates[itemId];
      }

      setManualMatchTouchedByItem((prev) => ({ ...prev, [itemId]: true }));
      setManualMatchLoadingByItem((prev) => ({ ...prev, [itemId]: true }));
      try {
        const query = new URLSearchParams({
          page: '1',
          limit: '100',
          status: 'verified',
          type: resolveItemFlowType(item),
        });
        if (activeStatement?.bank_account_id) {
          query.set('bank_account_id', activeStatement.bank_account_id);
        }

        const itemDate = parseDateText(item?.transaction_date);
        if (itemDate) {
          query.set('start_date', dateToYmd(addDays(itemDate, -10)));
          query.set('end_date', dateToYmd(addDays(itemDate, 10)));
        }

        const typedSearch = String(manualMatchSearchByItem[itemId] || '').trim();
        const fallbackSearch =
          String(item?.reference_number || '').trim() ||
          String(item?.description || '').trim().slice(0, 40);
        const searchTerm = typedSearch || fallbackSearch;
        if (searchTerm.length >= 2) {
          query.set('search', searchTerm);
        }

        const data = await fetchJson(
          `/api/accounting-full/transactions?${query.toString()}`
        );
        const rows = data?.transactions || [];

        const targetAbsAmount = Math.abs(toNumber(item?.amount, 0));
        const targetRef = normalizeText(item?.reference_number);
        const targetDesc = normalizeText(item?.description);

        const candidates = rows
          .map((tx) => {
            const txAbsAmount = Math.abs(toNumber(tx?.amount, 0));
            const amountDiff = Math.abs(txAbsAmount - targetAbsAmount);
            const dayGap = daysBetween(tx?.transaction_date, item?.transaction_date);
            const txRef = normalizeText(tx?.reference_number);
            const txDesc = normalizeText(tx?.description);

            const refMatch =
              !!targetRef &&
              !!txRef &&
              (txRef.includes(targetRef) || targetRef.includes(txRef));
            const descNeedle = targetDesc.slice(0, 18);
            const descMatch =
              !!descNeedle && !!txDesc && (txDesc.includes(descNeedle) || descNeedle.includes(txDesc));

            let score = 0;
            if (amountDiff <= 0.01) score += 65;
            else if (amountDiff <= 1) score += 35;
            else if (amountDiff <= 5) score += 15;

            if (dayGap <= 1) score += 20;
            else if (dayGap <= 3) score += 12;
            else if (dayGap <= 7) score += 6;

            if (refMatch) score += 20;
            if (descMatch) score += 10;

            return {
              ...tx,
              amountDiff,
              dayGap,
              score,
              optionLabel: `${tx.transaction_number || tx.id} | ${formatDate(
                tx.transaction_date
              )} | ${formatCurrency(tx.amount)} | ${tx.description || '-'}`,
            };
          })
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.amountDiff !== b.amountDiff) return a.amountDiff - b.amountDiff;
            return a.dayGap - b.dayGap;
          })
          .slice(0, 30);

        setManualMatchCandidates((prev) => ({
          ...prev,
          [itemId]: candidates,
        }));
        return candidates;
      } catch (err) {
        toast.error(`Gagal cari calon manual match: ${err.message}`);
        return [];
      } finally {
        setManualMatchLoadingByItem((prev) => ({ ...prev, [itemId]: false }));
      }
    },
    [activeStatement, fetchJson, manualMatchCandidates, manualMatchSearchByItem]
  );

  const suggestBestCandidateForItem = async (item) => {
    const itemId = String(item?.id || '');
    if (!itemId) return;

    ensureActionForm(item.id, item);
    let candidates = manualMatchCandidates[itemId];
    if (!Array.isArray(candidates) || candidates.length === 0) {
      candidates = await fetchManualMatchCandidates(item, true);
    }

    const { candidate, reason } = evaluateBestCandidate(candidates || []);
    if (!candidate) {
      toast.error(`Cadang Terbaik tidak dipilih automatik: ${reason}`);
      return;
    }

    updateActionForm(item.id, 'transaction_id', candidate.id);
    toast.success(
      `Cadang Terbaik dipilih: ${candidate.transaction_number || candidate.id} (score ${toNumber(
        candidate.score,
        0
      ).toFixed(0)})`
    );
  };

  const applyManualRemarkTemplate = (item, action) => {
    ensureActionForm(item.id, item);
    const currentForm = itemActionForms[item.id] || {};
    const txId = String(
      currentForm.transaction_id || item?.suggested_transaction_id || ''
    ).trim();
    const template = composeDefaultManualRemark(action, item, txId);
    patchActionForm(item.id, {
      remark_text: template.text,
      remark_category: currentForm.remark_category || template.category || '',
    });
    toast.success('Template remark diisi.');
  };

  const updateAdjustForm = (itemId, key, value, item) => {
    setAdjustForms((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {
          transaction_date: item.transaction_date || '',
          description: item.description || '',
          reference_number: item.reference_number || '',
          debit: item.debit ?? 0,
          credit: item.credit ?? 0,
          balance: item.balance ?? '',
          adjustment_remark: '',
          remark_category: '',
        }),
        [key]: value,
      },
    }));
  };

  const submitManualAction = async (item, action) => {
    if (!canOperate || !activeStatementId) return;
    const form = itemActionForms[item.id] || {};
    const txId = String(form.transaction_id || '').trim();
    let remarkText = String(form.remark_text || '').trim();
    let remarkCategory = String(form.remark_category || '').trim();
    if (action === 'match' && !txId) {
      toast.error('Sila pilih calon transaksi atau isi Transaction ID untuk manual match');
      return;
    }
    if (remarkText.length < 3) {
      const template = composeDefaultManualRemark(action, item, txId);
      remarkText = template.text;
      if (!remarkCategory) {
        remarkCategory = template.category || '';
      }
      patchActionForm(item.id, {
        remark_text: remarkText,
        remark_category: remarkCategory,
      });
      toast.info('Remark auto diisi berdasarkan tindakan yang dipilih.');
    }

    const payload = {
      action,
      remark_text: remarkText,
      remark_category: remarkCategory || undefined,
    };
    if (action === 'match') {
      payload.transaction_id = txId;
    }

    try {
      await fetchJson(
        `/api/accounting-full/bank-reconciliation/${activeStatementId}/items/${item.id}/manual-match`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      toast.success('Tindakan item berjaya disimpan');
      await fetchStatementDetail(activeStatementId);
      await fetchItems(activeStatementId, itemsStatusFilter);
      await refreshStatements();
    } catch (err) {
      toast.error(`Gagal simpan tindakan item: ${err.message}`);
    }
  };

  const submitRemarkOnly = async (item) => {
    if (!canOperate || !activeStatementId) return;
    const form = itemActionForms[item.id] || {};
    const remarkText = String(form.remark_text || '').trim();
    if (remarkText.length < 3) {
      toast.error('Sila isi remark sekurang-kurangnya 3 aksara');
      return;
    }
    try {
      await fetchJson(
        `/api/accounting-full/bank-reconciliation/${activeStatementId}/items/${item.id}/remark`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            remark_text: remarkText,
            remark_category: form.remark_category || undefined,
          }),
        }
      );
      toast.success('Remark berjaya disimpan');
      updateActionForm(item.id, 'remark_text', '');
      await fetchItems(activeStatementId, itemsStatusFilter);
    } catch (err) {
      toast.error(`Gagal simpan remark: ${err.message}`);
    }
  };

  const submitAdjust = async (item) => {
    if (!canOperate || !activeStatementId) return;
    const form = adjustForms[item.id];
    if (!form) return;
    const remark = String(form.adjustment_remark || '').trim();
    if (remark.length < 3) {
      toast.error('Sila isi adjustment remark sekurang-kurangnya 3 aksara');
      return;
    }
    try {
      await fetchJson(
        `/api/accounting-full/bank-reconciliation/${activeStatementId}/items/${item.id}/adjust`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transaction_date: form.transaction_date || undefined,
            description: form.description || undefined,
            reference_number: form.reference_number || undefined,
            debit: form.debit === '' ? undefined : toNumber(form.debit, 0),
            credit: form.credit === '' ? undefined : toNumber(form.credit, 0),
            balance: form.balance === '' ? undefined : toNumber(form.balance, 0),
            adjustment_remark: remark,
            remark_category: form.remark_category || undefined,
          }),
        }
      );
      toast.success('Item statement berjaya dilaras');
      await fetchStatementDetail(activeStatementId);
      await fetchItems(activeStatementId, itemsStatusFilter);
    } catch (err) {
      toast.error(`Gagal laras item: ${err.message}`);
    }
  };

  const submitForApproval = async () => {
    if (!canOperate || !activeStatementId) return;
    setSubmitLoading(true);
    try {
      await fetchJson(
        `/api/accounting-full/bank-reconciliation/${activeStatementId}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            statement_remark: submitRemark || undefined,
          }),
        }
      );
      toast.success('Statement berjaya dihantar untuk kelulusan');
      await fetchStatementDetail(activeStatementId);
      await refreshStatements();
      setActiveStep(6);
    } catch (err) {
      toast.error(`Gagal submit statement: ${err.message}`);
    } finally {
      setSubmitLoading(false);
    }
  };

  const approveStatement = async () => {
    if (!canOperate || !activeStatementId) return;
    setApproveLoading(true);
    try {
      await fetchJson(
        `/api/accounting-full/bank-reconciliation/${activeStatementId}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approval_remark: approvalRemark || undefined,
          }),
        }
      );
      toast.success('Statement berjaya diluluskan');
      await fetchStatementDetail(activeStatementId);
      await refreshStatements();
    } catch (err) {
      toast.error(`Gagal approve statement: ${err.message}`);
    } finally {
      setApproveLoading(false);
    }
  };

  const rejectStatement = async () => {
    if (!canOperate || !activeStatementId) return;
    if (String(rejectReason || '').trim().length < 3) {
      toast.error('Sila isi sebab reject sekurang-kurangnya 3 aksara');
      return;
    }
    setRejectLoading(true);
    try {
      await fetchJson(
        `/api/accounting-full/bank-reconciliation/${activeStatementId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reject_reason: rejectReason.trim(),
          }),
        }
      );
      toast.success('Statement berjaya ditolak untuk semakan semula');
      await fetchStatementDetail(activeStatementId);
      await refreshStatements();
      setActiveStep(4);
    } catch (err) {
      toast.error(`Gagal reject statement: ${err.message}`);
    } finally {
      setRejectLoading(false);
    }
  };

  const toggleItemSelection = (itemId, checked) => {
    setSelectedItemIds((prev) => {
      if (checked) {
        if (prev.includes(itemId)) return prev;
        return [...prev, itemId];
      }
      return prev.filter((id) => id !== itemId);
    });
  };

  const selectAllUnresolved = () => {
    const ids = statementItems
      .filter((item) => ['needs_review', 'unmatched'].includes(item.status))
      .map((item) => item.id);
    setSelectedItemIds(ids);
    setBulkWizardStep(1);
  };

  const clearSelectedItems = () => {
    setSelectedItemIds([]);
    setBulkWizardStep(1);
  };

  const selectedBulkItems = useMemo(() => {
    if (!Array.isArray(statementItems) || statementItems.length === 0) return [];
    const selectedSet = new Set((selectedItemIds || []).map((id) => String(id)));
    return statementItems.filter((item) => selectedSet.has(String(item.id)));
  }, [selectedItemIds, statementItems]);

  const bulkActionPreview = useMemo(() => {
    const totalSelected = selectedBulkItems.length;
    const unresolvedSelected = selectedBulkItems.filter((item) =>
      ['needs_review', 'unmatched'].includes(item.status)
    ).length;
    const withSuggested = selectedBulkItems.filter((item) => Boolean(item.suggested_transaction_id)).length;
    const actionLabel =
      BULK_ACTION_OPTIONS.find((opt) => opt.value === bulkActionForm.action)?.label || bulkActionForm.action;
    const template = composeDefaultBulkRemark(bulkActionForm.action, totalSelected);
    const finalRemarkText = String(bulkActionForm.remark_text || '').trim() || template.text;
    const finalRemarkCategory = String(bulkActionForm.remark_category || '').trim() || template.category || '';

    let impactedCount = totalSelected;
    let skippedEstimate = 0;
    let impactSummary = `${totalSelected} item akan diproses.`;
    if (bulkActionForm.action === 'apply_suggested') {
      impactedCount = withSuggested;
      skippedEstimate = Math.max(0, totalSelected - withSuggested);
      impactSummary =
        skippedEstimate > 0
          ? `${withSuggested} item dijangka dipadankan, ${skippedEstimate} item mungkin di-skip (tiada suggested transaction).`
          : `${withSuggested} item dijangka dipadankan menggunakan suggested transaction.`;
    } else if (bulkActionForm.action === 'exception') {
      impactSummary = `${totalSelected} item akan ditanda sebagai pengecualian (exception).`;
    } else if (bulkActionForm.action === 'unmatch') {
      impactSummary = `${totalSelected} item akan dikembalikan ke status belum dipadankan.`;
    }

    return {
      totalSelected,
      unresolvedSelected,
      withSuggested,
      impactedCount,
      skippedEstimate,
      actionLabel,
      impactSummary,
      finalRemarkText,
      finalRemarkCategory,
    };
  }, [bulkActionForm.action, bulkActionForm.remark_category, bulkActionForm.remark_text, selectedBulkItems]);

  const moveBulkWizardStep = (targetStep) => {
    const nextStep = Math.max(1, Math.min(3, Number(targetStep || 1)));
    if (nextStep >= 2 && bulkActionPreview.totalSelected === 0) {
      toast.error('Pilih sekurang-kurangnya satu item sebelum ke langkah preview.');
      return;
    }
    setBulkWizardStep(nextStep);
  };

  const runBulkAction = async () => {
    if (!canOperate || !activeStatementId) return;
    if (bulkWizardStep < 3) {
      toast.error('Sila lengkapkan wizard hingga langkah 3 (Sahkan) sebelum apply bulk action.');
      return;
    }
    if (selectedItemIds.length === 0) {
      toast.error('Pilih sekurang-kurangnya satu item untuk bulk action');
      return;
    }
    let remarkText = String(bulkActionForm.remark_text || '').trim();
    let remarkCategory = String(bulkActionForm.remark_category || '').trim();
    if (remarkText.length < 3) {
      const template = composeDefaultBulkRemark(
        bulkActionForm.action,
        selectedItemIds.length
      );
      remarkText = template.text;
      if (!remarkCategory) {
        remarkCategory = template.category || '';
      }
      setBulkActionForm((prev) => ({
        ...prev,
        remark_text: remarkText,
        remark_category: prev.remark_category || remarkCategory,
      }));
      toast.info('Bulk remark auto diisi berdasarkan aksi yang dipilih.');
    }

    setBulkActionLoading(true);
    try {
      const payload = {
        action: bulkActionForm.action,
        item_ids: selectedItemIds,
        remark_text: remarkText,
        remark_category: remarkCategory || undefined,
      };
      const result = await fetchJson(
        `/api/accounting-full/bank-reconciliation/${activeStatementId}/bulk-action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      toast.success(
        `Bulk action berjaya: ${result.updated_items || 0} item dikemaskini, ${
          result.skipped_items || 0
        } item di-skip`
      );
      setBulkActionForm((prev) => ({ ...prev, remark_text: '' }));
      setSelectedItemIds([]);
      setBulkWizardStep(1);
      await fetchStatementDetail(activeStatementId);
      await fetchItems(activeStatementId, itemsStatusFilter);
      await refreshStatements();
    } catch (err) {
      toast.error(`Bulk action gagal: ${err.message}`);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const nextActionText = useMemo(() => {
    if (!activeStatement) return 'Langkah 1: Upload statement bank dahulu untuk mula reconcile.';
    if (activeStatement.status === 'uploaded') {
      return 'Langkah seterusnya: klik Auto-Match untuk padankan transaksi secara automatik.';
    }
    if (activeStatement.status === 'in_review' || activeStatement.status === 'rejected') {
      return 'Semak item Perlu Semakan/Belum Dipadankan, isi remark untuk tindakan manual, kemudian submit.';
    }
    if (activeStatement.status === 'ready_for_approval') {
      return 'Statement sedia untuk kelulusan. Pastikan maker-checker dipatuhi.';
    }
    if (activeStatement.status === 'approved') {
      return 'Reconciliation selesai. Anda boleh teruskan ke period close/lock.';
    }
    return 'Ikuti wizard dari kiri ke kanan.';
  }, [activeStatement]);

  const accountSummaryRows = useMemo(() => {
    const summaryMap = new Map();
    const ensureRow = (bankAccountId, bankAccountName) => {
      const key = String(bankAccountId || 'unknown');
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          bank_account_id: key,
          bank_account_name: bankAccountName || 'Akaun Tidak Diketahui',
          total_statements: 0,
          in_progress: 0,
          ready_for_approval: 0,
          approved: 0,
          unresolved_items: 0,
          difference_alert_count: 0,
          latest_updated_at: null,
        });
      }
      return summaryMap.get(key);
    };

    bankAccounts.forEach((acc) => {
      ensureRow(acc.id, acc.name);
    });

    allStatements.forEach((row) => {
      const item = ensureRow(row.bank_account_id, row.bank_account_name);
      item.total_statements += 1;
      if (row.status === 'ready_for_approval') {
        item.ready_for_approval += 1;
      } else if (row.status === 'approved') {
        item.approved += 1;
      } else {
        item.in_progress += 1;
      }
      item.unresolved_items += Number(row.summary?.unresolved_items || 0);
      if (Math.abs(Number(row.summary?.difference || 0)) > 0.01) {
        item.difference_alert_count += 1;
      }

      const ts = row.updated_at || row.created_at;
      if (ts) {
        const currentTs = item.latest_updated_at ? new Date(item.latest_updated_at).getTime() : 0;
        const nextTs = new Date(ts).getTime();
        if (Number.isFinite(nextTs) && nextTs > currentTs) {
          item.latest_updated_at = ts;
        }
      }
    });

    return Array.from(summaryMap.values()).sort((a, b) => {
      if (b.unresolved_items !== a.unresolved_items) {
        return b.unresolved_items - a.unresolved_items;
      }
      if (b.ready_for_approval !== a.ready_for_approval) {
        return b.ready_for_approval - a.ready_for_approval;
      }
      return b.total_statements - a.total_statements;
    });
  }, [allStatements, bankAccounts]);

  const overallAccountStats = useMemo(() => {
    return accountSummaryRows.reduce(
      (acc, row) => {
        acc.total_statements += row.total_statements;
        acc.in_progress += row.in_progress;
        acc.ready_for_approval += row.ready_for_approval;
        acc.approved += row.approved;
        acc.unresolved_items += row.unresolved_items;
        acc.difference_alert_count += row.difference_alert_count;
        return acc;
      },
      {
        total_statements: 0,
        in_progress: 0,
        ready_for_approval: 0,
        approved: 0,
        unresolved_items: 0,
        difference_alert_count: 0,
      }
    );
  }, [accountSummaryRows]);

  const unresolvedStatuses = new Set(['needs_review', 'unmatched']);
  const unresolvedItems = statementItems.filter((item) => unresolvedStatuses.has(item.status));
  const roleChecklistGuide =
    ROLE_CHECKLIST_GUIDE[user?.role] || ROLE_CHECKLIST_GUIDE.bendahari;
  const roleSopTemplate = ROLE_SOP_TEMPLATE[user?.role] || ROLE_SOP_TEMPLATE.bendahari;
  const statementPriorityMap = useMemo(() => {
    const nextMap = new Map();
    statements.forEach((row) => {
      nextMap.set(String(row.id), deriveStatementPriority(row));
    });
    return nextMap;
  }, [statements]);
  const prioritizedStatements = useMemo(() => {
    const rows = [...statements];
    if (!autoPriorityMode) return rows;
    rows.sort((a, b) => {
      const priorityA =
        statementPriorityMap.get(String(a.id)) || deriveStatementPriority(a);
      const priorityB =
        statementPriorityMap.get(String(b.id)) || deriveStatementPriority(b);
      if (priorityB.score !== priorityA.score) {
        return priorityB.score - priorityA.score;
      }
      const dueA = priorityA.daysToDue === null ? 9999 : priorityA.daysToDue;
      const dueB = priorityB.daysToDue === null ? 9999 : priorityB.daysToDue;
      if (dueA !== dueB) {
        return dueA - dueB;
      }
      const updatedA = parseDateText(a.updated_at || a.created_at)?.getTime() || 0;
      const updatedB = parseDateText(b.updated_at || b.created_at)?.getTime() || 0;
      return updatedB - updatedA;
    });
    return rows;
  }, [autoPriorityMode, statementPriorityMap, statements]);
  const dailyActionStatements = useMemo(
    () => prioritizedStatements.filter((row) => isStatementNeedsDailyAction(row)),
    [prioritizedStatements]
  );
  const visibleStatements = useMemo(() => {
    const scopedRows = todayOnlyMode ? dailyActionStatements : prioritizedStatements;
    if (!criticalOnlyMode) return scopedRows;
    return scopedRows.filter((row) => {
      const priority =
        statementPriorityMap.get(String(row.id)) || deriveStatementPriority(row);
      return priority.level === 'critical';
    });
  }, [
    criticalOnlyMode,
    dailyActionStatements,
    prioritizedStatements,
    statementPriorityMap,
    todayOnlyMode,
  ]);
  const priorityLevelStats = useMemo(() => {
    return prioritizedStatements.reduce(
      (acc, row) => {
        const level =
          statementPriorityMap.get(String(row.id))?.level || 'low';
        if (level === 'critical') acc.critical += 1;
        else if (level === 'high') acc.high += 1;
        else if (level === 'medium') acc.medium += 1;
        else acc.low += 1;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0 }
    );
  }, [prioritizedStatements, statementPriorityMap]);
  const topPriorityStatement = useMemo(() => {
    const top = prioritizedStatements[0];
    if (!top) return null;
    const meta = statementPriorityMap.get(String(top.id)) || deriveStatementPriority(top);
    return { statement: top, meta };
  }, [prioritizedStatements, statementPriorityMap]);

  const submitGuard = useMemo(() => {
    if (!activeStatement) {
      return { canSubmit: false, reasons: ['Pilih statement dahulu.'] };
    }
    const summary = activeStatement.summary || {};
    const reasons = [];
    const unresolvedCount = Number(summary.unresolved_items || 0);
    const differenceAbs = Math.abs(Number(summary.difference || 0));
    if (activeStatement.status === 'ready_for_approval') {
      reasons.push('Statement sudah dihantar dan sedang menunggu checker.');
    }
    if (activeStatement.status === 'approved') {
      reasons.push('Statement sudah approved.');
    }
    if (unresolvedCount > 0) {
      reasons.push(`${unresolvedCount} item unresolved masih belum diselesaikan.`);
    }
    if (differenceAbs > 0.01) {
      reasons.push(`Difference masih ${formatCurrency(summary.difference || 0)} (mesti 0.00).`);
    }
    if (!summary.can_submit && reasons.length === 0) {
      reasons.push('Syarat submit belum lengkap. Lengkapkan checklist step 4 dan step 5 dahulu.');
    }
    return {
      canSubmit: canOperate && Boolean(summary.can_submit) && reasons.length === 0,
      reasons,
    };
  }, [activeStatement, canOperate]);

  const decisionGuardReason = useMemo(() => {
    if (!activeStatement) return 'Pilih statement dahulu.';
    if (activeStatement.status === 'approved') return 'Statement sudah approved.';
    if (activeStatement.status !== 'ready_for_approval') {
      return 'Approve/Reject hanya dibenarkan apabila status = Sedia Kelulusan.';
    }
    return '';
  }, [activeStatement]);

  const visibleStepConfig = useMemo(() => {
    if (!simpleMode) return STEP_CONFIG;
    return [
      { id: 4, title: 'Review', desc: 'Semak unresolved dan warning' },
      { id: 5, title: 'Match', desc: 'Pastikan padanan + difference' },
      { id: 6, title: 'Submit', desc: 'Hantar atau approve maker-checker' },
    ];
  }, [simpleMode]);

  const dailySimpleActions = useMemo(() => {
    const summary = activeStatement?.summary || {};
    const status = activeStatement?.status || '';
    const unresolvedCount = Number(summary.unresolved_items || 0);
    const differenceAbs = Math.abs(Number(summary.difference || 0));
    const canSubmitNow = Boolean(summary.can_submit);
    return [
      {
        id: 'review',
        title: '1. Review',
        detail: unresolvedCount > 0 ? `${unresolvedCount} item perlu review` : 'Tiada unresolved item',
        step: 4,
        done: Boolean(activeStatement) && unresolvedCount === 0,
      },
      {
        id: 'match',
        title: '2. Match',
        detail:
          differenceAbs > 0.01
            ? `Difference semasa ${formatCurrency(differenceAbs)}`
            : 'Difference mematuhi syarat',
        step: 5,
        done: Boolean(activeStatement) && differenceAbs <= 0.01,
      },
      {
        id: 'submit',
        title: '3. Submit',
        detail:
          status === 'approved'
            ? 'Statement telah approved'
            : canSubmitNow
            ? 'Sedia dihantar ke checker'
            : 'Lengkapkan checklist sebelum submit',
        step: 6,
        done: status === 'ready_for_approval' || status === 'approved',
      },
    ];
  }, [activeStatement]);

  const simpleModeDoneCount = dailySimpleActions.filter((item) => item.done).length;

  const priorityQueue = useMemo(() => {
    const reviewQueueCount = statements.filter((row) =>
      ['uploaded', 'in_review', 'rejected'].includes(row.status)
    ).length;
    const readyQueueCount = statements.filter(
      (row) => row.status === 'ready_for_approval'
    ).length;
    const diffAlertCount = statements.filter(
      (row) => Math.abs(Number(row.summary?.difference || 0)) > 0.01
    ).length;
    const unresolvedCount = statements.reduce(
      (acc, row) => acc + Number(row.summary?.unresolved_items || 0),
      0
    );
    return [
      {
        id: 'review_queue',
        title: 'Perlu Review Segera',
        count: reviewQueueCount,
        desc: 'Status uploaded / in_review / rejected',
        step: 4,
      },
      {
        id: 'ready_queue',
        title: 'Sedia Untuk Kelulusan',
        count: readyQueueCount,
        desc: 'Perlu tindakan checker',
        step: 6,
      },
      {
        id: 'difference_alert',
        title: 'Difference Alert',
        count: diffAlertCount,
        desc: 'Difference bukan 0.00',
        step: 5,
      },
      {
        id: 'unresolved_items',
        title: 'Unresolved Items',
        count: unresolvedCount,
        desc: 'Perlu remark / match / exception',
        step: 4,
      },
    ];
  }, [statements]);

  const reconciliationChecklist = useMemo(() => {
    const summary = activeStatement?.summary || {};
    const status = activeStatement?.status || '';
    const parserWarnings = Array.isArray(activeStatement?.parser_warnings)
      ? activeStatement.parser_warnings.length
      : 0;
    const unresolvedCount = Number(summary.unresolved_items || 0);
    const differenceAbs = Math.abs(Number(summary.difference || 0));
    const hasStatement = Boolean(activeStatement);
    const hasAutoMatchRun = ['in_review', 'ready_for_approval', 'approved', 'rejected'].includes(status);
    const hasSubmitted = ['ready_for_approval', 'approved'].includes(status);
    const isApproved = status === 'approved';

    return [
      {
        id: 'upload',
        title: 'Upload statement untuk akaun bank yang betul',
        done: hasStatement,
        detail: hasStatement ? 'Statement dipilih.' : 'Belum ada statement dipilih.',
      },
      {
        id: 'preview',
        title: 'Semak parser output (tempoh, profile, warning)',
        done: hasStatement && parserWarnings === 0,
        warn: hasStatement && parserWarnings > 0,
        detail:
          hasStatement && parserWarnings > 0
            ? `${parserWarnings} parser warning perlu semakan.`
            : 'Parser output normal.',
      },
      {
        id: 'auto_match',
        title: 'Jalankan auto-match',
        done: hasAutoMatchRun,
        detail: hasAutoMatchRun ? 'Auto-match telah dijalankan.' : 'Belum jalankan auto-match.',
      },
      {
        id: 'review_unresolved',
        title: 'Selesaikan semua unresolved item',
        done: hasStatement && unresolvedCount === 0,
        warn: hasStatement && unresolvedCount > 0,
        detail:
          unresolvedCount > 0
            ? `${unresolvedCount} item masih belum selesai.`
            : 'Semua item telah diselesaikan.',
      },
      {
        id: 'difference_zero',
        title: 'Pastikan difference = 0.00',
        done: hasStatement && differenceAbs <= 0.01,
        warn: hasStatement && differenceAbs > 0.01,
        detail:
          differenceAbs > 0.01
            ? `Difference semasa: ${formatCurrency(summary.difference || 0)}`
            : 'Difference mematuhi syarat submit.',
      },
      {
        id: 'submit',
        title: 'Submit untuk checker (maker-checker)',
        done: hasSubmitted,
        detail: hasSubmitted ? 'Statement telah dihantar.' : 'Belum submit.',
      },
      {
        id: 'approve',
        title: 'Luluskan oleh checker berbeza pengguna',
        done: isApproved,
        detail: isApproved ? 'Statement telah approved.' : 'Belum approved.',
      },
    ];
  }, [activeStatement]);

  const anomalySignals = useMemo(() => {
    if (!activeStatement) return [];
    const summary = activeStatement.summary || {};
    const signals = [];
    const unresolvedCount = Number(summary.unresolved_items || 0);
    const difference = Number(summary.difference || 0);
    const parserWarnings = Array.isArray(activeStatement.parser_warnings)
      ? activeStatement.parser_warnings.length
      : 0;
    const exceptionItems = Number(summary.exception_items || 0);
    const autoMatchedItems = Number(summary.auto_matched_items || 0);
    const manualMatchedItems = Number(summary.manual_matched_items || 0);
    const totalItems = Number(summary.total_items || 0);

    if (Math.abs(difference) > 0.01) {
      signals.push({
        level: 'high',
        title: 'Difference tidak sifar',
        detail: `Nilai semasa ${formatCurrency(difference)}. Siasat item mismatch sebelum submit.`,
      });
    }
    if (unresolvedCount > 0 && ['ready_for_approval', 'approved'].includes(activeStatement.status)) {
      signals.push({
        level: 'critical',
        title: 'Status tidak konsisten dengan unresolved item',
        detail: `Status ${activeStatement.status} tetapi unresolved masih ${unresolvedCount}.`,
      });
    }
    if (parserWarnings > 0) {
      signals.push({
        level: 'medium',
        title: 'Parser warning dikesan',
        detail: `${parserWarnings} warning pada parser. Semak header/format statement bank.`,
      });
    }
    if (exceptionItems > 0) {
      signals.push({
        level: 'medium',
        title: 'Item exception masih wujud',
        detail: `${exceptionItems} item ditanda exception. Pastikan remark dan eviden lengkap.`,
      });
    }
    if (manualMatchedItems >= 5 && manualMatchedItems > autoMatchedItems * 2) {
      signals.push({
        level: 'medium',
        title: 'Manual match terlalu dominan',
        detail: 'Pertimbangkan semula profile CSV / konfigurasi auto-match untuk elak ralat manusia.',
      });
    }
    const hasMatchingProgress = ['in_review', 'ready_for_approval', 'approved', 'rejected'].includes(
      activeStatement.status
    );
    if (hasMatchingProgress && totalItems >= 8) {
      const matchedItems = autoMatchedItems + manualMatchedItems;
      const matchedRatio = matchedItems / Math.max(totalItems, 1);
      if (matchedRatio < 0.2) {
        signals.push({
          level: 'high',
          title: 'Kemungkinan akaun bank / period tidak tepat',
          detail:
            'Kadar item matched sangat rendah. Semak semula akaun bank dipilih, tempoh statement, dan profile parser.',
        });
      }
    }
    return signals;
  }, [activeStatement]);
  const activeStatementPriority = useMemo(
    () => deriveStatementPriority(activeStatement),
    [activeStatement]
  );
  const nextActionCard = useMemo(() => {
    if (!activeStatement) {
      return {
        title: 'Mula Rekonsiliasi',
        detail: nextActionText,
        ctaLabel: 'Pergi ke Step 1 (Upload)',
        ctaAction: 'go_upload',
        step: 1,
        tone: 'info',
        blockers: [],
      };
    }

    const unresolvedCount = Number(activeStatement.summary?.unresolved_items || 0);
    const status = String(activeStatement.status || '');
    if (status === 'uploaded') {
      return {
        title: 'Jalankan Auto-Match Sekarang',
        detail: nextActionText,
        ctaLabel: 'Buka Step 3 (Auto-Match)',
        ctaAction: 'go_auto_match',
        step: 3,
        tone: 'info',
        blockers: [],
      };
    }
    if (status === 'in_review' || status === 'rejected') {
      if (submitGuard.canSubmit) {
        return {
          title: 'Statement Sedia Untuk Submit',
          detail: 'Semakan lengkap. Teruskan ke Step 6 untuk submit kepada checker.',
          ctaLabel: 'Buka Step 6 (Submit)',
          ctaAction: 'go_checker',
          step: 6,
          tone: 'info',
          blockers: [],
        };
      }
      return {
        title: 'Selesaikan Item Semakan',
        detail: nextActionText,
        ctaLabel: 'Buka Step 4 (Review Item)',
        ctaAction: 'go_review',
        step: 4,
        tone: 'warning',
        blockers:
          unresolvedCount > 0
            ? [`${unresolvedCount} item masih Perlu Semakan/Belum Dipadankan.`]
            : [],
      };
    }
    if (status === 'ready_for_approval') {
      return {
        title: 'Tindakan Checker Diperlukan',
        detail: nextActionText,
        ctaLabel: 'Buka Step 6 (Approve/Reject)',
        ctaAction: 'go_checker',
        step: 6,
        tone: decisionGuardReason ? 'warning' : 'info',
        blockers: decisionGuardReason ? [decisionGuardReason] : [],
      };
    }
    if (status === 'approved') {
      return {
        title: 'Statement Ini Selesai',
        detail: nextActionText,
        ctaLabel: 'Fokus Prioriti #1 Seterusnya',
        ctaAction: 'go_next_priority',
        step: 4,
        tone: 'success',
        blockers: [],
      };
    }

    return {
      title: 'Teruskan Mengikut Wizard',
      detail: nextActionText,
      ctaLabel: `Buka Step ${activeStep}`,
      ctaAction: 'go_current_step',
      step: activeStep,
      tone: 'info',
      blockers: [],
    };
  }, [activeStatement, activeStep, decisionGuardReason, nextActionText, submitGuard.canSubmit]);

  const focusPriorityQueue = async (queueId, step) => {
    let target = null;
    if (queueId === 'review_queue') {
      target = prioritizedStatements.find((row) =>
        ['uploaded', 'in_review', 'rejected'].includes(row.status)
      );
    } else if (queueId === 'ready_queue') {
      target = prioritizedStatements.find((row) => row.status === 'ready_for_approval');
    } else if (queueId === 'difference_alert') {
      target = prioritizedStatements.find(
        (row) => Math.abs(Number(row.summary?.difference || 0)) > 0.01
      );
    } else if (queueId === 'unresolved_items') {
      target = prioritizedStatements.find(
        (row) => Number(row.summary?.unresolved_items || 0) > 0
      );
    }
    if (target?.id) {
      await selectStatement(target.id);
    }
    setActiveStep(step || 4);
  };

  const focusFirstDailyAction = async () => {
    const target = dailyActionStatements[0] || topPriorityStatement?.statement || null;
    if (!target?.id) {
      toast.info('Tiada statement kritikal untuk diselesaikan hari ini.');
      return;
    }
    setTodayOnlyMode(true);
    await selectStatement(target.id);
    setActiveStep(target.status === 'ready_for_approval' ? 6 : 4);
  };

  const handleNextActionCard = async () => {
    if (!nextActionCard) return;
    switch (nextActionCard.ctaAction) {
      case 'go_upload':
        setActiveStep(1);
        break;
      case 'go_auto_match':
        setActiveStep(3);
        break;
      case 'go_review':
        setActiveStep(4);
        setItemsStatusFilter('needs_review');
        if (activeStatementId) {
          await fetchItems(activeStatementId, 'needs_review');
        }
        break;
      case 'go_checker':
        setActiveStep(6);
        break;
      case 'go_next_priority':
        await focusFirstDailyAction();
        break;
      default:
        setActiveStep(nextActionCard.step || 1);
        break;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <span className="ml-3 text-slate-600">Memuat modul reconciliation...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <XCircle className="w-12 h-12 text-red-500 mb-3" />
        <p className="text-slate-700 text-center max-w-xl">{error}</p>
        <button
          onClick={() => navigate('/admin/accounting-full')}
          className="mt-4 min-h-[44px] px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Kembali ke Sistem Perakaunan
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 pb-24 md:p-6 md:pb-6 min-w-0 overflow-x-hidden">
      <div className="mb-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <button
              onClick={() => navigate('/admin/accounting-full')}
              className="min-h-[44px] inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali
            </button>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2 mt-1">
              <WalletCards className="w-7 h-7 text-blue-600" />
              Bank Statement Reconciliation
            </h1>
            <p className="text-slate-600 mt-1">
              Flow mesra pengguna: upload statement, auto-match, semak exception, submit/approve.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSimpleMode((prev) => !prev)}
              className={`min-h-[44px] px-4 py-2 rounded-lg border inline-flex items-center gap-2 ${
                simpleMode
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
              }`}
            >
              {simpleMode ? 'Mode Ringkas Harian (Aktif)' : 'Mode Lanjutan (Aktif)'}
            </button>
            <button
              onClick={bootstrap}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Muat Semula
            </button>
            <span className="inline-flex items-center min-h-[44px] px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-600">
              Role: <strong className="ml-1 text-slate-800">{user?.role || '-'}</strong>
            </span>
          </div>
        </div>
      </div>

      <div
        className={`mb-5 rounded-xl border p-4 ${
          NEXT_ACTION_TONE_STYLE[nextActionCard.tone] || NEXT_ACTION_TONE_STYLE.info
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p className="font-semibold">Kad Tindakan Seterusnya</p>
            <p className="mt-1 font-medium">{nextActionCard.title}</p>
            <p className="mt-1 text-sm">{nextActionCard.detail}</p>
            {Array.isArray(nextActionCard.blockers) && nextActionCard.blockers.length > 0 && (
              <ul className="mt-2 space-y-1">
                {nextActionCard.blockers.slice(0, 2).map((blocker, idx) => (
                  <li key={`next-action-blocker-${idx}`} className="text-xs">
                    - {blocker}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleNextActionCard}
              className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm"
            >
              {nextActionCard.ctaLabel}
            </button>
            <button
              type="button"
              onClick={() => setShowOnboarding((prev) => !prev)}
              className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm"
            >
              {showOnboarding ? 'Sembunyi Panduan' : 'Tunjuk Panduan'}
            </button>
          </div>
        </div>
        {showOnboarding && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {ONBOARDING_STEPS.map((item) => {
              const isCurrent = activeStep === item.step;
              return (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => setActiveStep(item.step)}
                  className={`text-left rounded-lg border px-3 py-2 ${
                    isCurrent
                      ? 'border-blue-400 bg-white'
                      : 'border-blue-100 bg-blue-50 hover:bg-blue-100'
                  }`}
                >
                  <p className="text-sm font-semibold text-blue-900">
                    {item.step}. {item.title}
                  </p>
                  <p className="text-xs text-blue-800 mt-1">{item.help}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {simpleMode && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <p className="text-emerald-900 font-semibold">Mode Ringkas Harian (Review → Match → Submit)</p>
              <p className="text-sm text-emerald-800 mt-1">
                Fokus kepada 3 tindakan utama supaya bendahari/sub-bendahari boleh ikut flow harian dengan cepat.
              </p>
            </div>
            <p className="text-xs text-emerald-700">
              Progress: {simpleModeDoneCount}/3 tindakan selesai.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            {dailySimpleActions.map((action) => {
              const isActive = activeStep === action.step;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={async () => {
                    setActiveStep(action.step);
                    if (!activeStatementId) return;
                    if (action.id === 'review') {
                      setItemsStatusFilter('needs_review');
                      await fetchItems(activeStatementId, 'needs_review');
                    } else if (action.id === 'match') {
                      setItemsStatusFilter('');
                      await fetchItems(activeStatementId, '');
                    }
                  }}
                  className={`text-left rounded-lg border p-3 transition ${
                    action.done
                      ? 'border-emerald-300 bg-white'
                      : isActive
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                  <p className="text-xs text-slate-700 mt-1">{action.detail}</p>
                  <p className="text-[11px] text-slate-500 mt-2">Buka Step {action.step}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p className="text-indigo-900 font-semibold">Template SOP Ikut Peranan</p>
            <p className="text-sm text-indigo-800 mt-1">
              Panduan ringkas ini ikut peranan semasa supaya operator non-accounting tidak terlepas langkah penting.
            </p>
          </div>
          <span className="inline-flex items-center min-h-[32px] px-2 py-1 rounded-lg border border-indigo-200 bg-white text-xs text-indigo-700">
            Role aktif: {user?.role || '-'}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          {roleSopTemplate.map((item, idx) => (
            <div key={`${user?.role || 'role'}-sop-${idx}`} className="rounded-lg border border-indigo-200 bg-white p-3">
              <p className="text-xs font-semibold text-indigo-700">SOP {idx + 1}</p>
              <p className="text-sm text-slate-800 mt-1">{item}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p className="text-slate-900 font-semibold">Queue Prioriti Kerja (Admin/Bendahari/Sub Bendahari)</p>
            <p className="text-sm text-slate-600 mt-1">{roleChecklistGuide}</p>
          </div>
          <p className="text-xs text-slate-500">
            Klik kad untuk lompat ke statement dan langkah berkaitan.
          </p>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {priorityQueue.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => focusPriorityQueue(row.id, row.step)}
              className={`text-left rounded-lg border p-3 transition ${
                row.count > 0
                  ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                  : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
              }`}
            >
              <p className="text-xs text-slate-500">{row.desc}</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">{row.title}</p>
              <p className="text-2xl font-bold mt-1 text-slate-800">{row.count}</p>
              <p className="text-xs mt-1 text-slate-600">Buka Step {row.step}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-slate-900 font-semibold">Checklist SOP Reconciliation</p>
            <button
              type="button"
              onClick={() => setActiveStep(1)}
              className="text-xs text-blue-700 hover:underline"
            >
              Mula semula dari Step 1
            </button>
          </div>
          <div className="space-y-2">
            {reconciliationChecklist.map((item) => {
              const isWarn = Boolean(item.warn);
              const isDone = Boolean(item.done);
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border p-3 ${
                    isDone
                      ? 'border-emerald-200 bg-emerald-50'
                      : isWarn
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" />
                    ) : isWarn ? (
                      <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600" />
                    ) : (
                      <CircleDashed className="w-4 h-4 mt-0.5 text-slate-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-slate-900 font-semibold mb-3">Pengesan Perkara Pelik / Ralat</p>
          {anomalySignals.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Tiada anomali kritikal dikesan pada statement semasa.
            </div>
          ) : (
            <div className="space-y-2">
              {anomalySignals.map((signal, idx) => (
                <div
                  key={`${signal.title}-${idx}`}
                  className={`rounded-lg border p-3 ${
                    signal.level === 'critical'
                      ? 'border-red-300 bg-red-50'
                      : signal.level === 'high'
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-blue-200 bg-blue-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className={`w-4 h-4 mt-0.5 ${
                        signal.level === 'critical'
                          ? 'text-red-600'
                          : signal.level === 'high'
                          ? 'text-amber-600'
                          : 'text-blue-600'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{signal.title}</p>
                      <p className="text-xs text-slate-700 mt-0.5">{signal.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500 mt-3">
            Gunakan panel ini sebagai amaran awal sebelum submit/approve untuk elak lari dari flow accounting standard.
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p className="text-slate-900 font-semibold">Ringkasan Semua Akaun Bank</p>
            <p className="text-slate-600 text-sm mt-1">
              {overallAccountStats.total_statements} statement | In progress:{' '}
              {overallAccountStats.in_progress} | Ready:{' '}
              {overallAccountStats.ready_for_approval} | Approved:{' '}
              {overallAccountStats.approved}
            </p>
          </div>
          <div className="text-sm text-slate-600">
            Unresolved item: <strong>{overallAccountStats.unresolved_items}</strong> | Difference alert:{' '}
            <strong>{overallAccountStats.difference_alert_count}</strong>
          </div>
        </div>

        {accountSummaryRows.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">
            Belum ada data statement untuk dipaparkan.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {accountSummaryRows.map((row) => {
              const isFocused = statementsBankFilter
                ? statementsBankFilter === row.bank_account_id
                : false;
              return (
                <button
                  key={row.bank_account_id}
                  type="button"
                  onClick={async () => {
                    if (!row.bank_account_id || row.bank_account_id === 'unknown') return;
                    setStatementsBankFilter(row.bank_account_id);
                    await refreshStatements(row.bank_account_id);
                  }}
                  className={`text-left rounded-lg border p-3 transition ${
                    isFocused
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                  disabled={!row.bank_account_id || row.bank_account_id === 'unknown'}
                >
                  <p className="text-sm font-semibold text-slate-800">
                    {row.bank_account_name || 'Akaun Tidak Diketahui'}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Statement: {row.total_statements} | In progress: {row.in_progress} | Ready:{' '}
                    {row.ready_for_approval}
                  </p>
                  <p className="text-xs text-slate-600">
                    Unresolved: {row.unresolved_items} | Diff alert: {row.difference_alert_count}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Kemas kini terakhir: {formatDate(row.latest_updated_at)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-6 overflow-x-auto">
        <div
          className={`grid gap-2 ${simpleMode ? 'min-w-[520px] grid-cols-3' : 'min-w-[760px] grid-cols-6'}`}
        >
          {visibleStepConfig.map((step) => {
            const active = activeStep === step.id;
            const done = activeStep > step.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                className={`min-h-[44px] text-left rounded-lg border px-3 py-3 transition ${
                  active
                    ? 'border-blue-400 bg-blue-100'
                    : done
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : active ? (
                    <CircleDashed className="w-4 h-4 text-blue-700" />
                  ) : (
                    <CircleDashed className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="font-semibold text-sm">
                    {step.id}. {step.title}
                  </span>
                </div>
                <p className="text-xs mt-1 text-slate-600">{step.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1 space-y-5">
          <div className="bg-white border border-slate-100 rounded-xl p-4">
            <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-blue-600" />
              Step 1: Upload Statement
            </h2>
            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Akaun Bank *
                </label>
                <select
                  value={uploadForm.bank_account_id}
                  onChange={(e) =>
                    setUploadForm((prev) => ({ ...prev, bank_account_id: e.target.value }))
                  }
                  disabled={!canOperate}
                  className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Pilih Akaun</option>
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <label className="block text-sm font-medium text-slate-700">
                    CSV Profile Mapping (optional)
                  </label>
                  {canOperate && (
                    <button
                      type="button"
                      onClick={openProfileEditor}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 text-sm"
                    >
                      {uploadForm.parser_profile_id ? 'Edit Profile Dipilih' : 'Cipta Profile Baru'}
                    </button>
                  )}
                </div>
                <select
                  value={uploadForm.parser_profile_id}
                  onChange={(e) =>
                    setUploadForm((prev) => ({ ...prev, parser_profile_id: e.target.value }))
                  }
                  disabled={!canOperate}
                  className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Tiada profile (auto-detect header)</option>
                  {csvProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.profile_name}
                      {profile.bank_name ? ` (${profile.bank_name})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">
                  Guna profile untuk bank yang guna susunan/header CSV konsisten.
                </p>

                {profileEditorOpen && canOperate && (
                  <div className="mt-2 p-3 rounded-lg border border-slate-300 bg-white space-y-2">
                    <p className="text-sm font-semibold text-slate-800">Editor CSV Profile</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={profileForm.profile_name}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, profile_name: e.target.value }))
                        }
                        placeholder="Nama profile* (contoh: CIMB Standard)"
                        className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={profileForm.bank_name}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, bank_name: e.target.value }))
                        }
                        placeholder="Nama bank (optional)"
                        className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={profileForm.date_column}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, date_column: e.target.value }))
                        }
                        placeholder="Date column* (contoh: Tarikh)"
                        className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={profileForm.description_column}
                        onChange={(e) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            description_column: e.target.value,
                          }))
                        }
                        placeholder="Description column"
                        className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={profileForm.reference_column}
                        onChange={(e) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            reference_column: e.target.value,
                          }))
                        }
                        placeholder="Reference column"
                        className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                      />
                      <select
                        value={profileForm.delimiter}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, delimiter: e.target.value }))
                        }
                        className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                      >
                        <option value=",">Delimiter Comma (,)</option>
                        <option value=";">Delimiter Semicolon (;)</option>
                        <option value="|">Delimiter Pipe (|)</option>
                        <option value="\\t">Delimiter Tab (\t)</option>
                      </select>
                      <input
                        type="text"
                        value={profileForm.debit_column}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, debit_column: e.target.value }))
                        }
                        placeholder="Debit column"
                        className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={profileForm.credit_column}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, credit_column: e.target.value }))
                        }
                        placeholder="Credit column"
                        className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={profileForm.amount_column}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, amount_column: e.target.value }))
                        }
                        placeholder="Amount column (jika tiada debit/credit)"
                        className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={profileForm.balance_column}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, balance_column: e.target.value }))
                        }
                        placeholder="Balance column"
                        className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <textarea
                      value={profileForm.notes}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      rows={2}
                      placeholder="Nota profile (optional)"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveCsvProfile('create')}
                        disabled={profileSaving}
                        className="min-h-[44px] px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        Simpan Profile Baru
                      </button>
                      <button
                        type="button"
                        onClick={() => saveCsvProfile('update')}
                        disabled={profileSaving || !uploadForm.parser_profile_id}
                        className="min-h-[44px] px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        Kemaskini Profile Dipilih
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          resetProfileForm();
                          setProfileEditorOpen(false);
                        }}
                        className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
                      >
                        Tutup Editor
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Period Start *
                  </label>
                  <input
                    type="date"
                    value={uploadForm.period_start}
                    onChange={(e) =>
                      setUploadForm((prev) => ({ ...prev, period_start: e.target.value }))
                    }
                    disabled={!canOperate}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Period End *
                  </label>
                  <input
                    type="date"
                    value={uploadForm.period_end}
                    onChange={(e) =>
                      setUploadForm((prev) => ({ ...prev, period_end: e.target.value }))
                    }
                    disabled={!canOperate}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Opening Balance
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={uploadForm.opening_balance}
                    onChange={(e) =>
                      setUploadForm((prev) => ({ ...prev, opening_balance: e.target.value }))
                    }
                    disabled={!canOperate}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Closing Balance
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={uploadForm.closing_balance}
                    onChange={(e) =>
                      setUploadForm((prev) => ({ ...prev, closing_balance: e.target.value }))
                    }
                    disabled={!canOperate}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Statement Remark
                </label>
                <textarea
                  value={uploadForm.statement_remark}
                  onChange={(e) =>
                    setUploadForm((prev) => ({ ...prev, statement_remark: e.target.value }))
                  }
                  disabled={!canOperate}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: Statement CIMB March 2026"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Fail Statement (CSV/PDF) *
                </label>
                <input
                  type="file"
                  accept=".csv,.pdf"
                  onChange={(e) =>
                    setUploadForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))
                  }
                  disabled={!canOperate}
                  className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Tip: CSV lebih stabil untuk auto-match.
                </p>
              </div>

              <button
                type="submit"
                disabled={!canOperate || uploading}
                className="w-full min-h-[44px] px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Upload Statement'}
              </button>
              {isReadOnlyAuditor && (
                <p className="text-xs text-slate-500">
                  Akaun juruaudit adalah read-only untuk flow ini.
                </p>
              )}
            </form>
          </div>

          <div className="bg-white border border-slate-100 rounded-xl p-4">
            <div className="flex flex-col gap-2 mb-3">
              <h2 className="font-semibold text-slate-800">Senarai Statement</h2>
              <select
                value={statementsBankFilter}
                onChange={async (e) => {
                  const next = e.target.value;
                  setStatementsBankFilter(next);
                  await refreshStatements(next);
                }}
                className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">Semua Akaun Bank</option>
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTodayOnlyMode((prev) => !prev)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs ${
                    todayOnlyMode
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {todayOnlyMode ? 'Selesai Hari Ini: Aktif' : 'Selesai Hari Ini'}
                </button>
                <button
                  type="button"
                  onClick={() => setAutoPriorityMode((prev) => !prev)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs ${
                    autoPriorityMode
                      ? 'border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {autoPriorityMode ? 'AI Prioriti: Aktif' : 'AI Prioriti: Tidak Aktif'}
                </button>
                <button
                  type="button"
                  onClick={() => setCriticalOnlyMode((prev) => !prev)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs ${
                    criticalOnlyMode
                      ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {criticalOnlyMode ? 'Kritikal Sahaja: Aktif' : 'Kritikal Sahaja'}
                </button>
                <button
                  type="button"
                  onClick={focusFirstDailyAction}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs"
                >
                  Fokus Prioriti #1
                </button>
              </div>
              <div className="text-xs text-slate-600">
                Prioriti queue: Kritikal {priorityLevelStats.critical} | Tinggi {priorityLevelStats.high} |
                Sederhana {priorityLevelStats.medium}.
              </div>
              {topPriorityStatement && (
                <p className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1">
                  AI cadang fokus sekarang: <strong>{topPriorityStatement.statement.bank_account_name || '-'}</strong> (
                  {topPriorityStatement.meta.levelLabel}, skor {topPriorityStatement.meta.score}) -{' '}
                  {topPriorityStatement.meta.nextAction}
                </p>
              )}
              <p className="text-xs text-slate-500">
                Paparan: {visibleStatements.length} daripada {statements.length} statement
                {statementsBankFilter
                  ? ` untuk akaun ${bankAccounts.find((x) => x.id === statementsBankFilter)?.name || '-'}`
                  : ' untuk semua akaun'}
                . Perlu tindakan hari ini: {dailyActionStatements.length}.
              </p>
            </div>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {visibleStatements.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {criticalOnlyMode
                    ? 'Tiada statement berstatus prioriti kritikal dalam skop semasa.'
                    : todayOnlyMode
                    ? 'Tiada statement kritikal untuk diselesaikan hari ini.'
                    : 'Belum ada statement.'}
                </p>
              ) : (
                visibleStatements.map((row) => {
                  const selected = row.id === activeStatementId;
                  const priority =
                    statementPriorityMap.get(String(row.id)) || deriveStatementPriority(row);
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => selectStatement(row.id)}
                      className={`w-full min-h-[44px] p-3 rounded-lg border text-left ${
                        selected
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {row.bank_account_name || 'Akaun Tidak Diketahui'}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[11px] px-2 py-1 rounded-full border ${
                              STATUS_STYLE[row.status] || 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                            title={getStatusTooltip(row.status)}
                          >
                            {getStatusLabel(row.status)}
                          </span>
                          <span
                            className={`text-[11px] px-2 py-1 rounded-full border ${priority.levelStyle}`}
                            title={`Skor prioriti AI: ${priority.score}`}
                          >
                            {priority.levelLabel}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <p className="text-xs text-slate-500">
                          {formatDate(row.period_start)} - {formatDate(row.period_end)}
                        </p>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${priority.dueStyle}`}>
                          {priority.dueLabel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {row.summary?.total_items || 0} item | diff {formatCurrency(row.summary?.difference || 0)}
                      </p>
                      {priority.reasons.length > 0 && (
                        <p className="text-[11px] text-slate-600 mt-1 truncate">
                          Fokus: {priority.reasons[0]}
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-slate-100 rounded-xl p-4">
            <h2 className="font-semibold text-slate-800 mb-3">Step 2: Preview Statement</h2>
            {!activeStatement ? (
              <p className="text-slate-500">Pilih statement dari panel kiri.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500">Akaun Bank</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {activeStatement.bank_account_name || '-'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500">Status</p>
                    <p
                      className="text-sm font-semibold text-slate-800"
                      title={getStatusTooltip(activeStatement.status)}
                    >
                      {getStatusLabel(activeStatement.status)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500">Prioriti AI Queue</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-[11px] px-2 py-1 rounded-full border ${activeStatementPriority.levelStyle}`}
                      >
                        {activeStatementPriority.levelLabel} (Skor {activeStatementPriority.score})
                      </span>
                      <span
                        className={`text-[11px] px-2 py-1 rounded-full border ${activeStatementPriority.dueStyle}`}
                      >
                        {activeStatementPriority.dueLabel}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500">Tempoh</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {formatDate(activeStatement.period_start)} - {formatDate(activeStatement.period_end)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500">Parser</p>
                    <p className="text-sm font-semibold text-slate-800 uppercase">
                      {activeStatement.parser_type || '-'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500">CSV Profile</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {activeStatement.parser_profile_name || 'Auto-detect'}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-violet-700 mt-3">
                  Cadangan tindakan AI: {activeStatementPriority.nextAction}
                </p>
                {Array.isArray(activeStatement.parser_warnings) &&
                  activeStatement.parser_warnings.length > 0 && (
                    <div className="mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50">
                      <p className="text-xs font-semibold text-amber-800">Parser warning:</p>
                      <ul className="text-xs text-amber-700 mt-1 space-y-1">
                        {activeStatement.parser_warnings.map((warning, idx) => (
                          <li key={`${warning}-${idx}`}>- {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </>
            )}
          </div>

          <div className="bg-white border border-slate-100 rounded-xl p-4">
            <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <SearchCheck className="w-5 h-5 text-emerald-600" />
              Step 3: Auto-Match
            </h2>
            <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <p className="text-sm font-semibold text-violet-900 inline-flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  AI Smart Reconcile (ML-style scoring)
                </p>
                <button
                  type="button"
                  onClick={() => fetchAiAssist(activeStatementId)}
                  disabled={!activeStatementId || aiAssistLoading}
                  className="min-h-[32px] px-2 py-1 rounded-md border border-violet-300 bg-white text-violet-700 hover:bg-violet-100 text-xs disabled:opacity-60"
                >
                  {aiAssistLoading ? 'Memuat AI...' : 'Muat Semula AI'}
                </button>
              </div>
              {aiAssist ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-violet-800">
                    Readiness score: <strong>{toNumber(aiAssist.readiness_score, 0).toFixed(1)}</strong> | Engine:{' '}
                    {aiAssist.engine || '-'}
                  </p>
                  <p className="text-xs text-violet-700">
                    Unjuran automasi: {aiAssist.automation_projection?.estimated_auto_match_next_run || 0} item auto-match
                    (pengurangan review {aiAssist.automation_projection?.estimated_review_reduction_pct || 0}%).
                  </p>
                  {Array.isArray(aiAssist.risk_flags) && aiAssist.risk_flags.length > 0 && (
                    <ul className="space-y-1">
                      {aiAssist.risk_flags.slice(0, 3).map((flag, idx) => (
                        <li key={`ai-risk-${idx}`} className="text-xs text-amber-800">
                          - [{flag.level}] {flag.title}: {flag.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={applyAiSuggestedConfig}
                      disabled={!canOperate}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-violet-300 bg-white text-violet-800 hover:bg-violet-100 text-xs disabled:opacity-60"
                    >
                      Guna Konfigurasi AI
                    </button>
                    <button
                      type="button"
                      onClick={runAutoMatchWithAi}
                      disabled={!canOperate || !activeStatementId || autoMatchLoading}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 text-xs disabled:opacity-60"
                    >
                      Jalankan Auto-Match AI
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-violet-700 mt-2">
                  AI assist akan tersedia selepas statement dipilih.
                </p>
              )}
            </div>
            {simpleMode ? (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-medium text-emerald-900">
                  Mode ringkas guna tetapan standard yang konservatif untuk operasi harian.
                </p>
                <p className="text-xs text-emerald-800 mt-1">
                  Jika perlu laras tolerance, tukar ke Mode Lanjutan di bahagian atas skrin.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm text-slate-700 mb-1">Date Tolerance (hari)</label>
                  <input
                    type="number"
                    min={0}
                    max={14}
                    value={autoMatchConfig.date_tolerance_days}
                    onChange={(e) =>
                      setAutoMatchConfig((prev) => ({
                        ...prev,
                        date_tolerance_days: e.target.value,
                      }))
                    }
                    disabled={!canOperate || !activeStatementId}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-700 mb-1">Amount Tolerance</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={autoMatchConfig.amount_tolerance}
                    onChange={(e) =>
                      setAutoMatchConfig((prev) => ({
                        ...prev,
                        amount_tolerance: e.target.value,
                      }))
                    }
                    disabled={!canOperate || !activeStatementId}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-700 mb-1">Min Confidence Suggestion</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={autoMatchConfig.min_confidence_for_suggestion}
                    onChange={(e) =>
                      setAutoMatchConfig((prev) => ({
                        ...prev,
                        min_confidence_for_suggestion: e.target.value,
                      }))
                    }
                    disabled={!canOperate || !activeStatementId}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-700 mb-1">Min Confidence Auto</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={autoMatchConfig.min_confidence_for_auto}
                    onChange={(e) =>
                      setAutoMatchConfig((prev) => ({
                        ...prev,
                        min_confidence_for_auto: e.target.value,
                      }))
                    }
                    disabled={!canOperate || !activeStatementId}
                    className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleRunAutoMatch}
              disabled={!canOperate || !activeStatementId || autoMatchLoading}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-2"
            >
              {autoMatchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
              {autoMatchLoading ? 'Memproses...' : 'Run Auto-Match'}
            </button>
          </div>

          <div className="bg-white border border-slate-100 rounded-xl p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
              <h2 className="font-semibold text-slate-800">Step 4: Review Item</h2>
              <div className="inline-flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-500" />
                <select
                  value={itemsStatusFilter}
                  onChange={async (e) => {
                    const next = e.target.value;
                    setItemsStatusFilter(next);
                    if (activeStatementId) {
                      await fetchItems(activeStatementId, next);
                    }
                  }}
                  className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">Semua Status</option>
                  <option value="needs_review">Perlu Semakan</option>
                  <option value="unmatched">Belum Dipadankan</option>
                  <option value="auto_matched">Padanan Automatik</option>
                  <option value="manual_matched">Padanan Manual</option>
                  <option value="exception">Pengecualian</option>
                </select>
              </div>
            </div>

            {canOperate && activeStatement?.status !== 'approved' && (
              <div className="mb-3 p-3 rounded-lg border border-indigo-200 bg-indigo-50">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-indigo-900">
                    Wizard Bulk Action (item dipilih: {selectedItemIds.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={selectAllUnresolved}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 text-sm"
                    >
                      Pilih Semua Unresolved
                    </button>
                    <button
                      type="button"
                      onClick={clearSelectedItems}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 text-sm"
                    >
                      Nyahpilih Semua
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                  {[1, 2, 3].map((stepNo) => (
                    <button
                      key={`bulk-wizard-step-${stepNo}`}
                      type="button"
                      onClick={() => moveBulkWizardStep(stepNo)}
                      className={`text-left rounded-lg border px-3 py-2 text-sm ${
                        bulkWizardStep === stepNo
                          ? 'border-indigo-400 bg-white text-indigo-900'
                          : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                      }`}
                    >
                      {stepNo === 1 && '1. Pilih Aksi'}
                      {stepNo === 2 && '2. Preview Impak'}
                      {stepNo === 3 && '3. Sahkan & Jalankan'}
                    </button>
                  ))}
                </div>

                {bulkWizardStep === 1 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                      <select
                        value={bulkActionForm.action}
                        onChange={(e) =>
                          setBulkActionForm((prev) => ({ ...prev, action: e.target.value }))
                        }
                        className="min-h-[44px] px-3 py-2 border border-indigo-200 rounded-lg bg-white"
                      >
                        {BULK_ACTION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={bulkActionForm.remark_category}
                        onChange={(e) =>
                          setBulkActionForm((prev) => ({
                            ...prev,
                            remark_category: e.target.value,
                          }))
                        }
                        placeholder="Kategori remark (optional)"
                        className="min-h-[44px] px-3 py-2 border border-indigo-200 rounded-lg bg-white"
                      />
                    </div>
                    <textarea
                      value={bulkActionForm.remark_text}
                      onChange={(e) =>
                        setBulkActionForm((prev) => ({ ...prev, remark_text: e.target.value }))
                      }
                      rows={2}
                      placeholder="Remark bulk (jika kosong, sistem auto isi template standard)"
                      className="w-full px-3 py-2 border border-indigo-200 rounded-lg bg-white"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => moveBulkWizardStep(2)}
                        disabled={selectedItemIds.length === 0}
                        className="min-h-[40px] px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 text-sm"
                      >
                        Seterusnya: Preview
                      </button>
                    </div>
                  </div>
                )}

                {bulkWizardStep === 2 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      <div className="rounded-lg border border-indigo-200 bg-white p-2">
                        <p className="text-[11px] text-slate-500">Dipilih</p>
                        <p className="text-sm font-semibold text-slate-800">{bulkActionPreview.totalSelected}</p>
                      </div>
                      <div className="rounded-lg border border-indigo-200 bg-white p-2">
                        <p className="text-[11px] text-slate-500">Unresolved</p>
                        <p className="text-sm font-semibold text-amber-700">{bulkActionPreview.unresolvedSelected}</p>
                      </div>
                      <div className="rounded-lg border border-indigo-200 bg-white p-2">
                        <p className="text-[11px] text-slate-500">Ada Cadangan</p>
                        <p className="text-sm font-semibold text-emerald-700">{bulkActionPreview.withSuggested}</p>
                      </div>
                      <div className="rounded-lg border border-indigo-200 bg-white p-2">
                        <p className="text-[11px] text-slate-500">Jangkaan Skip</p>
                        <p className="text-sm font-semibold text-red-700">{bulkActionPreview.skippedEstimate}</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-indigo-200 bg-white p-2">
                      <p className="text-xs font-semibold text-indigo-900">Ringkasan Impak</p>
                      <p className="text-xs text-slate-700 mt-1">
                        Aksi: <strong>{bulkActionPreview.actionLabel}</strong>
                      </p>
                      <p className="text-xs text-slate-700">{bulkActionPreview.impactSummary}</p>
                      <p className="text-xs text-slate-700 mt-1">
                        Remark akhir: {bulkActionPreview.finalRemarkText}
                      </p>
                      <p className="text-xs text-slate-700">
                        Kategori akhir: {bulkActionPreview.finalRemarkCategory || '-'}
                      </p>
                    </div>
                    {selectedBulkItems.length > 0 && (
                      <div className="rounded-lg border border-indigo-200 bg-white p-2">
                        <p className="text-xs font-semibold text-indigo-900">Contoh item terlibat</p>
                        <ul className="mt-1 space-y-1">
                          {selectedBulkItems.slice(0, 5).map((item) => (
                            <li key={`bulk-preview-item-${item.id}`} className="text-xs text-slate-700">
                              - {formatDate(item.transaction_date)} | {formatCurrency(item.amount)} |{' '}
                              {String(item.description || '-').slice(0, 72)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => moveBulkWizardStep(1)}
                        className="min-h-[40px] px-3 py-2 rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 text-sm"
                      >
                        Kembali: Pilih Aksi
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBulkWizardStep(3)}
                        disabled={bulkActionPreview.totalSelected === 0}
                        className="min-h-[40px] px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 text-sm"
                      >
                        Teruskan: Sahkan
                      </button>
                    </div>
                  </div>
                )}

                {bulkWizardStep === 3 && (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-indigo-200 bg-white p-2">
                      <p className="text-xs font-semibold text-indigo-900">Sahkan Pelaksanaan Bulk Action</p>
                      <p className="text-xs text-slate-700 mt-1">
                        Anda akan jalankan <strong>{bulkActionPreview.actionLabel}</strong> untuk{' '}
                        <strong>{bulkActionPreview.totalSelected}</strong> item.
                      </p>
                      <p className="text-xs text-slate-700">
                        Jangkaan item diproses: <strong>{bulkActionPreview.impactedCount}</strong> | Jangkaan skip:{' '}
                        <strong>{bulkActionPreview.skippedEstimate}</strong>
                      </p>
                      <p className="text-xs text-slate-700 mt-1">
                        Remark akhir: {bulkActionPreview.finalRemarkText}
                      </p>
                    </div>
                    <div className="flex justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => moveBulkWizardStep(2)}
                        className="min-h-[40px] px-3 py-2 rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 text-sm"
                      >
                        Kembali: Preview
                      </button>
                      <button
                        type="button"
                        onClick={runBulkAction}
                        disabled={bulkActionLoading || bulkActionPreview.totalSelected === 0}
                        className="min-h-[44px] px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 text-sm"
                      >
                        {bulkActionLoading ? 'Memproses...' : 'Sahkan & Apply Bulk Action'}
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-indigo-700 mt-1">
                  Tip: wizard ini membantu elak salah bulk action dengan semakan impak sebelum hantar.
                </p>
              </div>
            )}

            {itemsLoading ? (
              <div className="py-8 flex items-center justify-center text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Memuat item...
              </div>
            ) : statementItems.length === 0 ? (
              <p className="text-slate-500">Tiada item untuk dipaparkan.</p>
            ) : (
              <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
                {statementItems.map((item) => {
                  const itemIdKey = String(item.id);
                  const actionForm = itemActionForms[item.id] || {
                    transaction_id: item.suggested_transaction_id || '',
                    remark_text: '',
                    remark_category: '',
                  };
                  const adjustForm = adjustForms[item.id];
                  const unresolved = unresolvedStatuses.has(item.status);
                  const isSelected = selectedItemIds.includes(item.id);
                  const manualCandidates = manualMatchCandidates[itemIdKey] || [];
                  const manualLoading = Boolean(manualMatchLoadingByItem[itemIdKey]);
                  const manualTouched = Boolean(manualMatchTouchedByItem[itemIdKey]);
                  const bestCandidateEval = evaluateBestCandidate(manualCandidates);
                  const bestSuggestedCandidate = bestCandidateEval.candidate;
                  const selectedManualCandidate = manualCandidates.find(
                    (tx) => String(tx.id) === String(actionForm.transaction_id || '')
                  );
                  return (
                    <div
                      key={item.id}
                      className={`border rounded-lg p-3 ${
                        unresolved ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                        <div>
                          {canOperate && activeStatement?.status !== 'approved' && unresolved && (
                            <label className="inline-flex items-center gap-2 text-xs text-slate-600 mb-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => toggleItemSelection(item.id, e.target.checked)}
                              />
                              Pilih untuk bulk action
                            </label>
                          )}
                          <p className="text-sm font-semibold text-slate-800">
                            {formatDate(item.transaction_date)} | {formatCurrency(item.amount)}
                          </p>
                          <p className="text-sm text-slate-700">{item.description || '-'}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            Ref: {item.reference_number || '-'} | Match score:{' '}
                            {toNumber(item.match_score, 0).toFixed(1)}
                          </p>
                          <p className="text-xs text-slate-500">
                            Matched Tx: {item.matched_transaction_id || '-'} | Suggested Tx:{' '}
                            {item.suggested_transaction_id || '-'}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full border text-xs ${
                            STATUS_STYLE[item.status] || 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                          title={getStatusTooltip(item.status)}
                        >
                          {getStatusLabel(item.status)}
                        </span>
                      </div>

                      {canOperate && activeStatement?.status !== 'approved' && (
                        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 space-y-2">
                              <p className="text-xs font-semibold text-blue-900">
                                Manual Match Picker (mesra pengguna)
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
                                <input
                                  type="text"
                                  value={manualMatchSearchByItem[itemIdKey] || ''}
                                  onChange={(e) =>
                                    setManualSearchText(item.id, e.target.value)
                                  }
                                  placeholder="Carian optional (rujukan / deskripsi)"
                                  className="w-full min-h-[40px] px-3 py-2 border border-blue-200 rounded-lg bg-white text-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    ensureActionForm(item.id, item);
                                    fetchManualMatchCandidates(item, true);
                                  }}
                                  disabled={manualLoading}
                                  className="min-h-[40px] px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 text-sm"
                                >
                                  {manualLoading ? 'Mencari...' : 'Cari Calon'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => suggestBestCandidateForItem(item)}
                                  disabled={manualLoading}
                                  className="min-h-[40px] px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 text-sm"
                                >
                                  Cadang Terbaik
                                </button>
                              </div>
                              <select
                                value={actionForm.transaction_id}
                                onFocus={() => {
                                  ensureActionForm(item.id, item);
                                  fetchManualMatchCandidates(item);
                                }}
                                onChange={(e) =>
                                  updateActionForm(item.id, 'transaction_id', e.target.value)
                                }
                                className="w-full min-h-[44px] px-3 py-2 border border-blue-200 rounded-lg bg-white text-sm"
                              >
                                <option value="">Pilih calon transaksi (optional)</option>
                                {manualCandidates.map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.optionLabel}
                                  </option>
                                ))}
                              </select>
                              {selectedManualCandidate && (
                                <p className="text-xs text-blue-800">
                                  Dipilih: {selectedManualCandidate.transaction_number || selectedManualCandidate.id}{' '}
                                  | score {toNumber(selectedManualCandidate.score, 0).toFixed(0)} | diff{' '}
                                  {formatCurrency(selectedManualCandidate.amountDiff || 0)}
                                </p>
                              )}
                              {!selectedManualCandidate && bestSuggestedCandidate && (
                                <p className="text-xs text-emerald-800">
                                  Cadangan selamat tersedia: {bestSuggestedCandidate.transaction_number || bestSuggestedCandidate.id}{' '}
                                  | score {toNumber(bestSuggestedCandidate.score, 0).toFixed(0)} | diff{' '}
                                  {formatCurrency(bestSuggestedCandidate.amountDiff || 0)} | day gap{' '}
                                  {toNumber(bestSuggestedCandidate.dayGap, 0)}
                                </p>
                              )}
                              {!selectedManualCandidate &&
                                manualTouched &&
                                !manualLoading &&
                                manualCandidates.length > 0 &&
                                !bestSuggestedCandidate && (
                                  <p className="text-xs text-amber-700">
                                    Cadang Terbaik tidak auto-pilih: {bestCandidateEval.reason}
                                  </p>
                                )}
                              {manualTouched && !manualLoading && manualCandidates.length === 0 && (
                                <p className="text-xs text-blue-700">
                                  Tiada calon dijumpai. Anda masih boleh isi Transaction ID secara manual di bawah.
                                </p>
                              )}
                            </div>
                            <input
                              type="text"
                              value={actionForm.transaction_id}
                              onFocus={() => ensureActionForm(item.id, item)}
                              onChange={(e) =>
                                updateActionForm(item.id, 'transaction_id', e.target.value)
                              }
                              placeholder="Fallback: isi Transaction ID manual jika perlu"
                              className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                            />
                            <input
                              type="text"
                              value={actionForm.remark_category}
                              onFocus={() => ensureActionForm(item.id, item)}
                              onChange={(e) =>
                                updateActionForm(item.id, 'remark_category', e.target.value)
                              }
                              placeholder="Remark category (optional)"
                              className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                            />
                            <textarea
                              value={actionForm.remark_text}
                              onFocus={() => ensureActionForm(item.id, item)}
                              onChange={(e) =>
                                updateActionForm(item.id, 'remark_text', e.target.value)
                              }
                              placeholder="Remark wajib untuk tindakan manual..."
                              rows={2}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                            />
                            <p className="text-[11px] text-slate-500">
                              Tip: jika remark kosong, sistem akan auto isi remark standard semasa anda klik tindakan.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => applyManualRemarkTemplate(item, 'match')}
                                className="min-h-[32px] px-2 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs"
                              >
                                Template Padan
                              </button>
                              <button
                                type="button"
                                onClick={() => applyManualRemarkTemplate(item, 'unmatch')}
                                className="min-h-[32px] px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs"
                              >
                                Template Belum Padan
                              </button>
                              <button
                                type="button"
                                onClick={() => applyManualRemarkTemplate(item, 'exception')}
                                className="min-h-[32px] px-2 py-1 rounded-md border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 text-xs"
                              >
                                Template Pengecualian
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {item.suggested_transaction_id && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateActionForm(
                                      item.id,
                                      'transaction_id',
                                      item.suggested_transaction_id
                                    );
                                    submitManualAction(item, 'match');
                                  }}
                                  className="min-h-[44px] px-3 py-2 rounded-lg bg-indigo-100 text-indigo-700 border border-indigo-200 hover:bg-indigo-200"
                                >
                                  Guna Cadangan
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => submitManualAction(item, 'match')}
                                className="min-h-[44px] px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                              >
                                Padan Manual
                              </button>
                              <button
                                type="button"
                                onClick={() => submitManualAction(item, 'unmatch')}
                                className="min-h-[44px] px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                              >
                                Set Belum Dipadankan
                              </button>
                              <button
                                type="button"
                                onClick={() => submitManualAction(item, 'exception')}
                                className="min-h-[44px] px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
                              >
                                Tanda Pengecualian
                              </button>
                              <button
                                type="button"
                                onClick={() => submitRemarkOnly(item)}
                                className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                              >
                                Simpan Remark
                              </button>
                            </div>
                          </div>

                          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                            <p className="text-sm font-semibold text-slate-800 mb-2">
                              Laras Item (optional)
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="date"
                                value={adjustForm?.transaction_date ?? item.transaction_date ?? ''}
                                onChange={(e) =>
                                  updateAdjustForm(item.id, 'transaction_date', e.target.value, item)
                                }
                                className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                              />
                              <input
                                type="text"
                                value={adjustForm?.reference_number ?? item.reference_number ?? ''}
                                onChange={(e) =>
                                  updateAdjustForm(item.id, 'reference_number', e.target.value, item)
                                }
                                placeholder="Reference"
                                className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                              />
                              <input
                                type="number"
                                step="0.01"
                                value={adjustForm?.debit ?? item.debit ?? 0}
                                onChange={(e) =>
                                  updateAdjustForm(item.id, 'debit', e.target.value, item)
                                }
                                placeholder="Debit"
                                className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                              />
                              <input
                                type="number"
                                step="0.01"
                                value={adjustForm?.credit ?? item.credit ?? 0}
                                onChange={(e) =>
                                  updateAdjustForm(item.id, 'credit', e.target.value, item)
                                }
                                placeholder="Credit"
                                className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg"
                              />
                            </div>
                            <textarea
                              value={adjustForm?.description ?? item.description ?? ''}
                              onChange={(e) =>
                                updateAdjustForm(item.id, 'description', e.target.value, item)
                              }
                              placeholder="Description"
                              rows={2}
                              className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg"
                            />
                            <textarea
                              value={adjustForm?.adjustment_remark ?? ''}
                              onChange={(e) =>
                                updateAdjustForm(item.id, 'adjustment_remark', e.target.value, item)
                              }
                              placeholder="Adjustment remark (wajib)"
                              rows={2}
                              className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg"
                            />
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => submitAdjust(item)}
                                className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              >
                                Simpan Pelarasan Item
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-100 rounded-xl p-4">
            <h2 className="font-semibold text-slate-800 mb-3">Step 5: Summary</h2>
            {!activeStatement ? (
              <p className="text-slate-500">Tiada statement dipilih.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500">Total Items</p>
                  <p className="text-lg font-bold text-slate-800">
                    {activeStatement.summary?.total_items || 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <p className="text-xs text-emerald-700">Matched (Auto + Manual)</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {(activeStatement.summary?.auto_matched_items || 0) +
                      (activeStatement.summary?.manual_matched_items || 0)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-700">Need Action</p>
                  <p className="text-lg font-bold text-amber-700">
                    {activeStatement.summary?.unresolved_items || 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500">Statement Net</p>
                  <p className="text-lg font-bold text-slate-800">
                    {formatCurrency(activeStatement.summary?.statement_net || 0)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500">Resolved Net</p>
                  <p className="text-lg font-bold text-slate-800">
                    {formatCurrency(activeStatement.summary?.resolved_total_net || 0)}
                  </p>
                </div>
                <div
                  className={`p-3 rounded-lg border ${
                    Math.abs(activeStatement.summary?.difference || 0) <= 0.01
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <p className="text-xs text-slate-500">Difference</p>
                  <p
                    className={`text-lg font-bold ${
                      Math.abs(activeStatement.summary?.difference || 0) <= 0.01
                        ? 'text-emerald-700'
                        : 'text-red-700'
                    }`}
                  >
                    {formatCurrency(activeStatement.summary?.difference || 0)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-100 rounded-xl p-4">
            <h2 className="font-semibold text-slate-800 mb-3">Step 6: Submit / Approve</h2>
            {!activeStatement ? (
              <p className="text-slate-500">Pilih statement dahulu.</p>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700">
                  Status semasa:{' '}
                  <strong title={getStatusTooltip(activeStatement.status)}>
                    {getStatusLabel(activeStatement.status)}
                  </strong>
                </div>

                {canOperate && activeStatement.status !== 'approved' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="border border-slate-200 rounded-lg p-3">
                      <p className="text-sm font-semibold text-slate-800 mb-2">
                        Submit untuk Kelulusan
                      </p>
                      <textarea
                        value={submitRemark}
                        onChange={(e) => setSubmitRemark(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        placeholder="Nota submit (optional)"
                      />
                      <button
                        type="button"
                        onClick={submitForApproval}
                        disabled={submitLoading || !submitGuard.canSubmit}
                        className="mt-2 min-h-[44px] px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
                      >
                        {submitLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-4 h-4" />
                        )}
                        Submit Statement
                      </button>
                      {!submitGuard.canSubmit && submitGuard.reasons.length > 0 && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                          <p className="text-xs font-semibold text-amber-800">Guard submit aktif:</p>
                          <ul className="mt-1 space-y-1">
                            {submitGuard.reasons.map((reason, idx) => (
                              <li key={`submit-guard-${idx}`} className="text-xs text-amber-700">
                                - {reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="border border-slate-200 rounded-lg p-3">
                      <p className="text-sm font-semibold text-slate-800 mb-2">
                        Approve / Reject
                      </p>
                      <textarea
                        value={approvalRemark}
                        onChange={(e) => setApprovalRemark(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        placeholder="Approval remark (optional)"
                      />
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button
                          type="button"
                          onClick={approveStatement}
                          disabled={approveLoading || Boolean(decisionGuardReason)}
                          className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-2"
                        >
                          {approveLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-4 h-4" />
                          )}
                          Approve
                        </button>
                      </div>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={2}
                        className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg"
                        placeholder="Sebab reject (wajib jika reject)"
                      />
                      <button
                        type="button"
                        onClick={rejectStatement}
                        disabled={rejectLoading || Boolean(decisionGuardReason)}
                        className="mt-2 min-h-[44px] px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-2"
                      >
                        {rejectLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ShieldX className="w-4 h-4" />
                        )}
                        Reject
                      </button>
                      <p className="text-xs text-slate-500 mt-2">
                        Maker-checker: pengguna yang submit tidak boleh approve sendiri.
                      </p>
                      {decisionGuardReason && (
                        <p className="text-xs text-amber-700 mt-1">{decisionGuardReason}</p>
                      )}
                    </div>
                  </div>
                )}

                {activeStatement.status === 'approved' && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                    Statement ini telah diluluskan. Reconciliation selesai.
                  </div>
                )}
              </div>
            )}
          </div>

          {activeStatement && unresolvedItems.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
              Masih ada <strong>{unresolvedItems.length}</strong> item belum selesai. Lengkapkan
              review dahulu sebelum submit.
            </div>
          )}
        </div>
      </div>

      {canOperate && activeStatement && activeStatement.status !== 'approved' && (
        <div className="md:hidden fixed bottom-3 left-3 right-3 z-40 rounded-xl border border-slate-200 bg-white/95 backdrop-blur p-2 shadow-xl">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveStep(4)}
              className="min-h-[44px] rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-medium"
            >
              Review
            </button>
            <button
              type="button"
              onClick={() => setActiveStep(5)}
              className="min-h-[44px] rounded-lg bg-slate-50 text-slate-800 border border-slate-200 text-xs font-medium"
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveStep(6)}
              className="min-h-[44px] rounded-lg bg-blue-600 text-white border border-blue-700 text-xs font-medium"
            >
              Submit/Approve
            </button>
          </div>
          {activeStatement.status === 'uploaded' && (
            <button
              type="button"
              onClick={handleRunAutoMatch}
              disabled={autoMatchLoading}
              className="mt-2 w-full min-h-[44px] rounded-lg bg-emerald-600 text-white border border-emerald-700 text-sm font-medium disabled:opacity-60"
            >
              {autoMatchLoading ? 'Memproses Auto-Match...' : 'Run Auto-Match Sekarang'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
