import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Bus, Users, MapPin, ArrowLeft, Radio, StopCircle, MapPinned } from 'lucide-react';
import api from '../../services/api';

const POLL_INTERVAL_MS = 10000; // hantar lokasi setiap 10 saat

export default function DriverBasTripPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const watchIdRef = useRef(null);

  useEffect(() => {
    api.get(`/api/bus/driver/trips/${tripId}/students`)
      .then((res) => setData(res.data))
      .catch(() => toast.error('Gagal memuatkan data trip'))
      .finally(() => setLoading(false));
  }, [tripId]);

  const sendLocation = (lat, lng) => {
    api.post('/api/bus/driver/location', { trip_id: tripId, lat, lng })
      .then(() => {})
      .catch(() => toast.error('Gagal hantar lokasi'));
  };

  const startSharing = () => {
    if (!navigator.geolocation) {
      toast.error('Pelayar tidak menyokong geolokasi');
      return;
    }
    setSharing(true);
    const send = (position) => {
      if (position?.coords) {
        const { latitude, longitude } = position.coords;
        sendLocation(latitude, longitude);
      }
    };
    const onError = () => toast.error('Tidak dapat dapatkan lokasi');
    navigator.geolocation.getCurrentPosition(send, onError);
    watchIdRef.current = navigator.geolocation.watchPosition(
      send,
      onError,
      { enableHighAccuracy: true, maximumAge: POLL_INTERVAL_MS, timeout: 10000 }
    );
    toast.success('Lokasi bas dikongsi. Ibu bapa boleh lihat peta live.');
  };

  const stopSharing = () => {
    if (watchIdRef.current != null && navigator.geolocation.clearWatch) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
    toast.success('Berhenti berkongsi lokasi');
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && navigator.geolocation.clearWatch) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-slate-600">Trip tidak dijumpai.</p>
        <button type="button" onClick={() => navigate('/driver-bas')} className="min-h-[44px] px-4 py-2 mt-4 text-cyan-600 font-medium">← Kembali</button>
      </div>
    );
  }

  const students = data.students ?? [];
  const { count_by_checkpoint, bus_plate, route_name, origin, destination, departure_date, departure_time, total_seats, student_count } = data;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/driver-bas')} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{route_name}</h1>
          <p className="text-sm text-slate-500">{origin} → {destination} · {departure_date} {departure_time}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold text-cyan-700">{bus_plate}</span>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm">
              {student_count} / {total_seats} pelajar
            </span>
          </div>
          <div>
            {!sharing ? (
              <button
                type="button"
                onClick={startSharing}
                className="flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700"
              >
                <Radio size={18} /> Kongsi lokasi (Live)
              </button>
            ) : (
              <button
                type="button"
                onClick={stopSharing}
                className="flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700"
              >
                <StopCircle size={18} /> Berhenti kongsi
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">Apabila dikongsi, ibu bapa boleh melihat pergerakan bas secara live di peta.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
          <MapPinned size={18} /> Bilangan pelajar ikut checkpoint (drop-off)
        </h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(count_by_checkpoint || {}).map(([point, count]) => (
            <span key={point} className="px-4 py-2 rounded-xl bg-cyan-50 text-cyan-800 font-medium">
              {point}: {count} pelajar
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <h3 className="font-semibold text-slate-800 p-4 flex items-center gap-2 border-b border-slate-100">
          <Users size={18} /> Senarai pelajar menaiki bas
        </h3>
        <div className="divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
          {students.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Tiada pelajar dalam trip ini.</div>
          ) : (
            students.map((s) => (
              <div key={s.booking_id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900">{s.student_name}</p>
                  <p className="text-sm text-slate-500">{s.matric_number} {s.assigned_seat ? `· Kerusi ${s.assigned_seat}` : ''}</p>
                </div>
                <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-sm flex items-center gap-1">
                  <MapPin size={14} /> {s.drop_off_point || '–'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
