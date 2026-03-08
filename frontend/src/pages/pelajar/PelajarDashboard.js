import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { GraduationCap, BookOpen, Building, DoorOpen, Activity, Wallet, Check, AlertCircle, AlertTriangle, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../App';
import { Card, Badge, Spinner, StatCard } from '../../components/common';

export const PelajarDashboard = () => {
  const [data, setData] = useState(null);
  const [olatBlock, setOlatBlock] = useState({ blocked: false, reason: '', detention_end_date: null });
  const [loading, setLoading] = useState(true);
  const authContext = useAuth();
  const user = authContext?.user;

  useEffect(() => {
    const fetch = async () => {
      try {
        const [dashRes, blockRes] = await Promise.all([
          api.get('/api/dashboard/pelajar'),
          user?.role === 'pelajar' ? api.get('/api/hostel/my-olat-outing-block').catch(() => ({ data: { blocked: false } })) : Promise.resolve({ data: {} }),
        ]);
        setData(dashRes.data);
        setOlatBlock(blockRes.data || { blocked: false, reason: '', detention_end_date: null });
      } catch { toast.error('Gagal memuatkan'); }
      finally { setLoading(false); }
    };
    fetch();
  }, [user?.role]);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="pelajar-dashboard">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 font-heading">Selamat Datang, {user?.full_name}</h1>
        <p className="text-slate-600">Portal Pelajar Hostel</p>
      </div>

      {/* Student Info Card */}
      {data?.student && (
        <Card className="bg-gradient-to-r from-primary-50 to-white">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-primary-700 rounded-full flex items-center justify-center">
              <GraduationCap className="text-white" size={32} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-slate-900 truncate">{data.student.full_name}</h2>
              <p className="text-slate-600 text-sm sm:text-base">No. Matrik: {data.student.matric_number}</p>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2 text-slate-600"><GraduationCap size={16} />Tingkatan {data.student.form}</div>
                <div className="flex items-center gap-2 text-slate-600"><BookOpen size={16} />Kelas {data.student.class_name}</div>
                <div className="flex items-center gap-2 text-slate-600"><Building size={16} />{data.student.block_name}</div>
                <div className="flex items-center gap-2 text-slate-600"><DoorOpen size={16} />Bilik/Katil {data.student.room_number}</div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Wallet} label="Jumlah Yuran" value={`RM ${(data?.total_fees || 0).toFixed(2)}`} color="secondary" />
        <StatCard icon={Check} label="Sudah Dibayar" value={`RM ${(data?.total_paid || 0).toFixed(2)}`} color="success" />
        <StatCard icon={AlertCircle} label="Tertunggak" value={`RM ${(data?.outstanding || 0).toFixed(2)}`} color={data?.outstanding > 0 ? 'danger' : 'success'} />
      </div>

      {/* OLAT: Pelajar kena tahanan – butang mohon outing disable sehingga tarikh tahanan */}
      {olatBlock.blocked && (
        <Card className="bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={22} />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800">Anda sedang dalam tahanan OLAT</h3>
              <p className="text-sm text-amber-700 mt-1">{olatBlock.reason}</p>
              {olatBlock.detention_end_date && (
                <p className="text-sm font-medium text-amber-800 mt-2">
                  Butang permohonan outing akan tersedia selepas: <strong>{new Date(olatBlock.detention_end_date).toLocaleDateString('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong>.
                </p>
              )}
            </div>
            <Link to="/pelajar/hostel" className="min-h-[44px] min-w-[44px] inline-flex items-center gap-1 text-amber-700 font-medium hover:text-amber-900 shrink-0">
              Ke halaman Hostel <ChevronRight size={18} />
            </Link>
          </div>
        </Card>
      )}

      {/* Hostel Records */}
      <Card>
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><DoorOpen size={20} />Rekod Keluar/Masuk Asrama</h3>
        {data?.hostel_records?.length > 0 ? (
          <div className="space-y-3">
            {data.hostel_records.map((record, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">{record.kategori === 'lawatan' ? 'Lawatan' : record.kategori === 'sakit' ? 'Sakit' : record.kategori === 'pertandingan' ? 'Pertandingan' : record.kategori === 'kecemasan' ? 'Kecemasan' : 'Program Rasmi'}</p>
                  <p className="text-sm text-slate-500">{record.tarikh_keluar}</p>
                </div>
                <Badge status={record.check_type === 'keluar' ? 'pending' : 'approved'}>{record.check_type === 'keluar' ? 'Keluar' : 'Masuk'}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-4">Tiada rekod keluar/masuk</p>
        )}
      </Card>

      {/* Sickbay Records */}
      <Card>
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Activity size={20} />Rekod Bilik Sakit</h3>
        {data?.sickbay_records?.length > 0 ? (
          <div className="space-y-3">
            {data.sickbay_records.map((record, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">{record.symptoms}</p>
                  <p className="text-sm text-slate-500">{record.check_in_time}</p>
                </div>
                <Badge status={record.check_out_time ? 'approved' : 'pending'}>{record.check_out_time ? 'Keluar' : 'Dalam Rawatan'}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-4">Tiada rekod bilik sakit</p>
        )}
      </Card>
    </div>
  );
};

export default PelajarDashboard;
