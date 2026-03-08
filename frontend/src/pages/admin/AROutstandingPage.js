/**
 * Senarai pelajar tertunggak mengikut tingkatan – tab Tingkatan 1–5, pagination,
 * status merah (belum hantar) / hijau (sudah hantar), jenis notifikasi (E-mel / Push).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../services/api';
import { Card, Spinner } from '../../components/common';
import {
  Users,
  Send,
  Mail,
  Bell,
  FileText,
  Printer,
  Download,
  Clock3,
  Settings,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

const TINGKATAN_TABS = [1, 2, 3, 4, 5];
const JOB_HISTORY_PREVIEW_LIMIT = 8;
const DEFAULT_REMINDER_LETTER_TEMPLATE = {
  header: {
    title: 'SURAT PERINGATAN TUNGGAKAN YURAN',
    subtitle: 'Tunggakan yuran persekolahan',
    rows: [
      'RUJUKAN : {rujukan_prefix}/{no_matriks}/{tarikh_surat}',
      'TARIKH : {tarikh_surat}',
      'Kepada:',
      'Ibu Bapa / Penjaga',
      'Pelajar: {nama_pelajar}',
      'No. Matriks: {no_matriks}',
      'Tuan/Puan,',
      'PER: MAKLUMAN TUNGGAKAN YURAN PERSEKOLAHAN',
    ],
  },
  body: {
    intro_rows: [
      'Dengan segala hormatnya perkara di atas adalah dirujuk.',
      'Pihak sekolah ingin memaklumkan bahawa pelajar di bawah jagaan tuan/puan iaitu {nama_pelajar} (No. Matriks: {no_matriks}) mempunyai tunggakan yuran persekolahan seperti berikut:',
    ],
    note_rows: [
      'Sehubungan itu, pihak sekolah amat menghargai kerjasama tuan/puan untuk menjelaskan tunggakan tersebut dalam tempoh yang terdekat bagi memastikan segala urusan pentadbiran dan kemudahan persekolahan pelajar dapat berjalan dengan lancar.',
      'Sekiranya bayaran telah dibuat, sila abaikan makluman ini. Jika tuan/puan mempunyai sebarang pertanyaan atau memerlukan perbincangan lanjut berkaitan kaedah pembayaran, sila hubungi pihak pentadbiran sekolah melalui pejabat sekolah.',
      'Kerjasama dan perhatian daripada pihak tuan/puan amatlah dihargai dan didahului dengan ucapan terima kasih.',
      'Sekian.',
    ],
  },
  footer: {
    rows: [
      'Ini adalah cetakan komputer. Tiada tandatangan diperlukan.',
      '“BERKHIDMAT UNTUK PENDIDIKAN”',
      'Yang menjalankan amanah,',
      '{nama_penandatangan}',
      '{jawatan_penandatangan}',
      '{nama_maktab}',
    ],
  },
  attributes: {
    nama_penandatangan: 'NAMA PENANDATANGAN',
    jawatan_penandatangan: 'JAWATAN PENANDATANGAN',
    nama_maktab: 'NAMA MAKTAB',
    rujukan_prefix: 'SR/KEW',
    butiran_tunggakan_title: 'Butiran Tunggakan:',
    jumlah_label: 'Jumlah Keseluruhan Tunggakan:',
    tahun_semasa_label: 'Tahun Semasa',
    tahun_sebelum_label: 'Tahun Sebelum',
    jumlah_yuran_header: 'Jumlah Yuran',
    jumlah_bayaran_header: 'Jumlah Bayaran',
    jumlah_tunggakan_header: 'Jumlah Tunggakan',
    dijana_sistem_label: 'Tarikh dan masa surat ini dijana oleh sistem:',
    dijana_oleh_label: 'Dijana oleh:',
    show_previous_year_row: '1',
    include_system_generated_footer_note: '1',
  },
};

const normalizeLine = (value, maxLen = 240) => {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLen) : '';
};

const normalizeRows = (rows, maxRows = 10, maxLen = 240) => {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeLine(row, maxLen)).filter(Boolean).slice(0, maxRows);
};

const normalizeReminderLetterTemplate = (rawTemplate) => {
  const source = rawTemplate && typeof rawTemplate === 'object' ? rawTemplate : {};
  const headerSource = source.header && typeof source.header === 'object' ? source.header : {};
  const bodySource = source.body && typeof source.body === 'object' ? source.body : {};
  const footerSource = source.footer && typeof source.footer === 'object' ? source.footer : {};
  const attributeSource = source.attributes && typeof source.attributes === 'object' ? source.attributes : {};

  const headerRows = normalizeRows(headerSource.rows, 14, 180);
  const introRows = normalizeRows(bodySource.intro_rows, 10, 240);
  const noteRows = normalizeRows(bodySource.note_rows, 10, 240);
  const footerRows = normalizeRows(footerSource.rows, 10, 240);

  return {
    header: {
      title: normalizeLine(headerSource.title ?? DEFAULT_REMINDER_LETTER_TEMPLATE.header.title, 120) || DEFAULT_REMINDER_LETTER_TEMPLATE.header.title,
      subtitle: normalizeLine(headerSource.subtitle ?? DEFAULT_REMINDER_LETTER_TEMPLATE.header.subtitle, 180),
      rows: headerRows.length ? headerRows : [...DEFAULT_REMINDER_LETTER_TEMPLATE.header.rows],
    },
    body: {
      intro_rows: introRows.length ? introRows : [...DEFAULT_REMINDER_LETTER_TEMPLATE.body.intro_rows],
      note_rows: noteRows,
    },
    footer: {
      rows: footerRows.length ? footerRows : [...DEFAULT_REMINDER_LETTER_TEMPLATE.footer.rows],
    },
    attributes: {
      nama_penandatangan: normalizeLine(attributeSource.nama_penandatangan ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.nama_penandatangan, 120) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.nama_penandatangan,
      jawatan_penandatangan: normalizeLine(attributeSource.jawatan_penandatangan ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.jawatan_penandatangan, 120) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.jawatan_penandatangan,
      nama_maktab: normalizeLine(attributeSource.nama_maktab ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.nama_maktab, 160) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.nama_maktab,
      rujukan_prefix: normalizeLine(attributeSource.rujukan_prefix ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.rujukan_prefix, 80) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.rujukan_prefix,
      butiran_tunggakan_title: normalizeLine(attributeSource.butiran_tunggakan_title ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.butiran_tunggakan_title, 120) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.butiran_tunggakan_title,
      jumlah_label: normalizeLine(attributeSource.jumlah_label ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.jumlah_label, 160) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.jumlah_label,
      tahun_semasa_label: normalizeLine(attributeSource.tahun_semasa_label ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.tahun_semasa_label, 60) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.tahun_semasa_label,
      tahun_sebelum_label: normalizeLine(attributeSource.tahun_sebelum_label ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.tahun_sebelum_label, 60) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.tahun_sebelum_label,
      jumlah_yuran_header: normalizeLine(attributeSource.jumlah_yuran_header ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.jumlah_yuran_header, 120) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.jumlah_yuran_header,
      jumlah_bayaran_header: normalizeLine(attributeSource.jumlah_bayaran_header ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.jumlah_bayaran_header, 120) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.jumlah_bayaran_header,
      jumlah_tunggakan_header: normalizeLine(attributeSource.jumlah_tunggakan_header ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.jumlah_tunggakan_header, 120) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.jumlah_tunggakan_header,
      dijana_sistem_label: normalizeLine(attributeSource.dijana_sistem_label ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.dijana_sistem_label, 180) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.dijana_sistem_label,
      dijana_oleh_label: normalizeLine(attributeSource.dijana_oleh_label ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.dijana_oleh_label, 120) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.dijana_oleh_label,
      show_previous_year_row: normalizeLine(attributeSource.show_previous_year_row ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.show_previous_year_row, 8) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.show_previous_year_row,
      include_system_generated_footer_note: normalizeLine(attributeSource.include_system_generated_footer_note ?? DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.include_system_generated_footer_note, 8) || DEFAULT_REMINDER_LETTER_TEMPLATE.attributes.include_system_generated_footer_note,
    },
  };
};

const AROutstandingPage = () => {
  const [tingkatan, setTingkatan] = useState(1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [reminderModal, setReminderModal] = useState(null);
  const [reminderChannel, setReminderChannel] = useState(null);
  const [selectedEmailTemplateKey, setSelectedEmailTemplateKey] = useState('fee_reminder');
  const [selectedPushTemplateKey, setSelectedPushTemplateKey] = useState('reminder_full');
  const [emailTemplateKeys, setEmailTemplateKeys] = useState([]);
  const [pushTemplateOptions, setPushTemplateOptions] = useState([]);
  const [reminderSending, setReminderSending] = useState(false);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkChannel, setBulkChannel] = useState(null);
  const [bulkEmailTemplateKey, setBulkEmailTemplateKey] = useState('fee_reminder');
  const [bulkPushTemplateKey, setBulkPushTemplateKey] = useState('reminder_full');
  const [bulkBatch20, setBulkBatch20] = useState(true);
  const [bulkSending, setBulkSending] = useState(false);

  const [printLoading, setPrintLoading] = useState(false);
  const [selectedPrintForms, setSelectedPrintForms] = useState([1, 2, 3, 4, 5]);
  const [printLimitPerForm, setPrintLimitPerForm] = useState(5000);
  const [serverPdfLoading, setServerPdfLoading] = useState(false);
  const [activePrintJob, setActivePrintJob] = useState(null);
  const [recentPrintJobs, setRecentPrintJobs] = useState([]);
  const [jobRefreshLoading, setJobRefreshLoading] = useState(false);
  const [, setPrintJobNoticeMap] = useState({});
  const [bulkJobQueueLoading, setBulkJobQueueLoading] = useState(false);
  const [activeNotificationJob, setActiveNotificationJob] = useState(null);
  const [recentNotificationJobs, setRecentNotificationJobs] = useState([]);
  const [notificationJobRefreshLoading, setNotificationJobRefreshLoading] = useState(false);
  const [retryNotificationJobLoadingId, setRetryNotificationJobLoadingId] = useState('');
  const [retryAllNotificationJobsLoading, setRetryAllNotificationJobsLoading] = useState(false);
  const [retryAllNotificationChannel, setRetryAllNotificationChannel] = useState('');
  const [, setNotificationJobNoticeMap] = useState({});

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [letterTemplate, setLetterTemplate] = useState(DEFAULT_REMINDER_LETTER_TEMPLATE);
  const [letterTemplateMeta, setLetterTemplateMeta] = useState({ updated_at: null, updated_by: '' });

  const fetchOutstanding = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/ar/outstanding-by-tingkatan', {
        params: { tingkatan, year, page, limit },
      });
      setData(res.data);
    } catch (e) {
      setData(null);
      toast.error(e.response?.data?.detail || 'Gagal muat senarai tertunggak.');
    } finally {
      setLoading(false);
    }
  }, [tingkatan, year, page, limit]);

  useEffect(() => {
    fetchOutstanding();
  }, [fetchOutstanding]);

  const sendReminder = async (studentId, channel, templateKey, pushTemplateKey) => {
    setReminderSending(true);
    try {
      const body = { student_id: studentId, channel };
      if (channel === 'email' && templateKey) body.template_key = templateKey;
      if (channel === 'push' && pushTemplateKey) body.push_template_key = pushTemplateKey;
      const res = await api.post('/api/ar/send-reminder', body);
      setReminderModal(null);
      setReminderChannel(null);
      toast.success(res.data?.message || 'Peringatan telah dihantar.');
      if (res.data?.whatsapp_link) {
        toast.success('Pautan WhatsApp disediakan', {
          action: { label: 'Buka WhatsApp', onClick: () => window.open(res.data.whatsapp_link, '_blank') },
        });
      }
      fetchOutstanding();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal hantar peringatan.');
    } finally {
      setReminderSending(false);
    }
  };

  const openReminderChoice = async (row) => {
    setReminderModal({ studentId: row.student_id, studentName: row.student_name || 'Pelajar' });
    setReminderChannel(null);
    setSelectedEmailTemplateKey('fee_reminder');
    setSelectedPushTemplateKey('reminder_full');
    try {
      const [keysRes, pushRes] = await Promise.all([
        api.get('/api/email-templates/keys').catch(() => ({ data: { keys: [] } })),
        api.get('/api/ar/push-template-options').catch(() => ({ data: { options: [] } })),
      ]);
      setEmailTemplateKeys(keysRes.data?.keys || []);
      setPushTemplateOptions(pushRes.data?.options || []);
    } catch (_) {
      setEmailTemplateKeys([]);
      setPushTemplateOptions([]);
    }
  };

  const openBulkModal = async () => {
    setBulkModalOpen(true);
    setBulkChannel(null);
    setBulkEmailTemplateKey('fee_reminder');
    setBulkPushTemplateKey('reminder_full');
    setBulkBatch20(true);
    try {
      const [keysRes, pushRes] = await Promise.all([
        api.get('/api/email-templates/keys').catch(() => ({ data: { keys: [] } })),
        api.get('/api/ar/push-template-options').catch(() => ({ data: { options: [] } })),
      ]);
      setEmailTemplateKeys(keysRes.data?.keys || []);
      setPushTemplateOptions(pushRes.data?.options || []);
    } catch (_) {
      setEmailTemplateKeys([]);
      setPushTemplateOptions([]);
    }
  };

  const sendBulkReminder = async () => {
    if (!bulkChannel) {
      toast.error('Sila pilih saluran: E-mel sahaja atau Push sahaja.');
      return;
    }
    if ((total || 0) > 1000) {
      const useQueue = window.confirm(
        `Pukal ini melibatkan ${Number(total || 0).toLocaleString('ms-MY')} penerima. Disyorkan guna Queue Background untuk prestasi lebih stabil. Klik OK untuk queue background, Cancel untuk terus hantar terus.`
      );
      if (useQueue) {
        await queueBulkReminderBackground();
        return;
      }
    }
    setBulkSending(true);
    try {
      const body = {
        tingkatan,
        year,
        channel: bulkChannel,
        batch_size: bulkBatch20 ? 20 : 0,
      };
      if (bulkChannel === 'email') body.template_key = bulkEmailTemplateKey;
      if (bulkChannel === 'push') body.push_template_key = bulkPushTemplateKey;
      const res = await api.post('/api/ar/send-reminder-bulk', body);
      setBulkModalOpen(false);
      const d = res.data || {};
      toast.success(`Pukal selesai: ${d.sent || 0} dihantar, ${d.failed || 0} gagal.`);
      if ((d.failed || 0) > 0 && (d.errors || []).length) {
        toast.error(`Contoh ralat: ${d.errors[0].error}`, { duration: 5000 });
      }
      fetchOutstanding();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal hantar peringatan pukal.');
    } finally {
      setBulkSending(false);
    }
  };

  const fetchRecentNotificationJobs = useCallback(async (showSpinner = false) => {
    if (showSpinner) setNotificationJobRefreshLoading(true);
    try {
      const res = await api.get('/api/ar/notification-jobs', {
        params: {
          year,
          tingkatan,
          page: 1,
          limit: JOB_HISTORY_PREVIEW_LIMIT,
        },
      });
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      setRecentNotificationJobs(rows);
      if (activeNotificationJob?.id) {
        const matched = rows.find((job) => job.id === activeNotificationJob.id);
        if (matched) setActiveNotificationJob(matched);
      }
    } catch (e) {
      if (showSpinner) {
        toast.error(e.response?.data?.detail || 'Gagal muat sejarah job notifikasi.');
      }
    } finally {
      if (showSpinner) setNotificationJobRefreshLoading(false);
    }
  }, [activeNotificationJob?.id, year, tingkatan]);

  const queueBulkReminderBackground = async () => {
    if (!bulkChannel) {
      toast.error('Sila pilih saluran: E-mel sahaja atau Push sahaja.');
      return;
    }
    setBulkJobQueueLoading(true);
    try {
      const body = {
        tingkatan,
        year,
        channel: bulkChannel,
        batch_size: bulkBatch20 ? 20 : 0,
      };
      if (bulkChannel === 'email') body.template_key = bulkEmailTemplateKey;
      if (bulkChannel === 'push') body.push_template_key = bulkPushTemplateKey;
      const res = await api.post('/api/ar/notification-jobs', body);
      const job = res.data?.job || null;
      setActiveNotificationJob(job);
      if (job?.id) {
        setNotificationJobNoticeMap((prev) => ({ ...prev, [job.id]: false }));
      }
      setBulkModalOpen(false);
      toast.success('Job notifikasi pukal dimasukkan ke queue background.');
      fetchRecentNotificationJobs(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal queue notifikasi pukal background.');
    } finally {
      setBulkJobQueueLoading(false);
    }
  };

  const retryFailedNotificationJob = async (job) => {
    if (!job?.id) return;
    const failedCount = Number(job.failed_student_ids_count || job.failed_count || 0);
    if (failedCount <= 0) {
      toast.error('Tiada penerima gagal untuk diulang hantar.');
      return;
    }
    const proceed = window.confirm(
      `Ulang hantar notifikasi gagal sahaja untuk job ini? Jumlah sasaran retry: ${failedCount.toLocaleString('ms-MY')} penerima.`
    );
    if (!proceed) return;

    setRetryNotificationJobLoadingId(job.id);
    try {
      const body = { batch_size: Number(job.batch_size || (bulkBatch20 ? 20 : 0) || 20) };
      const res = await api.post(`/api/ar/notification-jobs/${job.id}/retry-failed`, body);
      const nextJob = res.data?.job || null;
      setActiveNotificationJob(nextJob);
      if (nextJob?.id) {
        setNotificationJobNoticeMap((prev) => ({ ...prev, [nextJob.id]: false }));
      }
      toast.success('Retry job berjaya dimasukkan ke queue background.');
      fetchRecentNotificationJobs(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal queue retry untuk penerima gagal.');
    } finally {
      setRetryNotificationJobLoadingId('');
    }
  };

  const retryAllFailedNotificationJobs = async () => {
    const selectedChannel = String(retryAllNotificationChannel || '').toLowerCase();
    const channelLabel = selectedChannel === 'email' ? 'E-mel' : selectedChannel === 'push' ? 'Push' : 'Semua saluran';
    const retryablePreviewCount = selectedChannel === 'email'
      ? retryableNotificationCountEmail
      : selectedChannel === 'push'
        ? retryableNotificationCountPush
        : retryableNotificationCountAll;
    if (retryablePreviewCount <= 0) {
      toast.error(`Tiada job gagal yang boleh diulang untuk ${channelLabel}.`);
      return;
    }
    const proceed = window.confirm(
      `Queue retry untuk semua job notifikasi gagal bagi Tingkatan ${tingkatan} (tahun ${year}) [${channelLabel}]?${retryablePreviewCount > 0 ? ` Anggaran dari sejarah semasa: ${retryablePreviewCount} job.` : ''}`
    );
    if (!proceed) return;

    setRetryAllNotificationJobsLoading(true);
    try {
      const body = {
        year,
        tingkatan,
        ...(selectedChannel ? { channel: selectedChannel } : {}),
        batch_size: bulkBatch20 ? 20 : 0,
        max_jobs: 20,
      };
      const res = await api.post('/api/ar/notification-jobs/retry-failed-batch', body);
      const queuedJobs = Array.isArray(res.data?.queued_jobs) ? res.data.queued_jobs : [];
      const queuedCount = Number(res.data?.queued_count || queuedJobs.length || 0);
      if (!queuedCount) {
        const firstReason = res.data?.skipped_samples?.[0]?.reason;
        toast.error(firstReason || 'Tiada job gagal yang layak untuk retry.');
        return;
      }
      setActiveNotificationJob(queuedJobs[0] || null);
      setNotificationJobNoticeMap((prev) => {
        const next = { ...prev };
        queuedJobs.forEach((job) => {
          if (job?.id) next[job.id] = false;
        });
        return next;
      });
      toast.success(`Retry batch berjaya di-queue: ${queuedCount.toLocaleString('ms-MY')} job.`);
      fetchRecentNotificationJobs(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal queue retry semua job gagal.');
    } finally {
      setRetryAllNotificationJobsLoading(false);
    }
  };

  const togglePrintForm = (formValue) => {
    setSelectedPrintForms((prev) => {
      if (prev.includes(formValue)) {
        return prev.filter((value) => value !== formValue);
      }
      return [...prev, formValue].sort((a, b) => a - b);
    });
  };

  const fetchRecentPrintJobs = useCallback(async (showSpinner = false) => {
    if (showSpinner) setJobRefreshLoading(true);
    try {
      const res = await api.get('/api/ar/print-jobs', {
        params: {
          year,
          page: 1,
          limit: JOB_HISTORY_PREVIEW_LIMIT,
        },
      });
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      setRecentPrintJobs(rows);
      if (activePrintJob?.id) {
        const matched = rows.find((job) => job.id === activePrintJob.id);
        if (matched) setActivePrintJob(matched);
      }
    } catch (e) {
      if (showSpinner) {
        toast.error(e.response?.data?.detail || 'Gagal muat sejarah cetakan PDF server.');
      }
    } finally {
      if (showSpinner) setJobRefreshLoading(false);
    }
  }, [activePrintJob?.id, year]);

  const queueServerPdfJob = async () => {
    const selectedForms = [...selectedPrintForms].sort((a, b) => a - b);
    if (!selectedForms.length) {
      toast.error('Sila pilih sekurang-kurangnya satu tingkatan untuk janaan PDF.');
      return;
    }
    setServerPdfLoading(true);
    try {
      const res = await api.post('/api/ar/print-jobs', {
        year,
        tingkatan: selectedForms,
        limit_per_tingkatan: Math.min(50000, Math.max(100, Number(printLimitPerForm || 5000))),
      });
      const job = res.data?.job || null;
      setActivePrintJob(job);
      if (job?.id) {
        setPrintJobNoticeMap((prev) => ({ ...prev, [job.id]: false }));
      }
      toast.success('Job PDF server-side berjaya dimasukkan ke queue.');
      fetchRecentPrintJobs(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal masukkan job PDF server-side.');
    } finally {
      setServerPdfLoading(false);
    }
  };

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
      toast.error(e.response?.data?.detail || 'Gagal muat turun PDF daripada server.');
    }
  };

  useEffect(() => {
    fetchRecentPrintJobs(false);
  }, [fetchRecentPrintJobs]);

  useEffect(() => {
    if (!activePrintJob?.id) return undefined;
    const status = String(activePrintJob.status || '').toLowerCase();
    if (!['queued', 'running'].includes(status)) return undefined;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/api/ar/print-jobs/${activePrintJob.id}`);
        const nextJob = res.data?.job || null;
        if (!nextJob) return;
        setActivePrintJob(nextJob);
        if (['completed', 'failed'].includes(String(nextJob.status || '').toLowerCase())) {
          setPrintJobNoticeMap((prev) => {
            if (prev[nextJob.id]) return prev;
            if (String(nextJob.status || '').toLowerCase() === 'completed') {
              toast.success('PDF server-side siap dijana. Anda boleh muat turun sekarang.');
            } else {
              toast.error(nextJob.error || 'Job PDF server-side gagal dijana.');
            }
            return { ...prev, [nextJob.id]: true };
          });
          fetchRecentPrintJobs(false);
        }
      } catch (_) {
        // Senyap semasa polling untuk elak spam toast.
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activePrintJob?.id, activePrintJob?.status, fetchRecentPrintJobs]);

  useEffect(() => {
    fetchRecentNotificationJobs(false);
  }, [fetchRecentNotificationJobs]);

  useEffect(() => {
    if (!activeNotificationJob?.id) return undefined;
    const status = String(activeNotificationJob.status || '').toLowerCase();
    if (!['queued', 'running'].includes(status)) return undefined;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/api/ar/notification-jobs/${activeNotificationJob.id}`);
        const nextJob = res.data?.job || null;
        if (!nextJob) return;
        setActiveNotificationJob(nextJob);
        if (['completed', 'failed'].includes(String(nextJob.status || '').toLowerCase())) {
          setNotificationJobNoticeMap((prev) => {
            if (prev[nextJob.id]) return prev;
            if (String(nextJob.status || '').toLowerCase() === 'completed') {
              toast.success(`Job notifikasi selesai: ${nextJob.success_count || 0} berjaya, ${nextJob.failed_count || 0} gagal.`);
            } else {
              toast.error(nextJob.error || 'Job notifikasi background gagal.');
            }
            return { ...prev, [nextJob.id]: true };
          });
          fetchOutstanding();
          fetchRecentNotificationJobs(false);
        }
      } catch (_) {
        // Senyap semasa polling untuk elak spam toast.
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeNotificationJob?.id, activeNotificationJob?.status, fetchOutstanding, fetchRecentNotificationJobs]);

  const fetchReminderLetterTemplate = async () => {
    setTemplateLoading(true);
    try {
      const res = await api.get('/api/ar/reminder-letter-template');
      setLetterTemplate(normalizeReminderLetterTemplate(res.data?.template));
      setLetterTemplateMeta({
        updated_at: res.data?.updated_at || null,
        updated_by: res.data?.updated_by || '',
      });
    } catch (e) {
      setLetterTemplate(DEFAULT_REMINDER_LETTER_TEMPLATE);
      setLetterTemplateMeta({ updated_at: null, updated_by: '' });
      toast.error(e.response?.data?.detail || 'Gagal muat template surat peringatan.');
    } finally {
      setTemplateLoading(false);
    }
  };

  const openTemplateModal = async () => {
    setTemplateModalOpen(true);
    await fetchReminderLetterTemplate();
  };

  const updateTemplateField = (section, field, value) => {
    setLetterTemplate((prev) => ({
      ...prev,
      [section]: {
        ...(prev?.[section] || {}),
        [field]: value,
      },
    }));
  };

  const updateTemplateRows = (section, field, updater) => {
    setLetterTemplate((prev) => {
      const next = normalizeReminderLetterTemplate(prev);
      const rows = [...(next?.[section]?.[field] || [])];
      next[section][field] = updater(rows);
      return next;
    });
  };

  const saveReminderLetterTemplate = async () => {
    setTemplateSaving(true);
    try {
      const payload = normalizeReminderLetterTemplate(letterTemplate);
      const res = await api.put('/api/ar/reminder-letter-template', payload);
      setLetterTemplate(normalizeReminderLetterTemplate(res.data?.template || payload));
      setLetterTemplateMeta({
        updated_at: res.data?.updated_at || new Date().toISOString(),
        updated_by: res.data?.updated_by || '',
      });
      toast.success('Template surat peringatan berjaya disimpan.');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal simpan template surat peringatan.');
    } finally {
      setTemplateSaving(false);
    }
  };

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const formatCurrencyValue = (value) => Number(value || 0).toLocaleString('ms-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const applyTemplateTokens = (line, tokens) => {
    const text = String(line || '');
    return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, key) => {
      if (Object.prototype.hasOwnProperty.call(tokens, key)) {
        return String(tokens[key] ?? '');
      }
      return full;
    });
  };

  const templateFlagOn = (value) => ['1', 'true', 'yes', 'ya'].includes(String(value || '').trim().toLowerCase());

  const buildReminderPrintHtml = (payload) => {
    const template = normalizeReminderLetterTemplate(payload?.template || letterTemplate);
    const attributes = template?.attributes || {};
    const forms = Array.isArray(payload?.forms) ? payload.forms : [];
    const students = forms.flatMap((form) => (Array.isArray(form?.students) ? form.students.map((student) => ({ form, student })) : []));
    const generatedAt = payload?.generated_at ? new Date(payload.generated_at) : new Date();
    const generatedLabel = generatedAt.toLocaleString('ms-MY');
    const tarikhSurat = payload?.tarikh_surat || generatedAt.toLocaleDateString('ms-MY');
    const generatedBy = payload?.generated_by || '-';
    const yearLabel = payload?.year || year;
    const grandTotalStudents = Number(payload?.grand_total_students || 0);
    const grandTotalOutstanding = Number(payload?.grand_total_outstanding || 0);
    const rujukanPrefix = String(attributes.rujukan_prefix || 'SR/KEW').trim() || 'SR/KEW';
    const showPreviousYearRow = templateFlagOn(attributes.show_previous_year_row);
    const includeSystemGeneratedFooterNote = templateFlagOn(attributes.include_system_generated_footer_note);
    const generatedDateSegment = `${generatedAt.getFullYear()}${String(generatedAt.getMonth() + 1).padStart(2, '0')}${String(generatedAt.getDate()).padStart(2, '0')}`;

    const lettersHtml = students
      .map(({ form, student }, index) => {
        const noMatriks = String(student?.matric_number || '-').trim() || '-';
        const namaPelajar = String(student?.student_name || '-').trim() || '-';
        const currentYear = Number(student?.current_year || yearLabel || year);
        const currentTingkatan = Number(student?.current_tingkatan || form?.tingkatan || tingkatan || 1);
        const previousYear = Number(student?.previous_year || (currentYear - 1));
        const tingkatanRowsRaw = Array.isArray(student?.tingkatan_rows) ? student.tingkatan_rows : [];
        const normalizedTingkatanRows = tingkatanRowsRaw
          .map((row) => ({
            tingkatan: Number(row?.tingkatan || 0),
            label: String(row?.label || '').trim(),
            is_current: Boolean(row?.is_current),
            total_amount: Number(row?.total_amount || 0),
            paid_amount: Number(row?.paid_amount || 0),
            outstanding: Number(row?.outstanding || 0),
          }))
          .filter((row) => row.tingkatan > 0)
          .sort((a, b) => {
            const aRank = row => ((row.is_current || row.tingkatan === currentTingkatan) ? 0 : 1);
            const rankDiff = aRank(a) - aRank(b);
            if (rankDiff !== 0) return rankDiff;
            return a.tingkatan - b.tingkatan;
          });
        const filteredTingkatanRows = showPreviousYearRow
          ? normalizedTingkatanRows
          : normalizedTingkatanRows.filter((row) => row.is_current || row.tingkatan === currentTingkatan);
        const tingkatanRows = (filteredTingkatanRows.length ? filteredTingkatanRows : normalizedTingkatanRows).slice(0, 8);
        const semasaTertunggak = Number(
          tingkatanRows
            .filter((row) => row.is_current || row.tingkatan === currentTingkatan)
            .reduce((sum, row) => sum + Number(row.outstanding || 0), 0)
            || student?.current_year_outstanding
            || student?.outstanding
            || 0
        );
        const sebelumTertunggak = Number(
          tingkatanRows
            .filter((row) => !(row.is_current || row.tingkatan === currentTingkatan))
            .reduce((sum, row) => sum + Number(row.outstanding || 0), 0)
            || student?.previous_year_outstanding
            || 0
        );
        const jumlahTertunggak = Number(
          student?.total_outstanding
            ?? tingkatanRows.reduce((sum, row) => sum + Number(row.outstanding || 0), 0)
            ?? (semasaTertunggak + sebelumTertunggak)
        );
        const jumlahBayaran = Number(
          student?.total_paid
            ?? tingkatanRows.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0)
            ?? 0
        );
        const rujukanSurat = String(student?.rujukan_surat || `${rujukanPrefix}/${noMatriks}/${generatedDateSegment}`).trim();

        const tokens = {
          no_matriks: noMatriks,
          nama_pelajar: namaPelajar,
          tarikh_surat: tarikhSurat,
          rujukan_surat: rujukanSurat,
          rujukan_prefix: rujukanPrefix,
          tahunsemasa_tertunggak: String(currentYear),
          nilaisemasa_tertunggak: formatCurrencyValue(semasaTertunggak),
          tahunsebelum_tertunggak: String(previousYear),
          nilaistahunsebelum_tertunggak: formatCurrencyValue(sebelumTertunggak),
          nilaistahunebelum_tertunggak: formatCurrencyValue(sebelumTertunggak),
          jumlah_tertunggak: formatCurrencyValue(jumlahTertunggak),
          jumlah_bayaran: formatCurrencyValue(jumlahBayaran),
          tingkatan_semasa: String(currentTingkatan),
          nama_penandatangan: attributes.nama_penandatangan || '',
          jawatan_penandatangan: attributes.jawatan_penandatangan || '',
          nama_maktab: attributes.nama_maktab || '',
        };

        const headerRowsHtml = (template.header.rows || [])
          .map((row) => {
            const rendered = applyTemplateTokens(row, tokens);
            const className = rendered.trim().startsWith('PER:') ? 'meta-row subject-row' : 'meta-row';
            return `<p class="${className}">${escapeHtml(rendered)}</p>`;
          })
          .join('');

        const introRowsHtml = (template.body.intro_rows || [])
          .map((row) => `<p>${escapeHtml(applyTemplateTokens(row, tokens))}</p>`)
          .join('');

        const noteRowsHtml = (template.body.note_rows || [])
          .map((row) => `<p class="note-row">${escapeHtml(applyTemplateTokens(row, tokens))}</p>`)
          .join('');

        const footerRowsHtml = (template.footer.rows || [])
          .map((row) => `<p>${escapeHtml(applyTemplateTokens(row, tokens))}</p>`)
          .join('');

        const butiranTitle = String(attributes.butiran_tunggakan_title || 'Butiran Tunggakan:').trim();
        const jumlahLabel = String(attributes.jumlah_label || 'Jumlah Keseluruhan Tunggakan:').trim();
        const jumlahYuranHeader = String(attributes.jumlah_yuran_header || 'Jumlah Yuran').trim();
        const jumlahBayaranHeader = String(attributes.jumlah_bayaran_header || 'Jumlah Bayaran').trim();
        const jumlahHeader = String(attributes.jumlah_tunggakan_header || 'Jumlah Tunggakan').trim();
        const tableRowsHtml = (tingkatanRows.length ? tingkatanRows : [{
          tingkatan: currentTingkatan,
          label: `Tingkatan ${currentTingkatan} (Semasa)`,
          is_current: true,
          total_amount: Number(student?.outstanding || 0),
          paid_amount: 0,
          outstanding: Number(student?.outstanding || 0),
        }])
          .map((row) => {
            const rowTingkatan = Number(row.tingkatan || 0);
            const tingkatanLabel = row.label
              || ((row.is_current || rowTingkatan === currentTingkatan)
                ? `Tingkatan ${rowTingkatan} (Semasa)`
                : `Tingkatan ${rowTingkatan}`);
            const totalAmount = Number(row.total_amount || 0);
            const paidAmount = Number(row.paid_amount || 0);
            const outstandingAmount = Number(row.outstanding || 0);
            return `
              <tr>
                <td>${escapeHtml(tingkatanLabel)}</td>
                <td class="amount-col">RM ${escapeHtml(formatCurrencyValue(totalAmount))}</td>
                <td class="amount-col">RM ${escapeHtml(formatCurrencyValue(paidAmount))}</td>
                <td class="amount-col">RM ${escapeHtml(formatCurrencyValue(outstandingAmount))}</td>
              </tr>
            `;
          })
          .join('');

        const generatedFooterHtml = includeSystemGeneratedFooterNote
          ? `
            <p>${escapeHtml(attributes.dijana_sistem_label || 'Tarikh dan masa surat ini dijana oleh sistem:')} ${escapeHtml(generatedLabel)}</p>
            <p>${escapeHtml(attributes.dijana_oleh_label || 'Dijana oleh:')} ${escapeHtml(generatedBy)}</p>
          `
          : '';

        return `
          <section class="letter-section ${index < students.length - 1 ? 'with-page-break' : ''}">
            <div class="header-block">
              <h1>${escapeHtml(template.header.title || '')}</h1>
              ${template.header.subtitle ? `<p class="subtitle">${escapeHtml(template.header.subtitle)}</p>` : ''}
              <p class="meta-row small-muted">Tingkatan ${escapeHtml(String(form?.tingkatan || '-'))} • Tahun ${escapeHtml(String(yearLabel))}</p>
              ${headerRowsHtml}
            </div>

            <div class="content-block">
              ${introRowsHtml}
              <p class="section-title">${escapeHtml(butiranTitle)}</p>
              <table>
                <thead>
                  <tr>
                    <th>Tingkatan</th>
                    <th class="amount-col">${escapeHtml(jumlahYuranHeader)}</th>
                    <th class="amount-col">${escapeHtml(jumlahBayaranHeader)}</th>
                    <th class="amount-col">${escapeHtml(jumlahHeader)}</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
              <p class="amount-total"><strong>${escapeHtml(jumlahLabel)} RM ${escapeHtml(formatCurrencyValue(jumlahTertunggak))}</strong></p>
              ${noteRowsHtml}
            </div>

            <div class="footer-block">
              ${footerRowsHtml}
              ${generatedFooterHtml}
            </div>
          </section>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="ms">
      <head>
        <meta charset="UTF-8" />
        <title>Surat Peringatan Tunggakan Yuran</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; }
          .wrapper { padding: 16px; }
          .summary { margin-bottom: 16px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #f8fafc; }
          .summary h2 { margin: 0 0 8px; font-size: 16px; }
          .summary p { margin: 4px 0; font-size: 12px; }
          .letter-section { border: 1px solid #dbeafe; border-radius: 8px; padding: 18px 16px; margin-bottom: 16px; page-break-inside: avoid; }
          .with-page-break { page-break-after: always; }
          .header-block { text-align: left; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
          .header-block h1 { margin: 0; font-size: 18px; letter-spacing: .02em; }
          .subtitle { margin: 6px 0; font-size: 12px; color: #334155; }
          .meta-row { margin: 2px 0; font-size: 11px; color: #334155; line-height: 1.4; }
          .subject-row { font-weight: 700; margin-top: 8px; }
          .small-muted { color: #64748b; }
          .content-block { padding-top: 10px; }
          .content-block p { margin: 4px 0; font-size: 12px; line-height: 1.45; }
          .section-title { margin-top: 10px; font-size: 12px; font-weight: 700; }
          .amount-total { margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; font-size: 11px; }
          th { background: #eff6ff; text-align: left; }
          .amount-col { width: 120px; text-align: right; }
          .note-row { color: #334155; }
          .footer-block { margin-top: 12px; border-top: 1px dashed #cbd5e1; padding-top: 8px; text-align: left; }
          .footer-block p { margin: 3px 0; font-size: 11px; color: #475569; }
          @media print {
            .wrapper { padding: 0; }
            .summary { page-break-after: always; }
            .letter-section { break-inside: avoid; border: none; border-radius: 0; padding: 8px 0; }
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="summary">
            <h2>Pusat Notifikasi AR • Cetakan Surat Peringatan</h2>
            <p>Tahun: <strong>${escapeHtml(String(yearLabel))}</strong></p>
            <p>Jumlah pelajar tertunggak (semua tingkatan dipilih): <strong>${grandTotalStudents.toLocaleString('ms-MY')}</strong> orang</p>
            <p>Jumlah tunggakan keseluruhan: <strong>RM ${grandTotalOutstanding.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
            <p>Dijana pada: <strong>${escapeHtml(generatedLabel)}</strong></p>
          </div>
          ${lettersHtml || '<p>Tiada data untuk dicetak.</p>'}
        </div>
      </body>
      </html>
    `;
  };

  const printReminderLettersAllForms = async () => {
    const selectedForms = [...selectedPrintForms].sort((a, b) => a - b);
    if (!selectedForms.length) {
      toast.error('Sila pilih sekurang-kurangnya satu tingkatan untuk cetakan.');
      return;
    }
    setPrintLoading(true);
    try {
      const res = await api.get('/api/ar/outstanding-reminder-print-data', {
        params: {
          year,
          tingkatan: selectedForms,
          limit_per_tingkatan: Math.max(1, Number(printLimitPerForm || 5000)),
        },
      });
      const payload = res.data || {};
      const totalStudents = Number(payload?.grand_total_students || 0);
      if (!totalStudents) {
        toast.error('Tiada data tunggakan untuk tingkatan dipilih.');
        return;
      }

      if (totalStudents > 5000) {
        const useServerPdf = window.confirm(
          `Data melibatkan ${totalStudents.toLocaleString('ms-MY')} pelajar. Disyorkan guna "Simpan PDF Server (Background)" untuk prestasi lebih stabil. Klik OK untuk guna server-side, Cancel untuk teruskan cetakan pelayar.`
        );
        if (useServerPdf) {
          await queueServerPdfJob();
          return;
        }
      }

      if (totalStudents > 2000) {
        const proceed = window.confirm(
          `Cetakan ini melibatkan ${totalStudents.toLocaleString('ms-MY')} pelajar. Proses mungkin mengambil masa. Teruskan?`
        );
        if (!proceed) return;
      }

      const printableForms = (payload.forms || []).filter((form) => (form?.students || []).length > 0);
      if (!printableForms.length) {
        toast.error('Tiada rekod boleh dicetak dengan had semasa. Naikkan nilai "Maks rekod/tingkatan".');
        return;
      }

      const html = buildReminderPrintHtml(payload);
      const printWindow = window.open('', '_blank', 'width=1200,height=820');
      if (!printWindow) {
        try {
          await api.post('/api/ar/notification-report/log', {
            channel: 'print',
            status: 'failed',
            action_type: 'print_generate',
            year,
            tingkatan: selectedForms,
            total_targets: totalStudents,
            success_count: 0,
            failed_count: totalStudents,
            error: 'Paparan cetakan disekat oleh pelayar (popup blocked)',
            meta: { reason: 'popup_blocked' },
          });
        } catch (_) {
          // best-effort log
        }
        toast.error('Paparan cetakan disekat pelayar. Benarkan pop-up kemudian cuba semula.');
        return;
      }
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 350);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal jana cetakan surat peringatan.');
    } finally {
      setPrintLoading(false);
    }
  };

  const renderTemplateRowsEditor = ({ title, section, field, rows, placeholder }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <button
          type="button"
          onClick={() => updateTemplateRows(section, field, (prev) => [...prev, ''])}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          + Tambah baris
        </button>
      </div>
      {(rows || []).length === 0 && (
        <p className="text-xs text-slate-500">Belum ada baris.</p>
      )}
      {(rows || []).map((row, idx) => (
        <div key={`${section}-${field}-${idx}`} className="flex items-center gap-2">
          <input
            type="text"
            value={row}
            onChange={(e) => updateTemplateRows(section, field, (prev) => prev.map((item, rowIdx) => (rowIdx === idx ? e.target.value : item)))}
            placeholder={placeholder}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-300"
          />
          <button
            type="button"
            onClick={() => updateTemplateRows(section, field, (prev) => prev.filter((_, rowIdx) => rowIdx !== idx))}
            className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100"
          >
            Padam
          </button>
        </div>
      ))}
    </div>
  );

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const list = data?.data ?? [];
  const getJobStatusUi = (jobStatus) => {
    const key = String(jobStatus || '').toLowerCase();
    if (key === 'completed') return { label: 'Selesai', className: 'bg-emerald-100 text-emerald-800' };
    if (key === 'failed') return { label: 'Gagal', className: 'bg-rose-100 text-rose-800' };
    if (key === 'running') return { label: 'Sedang diproses', className: 'bg-amber-100 text-amber-800' };
    return { label: 'Dalam queue', className: 'bg-slate-100 text-slate-700' };
  };
  const canRetryNotificationJob = (job) => {
    const status = String(job?.status || '').toLowerCase();
    const failedCount = Number(job?.failed_student_ids_count || job?.failed_count || 0);
    if (job?.can_retry_failed != null) return Boolean(job.can_retry_failed);
    return failedCount > 0 && ['completed', 'failed'].includes(status);
  };
  const retryableNotificationJobs = recentNotificationJobs.filter((job) => canRetryNotificationJob(job));
  const retryableNotificationCountAll = retryableNotificationJobs.length;
  const retryableNotificationCountEmail = retryableNotificationJobs.filter((job) => String(job?.channel || '').toLowerCase() === 'email').length;
  const retryableNotificationCountPush = retryableNotificationJobs.filter((job) => String(job?.channel || '').toLowerCase() === 'push').length;
  const selectedRetryChannel = String(retryAllNotificationChannel || '').toLowerCase();
  const selectedRetryableNotificationCount = selectedRetryChannel === 'email'
    ? retryableNotificationCountEmail
    : selectedRetryChannel === 'push'
      ? retryableNotificationCountPush
      : retryableNotificationCountAll;
  const notificationReportDeepLink = `/admin/ar-notification-report?tab=report&year=${year}&tingkatan=${tingkatan}&action_type=bulk${selectedRetryChannel ? `&channel=${encodeURIComponent(selectedRetryChannel)}` : ''}`;
  const activeNotificationReportDeepLink = activeNotificationJob?.id
    ? `/admin/ar-notification-report?tab=report&year=${activeNotificationJob.year || year}&tingkatan=${activeNotificationJob.tingkatan || tingkatan}&action_type=bulk&source=queue${activeNotificationJob.channel ? `&channel=${encodeURIComponent(activeNotificationJob.channel)}` : ''}`
    : notificationReportDeepLink;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="ar-outstanding-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-heading flex items-center gap-2">
            <Users className="text-teal-600" size={28} />
            Senarai Tertunggak mengikut Tingkatan
          </h1>
          <p className="text-slate-600 mt-1">Pagination, status notifikasi (merah belum / hijau sudah), E-mel atau Push</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            {[year - 2, year - 1, year, year + 1].filter(y => y >= 2020).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <Link
            to="/admin/ar-dashboard"
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
          >
            Balik ke AR Dashboard
          </Link>
        </div>
      </div>

      {/* Tabs Tingkatan 1–5 */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TINGKATAN_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTingkatan(t); setPage(1); }}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              tingkatan === t
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Tingkatan {t}
          </button>
        ))}
      </div>

      {/* Pusat Notifikasi AR */}
      <Card className="bg-gradient-to-r from-slate-50 to-teal-50/50 border-teal-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center gap-0.5">
              <Mail className="w-5 h-5 text-teal-600" />
              <Bell className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Pusat Notifikasi AR (E-mel, Push & Cetakan Surat)</h3>
              <p className="text-sm text-slate-600 mt-0.5">
                Halaman ini menyatukan peringatan individu/pukal, cetakan surat peringatan mengikut tingkatan, dan template surat yang boleh diubah suai oleh superadmin/admin/bendahari/sub bendahari.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {total > 0 && (
              <button
                type="button"
                onClick={openBulkModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors"
              >
                <Send size={18} /> Hantar Peringatan Pukal (Tingkatan {tingkatan})
              </button>
            )}
            <button
              type="button"
              onClick={printReminderLettersAllForms}
              disabled={printLoading || serverPdfLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              <Printer size={18} /> {printLoading ? 'Menjana Cetakan…' : 'Cetak Surat Semua Tingkatan'}
            </button>
            <button
              type="button"
              onClick={queueServerPdfJob}
              disabled={serverPdfLoading || printLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-900 text-white rounded-lg font-medium hover:bg-indigo-950 transition-colors disabled:opacity-60"
            >
              <Download size={18} /> {serverPdfLoading ? 'Masuk Queue…' : 'Simpan PDF Server (Background)'}
            </button>
            <button
              type="button"
              onClick={openTemplateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors"
            >
              <Settings size={18} /> Edit Template Surat
            </button>
            <Link
              to="/admin/ar-notification-report?tab=history"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
            >
              <FileText size={18} /> Laporan Notifikasi AR
            </Link>
            <Link
              to="/admin/email-templates"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors"
            >
              <Mail size={18} /> Pergi ke E-mel Template
              <ChevronRight size={18} />
            </Link>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-3">
          <p className="text-sm font-medium text-slate-700 mb-2">Tetapan cetakan surat peringatan (mengikut senarai setiap tingkatan)</p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap gap-2">
              {TINGKATAN_TABS.map((formValue) => (
                <label key={`print-form-${formValue}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm">
                  <input
                    type="checkbox"
                    checked={selectedPrintForms.includes(formValue)}
                    onChange={() => togglePrintForm(formValue)}
                    className="rounded border-slate-300"
                  />
                  Tingkatan {formValue}
                </label>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              Maks rekod/tingkatan:
              <input
                type="number"
                min={100}
                max={50000}
                value={printLimitPerForm}
                onChange={(e) => setPrintLimitPerForm(Math.min(50000, Math.max(100, Number(e.target.value) || 5000)))}
                className="w-24 px-2 py-1 border border-slate-200 rounded-md"
              />
            </label>
            <span className="text-xs text-slate-500">
              Untuk dataset besar (cth. &gt;5000), guna butang &quot;Simpan PDF Server (Background)&quot; untuk elak beban browser.
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white/90 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-700">Status job PDF aktif</p>
              {activePrintJob?.id ? (
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getJobStatusUi(activePrintJob.status).className}`}>
                  {getJobStatusUi(activePrintJob.status).label}
                </span>
              ) : (
                <span className="text-xs text-slate-400">Tiada job aktif</span>
              )}
            </div>
            {!activePrintJob?.id ? (
              <p className="text-xs text-slate-500 mt-2">Tekan butang &quot;Simpan PDF Server (Background)&quot; untuk mula janaan.</p>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-600">
                  Job ID: <span className="font-mono text-slate-700">{activePrintJob.id}</span>
                </p>
                <p className="text-xs text-slate-600">
                  Tingkatan: {(activePrintJob.tingkatan || []).map((t) => `T${t}`).join(', ') || '-'} • Tahun {activePrintJob.year || year}
                </p>
                <p className="text-xs text-slate-600">
                  Progress: {Number(activePrintJob.progress_processed || 0).toLocaleString('ms-MY')} / {Number(activePrintJob.progress_total || 0).toLocaleString('ms-MY')} rekod
                </p>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, Number(activePrintJob.progress_percent || 0)))}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">{activePrintJob.message || '-'}</p>
                {activePrintJob.error && (
                  <p className="text-xs text-rose-700">{activePrintJob.error}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {String(activePrintJob.status || '').toLowerCase() === 'completed' && (
                    <button
                      type="button"
                      onClick={() => downloadServerPdf(activePrintJob)}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      <Download size={13} /> Muat turun PDF
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fetchRecentPrintJobs(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    disabled={jobRefreshLoading}
                  >
                    <Clock3 size={13} /> {jobRefreshLoading ? 'Muat semula...' : 'Muat semula status'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white/90 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-slate-700">Sejarah ringkas cetakan PDF</p>
              <button
                type="button"
                onClick={() => fetchRecentPrintJobs(true)}
                className="text-xs text-teal-700 hover:underline"
              >
                Muat semula
              </button>
            </div>
            {recentPrintJobs.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada rekod job PDF server-side.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {recentPrintJobs.map((job) => (
                  <div key={job.id} className="rounded-md border border-slate-200 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{(job.tingkatan || []).map((t) => `T${t}`).join(', ') || '-'} • {job.year || '-'}</p>
                        <p className="text-[11px] text-slate-500">
                          {job.created_by_name || '-'} • {job.created_at ? new Date(job.created_at).toLocaleString('ms-MY') : '-'}
                        </p>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${getJobStatusUi(job.status).className}`}>
                        {getJobStatusUi(job.status).label}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {Number(job.progress_processed || 0).toLocaleString('ms-MY')}/{Number(job.progress_total || 0).toLocaleString('ms-MY')} rekod
                    </p>
                    {String(job.status || '').toLowerCase() === 'completed' && (
                      <button
                        type="button"
                        onClick={() => downloadServerPdf(job)}
                        className="mt-1 text-[11px] text-indigo-700 hover:underline"
                      >
                        Muat turun PDF
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white/90 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-700">Status job notifikasi pukal aktif</p>
              {activeNotificationJob?.id ? (
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getJobStatusUi(activeNotificationJob.status).className}`}>
                  {getJobStatusUi(activeNotificationJob.status).label}
                </span>
              ) : (
                <span className="text-xs text-slate-400">Tiada job aktif</span>
              )}
            </div>
            {!activeNotificationJob?.id ? (
              <p className="text-xs text-slate-500 mt-2">
                Buka modal &quot;Hantar Peringatan Pukal&quot; dan pilih &quot;Queue Background&quot; untuk guna mod ini.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-600">
                  Job ID: <span className="font-mono text-slate-700">{activeNotificationJob.id}</span>
                </p>
                <p className="text-xs text-slate-600">
                  Saluran: {(activeNotificationJob.channel || '-').toUpperCase()} • Tingkatan {activeNotificationJob.tingkatan || '-'} • Tahun {activeNotificationJob.year || year}
                </p>
                <p className="text-xs text-slate-600">
                  Progress: {Number(activeNotificationJob.progress_processed || 0).toLocaleString('ms-MY')} / {Number(activeNotificationJob.progress_total || 0).toLocaleString('ms-MY')} penerima
                </p>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-teal-500 transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, Number(activeNotificationJob.progress_percent || 0)))}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Berjaya: {Number(activeNotificationJob.success_count || 0).toLocaleString('ms-MY')} • Gagal: {Number(activeNotificationJob.failed_count || 0).toLocaleString('ms-MY')}
                </p>
                <p className="text-xs text-slate-500">{activeNotificationJob.message || '-'}</p>
                {activeNotificationJob.error && (
                  <p className="text-xs text-rose-700">{activeNotificationJob.error}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {canRetryNotificationJob(activeNotificationJob) && (
                    <button
                      type="button"
                      onClick={() => retryFailedNotificationJob(activeNotificationJob)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      disabled={retryNotificationJobLoadingId === activeNotificationJob.id}
                    >
                      {retryNotificationJobLoadingId === activeNotificationJob.id ? 'Queue retry...' : 'Retry Gagal'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fetchRecentNotificationJobs(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    disabled={notificationJobRefreshLoading}
                  >
                    <Clock3 size={13} /> {notificationJobRefreshLoading ? 'Muat semula...' : 'Muat semula status'}
                  </button>
                  <Link to={activeNotificationReportDeepLink} className="text-xs text-teal-700 hover:underline">
                    Lihat dalam laporan penuh
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white/90 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-slate-700">Sejarah ringkas job notifikasi</p>
              <div className="flex items-center gap-3">
                <select
                  value={retryAllNotificationChannel}
                  onChange={(e) => setRetryAllNotificationChannel(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                  title="Filter saluran untuk Retry Semua Gagal"
                >
                  <option value="">Semua saluran</option>
                  <option value="email">E-mel</option>
                  <option value="push">Push</option>
                </select>
                <span
                  title={`Kiraan berdasarkan ${JOB_HISTORY_PREVIEW_LIMIT} job terkini dalam sejarah ringkas.`}
                  className="text-[11px] text-slate-500 cursor-help"
                >
                  Retryable (preview): Semua {retryableNotificationCountAll} • E-mel {retryableNotificationCountEmail} • Push {retryableNotificationCountPush}
                </span>
                <Link
                  to={notificationReportDeepLink}
                  className="text-[11px] text-teal-700 hover:underline whitespace-nowrap"
                >
                  Lihat semua (laporan penuh)
                </Link>
                <button
                  type="button"
                  onClick={retryAllFailedNotificationJobs}
                  disabled={retryAllNotificationJobsLoading || selectedRetryableNotificationCount <= 0}
                  className="text-xs text-amber-700 hover:underline disabled:opacity-50"
                >
                  {retryAllNotificationJobsLoading ? 'Queue retry semua...' : `Retry Semua Gagal (${selectedRetryableNotificationCount})`}
                </button>
                <button
                  type="button"
                  onClick={() => fetchRecentNotificationJobs(true)}
                  className="text-xs text-teal-700 hover:underline"
                >
                  Muat semula
                </button>
              </div>
            </div>
            {recentNotificationJobs.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada rekod job notifikasi background.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {recentNotificationJobs.map((job) => (
                  <div key={job.id} className="rounded-md border border-slate-200 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-slate-700">
                          {(job.channel || '-').toUpperCase()} • Tingkatan {job.tingkatan || '-'} • {job.year || '-'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {job.created_by_name || '-'} • {job.created_at ? new Date(job.created_at).toLocaleString('ms-MY') : '-'}
                        </p>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${getJobStatusUi(job.status).className}`}>
                        {getJobStatusUi(job.status).label}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {Number(job.success_count || 0).toLocaleString('ms-MY')} berjaya • {Number(job.failed_count || 0).toLocaleString('ms-MY')} gagal
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {Number(job.progress_processed || 0).toLocaleString('ms-MY')}/{Number(job.progress_total || 0).toLocaleString('ms-MY')} diproses
                    </p>
                    {canRetryNotificationJob(job) && (
                      <button
                        type="button"
                        onClick={() => retryFailedNotificationJob(job)}
                        disabled={retryNotificationJobLoadingId === job.id}
                        className="mt-1 text-[11px] text-amber-700 hover:underline disabled:opacity-50"
                      >
                        {retryNotificationJobLoadingId === job.id ? 'Queue retry...' : 'Retry penerima gagal'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : list.length === 0 ? (
          <p className="text-slate-500 text-center py-12">
            Tiada pelajar tertunggak untuk Tingkatan {tingkatan} (tahun {year}).
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-3 font-medium text-slate-600">Pelajar</th>
                    <th className="text-left py-3 px-3 font-medium text-slate-600">No Matrik</th>
                    <th className="text-right py-3 px-3 font-medium text-slate-600">Tertunggak (RM)</th>
                    <th className="text-left py-3 px-3 font-medium text-slate-600">Risiko</th>
                    <th className="text-left py-3 px-3 font-medium text-slate-600">Status Notifikasi</th>
                    <th className="text-left py-3 px-3 font-medium text-slate-600">Jenis / Tarikh</th>
                    <th className="text-center py-3 px-3 font-medium text-slate-600">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => {
                    const hasReminder = !!row.last_reminder;
                    return (
                      <tr key={row.student_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-3">{row.student_name || '-'}</td>
                        <td className="py-2 px-3">{row.matric_number || '-'}</td>
                        <td className="py-2 px-3 text-right font-medium text-amber-700">
                          {(row.outstanding || 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-3">
                          {row.risk_score ? (
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              row.risk_score === 'high' ? 'bg-red-100 text-red-800' :
                              row.risk_score === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {row.risk_score === 'high' ? 'Tinggi' : row.risk_score === 'medium' ? 'Sederhana' : 'Rendah'}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="py-2 px-3">
                          {hasReminder ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 size={16} />
                              Sudah hantar
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-700">
                              <AlertCircle size={16} />
                              Belum dihantar
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {hasReminder ? (
                            <>
                              {row.last_reminder.channel === 'email' ? (
                                <span className="inline-flex items-center gap-1">
                                  <Mail size={14} /> E-mel
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <Bell size={14} /> Push
                                </span>
                              )}
                              {row.last_reminder.sent_at && (
                                <span className="ml-1 text-xs">
                                  {new Date(row.last_reminder.sent_at).toLocaleDateString('ms-MY')}
                                </span>
                              )}
                            </>
                          ) : '-'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => openReminderChoice(row)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100"
                          >
                            <Send size={14} /> Hantar Peringatan
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                <p className="text-sm text-slate-600">
                  {total} pelajar tertunggak • Halaman {page} / {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-2 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="px-2 text-sm font-medium">{page}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="p-2 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Modal Hantar Peringatan (sama seperti AR Dashboard) */}
      {reminderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setReminderModal(null); setReminderChannel(null); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Hantar Peringatan</h3>
              <button type="button" onClick={() => { setReminderModal(null); setReminderChannel(null); }} className="p-1 hover:bg-slate-100 rounded">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Untuk <strong>{reminderModal.studentName}</strong>. Pilih saluran, kemudian pilih template.
            </p>
            {reminderChannel == null ? (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => setReminderChannel('email')} className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-left">
                  <Mail className="w-5 h-5 text-teal-600" />
                  <span>E-mel sahaja</span>
                </button>
                <button type="button" onClick={() => setReminderChannel('push')} className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-left">
                  <Bell className="w-5 h-5 text-teal-600" />
                  <span>Push notifikasi sahaja</span>
                </button>
              </div>
            ) : reminderChannel === 'email' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Template e-mel</label>
                  <select value={selectedEmailTemplateKey} onChange={(e) => setSelectedEmailTemplateKey(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {emailTemplateKeys.length ? emailTemplateKeys.map((t) => (
                      <option key={t.key} value={t.key}>{t.name || t.key}</option>
                    )) : (
                      <option value="fee_reminder">Peringatan Yuran Tertunggak (fee_reminder)</option>
                    )}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setReminderChannel(null)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">Kembali</button>
                  <button type="button" disabled={reminderSending} onClick={() => sendReminder(reminderModal.studentId, 'email', selectedEmailTemplateKey, null)} className="flex-1 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700 disabled:opacity-50">
                    {reminderSending ? 'Menghantar…' : 'Hantar e-mel'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Template push</label>
                  <select value={selectedPushTemplateKey} onChange={(e) => setSelectedPushTemplateKey(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {(pushTemplateOptions.length ? pushTemplateOptions : [{ key: 'reminder_full', name: 'Peringatan penuh' }, { key: 'reminder_short', name: 'Peringatan ringkas' }, { key: 'reminder_urgent', name: 'Peringatan mendesak' }]).map((t) => (
                      <option key={t.key} value={t.key}>{t.name || t.key}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setReminderChannel(null)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">Kembali</button>
                  <button type="button" disabled={reminderSending} onClick={() => sendReminder(reminderModal.studentId, 'push', null, selectedPushTemplateKey)} className="flex-1 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700 disabled:opacity-50">
                    {reminderSending ? 'Menghantar…' : 'Hantar push'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Hantar Peringatan Pukal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !bulkSending && !bulkJobQueueLoading && setBulkModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">Hantar Peringatan Pukal – Tingkatan {tingkatan}</h3>
              <button type="button" onClick={() => !bulkSending && !bulkJobQueueLoading && setBulkModalOpen(false)} className="p-1 hover:bg-slate-100 rounded" disabled={bulkSending || bulkJobQueueLoading}>
                <X size={18} />
              </button>
            </div>

            {/* Ringkasan */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-slate-800 mb-1">Ringkasan</p>
              <p className="text-sm text-slate-600">
                <strong>{total} orang</strong> pelajar tertunggak · Tingkatan {tingkatan} · Tahun {year}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Setelah anda klik &quot;Setuju & Hantar&quot;, sistem akan menghantar peringatan kepada semua {total} orang ibu bapa/pelajar mengikut pilihan di bawah. Status dalam senarai akan dikemas kini (hijau = sudah hantar).
              </p>
            </div>

            {bulkChannel == null ? (
              <div className="flex flex-col gap-2 mb-4">
                <p className="text-sm font-medium text-slate-700">Pilih saluran (satu sahaja)</p>
                <p className="text-xs text-slate-500 mb-1">E-mel = hantar ke inbox ibu bapa. Push = notifikasi dalam app + FCM.</p>
                <button type="button" onClick={() => setBulkChannel('email')} className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-left">
                  <Mail className="w-5 h-5 text-teal-600" />
                  <span>E-mel sahaja</span>
                </button>
                <button type="button" onClick={() => setBulkChannel('push')} className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-left">
                  <Bell className="w-5 h-5 text-teal-600" />
                  <span>Push notifikasi sahaja</span>
                </button>
              </div>
            ) : (
              <>
                <div className="mb-3">
                  <button type="button" onClick={() => setBulkChannel(null)} className="text-sm text-teal-600 hover:underline">← Tukar saluran</button>
                </div>
                {bulkChannel === 'email' ? (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Template e-mel</label>
                    <p className="text-xs text-slate-500 mb-1">Kandungan ikut template di halaman E-mel Template (mengikut tingkatan pelajar).</p>
                    <select value={bulkEmailTemplateKey} onChange={(e) => setBulkEmailTemplateKey(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                      {emailTemplateKeys.length ? emailTemplateKeys.map((t) => (
                        <option key={t.key} value={t.key}>{t.name || t.key}</option>
                      )) : (
                        <option value="fee_reminder">Peringatan Yuran Tertunggak (fee_reminder)</option>
                      )}
                    </select>
                  </div>
                ) : (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Template push</label>
                    <p className="text-xs text-slate-500 mb-1">Tajuk dan mesej notifikasi dalam app.</p>
                    <select value={bulkPushTemplateKey} onChange={(e) => setBulkPushTemplateKey(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                      {(pushTemplateOptions.length ? pushTemplateOptions : [{ key: 'reminder_full', name: 'Peringatan penuh' }, { key: 'reminder_short', name: 'Peringatan ringkas' }, { key: 'reminder_urgent', name: 'Peringatan mendesak' }]).map((t) => (
                        <option key={t.key} value={t.key}>{t.name || t.key}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkBatch20}
                      onChange={(e) => setBulkBatch20(e.target.checked)}
                      className="rounded border-slate-300 mt-0.5"
                    />
                    <span className="text-sm text-slate-800">
                      <strong>Hantar dalam kelompok 20 orang</strong> (disyorkan)
                    </span>
                  </label>
                  <p className="text-xs text-slate-600 mt-2 ml-6">
                    Jika dicentang: sistem hantar batch 20 orang, jeda 1 saat, kemudian batch seterusnya. Contoh: 100 orang = 5 kelompok (20+20+20+20+20). Kurangkan beban pelayan.
                  </p>
                  <p className="text-xs text-slate-500 mt-1 ml-6">
                    Jika tidak dicentang: semua {total} orang dihantar berturut-turut tanpa jeda.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => !bulkSending && !bulkJobQueueLoading && setBulkModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm" disabled={bulkSending || bulkJobQueueLoading}>
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={bulkSending || bulkJobQueueLoading}
                    onClick={queueBulkReminderBackground}
                    className="px-4 py-2 rounded-lg bg-indigo-900 text-white text-sm font-medium hover:bg-indigo-950 disabled:opacity-50"
                  >
                    {bulkJobQueueLoading ? 'Masuk queue…' : 'Queue Background'}
                  </button>
                  <button
                    type="button"
                    disabled={bulkSending || bulkJobQueueLoading}
                    onClick={sendBulkReminder}
                    className="flex-1 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                  >
                    {bulkSending ? 'Menghantar…' : 'Setuju & Hantar'}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">Gunakan &quot;Queue Background&quot; untuk operasi besar supaya UI kekal lancar sambil progress dipantau secara live.</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Edit Template Surat Peringatan */}
      {templateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !templateSaving && setTemplateModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-violet-600" />
                Template Surat Peringatan Tunggakan Yuran
              </h3>
              <button
                type="button"
                onClick={() => !templateSaving && setTemplateModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded"
                disabled={templateSaving}
              >
                <X size={18} />
              </button>
            </div>

            {letterTemplateMeta.updated_at && (
              <p className="text-xs text-slate-500 mb-3">
                Dikemas kini: {new Date(letterTemplateMeta.updated_at).toLocaleString('ms-MY')}
                {letterTemplateMeta.updated_by ? ` oleh ${letterTemplateMeta.updated_by}` : ''}
              </p>
            )}

            {templateLoading ? (
              <div className="py-12 flex items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                  <p className="text-sm font-medium text-indigo-800 mb-1">Placeholder sistem tersedia</p>
                  <p className="text-xs text-indigo-700 leading-relaxed">
                    Gunakan dalam mana-mana baris template: <code>{'{rujukan_surat}'}</code>, <code>{'{tarikh_surat}'}</code>, <code>{'{nama_pelajar}'}</code>, <code>{'{no_matriks}'}</code>, <code>{'{tingkatan_semasa}'}</code>, <code>{'{tahunsemasa_tertunggak}'}</code>, <code>{'{nilaisemasa_tertunggak}'}</code>, <code>{'{tahunsebelum_tertunggak}'}</code>, <code>{'{nilaistahunsebelum_tertunggak}'}</code>, <code>{'{jumlah_tertunggak}'}</code>, <code>{'{jumlah_bayaran}'}</code>, <code>{'{nama_penandatangan}'}</code>, <code>{'{jawatan_penandatangan}'}</code>, <code>{'{nama_maktab}'}</code>.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-800">Header Surat</h4>
                  <input
                    type="text"
                    value={letterTemplate?.header?.title || ''}
                    onChange={(e) => updateTemplateField('header', 'title', e.target.value)}
                    placeholder="Tajuk surat"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={letterTemplate?.header?.subtitle || ''}
                    onChange={(e) => updateTemplateField('header', 'subtitle', e.target.value)}
                    placeholder="Subtajuk"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  {renderTemplateRowsEditor({
                    title: 'Baris header surat (ikut susunan)',
                    section: 'header',
                    field: 'rows',
                    rows: letterTemplate?.header?.rows || [],
                    placeholder: 'Contoh: RUJUKAN : {rujukan_prefix}/{no_matriks}/{tarikh_surat}',
                  })}
                </div>

                <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-800">Kandungan Surat</h4>
                  {renderTemplateRowsEditor({
                    title: 'Perenggan pengenalan',
                    section: 'body',
                    field: 'intro_rows',
                    rows: letterTemplate?.body?.intro_rows || [],
                    placeholder: 'Ayat pengenalan surat (boleh guna placeholder)',
                  })}
                  {renderTemplateRowsEditor({
                    title: 'Perenggan penutup',
                    section: 'body',
                    field: 'note_rows',
                    rows: letterTemplate?.body?.note_rows || [],
                    placeholder: 'Ayat penutup surat',
                  })}
                  <p className="text-xs text-slate-500">
                    Jadual <strong>Butiran Tunggakan</strong> dipaparkan automatik mengikut tingkatan semasa + semua tingkatan terdahulu pelajar (termasuk jumlah yuran, jumlah bayaran dan baki semasa).
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-800">Footer Surat</h4>
                  {renderTemplateRowsEditor({
                    title: 'Baris footer',
                    section: 'footer',
                    field: 'rows',
                    rows: letterTemplate?.footer?.rows || [],
                    placeholder: 'Contoh: “BERKHIDMAT UNTUK PENDIDIKAN”',
                  })}
                </div>

                <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-800">Atribut Sistem</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Nama Penandatangan</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.nama_penandatangan || ''}
                        onChange={(e) => updateTemplateField('attributes', 'nama_penandatangan', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Jawatan Penandatangan</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.jawatan_penandatangan || ''}
                        onChange={(e) => updateTemplateField('attributes', 'jawatan_penandatangan', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Nama Maktab</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.nama_maktab || ''}
                        onChange={(e) => updateTemplateField('attributes', 'nama_maktab', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Prefix Rujukan</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.rujukan_prefix || ''}
                        onChange={(e) => updateTemplateField('attributes', 'rujukan_prefix', e.target.value)}
                        placeholder="Contoh: SR/KEW"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Label Butiran Tunggakan</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.butiran_tunggakan_title || ''}
                        onChange={(e) => updateTemplateField('attributes', 'butiran_tunggakan_title', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Label Jumlah Keseluruhan</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.jumlah_label || ''}
                        onChange={(e) => updateTemplateField('attributes', 'jumlah_label', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Header Kolum Jumlah Yuran</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.jumlah_yuran_header || ''}
                        onChange={(e) => updateTemplateField('attributes', 'jumlah_yuran_header', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Header Kolum Jumlah Bayaran</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.jumlah_bayaran_header || ''}
                        onChange={(e) => updateTemplateField('attributes', 'jumlah_bayaran_header', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Header Kolum Baki Tunggakan</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.jumlah_tunggakan_header || ''}
                        onChange={(e) => updateTemplateField('attributes', 'jumlah_tunggakan_header', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Label Tahun Semasa</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.tahun_semasa_label || ''}
                        onChange={(e) => updateTemplateField('attributes', 'tahun_semasa_label', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Label Tahun Sebelum</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.tahun_sebelum_label || ''}
                        onChange={(e) => updateTemplateField('attributes', 'tahun_sebelum_label', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Label Footer Tarikh/Masa</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.dijana_sistem_label || ''}
                        onChange={(e) => updateTemplateField('attributes', 'dijana_sistem_label', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Label Footer Dijana Oleh</label>
                      <input
                        type="text"
                        value={letterTemplate?.attributes?.dijana_oleh_label || ''}
                        onChange={(e) => updateTemplateField('attributes', 'dijana_oleh_label', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={templateFlagOn(letterTemplate?.attributes?.show_previous_year_row)}
                        onChange={(e) => updateTemplateField('attributes', 'show_previous_year_row', e.target.checked ? '1' : '0')}
                        className="mt-0.5 rounded border-slate-300"
                      />
                      <span>Papar semua tingkatan terdahulu dalam jadual</span>
                    </label>
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={templateFlagOn(letterTemplate?.attributes?.include_system_generated_footer_note)}
                        onChange={(e) => updateTemplateField('attributes', 'include_system_generated_footer_note', e.target.checked ? '1' : '0')}
                        className="mt-0.5 rounded border-slate-300"
                      />
                      <span>Papar nota tarikh/masa dijana sistem di footer</span>
                    </label>
                  </div>
                </div>

                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                  <p className="text-sm font-medium text-indigo-800 mb-1">Cadangan mesra pengguna</p>
                  <ul className="text-xs text-indigo-700 list-disc list-inside space-y-1">
                    <li>Kekalkan format surat rasmi dalam baris header: RUJUKAN, TARIKH, Kepada, dan PER.</li>
                    <li>Biarkan placeholder utama dalam baris template supaya data pelajar/tunggakan dipadankan automatik.</li>
                    <li>Untuk >2000 rekod, utamakan janaan PDF server-side (background queue) supaya lebih stabil.</li>
                  </ul>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={fetchReminderLetterTemplate}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"
                disabled={templateLoading || templateSaving}
              >
                Muat Semula Template
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTemplateModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm"
                  disabled={templateSaving}
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={saveReminderLetterTemplate}
                  className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                  disabled={templateSaving || templateLoading}
                >
                  {templateSaving ? 'Menyimpan…' : 'Simpan Template Surat'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AROutstandingPage;
