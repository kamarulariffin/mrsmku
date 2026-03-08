import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Boxes, ArrowLeft, Plus, Trash2, Image as ImageIcon,
  DollarSign, Tag, AlertCircle, Save, Package, Search
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

const VendorBundleFormPage = () => {
  const navigate = useNavigate();
  const { bundleId } = useParams();
  const isEditing = Boolean(bundleId);
  
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditing);
  const [products, setProducts] = useState([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    items: [],
    images: []
  });
  const [errors, setErrors] = useState({});
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    fetchMyProducts();
    if (isEditing) {
      fetchBundle();
    }
  }, [bundleId]);

  const fetchMyProducts = async () => {
    try {
      const res = await api.get('/api/marketplace/products/my-products', {
        params: { status: 'approved' }
      });
      setProducts(res.data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchBundle = async () => {
    try {
      const res = await api.get(`/api/marketplace/bundles/${bundleId}`);
      const bundle = res.data;
      setFormData({
        name: bundle.name || '',
        description: bundle.description || '',
        price: bundle.price?.toString() || '',
        items: bundle.items?.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          variant_sku: item.variant_sku,
          unit_price: item.unit_price
        })) || [],
        images: bundle.images || []
      });
    } catch (error) {
      console.error('Error fetching bundle:', error);
      toast.error('Gagal memuatkan bundle');
      navigate('/vendor/bundles');
    } finally {
      setFetching(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleAddProduct = (product, variantSku = null) => {
    const existingItem = formData.items.find(
      i => i.product_id === product.id && i.variant_sku === variantSku
    );
    
    if (existingItem) {
      toast.error('Produk ini sudah ada dalam bundle');
      return;
    }

    let unitPrice = product.price;
    let productName = product.name;
    
    if (variantSku && product.variants) {
      const variant = product.variants.find(v => v.sku === variantSku);
      if (variant) {
        unitPrice = variant.price_override || product.price;
        productName = `${product.name} (${variant.size || ''} ${variant.color || ''})`.trim();
      }
    }

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        product_id: product.id,
        product_name: productName,
        quantity: 1,
        variant_sku: variantSku,
        unit_price: unitPrice
      }]
    }));
    setShowProductPicker(false);
    setProductSearch('');
  };

  const handleRemoveItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleItemQuantityChange = (index, quantity) => {
    const qty = Math.max(1, parseInt(quantity) || 1);
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, quantity: qty } : item
      )
    }));
  };

  const handleAddImage = () => {
    if (!imageUrl.trim()) return;
    if (formData.images.length >= 5) {
      toast.error('Maksimum 5 gambar sahaja');
      return;
    }
    setFormData(prev => ({
      ...prev,
      images: [...prev.images, imageUrl.trim()]
    }));
    setImageUrl('');
  };

  const handleRemoveImage = (index) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const calculateOriginalPrice = () => {
    return formData.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Nama bundle diperlukan';
    }
    if (formData.items.length < 2) {
      newErrors.items = 'Bundle mesti mengandungi sekurang-kurangnya 2 produk';
    }
    const originalPrice = calculateOriginalPrice();
    const bundlePrice = parseFloat(formData.price) || 0;
    if (!bundlePrice || bundlePrice <= 0) {
      newErrors.price = 'Harga bundle diperlukan';
    } else if (bundlePrice >= originalPrice) {
      newErrors.price = 'Harga bundle mesti lebih rendah daripada jumlah harga individu';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        items: formData.items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          variant_sku: item.variant_sku || null
        })),
        images: formData.images
      };

      if (isEditing) {
        await api.put(`/api/marketplace/bundles/${bundleId}`, payload);
        toast.success('Bundle berjaya dikemaskini');
      } else {
        await api.post('/api/marketplace/bundles', payload);
        toast.success('Bundle berjaya dicipta! Menunggu kelulusan admin.');
      }
      navigate('/vendor/bundles');
    } catch (error) {
      console.error('Error saving bundle:', error);
      toast.error(error.response?.data?.detail || 'Gagal menyimpan bundle');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const originalPrice = calculateOriginalPrice();
  const bundlePrice = parseFloat(formData.price) || 0;
  const savings = bundlePrice > 0 ? originalPrice - bundlePrice : 0;

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="vendor-bundle-form">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/vendor/bundles')}
          className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Boxes className="h-6 w-6 text-teal-600" />
            {isEditing ? 'Edit Bundle' : 'Cipta Bundle Baru'}
          </h1>
          <p className="text-gray-500">
            Gabungkan produk anda dengan harga pakej istimewa
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 border-b pb-3">
              <Tag className="h-5 w-5 text-teal-600" />
              Maklumat Bundle
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nama Bundle <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Contoh: Set Lengkap Alat Tulis"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                data-testid="bundle-name-input"
              />
              {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Penerangan
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Terangkan kelebihan bundle ini..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Bundle Items */}
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Package className="h-5 w-5 text-teal-600" />
                Produk dalam Bundle
              </h3>
              <button
                type="button"
                onClick={() => setShowProductPicker(true)}
                className="px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition flex items-center gap-1"
                data-testid="add-product-btn"
              >
                <Plus className="h-4 w-4" />
                Tambah Produk
              </button>
            </div>

            {errors.items && (
              <p className="text-sm text-red-500">{errors.items}</p>
            )}

            {formData.items.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                <p>Tiada produk dalam bundle</p>
                <p className="text-sm">Klik "Tambah Produk" untuk mula</p>
              </div>
            ) : (
              <div className="space-y-3">
                {formData.items.map((item, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                    data-testid={`bundle-item-${index}`}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.product_name}</p>
                      <p className="text-sm text-gray-500">
                        {formatCurrency(item.unit_price)} / unit
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-500">Qty:</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemQuantityChange(index, e.target.value)}
                        min="1"
                        className="w-16 px-2 py-1 text-center border border-gray-300 rounded"
                      />
                    </div>
                    <p className="font-medium text-teal-600 w-24 text-right">
                      {formatCurrency(item.unit_price * item.quantity)}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Images */}
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 border-b pb-3">
              <ImageIcon className="h-5 w-5 text-blue-600" />
              Gambar Bundle
              <span className="text-sm font-normal text-gray-500">({formData.images.length}/5)</span>
            </h3>

            <div className="flex gap-2">
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Masukkan URL gambar..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
              />
              <button
                type="button"
                onClick={handleAddImage}
                disabled={!imageUrl.trim() || formData.images.length >= 5}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-50"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            {formData.images.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {formData.images.map((url, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={url}
                      alt={`Bundle ${index + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border"
                      onError={(e) => { e.target.src = 'https://via.placeholder.com/200?text=Error'; }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pricing Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border p-6 space-y-4 sticky top-6">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 border-b pb-3">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Harga Bundle
            </h3>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Jumlah Harga Individu</label>
              <p className="text-xl font-bold text-gray-400 line-through">
                {formatCurrency(originalPrice)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Harga Bundle <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">RM</span>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className={`w-full pl-12 pr-4 py-3 text-xl font-bold border rounded-lg focus:ring-2 focus:ring-teal-500 ${
                    errors.price ? 'border-red-500' : 'border-gray-300'
                  }`}
                  data-testid="bundle-price-input"
                />
              </div>
              {errors.price && <p className="text-sm text-red-500 mt-1">{errors.price}</p>}
            </div>

            {savings > 0 && (
              <div className="bg-emerald-50 rounded-lg p-4 text-center">
                <p className="text-sm text-emerald-700">Penjimatan Pembeli</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(savings)}
                </p>
                <p className="text-sm text-emerald-600">
                  ({((savings / originalPrice) * 100).toFixed(0)}% diskaun)
                </p>
              </div>
            )}

            <div className="pt-4 border-t space-y-3">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                data-testid="submit-bundle-btn"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="h-5 w-5" />
                    {isEditing ? 'Kemaskini Bundle' : 'Cipta Bundle'}
                  </>
                )}
              </button>
              <button
                onClick={() => navigate('/vendor/bundles')}
                className="w-full px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Product Picker Modal */}
      {showProductPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto min-h-[100dvh] min-h-screen">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-x-hidden min-w-0">
            <div className="p-4 border-b shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Pilih Produk</h2>
                <button 
                  onClick={() => { setShowProductPicker(false); setProductSearch(''); }}
                  className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-gray-100 rounded"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari produk..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  autoFocus
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                  <p>Tiada produk ditemui</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredProducts.map((product) => (
                    <div key={product.id}>
                      {product.product_type === 'variable' && product.variants?.length > 0 ? (
                        // Variable product - show variants
                        <div className="border rounded-lg p-3">
                          <p className="font-medium text-gray-900 mb-2">{product.name}</p>
                          <div className="space-y-1">
                            {product.variants.map((variant) => (
                              <button
                                key={variant.sku}
                                onClick={() => handleAddProduct(product, variant.sku)}
                                className="w-full flex items-center justify-between p-2 hover:bg-pastel-mint/50 rounded text-left"
                              >
                                <span className="text-sm">
                                  {variant.size && `Saiz: ${variant.size}`}
                                  {variant.size && variant.color && ' / '}
                                  {variant.color && `Warna: ${variant.color}`}
                                  {!variant.size && !variant.color && `SKU: ${variant.sku}`}
                                </span>
                                <span className="text-teal-600 font-medium">
                                  {formatCurrency(variant.price_override || product.price)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        // Simple product
                        <button
                          onClick={() => handleAddProduct(product)}
                          className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-pastel-mint/50 text-left"
                        >
                          <span className="font-medium text-gray-900">{product.name}</span>
                          <span className="text-teal-600 font-medium">
                            {formatCurrency(product.price)}
                          </span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorBundleFormPage;
