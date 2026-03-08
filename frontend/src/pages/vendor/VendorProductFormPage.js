import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Package, ArrowLeft, Plus, Trash2, Image as ImageIcon,
  DollarSign, Boxes, Tag, AlertCircle, Save, Layers
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

const VendorProductFormPage = () => {
  const navigate = useNavigate();
  const { productId } = useParams();
  const isEditing = Boolean(productId);
  
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditing);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'others',
    price: '',
    stock: '',
    images: [],
    product_type: 'simple',
    variants: []
  });
  const [errors, setErrors] = useState({});
  const [imageUrl, setImageUrl] = useState('');
  const [categories, setCategories] = useState([]);

  const defaultCategories = [
    { id: 'food', name: 'Makanan', is_food: true },
    { id: 'clothing', name: 'Pakaian', is_food: false },
    { id: 'stationery', name: 'Alat Tulis', is_food: false },
    { id: 'electronics', name: 'Elektronik', is_food: false },
    { id: 'accessories', name: 'Aksesori', is_food: false },
    { id: 'health', name: 'Kesihatan', is_food: false },
    { id: 'sports', name: 'Sukan', is_food: false },
    { id: 'others', name: 'Lain-lain', is_food: false }
  ];

  useEffect(() => {
    fetchCategories();
    if (isEditing) {
      fetchProduct();
    }
  }, [productId]);

  const fetchCategories = async () => {
    try {
      const res = await api.get('/api/marketplace/categories');
      setCategories(res.data.filter(c => c.id !== 'bundle'));
    } catch {
      setCategories(defaultCategories);
    }
  };

  const fetchProduct = async () => {
    try {
      const res = await api.get(`/api/marketplace/products/${productId}`);
      const product = res.data;
      setFormData({
        name: product.name || '',
        description: product.description || '',
        category: product.category || 'others',
        price: product.price?.toString() || '',
        stock: product.stock?.toString() || '',
        images: product.images || [],
        product_type: product.product_type || 'simple',
        variants: product.variants || []
      });
    } catch (error) {
      console.error('Error fetching product:', error);
      toast.error('Gagal memuatkan produk');
      navigate('/vendor/products');
    } finally {
      setFetching(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleProductTypeChange = (type) => {
    setFormData(prev => ({
      ...prev,
      product_type: type,
      variants: type === 'variable' ? (prev.variants.length > 0 ? prev.variants : [{ sku: '', size: '', color: '', stock: 0, price_override: null }]) : [],
      stock: type === 'variable' ? '' : prev.stock
    }));
  };

  const handleAddVariant = () => {
    setFormData(prev => ({
      ...prev,
      variants: [...prev.variants, { sku: '', size: '', color: '', stock: 0, price_override: null }]
    }));
  };

  const handleRemoveVariant = (index) => {
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index)
    }));
  };

  const handleVariantChange = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.map((v, i) => 
        i === index ? { ...v, [field]: field === 'stock' ? parseInt(value) || 0 : (field === 'price_override' ? (value ? parseFloat(value) : null) : value) } : v
      )
    }));
  };

  const handleAddImage = () => {
    if (!imageUrl.trim()) return;
    if (formData.images.length >= 10) {
      toast.error('Maksimum 10 gambar sahaja');
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

  const calculateTotalStock = () => {
    if (formData.product_type === 'variable') {
      return formData.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    }
    return parseInt(formData.stock) || 0;
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Nama produk diperlukan';
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      newErrors.price = 'Harga mesti lebih dari 0';
    }
    
    if (formData.product_type === 'simple') {
      if (!formData.stock || parseInt(formData.stock) < 0) {
        newErrors.stock = 'Stok tidak boleh negatif';
      }
    } else {
      if (formData.variants.length === 0) {
        newErrors.variants = 'Sekurang-kurangnya satu varian diperlukan';
      } else {
        const skus = formData.variants.map(v => v.sku).filter(s => s);
        if (skus.length !== new Set(skus).size) {
          newErrors.variants = 'SKU varian mesti unik';
        }
        formData.variants.forEach((v, i) => {
          if (!v.sku) {
            newErrors[`variant_sku_${i}`] = 'SKU diperlukan';
          }
        });
      }
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
        category: formData.category,
        price: parseFloat(formData.price),
        stock: formData.product_type === 'simple' ? parseInt(formData.stock) : 0,
        images: formData.images,
        product_type: formData.product_type,
        variants: formData.product_type === 'variable' ? formData.variants : null
      };

      if (isEditing) {
        await api.put(`/api/marketplace/products/${productId}`, payload);
        toast.success('Produk berjaya dikemaskini');
      } else {
        await api.post('/api/marketplace/products', payload);
        toast.success('Produk berjaya ditambah! Menunggu kelulusan admin.');
      }
      navigate('/vendor/products');
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error(error.response?.data?.detail || 'Gagal menyimpan produk');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  const totalStock = calculateTotalStock();
  const basePrice = parseFloat(formData.price) || 0;

  return (
    <div className="space-y-6 p-6 min-w-0 overflow-x-hidden" data-testid="vendor-product-form">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/vendor/products')}
          className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg transition"
          data-testid="back-button"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-violet-600" />
            {isEditing ? 'Edit Produk' : 'Tambah Produk Baru'}
          </h1>
          <p className="text-gray-500">
            {isEditing ? 'Kemaskini maklumat produk' : 'Produk baru akan disemak oleh admin sebelum dipaparkan'}
          </p>
        </div>
      </div>

      {/* Approval Notice */}
      {!isEditing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Kelulusan Diperlukan</p>
            <p className="text-sm text-amber-700">
              Produk baru perlu diluluskan oleh pentadbir sebelum ia boleh dilihat oleh pembeli.
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-xl border">
        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 border-b pb-3">
              <Tag className="h-5 w-5 text-violet-600" />
              Maklumat Asas
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nama Produk <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Contoh: Baju Sukan MRSMKU"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                data-testid="product-name-input"
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
                placeholder="Terangkan produk anda secara terperinci..."
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kategori
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                data-testid="category-select"
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} {cat.is_food && '(Makanan - Ibu bapa sahaja)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Product Type */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 border-b pb-3">
              <Layers className="h-5 w-5 text-blue-600" />
              Jenis Produk
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => handleProductTypeChange('simple')}
                className={`p-4 rounded-xl border-2 text-left transition ${
                  formData.product_type === 'simple'
                    ? 'border-teal-500 bg-pastel-mint/50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                data-testid="simple-product-btn"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    formData.product_type === 'simple' ? 'bg-teal-500 text-white' : 'bg-gray-100'
                  }`}>
                    <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">Produk Mudah</p>
                    <p className="text-sm text-gray-500">Satu harga, satu stok</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleProductTypeChange('variable')}
                className={`p-4 rounded-xl border-2 text-left transition ${
                  formData.product_type === 'variable'
                    ? 'border-teal-500 bg-pastel-mint/50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                data-testid="variable-product-btn"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    formData.product_type === 'variable' ? 'bg-teal-500 text-white' : 'bg-gray-100'
                  }`}>
                    <Boxes className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">Produk Variasi</p>
                    <p className="text-sm text-gray-500">Saiz, warna berbeza</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Pricing */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 border-b pb-3">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Harga {formData.product_type === 'simple' && '& Stok'}
            </h3>

            <div className={`grid ${formData.product_type === 'simple' ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Harga Asas (RM) <span className="text-red-500">*</span>
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
                    className={`w-full pl-12 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 ${
                      errors.price ? 'border-red-500' : 'border-gray-300'
                    }`}
                    data-testid="price-input"
                  />
                </div>
                {errors.price && <p className="text-sm text-red-500 mt-1">{errors.price}</p>}
              </div>

              {formData.product_type === 'simple' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stok <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="stock"
                    value={formData.stock}
                    onChange={handleChange}
                    placeholder="0"
                    min="0"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 ${
                      errors.stock ? 'border-red-500' : 'border-gray-300'
                    }`}
                    data-testid="stock-input"
                  />
                  {errors.stock && <p className="text-sm text-red-500 mt-1">{errors.stock}</p>}
                </div>
              )}
            </div>

            {/* Earnings Calculation */}
            {basePrice > 0 && (
              <div className="bg-gradient-to-r from-pastel-lavender to-pastel-mint rounded-lg p-4">
                <p className="text-sm text-gray-700 mb-2">Pecahan Pendapatan:</p>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-emerald-600">
                      RM {(basePrice * 0.9).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-600">Anda (90%)</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-violet-600">
                      RM {(basePrice * 0.05).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-600">Dana Kecemerlangan (5%)</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-600">
                      RM {(basePrice * 0.05).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-600">Koperasi (5%)</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Variants Section */}
          {formData.product_type === 'variable' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Boxes className="h-5 w-5 text-teal-600" />
                  Varian Produk
                  <span className="text-sm font-normal text-gray-500">
                    (Jumlah Stok: {totalStock})
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition flex items-center gap-1"
                  data-testid="add-variant-btn"
                >
                  <Plus className="h-4 w-4" />
                  Tambah Varian
                </button>
              </div>

              {errors.variants && (
                <p className="text-sm text-red-500">{errors.variants}</p>
              )}

              <div className="space-y-3">
                {formData.variants.map((variant, index) => (
                  <div 
                    key={index} 
                    className="p-4 bg-gray-50 rounded-xl border"
                    data-testid={`variant-row-${index}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">Varian #{index + 1}</span>
                      {formData.variants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveVariant(index)}
                          className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">SKU *</label>
                        <input
                          type="text"
                          value={variant.sku}
                          onChange={(e) => handleVariantChange(index, 'sku', e.target.value)}
                          placeholder="SKU-001"
                          className={`w-full px-3 py-2 text-sm border rounded-lg ${
                            errors[`variant_sku_${index}`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Saiz</label>
                        <input
                          type="text"
                          value={variant.size || ''}
                          onChange={(e) => handleVariantChange(index, 'size', e.target.value)}
                          placeholder="S, M, L..."
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Warna</label>
                        <input
                          type="text"
                          value={variant.color || ''}
                          onChange={(e) => handleVariantChange(index, 'color', e.target.value)}
                          placeholder="Merah, Biru..."
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Stok *</label>
                        <input
                          type="number"
                          value={variant.stock}
                          onChange={(e) => handleVariantChange(index, 'stock', e.target.value)}
                          min="0"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Harga Khas (RM)</label>
                        <input
                          type="number"
                          value={variant.price_override || ''}
                          onChange={(e) => handleVariantChange(index, 'price_override', e.target.value)}
                          placeholder={basePrice.toFixed(2)}
                          step="0.01"
                          min="0"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Images */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 border-b pb-3">
              <ImageIcon className="h-5 w-5 text-blue-600" />
              Gambar Produk
              <span className="text-sm font-normal text-gray-500">({formData.images.length}/10)</span>
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
                disabled={!imageUrl.trim() || formData.images.length >= 10}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition disabled:opacity-50"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            {formData.images.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {formData.images.map((url, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={url}
                      alt={`Product ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg border"
                      onError={(e) => { e.target.src = 'https://via.placeholder.com/200?text=Error'; }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                    {index === 0 && (
                      <span className="absolute bottom-1 left-1 px-2 py-0.5 bg-violet-600 text-white text-xs rounded">
                        Utama
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-end gap-3">
          <button
            onClick={() => navigate('/vendor/products')}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition flex items-center gap-2 disabled:opacity-50"
            data-testid="submit-product-btn"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Menyimpan...
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                {isEditing ? 'Kemaskini' : 'Simpan'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VendorProductFormPage;
