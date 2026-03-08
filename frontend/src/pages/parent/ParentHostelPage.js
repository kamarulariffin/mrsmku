import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  DoorOpen, Home, FileText, ClipboardList, Send, Users,
  LogOut, CalendarCheck, User, Phone, MapPin, Car, FileCheck, X, AlertTriangle, Heart, Copy,
} from 'lucide-react';
import api, { API_URL } from '../../services/api';
import { Card, Button, Input, Spinner } from '../../components/common';
import { HostelStatusBadge, PbwPbpCalendar } from '../../components/hostel';
import { LEAVE_KATEGORI_OPTIONS, LEAVE_KATEGORI_OPTIONS_URUSAN_LAIN, CARA_PULANG_OPTIONS, CARA_PULANG_NEEDS_PLATE, CARA_PULANG_NEEDS_REMARKS, MAX_LEAVE_FILES, ACCEPT_LEAVE_FILES, STATUS_MAP, formatDateDMY } from '../../constants/hostel';

const REQUESTED_BY_LABEL = { pelajar: 'Pelajar', parent: 'Ibu Bapa', warden: 'Warden' };
const whoRequested = (role) => REQUESTED_BY_LABEL[role] || role || '–';

export default function ParentHostelPage() {
  const location = useLocation();
  const isPermohonan = location.pathname === '/hostel/permohonan';

  const [children, setChildren] = useState([]);
  const [presenceOuting, setPresenceOuting] = useState([]);
  const [presencePulang, setPresencePulang] = useState([]);
  const [presenceLeave, setPresenceLeave] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedChildId, setSelectedChildId] = useState('');
  const [selectedPulangChildIds, setSelectedPulangChildIds] = useState([]);
  const [permohonanType, setPermohonanType] = useState('outing');
  const [outingForm, setOutingForm] = useState({ tarikh_keluar: '', tarikh_pulang: '', sebab: '', destinasi: '', pic_name: '', pic_phone: '' });
  const [pulangForm, setPulangForm] = useState({ tarikh_keluar: '', tarikh_pulang: '', sebab: '', cara_pulang: 'ibu_bapa', plate_number: '', transport_remarks: '', pic_name: '', pic_phone: '' });
  const [leaveForm, setLeaveForm] = useState({ kategori: 'pertandingan', tarikh_keluar: '', tarikh_pulang: '', sebab: '', pic_name: '', pic_phone: '', destinasi: '', vehicle_type: '', vehicle_plate: '', remarks: '' });
  const [leaveAttachments, setLeaveAttachments] = useState([]);
  const [leaveUploading, setLeaveUploading] = useState(false);
  const [emergencyForm, setEmergencyForm] = useState({ tarikh_keluar: '', tarikh_pulang: '', sebab: '', pic_name: '', pic_phone: '', destinasi: '', vehicle_type: '', vehicle_plate: '', remarks: '' });
  const [emergencyAttachments, setEmergencyAttachments] = useState([]);
  const [emergencyUploading, setEmergencyUploading] = useState(false);
  const [sickForm, setSickForm] = useState({ tarikh_keluar: '', tarikh_pulang: '', sebab: '', pic_name: '', pic_phone: '', destinasi: '', vehicle_type: '', vehicle_plate: '', remarks: '', lokasi_type: 'klinik', lokasi_name: '' });
  const [sickAttachments, setSickAttachments] = useState([]);
  const [sickUploading, setSickUploading] = useState(false);
  const [pbwPbpPeriods, setPbwPbpPeriods] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [olatRes, outRes, pulangRes, leaveRes] = await Promise.all([
        api.get('/api/hostel/olat-status-children').catch(() => ({ data: { children: [] } })),
        api.get('/api/hostel/outing/requests').catch(() => ({ data: [] })),
        api.get('/api/hostel/pulang-bermalam/requests').catch(() => ({ data: [] })),
        api.get('/api/hostel/leave/requests').catch(() => ({ data: [] })),
      ]);
      const childList = Array.isArray(olatRes.data?.children) ? olatRes.data.children : [];
      setChildren(childList);
      setPresenceOuting(Array.isArray(outRes.data) ? outRes.data : []);
      setPresencePulang(Array.isArray(pulangRes.data) ? pulangRes.data : []);
      setPresenceLeave(Array.isArray(leaveRes.data) ? leaveRes.data : []);
      setSelectedChildId((prev) => (childList.length === 1 && !prev ? childList[0].student_id : prev));
    } catch (e) {
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (children.length === 1) setSelectedChildId(children[0].student_id);
  }, [children.length, children]);

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
    const fmt = (s) => s && new Date(s + 'T12:00:00').toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' });
    if (mode === 'keluar') {
      const period = (pbwPbpPeriods || []).find((p) => dateStr >= p.start_date && dateStr <= p.end_date);
      const defaultPulang = period ? period.end_date + 'T08:00' : addDaysStr(dateStr, 1) + 'T08:00';
      setPulangForm((f) => ({
        ...f,
        tarikh_keluar: dateStr + 'T16:00',
        tarikh_pulang: defaultPulang,
      }));
      toast.success(`Tarikh Keluar dipilih: ${fmt(dateStr)}. Tarikh Pulang lalai: ${fmt(period ? period.end_date : addDaysStr(dateStr, 1))}. Klik kalendar untuk pilih tarikh pulang lain jika perlu.`);
    } else {
      setPulangForm((f) => ({ ...f, tarikh_pulang: dateStr + 'T08:00' }));
      toast.success(`Tarikh Pulang dipilih: ${fmt(dateStr)}.`);
    }
  };

  const handleSubmitOuting = async (e) => {
    e.preventDefault();
    if (!selectedChildId) { toast.error('Sila pilih anak.'); return; }
    if (!outingForm.tarikh_keluar || !outingForm.tarikh_pulang || !outingForm.pic_name?.trim()) {
      toast.error('Isi tarikh keluar, tarikh pulang dan nama Person In Charge.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/hostel/outing/request', { student_id: selectedChildId, ...outingForm });
      toast.success('Permohonan outing berjaya dihantar.');
      setOutingForm({ tarikh_keluar: '', tarikh_pulang: '', sebab: '', destinasi: '', pic_name: '', pic_phone: '' });
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal hantar permohonan');
    } finally { setSubmitting(false); }
  };

  const handleSubmitPulang = async (e) => {
    e.preventDefault();
    const idsToSubmit = children.length === 1
      ? [children[0].student_id]
      : selectedPulangChildIds.filter((id) => id);
    if (!idsToSubmit.length) {
      toast.error(children.length > 1 ? 'Sila pilih sekurang-kurangnya seorang anak.' : 'Sila pilih anak.');
      return;
    }
    if (!pulangForm.tarikh_keluar || !pulangForm.tarikh_pulang || !pulangForm.pic_name?.trim()) {
      toast.error('Isi tarikh keluar, tarikh pulang dan nama Person In Charge.');
      return;
    }
    if (CARA_PULANG_NEEDS_PLATE.includes(pulangForm.cara_pulang) && !(pulangForm.plate_number || '').trim()) {
      toast.error('Sila isi nombor plat kenderaan.');
      return;
    }
    if (CARA_PULANG_NEEDS_REMARKS.includes(pulangForm.cara_pulang) && !(pulangForm.transport_remarks || '').trim()) {
      toast.error(pulangForm.cara_pulang === 'bas' ? 'Sila isi catatan bas (contoh: nombor bas, syarikat).' : 'Sila nyatakan cara pulang (lain-lain).');
      return;
    }
    const payload = {
      tarikh_keluar: pulangForm.tarikh_keluar,
      tarikh_pulang: pulangForm.tarikh_pulang,
      sebab: pulangForm.sebab,
      cara_pulang: pulangForm.cara_pulang,
      plate_number: pulangForm.plate_number || undefined,
      transport_remarks: pulangForm.transport_remarks || undefined,
      pic_name: pulangForm.pic_name.trim(),
      pic_phone: pulangForm.pic_phone || undefined,
    };
    setSubmitting(true);
    let ok = 0;
    let errMsg = null;
    try {
      for (const studentId of idsToSubmit) {
        try {
          await api.post('/api/hostel/pulang-bermalam/request', { student_id: studentId, ...payload });
          ok += 1;
        } catch (err) {
          errMsg = err.response?.data?.detail || 'Gagal hantar permohonan.';
        }
      }
      if (ok > 0) {
        toast.success(ok === idsToSubmit.length
          ? (ok === 1 ? 'Permohonan pulang bermalam berjaya dihantar.' : `Permohonan pulang bermalam berjaya dihantar untuk ${ok} orang anak.`)
          : `Permohonan dihantar untuk ${ok} orang anak.${errMsg ? ` Sebahagian gagal: ${errMsg}` : ''}`);
        setPulangForm({ tarikh_keluar: '', tarikh_pulang: '', sebab: '', cara_pulang: 'ibu_bapa', plate_number: '', transport_remarks: '', pic_name: '', pic_phone: '' });
        setSelectedPulangChildIds([]);
        loadData();
      }
      if (errMsg && ok === 0) toast.error(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeaveFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (leaveAttachments.length + files.length > MAX_LEAVE_FILES) { toast.error(`Maksimum ${MAX_LEAVE_FILES} fail.`); return; }
    setLeaveUploading(true);
    try {
      for (const file of files) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) continue;
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/api/hostel/leave/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setLeaveAttachments((prev) => [...prev, { url: res.data.url, filename: res.data.filename || file.name }]);
      }
      if (files.length) toast.success('Fail dimuat naik.');
    } catch (err) { toast.error(err.response?.data?.detail || 'Gagal muat naik'); }
    finally { setLeaveUploading(false); e.target.value = ''; }
  };

  const handleEmergencyFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (emergencyAttachments.length + files.length > MAX_LEAVE_FILES) { toast.error(`Maksimum ${MAX_LEAVE_FILES} fail.`); return; }
    setEmergencyUploading(true);
    try {
      for (const file of files) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) continue;
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/api/hostel/leave/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setEmergencyAttachments((prev) => [...prev, { url: res.data.url, filename: res.data.filename || file.name }]);
      }
      if (files.length) toast.success('Fail dimuat naik.');
    } catch (err) { toast.error(err.response?.data?.detail || 'Gagal muat naik'); }
    finally { setEmergencyUploading(false); e.target.value = ''; }
  };

  const handleSubmitEmergency = async (e) => {
    e.preventDefault();
    if (!selectedChildId) { toast.error('Sila pilih anak.'); return; }
    if (!emergencyForm.tarikh_keluar || !emergencyForm.tarikh_pulang || !emergencyForm.pic_name?.trim()) {
      toast.error('Isi tarikh keluar, tarikh pulang dan nama Person In Charge.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/hostel/leave/request', {
        student_id: selectedChildId,
        kategori: 'kecemasan',
        tarikh_keluar: emergencyForm.tarikh_keluar,
        tarikh_pulang: emergencyForm.tarikh_pulang,
        sebab: emergencyForm.sebab || 'Kecemasan',
        pic_name: emergencyForm.pic_name.trim(),
        pic_phone: emergencyForm.pic_phone || undefined,
        destinasi: (emergencyForm.destinasi || '').trim() || undefined,
        vehicle_type: (emergencyForm.vehicle_type || '').trim() || undefined,
        vehicle_plate: (emergencyForm.vehicle_plate || '').trim() || undefined,
        remarks: (emergencyForm.remarks || '').trim() || undefined,
        attachments: emergencyAttachments.map((a) => a.url),
      });
      toast.success('Permohonan kecemasan berjaya dihantar.');
      setEmergencyForm({ tarikh_keluar: '', tarikh_pulang: '', sebab: '', pic_name: '', pic_phone: '', destinasi: '', vehicle_type: '', vehicle_plate: '', remarks: '' });
      setEmergencyAttachments([]);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal hantar permohonan');
    } finally { setSubmitting(false); }
  };

  const handleSickFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (sickAttachments.length + files.length > MAX_LEAVE_FILES) { toast.error(`Maksimum ${MAX_LEAVE_FILES} fail.`); return; }
    setSickUploading(true);
    try {
      for (const file of files) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) continue;
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/api/hostel/leave/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setSickAttachments((prev) => [...prev, { url: res.data.url, filename: res.data.filename || file.name }]);
      }
      if (files.length) toast.success('Fail dimuat naik.');
    } catch (err) { toast.error(err.response?.data?.detail || 'Gagal muat naik'); }
    finally { setSickUploading(false); e.target.value = ''; }
  };

  const handleSubmitSick = async (e) => {
    e.preventDefault();
    if (!selectedChildId) { toast.error('Sila pilih anak.'); return; }
    if (!sickForm.tarikh_keluar || !sickForm.tarikh_pulang || !sickForm.pic_name?.trim()) {
      toast.error('Isi tarikh keluar, tarikh pulang dan nama Person In Charge.');
      return;
    }
    if (!(sickForm.lokasi_name || '').trim()) {
      toast.error('Sila nyatakan nama klinik atau hospital.');
      return;
    }
    if (sickAttachments.length === 0) {
      toast.error('Wajib muat naik surat temujanji / MC.');
      return;
    }
    setSubmitting(true);
    try {
      const lokasiLabel = sickForm.lokasi_type === 'hospital' ? 'Hospital' : 'Klinik';
      const lokasiText = `${lokasiLabel}: ${(sickForm.lokasi_name || '').trim()}`;
      const remarks = [lokasiText, (sickForm.remarks || '').trim()].filter(Boolean).join(' | ');
      await api.post('/api/hostel/leave/request', {
        student_id: selectedChildId,
        kategori: 'sakit',
        tarikh_keluar: sickForm.tarikh_keluar,
        tarikh_pulang: sickForm.tarikh_pulang,
        sebab: sickForm.sebab || 'Rawatan kesihatan',
        pic_name: sickForm.pic_name.trim(),
        pic_phone: sickForm.pic_phone || undefined,
        destinasi: (sickForm.destinasi || '').trim() || undefined,
        vehicle_type: (sickForm.vehicle_type || '').trim() || undefined,
        vehicle_plate: (sickForm.vehicle_plate || '').trim() || undefined,
        remarks: remarks || undefined,
        attachments: sickAttachments.map((a) => a.url),
      });
      toast.success('Permohonan rawatan kesihatan berjaya dihantar.');
      setSickForm({ tarikh_keluar: '', tarikh_pulang: '', sebab: '', pic_name: '', pic_phone: '', destinasi: '', vehicle_type: '', vehicle_plate: '', remarks: '', lokasi_type: 'klinik', lokasi_name: '' });
      setSickAttachments([]);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal hantar permohonan');
    } finally { setSubmitting(false); }
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    if (!selectedChildId) { toast.error('Sila pilih anak.'); return; }
    if (!leaveForm.tarikh_keluar || !leaveForm.tarikh_pulang || !leaveForm.pic_name?.trim()) {
      toast.error('Isi tarikh keluar, tarikh pulang dan nama Person In Charge.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/hostel/leave/request', {
        student_id: selectedChildId,
        kategori: leaveForm.kategori,
        tarikh_keluar: leaveForm.tarikh_keluar,
        tarikh_pulang: leaveForm.tarikh_pulang,
        sebab: leaveForm.sebab || LEAVE_KATEGORI_OPTIONS.find((o) => o.value === leaveForm.kategori)?.label,
        pic_name: leaveForm.pic_name.trim(),
        pic_phone: leaveForm.pic_phone || undefined,
        destinasi: (leaveForm.destinasi || '').trim() || undefined,
        vehicle_type: (leaveForm.vehicle_type || '').trim() || undefined,
        vehicle_plate: (leaveForm.vehicle_plate || '').trim() || undefined,
        remarks: (leaveForm.remarks || '').trim() || undefined,
        attachments: leaveAttachments.map((a) => a.url),
      });
      toast.success('Permohonan keluar berjaya dihantar.');
      setLeaveForm({ kategori: 'pertandingan', tarikh_keluar: '', tarikh_pulang: '', sebab: '', pic_name: '', pic_phone: '', destinasi: '', vehicle_type: '', vehicle_plate: '', remarks: '' });
      setLeaveAttachments([]);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal hantar permohonan');
    } finally { setSubmitting(false); }
  };

  const selectedChild = children.find((c) => c.student_id === selectedChildId);
  const getPermohonanSummary = (studentId) => {
    const outings = presenceOuting.filter((r) => r.student_id === studentId);
    const pulangs = presencePulang.filter((r) => r.student_id === studentId);
    const leaves = presenceLeave.filter((r) => r.student_id === studentId);
    const items = [];
    if (outings.length) items.push({ cat: 'Outing', status: outings[outings.length - 1].status });
    if (pulangs.length) items.push({ cat: 'Pulang Bermalam', status: pulangs[pulangs.length - 1].status });
    if (leaves.length) items.push({ cat: 'Aktiviti Rasmi', status: leaves[leaves.length - 1].status });
    return items;
  };

  const formatOlatEndDate = (d) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return day && m && y ? `${day}/${m}/${y}` : d;
  };

  const childMap = {};
  children.forEach((c) => { childMap[c.student_id] = { student_id: c.student_id, name: c.student_name, matric: c.matric_number || '' }; });
  [...presenceOuting, ...presencePulang, ...presenceLeave].forEach((r) => {
    if (!childMap[r.student_id]) childMap[r.student_id] = { student_id: r.student_id, name: r.student_name || '', matric: r.student_matric || r.matric_number || '' };
  });
  const childrenList = Object.values(childMap).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 via-violet-500 to-fuchsia-400 flex items-center justify-center shadow-lg">
          <DoorOpen className="text-white" size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-heading">Hostel</h1>
          <p className="text-slate-600 text-sm">Laporan keberadaan anak & permohonan keluar asrama</p>
        </div>
      </motion.div>

      {/* Internal nav */}
      <div className="flex gap-2 border-b border-slate-200">
        <Link
          to="/hostel"
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-medium text-sm transition-colors ${!isPermohonan ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <ClipboardList size={18} />
          Laporan Keberadaan
        </Link>
        <Link
          to="/hostel/permohonan"
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-medium text-sm transition-colors ${isPermohonan ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Send size={18} />
          Permohonan Keluar
        </Link>
      </div>

      <AnimatePresence mode="wait">
        {!isPermohonan ? (
          <motion.div key="laporan" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList className="text-teal-600" size={22} />
              Laporan Keberadaan Pelajar (Anak)
            </h2>
            <p className="text-sm text-slate-600">Status keluar asrama: outing, pulang bermalam dan keluar urusan lain.</p>
            {loading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : childrenList.length === 0 ? (
              <Card><p className="text-center py-8 text-slate-500">Tiada rekod anak. Daftarkan anak di Anak Saya.</p></Card>
            ) : (presenceOuting.length === 0 && presencePulang.length === 0 && presenceLeave.length === 0) ? (
              <Card><p className="text-center py-8 text-slate-500">Tiada rekod keluar asrama untuk anak anda.</p></Card>
            ) : (
              childrenList.map((child) => {
                const outings = presenceOuting.filter((r) => r.student_id === child.student_id);
                const pulangs = presencePulang.filter((r) => r.student_id === child.student_id);
                const leaves = presenceLeave.filter((r) => r.student_id === child.student_id);
                if (outings.length === 0 && pulangs.length === 0 && leaves.length === 0) return null;
                return (
                  <Card key={child.student_id} className="border-pastel-mint/50 bg-gradient-to-r from-white to-pastel-mint/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="text-teal-600" size={20} />
                      <h3 className="font-semibold text-slate-800">{child.name || 'Anak'}</h3>
                      {child.matric && <span className="text-sm text-slate-500">({child.matric})</span>}
                    </div>
                    <div className="grid md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="font-medium text-slate-600 mb-1 flex items-center gap-1"><DoorOpen size={14} /> Outing</p>
                        {outings.length === 0 ? <p className="text-slate-400">Tiada rekod</p> : (
                          <ul className="space-y-2">
                            {outings.slice(0, 5).map((o) => (
                              <li key={o.id} className="text-slate-700 text-sm">
                                <span>{o.tarikh_keluar && formatDateDMY(o.tarikh_keluar)} – {o.tarikh_pulang && formatDateDMY(o.tarikh_pulang)}</span>
                                <span className="ml-1"><HostelStatusBadge status={o.status} /></span>
                                <p className="text-xs text-slate-500 mt-0.5">Mohon oleh: {whoRequested(o.requested_by_role)}</p>
                              </li>
                            ))}
                            {outings.length > 5 && <li className="text-slate-500">+{outings.length - 5} lagi</li>}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-slate-600 mb-1 flex items-center gap-1"><Home size={14} /> Pulang Bermalam</p>
                        {pulangs.length === 0 ? <p className="text-slate-400">Tiada rekod</p> : (
                          <ul className="space-y-2">
                            {pulangs.slice(0, 5).map((p) => (
                              <li key={p.id} className="text-slate-700 text-sm">
                                <span>{p.tarikh_keluar && formatDateDMY(p.tarikh_keluar)} – {p.tarikh_pulang && formatDateDMY(p.tarikh_pulang)}</span>
                                <span className="ml-1"><HostelStatusBadge status={p.status} /></span>
                                <p className="text-xs text-slate-500 mt-0.5">Mohon oleh: {whoRequested(p.requested_by_role)}</p>
                              </li>
                            ))}
                            {pulangs.length > 5 && <li className="text-slate-500">+{pulangs.length - 5} lagi</li>}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-slate-600 mb-1 flex items-center gap-1"><FileText size={14} /> Aktiviti Rasmi Maktab</p>
                        {leaves.length === 0 ? <p className="text-slate-400">Tiada rekod</p> : (
                          <ul className="space-y-2">
                            {leaves.slice(0, 5).map((l) => (
                              <li key={l.id} className="text-slate-700 text-sm">
                                <span>{l.kategori && <span className="text-slate-500">{l.kategori.replace(/_/g, ' ')} · </span>}{l.tarikh_keluar && formatDateDMY(l.tarikh_keluar)} – {l.tarikh_pulang && formatDateDMY(l.tarikh_pulang)}</span>
                                <span className="ml-1"><HostelStatusBadge status={l.status} /></span>
                                <p className="text-xs text-slate-500 mt-0.5">Mohon oleh: {whoRequested(l.requested_by_role)}</p>
                                {l.attachments && l.attachments.length > 0 && (
                                  <p className="text-xs text-slate-600 mt-1">Fail: {l.attachments.map((url, i) => (
                                    <a key={i} href={url.startsWith('http') ? url : `${API_URL}${url}`} target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline mr-1">Fail {i + 1}</a>
                                  ))}</p>
                                )}
                              </li>
                            ))}
                            {leaves.length > 5 && <li className="text-slate-500">+{leaves.length - 5} lagi</li>}
                          </ul>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </motion.div>
        ) : (
          <motion.div key="permohonan" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-6">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Send className="text-teal-600" size={22} />
              Permohonan Keluar Asrama untuk Anak
            </h2>
            {loading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : children.length === 0 ? (
              <Card><p className="text-center py-8 text-slate-500">Tiada anak didaftarkan. Sila daftar anak di <Link to="/children" className="text-teal-600 underline">Anak Saya</Link>.</p></Card>
            ) : (
              <>
                <Card className="p-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Pilih anak</label>
                  {children.length === 1 ? (
                    <div className="rounded-xl border-2 border-teal-200 bg-teal-50/50 p-5">
                      <p className="text-xl font-bold text-slate-800">{children[0].student_name}</p>
                      <p className="text-slate-600 mt-1">No. Matrik: <span className="font-semibold text-slate-800">{children[0].matric_number || '–'}</span></p>
                      <p className="text-slate-600">No. Kad Pengenalan: <span className="font-semibold text-slate-800">{children[0].ic_number || '–'}</span></p>
                      {children[0].blocked ? (
                        <p className="mt-3 text-amber-800 text-sm font-medium bg-amber-100 rounded-lg px-3 py-2">Dikenakan OLAT. Outing tidak dibenarkan sehingga {formatOlatEndDate(children[0].detention_end_date) || 'tarikh yang ditetapkan warden'}.</p>
                      ) : (
                        <p className="mt-3 text-emerald-700 text-sm bg-emerald-50 rounded-lg px-3 py-2">Boleh mohon outing.</p>
                      )}
                      {getPermohonanSummary(children[0].student_id).length > 0 && (
                        <p className="mt-3 text-slate-600 text-sm">Permohonan: {getPermohonanSummary(children[0].student_id).map(({ cat, status }) => `${cat} (${STATUS_MAP[status]?.label || status})`).join(' · ')}</p>
                      )}
                    </div>
                  ) : permohonanType === 'pulang' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-500 mb-2">Pilih anak yang akan pulang bermalam (tak semestinya semua). Boleh pilih lebih daripada seorang; hantar sekali sahaja untuk semua yang dipilih.</p>
                      {children.map((c) => {
                        const isSelected = selectedPulangChildIds.includes(c.student_id);
                        return (
                          <label key={c.student_id} className="flex items-center gap-3 p-3 rounded-xl border-2 border-slate-200 hover:border-teal-300 cursor-pointer has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50 transition-all">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedPulangChildIds((prev) =>
                                  prev.includes(c.student_id)
                                    ? prev.filter((id) => id !== c.student_id)
                                    : [...prev, c.student_id]
                                );
                              }}
                              className="text-teal-600 focus:ring-teal-500 rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-slate-800">{c.student_name}</span>
                              {c.matric_number && <span className="text-slate-500 text-sm ml-1">({c.matric_number})</span>}
                              <p className="text-slate-500 text-xs mt-0.5">Pulang bermalam</p>
                              {getPermohonanSummary(c.student_id).filter((x) => x.cat === 'Pulang Bermalam').length > 0 && (
                                <p className="text-slate-500 text-xs mt-0.5">Permohonan: {getPermohonanSummary(c.student_id).filter((x) => x.cat === 'Pulang Bermalam').map(({ status }) => STATUS_MAP[status]?.label || status).join(' · ')}</p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-500 mb-2">Satu permohonan untuk satu anak sahaja.</p>
                      {children.map((c) => (
                        <label key={c.student_id} className="flex items-center gap-3 p-3 rounded-xl border-2 border-slate-200 hover:border-teal-300 cursor-pointer has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50 transition-all">
                          <input
                            type="radio"
                            name="pilih_anak"
                            value={c.student_id}
                            checked={selectedChildId === c.student_id}
                            onChange={() => setSelectedChildId(c.student_id)}
                            className="text-teal-600 focus:ring-teal-500"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-slate-800">{c.student_name}</span>
                            {c.matric_number && <span className="text-slate-500 text-sm ml-1">({c.matric_number})</span>}
                            {c.blocked ? (
                              <p className="text-amber-700 text-xs mt-1">OLAT sehingga {formatOlatEndDate(c.detention_end_date) || '–'} · Outing tidak dibenarkan</p>
                            ) : (
                              <p className="text-emerald-600 text-xs mt-1">Boleh mohon outing</p>
                            )}
                            {getPermohonanSummary(c.student_id).length > 0 && (
                              <p className="text-slate-500 text-xs mt-0.5">Permohonan: {getPermohonanSummary(c.student_id).map(({ cat, status }) => `${cat} (${STATUS_MAP[status]?.label || status})`).join(' · ')}</p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </Card>

                <div className="flex gap-2 flex-wrap">
                  {['outing', 'pulang', 'kecemasan', 'sakit', 'leave'].map((type) => {
                    const isOuting = type === 'outing';
                    const outingBlocked = isOuting && selectedChild?.blocked;
                    return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        if (outingBlocked) return;
                        setPermohonanType(type);
                        if (type === 'pulang' && children.length > 1 && selectedPulangChildIds.length === 0 && selectedChildId) {
                          setSelectedPulangChildIds([selectedChildId]);
                        }
                      }}
                      disabled={outingBlocked}
                      title={outingBlocked ? `Outing tidak dibenarkan sehingga ${formatOlatEndDate(selectedChild?.detention_end_date) || 'tarikh akhir OLAT'}` : undefined}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-medium text-sm transition-all ${outingBlocked ? 'cursor-not-allowed border-red-300 bg-red-50 text-red-700' : permohonanType === type ? 'border-teal-500 bg-teal-50 text-teal-800' : type === 'kecemasan' ? 'border-red-200 bg-white text-slate-600 hover:border-red-300 hover:bg-red-50' : type === 'sakit' ? 'border-amber-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                    >
                      {type === 'outing' && <LogOut size={18} />}
                      {type === 'pulang' && <Home size={18} />}
                      {type === 'kecemasan' && <AlertTriangle size={18} className="text-red-500" />}
                      {type === 'sakit' && <Heart size={18} className="text-amber-600" />}
                      {type === 'leave' && <CalendarCheck size={18} />}
                      {type === 'outing' && 'Outing'}
                      {type === 'pulang' && 'Pulang Bermalam (Wajib=PBW/Pilihan=PBP)'}
                      {type === 'kecemasan' && 'Kecemasan'}
                      {type === 'sakit' && 'Rawatan Kesihatan'}
                      {type === 'leave' && 'Aktiviti Rasmi Maktab'}
                    </button>
                    );
                  })}
                </div>

                {permohonanType === 'outing' && (
                  <Card className="p-6">
                    <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><LogOut size={20} /> Mohon Outing</h3>
                    {selectedChild?.blocked && (
                      <div className="mb-4 p-4 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 text-sm">
                        <p className="font-semibold">Outing tidak dibenarkan</p>
                        <p className="mt-1">Anak ini dikenakan OLAT sehingga {formatOlatEndDate(selectedChild.detention_end_date) || 'tarikh yang ditetapkan warden'}. Butang Outing akan dibuka selepas tarikh tersebut.</p>
                      </div>
                    )}
                    <form onSubmit={handleSubmitOuting} className="space-y-4 max-w-xl">
                      <Input label="Tarikh Keluar" type="datetime-local" value={outingForm.tarikh_keluar} onChange={(e) => setOutingForm((f) => ({ ...f, tarikh_keluar: e.target.value }))} required />
                      <Input label="Tarikh Pulang" type="datetime-local" value={outingForm.tarikh_pulang} onChange={(e) => setOutingForm((f) => ({ ...f, tarikh_pulang: e.target.value }))} required />
                      <Input label="Destinasi (pilihan)" value={outingForm.destinasi} onChange={(e) => setOutingForm((f) => ({ ...f, destinasi: e.target.value }))} icon={MapPin} />
                      <Input label="Sebab / Tujuan" value={outingForm.sebab} onChange={(e) => setOutingForm((f) => ({ ...f, sebab: e.target.value }))} />
                      <Input label="Nama Person In Charge (Penjaga)" value={outingForm.pic_name} onChange={(e) => setOutingForm((f) => ({ ...f, pic_name: e.target.value }))} required icon={User} />
                      <Input label="No. Telefon Person In Charge" type="tel" value={outingForm.pic_phone} onChange={(e) => setOutingForm((f) => ({ ...f, pic_phone: e.target.value }))} icon={Phone} />
                      <Button type="submit" disabled={submitting || selectedChild?.blocked}>{submitting ? <Spinner size="sm" /> : <Send size={16} />} Hantar Permohonan Outing</Button>
                    </form>
                  </Card>
                )}

                {permohonanType === 'pulang' && (
                  <Card className="p-6">
                    <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><Home size={20} /> Mohon Pulang Bermalam</h3>
                    <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <PbwPbpCalendar
                        periods={pbwPbpPeriods}
                        onSelectDate={handlePbwPbpDateSelect}
                        selectedDateKeluar={pulangForm.tarikh_keluar ? pulangForm.tarikh_keluar.slice(0, 10) : null}
                        selectedDatePulang={pulangForm.tarikh_pulang ? pulangForm.tarikh_pulang.slice(0, 10) : null}
                      />
                    </div>
                    {pulangPeriodHint && pulangPeriodHint.length > 0 && (
                      <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                        <p className="font-semibold flex items-center gap-2"><FileText size={18} /> Berkaitan jadual asrama (PBW/PBP)</p>
                        <p className="mt-1">Tarikh pilihan anda jatuh dalam tempoh: {pulangPeriodHint.map((p) => `${p.label} (${formatDateDMY(p.start_date)} – ${formatDateDMY(p.end_date)})`).join('; ')}. Sila rujuk surat pekeliling maktab berkaitan PBP atau PBW.</p>
                      </div>
                    )}
                    <form onSubmit={handleSubmitPulang} className="space-y-4 max-w-xl">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Cara pulang *</label>
                        <select value={pulangForm.cara_pulang} onChange={(e) => setPulangForm((f) => ({ ...f, cara_pulang: e.target.value }))} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl">
                          {CARA_PULANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {CARA_PULANG_NEEDS_PLATE.includes(pulangForm.cara_pulang) && (
                        <Input label="No. Pendaftaran Plat Kenderaan *" value={pulangForm.plate_number} onChange={(e) => setPulangForm((f) => ({ ...f, plate_number: e.target.value }))} placeholder="Contoh: BCC 1234" required icon={Car} />
                      )}
                      {pulangForm.cara_pulang === 'bas' && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Catatan bas *</label>
                          <textarea value={pulangForm.transport_remarks} onChange={(e) => setPulangForm((f) => ({ ...f, transport_remarks: e.target.value }))} placeholder="Nombor bas, syarikat, masa berlepas (jika ada)" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-400 resize-none" rows={2} required />
                        </div>
                      )}
                      {pulangForm.cara_pulang === 'lain_lain' && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Nyatakan cara pulang *</label>
                          <textarea value={pulangForm.transport_remarks} onChange={(e) => setPulangForm((f) => ({ ...f, transport_remarks: e.target.value }))} placeholder="Contoh: Dijemput rakan, teksi, dll." className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-400 resize-none" rows={2} required />
                        </div>
                      )}
                      <Input label="Nama Person In Charge (Penjaga / Ibu Bapa)" value={pulangForm.pic_name} onChange={(e) => setPulangForm((f) => ({ ...f, pic_name: e.target.value }))} required icon={User} />
                      <Input label="No. Telefon Person In Charge" type="tel" value={pulangForm.pic_phone} onChange={(e) => setPulangForm((f) => ({ ...f, pic_phone: e.target.value }))} icon={Phone} />
                      <Button type="submit" disabled={submitting}>
                        {submitting ? <Spinner size="sm" /> : <Send size={16} />}
                        {children.length > 1 && (selectedPulangChildIds.length > 1)
                          ? ` Hantar untuk ${selectedPulangChildIds.length} orang anak`
                          : ' Hantar Permohonan Pulang Bermalam'}
                      </Button>
                    </form>
                  </Card>
                )}

                {permohonanType === 'kecemasan' && (
                  <Card className="p-6 border-red-100">
                    <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><AlertTriangle size={20} className="text-red-500" /> Mohon Keluar (Kecemasan)</h3>
                    <p className="text-sm text-slate-600 mb-3">Untuk urusan kecemasan sahaja. Sila isi butiran dan lampirkan dokumen jika ada.</p>
                    <div className="mb-6 rounded-2xl border border-red-100 bg-gradient-to-br from-red-50/80 to-white overflow-hidden shadow-sm">
                      <div className="px-5 py-3 bg-red-500/10 border-b border-red-100">
                        <p className="text-sm font-bold text-red-800">Contoh Yang Dikira Kecemasan</p>
                      </div>
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          { n: 1, title: 'Kematian Ahli Keluarga Terdekat', sub: 'Ibu / bapa · Datuk / nenek · Adik-beradik' },
                          { n: 2, title: 'Kemalangan Serius', sub: 'Ibu bapa, adik beradik kemalangan kritikal' },
                          { n: 3, title: 'Ahli Keluarga Masuk Hospital Kritikal', sub: 'ICU · Pembedahan kecemasan' },
                          { n: 4, title: 'Bencana', sub: null },
                          { n: 5, title: 'Pelajar Kemalangan atau Cedera', sub: null },
                        ].map(({ n, title, sub }) => {
                          const copyText = sub ? `${title}\n${sub}` : title;
                          return (
                            <div key={n} className="flex gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md hover:border-red-200/60 transition-all">
                              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center text-sm font-bold shadow-inner">
                                {n}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-slate-800">{title}</p>
                                {sub && <p className="text-slate-600 text-sm mt-0.5">{sub}</p>}
                              </div>
                              <button
                                type="button"
                                onClick={() => { navigator.clipboard.writeText(copyText).then(() => toast.success('Disalin ke clipboard')); }}
                                className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Salin untuk tampal dalam borang"
                              >
                                <Copy size={18} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <form onSubmit={handleSubmitEmergency} className="space-y-4 max-w-xl">
                      <Input label="Tarikh Keluar" type="datetime-local" value={emergencyForm.tarikh_keluar} onChange={(e) => setEmergencyForm((f) => ({ ...f, tarikh_keluar: e.target.value }))} required />
                      <Input label="Tarikh Pulang" type="datetime-local" value={emergencyForm.tarikh_pulang} onChange={(e) => setEmergencyForm((f) => ({ ...f, tarikh_pulang: e.target.value }))} required />
                      <Input label="Sebab / Butiran kecemasan" value={emergencyForm.sebab} onChange={(e) => setEmergencyForm((f) => ({ ...f, sebab: e.target.value }))} placeholder="Nyatakan sebab kecemasan" />
                      <Input label="Nama Person In Charge yang bawa Pelajar keluar" value={emergencyForm.pic_name} onChange={(e) => setEmergencyForm((f) => ({ ...f, pic_name: e.target.value }))} required icon={User} />
                      <Input label="No. Telefon Person In Charge" type="tel" value={emergencyForm.pic_phone} onChange={(e) => setEmergencyForm((f) => ({ ...f, pic_phone: e.target.value }))} icon={Phone} />
                      <Input label="Destinasi / Lokasi (pilihan)" value={emergencyForm.destinasi} onChange={(e) => setEmergencyForm((f) => ({ ...f, destinasi: e.target.value }))} icon={MapPin} />
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Jenis kenderaan</label>
                          <select value={emergencyForm.vehicle_type} onChange={(e) => setEmergencyForm((f) => ({ ...f, vehicle_type: e.target.value }))} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl">
                            <option value="">Pilihan</option>
                            <option value="kereta">Kereta</option>
                            <option value="bas">Bas</option>
                            <option value="van">Van</option>
                          </select>
                        </div>
                        <Input label="No. Plat" value={emergencyForm.vehicle_plate} onChange={(e) => setEmergencyForm((f) => ({ ...f, vehicle_plate: e.target.value }))} placeholder="BCC 1234" icon={Car} />
                      </div>
                      <Input label="Catatan (pilihan)" value={emergencyForm.remarks} onChange={(e) => setEmergencyForm((f) => ({ ...f, remarks: e.target.value }))} />
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Dokumen sokongan (PDF/imej, maks. {MAX_LEAVE_FILES} fail)</label>
                        <input type="file" accept={ACCEPT_LEAVE_FILES} multiple onChange={handleEmergencyFileSelect} disabled={emergencyUploading || emergencyAttachments.length >= MAX_LEAVE_FILES} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-red-100 file:text-red-800" />
                        {emergencyAttachments.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {emergencyAttachments.map((a, i) => (
                              <li key={i} className="flex items-center gap-2 text-sm">
                                <FileCheck size={14} className="text-emerald-600" />
                                <span className="truncate flex-1">{a.filename}</span>
                                <button type="button" onClick={() => setEmergencyAttachments((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-600 p-0.5"><X size={14} /></button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <Button type="submit" disabled={submitting} className="bg-red-500 hover:bg-red-600">{submitting ? <Spinner size="sm" /> : <Send size={16} />} Hantar Permohonan Kecemasan</Button>
                    </form>
                  </Card>
                )}

                {permohonanType === 'sakit' && (
                  <Card className="p-6 border-amber-100">
                    <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><Heart size={20} className="text-amber-600" /> Mohon Keluar (Rawatan Kesihatan)</h3>
                    <p className="text-sm text-slate-600 mb-2">Berkaitan rawatan atau masalah kesihatan.</p>
                    <p className="text-sm text-slate-500 mb-1">Contoh: Temujanji hospital/klinik, Rawatan susulan.</p>
                    <p className="text-sm font-medium text-amber-800 mb-4">📌 Wajib muat naik surat temujanji / MC.</p>
                    <form onSubmit={handleSubmitSick} className="space-y-4 max-w-xl">
                      <Input label="Tarikh Keluar" type="datetime-local" value={sickForm.tarikh_keluar} onChange={(e) => setSickForm((f) => ({ ...f, tarikh_keluar: e.target.value }))} required />
                      <Input label="Tarikh Pulang" type="datetime-local" value={sickForm.tarikh_pulang} onChange={(e) => setSickForm((f) => ({ ...f, tarikh_pulang: e.target.value }))} required />
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Destinasi *</label>
                        <div className="flex gap-4 mb-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="lokasi_type" value="klinik" checked={sickForm.lokasi_type === 'klinik'} onChange={() => setSickForm((f) => ({ ...f, lokasi_type: 'klinik' }))} className="text-amber-600 focus:ring-amber-500" />
                            <span>Klinik</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="lokasi_type" value="hospital" checked={sickForm.lokasi_type === 'hospital'} onChange={() => setSickForm((f) => ({ ...f, lokasi_type: 'hospital' }))} className="text-amber-600 focus:ring-amber-500" />
                            <span>Hospital</span>
                          </label>
                        </div>
                        <Input label={`Nama ${sickForm.lokasi_type === 'hospital' ? 'Hospital' : 'Klinik'} *`} value={sickForm.lokasi_name} onChange={(e) => setSickForm((f) => ({ ...f, lokasi_name: e.target.value }))} placeholder={sickForm.lokasi_type === 'hospital' ? 'Contoh: Hospital Sultanah Aminah' : 'Contoh: Klinik Kesihatan Bandar'} required />
                      </div>
                      <Input label="Sebab / Butiran (pilihan)" value={sickForm.sebab} onChange={(e) => setSickForm((f) => ({ ...f, sebab: e.target.value }))} placeholder="Nyatakan sebab atau simptom" />
                      <Input label="Nama Person In Charge yang bawa Pelajar keluar" value={sickForm.pic_name} onChange={(e) => setSickForm((f) => ({ ...f, pic_name: e.target.value }))} required icon={User} />
                      <Input label="No. Telefon Person In Charge" type="tel" value={sickForm.pic_phone} onChange={(e) => setSickForm((f) => ({ ...f, pic_phone: e.target.value }))} icon={Phone} />
                      <Input label="Destinasi / Lokasi lain (pilihan)" value={sickForm.destinasi} onChange={(e) => setSickForm((f) => ({ ...f, destinasi: e.target.value }))} icon={MapPin} />
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Jenis kenderaan</label>
                          <select value={sickForm.vehicle_type} onChange={(e) => setSickForm((f) => ({ ...f, vehicle_type: e.target.value }))} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl">
                            <option value="">Pilihan</option>
                            <option value="kereta">Kereta</option>
                            <option value="bas">Bas</option>
                            <option value="van">Van</option>
                          </select>
                        </div>
                        <Input label="No. Plat" value={sickForm.vehicle_plate} onChange={(e) => setSickForm((f) => ({ ...f, vehicle_plate: e.target.value }))} placeholder="BCC 1234" icon={Car} />
                      </div>
                      <Input label="Catatan (pilihan)" value={sickForm.remarks} onChange={(e) => setSickForm((f) => ({ ...f, remarks: e.target.value }))} />
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Surat temujanji / MC (wajib, PDF/imej, maks. {MAX_LEAVE_FILES} fail)</label>
                        <input type="file" accept={ACCEPT_LEAVE_FILES} multiple onChange={handleSickFileSelect} disabled={sickUploading || sickAttachments.length >= MAX_LEAVE_FILES} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-amber-100 file:text-amber-800" />
                        {sickAttachments.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {sickAttachments.map((a, i) => (
                              <li key={i} className="flex items-center gap-2 text-sm">
                                <FileCheck size={14} className="text-emerald-600" />
                                <span className="truncate flex-1">{a.filename}</span>
                                <button type="button" onClick={() => setSickAttachments((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-600 p-0.5"><X size={14} /></button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <Button type="submit" disabled={submitting} className="bg-amber-500 hover:bg-amber-600">{submitting ? <Spinner size="sm" /> : <Send size={16} />} Hantar Permohonan Rawatan Kesihatan</Button>
                    </form>
                  </Card>
                )}

                {permohonanType === 'leave' && (
                  <Card className="p-6">
                    <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><CalendarCheck size={20} /> Mohon Keluar (Aktiviti Rasmi Maktab)</h3>
                    <p className="text-sm text-slate-600 mb-4">Pertandingan, lawatan, aktiviti, program rasmi.</p>
                    <form onSubmit={handleSubmitLeave} className="space-y-4 max-w-xl">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Kategori</label>
                        <select value={leaveForm.kategori} onChange={(e) => setLeaveForm((f) => ({ ...f, kategori: e.target.value }))} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl">
                          {LEAVE_KATEGORI_OPTIONS_URUSAN_LAIN.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <Input label="Tarikh Keluar" type="datetime-local" value={leaveForm.tarikh_keluar} onChange={(e) => setLeaveForm((f) => ({ ...f, tarikh_keluar: e.target.value }))} required />
                      <Input label="Tarikh Pulang" type="datetime-local" value={leaveForm.tarikh_pulang} onChange={(e) => setLeaveForm((f) => ({ ...f, tarikh_pulang: e.target.value }))} required />
                      <Input label="Sebab / Butiran" value={leaveForm.sebab} onChange={(e) => setLeaveForm((f) => ({ ...f, sebab: e.target.value }))} />
                      <Input label="Nama Guru (Person In Charge)" value={leaveForm.pic_name} onChange={(e) => setLeaveForm((f) => ({ ...f, pic_name: e.target.value }))} required icon={User} />
                      <Input label="No. Telefon Guru (Person In Charge)" type="tel" value={leaveForm.pic_phone} onChange={(e) => setLeaveForm((f) => ({ ...f, pic_phone: e.target.value }))} icon={Phone} />
                      <Input label="Destinasi / Lokasi" value={leaveForm.destinasi} onChange={(e) => setLeaveForm((f) => ({ ...f, destinasi: e.target.value }))} icon={MapPin} />
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Jenis kenderaan</label>
                          <select value={leaveForm.vehicle_type} onChange={(e) => setLeaveForm((f) => ({ ...f, vehicle_type: e.target.value }))} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl">
                            <option value="">Pilihan</option>
                            <option value="kereta">Kereta</option>
                            <option value="bas">Bas</option>
                            <option value="van">Van</option>
                          </select>
                        </div>
                        <Input label="No. Plat" value={leaveForm.vehicle_plate} onChange={(e) => setLeaveForm((f) => ({ ...f, vehicle_plate: e.target.value }))} placeholder="BCC 1234" icon={Car} />
                      </div>
                      <Input label="Catatan (pilihan)" value={leaveForm.remarks} onChange={(e) => setLeaveForm((f) => ({ ...f, remarks: e.target.value }))} />
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Surat pengakuan kebenaran ibu bapa (PDF/imej, maks. {MAX_LEAVE_FILES} fail)</label>
                        <input type="file" accept={ACCEPT_LEAVE_FILES} multiple onChange={handleLeaveFileSelect} disabled={leaveUploading || leaveAttachments.length >= MAX_LEAVE_FILES} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-amber-100 file:text-amber-800" />
                        {leaveAttachments.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {leaveAttachments.map((a, i) => (
                              <li key={i} className="flex items-center gap-2 text-sm">
                                <FileCheck size={14} className="text-emerald-600" />
                                <span className="truncate flex-1">{a.filename}</span>
                                <button type="button" onClick={() => setLeaveAttachments((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-600 p-0.5"><X size={14} /></button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <Button type="submit" disabled={submitting}>{submitting ? <Spinner size="sm" /> : <Send size={16} />} Hantar Permohonan Keluar</Button>
                    </form>
                  </Card>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
