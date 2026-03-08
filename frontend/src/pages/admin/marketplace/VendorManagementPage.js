import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Users, Store, CheckCircle, XCircle, Clock, Eye, Search,
  Phone, Building, CreditCard, ArrowLeft, AlertCircle, X
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../services/api';

const statusColors = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-gray-100 text-gray-700'
};

const statusLabels = {
  pending: 'Menunggu',
  approved: 'Diluluskan',
  rejected: 'Ditolak',
  suspended: 'Digantung'
};

const VendorManagementPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchVendors();
  }, [filterStatus]);

  useEffect(() => {
    const vendorId = searchParams.get('id');
    if (vendorId && vendors.length > 0) {
      const vendor = vendors.find(v => v.id === vendorId);
      if (vendor) {
        setSelectedVendor(vendor);
        setShowDetailModal(true);
      }
    }
  }, [searchParams, vendors]);

  const fetchVendors = async () => {
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const res = await api.get('/api/marketplace/vendors', { params });
      setVendors(res.data || []);
    } catch (error) {
      console.error('Error fetching vendors:', error);
      toast.error('Gagal memuatkan senarai vendor');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = (vendor) => {
    setSelectedVendor(vendor);
    setApprovalAction('approved');
    setRejectionReason('');
    setShowApprovalModal(true);
  };

  const handleReject = (vendor) => {
    setSelectedVendor(vendor);
    setApprovalAction('rejected');
    setRejectionReason('');
    setShowApprovalModal(true);
  };

  const submitApproval = async () => {
    if (approvalAction === 'rejected' && !rejectionReason.trim()) {
      toast.error('Sila nyatakan sebab penolakan');
      return;
    }

    try {
      await api.put(`/api/marketplace/vendors/${selectedVendor.id}/approve`, {
        status: approvalAction,
        rejection_reason: approvalAction === 'rejected' ? rejectionReason : null
      });
      toast.success(`Vendor berjaya di${approvalAction === 'approved' ? 'luluskan' : 'tolak'}`);
      setShowApprovalModal(false);
      setShowDetailModal(false);
      fetchVendors();
    } catch (error) {
      console.error('Error updating vendor:', error);
      toast.error('Gagal mengemaskini status vendor');
    }
  };

  const filteredVendors = vendors.filter(v => 
    v.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.parent_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="vendor-management-page">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/admin/marketplace')}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-teal-600" />
            Pengurusan Vendor
          </h1>
          <p className="text-gray-500">Luluskan dan urus permohonan vendor</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">Semua Status</option>
            <option value="pending">Menunggu</option>
            <option value="approved">Diluluskan</option>
            <option value="rejected">Ditolak</option>
            <option value="suspended">Digantung</option>
          </select>
        </div>
      </div>

      {/* Vendors List */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Senarai Vendor ({filteredVendors.length})</h3>
        </div>
        <div>
          {filteredVendors.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Store className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p>Tiada vendor dijumpai</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredVendors.map((vendor) => (
                <div key={vendor.id} className="p-4 hover:bg-gray-50" data-testid={`vendor-row-${vendor.id}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-pastel-lavender rounded-lg flex items-center justify-center">
                        <Store className="h-6 w-6 text-teal-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{vendor.business_name}</h3>
                        <p className="text-sm text-gray-500">{vendor.parent_name}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {vendor.contact_phone}
                          </span>
                          {vendor.business_category && (
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs capitalize">
                              {vendor.business_category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-sm ${statusColors[vendor.status]}`}>
                        {statusLabels[vendor.status]}
                      </span>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setSelectedVendor(vendor);
                            setShowDetailModal(true);
                          }}
                          className="p-2 border border-gray-300 rounded hover:bg-gray-100 transition"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {vendor.status === 'pending' && (
                          <>
                            <button 
                              onClick={() => handleApprove(vendor)}
                              className="p-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleReject(vendor)}
                              className="p-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedVendor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
            <div className="p-6 border-b flex items-center justify-between shrink-0">
              <h2 className="text-xl font-semibold flex items-center gap-2 min-w-0 truncate pr-2">
                <Store className="h-5 w-5 text-teal-600 flex-shrink-0" />
                <span className="truncate">Maklumat Vendor</span>
              </h2>
              <button onClick={() => setShowDetailModal(false)} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg flex-shrink-0" aria-label="Tutup">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{selectedVendor.business_name}</h3>
                <span className={`px-3 py-1 rounded ${statusColors[selectedVendor.status]}`}>
                  {statusLabels[selectedVendor.status]}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Pemilik</p>
                  <p className="font-medium">{selectedVendor.parent_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">No. Telefon</p>
                  <p className="font-medium">{selectedVendor.contact_phone}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Kategori Perniagaan</p>
                  <p className="font-medium capitalize">{selectedVendor.business_category || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Tarikh Permohonan</p>
                  <p className="font-medium">
                    {new Date(selectedVendor.created_at).toLocaleDateString('ms-MY')}
                  </p>
                </div>
              </div>

              {selectedVendor.business_description && (
                <div>
                  <p className="text-sm text-gray-500">Penerangan Perniagaan</p>
                  <p className="mt-1">{selectedVendor.business_description}</p>
                </div>
              )}

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <CreditCard className="h-4 w-4" />
                  Maklumat Bank
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Nama Bank</p>
                    <p className="font-medium">{selectedVendor.bank_name}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">No. Akaun</p>
                    <p className="font-medium">{selectedVendor.bank_account_number}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-500">Nama Pemegang Akaun</p>
                    <p className="font-medium">{selectedVendor.bank_account_name}</p>
                  </div>
                </div>
              </div>

              {selectedVendor.rejection_reason && (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <p className="text-sm text-red-600 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Sebab Penolakan:
                  </p>
                  <p className="mt-1 text-red-700">{selectedVendor.rejection_reason}</p>
                </div>
              )}

              {selectedVendor.status === 'approved' && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium mb-3">Statistik</h4>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-teal-600">{selectedVendor.total_products}</p>
                      <p className="text-sm text-gray-500">Produk</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-emerald-600">
                        RM {selectedVendor.total_sales?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-sm text-gray-500">Jualan</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-600">
                        {selectedVendor.rating?.toFixed(1) || '0.0'}
                      </p>
                      <p className="text-sm text-gray-500">Rating</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {selectedVendor.status === 'pending' && (
              <div className="p-6 border-t flex justify-end gap-3">
                <button 
                  onClick={() => {
                    setShowDetailModal(false);
                    handleReject(selectedVendor);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Tolak
                </button>
                <button 
                  onClick={() => {
                    setShowDetailModal(false);
                    handleApprove(selectedVendor);
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Luluskan
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
            <div className="p-6 border-b shrink-0">
              <h2 className="text-xl font-semibold">
                {approvalAction === 'approved' ? 'Luluskan Vendor' : 'Tolak Vendor'}
              </h2>
              <p className="text-gray-500 mt-1">
                {approvalAction === 'approved' 
                  ? `Adakah anda pasti mahu meluluskan vendor "${selectedVendor?.business_name}"?`
                  : `Sila nyatakan sebab penolakan untuk vendor "${selectedVendor?.business_name}".`
                }
              </p>
            </div>
            
            <div className="p-6">
              {approvalAction === 'rejected' && (
                <textarea
                  placeholder="Sebab penolakan..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              )}
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button 
                onClick={() => setShowApprovalModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Batal
              </button>
              <button 
                onClick={submitApproval}
                className={`px-4 py-2 text-white rounded-lg ${
                  approvalAction === 'approved' 
                    ? 'bg-emerald-600 hover:bg-emerald-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {approvalAction === 'approved' ? 'Luluskan' : 'Tolak'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorManagementPage;
