import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Settings, RefreshCw, Info, CheckCircle, Save, ImagePlus, Plus, Trash2, Eye, X } from 'lucide-react';
import api from '../../../services/api';
import { HelpManualLink } from '../../../components/common/HelpManualLink';
import {
  DEFAULT_INVOICE_TEMPLATE,
  normalizeInvoiceTemplate,
  resolveInvoiceTemplateAssetUrl,
} from '../../../utils/invoiceTemplate';
import {
  DEFAULT_AGM_REPORT_TEMPLATE,
  normalizeAgmReportTemplate,
  resolveAgmReportTemplateAssetUrl,
} from '../../../utils/agmReportTemplate';

const Button = ({ children, variant = 'primary', loading, disabled, className = '', ...props }) => {
  const baseClasses = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700',
    outline: 'border border-slate-300 text-slate-700 hover:bg-slate-50',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  };
  return (
    <button className={`${baseClasses} ${variants[variant] || variants.primary} ${className}`} disabled={disabled || loading} {...props}>
      {loading ? <span className="animate-spin">⏳</span> : null}
      {children}
    </button>
  );
};

const YuranSettingsPage = () => {
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingInvoiceTemplate, setSavingInvoiceTemplate] = useState(false);
  const [savingAgmTemplate, setSavingAgmTemplate] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState('');
  const [previewType, setPreviewType] = useState(null);

  const [policy, setPolicy] = useState({ description: '', max_payments: 2, deadline_month: 9 });
  const [selectedMaxPayments, setSelectedMaxPayments] = useState(2);

  const [invoiceTemplate, setInvoiceTemplate] = useState(DEFAULT_INVOICE_TEMPLATE);
  const [savedInvoiceTemplate, setSavedInvoiceTemplate] = useState(DEFAULT_INVOICE_TEMPLATE);
  const [invoiceTemplateMeta, setInvoiceTemplateMeta] = useState({ updated_at: null, updated_by: '' });

  const [agmTemplate, setAgmTemplate] = useState(DEFAULT_AGM_REPORT_TEMPLATE);
  const [savedAgmTemplate, setSavedAgmTemplate] = useState(DEFAULT_AGM_REPORT_TEMPLATE);
  const [agmTemplateMeta, setAgmTemplateMeta] = useState({ updated_at: null, updated_by: '' });

  const hasPolicyChanges = selectedMaxPayments !== (policy.max_payments ?? 2);
  const hasInvoiceTemplateChanges = useMemo(() => {
    const current = JSON.stringify(normalizeInvoiceTemplate(invoiceTemplate));
    const saved = JSON.stringify(normalizeInvoiceTemplate(savedInvoiceTemplate));
    return current !== saved;
  }, [invoiceTemplate, savedInvoiceTemplate]);
  const hasAgmTemplateChanges = useMemo(() => {
    const current = JSON.stringify(normalizeAgmReportTemplate(agmTemplate));
    const saved = JSON.stringify(normalizeAgmReportTemplate(savedAgmTemplate));
    return current !== saved;
  }, [agmTemplate, savedAgmTemplate]);

  const fetchPolicy = async () => {
    try {
      const res = await api.get('/api/yuran/settings/payment-policy');
      setPolicy(res.data);
      setSelectedMaxPayments(res.data.max_payments ?? 2);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuatkan polisi bayaran');
    }
  };

  const fetchInvoiceTemplate = async () => {
    try {
      const res = await api.get('/api/yuran/settings/invoice-template');
      const normalized = normalizeInvoiceTemplate(res.data?.template);
      setInvoiceTemplate(normalized);
      setSavedInvoiceTemplate(normalized);
      setInvoiceTemplateMeta({
        updated_at: res.data?.updated_at || null,
        updated_by: res.data?.updated_by || '',
      });
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuatkan template invois');
      const fallback = normalizeInvoiceTemplate(DEFAULT_INVOICE_TEMPLATE);
      setInvoiceTemplate(fallback);
      setSavedInvoiceTemplate(fallback);
      setInvoiceTemplateMeta({ updated_at: null, updated_by: '' });
    }
  };

  const fetchAgmTemplate = async () => {
    try {
      const res = await api.get('/api/yuran/settings/agm-report-template');
      const normalized = normalizeAgmReportTemplate(res.data?.template);
      setAgmTemplate(normalized);
      setSavedAgmTemplate(normalized);
      setAgmTemplateMeta({
        updated_at: res.data?.updated_at || null,
        updated_by: res.data?.updated_by || '',
      });
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuatkan template laporan AGM');
      const fallback = normalizeAgmReportTemplate(DEFAULT_AGM_REPORT_TEMPLATE);
      setAgmTemplate(fallback);
      setSavedAgmTemplate(fallback);
      setAgmTemplateMeta({ updated_at: null, updated_by: '' });
    }
  };

  const fetchAllSettings = async () => {
    setLoading(true);
    await Promise.all([fetchPolicy(), fetchInvoiceTemplate(), fetchAgmTemplate()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAllSettings();
  }, []);

  const uploadTemplateImage = async (file, onSuccess, targetKey) => {
    if (!file) return;
    try {
      setUploadingTarget(targetKey);
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/upload/editor-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploadedUrl = String(res.data?.url || '').trim();
      if (!uploadedUrl) throw new Error('URL imej tidak diterima');
      onSuccess(uploadedUrl);
      toast.success('Imej berjaya dimuat naik');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Gagal memuat naik imej');
    } finally {
      setUploadingTarget('');
    }
  };

  // ==================== INVOICE TEMPLATE HELPERS ====================
  const updateInvoiceHeaderField = (field, value) => {
    setInvoiceTemplate((prev) => ({
      ...prev,
      header: {
        ...prev.header,
        [field]: value,
      },
    }));
  };

  const updateInvoiceBoxField = (boxKey, field, value) => {
    setInvoiceTemplate((prev) => ({
      ...prev,
      footer: {
        ...prev.footer,
        [boxKey]: {
          ...(prev.footer?.[boxKey] || {}),
          [field]: value,
        },
      },
    }));
  };

  const updateInvoiceRows = (path, updater) => {
    setInvoiceTemplate((prev) => {
      const next = normalizeInvoiceTemplate(prev);
      if (path === 'header.rows') next.header.rows = updater([...(next.header.rows || [])]);
      if (path === 'footer.rows') next.footer.rows = updater([...(next.footer.rows || [])]);
      if (path === 'footer.left_box.rows') next.footer.left_box.rows = updater([...(next.footer.left_box.rows || [])]);
      if (path === 'footer.right_box.rows') next.footer.right_box.rows = updater([...(next.footer.right_box.rows || [])]);
      return next;
    });
  };

  const updateInvoiceUploadRows = (boxKey, updater) => {
    setInvoiceTemplate((prev) => {
      const next = normalizeInvoiceTemplate(prev);
      next.footer[boxKey].upload_rows = updater([...(next.footer?.[boxKey]?.upload_rows || [])]);
      return next;
    });
  };

  // ==================== AGM TEMPLATE HELPERS ====================
  const updateAgmHeaderField = (field, value) => {
    setAgmTemplate((prev) => ({
      ...prev,
      header: {
        ...prev.header,
        [field]: value,
      },
    }));
  };

  const updateAgmRows = (path, updater) => {
    setAgmTemplate((prev) => {
      const next = normalizeAgmReportTemplate(prev);
      if (path === 'header.rows') next.header.rows = updater([...(next.header.rows || [])]);
      if (path === 'footer.rows') next.footer.rows = updater([...(next.footer.rows || [])]);
      return next;
    });
  };

  const updateAgmBoxField = (sideKey, index, field, value) => {
    setAgmTemplate((prev) => {
      const next = normalizeAgmReportTemplate(prev);
      next.footer[sideKey][index] = {
        ...(next.footer?.[sideKey]?.[index] || {}),
        [field]: value,
      };
      return next;
    });
  };

  const updateAgmBoxRows = (sideKey, index, updater) => {
    setAgmTemplate((prev) => {
      const next = normalizeAgmReportTemplate(prev);
      next.footer[sideKey][index].rows = updater([...(next.footer?.[sideKey]?.[index]?.rows || [])]);
      return next;
    });
  };

  const updateAgmBoxUploadRows = (sideKey, index, updater) => {
    setAgmTemplate((prev) => {
      const next = normalizeAgmReportTemplate(prev);
      next.footer[sideKey][index].upload_rows = updater([...(next.footer?.[sideKey]?.[index]?.upload_rows || [])]);
      return next;
    });
  };

  // ==================== SAVE / RESET ====================
  const saveInvoiceTemplate = async () => {
    setSavingInvoiceTemplate(true);
    try {
      const payload = normalizeInvoiceTemplate(invoiceTemplate);
      const res = await api.put('/api/yuran/settings/invoice-template', payload);
      const normalized = normalizeInvoiceTemplate(res.data?.template || payload);
      setInvoiceTemplate(normalized);
      setSavedInvoiceTemplate(normalized);
      setInvoiceTemplateMeta({
        updated_at: res.data?.updated_at || new Date().toISOString(),
        updated_by: res.data?.updated_by || '',
      });
      toast.success('Template invois berjaya disimpan');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Gagal menyimpan template invois');
    } finally {
      setSavingInvoiceTemplate(false);
    }
  };

  const saveAgmTemplate = async () => {
    setSavingAgmTemplate(true);
    try {
      const payload = normalizeAgmReportTemplate(agmTemplate);
      const res = await api.put('/api/yuran/settings/agm-report-template', payload);
      const normalized = normalizeAgmReportTemplate(res.data?.template || payload);
      setAgmTemplate(normalized);
      setSavedAgmTemplate(normalized);
      setAgmTemplateMeta({
        updated_at: res.data?.updated_at || new Date().toISOString(),
        updated_by: res.data?.updated_by || '',
      });
      toast.success('Template laporan AGM berjaya disimpan');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Gagal menyimpan template laporan AGM');
    } finally {
      setSavingAgmTemplate(false);
    }
  };

  const resetInvoiceTemplate = () => {
    setInvoiceTemplate(normalizeInvoiceTemplate(savedInvoiceTemplate));
  };

  const resetAgmTemplate = () => {
    setAgmTemplate(normalizeAgmReportTemplate(savedAgmTemplate));
  };

  const handleSaveMaxPayments = async () => {
    setSavingPolicy(true);
    try {
      await api.put('/api/yuran/settings/payment-policy', { max_payments: selectedMaxPayments });
      toast.success('Tetapan bilangan ansuran berjaya disimpan');
      setPolicy((prev) => ({ ...prev, max_payments: selectedMaxPayments }));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan tetapan');
    } finally {
      setSavingPolicy(false);
    }
  };

  // ==================== RENDER HELPERS ====================
  const renderRowsEditor = ({
    title,
    rows,
    placeholder,
    onAdd,
    onRemove,
    onChange,
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus size={13} />
          Tambah baris
        </button>
      </div>
      {(rows || []).length === 0 && (
        <p className="text-xs text-slate-500">Belum ada baris. Klik "Tambah baris".</p>
      )}
      {(rows || []).map((row, idx) => (
        <div key={`${title}-${idx}`} className="flex items-center gap-2">
          <input
            type="text"
            value={row}
            onChange={(event) => onChange(idx, event.target.value)}
            placeholder={placeholder}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-300"
          />
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100"
            title="Padam baris"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );

  const renderImageUploader = ({
    label,
    imageUrl,
    targetKey,
    resolver = resolveInvoiceTemplateAssetUrl,
    onChangeUrl,
    onUpload,
  }) => {
    const resolvedUrl = resolver(imageUrl);
    const isUploading = uploadingTarget === targetKey;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <div className="h-24 w-full overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
          {resolvedUrl ? (
            <img src={resolvedUrl} alt={label} className="h-full w-full object-contain" />
          ) : (
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <ImagePlus size={14} />
              Tiada imej
            </div>
          )}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
          {isUploading ? <span className="animate-spin">⏳</span> : <ImagePlus size={14} />}
          {isUploading ? 'Memuat naik...' : 'Muat naik imej'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = '';
            }}
          />
        </label>
        <input
          type="text"
          value={imageUrl || ''}
          onChange={(event) => onChangeUrl(event.target.value)}
          placeholder="Atau tampal URL imej"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-300"
        />
      </div>
    );
  };

  const renderUploadRowsEditor = ({
    title,
    rows,
    resolver = resolveInvoiceTemplateAssetUrl,
    baseTargetKey,
    onAdd,
    onRemove,
    onFieldChange,
    onUpload,
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus size={13} />
          Tambah row upload
        </button>
      </div>
      {(rows || []).length === 0 && (
        <p className="text-xs text-slate-500">Belum ada row upload.</p>
      )}
      {(rows || []).map((row, idx) => {
        const targetKey = `${baseTargetKey}-upload-row-${idx}`;
        const isUploading = uploadingTarget === targetKey;
        const resolvedUrl = resolver(row?.image_url);
        return (
          <div key={`${baseTargetKey}-${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="h-16 overflow-hidden rounded-md border border-dashed border-slate-300 bg-white flex items-center justify-center">
              {resolvedUrl ? (
                <img src={resolvedUrl} alt={`Row Upload ${idx + 1}`} className="h-full w-full object-contain" />
              ) : (
                <p className="text-[11px] text-slate-400">Tiada imej</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100">
                {isUploading ? <span className="animate-spin">⏳</span> : <ImagePlus size={12} />}
                {isUploading ? 'Memuat naik...' : 'Upload'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onUpload(idx, file, targetKey);
                    event.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100"
              >
                <Trash2 size={12} />
                Padam
              </button>
            </div>
            <input
              type="text"
              value={row?.image_url || ''}
              onChange={(event) => onFieldChange(idx, 'image_url', event.target.value)}
              placeholder="URL imej row"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
            <input
              type="text"
              value={row?.caption || ''}
              onChange={(event) => onFieldChange(idx, 'caption', event.target.value)}
              placeholder="Caption / ayat row (opsyenal)"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>
        );
      })}
    </div>
  );

  const renderUploadRowsPreview = (rows, resolver) => {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return (
      <div className="mt-2 space-y-2">
        {rows.map((row, idx) => {
          const resolvedUrl = resolver(row?.image_url);
          if (!resolvedUrl && !row?.caption) return null;
          return (
            <div key={`preview-upload-row-${idx}`} className="rounded-md border border-slate-200 bg-slate-50 p-2">
              {resolvedUrl && (
                <img
                  src={resolvedUrl}
                  alt={`Preview upload ${idx + 1}`}
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
  };

  const renderInvoiceTemplatePreview = () => {
    const template = normalizeInvoiceTemplate(invoiceTemplate);
    const leftLogo = resolveInvoiceTemplateAssetUrl(template?.header?.left_logo_url);
    const rightLogo = resolveInvoiceTemplateAssetUrl(template?.header?.right_logo_url);
    const footerBoxes = [template?.footer?.left_box || {}, template?.footer?.right_box || {}];

    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              {leftLogo && (
                <img src={leftLogo} alt="Logo kiri" className="mb-2 h-12 w-auto object-contain" />
              )}
              {(template?.header?.rows || []).map((row, idx) => (
                <p key={`invoice-preview-header-${idx}`} className={idx === 0 ? 'text-sm font-semibold text-slate-800' : 'mt-1 text-xs text-slate-600'}>
                  {row}
                </p>
              ))}
            </div>
            <div className="text-right">
              {rightLogo && (
                <img src={rightLogo} alt="Logo kanan" className="ml-auto mb-2 h-12 w-auto object-contain" />
              )}
              <p className="text-xl font-bold tracking-wide text-slate-900">{template?.header?.right_title || 'Invois'}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4 sm:p-5">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-800">No. Invois: INV-PRATONTON-001</p>
            <p className="mt-1 text-xs text-slate-500">Nama Pelajar: Contoh Pelajar</p>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">Butiran</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-700">Amaun</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-200">
                  <td className="px-3 py-2 text-slate-700">Yuran Asas (pratonton)</td>
                  <td className="px-3 py-2 text-right text-slate-700">RM 100.00</td>
                </tr>
                <tr className="border-t border-slate-200">
                  <td className="px-3 py-2 text-slate-700">Jumlah Invois</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900">RM 100.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-slate-200 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {footerBoxes.map((box, boxIdx) => {
              const resolvedMainImage = resolveInvoiceTemplateAssetUrl(box?.image_url);
              return (
                <div key={`invoice-preview-footer-box-${boxIdx}`} className="rounded-lg border border-slate-200 p-3">
                  {resolvedMainImage && (
                    <img src={resolvedMainImage} alt={`Footer box ${boxIdx + 1}`} className="h-12 w-auto object-contain" />
                  )}
                  {box?.title && (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-700">{box.title}</p>
                  )}
                  {(box?.rows || []).map((row, idx) => (
                    <p key={`invoice-preview-footer-box-${boxIdx}-row-${idx}`} className="mt-1 text-xs text-slate-600">
                      {row}
                    </p>
                  ))}
                  {renderUploadRowsPreview(box?.upload_rows || [], resolveInvoiceTemplateAssetUrl)}
                </div>
              );
            })}
          </div>
          <div className="mt-3 border-t border-dashed border-slate-200 pt-3 text-center">
            {(template?.footer?.rows || []).map((row, idx) => (
              <p key={`invoice-preview-footer-row-${idx}`} className={idx === 0 ? 'text-sm font-semibold text-slate-800' : 'mt-1 text-xs text-slate-600'}>
                {row}
              </p>
            ))}
            <p className="mt-1 text-xs text-slate-500">Tarikh Invoice dijana: {new Date().toLocaleString('ms-MY')}</p>
          </div>
        </div>
      </div>
    );
  };

  const renderAgmTemplatePreview = () => {
    const template = normalizeAgmReportTemplate(agmTemplate);
    const leftLogo = resolveAgmReportTemplateAssetUrl(template?.header?.left_logo_url);
    const rightLogo = resolveAgmReportTemplateAssetUrl(template?.header?.right_logo_url);
    const leftBoxes = template?.footer?.left_boxes || [];
    const rightBoxes = template?.footer?.right_boxes || [];

    const renderAgmBox = (box, idx, sideLabel) => {
      const resolvedMainImage = resolveAgmReportTemplateAssetUrl(box?.image_url);
      return (
        <div key={`agm-preview-${sideLabel}-${idx}`} className="rounded-lg border border-slate-200 p-2">
          {resolvedMainImage && (
            <img src={resolvedMainImage} alt={`Box ${sideLabel} ${idx + 1}`} className="h-10 w-auto object-contain" />
          )}
          {box?.title && <p className="mt-1 text-[11px] font-semibold text-slate-700">{box.title}</p>}
          {(box?.rows || []).map((row, rowIdx) => (
            <p key={`agm-preview-${sideLabel}-${idx}-row-${rowIdx}`} className="text-[11px] text-slate-600">
              {row}
            </p>
          ))}
          {renderUploadRowsPreview(box?.upload_rows || [], resolveAgmReportTemplateAssetUrl)}
        </div>
      );
    };

    return (
      <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="flex items-start gap-3">
              {leftLogo && <img src={leftLogo} alt="Logo kiri AGM" className="h-12 w-auto object-contain" />}
              <div>
                {(template?.header?.rows || []).map((row, idx) => (
                  <p key={`agm-preview-header-${idx}`} className={idx === 0 ? 'text-sm font-semibold text-slate-800' : 'mt-1 text-xs text-slate-600'}>
                    {row}
                  </p>
                ))}
              </div>
            </div>
            <div className="text-right">
              {rightLogo && <img src={rightLogo} alt="Logo kanan AGM" className="ml-auto h-12 w-auto object-contain" />}
              <p className="mt-1 text-lg font-bold text-slate-900">{template?.header?.right_title || 'Laporan AGM'}</p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="rounded-lg border border-slate-200 p-4 text-center">
            <p className="text-sm font-semibold text-slate-800">PRATONTON KANDUNGAN LAPORAN AGM</p>
            <p className="mt-1 text-xs text-slate-500">Bahagian isi laporan akan dipaparkan di sini semasa cetakan/eksport.</p>
          </div>
        </div>

        <div className="border-t border-slate-200 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2 Box Kiri</p>
              {leftBoxes.map((box, idx) => renderAgmBox(box, idx, 'kiri'))}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2 Box Kanan</p>
              {rightBoxes.map((box, idx) => renderAgmBox(box, idx, 'kanan'))}
            </div>
          </div>
          <div className="mt-3 border-t border-dashed border-slate-200 pt-3 text-center">
            {(template?.footer?.rows || []).map((row, idx) => (
              <p key={`agm-preview-footer-row-${idx}`} className={idx === 0 ? 'text-sm font-semibold text-slate-800' : 'mt-1 text-xs text-slate-600'}>
                {row}
              </p>
            ))}
            <p className="mt-1 text-xs text-slate-500">Dijana pada: {new Date().toLocaleString('ms-MY')}</p>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 min-w-0 overflow-x-hidden">
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-violet-500 flex items-center justify-center text-white">
              <Settings size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Tetapan Yuran</h1>
              <p className="text-slate-500 text-sm">Polisi bayaran yuran · Template Invois · Template Laporan AGM</p>
              <div className="mt-1 flex items-center gap-3">
                <HelpManualLink sectionId="tetapan-yuran" label="Manual bahagian ini" />
                <HelpManualLink sectionId="formula-logik-pengiraan-ansuran" label="Formula ansuran" />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <div className="px-6 py-4 border-b bg-gradient-to-r from-emerald-50 to-teal-50">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-emerald-600" />
              <h2 className="font-semibold text-slate-800">Polisi Bayaran / Ansuran</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Tetapkan bilangan maksimum bayaran ansuran dalam 9 bulan (sebelum bulan 10). Default: 2 kali.
            </p>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
              <p className="text-slate-700">
                {policy.description || 'Ibu bapa boleh bayar yuran sebelum bulan 10 setiap tahun (dalam masa 9 bulan) sebanyak maksimum 2 kali bayaran.'}
              </p>
              <p className="text-sm text-slate-500 mt-3">
                Maksimum bayaran: {policy.max_payments ?? 2} kali · Tarikh akhir: sebelum bulan {policy.deadline_month ?? 9}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Bilangan Maksimum Ansuran (dalam 9 bulan)
              </label>
              <p className="text-xs text-slate-500 mb-2">Bendahari boleh set 1 hingga 9 kali. Nilai semasa: {selectedMaxPayments} kali.</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSelectedMaxPayments(n)}
                    className={`min-w-[2.5rem] py-2.5 px-3 rounded-xl border-2 font-semibold transition-all ${
                      selectedMaxPayments === n
                        ? 'border-teal-500 bg-teal-500 text-white shadow-md'
                        : 'border-slate-200 hover:border-teal-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {hasPolicyChanges && (
                <div className="mt-4 flex items-center gap-3">
                  <Button variant="primary" loading={savingPolicy} onClick={handleSaveMaxPayments} className="bg-teal-600">
                    <Save size={16} />
                    Simpan {selectedMaxPayments} kali ansuran
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedMaxPayments(policy.max_payments ?? 2)} disabled={savingPolicy}>
                    Batal
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t bg-slate-50 flex justify-between items-center">
            <Button variant="outline" onClick={fetchPolicy} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Muat Semula Polisi
            </Button>
            {!hasPolicyChanges && (
              <span className="text-sm text-slate-500">Maksimum {policy.max_payments ?? 2} kali ansuran</span>
            )}
          </div>
        </motion.div>

        {/* ==================== INVOICE TEMPLATE ==================== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-6 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <div className="px-6 py-4 border-b bg-gradient-to-r from-violet-50 to-indigo-50">
            <div className="flex items-center gap-2">
              <ImagePlus className="w-5 h-5 text-violet-600" />
              <h2 className="font-semibold text-slate-800">Template Invois (Header & Footer)</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Tetapan ini digunakan pada paparan invoice, cetakan, dan PDF.
            </p>
            {invoiceTemplateMeta.updated_at && (
              <p className="mt-1 text-xs text-slate-500">
                Dikemas kini: {new Date(invoiceTemplateMeta.updated_at).toLocaleString('ms-MY')}
                {invoiceTemplateMeta.updated_by ? ` oleh ${invoiceTemplateMeta.updated_by}` : ''}
              </p>
            )}
          </div>

          <div className="p-6 space-y-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <h3 className="font-semibold text-slate-800">Header Invois</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderImageUploader({
                  label: 'Logo Kiri (Header)',
                  imageUrl: invoiceTemplate?.header?.left_logo_url,
                  targetKey: 'invoice-header-left-logo',
                  onChangeUrl: (value) => updateInvoiceHeaderField('left_logo_url', value),
                  onUpload: (file) => uploadTemplateImage(file, (url) => updateInvoiceHeaderField('left_logo_url', url), 'invoice-header-left-logo'),
                })}
                {renderImageUploader({
                  label: 'Logo Kanan (Header)',
                  imageUrl: invoiceTemplate?.header?.right_logo_url,
                  targetKey: 'invoice-header-right-logo',
                  onChangeUrl: (value) => updateInvoiceHeaderField('right_logo_url', value),
                  onUpload: (file) => uploadTemplateImage(file, (url) => updateInvoiceHeaderField('right_logo_url', url), 'invoice-header-right-logo'),
                })}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tajuk sebelah kanan header</label>
                <input
                  type="text"
                  value={invoiceTemplate?.header?.right_title || ''}
                  onChange={(event) => updateInvoiceHeaderField('right_title', event.target.value)}
                  placeholder="Invois"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>
              {renderRowsEditor({
                title: 'Baris Header (alamat / maklumat tambahan)',
                rows: invoiceTemplate?.header?.rows || [],
                placeholder: 'Contoh: Jalan Besar, 01000 Kangar, Perlis',
                onAdd: () => updateInvoiceRows('header.rows', (rows) => [...rows, '']),
                onRemove: (idx) => updateInvoiceRows('header.rows', (rows) => rows.filter((_, rowIdx) => rowIdx !== idx)),
                onChange: (idx, value) => updateInvoiceRows('header.rows', (rows) => rows.map((row, rowIdx) => (rowIdx === idx ? value : row))),
              })}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <h3 className="font-semibold text-slate-800">Footer Invois</h3>
              {renderRowsEditor({
                title: 'Baris Footer Utama',
                rows: invoiceTemplate?.footer?.rows || [],
                placeholder: 'Contoh: Ini adalah cetakan komputer. Tiada tandatangan diperlukan.',
                onAdd: () => updateInvoiceRows('footer.rows', (rows) => [...rows, '']),
                onRemove: (idx) => updateInvoiceRows('footer.rows', (rows) => rows.filter((_, rowIdx) => rowIdx !== idx)),
                onChange: (idx, value) => updateInvoiceRows('footer.rows', (rows) => rows.map((row, rowIdx) => (rowIdx === idx ? value : row))),
              })}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {['left_box', 'right_box'].map((boxKey, boxIndex) => {
                  const box = invoiceTemplate?.footer?.[boxKey] || {};
                  const boxLabel = boxKey === 'left_box' ? 'Box Footer Kiri' : 'Box Footer Kanan';
                  return (
                    <div key={boxKey} className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                      <p className="text-sm font-semibold text-slate-700">{boxLabel}</p>
                      {renderImageUploader({
                        label: `Imej ${boxLabel}`,
                        imageUrl: box?.image_url,
                        targetKey: `invoice-${boxKey}-main-image`,
                        onChangeUrl: (value) => updateInvoiceBoxField(boxKey, 'image_url', value),
                        onUpload: (file) => uploadTemplateImage(file, (url) => updateInvoiceBoxField(boxKey, 'image_url', url), `invoice-${boxKey}-main-image`),
                      })}
                      <input
                        type="text"
                        value={box?.title || ''}
                        onChange={(event) => updateInvoiceBoxField(boxKey, 'title', event.target.value)}
                        placeholder={`Tajuk ${boxLabel.toLowerCase()}`}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                      />
                      {renderRowsEditor({
                        title: `Baris teks ${boxLabel.toLowerCase()}`,
                        rows: box?.rows || [],
                        placeholder: 'Baris teks',
                        onAdd: () => updateInvoiceRows(`footer.${boxKey}.rows`, (rows) => [...rows, '']),
                        onRemove: (idx) => updateInvoiceRows(`footer.${boxKey}.rows`, (rows) => rows.filter((_, rowIdx) => rowIdx !== idx)),
                        onChange: (idx, value) => updateInvoiceRows(`footer.${boxKey}.rows`, (rows) => rows.map((row, rowIdx) => (rowIdx === idx ? value : row))),
                      })}
                      {renderUploadRowsEditor({
                        title: `Row Upload bawah ${boxLabel.toLowerCase()}`,
                        rows: box?.upload_rows || [],
                        baseTargetKey: `invoice-${boxKey}`,
                        resolver: resolveInvoiceTemplateAssetUrl,
                        onAdd: () => updateInvoiceUploadRows(boxKey, (rows) => [...rows, { image_url: '', caption: '' }]),
                        onRemove: (idx) => updateInvoiceUploadRows(boxKey, (rows) => rows.filter((_, rowIdx) => rowIdx !== idx)),
                        onFieldChange: (idx, field, value) => updateInvoiceUploadRows(
                          boxKey,
                          (rows) => rows.map((row, rowIdx) => (rowIdx === idx ? { ...row, [field]: value } : row)),
                        ),
                        onUpload: (idx, file, targetKey) => uploadTemplateImage(
                          file,
                          (url) => updateInvoiceUploadRows(
                            boxKey,
                            (rows) => rows.map((row, rowIdx) => (rowIdx === idx ? { ...row, image_url: url } : row)),
                          ),
                          targetKey,
                        ),
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">Nota template invois:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-600">
                  <li>Boleh tambah row upload di bawah box kiri/kanan footer mengikut layout lampiran.</li>
                  <li>Row upload menyokong imej + caption ringkas.</li>
                  <li>Template ini terus digunakan oleh invoice pelajar dan cetakan PDF.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t bg-slate-50 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <Button variant="outline" onClick={fetchAllSettings} disabled={loading || savingInvoiceTemplate || savingAgmTemplate}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Muat Semula Semua Tetapan
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewType('invoice')}>
                <Eye size={16} />
                Pratonton Template Invois
              </Button>
              <Button variant="outline" onClick={resetInvoiceTemplate} disabled={!hasInvoiceTemplateChanges || savingInvoiceTemplate}>
                Reset
              </Button>
              <Button variant="success" loading={savingInvoiceTemplate} onClick={saveInvoiceTemplate} disabled={!hasInvoiceTemplateChanges}>
                <Save size={16} />
                Simpan Template Invois
              </Button>
            </div>
          </div>
        </motion.div>

        {/* ==================== AGM TEMPLATE ==================== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <div className="px-6 py-4 border-b bg-gradient-to-r from-amber-50 to-orange-50">
            <div className="flex items-center gap-2">
              <ImagePlus className="w-5 h-5 text-amber-600" />
              <h2 className="font-semibold text-slate-800">Template Laporan AGM (Header & Footer)</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Header/Footer laporan AGM. Footer mempunyai 2 box kiri dan 2 box kanan dengan sokongan upload.
            </p>
            {agmTemplateMeta.updated_at && (
              <p className="mt-1 text-xs text-slate-500">
                Dikemas kini: {new Date(agmTemplateMeta.updated_at).toLocaleString('ms-MY')}
                {agmTemplateMeta.updated_by ? ` oleh ${agmTemplateMeta.updated_by}` : ''}
              </p>
            )}
          </div>

          <div className="p-6 space-y-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <h3 className="font-semibold text-slate-800">Header Laporan AGM</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderImageUploader({
                  label: 'Logo Kiri (Header AGM)',
                  imageUrl: agmTemplate?.header?.left_logo_url,
                  targetKey: 'agm-header-left-logo',
                  resolver: resolveAgmReportTemplateAssetUrl,
                  onChangeUrl: (value) => updateAgmHeaderField('left_logo_url', value),
                  onUpload: (file) => uploadTemplateImage(file, (url) => updateAgmHeaderField('left_logo_url', url), 'agm-header-left-logo'),
                })}
                {renderImageUploader({
                  label: 'Logo Kanan (Header AGM)',
                  imageUrl: agmTemplate?.header?.right_logo_url,
                  targetKey: 'agm-header-right-logo',
                  resolver: resolveAgmReportTemplateAssetUrl,
                  onChangeUrl: (value) => updateAgmHeaderField('right_logo_url', value),
                  onUpload: (file) => uploadTemplateImage(file, (url) => updateAgmHeaderField('right_logo_url', url), 'agm-header-right-logo'),
                })}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tajuk kanan Header AGM</label>
                <input
                  type="text"
                  value={agmTemplate?.header?.right_title || ''}
                  onChange={(event) => updateAgmHeaderField('right_title', event.target.value)}
                  placeholder="Laporan AGM"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
              {renderRowsEditor({
                title: 'Baris Header AGM',
                rows: agmTemplate?.header?.rows || [],
                placeholder: 'Contoh: BERAKHIR (DISEMBER 2026)',
                onAdd: () => updateAgmRows('header.rows', (rows) => [...rows, '']),
                onRemove: (idx) => updateAgmRows('header.rows', (rows) => rows.filter((_, rowIdx) => rowIdx !== idx)),
                onChange: (idx, value) => updateAgmRows('header.rows', (rows) => rows.map((row, rowIdx) => (rowIdx === idx ? value : row))),
              })}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <h3 className="font-semibold text-slate-800">Footer Laporan AGM</h3>
              {renderRowsEditor({
                title: 'Baris Footer Utama AGM',
                rows: agmTemplate?.footer?.rows || [],
                placeholder: 'Contoh: Dokumen ini dijana oleh sistem.',
                onAdd: () => updateAgmRows('footer.rows', (rows) => [...rows, '']),
                onRemove: (idx) => updateAgmRows('footer.rows', (rows) => rows.filter((_, rowIdx) => rowIdx !== idx)),
                onChange: (idx, value) => updateAgmRows('footer.rows', (rows) => rows.map((row, rowIdx) => (rowIdx === idx ? value : row))),
              })}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {[
                  { sideKey: 'left_boxes', sideLabel: 'Kiri' },
                  { sideKey: 'right_boxes', sideLabel: 'Kanan' },
                ].map(({ sideKey, sideLabel }) => (
                  <div key={sideKey} className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                    <p className="text-sm font-semibold text-slate-700">2 Box Footer {sideLabel}</p>
                    {(agmTemplate?.footer?.[sideKey] || []).map((box, boxIndex) => (
                      <div key={`${sideKey}-${boxIndex}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                        <p className="text-xs font-semibold text-slate-600">Box {sideLabel} {boxIndex + 1}</p>
                        {renderImageUploader({
                          label: `Imej Box ${sideLabel} ${boxIndex + 1}`,
                          imageUrl: box?.image_url,
                          targetKey: `agm-${sideKey}-${boxIndex}-main-image`,
                          resolver: resolveAgmReportTemplateAssetUrl,
                          onChangeUrl: (value) => updateAgmBoxField(sideKey, boxIndex, 'image_url', value),
                          onUpload: (file) => uploadTemplateImage(
                            file,
                            (url) => updateAgmBoxField(sideKey, boxIndex, 'image_url', url),
                            `agm-${sideKey}-${boxIndex}-main-image`,
                          ),
                        })}
                        <input
                          type="text"
                          value={box?.title || ''}
                          onChange={(event) => updateAgmBoxField(sideKey, boxIndex, 'title', event.target.value)}
                          placeholder={`Tajuk Box ${sideLabel} ${boxIndex + 1}`}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-300"
                        />
                        {renderRowsEditor({
                          title: `Baris teks Box ${sideLabel} ${boxIndex + 1}`,
                          rows: box?.rows || [],
                          placeholder: 'Baris teks box',
                          onAdd: () => updateAgmBoxRows(sideKey, boxIndex, (rows) => [...rows, '']),
                          onRemove: (idx) => updateAgmBoxRows(sideKey, boxIndex, (rows) => rows.filter((_, rowIdx) => rowIdx !== idx)),
                          onChange: (idx, value) => updateAgmBoxRows(sideKey, boxIndex, (rows) => rows.map((row, rowIdx) => (rowIdx === idx ? value : row))),
                        })}
                        {renderUploadRowsEditor({
                          title: `Row Upload bawah Box ${sideLabel} ${boxIndex + 1}`,
                          rows: box?.upload_rows || [],
                          baseTargetKey: `agm-${sideKey}-${boxIndex}`,
                          resolver: resolveAgmReportTemplateAssetUrl,
                          onAdd: () => updateAgmBoxUploadRows(sideKey, boxIndex, (rows) => [...rows, { image_url: '', caption: '' }]),
                          onRemove: (idx) => updateAgmBoxUploadRows(sideKey, boxIndex, (rows) => rows.filter((_, rowIdx) => rowIdx !== idx)),
                          onFieldChange: (idx, field, value) => updateAgmBoxUploadRows(
                            sideKey,
                            boxIndex,
                            (rows) => rows.map((row, rowIdx) => (rowIdx === idx ? { ...row, [field]: value } : row)),
                          ),
                          onUpload: (idx, file, targetKey) => uploadTemplateImage(
                            file,
                            (url) => updateAgmBoxUploadRows(
                              sideKey,
                              boxIndex,
                              (rows) => rows.map((row, rowIdx) => (rowIdx === idx ? { ...row, image_url: url } : row)),
                            ),
                            targetKey,
                          ),
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700">
                <p className="font-medium mb-1">Nota template AGM:</p>
                <ul className="list-disc list-inside space-y-1 text-amber-700">
                  <li>Footer AGM menyokong 2 box kiri + 2 box kanan, setiap satu boleh upload imej.</li>
                  <li>Setiap box juga boleh tambah row upload tambahan di bawah box.</li>
                  <li>Tetapan ini disimpan dalam DB (database-driven).</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t bg-slate-50 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <Button variant="outline" onClick={fetchAllSettings} disabled={loading || savingInvoiceTemplate || savingAgmTemplate}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Muat Semula Semua Tetapan
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewType('agm')}>
                <Eye size={16} />
                Pratonton Template AGM
              </Button>
              <Button variant="outline" onClick={resetAgmTemplate} disabled={!hasAgmTemplateChanges || savingAgmTemplate}>
                Reset
              </Button>
              <Button variant="success" loading={savingAgmTemplate} onClick={saveAgmTemplate} disabled={!hasAgmTemplateChanges}>
                <Save size={16} />
                Simpan Template AGM
              </Button>
            </div>
          </div>
        </motion.div>
      </div>

      {previewType && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setPreviewType(null)}
            aria-label="Tutup pratonton"
          />
          <div className="relative z-10 h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div>
                <p className="text-base font-semibold text-slate-800">
                  {previewType === 'invoice' ? 'Pratonton Template Invois' : 'Pratonton Template Laporan AGM'}
                </p>
                <p className="text-xs text-slate-500">Pratonton ini tidak menyimpan data. Semak dahulu sebelum klik Simpan.</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewType(null)}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>
            </div>
            <div className="h-[calc(100%-66px)] overflow-y-auto p-4">
              {previewType === 'invoice' ? renderInvoiceTemplatePreview() : renderAgmTemplatePreview()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default YuranSettingsPage;
