import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  History,
  Loader2,
  PlayCircle,
  RotateCw,
  Users,
} from 'lucide-react';
import api from '../../../services/api';
import { HelpManualLink } from '../../../components/common';

const CHARGE_TYPE_OPTIONS = [
  { value: 'club', label: 'Kelab' },
  { value: 'association', label: 'Persatuan' },
  { value: 'trip', label: 'Lawatan' },
  { value: 'special', label: 'Aktiviti Khas' },
];

const DEFAULT_PACK_ROWS = [
  { sequence: 1, pack_code: 'PK1', pack_name: 'Teras Wajib', item_codes: '', amount: '' },
  { sequence: 2, pack_code: 'PK2', pack_name: 'Aktiviti', item_codes: '', amount: '' },
  { sequence: 3, pack_code: 'PK3', pack_name: 'Khas', item_codes: '', amount: '' },
];

const parseCsv = (value) => {
  return String(value || '')
    .replace(/\n/g, ',')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
};

const buildPackConfig = (enabled, mode, rows, dueDate) => {
  if (!enabled) {
    return { enabled: false, mode: 'single', packs: [] };
  }
  if (mode !== 'hybrid') {
    return { enabled: true, mode: 'single', packs: [] };
  }

  const packs = rows
    .filter((row) => String(row.pack_name || '').trim())
    .slice(0, 3)
    .map((row, index) => {
      const amountValue = String(row.amount || '').trim();
      return {
        sequence: row.sequence || (index + 1),
        pack_code: String(row.pack_code || `PK${index + 1}`).trim().toUpperCase(),
        pack_name: String(row.pack_name || `Pack ${index + 1}`).trim(),
        item_codes: parseCsv(row.item_codes),
        amount: amountValue ? Number(amountValue) : undefined,
        due_date: dueDate || undefined,
        notes: '',
        is_special_case: true,
      };
    });

  return {
    enabled: true,
    mode: 'hybrid',
    packs,
  };
};

const StatusBadge = ({ status }) => {
  const normalized = String(status || '').toLowerCase();
  const classes =
    normalized === 'completed'
      ? 'bg-emerald-100 text-emerald-700'
      : normalized === 'partial'
        ? 'bg-amber-100 text-amber-700'
        : normalized === 'failed'
          ? 'bg-red-100 text-red-700'
          : normalized === 'processing'
            ? 'bg-cyan-100 text-cyan-700'
            : 'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>{status || '-'}</span>;
};

const extractDownloadFilename = (contentDisposition, fallbackName) => {
  if (!contentDisposition) return fallbackName;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition);
  if (!match?.[1]) return fallbackName;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

