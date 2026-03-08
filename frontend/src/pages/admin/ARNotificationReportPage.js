import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { FileText, RefreshCw, CheckCircle2, AlertCircle, Clock3, Download, History } from 'lucide-react';
import api from '../../services/api';
import { Card, Spinner } from '../../components/common';

const STATUS_LABELS = {
  success: { label: 'Berjaya', className: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Gagal', className: 'bg-red-100 text-red-800' },
  partial: { label: 'Separa', className: 'bg-amber-100 text-amber-800' },
};

const CHANNEL_LABELS = {
  email: 'E-mel',
  push: 'Push',
  print: 'Cetakan',
};

const ACTION_LABELS = {
  single: 'Individu',
  bulk: 'Pukal',
  print_generate: 'Janaan Cetakan',
};

const SOURCE_LABELS = {
  manual: 'Manual/Sync',
  queue: 'Queue Background',
};
const TINGKATAN_OPTIONS = [1, 2, 3, 4, 5];

const DEFAULT_LIMIT = 20;

const getStatusUi = (status) => STATUS_LABELS[String(status || '').toLowerCase()] || {
  label: status || '-',
  className: 'bg-slate-100 text-slate-700',
};

const getJobStatusUi = (status) => {
  const key = String(status || '').toLowerCase();
  if (key === 'completed') return { label: 'Selesai', className: 'bg-emerald-100 text-emerald-800' };
  if (key === 'failed') return { label: 'Gagal', className: 'bg-rose-100 text-rose-800' };
  if (key === 'running') return { label: 'Sedang Diproses', className: 'bg-amber-100 text-amber-800' };
  return { label: 'Dalam Queue', className: 'bg-slate-100 text-slate-700' };
};

const ARNotificationReportPage = () => {
  const location = useLocation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [actionType, setActionType] = useState('');
  const [source, setSource] = useState('');
  const [tingkatan, setTingkatan] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(DEFAULT_LIMIT);
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState({ total: 0, page: 1, limit: DEFAULT_LIMIT, summary: {}, data: [] });
  const [activeTab, setActiveTab] = useState('report');
  const [historyStatus, setHistoryStatus] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState({ total: 0, page: 1, limit: DEFAULT_LIMIT, data: [] });

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (year) params.year = year;
      if (tingkatan) params.tingkatan = Number(tingkatan);
      if (status) params.status = status;
      if (channel) params.channel = channel;
      if (actionType) params.action_type = actionType;
      if (source) params.source = source;

      const res = await api.get('/api/ar/notification-report', { params });
      setReportData(res.data || { total: 0, page: 1, limit, summary: {}, data: [] });
    } catch (e) {
      setReportData({ total: 0, page: 1, limit, summary: {}, data: [] });
      toast.error(e.response?.data?.detail || 'Gagal memuat laporan notifikasi AR.');
    } finally {
      setLoading(false);
    }
  }, [actionType, channel, limit, page, source, status, tingkatan, year]);

  const fetchPrintHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = { page: historyPage, limit };
      if (year) params.year = year;
      if (historyStatus) params.status = historyStatus;
      const res = await api.get('/api/ar/print-jobs', { params });
      setHistoryData(res.data || { total: 0, page: 1, limit, data: [] });
    } catch (e) {
      setHistoryData({ total: 0, page: 1, limit, data: [] });
      toast.error(e.response?.data?.detail || 'Gagal memuat sejarah cetakan PDF.');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage, historyStatus, limit, year]);

  const downloadServerPdf = async (job) => {
    if (!job?.id) return;
    try {
      const res = await api.get(`/api/ar/print-jobs/${job.id}/download`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = job.file_name || `surat-peringatan-ar-${job.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal muat turun PDF server-side.');
    }
  };

  useEffect(() => {
    if (activeTab === 'report') {
      fetchReport();
    }
  }, [activeTab, fetchReport]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const tab = String(params.get('tab') || '').toLowerCase();
    setActiveTab(tab === 'history' ? 'history' : 'report');

    const yearParam = Number(params.get('year'));
    if (Number.isFinite(yearParam) && yearParam >= 2020) {
      setYear(yearParam);
    }

    const tingkatanParam = Number(params.get('tingkatan'));
    if (Number.isFinite(tingkatanParam) && TINGKATAN_OPTIONS.includes(tingkatanParam)) {
      setTingkatan(String(tingkatanParam));
    } else if (params.has('tingkatan')) {
      setTingkatan('');
    }

    const statusParam = String(params.get('status') || '').toLowerCase();
    if (['success', 'failed', 'partial', ''].includes(statusParam)) {
      setStatus(statusParam);
    }

    const channelParam = String(params.get('channel') || '').toLowerCase();
    if (['email', 'push', 'print', ''].includes(channelParam)) {
      setChannel(channelParam);
    }

    const actionParam = String(params.get('action_type') || '').toLowerCase();
    if (['single', 'bulk', 'print_generate', ''].includes(actionParam)) {
      setActionType(actionParam);
    }

    const sourceParam = String(params.get('source') || '').toLowerCase();
    if (['manual', 'queue', ''].includes(sourceParam)) {
      setSource(sourceParam);
    }

    setPage(1);
    setHistoryPage(1);
  }, [location.search]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchPrintHistory();
    }
  }, [activeTab, fetchPrintHistory]);

  const total = Number(reportData?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const rows = Array.isArray(reportData?.data) ? reportData.data : [];
  const summary = reportData?.summary || {};

  const successSummary = summary.success || { records: 0, success_count: 0, failed_count: 0 };
  const failedSummary = summary.failed || { records: 0, success_count: 0, failed_count: 0 };
  const partialSummary = summary.partial || { records: 0, success_count: 0, failed_count: 0 };
  const historyRows = Array.isArray(historyData?.data) ? historyData.data : [];
  const historyTotal = Number(historyData?.total || 0);
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / limit));

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="ar-notification-report-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-heading flex items-center gap-2">
            <FileText className="text-violet-600" size={28} />
            Laporan Notifikasi AR
          </h1>
          <p className="text-slate-600 mt-1">
            Status berjaya/gagal untuk E-mel, Push, dan janaan cetakan surat peringatan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={activeTab === 'report' ? fetchReport : fetchPrintHistory}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 inline-flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Muat Semula
          </button>
          <Link
            to="/admin/ar-outstanding"
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
          >
            Balik ke AR Outstanding
          </Link>
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveTab('report')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            activeTab === 'report' ? 'bg-violet-600 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <FileText size={16} />
          Laporan Notifikasi
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            activeTab === 'history' ? 'bg-violet-600 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <History size={16} />
          Sejarah Cetakan PDF
        </button>
      </div>

      {activeTab === 'report' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-emerald-200 bg-emerald-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-emerald-700 font-medium">Rekod Berjaya</p>
                  <p className="text-2xl font-bold text-emerald-800">{Number(successSummary.records || 0).toLocaleString('ms-MY')}</p>
                  <p className="text-xs text-emerald-700">Berjaya: {Number(successSummary.success_count || 0).toLocaleString('ms-MY')}</p>
                </div>
                <CheckCircle2 className="text-emerald-600" />
              </div>
            </Card>
            <Card className="border-red-200 bg-red-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-700 font-medium">Rekod Gagal</p>
                  <p className="text-2xl font-bold text-red-800">{Number(failedSummary.records || 0).toLocaleString('ms-MY')}</p>
                  <p className="text-xs text-red-700">Gagal: {Number(failedSummary.failed_count || 0).toLocaleString('ms-MY')}</p>
                </div>
                <AlertCircle className="text-red-600" />
              </div>
            </Card>
            <Card className="border-amber-200 bg-amber-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-700 font-medium">Rekod Separa</p>
                  <p className="text-2xl font-bold text-amber-800">{Number(partialSummary.records || 0).toLocaleString('ms-MY')}</p>
                  <p className="text-xs text-amber-700">Berjaya: {Number(partialSummary.success_count || 0).toLocaleString('ms-MY')} • Gagal: {Number(partialSummary.failed_count || 0).toLocaleString('ms-MY')}</p>
                </div>
                <Clock3 className="text-amber-600" />
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tahun</label>
                <select
                  value={year}
                  onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].filter((y) => y >= 2020).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="">Semua</option>
                  <option value="success">Berjaya</option>
                  <option value="failed">Gagal</option>
                  <option value="partial">Separa</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tingkatan</label>
                <select
                  value={tingkatan}
                  onChange={(e) => { setTingkatan(e.target.value); setPage(1); }}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="">Semua</option>
                  {TINGKATAN_OPTIONS.map((t) => (
                    <option key={t} value={String(t)}>Tingkatan {t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Saluran</label>
                <select
                  value={channel}
                  onChange={(e) => { setChannel(e.target.value); setPage(1); }}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="">Semua</option>
                  <option value="email">E-mel</option>
                  <option value="push">Push</option>
                  <option value="print">Cetakan</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Jenis Tindakan</label>
                <select
                  value={actionType}
                  onChange={(e) => { setActionType(e.target.value); setPage(1); }}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="">Semua</option>
                  <option value="single">Individu</option>
                  <option value="bulk">Pukal</option>
                  <option value="print_generate">Janaan Cetakan</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Sumber</label>
                <select
                  value={source}
                  onChange={(e) => { setSource(e.target.value); setPage(1); }}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="">Semua</option>
                  <option value="manual">Manual/Sync</option>
                  <option value="queue">Queue Background</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="py-14 flex items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-slate-500 text-center py-10">Tiada rekod laporan untuk penapis semasa.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-3 font-medium text-slate-600">Tarikh / Masa</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-600">Jenis</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-600">Saluran</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-600">Status</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-600">Sumber</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-600">Tingkatan / Tahun</th>
                        <th className="text-right py-3 px-3 font-medium text-slate-600">Sasaran</th>
                        <th className="text-right py-3 px-3 font-medium text-slate-600">Berjaya</th>
                        <th className="text-right py-3 px-3 font-medium text-slate-600">Gagal</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-600">Template</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-600">Operator</th>
                        <th className="text-left py-3 px-3 font-medium text-slate-600">Ralat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const statusUi = getStatusUi(row.status);
                        const tingkatanLabel = Array.isArray(row.tingkatan)
                          ? row.tingkatan.map((t) => `T${t}`).join(', ')
                          : row.tingkatan != null ? `T${row.tingkatan}` : '-';
                        const templateLabel = row.channel === 'email'
                          ? (row.template_key || '-')
                          : row.channel === 'push'
                            ? (row.push_template_key || '-')
                            : '-';
                        const sourceLabel = SOURCE_LABELS[String(row.source || '').toLowerCase()] || row.source || '-';
                        return (
                          <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                            <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                              {row.created_at ? new Date(row.created_at).toLocaleString('ms-MY') : '-'}
                            </td>
                            <td className="py-2 px-3">{ACTION_LABELS[row.action_type] || row.action_type || '-'}</td>
                            <td className="py-2 px-3">{CHANNEL_LABELS[row.channel] || row.channel || '-'}</td>
                            <td className="py-2 px-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusUi.className}`}>
                                {statusUi.label}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-600">{sourceLabel}</td>
                            <td className="py-2 px-3 text-slate-600">
                              <div>{tingkatanLabel}</div>
                              <div className="text-xs text-slate-400">{row.year || '-'}</div>
                            </td>
                            <td className="py-2 px-3 text-right font-medium">{Number(row.total_targets || 0).toLocaleString('ms-MY')}</td>
                            <td className="py-2 px-3 text-right text-emerald-700">{Number(row.success_count || 0).toLocaleString('ms-MY')}</td>
                            <td className="py-2 px-3 text-right text-red-700">{Number(row.failed_count || 0).toLocaleString('ms-MY')}</td>
                            <td className="py-2 px-3 text-slate-600">{templateLabel}</td>
                            <td className="py-2 px-3 text-slate-600">
                              <div>{row.triggered_by_name || '-'}</div>
                              <div className="text-xs text-slate-400">{row.triggered_by_role || '-'}</div>
                            </td>
                            <td className="py-2 px-3 text-xs text-red-700 max-w-[240px]">
                              {row.error || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                    <p className="text-sm text-slate-600">
                      {total.toLocaleString('ms-MY')} rekod • Halaman {page} / {totalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50 text-sm"
                      >
                        Sebelum
                      </button>
                      <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className="px-3 py-1.5 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50 text-sm"
                      >
                        Seterusnya
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tahun</label>
              <select
                value={year}
                onChange={(e) => { setYear(Number(e.target.value)); setHistoryPage(1); }}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].filter((y) => y >= 2020).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status Job</label>
              <select
                value={historyStatus}
                onChange={(e) => { setHistoryStatus(e.target.value); setHistoryPage(1); }}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                <option value="">Semua</option>
                <option value="queued">Dalam Queue</option>
                <option value="running">Sedang Diproses</option>
                <option value="completed">Selesai</option>
                <option value="failed">Gagal</option>
              </select>
            </div>
          </div>

          {historyLoading ? (
            <div className="py-14 flex items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : historyRows.length === 0 ? (
            <p className="text-slate-500 text-center py-10">Tiada sejarah cetakan PDF untuk penapis semasa.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-3 font-medium text-slate-600">Tarikh Minta</th>
                      <th className="text-left py-3 px-3 font-medium text-slate-600">Operator</th>
                      <th className="text-left py-3 px-3 font-medium text-slate-600">Tingkatan / Tahun</th>
                      <th className="text-left py-3 px-3 font-medium text-slate-600">Status</th>
                      <th className="text-right py-3 px-3 font-medium text-slate-600">Progress</th>
                      <th className="text-right py-3 px-3 font-medium text-slate-600">Sasaran / Dicetak</th>
                      <th className="text-left py-3 px-3 font-medium text-slate-600">Ralat</th>
                      <th className="text-left py-3 px-3 font-medium text-slate-600">Fail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((job) => {
                      const statusUi = getJobStatusUi(job.status);
                      const tingkatanLabel = Array.isArray(job.tingkatan) ? job.tingkatan.map((t) => `T${t}`).join(', ') : '-';
                      return (
                        <tr key={job.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                          <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                            {job.created_at ? new Date(job.created_at).toLocaleString('ms-MY') : '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            <div>{job.created_by_name || '-'}</div>
                            <div className="text-xs text-slate-400">{job.created_by_role || '-'}</div>
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            <div>{tingkatanLabel || '-'}</div>
                            <div className="text-xs text-slate-400">{job.year || '-'}</div>
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusUi.className}`}>
                              {statusUi.label}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="font-medium">{Number(job.progress_percent || 0)}%</div>
                            <div className="text-xs text-slate-500">{Number(job.progress_processed || 0).toLocaleString('ms-MY')} / {Number(job.progress_total || 0).toLocaleString('ms-MY')}</div>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div>{Number(job.total_targets || 0).toLocaleString('ms-MY')}</div>
                            <div className="text-xs text-emerald-700">{Number(job.printed_students_total || 0).toLocaleString('ms-MY')}</div>
                          </td>
                          <td className="py-2 px-3 text-xs text-rose-700 max-w-[240px]">{job.error || '-'}</td>
                          <td className="py-2 px-3">
                            {String(job.status || '').toLowerCase() === 'completed' ? (
                              <button
                                type="button"
                                onClick={() => downloadServerPdf(job)}
                                className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                              >
                                <Download size={12} />
                                Muat turun
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">Belum tersedia</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {historyTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                  <p className="text-sm text-slate-600">
                    {historyTotal.toLocaleString('ms-MY')} rekod • Halaman {historyPage} / {historyTotalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={historyPage <= 1}
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50 text-sm"
                    >
                      Sebelum
                    </button>
                    <button
                      type="button"
                      disabled={historyPage >= historyTotalPages}
                      onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                      className="px-3 py-1.5 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50 text-sm"
                    >
                      Seterusnya
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
};

export default ARNotificationReportPage;
