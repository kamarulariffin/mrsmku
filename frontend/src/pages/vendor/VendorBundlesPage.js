import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, ArrowLeft, Boxes } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

const statusColors = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700'
};

const statusLabels = {
  pending: 'Menunggu',
  approved: 'Diluluskan',
  rejected: 'Ditolak'
};

const VendorBundlesPage = () => {
  const navigate = useNavigate();
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteBundle, setDeleteBundle] = useState(null);

  useEffect(() => {
    fetchBundles();
  }, []);

  const fetchBundles = async () => {
    try {
      const res = await api.get('/api/marketplace/bundles/my-bundles');
      setBundles(res.data || []);
    } catch (error) {
      console.error('Error fetching bundles:', error);
      toast.error('Gagal memuatkan senarai bundle');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (bundleId) => {
    try {
      await api.delete(`/api/marketplace/bundles/${bundleId}`);
      toast.success('Bundle berjaya dipadam');
      setDeleteBundle(null);
      fetchBundles();
    } catch (error) {
      console.error('Error deleting bundle:', error);
      toast.error('Gagal memadam bundle');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount);
  };

  const filteredBundles = bundles.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="vendor-bundles-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/vendor')}
            className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg transition"
            aria-label="Kembali"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Boxes className="h-6 w-6 text-teal-600" />
              Pakej Bundle
            </h1>
            <p className="text-gray-500">Cipta pakej produk dengan harga istimewa</p>
          </div>
        </div>
        <button 
          onClick={() => navigate('/vendor/bundles/new')}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition flex items-center gap-2"
          data-testid="create-bundle-btn"
        >
          <Plus className="h-5 w-5" />
          Cipta Bundle
        </button>
      </div>

      {/* Info Card */}
      <div className="bg-pastel-mint border border-pastel-lilac rounded-xl p-4 flex items-start gap-3">
        <Boxes className="h-5 w-5 text-teal-600 mt-0.5" />
        <div>
          <p className="font-medium text-teal-800">Apa itu Bundle?</p>
          <p className="text-sm text-teal-700">
            Bundle adalah gabungan beberapa produk yang dijual dengan harga pakej yang lebih rendah. 
            Pembeli dapat penjimatan, anda dapat lebih jualan!
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari bundle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Bundles List */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {filteredBundles.length === 0 ? (
          <div className="text-center py-12">
            <Boxes className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 mb-4">Tiada bundle dijumpai</p>
            <button 
              onClick={() => navigate('/vendor/bundles/new')}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition flex items-center gap-2 mx-auto"
            >
              <Plus className="h-5 w-5" />
              Cipta Bundle Pertama
            </button>
          </div>
        ) : (
          <div className="divide-y">
            {filteredBundles.map((bundle) => (
              <div 
                key={bundle.id} 
                className="p-4 hover:bg-gray-50 transition"
                data-testid={`bundle-card-${bundle.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{bundle.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        statusColors[bundle.approval_status]
                      }`}>
                        {statusLabels[bundle.approval_status]}
                      </span>
                    </div>
                    {bundle.description && (
                      <p className="text-sm text-gray-500 mt-1">{bundle.description}</p>
                    )}
                    
                    {/* Bundle Items */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {bundle.items?.map((item, idx) => (
                        <span 
                          key={idx}
                          className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-700"
                        >
                          {item.quantity}x {item.product_name}
                        </span>
                      ))}
                    </div>

                    {/* Pricing */}
                    <div className="mt-3 flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 line-through">
                          {formatCurrency(bundle.original_price)}
                        </span>
                        <span className="text-lg font-bold text-teal-600">
                          {formatCurrency(bundle.price)}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-sm rounded">
                        Jimat {formatCurrency(bundle.savings)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/vendor/bundles/${bundle.id}/edit`)}
                      className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteBundle(bundle)}
                      className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteBundle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0 p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-8 w-8 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Padam Bundle?</h2>
              <p className="text-gray-500 mb-6">
                Adakah anda pasti mahu memadam "{deleteBundle.name}"? 
                Tindakan ini tidak boleh dibatalkan.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteBundle(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Batal
                </button>
                <button 
                  onClick={() => handleDelete(deleteBundle.id)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  Ya, Padam
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorBundlesPage;
