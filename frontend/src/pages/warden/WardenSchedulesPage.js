/**
 * Jadual Warden & Laporan Outing
 * - Guru Warden / Guru Asrama Bertugas (maklumat guru, nombor telefon, jadual)
 * - Giliran Outing Putera & Puteri (hujung minggu)
 * - Laporan Outing ikut kalendar (bilangan keluar)
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Calendar, Clock, User, Phone, Mail, Building, Plus, X, Edit, Trash2,
  ChevronLeft, ChevronRight, Users, CalendarDays, LogOut, MessageSquare
} from 'lucide-react';
import { useAuth } from '../../App';
import api from '../../services/api';
import { Card, Button } from '../../components/common';

const MONTHS_MY = ['', 'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
const DAYS_MY = ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'];
// Monday-first for calendar grid (like reference image)
const DAYS_HEADER = ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Ahd'];

const TABS = [
  { id: 'guru', label: 'Guru Bertugas', icon: Users },
  { id: 'giliran', label: 'Giliran Outing', icon: CalendarDays },
  { id: 'laporan', label: 'Laporan Outing', icon: LogOut },
];

const apiErrorMessage = (err, fallback = 'Operasi gagal') => {
  const d = err.response?.data?.detail;
  if (Array.isArray(d)) return d.map((x) => x.msg || x.loc?.join('.')).filter(Boolean).join(' ') || fallback;
  return d || fallback;
};

const todayStr = () => new Date().toISOString().split('T')[0];

// ---------- Schedule Form Modal ----------
const ScheduleFormModal = ({ schedule, wardens, blocks, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    warden_id: '',
    tarikh_mula: todayStr(),
    tarikh_tamat: todayStr(),
    waktu_mula: '18:00',
    waktu_tamat: '07:00',
    blok_assigned: [],
    catatan: '',
  });

  useEffect(() => {
    if (schedule) {
      setForm({
        warden_id: schedule.warden_id || '',
        tarikh_mula: schedule.tarikh_mula || todayStr(),
        tarikh_tamat: schedule.tarikh_tamat || todayStr(),
        waktu_mula: schedule.waktu_mula || '18:00',
        waktu_tamat: schedule.waktu_tamat || '07:00',
        blok_assigned: Array.isArray(schedule.blok_assigned) ? schedule.blok_assigned : [],
        catatan: schedule.catatan || '',
      });
    } else {
      setForm({
        warden_id: '',
        tarikh_mula: todayStr(),
        tarikh_tamat: todayStr(),
        waktu_mula: '18:00',
        waktu_tamat: '07:00',
        blok_assigned: [],
        catatan: '',
      });
    }
  }, [schedule?.id, schedule?.tarikh_mula, schedule?.warden_id]);

  const toggleBlock = (code) => {
    setForm(prev => ({
      ...prev,
      blok_assigned: prev.blok_assigned.includes(code) ? prev.blok_assigned.filter(b => b !== code) : [...prev.blok_assigned, code]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.warden_id) {
      toast.error('Sila pilih warden');
      return;
    }
    setLoading(true);
    try {
      if (schedule?.id) {
        await api.put(`/api/warden/schedules/${schedule.id}`, form);
        toast.success('Jadual dikemaskini');
      } else {
        await api.post('/api/warden/schedules', form);
        toast.success('Jadual ditambah');
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal menyimpan'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-teal-400/90 via-emerald-300/80 to-cyan-300/80 px-6 py-4 text-slate-800 border-b border-white/30">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-heading">{schedule ? 'Edit Jadual' : 'Tambah Jadual Bertugas'}</h2>
            <button onClick={onClose} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/40 rounded-xl transition-colors"><X size={20} /></button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Guru Warden *</label>
            <select
              value={form.warden_id}
              onChange={(e) => setForm({ ...form, warden_id: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500"
              required
            >
              <option value="">Pilih warden</option>
              {(wardens || []).map(w => (
                <option key={w.id} value={w.id}>{w.full_name} {w.phone ? `(${w.phone})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tarikh Mula</label>
              <input type="date" value={form.tarikh_mula} onChange={(e) => setForm({ ...form, tarikh_mula: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tarikh Tamat</label>
              <input type="date" value={form.tarikh_tamat} onChange={(e) => setForm({ ...form, tarikh_tamat: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Waktu Mula</label>
              <input type="time" value={form.waktu_mula} onChange={(e) => setForm({ ...form, waktu_mula: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Waktu Tamat</label>
              <input type="time" value={form.waktu_tamat} onChange={(e) => setForm({ ...form, waktu_tamat: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Blok di bawah jagaan</label>
            <div className="flex flex-wrap gap-2">
              {(blocks || []).map(b => (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => toggleBlock(b.code)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${form.blok_assigned.includes(b.code) ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 hover:border-teal-300'}`}
                >
                  {b.code}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
            <textarea value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl" rows={2} placeholder="Catatan..." />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Batal</Button>
            <Button type="submit" loading={loading} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white">Simpan</Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// ---------- Day Detail Modal (jadual + peristiwa untuk satu hari) ----------
const DayModal = ({
  selectedDay,
  schedules,
  wardens,
  blocks,
  calendarEvents,
  getEventsForDate,
  canEdit,
  currentUserId,
  onClose,
  onRefresh,
  onOpenScheduleForm,
  onEditSchedule,
  onDeleteSchedule,
}) => {
  const [savingEvent, setSavingEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState({ date_start: '', date_end: '', note: '' });

  const dateStr = selectedDay?.dateStr;
  const dayData = selectedDay?.dayData;
  const wardensDay = dayData?.wardens || [];
  const eventsForDay = dateStr ? getEventsForDate(dateStr) : [];

  useEffect(() => {
    if (!dateStr) {
      setEditingEvent(null);
      setEventForm({ date_start: '', date_end: '', note: '' });
      return;
    }
    if (eventsForDay.length === 0 && canEdit)
      setEventForm({ date_start: dateStr, date_end: dateStr, note: '' });
  }, [dateStr]);

  const openEventForm = (ev = null) => {
    if (ev) {
      setEditingEvent(ev);
      setEventForm({ date_start: ev.date_start, date_end: ev.date_end || ev.date_start, note: ev.note || '' });
    } else {
      setEditingEvent(null);
      setEventForm({ date_start: dateStr, date_end: dateStr, note: '' });
    }
  };
  const closeEventForm = () => {
    setEditingEvent(null);
    setEventForm({ date_start: '', date_end: '', note: '' });
  };

  const saveEvent = async (e) => {
    e.preventDefault();
    if (!eventForm.note?.trim()) {
      toast.error('Sila isi nota peristiwa');
      return;
    }
    setSavingEvent(true);
    try {
      if (editingEvent?.id) {
        await api.put(`/api/warden/calendar-events/${editingEvent.id}`, eventForm);
        toast.success('Peristiwa dikemaskini');
      } else {
        await api.post('/api/warden/calendar-events', eventForm);
        toast.success('Peristiwa ditambah');
      }
      closeEventForm();
      onRefresh?.();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal menyimpan peristiwa'));
    } finally {
      setSavingEvent(false);
    }
  };

  const deleteEvent = async (id) => {
    if (!window.confirm('Padam peristiwa ini?')) return;
    try {
      await api.delete(`/api/warden/calendar-events/${id}`);
      toast.success('Peristiwa dipadam');
      onRefresh?.();
      closeEventForm();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal padam'));
    }
  };

  if (!selectedDay) return null;
  const dateLabel = dateStr ? new Date(dateStr + 'T12:00:00').toLocaleDateString('ms-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-teal-400/90 via-emerald-300/80 to-cyan-300/80 px-6 py-4 text-slate-800 flex-shrink-0 border-b border-white/30">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-heading">Jadual & Peristiwa</h2>
            <button type="button" onClick={onClose} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/40 rounded-xl transition-colors">
              <X size={20} />
            </button>
          </div>
          <p className="text-slate-700 text-sm mt-0.5">{dateLabel}</p>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <section>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
              <User size={18} className="text-teal-600" />
              Guru Bertugas
            </h3>
            {wardensDay.length === 0 ? (
              <p className="text-slate-500 text-sm">Tiada jadual pada hari ini.</p>
            ) : (
              <ul className="space-y-2">
                {wardensDay.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="font-medium text-slate-900">{w.warden_name}</p>
                      {w.warden_phone && <p className="text-xs text-slate-500">{w.warden_phone}</p>}
                    </div>
                    {canEdit && (currentUserId == null || String(w.warden_id) === String(currentUserId)) && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={async () => {
                            let s = (schedules || []).find((x) => x.id === w.id);
                            if (!s) {
                              try {
                                const res = await api.get(`/api/warden/schedules/${w.id}`);
                                s = res.data?.schedule;
                              } catch (e) {
                                toast.error(apiErrorMessage(e, 'Gagal muat jadual'));
                                return;
                              }
                            }
                            if (s) {
                              onEditSchedule(s);
                              onClose();
                            }
                          }}
                          className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-lg"
                        >
                          <Edit size={16} />
                        </button>
                        <button type="button" onClick={() => onDeleteSchedule(w.id)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <Button
                type="button"
                onClick={() => { onOpenScheduleForm(dateStr); onClose(); }}
                className="mt-2 bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-2"
              >
                <Plus size={18} /> Tambah Jadual
              </Button>
            )}
          </section>

          <section>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
              <Calendar size={18} className="text-teal-600" />
              Nota / Peristiwa
            </h3>
            {eventsForDay.length === 0 && !editingEvent && (
              <p className="text-slate-500 text-sm">Tiada peristiwa.</p>
            )}
            {eventsForDay.map((ev) => (
              <div key={ev.id} className="flex items-start justify-between gap-2 py-2 border-b border-slate-100">
                <div>
                  <p className="text-sm text-slate-800">{ev.note}</p>
                  <p className="text-xs text-slate-500">{ev.date_start === (ev.date_end || ev.date_start) ? ev.date_start : `${ev.date_start} – ${ev.date_end || ev.date_start}`}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => openEventForm(ev)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-lg">
                      <Edit size={16} />
                    </button>
                    <button type="button" onClick={() => deleteEvent(ev.id)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {(editingEvent || (canEdit && (eventForm.date_start === dateStr || (eventsForDay.length === 0 && eventForm.date_start)))) && (
              <form onSubmit={saveEvent} className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <input type="hidden" value={eventForm.date_start} readOnly />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nota peristiwa *</label>
                  <input
                    type="text"
                    value={eventForm.note}
                    onChange={(e) => setEventForm((f) => ({ ...f, note: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl"
                    placeholder="cth. PBW CNY 14-22/02/2026"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tarikh mula</label>
                    <input type="date" value={eventForm.date_start} onChange={(e) => setEventForm((f) => ({ ...f, date_start: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tarikh tamat</label>
                    <input type="date" value={eventForm.date_end} onChange={(e) => setEventForm((f) => ({ ...f, date_end: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl" required />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={closeEventForm}>Batal</Button>
                  <Button type="submit" loading={savingEvent} className="bg-teal-600 hover:bg-teal-700 text-white">
                    {editingEvent ? 'Kemaskini' : 'Tambah'}
                  </Button>
                </div>
              </form>
            )}
            {canEdit && !editingEvent && eventsForDay.length > 0 && eventForm.date_start !== dateStr && (
              <Button type="button" variant="outline" onClick={() => openEventForm()} className="mt-2 flex items-center gap-2">
                <Plus size={18} /> Tambah Peristiwa
              </Button>
            )}
          </section>
        </div>
      </motion.div>
    </div>
  );
};

export default function WardenSchedulesPage() {
  const auth = useAuth();
  const user = auth?.user;
  const [activeTab, setActiveTab] = useState('guru');
  const [loading, setLoading] = useState(true);
  const [wardens, setWardens] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [calendar, setCalendar] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [outingCounts, setOutingCounts] = useState({});
  const [rotationItems, setRotationItems] = useState([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editSchedule, setEditSchedule] = useState(null);
  const [rotationForm, setRotationForm] = useState({ week_start: '', type: 'putera' });
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState('calendar'); // calendar | list
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null); // { dateStr, dayData }
  const canEdit = ['admin', 'superadmin', 'warden'].includes(user?.role);

  const fetchWardenData = async () => {
    try {
      const [sRes, wRes, calRes, blRes, evRes] = await Promise.all([
        api.get('/api/warden/schedules', { params: { bulan: currentMonth, tahun: currentYear } }),
        api.get('/api/warden/list'),
        api.get('/api/warden/calendar', { params: { bulan: currentMonth, tahun: currentYear } }),
        api.get('/api/hostel-blocks/public').catch(() => ({ data: { blocks: [] } })),
        api.get('/api/warden/calendar-events', { params: { bulan: currentMonth, tahun: currentYear } }).catch(() => ({ data: { events: [] } })),
      ]);
      setSchedules(sRes.data?.schedules || []);
      setWardens(wRes.data?.wardens || []);
      setCalendar(calRes.data?.calendar || null);
      setBlocks(blRes.data?.blocks || []);
      setCalendarEvents(evRes.data?.events || []);
    } catch (e) {
      toast.error('Gagal muat data jadual');
    }
  };

  const fetchOutingData = async () => {
    try {
      const [countsRes, rotRes] = await Promise.all([
        api.get('/api/hostel/outing/calendar-counts', { params: { bulan: currentMonth, tahun: currentYear } }),
        api.get('/api/warden/outing-rotation', { params: { bulan: currentMonth, tahun: currentYear } }),
      ]);
      setOutingCounts(countsRes.data?.by_date || {});
      setRotationItems(rotRes.data?.items || []);
    } catch (e) {
      toast.error('Gagal muat data outing');
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchWardenData(), activeTab !== 'guru' ? fetchOutingData() : Promise.resolve()]).finally(() => setLoading(false));
  }, [currentMonth, currentYear]);

  useEffect(() => {
    if (activeTab === 'giliran' || activeTab === 'laporan') fetchOutingData();
  }, [activeTab]);

  const navigateMonth = (delta) => {
    let m = currentMonth + delta;
    let y = currentYear;
    if (m > 12) { m = 1; y++; } else if (m < 1) { m = 12; y--; }
    setCurrentMonth(m);
    setCurrentYear(y);
  };

  const handleDeleteSchedule = async (id) => {
    if (!window.confirm('Padam jadual ini?')) return;
    try {
      await api.delete(`/api/warden/schedules/${id}`);
      toast.success('Jadual dipadam');
      fetchWardenData();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal padam'));
    }
  };

  const addRotation = async (e) => {
    e.preventDefault();
    if (!rotationForm.week_start) {
      toast.error('Sila pilih tarikh minggu');
      return;
    }
    try {
      await api.post('/api/warden/outing-rotation', rotationForm);
      toast.success('Giliran ditambah');
      setRotationForm({ week_start: '', type: 'putera' });
      fetchOutingData();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal simpan'));
    }
  };

  const deleteRotation = async (id) => {
    if (!window.confirm('Padam giliran ini?')) return;
    try {
      await api.delete(`/api/warden/outing-rotation/${id}`);
      toast.success('Giliran dipadam');
      fetchOutingData();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal padam'));
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const calMonth = currentMonth;
  const calYear = currentYear;
  const numDays = new Date(calYear, calMonth, 0).getDate();
  const firstDay = new Date(calYear, calMonth - 1, 1).getDay();

  // Build full month grid (Monday-first, 6 rows x 7)
  const buildCalendarGrid = () => {
    const first = new Date(calYear, calMonth - 1, 1);
    const offset = (first.getDay() + 6) % 7; // Monday = 0
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    const grid = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const isCurrentMonth = d.getMonth() === calMonth - 1;
      const dayData = calendar?.days?.find((x) => x.tarikh === dateStr) || null;
      grid.push({ dateStr, dayNum: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear(), isCurrentMonth, dayData });
    }
    return grid;
  };
  const calendarGrid = calendar?.days ? buildCalendarGrid() : [];

  // Events that cover a given date
  const getEventsForDate = (dateStr) =>
    calendarEvents.filter(
      (e) => dateStr >= e.date_start && dateStr <= (e.date_end || e.date_start)
    );

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="warden-schedules-page">
      {/* Hero header - pastel gradient */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-teal-400/90 via-emerald-300/80 to-cyan-300/90 text-slate-800 p-8 shadow-pastel-lg border border-white/40"
      >
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4yIj48cGF0aCBkPSJNMzYgMzR2Mi1IMjR2LTJoMTJ6bTAtNC44MzRsLS4xNjUtLjQxNS0uNDE1LS4xNjVIMjQuNThsLS40MTUuMTY1LS4xNjUuNDE1VjI5aDEydi4xNjZ6bTAgNS4yOTJIMjR2LTJoMTJ2MnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
        <div className="relative">
          <h1 className="text-2xl md:text-3xl font-bold mb-1 font-heading">Jadual & Laporan Asrama</h1>
          <p className="text-slate-700/90 text-sm md:text-base">Urus guru bertugas, giliran outing Putera/Puteri dan lihat laporan bilangan keluar outing</p>
        </div>
      </motion.div>

      {/* Tabs - pastel */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }, i) => (
          <motion.button
            key={id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i }}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-300 ${activeTab === id ? 'bg-teal-500/90 text-white shadow-pastel' : 'bg-white/80 border border-slate-200/80 text-slate-600 hover:border-teal-300 hover:bg-pastel-mint/30 hover:text-teal-800'}`}
          >
            <Icon size={18} />
            {label}
          </motion.button>
        ))}
      </motion.div>

      {/* Month nav */}
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex items-center justify-between bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-100 px-4 py-3 shadow-card-soft">
        <button onClick={() => navigateMonth(-1)} className="min-w-[44px] min-h-[44px] p-2.5 inline-flex items-center justify-center hover:bg-pastel-mint/40 rounded-xl transition-colors duration-200">
          <ChevronLeft size={22} className="text-slate-600" />
        </button>
        <span className="text-lg font-bold text-slate-800 font-heading">{MONTHS_MY[currentMonth]} {currentYear}</span>
        <button onClick={() => navigateMonth(1)} className="min-w-[44px] min-h-[44px] p-2.5 inline-flex items-center justify-center hover:bg-pastel-mint/40 rounded-xl transition-colors duration-200">
          <ChevronRight size={22} className="text-slate-600" />
        </button>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-pastel-mint border-t-teal-500 rounded-full animate-spin" />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {/* Tab: Guru Bertugas */}
          {activeTab === 'guru' && (
            <motion.div key="guru" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
              {/* Senarai guru warden */}
              <Card className="overflow-hidden border-pastel-mint/30">
                <div className="bg-gradient-to-r from-pastel-mint/40 to-pastel-sky/30 border-b border-slate-100 px-6 py-4">
                  <h2 className="font-bold text-slate-800 flex items-center gap-2 font-heading">
                    <User size={20} className="text-teal-600" />
                    Guru Warden / Guru Asrama Bertugas
                  </h2>
                  <p className="text-sm text-slate-600 mt-0.5">Maklumat guru dan nombor telefon untuk dihubungi</p>
                </div>
                <div className="p-6">
                  {wardens.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">Tiada warden berdaftar. Hubungi Admin untuk tambah warden.</p>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {wardens.map((w, i) => (
                        <motion.div key={w.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="border border-slate-100 rounded-2xl p-4 hover:border-pastel-mint/60 hover:shadow-pastel transition-all duration-300 bg-white/80">
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-xl bg-pastel-mint/60 flex items-center justify-center flex-shrink-0">
                              <User size={24} className="text-teal-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900 truncate">{w.full_name}</p>
                              {w.assigned_block && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Building size={12} /> {w.assigned_block}</p>}
                              {w.phone && (
                                <a href={`tel:${w.phone}`} className="flex items-center gap-1.5 mt-2 text-sm text-teal-600 hover:text-teal-700 transition-colors">
                                  <Phone size={14} /> {w.phone}
                                </a>
                              )}
                              {w.email && (
                                <a href={`mailto:${w.email}`} className="flex items-center gap-1.5 mt-1 text-sm text-slate-600 hover:text-teal-600 truncate transition-colors">
                                  <Mail size={14} /> <span className="truncate">{w.email}</span>
                                </a>
                              )}
                              {w.phone && (
                                <a href={`https://wa.me/${String(w.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-emerald-600 hover:text-emerald-700 transition-colors">
                                  <MessageSquare size={14} /> WhatsApp
                                </a>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* Jadual bertugas */}
              <Card className="overflow-hidden border-pastel-sky/20">
                <div className="bg-gradient-to-r from-pastel-sky/30 to-pastel-lavender/20 border-b border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-slate-800 flex items-center gap-2 font-heading"><Clock size={20} className="text-teal-600" /> Jadual Bertugas</h2>
                    <p className="text-sm text-slate-600 mt-0.5">Siapa bertugas pada tarikh tertentu</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-xl overflow-hidden border border-slate-200/80">
                      <button type="button" onClick={() => setViewMode('calendar')} className={`min-h-[44px] px-3 py-2 text-sm font-medium transition-all duration-200 ${viewMode === 'calendar' ? 'bg-teal-500/90 text-white' : 'bg-white/80 text-slate-600 hover:bg-pastel-mint/30'}`}>Kalendar</button>
                      <button type="button" onClick={() => setViewMode('list')} className={`min-h-[44px] px-3 py-2 text-sm font-medium transition-all duration-200 ${viewMode === 'list' ? 'bg-teal-500/90 text-white' : 'bg-white/80 text-slate-600 hover:bg-pastel-mint/30'}`}>Senarai</button>
                    </div>
                    {canEdit && (
                      <Button onClick={() => { setEditSchedule(null); setShowScheduleForm(true); }} className="bg-teal-500/90 hover:bg-teal-600 text-white flex items-center gap-2 shadow-pastel-sm">
                        <Plus size={18} /> Tambah Jadual
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-6">
                  {viewMode === 'calendar' && calendar?.days && (
                    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-card-soft">
                      <div className="grid grid-cols-7 bg-gradient-to-r from-pastel-mint/30 to-pastel-sky/20 border-b border-slate-100">
                        {DAYS_HEADER.map((d) => (
                          <div key={d} className="p-2 text-center text-xs font-semibold text-slate-600">{d}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 auto-rows-fr" style={{ minHeight: 0 }}>
                        {calendarGrid.map((cell, idx) => {
                          const isToday = cell.dateStr === today;
                          const wardensDay = cell.dayData?.wardens || [];
                          const outingType = cell.dayData?.outing_type;
                          const eventNote = cell.dayData?.event_note;
                          return (
                            <motion.button
                              key={idx}
                              type="button"
                              initial={false}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setSelectedDay({ dateStr: cell.dateStr, dayData: cell.dayData, isCurrentMonth: cell.isCurrentMonth })}
                              className={`min-h-[88px] border-b border-r border-slate-100 p-2 text-left flex flex-col transition-colors duration-200 hover:bg-pastel-mint/20 ${!cell.isCurrentMonth ? 'bg-slate-50/60 text-slate-400' : 'bg-white/50'} ${isToday ? 'bg-pastel-mint/40 ring-2 ring-inset ring-teal-400' : ''}`}
                            >
                              <div className="flex justify-end items-start mb-1">
                                <span className={`text-sm font-medium ${isToday ? 'text-teal-700' : cell.isCurrentMonth ? 'text-slate-700' : 'text-slate-400'}`}>
                                  {cell.dayNum}
                                </span>
                                {isToday && <span className="ml-1 text-[10px] bg-teal-500 text-white px-1.5 py-0.5 rounded-lg">Hari Ini</span>}
                              </div>
                              <div className="flex-1 min-h-0 overflow-hidden space-y-0.5">
                                {wardensDay.length > 0 ? (
                                  wardensDay.map((w, i) => (
                                    <div key={i} className="text-xs bg-pastel-mint/50 text-teal-700 px-1.5 py-0.5 rounded-lg truncate" title={w.warden_name}>
                                      {w.warden_name}
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-xs text-slate-400 italic">–</span>
                                )}
                                {outingType && (
                                  <div className="text-[10px] font-medium text-slate-600 mt-0.5">({outingType.toUpperCase()})</div>
                                )}
                                {eventNote && (
                                  <div className="text-[10px] text-rose-600 mt-0.5 truncate" title={eventNote}>{eventNote}</div>
                                )}
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {viewMode === 'list' && (
                    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-card-soft">
                      <table className="w-full text-sm">
                        <thead className="bg-gradient-to-r from-pastel-sky/20 to-pastel-mint/20">
                          <tr>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Warden</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Tarikh</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Waktu</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Blok</th>
                            {canEdit && <th className="w-24" />}
                          </tr>
                        </thead>
                        <tbody>
                          {schedules.length === 0 ? (
                            <tr><td colSpan={canEdit ? 5 : 4} className="text-center py-8 text-slate-500">Tiada jadual bulan ini</td></tr>
                          ) : (
                            schedules.map((s) => (
                              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                                <td className="px-4 py-3">
                                  <p className="font-medium text-slate-900">{s.warden_name}</p>
                                  {s.warden_phone && <p className="text-xs text-slate-500">{s.warden_phone}</p>}
                                </td>
                                <td className="px-4 py-3 text-slate-700">{new Date(s.tarikh_mula).toLocaleDateString('ms-MY')} – {new Date(s.tarikh_tamat).toLocaleDateString('ms-MY')}</td>
                                <td className="px-4 py-3 text-slate-700">{s.waktu_mula} – {s.waktu_tamat}</td>
                                <td className="px-4 py-3">{s.blok_assigned?.length ? s.blok_assigned.join(', ') : 'Semua'}</td>
                                {canEdit && (
                                  <td className="px-4 py-3">
                                    <div className="flex gap-1">
                                      <button type="button" onClick={() => { setEditSchedule(s); setShowScheduleForm(true); }} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-lg"><Edit size={16} /></button>
                                      <button type="button" onClick={() => handleDeleteSchedule(s.id)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          )}

          {/* Tab: Giliran Outing Putera/Puteri */}
          {activeTab === 'giliran' && (
            <motion.div key="giliran" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
              <Card className="overflow-hidden border-pastel-lavender/30">
                <div className="bg-gradient-to-r from-pastel-lavender/30 to-pastel-peach/20 border-b border-slate-100 px-6 py-4">
                  <h2 className="font-bold text-slate-800 flex items-center gap-2 font-heading"><CalendarDays size={20} className="text-violet-600" /> Giliran Outing Hujung Minggu</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Tentukan minggu mana Putera (lelaki) dan minggu mana Puteri (perempuan) keluar outing</p>
                </div>
                <div className="p-6 space-y-6">
                  {canEdit && (
                    <form onSubmit={addRotation} className="flex flex-wrap items-end gap-4 p-4 bg-teal-50/50 rounded-xl border border-teal-100">
                      <div className="flex-1 min-w-[180px]">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tarikh awal minggu (Sabtu/Ahad)</label>
                        <input type="date" value={rotationForm.week_start} onChange={(e) => setRotationForm({ ...rotationForm, week_start: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl" required={false} />
                      </div>
                      <div className="w-40">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Jenis</label>
                        <select value={rotationForm.type} onChange={(e) => setRotationForm({ ...rotationForm, type: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl">
                          <option value="putera">Putera (Lelaki)</option>
                          <option value="puteri">Puteri (Perempuan)</option>
                        </select>
                      </div>
                      <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white">Tambah Giliran</Button>
                    </form>
                  )}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Tarikh Minggu</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Giliran</th>
                          {canEdit && <th className="w-20" />}
                        </tr>
                      </thead>
                      <tbody>
                        {rotationItems.length === 0 ? (
                          <tr><td colSpan={canEdit ? 3 : 2} className="text-center py-8 text-slate-500">Tiada giliran direkod. Tambah tarikh minggu dan pilih Putera atau Puteri.</td></tr>
                        ) : (
                          rotationItems.map((r) => (
                            <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-900">{new Date(r.week_start).toLocaleDateString('ms-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${r.type === 'putera' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'}`}>
                                  {r.type === 'putera' ? 'Putera (Lelaki)' : 'Puteri (Perempuan)'}
                                </span>
                              </td>
                              {canEdit && (
                                <td className="px-4 py-3">
                                  <button type="button" onClick={() => deleteRotation(r.id)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Tab: Laporan Outing */}
          {activeTab === 'laporan' && (
            <motion.div key="laporan" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
              <Card className="overflow-hidden border-pastel-peach/20">
                <div className="bg-gradient-to-r from-pastel-peach/30 to-pastel-cream/30 border-b border-slate-100 px-6 py-4">
                  <h2 className="font-bold text-slate-800 flex items-center gap-2 font-heading"><LogOut size={20} className="text-amber-600" /> Laporan Outing Mengikut Tarikh</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Bilangan pelajar yang keluar outing (diluluskan) pada setiap hari</p>
                </div>
                <div className="p-6">
                  <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-card-soft">
                    <div className="grid grid-cols-7 bg-gradient-to-r from-pastel-peach/30 to-pastel-cream/30 border-b border-slate-100">
                      {DAYS_MY.map(d => <div key={d} className="p-2 text-center text-xs font-semibold text-slate-600">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7">
                      {Array.from({ length: firstDay }).map((_, i) => <div key={`e2-${i}`} className="min-h-[90px] border-b border-r border-slate-100 bg-slate-50/50" />)}
                      {Array.from({ length: numDays }).map((_, i) => {
                        const dayNum = i + 1;
                        const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const count = outingCounts[dateStr] || 0;
                        const isToday = dateStr === today;
                        return (
                          <div key={dayNum} className={`min-h-[90px] border-b border-r border-slate-100 p-2 flex flex-col transition-colors ${isToday ? 'bg-pastel-mint/40 ring-2 ring-inset ring-teal-400' : ''}`}>
                            <div className="flex justify-between items-center mb-1">
                              <span className={`text-sm font-medium ${isToday ? 'text-teal-700' : 'text-slate-700'}`}>{dayNum}</span>
                              {isToday && <span className="text-[10px] bg-teal-500 text-white px-1.5 py-0.5 rounded-lg">Hari Ini</span>}
                            </div>
                            {count > 0 ? (
                              <div className="mt-auto">
                                <span className="inline-flex items-center justify-center w-full py-1.5 rounded-lg bg-pastel-cream/70 text-amber-800 font-bold text-sm">{count}</span>
                                <p className="text-[10px] text-slate-500 mt-0.5">keluar</p>
                              </div>
                            ) : (
                              <div className="mt-auto text-xs text-slate-400">0</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 mt-4 text-center">Angka menunjukkan bilangan permohonan outing yang diluluskan pada tarikh keluar.</p>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <AnimatePresence>
        {showScheduleForm && (
          <ScheduleFormModal
            schedule={editSchedule}
            wardens={wardens}
            blocks={blocks}
            onClose={() => { setShowScheduleForm(false); setEditSchedule(null); }}
            onSuccess={fetchWardenData}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedDay && (
          <DayModal
            selectedDay={selectedDay}
            schedules={schedules}
            wardens={wardens}
            blocks={blocks}
            calendarEvents={calendarEvents}
            getEventsForDate={getEventsForDate}
            canEdit={canEdit}
            currentUserId={user?.id ?? user?._id}
            onClose={() => setSelectedDay(null)}
            onRefresh={fetchWardenData}
            onOpenScheduleForm={(dateStr) => {
              setSelectedDay(null);
              setEditSchedule(dateStr ? { tarikh_mula: dateStr, tarikh_tamat: dateStr } : null);
              setShowScheduleForm(true);
            }}
            onEditSchedule={(s) => {
              setSelectedDay(null);
              setEditSchedule(s);
              setShowScheduleForm(true);
            }}
            onDeleteSchedule={handleDeleteSchedule}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
