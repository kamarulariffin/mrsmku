import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Clock3, Mail, RefreshCcw, Send, ShieldX, UserCog } from 'lucide-react';
import { toast } from 'sonner';

import api from '../../services/api';
import { Button, Card, Input, Select, Spinner } from '../../components/common';

const DEFAULT_MODULES = {
  tiket_bas: { enabled: true, name: 'Tiket Bas' },
  hostel: { enabled: true, name: 'Hostel' },
  koperasi: { enabled: true, name: 'Koperasi' },
  marketplace: { enabled: true, name: 'Marketplace' },
  sickbay: { enabled: true, name: 'Bilik Sakit' },
  vehicle: { enabled: true, name: 'Kenderaan' },
  inventory: { enabled: true, name: 'Inventori' },
  complaints: { enabled: true, name: 'Aduan' },
  agm: { enabled: true, name: 'AGM' },
};

const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'submitted', label: 'Dihantar' },
  { value: 'under_review', label: 'Dalam Semakan' },
  { value: 'need_info', label: 'Perlu Maklumat Tambahan' },
  { value: 'approved', label: 'Diluluskan' },
  { value: 'rejected', label: 'Ditolak' },
];

const STATUS_BADGE = {
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-700',
  need_info: 'bg-orange-100 text-orange-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
};

function statusLabel(status) {
  return STATUS_OPTIONS.find((opt) => opt.value === status)?.label || status || '-';
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[status] || 'bg-slate-100 text-slate-700'}`}>
      {statusLabel(status)}
    </span>
  );
}

function ReviewActionPanel({
  request,
  modulesState,
  setModulesState,
  onAction,
  processing,
}) {
  const [tenantCode, setTenantCode] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [createAdminAccount, setCreateAdminAccount] = useState(true);
  const [adminPassword, setAdminPassword] = useState('');

  useEffect(() => {
    setTenantCode(request?.tenant_code || request?.preferred_tenant_code || '');
    setReviewerNotes('');
    setCreateAdminAccount(true);
    setAdminPassword('');
  }, [request]);

  if (!request) return null;

  const status = request.status || '';
  const disabled = processing || ['approved', 'rejected'].includes(status);

  const submit = (decision) => {
    onAction(decision, {
      tenant_code: tenantCode,
      reviewer_notes: reviewerNotes,
      create_admin_account: createAdminAccount,
      admin_password: adminPassword,
      approved_modules: modulesState,
    });
  };

  const toggleModule = (key) => {
    setModulesState((prev) => {
      const current = Boolean(prev?.[key]?.enabled);
      const enabledCount = Object.values(prev || {}).filter((item) => item?.enabled).length;
      if (current && enabledCount <= 1) {
        toast.error('Sekurang-kurangnya satu modul mesti aktif');
        return prev;
      }
      return {
        ...prev,
        [key]: {
          ...(prev?.[key] || {}),
          enabled: !current,
        },
      };
    });
  };

  return (
    <Card className="border-cyan-100">
      <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2"><UserCog size={16} /> Tindakan Semakan</h3>
      <p className="text-xs text-slate-500 mt-1">Hanya superadmin boleh approve/reject permohonan onboarding institusi.</p>

      <div className="grid md:grid-cols-2 gap-3 mt-4">
        <Input
          label="Tenant Code (opsyenal)"
          value={tenantCode}
          onChange={(e) => setTenantCode(e.target.value)}
          placeholder="contoh: mrsm-kuantan"
        />
        <Input
          label="Kata laluan sementara admin (opsyenal)"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          placeholder="kosongkan untuk auto-generate"
        />
      </div>

      <div className="mt-3">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={createAdminAccount}
            onChange={(e) => setCreateAdminAccount(e.target.checked)}
            className="rounded border-slate-300"
          />
          Cipta akaun admin institusi automatik semasa approve
        </label>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-slate-800 mb-2">Modul tenant selepas approve</p>
        <div className="grid md:grid-cols-2 gap-2">
          {Object.entries(modulesState || {}).map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleModule(key)}
              className={`text-left rounded-lg border p-2.5 ${value?.enabled ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-white'}`}
              disabled={disabled}
            >
              <p className="text-sm font-medium text-slate-900">{value?.name || key}</p>
              <p className="text-xs text-slate-500">{value?.enabled ? 'Aktif' : 'Tidak aktif'}</p>
            </button>
          ))}
        </div>
      </div>

      <Input
        label="Catatan Semakan"
        value={reviewerNotes}
        onChange={(e) => setReviewerNotes(e.target.value)}
        placeholder="catatan untuk institusi (jika ada)"
      />

      <div className="flex flex-wrap gap-2 mt-4">
        <Button variant="outline" onClick={() => submit('need_info')} disabled={disabled}>
          <Clock3 size={15} /> Need Info
        </Button>
        <Button variant="danger" onClick={() => submit('reject')} disabled={disabled}>
          <ShieldX size={15} /> Reject
        </Button>
        <Button onClick={() => submit('approve')} disabled={disabled}>
          <CheckCircle2 size={15} /> Approve & Provision
        </Button>
      </div>
    </Card>
  );
}

