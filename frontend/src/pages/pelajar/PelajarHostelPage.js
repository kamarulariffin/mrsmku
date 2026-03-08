import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  DoorOpen,
  FileText,
  AlertTriangle,
  Home,
  CalendarCheck,
  LogOut,
  Send,
  MapPin,
  User,
  Phone,
  Car,
  Building2,
  BedDouble,
  ChevronRight,
  Paperclip,
  FileCheck,
  X,
} from 'lucide-react';
import { api, API_URL } from '../../services/api';
import { useAuth } from '../../App';
import { Card, Button, Input, Spinner } from '../../components/common';
import { HostelStatusBadge, PbwPbpCalendar } from '../../components/hostel';
import { LEAVE_KATEGORI_OPTIONS, CARA_PULANG_OPTIONS, CARA_PULANG_NEEDS_PLATE, CARA_PULANG_NEEDS_REMARKS, MAX_LEAVE_FILES, ACCEPT_LEAVE_FILES, formatDateDMY } from '../../constants/hostel';

const TABS = [
  { id: 'requests', label: 'Permohonan Saya', shortLabel: 'Permohonan Saya', icon: FileText, desc: 'Lihat status semua permohonan', gradient: 'from-teal-500 to-cyan-500', bg: 'bg-gradient-to-br from-teal-50 to-cyan-50', border: 'border-teal-200' },
  { id: 'outing', label: 'Mohon Outing', shortLabel: 'Outing', icon: LogOut, desc: 'Keluar asrama (hujung minggu)', gradient: 'from-violet-500 to-purple-500', bg: 'bg-gradient-to-br from-violet-50 to-purple-50', border: 'border-violet-200' },
  { id: 'pulang', label: 'Mohon Pulang Bermalam', shortLabel: 'Pulang Bermalam', icon: Home, desc: 'Pulang bermalam dengan penjaga', gradient: 'from-fuchsia-500 to-pink-500', bg: 'bg-gradient-to-br from-fuchsia-50 to-pink-50', border: 'border-fuchsia-200' },
  { id: 'leave', label: 'Mohon Keluar (Aktiviti Rasmi Maktab)', shortLabel: 'Aktiviti Rasmi Maktab', icon: CalendarCheck, desc: 'Pertandingan, lawatan, aktiviti', gradient: 'from-amber-500 to-orange-500', bg: 'bg-gradient-to-br from-amber-50 to-orange-50', border: 'border-amber-200' },
];