const triggerBlobDownload = (blob, filename) => {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const ChargesManagementPage = () => {
  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState({
    charge_name: '',
    charge_code: '',
    charge_type: 'special',
    amount: '',
    due_date: `${currentYear}-12-31`,
    tahun: currentYear,
    target_scope: 'tingkatan',
    apply_mode: 'append_existing_invoice',
    pack_enabled: false,
    pack_mode: 'single',
  });
  const [selectedTingkatan, setSelectedTingkatan] = useState([1]);
  const [kelasInput, setKelasInput] = useState('');
  const [kelabInput, setKelabInput] = useState('');
  const [manualTargetIds, setManualTargetIds] = useState('');
  const [packRows, setPackRows] = useState(DEFAULT_PACK_ROWS);
  const [preview, setPreview] = useState(null);
  const [lastPayload, setLastPayload] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [applyInBackground, setApplyInBackground] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsFilters, setJobsFilters] = useState({
    status: '',
    tahun: '',
    charge_type: '',
  });
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsLimit] = useState(10);
  const [jobsPagination, setJobsPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    total_pages: 1,
  });
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedJobExportMeta, setSelectedJobExportMeta] = useState(null);
  const [selectedJobExportMetaLoading, setSelectedJobExportMetaLoading] = useState(false);
  const [resultActionFilter, setResultActionFilter] = useState('all');
  const [resultRowsPage, setResultRowsPage] = useState(1);
  const [resultRowsLimit] = useState(20);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingApply, setLoadingApply] = useState(false);

  const normalizedTingkatan = useMemo(() => {
    return Array.from(new Set((selectedTingkatan || []).map((value) => Number(value)).filter((value) => value >= 1 && value <= 5)));
  }, [selectedTingkatan]);

  const selectedJobRows = useMemo(() => {
    const rows = selectedJob?.result_rows || [];
    if (resultActionFilter === 'all') return rows;
    return rows.filter((row) => String(row?.action || '').toLowerCase() === resultActionFilter);
  }, [selectedJob, resultActionFilter]);

  const selectedJobRowsPaged = useMemo(() => {
    const start = (resultRowsPage - 1) * resultRowsLimit;
    return selectedJobRows.slice(start, start + resultRowsLimit);
  }, [resultRowsLimit, resultRowsPage, selectedJobRows]);

  const selectedJobRowsTotalPages = useMemo(() => {
    if (!selectedJobRows.length) return 1;
    return Math.ceil(selectedJobRows.length / resultRowsLimit);
  }, [resultRowsLimit, selectedJobRows.length]);

  const selectedJobExportRowCount = useMemo(() => {
    const rawCount = selectedJobExportMeta?.row_count;
    if (Number.isFinite(rawCount)) {
      return Number(rawCount);
    }
    return selectedJobRows.length;
  }, [selectedJobExportMeta?.row_count, selectedJobRows.length]);

  const buildPayload = () => {
    const target_filters = {};
    const target_ids = [];

    if (form.target_scope === 'tingkatan') {
      target_filters.tingkatan = normalizedTingkatan;
    } else if (form.target_scope === 'kelas') {
      target_filters.tingkatan = normalizedTingkatan;
      target_filters.kelas = parseCsv(kelasInput);
    } else if (form.target_scope === 'kelab') {
      target_filters.tingkatan = normalizedTingkatan;
      target_filters.kelab = parseCsv(kelabInput);
    } else if (form.target_scope === 'manual') {
      target_ids.push(...parseCsv(manualTargetIds));
    }

    return {
      charge_name: form.charge_name,
      charge_code: form.charge_code,
      charge_type: form.charge_type,
      amount: Number(form.amount),
      due_date: form.due_date,
      tahun: Number(form.tahun),
      target_scope: form.target_scope,
      target_filters,
      target_ids,
      apply_mode: form.apply_mode,
      pack_config: buildPackConfig(
        form.pack_enabled,
        form.pack_mode,
        packRows,
        form.due_date,
      ),
    };
  };

  const loadJobs = useCallback(async ({ pageValue = jobsPage, filtersValue = jobsFilters } = {}) => {
    setJobsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(jobsLimit));
      params.set('page', String(pageValue));
      if (filtersValue.status) params.set('status', filtersValue.status);
      if (filtersValue.tahun) params.set('tahun', String(filtersValue.tahun));
      if (filtersValue.charge_type) params.set('charge_type', filtersValue.charge_type);

      const response = await api.get(`/api/yuran/charges/jobs?${params.toString()}`);
      setJobs(response.data?.data || []);
      setJobsPagination({
        total: Number(response.data?.total || 0),
        page: Number(response.data?.page || pageValue),
        limit: Number(response.data?.limit || jobsLimit),
        total_pages: Number(response.data?.total_pages || 1),
      });
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Gagal memuatkan sejarah job caj tambahan');
    } finally {
      setJobsLoading(false);
    }
  }, [jobsFilters, jobsLimit, jobsPage]);

  useEffect(() => {
    loadJobs({ pageValue: jobsPage, filtersValue: jobsFilters });
  }, [jobsFilters, jobsPage, loadJobs]);

  useEffect(() => {
    const hasProcessingJob = jobs.some((job) => String(job?.status || '').toLowerCase() === 'processing');
    const selectedIsProcessing = String(selectedJob?.status || '').toLowerCase() === 'processing';
    if (!hasProcessingJob && !selectedIsProcessing) return undefined;

    const timer = window.setTimeout(async () => {
      await loadJobs({ pageValue: jobsPage, filtersValue: jobsFilters });
      if (selectedJob?.id) {
        try {
          const response = await api.get(`/api/yuran/charges/jobs/${selectedJob.id}`);
          setSelectedJob(response.data?.job || null);
        } catch (error) {
          // Silent poll failure to avoid noisy UX.
        }
      }
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [jobs, jobsFilters, jobsPage, loadJobs, selectedJob?.id, selectedJob?.status]);

  const loadSelectedJobExportMeta = useCallback(async ({ jobId = selectedJob?.id, actionValue = resultActionFilter, silent = true } = {}) => {
    if (!jobId) {
      setSelectedJobExportMeta(null);
      setSelectedJobExportMetaLoading(false);
      return;
    }
    setSelectedJobExportMetaLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionValue && actionValue !== 'all') {
        params.set('action', actionValue);
      }
      const response = await api.get(`/api/yuran/charges/jobs/${jobId}/export-meta${params.toString() ? `?${params.toString()}` : ''}`);
      setSelectedJobExportMeta(response.data || null);
    } catch (error) {
      setSelectedJobExportMeta(null);
      if (!silent) {
        toast.error(error?.response?.data?.detail || 'Gagal memuatkan metadata eksport CSV.');
      }
    } finally {
      setSelectedJobExportMetaLoading(false);
    }
  }, [resultActionFilter, selectedJob?.id]);

  useEffect(() => {
    if (!selectedJob?.id) {
      setSelectedJobExportMeta(null);
      setSelectedJobExportMetaLoading(false);
      return;
    }
    loadSelectedJobExportMeta({
      jobId: selectedJob.id,
      actionValue: resultActionFilter,
      silent: true,
    });
  }, [loadSelectedJobExportMeta, resultActionFilter, selectedJob?.id, selectedJob?.status, selectedJob?.updated_at]);

  const handlePreview = async () => {
    const payload = buildPayload();
    setLoadingPreview(true);
    try {
      const response = await api.post('/api/yuran/charges/preview', payload);
      setPreview(response.data);
      setLastPayload(payload);
      setApplyResult(null);
      toast.success('Preview berjaya dijana');
      loadJobs();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Preview gagal dijana');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleApply = async () => {
    const payload = lastPayload || buildPayload();
    setLoadingApply(true);
    try {
      const body = {
        confirm: true,
        preview_id: preview?.preview_id || undefined,
        run_async: applyInBackground,
        payload,
      };
      const response = await api.post('/api/yuran/charges/apply', body);
      setApplyResult(response.data);
      if (response.data?.queued) {
        toast.info('Job apply sedang diproses di latar belakang. Semak status di senarai job.');
      } else {
        toast.success(`Jana pukal selesai (${response.data?.status || 'done'})`);
      }
      await loadJobs();
      if (response.data?.job_id) {
        const detailRes = await api.get(`/api/yuran/charges/jobs/${response.data.job_id}`);
        setSelectedJobExportMeta(null);
        setSelectedJob(detailRes.data?.job || null);
        setResultActionFilter('all');
        setResultRowsPage(1);
      }
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Apply caj tambahan gagal');
    } finally {
      setLoadingApply(false);
    }
  };

  const handleOpenJob = async (jobId) => {
    try {
      const response = await api.get(`/api/yuran/charges/jobs/${jobId}`);
      setSelectedJobExportMeta(null);
      setSelectedJob(response.data?.job || null);
      setResultActionFilter('all');
      setResultRowsPage(1);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Gagal memuatkan detail job');
    }
  };

  const toggleTingkatan = (value) => {
    const numericValue = Number(value);
    setSelectedTingkatan((current) => {
      if (current.includes(numericValue)) {
        return current.filter((entry) => entry !== numericValue);
      }
      return [...current, numericValue].sort((a, b) => a - b);
    });
  };

  const applyJobsFilters = async () => {
    setJobsPage(1);
    await loadJobs({ pageValue: 1, filtersValue: jobsFilters });
  };

  const resetJobsFilters = async () => {
    const defaultFilters = { status: '', tahun: '', charge_type: '' };
    setJobsFilters(defaultFilters);
    setJobsPage(1);
    await loadJobs({ pageValue: 1, filtersValue: defaultFilters });
  };

  const handleJobsPageChange = async (nextPage) => {
    if (nextPage < 1 || nextPage > (jobsPagination.total_pages || 1)) return;
    setJobsPage(nextPage);
    await loadJobs({ pageValue: nextPage, filtersValue: jobsFilters });
  };

  const handleExportSelectedRows = async () => {
    if (!selectedJob) {
      toast.info('Sila pilih job terlebih dahulu.');
      return;
    }
    const exportableCount = selectedJobExportMeta
      ? Number(selectedJobExportMeta.row_count || 0)
      : selectedJobRows.length;
    if (exportableCount <= 0) {
      toast.info('Tiada data untuk dieksport.');
      return;
    }
    const suffix = resultActionFilter === 'all' ? 'all' : resultActionFilter;
    const fallbackName = `yuran-charge-job-${selectedJob.id || 'unknown'}-${suffix}.csv`;
    try {
      const params = new URLSearchParams();
      if (resultActionFilter !== 'all') {
        params.set('action', resultActionFilter);
      }
      const response = await api.get(
        `/api/yuran/charges/jobs/${selectedJob.id}/export${params.toString() ? `?${params.toString()}` : ''}`,
        { responseType: 'blob' },
      );
      const headerValue = response?.headers?.['content-disposition'];
      const fileName = extractDownloadFilename(headerValue, fallbackName);
      triggerBlobDownload(response.data, fileName);
      toast.success(`Eksport CSV berjaya dimuat turun (${exportableCount} rows).`);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Eksport CSV gagal dimuat turun.');
    }
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Caj Tambahan (Fasa 1)</h1>
          <p className="text-slate-600 mt-1">
            Preview impak dahulu, kemudian jana caj tambahan secara pukal ke invois pelajar.
          </p>
          <HelpManualLink sectionId="caj-tambahan" label="Manual caj tambahan" className="mt-1 inline-block" />
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
            <input type="checkbox" checked={applyInBackground} onChange={(e) => setApplyInBackground(e.target.checked)} />
            Apply latar belakang
          </label>
          <button
            type="button"
            onClick={handlePreview}
            disabled={loadingPreview || loadingApply}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
          >
            {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            Preview
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={loadingApply || loadingPreview}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {loadingApply ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Jana Pukal
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <h2 className="text-base font-semibold text-slate-800">Tetapan Caj</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Nama Caj" value={form.charge_name} onChange={(e) => setForm((prev) => ({ ...prev, charge_name: e.target.value }))} />
          <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Kod Caj" value={form.charge_code} onChange={(e) => setForm((prev) => ({ ...prev, charge_code: e.target.value }))} />
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={form.charge_type} onChange={(e) => setForm((prev) => ({ ...prev, charge_type: e.target.value }))}>
            {CHARGE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input type="number" min="0.01" step="0.01" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Amaun (RM)" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} />
          <input type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.due_date} onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))} />
          <input type="number" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.tahun} onChange={(e) => setForm((prev) => ({ ...prev, tahun: e.target.value }))} />
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={form.target_scope} onChange={(e) => setForm((prev) => ({ ...prev, target_scope: e.target.value }))}>
            <option value="tingkatan">Scope: Tingkatan</option>
            <option value="kelas">Scope: Kelas</option>
            <option value="kelab">Scope: Kelab/Persatuan</option>
            <option value="manual">Scope: Manual (ID Pelajar)</option>
          </select>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={form.apply_mode} onChange={(e) => setForm((prev) => ({ ...prev, apply_mode: e.target.value }))}>
            <option value="append_existing_invoice">Tambah ke invoice pending/partial</option>
            <option value="new_invoice_special_case">Cipta invoice khas baharu</option>
          </select>
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-medium text-slate-700">Tingkatan sasaran:</span>
            {[1, 2, 3, 4, 5].map((tingkatan) => (
              <label key={tingkatan} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={normalizedTingkatan.includes(tingkatan)} onChange={() => toggleTingkatan(tingkatan)} />
                Tingkatan {tingkatan}
              </label>
            ))}
          </div>

          {form.target_scope === 'kelas' && (
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Kelas (contoh: A,B,Bestari)" value={kelasInput} onChange={(e) => setKelasInput(e.target.value)} />
          )}

          {form.target_scope === 'kelab' && (
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Kelab/Persatuan (contoh: Robotik, Bola Sepak)" value={kelabInput} onChange={(e) => setKelabInput(e.target.value)} />
          )}

          {form.target_scope === 'manual' && (
            <textarea className="w-full min-h-[90px] rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Masukkan student_id dipisah koma atau baris baharu" value={manualTargetIds} onChange={(e) => setManualTargetIds(e.target.value)} />
          )}
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.pack_enabled} onChange={(e) => setForm((prev) => ({ ...prev, pack_enabled: e.target.checked }))} />
              Aktifkan Billing Pack
            </label>
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={form.pack_mode} disabled={!form.pack_enabled} onChange={(e) => setForm((prev) => ({ ...prev, pack_mode: e.target.value }))}>
              <option value="single">Single</option>
              <option value="hybrid">Hybrid (maks 3 pack)</option>
            </select>
          </div>

          {form.pack_enabled && form.pack_mode === 'hybrid' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">
              {packRows.map((row, index) => (
                <div key={row.sequence} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                  <div className="text-xs font-semibold text-slate-500">Pack {index + 1}</div>
                  <input className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-sm" placeholder="Kod (PK1)" value={row.pack_code} onChange={(e) => setPackRows((current) => current.map((entry, idx) => idx === index ? { ...entry, pack_code: e.target.value } : entry))} />
                  <input className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-sm" placeholder="Nama Pack" value={row.pack_name} onChange={(e) => setPackRows((current) => current.map((entry, idx) => idx === index ? { ...entry, pack_name: e.target.value } : entry))} />
                  <input className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-sm" placeholder="Item codes (cth: CLB01,LAWATAN1)" value={row.item_codes} onChange={(e) => setPackRows((current) => current.map((entry, idx) => idx === index ? { ...entry, item_codes: e.target.value } : entry))} />
                  <input type="number" step="0.01" min="0" className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-sm" placeholder="Amount pack (opsyenal)" value={row.amount} onChange={(e) => setPackRows((current) => current.map((entry, idx) => idx === index ? { ...entry, amount: e.target.value } : entry))} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {preview && (
        <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-cyan-800 font-semibold">
            <Users className="h-4 w-4" /> Preview Impak
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
            <div className="rounded-lg bg-white border border-cyan-100 p-2">Target: <span className="font-semibold">{preview.target_count}</span></div>
            <div className="rounded-lg bg-white border border-cyan-100 p-2">Eligible: <span className="font-semibold">{preview.eligible_count}</span></div>
            <div className="rounded-lg bg-white border border-cyan-100 p-2">Skip: <span className="font-semibold">{preview.skip_count}</span></div>
            <div className="rounded-lg bg-white border border-cyan-100 p-2">Est. Delta: <span className="font-semibold">RM {Number(preview.estimated_total || 0).toFixed(2)}</span></div>
          </div>

          {(preview.warnings || []).length > 0 && (
            <div className="space-y-1">
              {(preview.warnings || []).map((warning) => (
                <div key={warning} className="flex items-start gap-2 text-sm text-amber-700">
                  <AlertCircle className="h-4 w-4 mt-0.5" /> <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {(preview.sample_rows || []).length > 0 && (
            <div className="overflow-auto rounded-lg border border-cyan-100 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Pelajar</th>
                    <th className="px-3 py-2 text-left">Tingkatan/Kelas</th>
                    <th className="px-3 py-2 text-left">Tindakan</th>
                    <th className="px-3 py-2 text-left">Sebab</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample_rows.slice(0, 12).map((row) => (
                    <tr key={`${row.student_id}-${row.invoice_id || 'none'}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">{row.student_name}</td>
                      <td className="px-3 py-2">T{row.tingkatan || '-'} / {row.kelas || '-'}</td>
                      <td className="px-3 py-2">{row.action}</td>
                      <td className="px-3 py-2 text-slate-500">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {applyResult && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold">
            <CheckCircle2 className="h-4 w-4" /> Keputusan Apply
          </div>
          <div className="mt-2 text-sm text-emerald-900">
            Job: <span className="font-semibold">{applyResult.job_number || applyResult.job_id}</span> | Status: <span className="font-semibold">{applyResult.status}</span> | Mode: <span className="font-semibold">{applyResult.mode || (applyResult.queued ? 'background' : 'sync')}</span>
            {applyResult.queued ? (
              <span> | Job sedang diproses di latar belakang.</span>
            ) : (
              <span>
                {' '}| Success: <span className="font-semibold">{applyResult.success_count}</span> | Skip: <span className="font-semibold">{applyResult.skip_count}</span> | Error: <span className="font-semibold">{applyResult.error_count}</span>
              </span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <History className="h-4 w-4" /> Sejarah Job Caj Tambahan
          </div>
          {jobsLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={jobsFilters.status}
              onChange={(e) => setJobsFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="">Semua Status</option>
              <option value="previewed">previewed</option>
              <option value="processing">processing</option>
              <option value="completed">completed</option>
              <option value="partial">partial</option>
              <option value="failed">failed</option>
            </select>
            <input
              type="number"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="Tahun"
              value={jobsFilters.tahun}
              onChange={(e) => setJobsFilters((prev) => ({ ...prev, tahun: e.target.value }))}
            />
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={jobsFilters.charge_type}
              onChange={(e) => setJobsFilters((prev) => ({ ...prev, charge_type: e.target.value }))}
            >
              <option value="">Semua Jenis Caj</option>
              {CHARGE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.value}</option>
              ))}
              <option value="special_charge">special_charge</option>
            </select>
            <div className="flex items-center gap-2">
              <button type="button" className="inline-flex items-center justify-center rounded-lg bg-primary-700 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-800" onClick={applyJobsFilters}>
                Tapis
              </button>
              <button type="button" className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100" onClick={resetJobsFilters}>
                Reset
              </button>
              <button type="button" className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100" onClick={() => loadJobs({ pageValue: jobsPage, filtersValue: jobsFilters })}>
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-auto rounded-lg border border-slate-100">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Job</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Caj</th>
                <th className="px-3 py-2 text-left">Target</th>
                <th className="px-3 py-2 text-left">Hasil</th>
                <th className="px-3 py-2 text-left">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">Tiada job direkodkan</td>
                </tr>
              )}
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{job.job_number || job.id}</td>
                  <td className="px-3 py-2"><StatusBadge status={job.status} /></td>
                  <td className="px-3 py-2">{job.charge_payload?.charge_name || '-'}</td>
                  <td className="px-3 py-2">{job.target_summary?.target_count ?? '-'}</td>
                  <td className="px-3 py-2">
                    OK {job.result_summary?.success_count || 0} / Skip {job.result_summary?.skip_count || 0} / Err {job.result_summary?.error_count || 0}
                  </td>
                  <td className="px-3 py-2">
                    <button type="button" className="rounded border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50" onClick={() => handleOpenJob(job.id)}>
                      Lihat
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-600">
          <div>
            Jumlah: {jobsPagination.total} | Halaman {jobsPagination.page} / {jobsPagination.total_pages}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-slate-200 px-2.5 py-1 hover:bg-slate-50 disabled:opacity-50"
              disabled={jobsPagination.page <= 1}
              onClick={() => handleJobsPageChange(jobsPagination.page - 1)}
            >
              Sebelum
            </button>
            <button
              type="button"
              className="rounded border border-slate-200 px-2.5 py-1 hover:bg-slate-50 disabled:opacity-50"
              disabled={jobsPagination.page >= jobsPagination.total_pages}
              onClick={() => handleJobsPageChange(jobsPagination.page + 1)}
            >
              Seterusnya
            </button>
          </div>
        </div>
      </div>

      {selectedJob && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <ClipboardCheck className="h-4 w-4" />
            Detail Job: {selectedJob.job_number || selectedJob.id}
          </div>
          <div className="text-sm text-slate-600">
            Status: <StatusBadge status={selectedJob.status} />
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                value={resultActionFilter}
                onChange={(e) => {
                  setResultActionFilter(e.target.value);
                  setResultRowsPage(1);
                }}
              >
                <option value="all">Semua Action</option>
                <option value="append">append</option>
                <option value="new_invoice">new_invoice</option>
                <option value="skip">skip</option>
                <option value="error">error</option>
              </select>
              <span className="text-xs text-slate-500">
                Dipapar: {selectedJobRows.length}
              </span>
              <span className="text-xs text-slate-500">
                Eksport: {selectedJobExportMetaLoading ? 'mengira...' : selectedJobExportRowCount}
              </span>
              {selectedJobExportMeta && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    selectedJobExportMeta.source === 'row_store'
                      ? 'bg-emerald-100 text-emerald-700'
                      : selectedJobExportMeta.is_full_export
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {selectedJobExportMeta.source === 'row_store'
                    ? 'Full export (row store)'
                    : selectedJobExportMeta.is_full_export
                      ? 'Snapshot lengkap'
                      : 'Snapshot terhad'}
                </span>
              )}
              {selectedJobExportMeta
                && Number.isFinite(selectedJobExportMeta.expected_row_count)
                && Number(selectedJobExportMeta.expected_row_count) > selectedJobExportRowCount && (
                  <span className="text-[11px] text-amber-700">
                    ({selectedJobExportRowCount}/{Number(selectedJobExportMeta.expected_row_count)})
                  </span>
              )}
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={handleExportSelectedRows}
            >
              <Download className="h-3.5 w-3.5" />
              Eksport CSV
            </button>
          </div>
          <div className="overflow-auto rounded-lg border border-slate-100">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Pelajar</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Delta</th>
                </tr>
              </thead>
              <tbody>
                {selectedJobRowsPaged.map((row, idx) => (
                  <tr key={`${row.student_id || 'row'}-${idx}`} className="border-t border-slate-100">
                    <td className="px-3 py-2">{row.student_name || '-'}</td>
                    <td className="px-3 py-2">{row.action || '-'}</td>
                    <td className="px-3 py-2 text-slate-500">{row.reason || '-'}</td>
                    <td className="px-3 py-2">RM {Number(row.delta_amount || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <div>
              Halaman {resultRowsPage} / {selectedJobRowsTotalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-slate-200 px-2.5 py-1 hover:bg-slate-50 disabled:opacity-50"
                disabled={resultRowsPage <= 1}
                onClick={() => setResultRowsPage((prev) => Math.max(1, prev - 1))}
              >
                Sebelum
              </button>
              <button
                type="button"
                className="rounded border border-slate-200 px-2.5 py-1 hover:bg-slate-50 disabled:opacity-50"
                disabled={resultRowsPage >= selectedJobRowsTotalPages}
                onClick={() => setResultRowsPage((prev) => Math.min(selectedJobRowsTotalPages, prev + 1))}
              >
                Seterusnya
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChargesManagementPage;
