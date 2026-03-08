import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bus, MapPinned, ArrowLeft, RefreshCw } from 'lucide-react';
import api from '../../services/api';

const DEFAULT_CENTER = { lat: 3.7725, lng: 103.2172 }; // Malaysia
const POLL_INTERVAL_MS = 5000;

function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve) => {
    if (window.google?.maps) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey || 'NO_KEY'}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export default function BusLiveMapPage() {
  const { tripId: paramTripId } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  const [tripId, setTripId] = useState(paramTripId || '');
  const [bookings, setBookings] = useState([]);
  const [tripInfo, setTripInfo] = useState(null);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    api.get('/api/bus/bookings')
      .then((res) => setBookings(res.data || []))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (paramTripId) setTripId(paramTripId);
  }, [paramTripId]);

  useEffect(() => {
    if (!tripId) {
      setTripInfo(null);
      setLocation(null);
      return;
    }
    api.get(`/api/bus/trips/${tripId}/map-info`)
      .then((res) => setTripInfo(res.data))
      .catch(() => setTripInfo(null));
    api.get(`/api/bus/live-location/${tripId}`)
      .then((res) => {
        if (res.data?.lat != null && res.data?.lng != null) setLocation(res.data);
        else setLocation(null);
      })
      .catch(() => setLocation(null));
  }, [tripId]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!tripId) return;
      api.get(`/api/bus/live-location/${tripId}`)
        .then((res) => {
          if (res.data?.lat != null && res.data?.lng != null) setLocation(res.data);
        })
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [tripId]);

  useEffect(() => {
    if (!apiKey || apiKey === 'NO_KEY') {
      setMapReady(false);
      return;
    }
    loadGoogleMapsScript(apiKey).then(() => setMapReady(true));
  }, [apiKey]);

  useEffect(() => {
    if (!mapReady || !window.google?.maps || !mapRef.current) return;
    const center = location ? { lat: location.lat, lng: location.lng } : DEFAULT_CENTER;
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        zoom: 14,
        center,
        mapTypeControl: true,
        fullscreenControl: true,
      });
    }
    if (location) {
      mapInstanceRef.current.setCenter({ lat: location.lat, lng: location.lng });
      if (markerRef.current) {
        markerRef.current.setPosition({ lat: location.lat, lng: location.lng });
      } else {
        markerRef.current = new window.google.maps.Marker({
          position: { lat: location.lat, lng: location.lng },
          map: mapInstanceRef.current,
          title: location.plate_number || 'Bas',
          label: {
            text: location.plate_number || 'BAS',
            color: 'white',
            fontSize: '12px',
            fontWeight: 'bold',
          },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 20,
            fillColor: '#0d9488',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        });
      }
    } else if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
  }, [mapReady, location]);

  const uniqueTrips = [...new Map(bookings.filter((b) => b.trip_id).map((b) => [b.trip_id, b])).values()];

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/bus-tickets')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <MapPinned className="text-cyan-600" size={24} /> Peta Live Bas
          </h1>
          <p className="text-sm text-slate-500">Pergerakan bas secara live. Pilih trip untuk lihat lokasi semasa.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">Pilih trip (dari tempahan anda)</label>
        <select
          value={tripId}
          onChange={(e) => setTripId(e.target.value)}
          className="w-full max-w-md rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-cyan-500"
        >
          <option value="">-- Pilih trip --</option>
          {uniqueTrips.map((b) => (
            <option key={b.trip_id} value={b.trip_id}>
              {b.route_name} · {b.departure_date} {b.departure_time} {b.bus_plate ? `· ${b.bus_plate}` : ''}
            </option>
          ))}
        </select>
        {tripInfo && (
          <div className="mt-3 flex items-center gap-2 text-slate-600">
            <Bus size={18} />
            <span className="font-medium text-cyan-700">{tripInfo.bus_plate}</span>
            <span>{tripInfo.route_name}</span>
            {location ? (
              <span className="text-emerald-600 text-sm">· Lokasi live dikemas kini</span>
            ) : (
              <span className="text-amber-600 text-sm">· Menunggu lokasi dari pemandu</span>
            )}
          </div>
        )}
      </div>

      {!apiKey || apiKey === 'NO_KEY' ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-800">
          <p className="font-medium">Peta Google Maps memerlukan API key.</p>
          <p className="text-sm mt-1">Sila set <code className="bg-amber-100 px-1 rounded">REACT_APP_GOOGLE_MAPS_API_KEY</code> dalam fail <code className="bg-amber-100 px-1 rounded">.env</code> dan build semula.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" style={{ height: '500px' }}>
          <div ref={mapRef} className="w-full h-full" />
        </div>
      )}

      {tripInfo && location && (
        <div className="text-xs text-slate-500">
          Kemas kini terakhir: {location.updated_at ? new Date(location.updated_at).toLocaleTimeString('ms-MY') : '–'}
        </div>
      )}
    </div>
  );
}