export default function TenantOnboardingPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1 });
  const [filters, setFilters] = useState({ status: '', search: '', page: 1 });

  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [modulesState, setModulesState] = useState(DEFAULT_MODULES);
  const [lastActionResult, setLastActionResult] = useState(null);

  const selectedSummary = useMemo(() => {
    if (!selectedRequest) return null;
    return {
      institution: selectedRequest.institution_name || '-',
      tracking: selectedRequest.tracking_code || '-',
      status: selectedRequest.status || '',
      requestedModules: selectedRequest.requested_modules || [],
    };
  }, [selectedRequest]);

  const loadList = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get('/api/tenants/onboarding/requests', {
        params: {
          status: filters.status || undefined,
          search: filters.search || undefined,
          page: filters.page || 1,
          limit: 20,
        },
      });
      const payload = res?.data || {};
      setItems(payload.items || []);
      setPagination(payload.pagination || { page: 1, limit: 20, total: 0, total_pages: 1 });
      if (!selectedRequestId && payload?.items?.length) {
        setSelectedRequestId(payload.items[0].id);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Gagal memuatkan senarai onboarding institusi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters.status, filters.search, filters.page, selectedRequestId]);

  const loadDetail = useCallback(async () => {
    if (!selectedRequestId) {
      setSelectedRequest(null);
      return;
    }
    try {
      const res = await api.get(`/api/tenants/onboarding/requests/${selectedRequestId}`);
      const detail = res?.data || null;
      setSelectedRequest(detail);
      setModulesState(detail?.requested_modules_map || DEFAULT_MODULES);
    } catch (err) {
      setSelectedRequest(null);
      toast.error(err?.response?.data?.detail || 'Gagal memuatkan detail permohonan');
    }
  }, [selectedRequestId]);

  useEffect(() => {
    loadList(false);
  }, [loadList]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const doAction = async (decision, payload) => {
    if (!selectedRequestId) return;
    setProcessing(true);
    setLastActionResult(null);
    try {
      const res = await api.post(`/api/tenants/onboarding/requests/${selectedRequestId}/review`, {
        decision,
        ...payload,
      });
      const result = res?.data || {};
      setLastActionResult(result);
      toast.success(`Permohonan berjaya dikemaskini: ${decision}`);
      await loadList(true);
      await loadDetail();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Tindakan semakan gagal');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-cyan-100">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Building2 size={22} /> Tenant Onboarding</h1>
            <p className="text-sm text-slate-600 mt-1">Semak permohonan institusi baharu dan provision tenant secara terkawal.</p>
          </div>
          <Button variant="outline" onClick={() => loadList(true)} loading={refreshing}>
            <RefreshCcw size={16} /> Refresh
          </Button>
        </div>
      </Card>

      <div className="grid lg:grid-cols-[1.1fr_1.3fr] gap-5">
        <Card>
          <div className="grid sm:grid-cols-[200px_1fr] gap-3 mb-4">
            <Select
              label="Status"
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value, page: 1 }))}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
            <Input
              label="Carian"
              placeholder="institusi / emel / tracking code"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value, page: 1 }))}
            />
          </div>

          <div className="space-y-2 max-h-[62vh] overflow-auto pr-1">
            {items.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">Tiada permohonan ditemui.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedRequestId(item.id)}
                  className={`w-full text-left rounded-xl border p-3 ${selectedRequestId === item.id ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{item.institution_name || '-'}</p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate flex items-center gap-1"><Mail size={12} /> {item.admin_email || item.contact_person_email || '-'}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Tracking: <span className="font-mono">{item.tracking_code || '-'}</span></p>
                </button>
              ))
            )}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            <span>Total: {pagination.total || 0}</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={(filters.page || 1) <= 1}
                onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page || 1) - 1) }))}
              >
                Sebelum
              </Button>
              <span>Halaman {pagination.page || 1} / {pagination.total_pages || 1}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={(filters.page || 1) >= (pagination.total_pages || 1)}
                onClick={() => setFilters((prev) => ({ ...prev, page: Math.min(pagination.total_pages || 1, (prev.page || 1) + 1) }))}
              >
                Seterusnya
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="text-base font-semibold text-slate-900">Detail Permohonan</h2>
            {!selectedRequest ? (
              <p className="text-sm text-slate-500 mt-3">Pilih satu permohonan di panel kiri untuk melihat detail.</p>
            ) : (
              <div className="space-y-3 mt-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{selectedSummary?.institution}</p>
                  <StatusBadge status={selectedSummary?.status} />
                </div>
                <p className="text-slate-600">Tracking: <span className="font-mono">{selectedSummary?.tracking}</span></p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Wakil Institusi</p>
                    <p className="font-medium text-slate-900">{selectedRequest.contact_person_name || '-'}</p>
                    <p className="text-xs text-slate-600 mt-1">{selectedRequest.contact_person_email || '-'}</p>
                    <p className="text-xs text-slate-600">{selectedRequest.contact_person_phone || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Admin Institusi</p>
                    <p className="font-medium text-slate-900">{selectedRequest.admin_full_name || '-'}</p>
                    <p className="text-xs text-slate-600 mt-1">{selectedRequest.admin_email || '-'}</p>
                    <p className="text-xs text-slate-600">{selectedRequest.admin_phone || '-'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Modul Diminta</p>
                  <div className="flex flex-wrap gap-2">
                    {(selectedRequest.requested_modules || []).map((key) => (
                      <span key={key} className="px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 text-xs font-semibold">
                        {selectedRequest?.requested_modules_map?.[key]?.name || key}
                      </span>
                    ))}
                    {!(selectedRequest.requested_modules || []).length ? (
                      <span className="text-xs text-slate-500">Tiada data modul</span>
                    ) : null}
                  </div>
                </div>
                {selectedRequest.notes ? (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs text-slate-500 mb-1">Catatan Institusi</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedRequest.notes}</p>
                  </div>
                ) : null}
              </div>
            )}
          </Card>

          <ReviewActionPanel
            request={selectedRequest}
            modulesState={modulesState}
            setModulesState={setModulesState}
            onAction={doAction}
            processing={processing}
          />

          {lastActionResult ? (
            <Card className="border-emerald-200 bg-emerald-50">
              <h3 className="text-sm font-semibold text-emerald-800 flex items-center gap-2"><Send size={15} /> Hasil Tindakan Terakhir</h3>
              <p className="text-xs text-emerald-700 mt-1">Status: {lastActionResult.status || '-'}</p>
              {lastActionResult?.tenant?.tenant_code ? (
                <p className="text-xs text-emerald-700 mt-1">Tenant: <span className="font-mono">{lastActionResult.tenant.tenant_code}</span></p>
              ) : null}
              {lastActionResult?.temporary_password ? (
                <p className="text-xs text-emerald-700 mt-1">Kata laluan sementara admin: <span className="font-mono">{lastActionResult.temporary_password}</span></p>
              ) : null}
              {(lastActionResult?.notes || []).length ? (
                <ul className="mt-2 space-y-1">
                  {lastActionResult.notes.map((note, idx) => (
                    <li key={`${note}-${idx}`} className="text-xs text-emerald-700">- {note}</li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
