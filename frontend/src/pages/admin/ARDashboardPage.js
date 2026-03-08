/**
 * Dashboard Accounts Receivable (AR)
 * Total AR, aging, top outstanding, integriti sub-ledger vs GL.
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../services/api';
import { Card, Spinner } from '../../components/common';
import {
  Wallet,
  TrendingUp,
  AlertCircle,
  Users,
  FileText,
  ChevronRight,
  RefreshCw,
  BarChart3,
  Send,
  Mail,
  Bell,
  X,
} from 'lucide-react';

const ARDashboardPage = () => {
  const [data, setData] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [reminderModal, setReminderModal] = useState(null); // { studentId, studentName } when open
  const [reminderChannel, setReminderChannel] = useState(null); // 'email' | 'push' | null
  const [selectedEmailTemplateKey, setSelectedEmailTemplateKey] = useState('fee_reminder');
  const [selectedPushTemplateKey, setSelectedPushTemplateKey] = useState('reminder_full');
  const [emailTemplateKeys, setEmailTemplateKeys] = useState([]);
  const [pushTemplateOptions, setPushTemplateOptions] = useState([]);
  const [reminderSending, setReminderSending] = useState(false);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const [res, intRes] = await Promise.all([
        api.get('/api/ar/dashboard', { params: { year } }),
        api.get('/api/ar/integrity', { params: { year } }).catch(() => ({ data: null })),
      ]);
      setData(res.data);
      setIntegrity(intRes?.data || null);
    } catch (e) {
      setData(null);
      setIntegrity(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [year]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const years = [year - 2, year - 1, year, year + 1].filter(y => y >= 2020);

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="ar-dashboard-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-heading flex items-center gap-2">
            <BarChart3 className="text-teal-600" size={28} />
            Accounts Receivable (AR)
          </h1>
          <p className="text-slate-600 mt-1">Sub-ledger per pelajar, aging dan integriti GL</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={fetchDashboard}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {integrity && (
        <Card className={integrity.match ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}>
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className={integrity.match ? 'text-emerald-600' : 'text-amber-600'} />
            <div>
              <p className="font-medium text-slate-800">Integriti Sub-Ledger vs GL</p>
              <p className="text-sm text-slate-600">
                Sub-ledger: RM {(integrity.subledger_total_outstanding || 0).toLocaleString()} |
                GL AR: RM {(integrity.gl_ar_balance || 0).toLocaleString()}
                {integrity.match ? ' — Match.' : ' — Mismatch; semak data.'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {!data && (
        <Card>
          <p className="text-slate-500 text-center py-8">Tiada data AR. Pastikan modul AR dan yuran berjalan.</p>
          <p className="text-sm text-slate-400 text-center">API: GET /api/ar/dashboard</p>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-teal-600 font-medium">Jumlah Dijangka</p>
                  <p className="text-xl font-bold text-teal-800">RM {(data.total_expected || 0).toLocaleString()}</p>
                </div>
                <FileText className="text-teal-400" size={28} />
              </div>
            </Card>
            <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-emerald-600 font-medium">Dikumpul</p>
                  <p className="text-xl font-bold text-emerald-800">RM {(data.total_collected || 0).toLocaleString()}</p>
                </div>
                <TrendingUp className="text-emerald-400" size={28} />
              </div>
            </Card>
            <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-600 font-medium">Tertunggak (AR)</p>
                  <p className="text-xl font-bold text-amber-800">RM {(data.total_outstanding || 0).toLocaleString()}</p>
                </div>
                <Wallet className="text-amber-400" size={28} />
              </div>
            </Card>
            <Card className="bg-slate-50 border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 font-medium">Kadar Kutipan</p>
                  <p className="text-xl font-bold text-slate-800">{(data.collection_rate || 0)}%</p>
                </div>
              </div>
            </Card>
          </div>

          {data.aging && (
            <Card>
              <h3 className="font-semibold text-slate-900 mb-3">Aging Tertunggak</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-slate-50">
                  <p className="text-slate-500">0-30 hari</p>
                  <p className="font-bold text-slate-800">RM {(data.aging['0_30'] || 0).toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50">
                  <p className="text-amber-600">31-60 hari</p>
                  <p className="font-bold text-amber-800">RM {(data.aging['31_60'] || 0).toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50">
                  <p className="text-orange-600">61-90 hari</p>
                  <p className="font-bold text-orange-800">RM {(data.aging['61_90'] || 0).toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-red-50">
                  <p className="text-red-600">90+ hari</p>
                  <p className="font-bold text-red-800">RM {(data.aging['90_plus'] || 0).toLocaleString()}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Pautan ke halaman senarai tertunggak mengikut tingkatan (tab, pagination, status notifikasi) */}
          <Card className="bg-gradient-to-br from-teal-50 to-slate-50 border-teal-200">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
                  <Users className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Senarai Tertunggak mengikut Tingkatan</h3>
                  <p className="text-sm text-slate-600 mt-0.5">
                    Tab Tingkatan 1–5, pagination, status merah (belum hantar) / hijau (sudah hantar), jenis notifikasi E-mel atau Push.
                  </p>
                </div>
              </div>
              <Link
                to="/admin/ar-outstanding"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors"
              >
                <Users size={18} /> Pergi ke Senarai Tertunggak
                <ChevronRight size={18} />
              </Link>
            </div>
            {data.top_10_outstanding && data.top_10_outstanding.length > 0 && (
              <p className="text-xs text-slate-500 mt-3">
                Ringkasan: {data.top_10_outstanding.length} pelajar tertunggak teratas (tahun {data.year}). Klik di atas untuk senarai penuh ikut tingkatan.
              </p>
            )}
          </Card>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/admin/yuran/pelajar"
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              Semua Yuran Pelajar <ChevronRight size={16} />
            </Link>
            <Link
              to="/admin/reports"
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Laporan
            </Link>
          </div>
        </>
      )}

      {/* Modal pilih saluran lalu template e-mel atau push */}
      {reminderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setReminderModal(null); setReminderChannel(null); }}>
          <div
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
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
                <button
                  type="button"
                  onClick={() => setReminderChannel('email')}
                  className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-left"
                >
                  <Mail className="w-5 h-5 text-teal-600" />
                  <span>E-mel sahaja</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReminderChannel('push')}
                  className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-left"
                >
                  <Bell className="w-5 h-5 text-teal-600" />
                  <span>Push notifikasi sahaja</span>
                </button>
              </div>
            ) : reminderChannel === 'email' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Template e-mel</label>
                  <select
                    value={selectedEmailTemplateKey}
                    onChange={(e) => setSelectedEmailTemplateKey(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    {emailTemplateKeys.length ? emailTemplateKeys.map((t) => (
                      <option key={t.key} value={t.key}>{t.name || t.key}</option>
                    )) : (
                      <option value="fee_reminder">Peringatan Yuran Tertunggak (fee_reminder)</option>
                    )}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setReminderChannel(null)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">Kembali</button>
                  <button
                    type="button"
                    disabled={reminderSending}
                    onClick={() => sendReminder(reminderModal.studentId, 'email', selectedEmailTemplateKey, null)}
                    className="flex-1 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700 disabled:opacity-50"
                  >
                    {reminderSending ? 'Menghantar…' : 'Hantar e-mel'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Template push</label>
                  <select
                    value={selectedPushTemplateKey}
                    onChange={(e) => setSelectedPushTemplateKey(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    {(pushTemplateOptions.length ? pushTemplateOptions : [{ key: 'reminder_full', name: 'Peringatan penuh' }, { key: 'reminder_short', name: 'Peringatan ringkas' }, { key: 'reminder_urgent', name: 'Peringatan mendesak' }]).map((t) => (
                      <option key={t.key} value={t.key}>{t.name || t.key}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setReminderChannel(null)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">Kembali</button>
                  <button
                    type="button"
                    disabled={reminderSending}
                    onClick={() => sendReminder(reminderModal.studentId, 'push', null, selectedPushTemplateKey)}
                    className="flex-1 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700 disabled:opacity-50"
                  >
                    {reminderSending ? 'Menghantar…' : 'Hantar push'}
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-400 mt-3">E-mel ikut template mengikut tingkatan pelajar di E-mel Template.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ARDashboardPage;