export default function PelajarHostelPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('requests');
  const [studentId, setStudentId] = useState('');
  const [studentInfo, setStudentInfo] = useState({ block_name: '', room_number: '' });
  const [olatBlock, setOlatBlock] = useState({ blocked: false, reason: '' });
  const [outingRequests, setOutingRequests] = useState([]);
  const [pulangRequests, setPulangRequests] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [leaveForm, setLeaveForm] = useState({
    kategori: 'pertandingan',
    tarikh_keluar: '',
    tarikh_pulang: '',
    sebab: '',
    pic_name: '',
    pic_phone: '',
    destinasi: '',
    vehicle_type: '',
    vehicle_plate: '',
    remarks: '',
  });
  const [leaveAttachments, setLeaveAttachments] = useState([]); // { url, filename }[]
  const [leaveUploading, setLeaveUploading] = useState(false);
  const [pbwPbpPeriods, setPbwPbpPeriods] = useState([]);

  const [outingForm, setOutingForm] = useState({
    tarikh_keluar: '',
    tarikh_pulang: '',
    sebab: '',
    destinasi: '',
    pic_name: '',
    pic_phone: '',
  });
  const [pulangForm, setPulangForm] = useState({
    tarikh_keluar: '',
    tarikh_pulang: '',
    sebab: '',
    cara_pulang: 'ibu_bapa',
    plate_number: '',
    transport_remarks: '',
    pic_name: '',
    pic_phone: '',
  });

  const loadStudentAndBlock = async () => {
    try {
      const [dashRes, blockRes] = await Promise.all([
        api.get('/api/dashboard/pelajar'),
        api.get('/api/hostel/my-olat-outing-block'),
      ]);
      if (dashRes.data?.student?.id) setStudentId(dashRes.data.student.id);
      setStudentInfo({
        block_name: dashRes.data?.student?.block_name ?? '',
        room_number: dashRes.data?.student?.room_number ?? '',
      });
      setOlatBlock(blockRes.data || { blocked: false, reason: '' });
    } catch {
      setOlatBlock({ blocked: false, reason: '' });
    }
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      const [outRes, pulangRes, leaveRes] = await Promise.all([
        api.get('/api/hostel/outing/requests'),
        api.get('/api/hostel/pulang-bermalam/requests'),
        api.get('/api/hostel/leave/requests'),
      ]);
      setOutingRequests(Array.isArray(outRes.data) ? outRes.data : []);
      setPulangRequests(Array.isArray(pulangRes.data) ? pulangRes.data : []);
      setLeaveRequests(Array.isArray(leaveRes.data) ? leaveRes.data : []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal muat permohonan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentAndBlock();
  }, []);

  useEffect(() => {
    if (user?.role === 'pelajar') loadRequests();
  }, [user?.role]);

  useEffect(() => {
    const year = new Date().getFullYear();
    api.get('/api/hostel/pbw-pbp-periods', { params: { year } })
      .then((res) => setPbwPbpPeriods(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPbwPbpPeriods([]));
  }, []);

  const getPulangPeriodHint = () => {
    const start = (pulangForm.tarikh_keluar || '').slice(0, 10);
    const end = (pulangForm.tarikh_pulang || '').slice(0, 10);
    if (!start || !end || pbwPbpPeriods.length === 0) return null;
    const matching = pbwPbpPeriods.filter(
      (p) => (start >= p.start_date && start <= p.end_date) || (end >= p.start_date && end <= p.end_date)
        || (p.start_date >= start && p.end_date <= end)
    );
    if (matching.length === 0) return null;
    return matching;
  };
  const pulangPeriodHint = getPulangPeriodHint();

  const addDaysStr = (dateStr, days) => {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const handlePbwPbpDateSelect = (mode, dateStr) => {
    if (mode === 'keluar') {
      setPulangForm((f) => ({
        ...f,
        tarikh_keluar: dateStr + 'T16:00',
        tarikh_pulang: addDaysStr(dateStr, 1) + 'T08:00',
      }));
    } else {
      setPulangForm((f) => ({ ...f, tarikh_pulang: dateStr + 'T08:00' }));
    }
  };

  const handleSubmitOuting = async (e) => {
    e.preventDefault();
    if (olatBlock.blocked) {
      toast.error(olatBlock.reason);
      return;
    }
    if (!outingForm.tarikh_keluar || !outingForm.tarikh_pulang || !outingForm.pic_name.trim()) {
      toast.error('Isi tarikh keluar, tarikh pulang dan nama Person In Charge.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/hostel/outing/request', {
        student_id: studentId || undefined,
        tarikh_keluar: outingForm.tarikh_keluar,
        tarikh_pulang: outingForm.tarikh_pulang,
        sebab: outingForm.sebab || 'Outing',
        destinasi: outingForm.destinasi || undefined,
        pic_name: outingForm.pic_name.trim(),
        pic_phone: outingForm.pic_phone || undefined,
      });
      toast.success('Permohonan outing berjaya dihantar.');
      setOutingForm({ tarikh_keluar: '', tarikh_pulang: '', sebab: '', destinasi: '', pic_name: '', pic_phone: '' });
      loadRequests();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal hantar permohonan outing');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitPulangBermalam = async (e) => {
    e.preventDefault();
    if (olatBlock.blocked) {
      toast.error(olatBlock.reason);
      return;
    }
    if (!pulangForm.tarikh_keluar || !pulangForm.tarikh_pulang || !pulangForm.pic_name.trim()) {
      toast.error('Isi tarikh keluar, tarikh pulang dan nama Person In Charge.');
      return;
    }
    const needsPlate = CARA_PULANG_NEEDS_PLATE.includes(pulangForm.cara_pulang);
    if (needsPlate && !(pulangForm.plate_number || '').trim()) {
      toast.error('Sila isi nombor plat kenderaan.');
      return;
    }
    const needsRemarks = CARA_PULANG_NEEDS_REMARKS.includes(pulangForm.cara_pulang);
    if (needsRemarks && !(pulangForm.transport_remarks || '').trim()) {
      toast.error(pulangForm.cara_pulang === 'bas' ? 'Sila isi catatan bas (contoh: nombor bas, syarikat).' : 'Sila nyatakan cara pulang (lain-lain).');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/hostel/pulang-bermalam/request', {
        student_id: studentId || undefined,
        tarikh_keluar: pulangForm.tarikh_keluar,
        tarikh_pulang: pulangForm.tarikh_pulang,
        sebab: pulangForm.sebab || 'Pulang bermalam',
        cara_pulang: pulangForm.cara_pulang,
        plate_number: (pulangForm.plate_number || '').trim() || undefined,
        transport_remarks: (pulangForm.transport_remarks || '').trim() || undefined,
        pic_name: pulangForm.pic_name.trim(),
        pic_phone: pulangForm.pic_phone || undefined,
      });
      toast.success('Permohonan pulang bermalam berjaya dihantar.');
      setPulangForm({
        tarikh_keluar: '', tarikh_pulang: '', sebab: '',
        cara_pulang: 'ibu_bapa', plate_number: '', transport_remarks: '',
        pic_name: '', pic_phone: '',
      });
      loadRequests();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gagal hantar permohonan pulang bermalam');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeaveFileSelect = async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;
  if (leaveAttachments.length + files.length > MAX_LEAVE_FILES) {
    toast.error(`Maksimum ${MAX_LEAVE_FILES} fail sahaja.`);
    return;
  }
  setLeaveUploading(true);
  try {
    for (const file of files) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        toast.error(`${file.name}: Hanya PDF atau imej (jpg, png, webp) dibenarkan.`);
        continue;
      }
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/hostel/leave/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setLeaveAttachments((prev) => [...prev, { url: res.data.url, filename: res.data.filename || file.name }]);
    }
    if (files.length > 0) toast.success('Fail dimuat naik. Sila hantar permohonan.');
  } catch (err) {
    toast.error(err.response?.data?.detail || 'Gagal muat naik fail');
  } finally {
    setLeaveUploading(false);
    e.target.value = '';
  }
};

