/**
 * Modul Disiplin & OLAT (RASMI MRSM) - Fasa 3
 * Log kesalahan ikut seksyen rasmi; sync ke profil pelajar; papar di dashboard.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  FileText,
  AlertTriangle,
  Plus,
  RefreshCw,
  CheckCircle,
  User,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import api from '../../services/api';
import { Card, Button, Input, Select, Spinner } from '../../components/common';
import { toast } from 'sonner';

const STATUS_LABEL = {
  pending: 'Menunggu',
  dalam_siasatan: 'Dalam Siasatan',
  dirujuk_olat: 'Dirujuk OLAT',
  selesai: 'Selesai',
};

const OLAT_STATUS_LABEL = { open: 'Terbuka', in_progress: 'Dalam Proses', closed: 'Tutup' };

const STUDENT_PAGE_SIZE = 50;

function studentId(s) {
  return String(s?.id ?? s?._id ?? '');
}

export default function DisciplinePage() {
  const [stats, setStats] = useState(null);
  const [sections, setSections] = useState([]);
  const [offences, setOffences] = useState([]);
  const [olatCases, setOlatCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('offences');
  const [showForm, setShowForm] = useState(false);
  const [students, setStudents] = useState([]);
  const [riskSummary, setRiskSummary] = useState(null);
  const [riskProfiles, setRiskProfiles] = useState([]);
  const [olatCategories, setOlatCategories] = useState([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ keyword: '', label: '' });
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryDeletingId, setCategoryDeletingId] = useState(null);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [sectionForm, setSectionForm] = useState({ code: '', label: '' });
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionDeletingId, setSectionDeletingId] = useState(null);
  const [form, setForm] = useState({
    student_id: '',
    seksyen: '',
    keterangan: '',
    tarikh_kesalahan: new Date().toISOString().slice(0, 10),
    tempat: '',
  });
  const [showOlatAddModal, setShowOlatAddModal] = useState(false);
  const [olatAddForm, setOlatAddForm] = useState({
    student_id: '',
    detention_end_date: '',
    catatan: '',
    category_ids: [],
  });
  const [olatAddStudentSearch, setOlatAddStudentSearch] = useState('');
  const [olatAddPickerOpen, setOlatAddPickerOpen] = useState(false);
  const [pastOlatCount, setPastOlatCount] = useState(null);
  const [olatAddSaving, setOlatAddSaving] = useState(false);
  const [updatingDetentionCaseId, setUpdatingDetentionCaseId] = useState(null);
  const olatAddPickerRef = useRef(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [studentShowCount, setStudentShowCount] = useState(STUDENT_PAGE_SIZE);
  const [olatShowCount, setOlatShowCount] = useState(STUDENT_PAGE_SIZE);
  const studentPickerRef = useRef(null);

  const selectedStudent = form.student_id ? students.find((s) => studentId(s) === String(form.student_id)) : null;
  const studentDisplay = selectedStudent
    ? `${selectedStudent.fullName || selectedStudent.full_name || '–'} – ${selectedStudent.matric || selectedStudent.matric_number || '–'}`
    : '';

  const selectedOlatStudent = olatAddForm.student_id ? students.find((s) => studentId(s) === String(olatAddForm.student_id)) : null;
  const olatStudentDisplay = selectedOlatStudent
    ? `${selectedOlatStudent.fullName || selectedOlatStudent.full_name || '–'} – ${selectedOlatStudent.matric || selectedOlatStudent.matric_number || '–'}`
    : '';
  const filteredOlatStudents = olatAddStudentSearch.trim()
    ? students.filter((s) => {
        const name = (s.fullName || s.full_name || '').toLowerCase();
        const matric = (s.matric || s.matric_number || '').toLowerCase();
        const block = (s.block || s.block_name || '').toLowerCase();
        const kelas = (s.kelas || s.class_name || '').toLowerCase();
        const q = olatAddStudentSearch.trim().toLowerCase();
        return name.includes(q) || matric.includes(q) || block.includes(q) || kelas.includes(q);
      })
    : students;
  const showOlatStudents = filteredOlatStudents.slice(0, olatShowCount);

  const filteredStudents = studentSearch.trim()
    ? students.filter((s) => {
        const name = (s.fullName || s.full_name || '').toLowerCase();
        const matric = (s.matric || s.matric_number || '').toLowerCase();
        const block = (s.block || s.block_name || '').toLowerCase();
        const kelas = (s.kelas || s.class_name || '').toLowerCase();
        const q = studentSearch.trim().toLowerCase();
        return name.includes(q) || matric.includes(q) || block.includes(q) || kelas.includes(q);
      })
    : students;
  const showStudents = filteredStudents.slice(0, studentShowCount);

  useEffect(() => {
    function handleClickOutside(e) {
      if (studentPickerRef.current && !studentPickerRef.current.contains(e.target)) {
        setStudentPickerOpen(false);
      }
    }
    if (studentPickerOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [studentPickerOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, sectionsRes, offencesRes, olatRes, studentsRes, catRes] = await Promise.all([
        api.get('/api/discipline/stats'),
        api.get('/api/discipline/offences/sections'),
        api.get('/api/discipline/offences'),
        api.get('/api/discipline/olat'),
        api.get('/api/hostel/students').catch(() => ({ data: [] })),
        api.get('/api/discipline/olat/categories').catch(() => ({ data: { categories: [] } })),
      ]);
      setStats(statsRes.data);
      setSections(sectionsRes.data?.sections || []);
      setOffences(offencesRes.data || []);
      setOlatCases(olatRes.data || []);
      setStudents(studentsRes.data || []);
      setOlatCategories(Array.isArray(catRes.data?.categories) ? catRes.data.categories : []);
    } catch (e) {
      toast.error('Gagal memuatkan data disiplin');
    } finally {
      setLoading(false);
    }
  };

  const fetchOlatCategories = async () => {
    try {
      const res = await api.get('/api/discipline/olat/categories');
      setOlatCategories(Array.isArray(res.data?.categories) ? res.data.categories : []);
    } catch (e) {
      toast.error('Gagal memuatkan kategori OLAT');
    }
  };

  const fetchSections = async () => {
    try {
      const res = await api.get('/api/discipline/offences/sections');
      setSections(res.data?.sections || []);
    } catch (e) {
      toast.error('Gagal memuatkan seksyen rasmi');
    }
  };

  const openCategoryModal = (category = null) => {
    setEditingCategory(category);
    setCategoryForm({
      keyword: category?.keyword ?? '',
      label: category?.label ?? '',
    });
    setShowCategoryModal(true);
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setEditingCategory(null);
    setCategoryForm({ keyword: '', label: '' });
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    const keyword = (categoryForm.keyword || '').trim();
    const label = (categoryForm.label || '').trim();
    if (!keyword || !label) {
      toast.error('Sila isi keyword dan label');
      return;
    }
    setCategorySaving(true);
    try {
      if (editingCategory) {
        await api.put(`/api/discipline/olat/categories/${editingCategory.id}`, { keyword, label });
        toast.success('Kategori dikemaskini');
      } else {
        await api.post('/api/discipline/olat/categories', { keyword, label });
        toast.success('Kategori ditambah');
      }
      closeCategoryModal();
      await fetchOlatCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan');
    } finally {
      setCategorySaving(false);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Padam kategori ini? Kes OLAT yang menyekat outing akan guna senarai dari DB.')) return;
    setCategoryDeletingId(id);
    try {
      await api.delete(`/api/discipline/olat/categories/${id}`);
      toast.success('Kategori dipadam');
      await fetchOlatCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam');
    } finally {
      setCategoryDeletingId(null);
    }
  };

  const openSectionModal = (section = null) => {
    setEditingSection(section);
    setSectionForm({
      code: section?.code ?? '',
      label: section?.label ?? '',
    });
    setShowSectionModal(true);
  };

  const closeSectionModal = () => {
    setShowSectionModal(false);
    setEditingSection(null);
    setSectionForm({ code: '', label: '' });
  };

  const handleSaveSection = async (e) => {
    e.preventDefault();
    const code = (sectionForm.code || '').trim();
    const label = (sectionForm.label || '').trim();
    if (!code || !label) {
      toast.error('Sila isi kod dan label seksyen');
      return;
    }
    setSectionSaving(true);
    try {
      if (editingSection) {
        await api.put(`/api/discipline/offences/sections/${editingSection.id}`, { code, label });
        toast.success('Seksyen dikemaskini');
      } else {
        await api.post('/api/discipline/offences/sections', { code, label });
        toast.success('Seksyen ditambah');
      }
      closeSectionModal();
      await fetchSections();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan');
    } finally {
      setSectionSaving(false);
    }
  };

  const handleDeleteSection = async (id) => {
    if (!window.confirm('Padam seksyen ini? Hanya dibenarkan jika tiada rekod kesalahan menggunakan seksyen ini.')) return;
    setSectionDeletingId(id);
    try {
      await api.delete(`/api/discipline/offences/sections/${id}`);
      toast.success('Seksyen dipadam');
      await fetchSections();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam');
    } finally {
      setSectionDeletingId(null);
    }
  };

  const handleOlatCategoryToggle = (categoryId) => {
    setOlatAddForm((f) => {
      const ids = f.category_ids || [];
      const has = ids.includes(categoryId);
      return { ...f, category_ids: has ? ids.filter((id) => id !== categoryId) : [...ids, categoryId] };
    });
  };

  /** Warden tetapkan tarikh tahanan OLAT (Tahanan hingga) untuk kes sedia ada */
  const handleSetDetentionDate = async (caseId, dateStr) => {
    if (!dateStr) return;
    setUpdatingDetentionCaseId(caseId);
    try {
      await api.patch(`/api/discipline/olat/${caseId}`, { detention_end_date: dateStr });
      setOlatCases((prev) =>
        prev.map((o) => (o.id === caseId ? { ...o, detention_end_date: dateStr } : o))
      );
      toast.success('Tarikh tahanan dikemaskini');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal kemaskini tarikh tahanan');
    } finally {
      setUpdatingDetentionCaseId(null);
    }
  };

  const handleAddOlatSubmit = async (e) => {
    e.preventDefault();
    if (!olatAddForm.student_id || !olatAddForm.detention_end_date) {
      toast.error('Sila pilih pelajar dan isi tarikh maksima tahanan tidak boleh outing');
      return;
    }
    setOlatAddSaving(true);
    try {
      await api.post('/api/discipline/olat/manual', {
        student_id: String(olatAddForm.student_id),
        detention_end_date: olatAddForm.detention_end_date,
        catatan: olatAddForm.catatan || null,
        category_ids: Array.isArray(olatAddForm.category_ids) ? olatAddForm.category_ids : [],
      });
      toast.success('Pelajar ditambah ke senarai OLAT');
      setShowOlatAddModal(false);
      setOlatAddForm({ student_id: '', detention_end_date: '', catatan: '', category_ids: [] });
      setPastOlatCount(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menambah');
    } finally {
      setOlatAddSaving(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const fetchRiskData = async () => {
    try {
      const [summaryRes, profilesRes] = await Promise.all([
        api.get('/api/risk/summary'),
        api.get('/api/risk/profiles'),
      ]);
      setRiskSummary(summaryRes.data);
      setRiskProfiles(profilesRes.data?.profiles || []);
    } catch (e) {
      toast.error('Gagal memuatkan data risiko');
    }
  };

  useEffect(() => {
    if (tab === 'risk') fetchRiskData();
  }, [tab]);

  useEffect(() => {
    if (showForm) {
      setStudentSearch('');
      setStudentPickerOpen(false);
    }
  }, [showForm]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (olatAddPickerRef.current && !olatAddPickerRef.current.contains(e.target)) {
        setOlatAddPickerOpen(false);
      }
    }
    if (showOlatAddModal && olatAddPickerOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showOlatAddModal, olatAddPickerOpen]);

  useEffect(() => {
    if (!olatAddForm.student_id) {
      setPastOlatCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/api/discipline/olat/student/${olatAddForm.student_id}/count`);
        if (!cancelled) setPastOlatCount(res.data?.past_olat_count ?? 0);
      } catch {
        if (!cancelled) setPastOlatCount(null);
      }
    })();
    return () => { cancelled = true; };
  }, [olatAddForm.student_id]);

  const handleSubmitOffence = async (e) => {
    e.preventDefault();
    if (!form.student_id || !form.seksyen || !form.keterangan) {
      toast.error('Sila isi pelajar, seksyen dan keterangan');
      return;
    }
    try {
      await api.post('/api/discipline/offences', {
        student_id: form.student_id,
        seksyen: form.seksyen,
        keterangan: form.keterangan,
        tarikh_kesalahan: form.tarikh_kesalahan,
        tempat: form.tempat || null,
      });
      toast.success('Rekod kesalahan disimpan');
      setShowForm(false);
      setForm({ student_id: '', seksyen: '', keterangan: '', tarikh_kesalahan: new Date().toISOString().slice(0, 10), tempat: '' });
      setStudentSearch('');
      setStudentPickerOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="discipline-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-heading flex items-center gap-2">
            <Shield className="text-amber-600" size={28} />
            Disiplin & OLAT
          </h1>
          <p className="text-slate-500 mt-1">Log kesalahan ikut seksyen rasmi MRSM; rekod OLAT</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" title="Muat semula">
            <RefreshCw size={20} />
          </button>
          <Button onClick={() => { setShowForm(true); setStudentShowCount(STUDENT_PAGE_SIZE); }}>
            <Plus size={18} /> Log Kesalahan
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 rounded-lg">
              <FileText className="text-amber-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Jumlah Kesalahan</p>
              <p className="text-2xl font-bold text-slate-900">{stats?.total_offences ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 rounded-lg">
              <AlertTriangle className="text-orange-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Menunggu Tindakan</p>
              <p className="text-2xl font-bold text-orange-600">{stats?.pending_offences ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 rounded-lg">
              <Shield className="text-red-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Kes OLAT</p>
              <p className="text-2xl font-bold text-red-600">{stats?.total_olat_cases ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-100 rounded-lg">
              <User className="text-slate-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">OLAT Terbuka</p>
              <p className="text-2xl font-bold text-slate-800">{stats?.open_olat_cases ?? 0}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
            <h3 className="text-lg font-semibold mb-4">Log Kesalahan Disiplin</h3>
            <form onSubmit={handleSubmitOffence} className="space-y-4">
              {/* Pilih pelajar – cari nama, no matrik, blok atau kelas */}
              <div className="relative" ref={studentPickerRef}>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pelajar *</label>
                {selectedStudent ? (
                  <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2.5 bg-slate-50">
                    <span className="flex-1 text-slate-900 font-medium">{studentDisplay}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((f) => ({ ...f, student_id: '' }));
                        setStudentSearch('');
                        setStudentPickerOpen(true);
                        setStudentShowCount(STUDENT_PAGE_SIZE);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Tukar pelajar"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => {
                        setStudentSearch(e.target.value);
                        setStudentPickerOpen(true);
                        setStudentShowCount(STUDENT_PAGE_SIZE);
                      }}
                      onFocus={() => setStudentPickerOpen(true)}
                      placeholder="Cari nama, no matrik, blok atau kelas..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      autoComplete="off"
                    />
                    {studentPickerOpen && (
                      <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl max-h-[320px] overflow-y-auto">
                        {students.length > STUDENT_PAGE_SIZE && !studentSearch.trim() && (
                          <p className="px-3 py-2.5 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
                            Lebih {STUDENT_PAGE_SIZE} pelajar. Taip nama, no matrik, blok atau kelas untuk menapis.
                          </p>
                        )}
                        {showStudents.length === 0 ? (
                          <p className="px-3 py-4 text-slate-500 text-sm text-center">Tiada pelajar sepadan. Cuba kata kunci lain.</p>
                        ) : (
                          <ul className="py-1">
                            {showStudents.map((s) => {
                              const sid = studentId(s);
                              const block = s.block || s.block_name || '';
                              const kelas = s.kelas || s.class_name || '';
                              const sub = [block, kelas].filter(Boolean).join(' · ');
                              return (
                                <li key={sid}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setForm((f) => ({ ...f, student_id: sid }));
                                      setStudentSearch('');
                                      setStudentPickerOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-amber-50 focus:bg-amber-50 focus:outline-none border-b border-slate-50 last:border-0"
                                  >
                                    <span className="font-medium text-slate-900 block">{s.fullName || s.full_name || '–'}</span>
                                    <span className="text-slate-500 text-xs mt-0.5 block">
                                      {s.matric || s.matric_number || '–'}
                                      {sub ? ` · ${sub}` : ''}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {filteredStudents.length > studentShowCount && (
                          <div className="sticky bottom-0 border-t border-slate-100 bg-slate-50 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setStudentShowCount((c) => c + STUDENT_PAGE_SIZE)}
                              className="w-full text-center text-sm font-medium text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded py-2"
                            >
                              Tunjuk 50 lagi ({studentShowCount} daripada {filteredStudents.length})
                            </button>
                          </div>
                        )}
                        {filteredStudents.length > 0 && filteredStudents.length <= studentShowCount && filteredStudents.length > 5 && (
                          <p className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100">
                            {filteredStudents.length} pelajar sepadan
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
                {!form.student_id && (
                  <p className="text-xs text-slate-500 mt-1">Taip nama, no matrik, blok atau kelas untuk cari pelajar</p>
                )}
              </div>
              <Select label="Seksyen Rasmi" value={form.seksyen} onChange={(e) => setForm({ ...form, seksyen: e.target.value })} required>
                <option value="">Pilih seksyen</option>
                {sections.map((sec) => (
                  <option key={sec.code} value={sec.code}>{sec.label}</option>
                ))}
              </Select>
              <Input label="Tarikh Kesalahan" type="date" value={form.tarikh_kesalahan} onChange={(e) => setForm({ ...form, tarikh_kesalahan: e.target.value })} />
              <Input label="Tempat (pilihan)" value={form.tempat} onChange={(e) => setForm({ ...form, tempat: e.target.value })} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Keterangan *</label>
                <textarea className="w-full border rounded-lg px-3 py-2 min-h-[80px]" value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} required />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
                <Button type="submit">Simpan</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        <button className={`px-4 py-2 font-medium ${tab === 'offences' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-500'}`} onClick={() => setTab('offences')}>
          Rekod Kesalahan
        </button>
        <button className={`px-4 py-2 font-medium ${tab === 'olat' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-500'}`} onClick={() => setTab('olat')}>
          Kes OLAT
        </button>
        <button className={`px-4 py-2 font-medium ${tab === 'kenaOlat' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-500'}`} onClick={() => setTab('kenaOlat')}>
          Kena OLAT
        </button>
        <button className={`px-4 py-2 font-medium ${tab === 'categories' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-500'}`} onClick={() => setTab('categories')}>
          Kategori OLAT
        </button>
        <button className={`px-4 py-2 font-medium ${tab === 'sections' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-500'}`} onClick={() => setTab('sections')}>
          Seksyen Rasmi
        </button>
        <button className={`px-4 py-2 font-medium ${tab === 'risk' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-500'}`} onClick={() => setTab('risk')}>
          Risiko Disiplin (AI)
        </button>
      </div>

      {tab === 'offences' && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Senarai Kesalahan (live)</h2>
          {offences.length === 0 ? (
            <p className="text-slate-500 py-6 text-center">Tiada rekod kesalahan</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-slate-600 text-left">
                    <th className="py-2 pr-4">Pelajar</th>
                    <th className="py-2 pr-4">Seksyen</th>
                    <th className="py-2 pr-4">Tarikh</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">OLAT</th>
                  </tr>
                </thead>
                <tbody>
                  {offences.map((o) => (
                    <tr key={o.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4">{o.student_name} ({o.student_matric})</td>
                      <td className="py-2 pr-4">{o.seksyen_display || o.seksyen}</td>
                      <td className="py-2 pr-4">{o.tarikh_kesalahan}</td>
                      <td className="py-2 pr-4">{STATUS_LABEL[o.status] || o.status}</td>
                      <td className="py-2 pr-4">{o.olat_case_id ? <CheckCircle size={16} className="text-emerald-600" /> : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'olat' && (
        <Card>
          <h2 className="text-lg font-semibold mb-2">Kes OLAT</h2>
          <p className="text-sm text-slate-500 mb-4">Kes OLAT yang menyekat outing mingguan. Tambah pelajar ke senarai OLAT di tab &quot;Kena OLAT&quot;. Urus kategori di tab &quot;Kategori OLAT&quot;.</p>
          {olatCases.length === 0 ? (
            <p className="text-slate-500 py-6 text-center">Tiada kes OLAT</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-slate-600 text-left">
                    <th className="py-2 pr-4">No. Kes</th>
                    <th className="py-2 pr-4">Pelajar</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Tarikh Akhir Tahanan</th>
                    <th className="py-2 pr-4">Dibuka</th>
                  </tr>
                </thead>
                <tbody>
                  {olatCases.map((o) => (
                    <tr key={o.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-mono">{o.case_number}</td>
                      <td className="py-2 pr-4">{o.student_name}</td>
                      <td className="py-2 pr-4">{OLAT_STATUS_LABEL[o.status] || o.status}</td>
                      <td className="py-2 pr-4">{o.detention_end_date || '-'}</td>
                      <td className="py-2 pr-4">{o.opened_at ? new Date(o.opened_at).toLocaleDateString('ms-MY') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'kenaOlat' && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Kena OLAT</h2>
              <p className="text-sm text-slate-500 mt-1">Senarai pelajar yang sedang kena OLAT (denda tidak boleh outing). Tetapkan <strong>Tahanan Hingga</strong> untuk setiap pelajar; tarikh tersebut menentukan sehingga bila pelajar tidak dibenarkan outing. Tambah pelajar melalui butang di bawah.</p>
            </div>
            <Button onClick={() => { setShowOlatAddModal(true); setOlatAddForm({ student_id: '', detention_end_date: '', catatan: '', category_ids: [] }); setPastOlatCount(null); setOlatAddStudentSearch(''); setOlatAddPickerOpen(false); setOlatShowCount(STUDENT_PAGE_SIZE); }}>
              <Plus size={18} /> Tambah Pelajar ke OLAT
            </Button>
          </div>
          {(() => {
            const openCases = olatCases.filter((o) => o.status === 'open');
            if (openCases.length === 0) {
              return <p className="text-slate-500 py-6 text-center">Tiada pelajar dalam senarai kena OLAT. Klik &quot;Tambah Pelajar ke OLAT&quot; untuk menambah.</p>;
            }
            const getJantina = (id) => {
              const s = students.find((st) => studentId(st) === String(id));
              const g = s?.gender || s?.jantina || '';
              if (!g) return '–';
              return (g.toLowerCase().includes('lelaki') || g === 'male' || g === 'L') ? 'L' : (g.toLowerCase().includes('perempuan') || g === 'female' || g === 'P') ? 'P' : g;
            };
            const getKesalahanLabels = (caseRow) => {
              const ids = caseRow.category_ids || [];
              if (ids.length === 0) return caseRow.catatan || '–';
              return ids.map((cid) => olatCategories.find((c) => c.id === cid)?.label || cid).filter(Boolean).join(', ') || '–';
            };
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-600 text-left">
                      <th className="py-2 pr-2 w-12">Bil.</th>
                      <th className="py-2 pr-4">No. Maktab</th>
                      <th className="py-2 pr-4 w-16">Jantina</th>
                      <th className="py-2 pr-4">Tahanan Hingga</th>
                      <th className="py-2 pr-4">Kesalahan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openCases.map((o, idx) => (
                      <tr key={o.id} className="border-b border-slate-100">
                        <td className="py-2 pr-2 text-slate-600">{idx + 1}</td>
                        <td className="py-2 pr-4 font-mono font-medium">{o.student_matric || '–'}</td>
                        <td className="py-2 pr-4">{getJantina(o.student_id)}</td>
                        <td className="py-2 pr-4">
                          <input
                            type="date"
                            value={o.detention_end_date || ''}
                            onChange={(e) => handleSetDetentionDate(o.id, e.target.value)}
                            disabled={updatingDetentionCaseId === o.id}
                            className="border border-slate-200 rounded px-2 py-1.5 text-sm min-w-[140px] focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-60"
                          />
                          {updatingDetentionCaseId === o.id && <Spinner size="sm" className="ml-1 inline" />}
                        </td>
                        <td className="py-2 pr-4 text-slate-700">{getKesalahanLabels(o)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </Card>
      )}

      {tab === 'categories' && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Kategori OLAT</h2>
              <p className="text-sm text-slate-500 mt-1">Kategori kesalahan yang menyebabkan pelajar tersenarai dalam OLAT (menyekat outing &amp; pulang bermalam). Warden boleh tambah, edit dan padam kategori.</p>
            </div>
            <Button onClick={() => openCategoryModal()}>
              <Plus size={18} /> Tambah Kategori
            </Button>
          </div>
          {olatCategories.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">Tiada kategori. Klik &quot;Tambah Kategori&quot; — sistem akan isi kategori default jika kosong.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {olatCategories.map((c, idx) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-700 font-bold text-sm mr-2">
                      {idx + 1}
                    </span>
                    <p className="font-medium text-slate-900 mt-1">{c.label || '–'}</p>
                    <p className="text-sm text-slate-500 font-mono mt-0.5">Keyword: {c.keyword || '–'}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openCategoryModal(c)}
                      className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(c.id)}
                      disabled={categoryDeletingId === c.id}
                      className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                      title="Padam"
                    >
                      {categoryDeletingId === c.id ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'sections' && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Seksyen Rasmi</h2>
              <p className="text-sm text-slate-500 mt-1">Senarai seksyen rasmi kesalahan disiplin (Panduan Pengurusan Disiplin Pelajar MRSM). Digunakan dalam modal Log Kesalahan. Warden boleh tambah, edit dan padam seksyen.</p>
            </div>
            <Button onClick={() => openSectionModal()}>
              <Plus size={18} /> Tambah Seksyen
            </Button>
          </div>
          {sections.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">Tiada seksyen. Klik &quot;Tambah Seksyen&quot; — sistem akan isi seksyen default jika kosong.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sections.map((sec, idx) => (
                <div
                  key={sec.id || sec.code}
                  className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-700 font-bold text-sm mr-2">
                      {idx + 1}
                    </span>
                    <p className="font-medium text-slate-900 mt-1">{sec.label || '–'}</p>
                    <p className="text-sm text-slate-500 font-mono mt-0.5">Kod: {sec.code || '–'}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openSectionModal(sec)}
                      className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSection(sec.id)}
                      disabled={sectionDeletingId === sec.id}
                      className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                      title="Padam"
                    >
                      {sectionDeletingId === sec.id ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'risk' && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Risiko Disiplin (data live dari Pangkalan Data)</h2>
          {riskSummary && (
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-sm text-emerald-700">Rendah</p>
                <p className="text-xl font-bold text-emerald-800">{riskSummary.low ?? 0}</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-700">Sederhana</p>
                <p className="text-xl font-bold text-amber-800">{riskSummary.medium ?? 0}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-700">Tinggi</p>
                <p className="text-xl font-bold text-red-800">{riskSummary.high ?? 0}</p>
              </div>
            </div>
          )}
          {riskProfiles.length === 0 ? (
            <p className="text-slate-500 py-6 text-center">Tiada profil risiko (atau tiada rekod disiplin/pergerakan)</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-slate-600 text-left">
                    <th className="py-2 pr-4">Pelajar</th>
                    <th className="py-2 pr-4">Skor</th>
                    <th className="py-2 pr-4">Banding</th>
                    <th className="py-2 pr-4">Kesalahan</th>
                    <th className="py-2 pr-4">OLAT Terbuka</th>
                    <th className="py-2 pr-4">Lewat Balik</th>
                  </tr>
                </thead>
                <tbody>
                  {riskProfiles.map((p) => (
                    <tr key={p.student_id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-medium">{p.student_name}</td>
                      <td className="py-2 pr-4">{p.score}</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          p.band === 'high' ? 'bg-red-100 text-red-800' :
                          p.band === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {p.band === 'high' ? 'Tinggi' : p.band === 'medium' ? 'Sederhana' : 'Rendah'}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{p.factors?.offences_count ?? 0}</td>
                      <td className="py-2 pr-4">{p.factors?.olat_open_count ?? 0}</td>
                      <td className="py-2 pr-4">{p.factors?.late_returns_count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Modal Tambah Pelajar ke OLAT (Kena OLAT) */}
      {showOlatAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
            <h3 className="text-lg font-semibold mb-4">Tambah Pelajar ke OLAT (Kena OLAT)</h3>
            <form onSubmit={handleAddOlatSubmit} className="space-y-4">
              <div className="relative" ref={olatAddPickerRef}>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pelajar *</label>
                {selectedOlatStudent ? (
                  <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2.5 bg-slate-50">
                    <span className="flex-1 text-slate-900 font-medium">{olatStudentDisplay}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setOlatAddForm((f) => ({ ...f, student_id: '' }));
                        setOlatAddStudentSearch('');
                        setOlatAddPickerOpen(true);
                        setOlatShowCount(STUDENT_PAGE_SIZE);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Tukar pelajar"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={olatAddStudentSearch}
                      onChange={(e) => {
                        setOlatAddStudentSearch(e.target.value);
                        setOlatAddPickerOpen(true);
                        setOlatShowCount(STUDENT_PAGE_SIZE);
                      }}
                      onFocus={() => setOlatAddPickerOpen(true)}
                      placeholder="Cari nama, no matrik, blok atau kelas..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      autoComplete="off"
                    />
                    {olatAddPickerOpen && (
                      <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl max-h-[320px] overflow-y-auto">
                        {students.length > STUDENT_PAGE_SIZE && !olatAddStudentSearch.trim() && (
                          <p className="px-3 py-2.5 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
                            Lebih {STUDENT_PAGE_SIZE} pelajar. Taip nama, no matrik, blok atau kelas untuk menapis.
                          </p>
                        )}
                        {showOlatStudents.length === 0 ? (
                          <p className="px-3 py-4 text-slate-500 text-sm text-center">Tiada pelajar sepadan. Cuba kata kunci lain.</p>
                        ) : (
                          <ul className="py-1">
                            {showOlatStudents.map((s) => {
                              const sid = studentId(s);
                              const block = s.block || s.block_name || '';
                              const kelas = s.kelas || s.class_name || '';
                              const sub = [block, kelas].filter(Boolean).join(' · ');
                              return (
                                <li key={sid}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOlatAddForm((f) => ({ ...f, student_id: sid }));
                                      setOlatAddStudentSearch('');
                                      setOlatAddPickerOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-amber-50 focus:bg-amber-50 focus:outline-none border-b border-slate-50 last:border-0"
                                  >
                                    <span className="font-medium text-slate-900 block">{s.fullName || s.full_name || '–'}</span>
                                    <span className="text-slate-500 text-xs mt-0.5 block">
                                      {s.matric || s.matric_number || '–'}
                                      {sub ? ` · ${sub}` : ''}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {filteredOlatStudents.length > olatShowCount && (
                          <div className="sticky bottom-0 border-t border-slate-100 bg-slate-50 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setOlatShowCount((c) => c + STUDENT_PAGE_SIZE)}
                              className="w-full text-center text-sm font-medium text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded py-2"
                            >
                              Tunjuk 50 lagi ({olatShowCount} daripada {filteredOlatStudents.length})
                            </button>
                          </div>
                        )}
                        {filteredOlatStudents.length > 0 && filteredOlatStudents.length <= olatShowCount && filteredOlatStudents.length > 5 && (
                          <p className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100">
                            {filteredOlatStudents.length} pelajar sepadan
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              {pastOlatCount !== null && (
                <p className="text-sm text-slate-600 bg-slate-100 rounded-lg px-3 py-2">
                  Jumlah kesalahan OLAT yang pernah pelajar ini lakukan sebelum ini: <strong>{pastOlatCount}</strong>
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Kategori OLAT (pilihan pihak warden)</label>
                {olatCategories.length === 0 ? (
                  <p className="text-sm text-slate-500">Tiada kategori dalam pangkalan data. Tambah di tab Kategori OLAT.</p>
                ) : (
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 max-h-40 overflow-y-auto">
                    {olatCategories.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100/80 rounded px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={(olatAddForm.category_ids || []).includes(c.id)}
                          onChange={() => handleOlatCategoryToggle(c.id)}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm text-slate-800">{c.label || c.keyword || c.id}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <Input
                label="Tarikh maksima tahanan tidak boleh outing *"
                type="date"
                value={olatAddForm.detention_end_date}
                onChange={(e) => setOlatAddForm((f) => ({ ...f, detention_end_date: e.target.value }))}
                required
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Catatan (pilihan)</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 min-h-[60px]"
                  value={olatAddForm.catatan}
                  onChange={(e) => setOlatAddForm((f) => ({ ...f, catatan: e.target.value }))}
                  placeholder="Catatan untuk kes OLAT"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { setShowOlatAddModal(false); setPastOlatCount(null); }}>Batal</Button>
                <Button type="submit" disabled={olatAddSaving}>{olatAddSaving ? <Spinner size="sm" /> : 'Tambah ke OLAT'}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal Tambah/Edit Kategori OLAT */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={closeCategoryModal}>
          <Card className="w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingCategory ? 'Edit Kategori OLAT' : 'Tambah Kategori OLAT'}
              </h3>
              <button type="button" onClick={closeCategoryModal} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <Input
                label="Keyword (padanan dalam keterangan kesalahan)"
                value={categoryForm.keyword}
                onChange={(e) => setCategoryForm((f) => ({ ...f, keyword: e.target.value }))}
                placeholder="cth. belum pulang"
                required
              />
              <Input
                label="Label (paparan)"
                value={categoryForm.label}
                onChange={(e) => setCategoryForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="cth. Belum pulang ke asrama tanpa sebab"
                required
              />
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeCategoryModal}>
                  Batal
                </Button>
                <Button type="submit" disabled={categorySaving}>
                  {categorySaving ? <Spinner size="sm" /> : (editingCategory ? 'Kemaskini' : 'Tambah')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal Tambah/Edit Seksyen Rasmi */}
      {showSectionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen" onClick={closeSectionModal}>
          <Card className="w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingSection ? 'Edit Seksyen Rasmi' : 'Tambah Seksyen Rasmi'}
              </h3>
              <button type="button" onClick={closeSectionModal} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveSection} className="space-y-4">
              <Input
                label="Kod seksyen"
                value={sectionForm.code}
                onChange={(e) => setSectionForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="cth. 3_1_am"
                required
              />
              <Input
                label="Label (paparan)"
                value={sectionForm.label}
                onChange={(e) => setSectionForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="cth. Peraturan Am / Tatatertib Umum"
                required
              />
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeSectionModal}>
                  Batal
                </Button>
                <Button type="submit" disabled={sectionSaving}>
                  {sectionSaving ? <Spinner size="sm" /> : (editingSection ? 'Kemaskini' : 'Tambah')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
