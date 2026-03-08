import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Building, Bus, MapPinned, Calendar, Ticket, Plus, Edit, Trash2, X,
  Users, MapPin, ArrowRight
} from 'lucide-react';
import { useAuth } from '../../../App';
import api from '../../../services/api';

// Simple Components
const Spinner = ({ size = 'md' }) => <div className={`spinner ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>;

const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => {
  const variants = {
    primary: 'bg-primary-700 hover:bg-primary-900 text-white shadow-sm hover:shadow-md',
    secondary: 'bg-secondary-600 hover:bg-amber-700 text-white',
    outline: 'border-2 border-primary-700 text-primary-700 hover:bg-primary-50',
    ghost: 'text-slate-600 hover:text-primary-700 hover:bg-slate-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`font-medium rounded-lg transition-all btn-click flex items-center justify-center gap-2 ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : null}{children}
    </button>
  );
};

const Input = ({ label, error, icon: Icon, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
    <div className="relative">
      {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon size={18} /></div>}
      <input className={`flex h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${Icon ? 'pl-10' : ''} ${error ? 'border-red-500' : 'border-slate-200'}`} {...props} />
    </div>
    {error && <p className="text-sm text-red-500">{error}</p>}
  </div>
);

const Badge = ({ status, children }) => {
  const styles = { approved: 'bg-emerald-100 text-emerald-800', pending: 'bg-amber-100 text-amber-800', rejected: 'bg-red-100 text-red-800', paid: 'bg-emerald-100 text-emerald-800', partial: 'bg-blue-100 text-blue-800', overdue: 'bg-red-100 text-red-800', active: 'bg-emerald-100 text-emerald-800', inactive: 'bg-red-100 text-red-800' };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-800'}`}>{children}</span>;
};

export const AdminBusManagementPage = () => {
  const { user } = useAuth();
  const isBusAdmin = user?.role === 'bus_admin';
  const [activeTab, setActiveTab] = useState('companies');
  const [companies, setCompanies] = useState([]);
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [trips, setTrips] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [editItem, setEditItem] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Form states
  const [companyForm, setCompanyForm] = useState({
    name: '', registration_number: '', address: '', phone: '', email: '', pic_name: '', pic_phone: ''
  });
  const [busForm, setBusForm] = useState({
    company_id: '', plate_number: '', bus_type: 'single_decker', total_seats: 44, brand: '', model: ''
  });
  const [routeForm, setRouteForm] = useState({
    company_id: '', name: '', origin: 'MRSMKU Kuantan', destination: '', base_price: 0, estimated_duration: '',
    drop_off_points: [{ location: '', price: 0, order: 1 }]
  });
  const [tripForm, setTripForm] = useState({
    route_id: '', bus_id: '', departure_date: '', departure_time: '', return_date: '', return_time: '', notes: ''
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [companiesRes, busesRes, routesRes, tripsRes, bookingsRes, statsRes] = await Promise.all([
        api.get('/api/bus/companies'),
        api.get('/api/bus/buses'),
        api.get('/api/bus/routes'),
        api.get('/api/bus/trips'),
        api.get('/api/bus/bookings'),
        api.get('/api/bus/stats')
      ]);
      setCompanies(companiesRes.data);
      setBuses(busesRes.data);
      setRoutes(routesRes.data);
      setTrips(tripsRes.data);
      setBookings(bookingsRes.data);
      setStats(statsRes.data);
    } catch (err) {
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (type, item = null) => {
    setModalType(type);
    setEditItem(item);
    if (item) {
      if (type === 'company') setCompanyForm(item);
      else if (type === 'bus') setBusForm(item);
      else if (type === 'route') setRouteForm({ ...item, drop_off_points: item.drop_off_points || [] });
      else if (type === 'trip') setTripForm(item);
    } else {
      if (type === 'company') setCompanyForm({ name: '', registration_number: '', address: '', phone: '', email: '', pic_name: '', pic_phone: '' });
      else if (type === 'bus') setBusForm({ company_id: companies[0]?.id || '', plate_number: '', bus_type: 'single_decker', total_seats: 44, brand: '', model: '' });
      else if (type === 'route') setRouteForm({ company_id: companies[0]?.id || '', name: '', origin: 'MRSMKU Kuantan', destination: '', base_price: 0, estimated_duration: '', drop_off_points: [{ location: '', price: 0, order: 1 }] });
      else if (type === 'trip') setTripForm({ route_id: routes[0]?.id || '', bus_id: buses[0]?.id || '', departure_date: '', departure_time: '', return_date: '', return_time: '', notes: '' });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);
    try {
      if (modalType === 'company') {
        if (editItem) {
          await api.put(`/api/bus/companies/${editItem.id}`, companyForm);
          toast.success('Syarikat dikemaskini');
        } else {
          await api.post('/api/bus/companies', companyForm);
          toast.success('Syarikat ditambah');
        }
      } else if (modalType === 'bus') {
        if (editItem) {
          await api.put(`/api/bus/buses/${editItem.id}`, busForm);
          toast.success('Bas dikemaskini');
        } else {
          await api.post('/api/bus/buses', busForm);
          toast.success('Bas ditambah');
        }
      } else if (modalType === 'route') {
        const payload = { ...routeForm, drop_off_points: routeForm.drop_off_points.filter(p => p.location) };
        if (editItem) {
          await api.put(`/api/bus/routes/${editItem.id}`, payload);
          toast.success('Route dikemaskini');
        } else {
          await api.post('/api/bus/routes', payload);
          toast.success('Route ditambah');
        }
      } else if (modalType === 'trip') {
        if (editItem) {
          await api.put(`/api/bus/trips/${editItem.id}`, tripForm);
          toast.success('Trip dikemaskini');
        } else {
          await api.post('/api/bus/trips', tripForm);
          toast.success('Trip ditambah');
        }
      }
      setShowModal(false);
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Operasi gagal');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm('Adakah anda pasti ingin memadam item ini?')) return;
    try {
      await api.delete(`/api/bus/${type}/${id}`);
      toast.success('Berjaya dipadam');
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam');
    }
  };

  const handleAssignSeat = async (bookingId, seatNumber) => {
    try {
      await api.post(`/api/bus/bookings/${bookingId}/assign-seat?seat_number=${seatNumber}`);
      toast.success(`Tempat duduk ${seatNumber} berjaya diberikan`);
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memberikan tempat duduk');
    }
  };

  const addDropOffPoint = () => {
    setRouteForm({
      ...routeForm,
      drop_off_points: [...routeForm.drop_off_points, { location: '', price: 0, order: routeForm.drop_off_points.length + 1 }]
    });
  };

  const updateDropOffPoint = (index, field, value) => {
    const updated = [...routeForm.drop_off_points];
    updated[index][field] = value;
    setRouteForm({ ...routeForm, drop_off_points: updated });
  };

  const removeDropOffPoint = (index) => {
    const updated = routeForm.drop_off_points.filter((_, i) => i !== index);
    setRouteForm({ ...routeForm, drop_off_points: updated });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="admin-bus-management">
      {/* Header — tajuk khas untuk Pentadbir Bas */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent font-heading">
            {isBusAdmin ? 'Pentadbir Bas — Urus Modul Bas' : 'Pengurusan Tiket Bas'}
          </h1>
          <p className="text-slate-600 mt-1">
            {isBusAdmin ? 'Urus syarikat bas, kenderaan, route, trip dan tempahan' : 'Urus syarikat bas, kenderaan, route dan trip'}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-100 rounded-lg"><Building className="text-cyan-600" size={20} /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats?.total_companies || 0}</p>
              <p className="text-xs text-slate-500">Syarikat</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Bus className="text-blue-600" size={20} /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats?.total_buses || 0}</p>
              <p className="text-xs text-slate-500">Bas</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg"><MapPinned className="text-emerald-600" size={20} /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats?.total_routes || 0}</p>
              <p className="text-xs text-slate-500">Routes</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg"><Calendar className="text-amber-600" size={20} /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats?.active_trips || 0}</p>
              <p className="text-xs text-slate-500">Trips Aktif</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-pastel-lavender rounded-lg"><Ticket className="text-teal-600" size={20} /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats?.total_bookings || 0}</p>
              <p className="text-xs text-slate-500">Tempahan</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-slate-100 rounded-xl p-1.5">
        {[
          { id: 'companies', label: 'Syarikat Bas', icon: Building },
          { id: 'buses', label: 'Senarai Bas', icon: Bus },
          { id: 'routes', label: 'Routes', icon: MapPinned },
          { id: 'trips', label: 'Trips', icon: Calendar },
          { id: 'bookings', label: 'Tempahan', icon: Ticket }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
            data-testid={`tab-${tab.id}`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content based on active tab */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Companies Tab */}
        {activeTab === 'companies' && (
          <div>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Senarai Syarikat Bas</h2>
              <Button variant="primary" size="sm" onClick={() => openModal('company')} data-testid="add-company-btn">
                <Plus size={16} className="mr-1" /> Tambah Syarikat
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {companies.map(company => (
                <div key={company.id} className="p-4 hover:bg-slate-50 transition-colors" data-testid={`company-${company.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center">
                        <Building className="text-cyan-600" size={24} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{company.name}</h3>
                        <p className="text-sm text-slate-500">Reg: {company.registration_number} | Person In Charge: {company.pic_name}</p>
                        <div className="flex gap-4 mt-1 text-xs text-slate-500">
                          <span><Bus size={12} className="inline mr-1" />{company.total_buses} bas</span>
                          <span><MapPinned size={12} className="inline mr-1" />{company.total_routes} routes</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge status={company.is_verified ? 'approved' : 'pending'}>
                        {company.is_verified ? 'Disahkan' : 'Belum Disahkan'}
                      </Badge>
                      <button onClick={() => openModal('company', company)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"><Edit size={16} /></button>
                      <button onClick={() => handleDelete('companies', company.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
              {companies.length === 0 && (
                <div className="p-12 text-center">
                  <Building className="mx-auto text-slate-300 mb-4" size={48} />
                  <p className="text-slate-500">Tiada syarikat bas berdaftar</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Buses Tab */}
        {activeTab === 'buses' && (
          <div>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Senarai Bas</h2>
              <Button variant="primary" size="sm" onClick={() => openModal('bus')} data-testid="add-bus-btn" disabled={companies.length === 0}>
                <Plus size={16} className="mr-1" /> Tambah Bas
              </Button>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {buses.map(bus => (
                <div key={bus.id} className="bg-slate-50 rounded-xl p-4" data-testid={`bus-${bus.id}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xl font-bold text-cyan-700">{bus.plate_number}</span>
                    <Badge status={bus.is_active ? 'approved' : 'rejected'}>{bus.is_active ? 'Aktif' : 'Tidak Aktif'}</Badge>
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <p><Building size={14} className="inline mr-2" />{bus.company_name}</p>
                    <p><Bus size={14} className="inline mr-2" />{bus.bus_type === 'single_decker' ? 'Single Decker' : 'Double Decker'}</p>
                    <p><Users size={14} className="inline mr-2" />{bus.total_seats} tempat duduk</p>
                    {bus.brand && <p className="text-xs text-slate-500">{bus.brand} {bus.model}</p>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => openModal('bus', bus)} className="flex-1 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1"><Edit size={14} /> Edit</button>
                    <button onClick={() => handleDelete('buses', bus.id)} className="px-3 py-1.5 text-sm bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {buses.length === 0 && (
                <div className="col-span-full p-12 text-center">
                  <Bus className="mx-auto text-slate-300 mb-4" size={48} />
                  <p className="text-slate-500">Tiada bas berdaftar</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Routes Tab */}
        {activeTab === 'routes' && (
          <div>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Senarai Routes</h2>
              <Button variant="primary" size="sm" onClick={() => openModal('route')} data-testid="add-route-btn" disabled={companies.length === 0}>
                <Plus size={16} className="mr-1" /> Tambah Route
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {routes.map(route => (
                <div key={route.id} className="p-4" data-testid={`route-${route.id}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{route.name}</h3>
                      <p className="text-sm text-slate-500">{route.company_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-cyan-700">RM {route.base_price.toFixed(2)}</p>
                      <p className="text-xs text-slate-500">{route.estimated_duration}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3 text-sm text-slate-700">
                    <MapPin size={16} className="text-emerald-600" />
                    <span>{route.origin}</span>
                    <ArrowRight size={16} className="text-slate-400" />
                    <span>{route.destination}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {route.drop_off_points.map((point, idx) => (
                      <span key={idx} className="px-2 py-1 bg-slate-100 rounded-full text-xs">
                        {point.location} • RM {point.price}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => openModal('route', route)} className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"><Edit size={14} /> Edit</button>
                    <button onClick={() => handleDelete('routes', route.id)} className="px-3 py-1.5 text-sm bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {routes.length === 0 && (
                <div className="p-12 text-center">
                  <MapPinned className="mx-auto text-slate-300 mb-4" size={48} />
                  <p className="text-slate-500">Tiada route berdaftar</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trips Tab */}
        {activeTab === 'trips' && (
          <div>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Senarai Trips</h2>
              <Button variant="primary" size="sm" onClick={() => openModal('trip')} data-testid="add-trip-btn" disabled={routes.length === 0 || buses.length === 0}>
                <Plus size={16} className="mr-1" /> Tambah Trip
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {trips.map(trip => (
                <div key={trip.id} className="p-4" data-testid={`trip-${trip.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">{trip.route_name}</h3>
                      <p className="text-sm text-slate-500">{trip.company_name} • {trip.bus_plate}</p>
                    </div>
                    <Badge status={trip.status === 'scheduled' ? 'approved' : trip.status === 'cancelled' ? 'rejected' : 'pending'}>
                      {trip.status === 'scheduled' ? 'Dijadualkan' : trip.status === 'cancelled' ? 'Dibatalkan' : trip.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                    <div>
                      <p className="text-slate-500">Tarikh Pergi</p>
                      <p className="font-medium">{new Date(trip.departure_date).toLocaleDateString('ms-MY')} {trip.departure_time}</p>
                    </div>
                    {trip.return_date && (
                      <div>
                        <p className="text-slate-500">Tarikh Pulang</p>
                        <p className="font-medium">{new Date(trip.return_date).toLocaleDateString('ms-MY')} {trip.return_time}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-slate-500">Tempat Duduk</p>
                      <p className="font-medium">{trip.booked_seats}/{trip.total_seats} ditempah</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Tersedia</p>
                      <p className="font-medium text-emerald-600">{trip.available_seats} kosong</p>
                    </div>
                  </div>
                </div>
              ))}
              {trips.length === 0 && (
                <div className="p-12 text-center">
                  <Calendar className="mx-auto text-slate-300 mb-4" size={48} />
                  <p className="text-slate-500">Tiada trip dijadualkan</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bookings Tab */}
        {activeTab === 'bookings' && (
          <div>
            <div className="p-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-800">Senarai Tempahan</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {bookings.map(booking => (
                <div key={booking.id} className="p-4" data-testid={`booking-${booking.id}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-pastel-lavender rounded-full flex items-center justify-center">
                        <Ticket className="text-teal-600" size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{booking.booking_number}</p>
                        <p className="text-sm text-slate-500">{booking.student_name} • {booking.student_matric}</p>
                      </div>
                    </div>
                    <Badge status={booking.status === 'assigned' ? 'approved' : booking.status === 'cancelled' ? 'rejected' : 'pending'}>
                      {booking.status === 'pending' ? 'Menunggu' : booking.status === 'assigned' ? 'Tempat Diberikan' : booking.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Route</p>
                      <p className="font-medium">{booking.route_name}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Lokasi Turun</p>
                      <p className="font-medium">{booking.drop_off_point}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Tarikh</p>
                      <p className="font-medium">{new Date(booking.departure_date).toLocaleDateString('ms-MY')}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Harga</p>
                      <p className="font-bold text-cyan-600">RM {booking.drop_off_price?.toFixed(2)}</p>
                    </div>
                  </div>
                  {booking.status === 'pending' && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Contoh: 1A"
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-24"
                        id={`seat-${booking.id}`}
                      />
                      <Button 
                        variant="primary" 
                        size="sm" 
                        onClick={() => {
                          const seat = document.getElementById(`seat-${booking.id}`).value;
                          if (seat) handleAssignSeat(booking.id, seat);
                        }}
                      >
                        Berikan Tempat
                      </Button>
                    </div>
                  )}
                  {booking.assigned_seat && (
                    <p className="mt-3 text-sm font-medium text-emerald-600">Tempat Duduk: {booking.assigned_seat}</p>
                  )}
                </div>
              ))}
              {bookings.length === 0 && (
                <div className="p-12 text-center">
                  <Ticket className="mx-auto text-slate-300 mb-4" size={48} />
                  <p className="text-slate-500">Tiada tempahan</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bus Management Slide-in Panel */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 z-50" 
              onClick={() => setShowModal(false)} 
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Panel Header */}
              <div className="p-6 border-b bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Bus size={24} />
                    {modalType === 'company' ? (editItem ? 'Edit Syarikat' : 'Tambah Syarikat') :
                     modalType === 'bus' ? (editItem ? 'Edit Bas' : 'Tambah Bas') :
                     modalType === 'route' ? (editItem ? 'Edit Route' : 'Tambah Route') :
                     modalType === 'trip' ? (editItem ? 'Edit Trip' : 'Tambah Trip') : ''}
                  </h3>
                  <button onClick={() => setShowModal(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white/20 rounded-lg transition" aria-label="Tutup">
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              {/* Panel Content - Scrollable */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Company Form */}
                {modalType === 'company' && (
                  <>
                    <Input label="Nama Syarikat" value={companyForm.name} onChange={(e) => setCompanyForm({...companyForm, name: e.target.value})} required />
                    <Input label="No. Pendaftaran" value={companyForm.registration_number} onChange={(e) => setCompanyForm({...companyForm, registration_number: e.target.value})} required />
                    <Input label="Alamat" value={companyForm.address} onChange={(e) => setCompanyForm({...companyForm, address: e.target.value})} required />
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="No. Telefon" value={companyForm.phone} onChange={(e) => setCompanyForm({...companyForm, phone: e.target.value})} required />
                      <Input label="Emel" type="email" value={companyForm.email} onChange={(e) => setCompanyForm({...companyForm, email: e.target.value})} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Nama Person In Charge" value={companyForm.pic_name} onChange={(e) => setCompanyForm({...companyForm, pic_name: e.target.value})} required />
                      <Input label="No. Telefon Person In Charge" value={companyForm.pic_phone} onChange={(e) => setCompanyForm({...companyForm, pic_phone: e.target.value})} required />
                    </div>
                  </>
                )}

                {/* Bus Form */}
                {modalType === 'bus' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Syarikat Bas</label>
                      <select value={busForm.company_id} onChange={(e) => setBusForm({...busForm, company_id: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500" required>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <Input label="Nombor Plat Pendaftaran JPJ" value={busForm.plate_number} onChange={(e) => setBusForm({...busForm, plate_number: e.target.value})} required />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Jenis Bas</label>
                        <select value={busForm.bus_type} onChange={(e) => setBusForm({...busForm, bus_type: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500">
                          <option value="single_decker">Single Decker</option>
                          <option value="double_decker">Double Decker</option>
                        </select>
                      </div>
                      <Input label="Jumlah Tempat Duduk" type="number" value={busForm.total_seats} onChange={(e) => setBusForm({...busForm, total_seats: parseInt(e.target.value)})} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Jenama" value={busForm.brand} onChange={(e) => setBusForm({...busForm, brand: e.target.value})} />
                      <Input label="Model" value={busForm.model} onChange={(e) => setBusForm({...busForm, model: e.target.value})} />
                    </div>
                  </>
                )}

                {/* Route Form */}
                {modalType === 'route' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Syarikat Bas</label>
                      <select value={routeForm.company_id} onChange={(e) => setRouteForm({...routeForm, company_id: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500" required>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <Input label="Nama Route" value={routeForm.name} onChange={(e) => setRouteForm({...routeForm, name: e.target.value})} placeholder="Contoh: Kuantan - KL" required />
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Asal" value={routeForm.origin} onChange={(e) => setRouteForm({...routeForm, origin: e.target.value})} required />
                      <Input label="Destinasi" value={routeForm.destination} onChange={(e) => setRouteForm({...routeForm, destination: e.target.value})} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Harga Asas (RM)" type="number" step="0.01" value={routeForm.base_price} onChange={(e) => setRouteForm({...routeForm, base_price: parseFloat(e.target.value)})} required />
                      <Input label="Anggaran Masa" value={routeForm.estimated_duration} onChange={(e) => setRouteForm({...routeForm, estimated_duration: e.target.value})} placeholder="Contoh: 3 jam 30 minit" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Titik Turun</label>
                      <div className="space-y-2">
                        {routeForm.drop_off_points.map((point, idx) => (
                          <div key={idx} className="flex gap-2">
                            <input
                              type="text"
                              value={point.location}
                              onChange={(e) => updateDropOffPoint(idx, 'location', e.target.value)}
                              placeholder="Lokasi"
                              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={point.price}
                              onChange={(e) => updateDropOffPoint(idx, 'price', parseFloat(e.target.value))}
                              placeholder="Harga"
                              className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                            />
                            <button type="button" onClick={() => removeDropOffPoint(idx)} className="px-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={addDropOffPoint} className="mt-2 text-sm text-cyan-600 hover:text-cyan-700 flex items-center gap-1">
                        <Plus size={14} /> Tambah Titik Turun
                      </button>
                    </div>
                  </>
                )}

                {/* Trip Form */}
                {modalType === 'trip' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Route</label>
                      <select value={tripForm.route_id} onChange={(e) => setTripForm({...tripForm, route_id: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500" required>
                        {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Bas</label>
                      <select value={tripForm.bus_id} onChange={(e) => setTripForm({...tripForm, bus_id: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500" required>
                        {buses.map(b => <option key={b.id} value={b.id}>{b.plate_number} - {b.company_name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Tarikh Pergi" type="date" value={tripForm.departure_date} onChange={(e) => setTripForm({...tripForm, departure_date: e.target.value})} required />
                      <Input label="Masa Pergi" type="time" value={tripForm.departure_time} onChange={(e) => setTripForm({...tripForm, departure_time: e.target.value})} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Tarikh Pulang" type="date" value={tripForm.return_date} onChange={(e) => setTripForm({...tripForm, return_date: e.target.value})} />
                      <Input label="Masa Pulang" type="time" value={tripForm.return_time} onChange={(e) => setTripForm({...tripForm, return_time: e.target.value})} />
                    </div>
                    <Input label="Nota" value={tripForm.notes} onChange={(e) => setTripForm({...tripForm, notes: e.target.value})} placeholder="Contoh: Pulang bermalam CNY" />
                  </>
                )}
              </form>

              {/* Panel Footer */}
              <div className="p-4 border-t bg-slate-50 flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Batal</Button>
                <Button type="submit" variant="primary" className="flex-1" loading={processing} onClick={handleSubmit}>
                  {editItem ? 'Kemaskini' : 'Simpan'}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminBusManagementPage;