const removeLeaveAttachment = (index) => {
  setLeaveAttachments((prev) => prev.filter((_, i) => i !== index));
};

const handleSubmitLeave = async (e) => {
  e.preventDefault();
  if (!leaveForm.tarikh_keluar || !leaveForm.tarikh_pulang || !leaveForm.pic_name.trim()) {
    toast.error('Isi tarikh keluar, tarikh pulang dan nama Person In Charge.');
    return;
  }
  setSubmitting(true);
  try {
    await api.post('/api/hostel/leave/request', {
      student_id: studentId || undefined,
      kategori: leaveForm.kategori,
      tarikh_keluar: leaveForm.tarikh_keluar,
      tarikh_pulang: leaveForm.tarikh_pulang,
      sebab: leaveForm.sebab || LEAVE_KATEGORI_OPTIONS.find((o) => o.value === leaveForm.kategori)?.label || leaveForm.kategori,
      pic_name: leaveForm.pic_name.trim(),
      pic_phone: leaveForm.pic_phone || undefined,
      destinasi: (leaveForm.destinasi || '').trim() || undefined,
      vehicle_type: (leaveForm.vehicle_type || '').trim() || undefined,
      vehicle_plate: (leaveForm.vehicle_plate || '').trim() || undefined,
      remarks: (leaveForm.remarks || '').trim() || undefined,
      attachments: leaveAttachments.map((a) => a.url),
    });
    toast.success('Permohonan keluar berjaya dihantar.');
    setLeaveForm({
      kategori: 'pertandingan', tarikh_keluar: '', tarikh_pulang: '', sebab: '',
      pic_name: '', pic_phone: '', destinasi: '', vehicle_type: '', vehicle_plate: '', remarks: '',
    });
    setLeaveAttachments([]);
    loadRequests();
  } catch (e) {
    toast.error(e.response?.data?.detail || 'Gagal hantar permohonan');
  } finally {
    setSubmitting(false);
  }
};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pastel-mint/20 to-pastel-lavender/20 -m-6 p-6 min-w-0 overflow-x-hidden" data-testid="pelajar-hostel-page">
      {/* Hero header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 via-violet-500 to-fuchsia-400 flex items-center justify-center shadow-lg shadow-violet-500/25">
            <DoorOpen className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-heading">Hostel</h1>
            <p className="text-slate-600 text-sm">Permohonan keluar asrama — outing, pulang bermalam & urusan lain</p>
          </div>
        </div>
        {(studentInfo.block_name || studentInfo.room_number) && (
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-xl bg-white/80 border border-pastel-lilac shadow-pastel-sm">
            <Building2 size={18} className="text-teal-600" />
            <span className="text-sm font-medium text-slate-700">Blok {studentInfo.block_name || '–'}</span>
            <span className="text-slate-400">·</span>
            <BedDouble size={16} className="text-violet-500" />
            <span className="text-sm font-medium text-slate-700">Bilik/Katil {studentInfo.room_number || '–'}</span>
          </div>
        )}
      </motion.div>

      {olatBlock.blocked && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-amber-50 border-amber-200 shadow-pastel-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="text-amber-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-amber-900">Tindakan OLAT – Outing & Pulang Bermalam Tidak Dibenarkan</h3>
                <p className="text-sm text-amber-700 mt-1">{olatBlock.reason}</p>
                {olatBlock.detention_end_date && (
                  <p className="text-sm font-medium text-amber-800 mt-2">
                    Boleh mohon outing selepas: <strong>{new Date(olatBlock.detention_end_date).toLocaleDateString('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong>.
                  </p>
                )}
                <p className="text-sm text-amber-600 mt-2">Permohonan pertandingan, lawatan, aktiviti, kecemasan, sakit atau program rasmi tetap dibenarkan.</p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Tab as beautiful action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        {TABS.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className={`rounded-2xl border-2 p-5 min-h-[44px] text-left transition-all shadow-md hover:shadow-xl ${tab === t.id ? `${t.border} ${t.bg} ring-2 ring-offset-2 ring-teal-400/50` : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'}`}
          >
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${t.gradient} flex items-center justify-center mb-3 shadow-lg`}>
              <t.icon className="text-white" size={24} />
            </div>
            <p className={`font-bold text-sm ${tab === t.id ? 'text-slate-900' : 'text-slate-800'}`}>{t.shortLabel}</p>
            <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
            <ChevronRight size={18} className={`mt-2 ${tab === t.id ? 'text-teal-600' : 'text-slate-400'}`} />
          </motion.button>
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        {tab === 'requests' && (
          <motion.div
            key="requests"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {loading ? (
              <div className="flex justify-center py-16">
                <Spinner size="lg" />
              </div>
            ) : (
              <>
                <Card className="overflow-hidden border-0 shadow-pastel bg-white">
                  <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-cyan-50">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <LogOut size={20} className="text-teal-600" /> Permohonan Outing
                    </h3>
                  </div>
                  <div className="p-6">
                    {outingRequests.length === 0 ? (
                      <div className="text-center py-10 text-slate-500">
                        <LogOut size={40} className="mx-auto text-slate-300 mb-2" />
                        <p>Tiada permohonan outing.</p>
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {outingRequests.map((r) => (
                          <li key={r.id} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/80 transition-colors">
                            <div>
                              <p className="font-semibold text-slate-900">{formatDateDMY(r.tarikh_keluar)} – {formatDateDMY(r.tarikh_pulang)}</p>
                              <p className="text-sm text-slate-500 mt-0.5">Person In Charge: {r.pic_name} {r.destinasi && `• ${r.destinasi}`}</p>
                            </div>
                            <HostelStatusBadge status={r.status} size="md" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>

                <Card className="overflow-hidden border-0 shadow-pastel bg-white">
                  <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-fuchsia-50 to-pink-50">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <Home size={20} className="text-fuchsia-600" /> Permohonan Pulang Bermalam
                    </h3>
                  </div>
                  <div className="p-6">
                    {pulangRequests.length === 0 ? (
                      <div className="text-center py-10 text-slate-500">
                        <Home size={40} className="mx-auto text-slate-300 mb-2" />
                        <p>Tiada permohonan pulang bermalam.</p>
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {pulangRequests.map((r) => (
                          <li key={r.id} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/80 transition-colors">
                            <div>
                              <p className="font-semibold text-slate-900">{formatDateDMY(r.tarikh_keluar)} – {formatDateDMY(r.tarikh_pulang)}</p>
                              <p className="text-sm text-slate-600 mt-0.5">
                                {CARA_PULANG_OPTIONS.find((o) => o.value === r.cara_pulang)?.label || r.cara_pulang || '–'}
                                {r.plate_number && ` · Plat: ${r.plate_number}`}
                                {r.transport_remarks && ` · ${r.transport_remarks}`}
                              </p>
                              <p className="text-sm text-slate-500">Person In Charge: {r.pic_name}</p>
                            </div>
                            <HostelStatusBadge status={r.status} size="md" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>

                <Card className="overflow-hidden border-0 shadow-pastel bg-white">
                  <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <CalendarCheck size={20} className="text-amber-600" /> Permohonan Keluar (Aktiviti Rasmi Maktab)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Pertandingan, lawatan, aktiviti, kecemasan, sakit, program rasmi</p>
                  </div>
                  <div className="p-6">
                    {leaveRequests.length === 0 ? (
                      <div className="text-center py-10 text-slate-500">
                        <CalendarCheck size={40} className="mx-auto text-slate-300 mb-2" />
                        <p>Tiada permohonan.</p>
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {leaveRequests.map((r) => (
                          <li key={r.id} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/80 transition-colors">
                            <div>
                              <p className="font-semibold text-slate-900">{LEAVE_KATEGORI_OPTIONS.find((o) => o.value === r.kategori)?.label || r.kategori} — {formatDateDMY(r.tarikh_keluar)} – {formatDateDMY(r.tarikh_pulang)}</p>
                              <p className="text-sm text-slate-600 mt-0.5">Guru (Person In Charge): {r.pic_name}{r.pic_phone ? ` · ${r.pic_phone}` : ''}</p>
                              {(r.destinasi || r.vehicle_plate || r.vehicle_type) && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {r.destinasi && `Lokasi: ${r.destinasi}`}
                                  {(r.vehicle_type || r.vehicle_plate) && ` · ${[r.vehicle_type, r.vehicle_plate].filter(Boolean).join(' ')}`}
                                </p>
                              )}
                              {r.leave_remarks && <p className="text-xs text-slate-500 mt-0.5">Catatan: {r.leave_remarks}</p>}
                              {r.attachments && r.attachments.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-slate-600 mb-1">Surat pengakuan:</p>
                                  <ul className="flex flex-wrap gap-2">
                                    {r.attachments.map((url, i) => (
                                      <li key={i}>
                                        <a href={url.startsWith('http') ? url : `${API_URL}${url}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-amber-700 hover:text-amber-800 underline">
                                          <Paperclip size={12} /> Fail {i + 1}
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                            <HostelStatusBadge status={r.status} size="md" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>
              </>
            )}
          </motion.div>
        )}

        {tab === 'outing' && (
          <motion.div
            key="outing"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="max-w-xl border-0 shadow-pastel overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-violet-500 to-purple-500 text-white">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <LogOut size={22} /> Mohon Outing
                </h3>
                <p className="text-white/90 text-sm mt-0.5">Keluar asrama (cth: hujung minggu) — isi tarikh & Person In Charge</p>
              </div>
              <form onSubmit={handleSubmitOuting} className="p-6 space-y-4">
                <Input label="Tarikh Keluar" type="datetime-local" value={outingForm.tarikh_keluar} onChange={(e) => setOutingForm((f) => ({ ...f, tarikh_keluar: e.target.value }))} required />
                <Input label="Tarikh Pulang" type="datetime-local" value={outingForm.tarikh_pulang} onChange={(e) => setOutingForm((f) => ({ ...f, tarikh_pulang: e.target.value }))} required />
                <Input label="Destinasi (pilihan)" value={outingForm.destinasi} onChange={(e) => setOutingForm((f) => ({ ...f, destinasi: e.target.value }))} placeholder="Contoh: Bandar" icon={MapPin} />
                <Input label="Sebab / Tujuan" value={outingForm.sebab} onChange={(e) => setOutingForm((f) => ({ ...f, sebab: e.target.value }))} placeholder="Contoh: Urusan keluarga" />
                <Input label="Nama Person In Charge (Penjaga)" value={outingForm.pic_name} onChange={(e) => setOutingForm((f) => ({ ...f, pic_name: e.target.value }))} required placeholder="Nama penjaga yang mengambil" icon={User} />
                <Input label="No. Telefon Person In Charge" type="tel" value={outingForm.pic_phone} onChange={(e) => setOutingForm((f) => ({ ...f, pic_phone: e.target.value }))} placeholder="01xxxxxxxx" icon={Phone} />
                <Button type="submit" disabled={submitting || olatBlock.blocked} className="w-full py-3.5 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2">
                  {submitting ? <Spinner size="sm" /> : <Send size={20} />}
                  {submitting ? 'Menghantar...' : 'Hantar Permohonan Outing'}
                </Button>
              </form>
            </Card>
          </motion.div>
        )}

        {tab === 'pulang' && (
          <motion.div
            key="pulang"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="max-w-xl border-0 shadow-pastel overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Home size={22} /> Mohon Pulang Bermalam
                </h3>
                <p className="text-white/90 text-sm mt-0.5">Pulang bermalam dengan penjaga — pilih cara pulang & isi Person In Charge</p>
              </div>
              <form onSubmit={handleSubmitPulangBermalam} className="p-6 space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <PbwPbpCalendar periods={pbwPbpPeriods} onSelectDate={handlePbwPbpDateSelect} />
                </div>
                {pulangPeriodHint && pulangPeriodHint.length > 0 && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                    <p className="font-semibold flex items-center gap-2"><FileText size={18} /> Berkaitan jadual asrama (PBW/PBP)</p>
                    <p className="mt-1">Tarikh pilihan anda jatuh dalam tempoh: {pulangPeriodHint.map((p) => `${p.label} (${formatDateDMY(p.start_date)} – ${formatDateDMY(p.end_date)})`).join('; ')}. Sila rujuk surat pekeliling maktab berkaitan PBP atau PBW.</p>
                  </div>
                )}
                {(studentInfo.block_name || studentInfo.room_number) && (
                  <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div><p className="text-xs text-slate-500">Blok</p><p className="font-semibold text-slate-800">{studentInfo.block_name || '–'}</p></div>
                    <div><p className="text-xs text-slate-500">Bilik/Katil</p><p className="font-semibold text-slate-800">{studentInfo.room_number || '–'}</p></div>
                  </div>
                )}
                <Input label="Tarikh Keluar" type="datetime-local" value={pulangForm.tarikh_keluar} onChange={(e) => setPulangForm((f) => ({ ...f, tarikh_keluar: e.target.value }))} required />
                <Input label="Tarikh Pulang" type="datetime-local" value={pulangForm.tarikh_pulang} onChange={(e) => setPulangForm((f) => ({ ...f, tarikh_pulang: e.target.value }))} required />
                <Input label="Sebab (pilihan)" value={pulangForm.sebab} onChange={(e) => setPulangForm((f) => ({ ...f, sebab: e.target.value }))} placeholder="Contoh: Cuti hujung minggu" />

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Cara pulang *</label>
                  <div className="space-y-2">
                    {CARA_PULANG_OPTIONS.map((opt) => (
                      <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${pulangForm.cara_pulang === opt.value ? 'border-fuchsia-400 bg-fuchsia-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <input type="radio" name="cara_pulang" value={opt.value} checked={pulangForm.cara_pulang === opt.value} onChange={() => setPulangForm((f) => ({ ...f, cara_pulang: opt.value }))} className="text-fuchsia-600 focus:ring-fuchsia-500" />
                        <span className="text-slate-800 text-sm font-medium">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {CARA_PULANG_NEEDS_PLATE.includes(pulangForm.cara_pulang) && (
                  <Input label="No. Plat Kenderaan" value={pulangForm.plate_number} onChange={(e) => setPulangForm((f) => ({ ...f, plate_number: e.target.value }))} placeholder="Contoh: BCC 1234" required icon={Car} />
                )}
                {pulangForm.cara_pulang === 'bas' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Catatan bas *</label>
                    <textarea value={pulangForm.transport_remarks} onChange={(e) => setPulangForm((f) => ({ ...f, transport_remarks: e.target.value }))} placeholder="Nombor bas, syarikat, masa berlepas (jika ada)" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-400 resize-none" rows={2} required />
                  </div>
                )}
                {pulangForm.cara_pulang === 'lain_lain' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nyatakan cara pulang *</label>
                    <textarea value={pulangForm.transport_remarks} onChange={(e) => setPulangForm((f) => ({ ...f, transport_remarks: e.target.value }))} placeholder="Contoh: Dijemput rakan, teksi, dll." className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-400 resize-none" rows={2} required />
                  </div>
                )}

                <Input label="Nama Person In Charge (Penjaga / Ibu Bapa)" value={pulangForm.pic_name} onChange={(e) => setPulangForm((f) => ({ ...f, pic_name: e.target.value }))} required placeholder="Nama penjaga yang mengambil" icon={User} />
                <Input label="No. Telefon Person In Charge" type="tel" value={pulangForm.pic_phone} onChange={(e) => setPulangForm((f) => ({ ...f, pic_phone: e.target.value }))} placeholder="01xxxxxxxx" icon={Phone} />
                <Button type="submit" disabled={submitting || olatBlock.blocked} className="w-full py-3.5 bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2">
                  {submitting ? <Spinner size="sm" /> : <Send size={20} />}
                  {submitting ? 'Menghantar...' : 'Hantar Permohonan Pulang Bermalam'}
                </Button>
              </form>
            </Card>
          </motion.div>
        )}

        {tab === 'leave' && (
          <motion.div
            key="leave"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="max-w-xl border-0 shadow-pastel overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <CalendarCheck size={22} /> Mohon Keluar (Aktiviti Rasmi Maktab)
                </h3>
                <p className="text-white/90 text-sm mt-0.5">Pertandingan, lawatan, aktiviti, kecemasan, sakit, program rasmi — dibenarkan walaupun under OLAT</p>
              </div>
              <form onSubmit={handleSubmitLeave} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Jenis Urusan *</label>
                  <select value={leaveForm.kategori} onChange={(e) => setLeaveForm((f) => ({ ...f, kategori: e.target.value }))} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-400 bg-white">
                    {LEAVE_KATEGORI_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <Input label="Tarikh Keluar" type="datetime-local" value={leaveForm.tarikh_keluar} onChange={(e) => setLeaveForm((f) => ({ ...f, tarikh_keluar: e.target.value }))} required />
                <Input label="Tarikh Pulang" type="datetime-local" value={leaveForm.tarikh_pulang} onChange={(e) => setLeaveForm((f) => ({ ...f, tarikh_pulang: e.target.value }))} required />
                <Input label="Sebab / Butiran" value={leaveForm.sebab} onChange={(e) => setLeaveForm((f) => ({ ...f, sebab: e.target.value }))} placeholder="Contoh: Pertandingan bola sepak peringkat negeri" />
                <Input label="Lokasi / Destinasi" value={leaveForm.destinasi} onChange={(e) => setLeaveForm((f) => ({ ...f, destinasi: e.target.value }))} placeholder="Tempat atau lokasi aktiviti" icon={MapPin} />
                <Input label="Nama Guru (Person In Charge)" value={leaveForm.pic_name} onChange={(e) => setLeaveForm((f) => ({ ...f, pic_name: e.target.value }))} required placeholder="Nama guru pengiring / person in charge" icon={User} />
                <Input label="No. Telefon Guru (Person In Charge)" type="tel" value={leaveForm.pic_phone} onChange={(e) => setLeaveForm((f) => ({ ...f, pic_phone: e.target.value }))} placeholder="01xxxxxxxx" icon={Phone} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Jenis Kenderaan</label>
                    <select value={leaveForm.vehicle_type} onChange={(e) => setLeaveForm((f) => ({ ...f, vehicle_type: e.target.value }))} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-400 bg-white">
                      <option value="">Pilih (pilihan)</option>
                      <option value="kereta">Kereta</option>
                      <option value="bas">Bas</option>
                      <option value="van">Van</option>
                    </select>
                  </div>
                  <Input label="No. Plat" value={leaveForm.vehicle_plate} onChange={(e) => setLeaveForm((f) => ({ ...f, vehicle_plate: e.target.value }))} placeholder="BCC 1234" icon={Car} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Catatan (pilihan)</label>
                  <textarea value={leaveForm.remarks} onChange={(e) => setLeaveForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="Lokasi tambahan, butiran kenderaan atau catatan lain" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-400 resize-none bg-white" rows={2} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Surat pengakuan kebenaran ibu bapa (PDF atau imej, maks. 5 fail)</label>
                  <input
                    type="file"
                    accept={ACCEPT_LEAVE_FILES}
                    multiple
                    onChange={handleLeaveFileSelect}
                    disabled={leaveUploading || leaveAttachments.length >= MAX_LEAVE_FILES}
                    className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-amber-100 file:text-amber-800"
                  />
                  {leaveAttachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {leaveAttachments.map((a, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <FileCheck size={14} className="text-emerald-600" />
                          <span className="text-slate-700 truncate flex-1">{a.filename}</span>
                          <button type="button" onClick={() => removeLeaveAttachment(i)} className="text-red-600 hover:text-red-700 min-w-[44px] min-h-[44px] inline-flex items-center justify-center p-2">
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Button type="submit" disabled={submitting} className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2">
                  {submitting ? <Spinner size="sm" /> : <Send size={20} />}
                  {submitting ? 'Menghantar...' : 'Hantar Permohonan'}
                </Button>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
