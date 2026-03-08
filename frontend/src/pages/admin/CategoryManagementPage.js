import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderTree, Plus, Edit, Trash2, Save, X, Search, ChevronRight, ChevronDown,
  Package, Shirt, Watch, Pencil, Trophy, UtensilsCrossed, Gift, BookOpen,
  Star, Palette, Briefcase, Tag, RefreshCw, Eye, EyeOff, DollarSign, Move,
  FolderPlus, ArrowRight, AlertCircle, Check
} from 'lucide-react';
import api from '../../services/api';

// Icon mapping
const ICON_MAP = {
  Shirt: Shirt,
  Watch: Watch,
  Pencil: Pencil,
  Trophy: Trophy,
  UtensilsCrossed: UtensilsCrossed,
  Package: Package,
  Gift: Gift,
  Star: Star,
  Palette: Palette,
  Briefcase: Briefcase,
  Tag: Tag,
  FolderTree: FolderTree,
  BookOpen: BookOpen
};

// Color mapping for Tailwind
const COLOR_MAP = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200', accent: 'bg-blue-500' },
  purple: { bg: 'bg-pastel-lavender', text: 'text-violet-600', border: 'border-pastel-lilac', accent: 'bg-violet-500' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600', border: 'border-amber-200', accent: 'bg-amber-500' },
  green: { bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200', accent: 'bg-green-500' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-200', accent: 'bg-orange-500' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', accent: 'bg-slate-500' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-600', border: 'border-pink-200', accent: 'bg-pink-500' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-600', border: 'border-yellow-200', accent: 'bg-yellow-500' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-600', border: 'border-teal-200', accent: 'bg-teal-500' },
  indigo: { bg: 'bg-pastel-mint', text: 'text-teal-600', border: 'border-pastel-lilac', accent: 'bg-teal-500' }
};

const SCOPE_STYLES = {
  shared: { bg: 'bg-gradient-to-r from-violet-500 to-fuchsia-500', label: 'Dikongsi' },
  koperasi_only: { bg: 'bg-blue-500', label: 'Koperasi' },
  merchandise_only: { bg: 'bg-pink-500', label: 'Merchandise' },
  pum_only: { bg: 'bg-emerald-500', label: 'PUM' }
};

const CategoryManagementPage = ({ token }) => {
  const [categories, setCategories] = useState([]);
  const [treeCategories, setTreeCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSubCategoryModal, setShowSubCategoryModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [parentCategory, setParentCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'tree'
  const [expandedCategories, setExpandedCategories] = useState(new Set());

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const [flatRes, treeRes] = await Promise.all([
        api.get(`/api/categories?include_inactive=${showInactive}${scopeFilter ? `&scope=${scopeFilter}` : ''}`),
        api.get('/api/categories/tree')
      ]);
      setCategories(flatRes.data);
      setTreeCategories(treeRes.data);
    } catch (err) {
      toast.error('Gagal memuatkan kategori');
    } finally {
      setLoading(false);
    }
  }, [showInactive, scopeFilter]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleSave = async (categoryData) => {
    try {
      if (selectedCategory) {
        await api.put(`/api/categories/${selectedCategory.id}`, categoryData);
        toast.success('Kategori berjaya dikemaskini');
      } else {
        await api.post('/api/categories', categoryData);
        toast.success('Kategori berjaya dicipta');
      }
      setShowModal(false);
      setSelectedCategory(null);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan kategori');
    }
  };

  const handleSaveSubCategory = async (categoryData) => {
    try {
      await api.post(`/api/categories/${parentCategory.id}/subcategory`, categoryData);
      toast.success('Sub-kategori berjaya dicipta');
      setShowSubCategoryModal(false);
      setParentCategory(null);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal mencipta sub-kategori');
    }
  };

  const handleMoveCategory = async (newParentId) => {
    try {
      await api.put(`/api/categories/${selectedCategory.id}/move?new_parent_id=${newParentId || ''}`);
      toast.success('Kategori berjaya dipindahkan');
      setShowMoveModal(false);
      setSelectedCategory(null);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memindahkan kategori');
    }
  };

  const handleDelete = async (categoryId) => {
    if (!window.confirm('Padam kategori ini?')) return;
    try {
      await api.delete(`/api/categories/${categoryId}`);
      toast.success('Kategori berjaya dipadam');
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal memadam kategori');
    }
  };

  const handleSeedDefaults = async () => {
    try {
      const res = await api.post('/api/categories/koperasi/seed');
      toast.success(res.data.message);
      fetchCategories();
    } catch (err) {
      toast.error('Gagal mencipta kategori default');
    }
  };

  const toggleExpanded = (categoryId) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get root categories (no parent)
  const rootCategories = filteredCategories.filter(cat => !cat.parent_id);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pastel-lavender/30 to-pastel-rose/30 min-w-0 overflow-x-hidden">
      <div className="max-w-7xl mx-auto p-6 space-y-6" data-testid="category-management-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-600 to-violet-600 bg-clip-text text-transparent">
              Pengurusan Kategori
            </h1>
            <p className="text-slate-500 text-sm mt-1">Urus kategori produk dengan sub-kategori untuk semua modul</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 text-sm ${viewMode === 'grid' ? 'bg-pastel-lavender text-violet-700' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('tree')}
                className={`px-3 py-2 text-sm ${viewMode === 'tree' ? 'bg-pastel-lavender text-violet-700' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <FolderTree size={16} className="inline mr-1" />
                Tree
              </button>
            </div>
            <button
              onClick={handleSeedDefaults}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-white shadow-sm"
              data-testid="seed-defaults-btn"
            >
              <RefreshCw size={16} />
              <span className="hidden sm:inline">Seed Koperasi</span>
            </button>
            <button
              onClick={() => { setSelectedCategory(null); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-violet-600 text-white rounded-lg hover:from-teal-700 hover:to-violet-700 shadow-md hover:shadow-lg transition-all"
              data-testid="add-category-btn"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Tambah Kategori</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Jumlah</p>
            <p className="text-2xl font-bold text-slate-900">{categories.length}</p>
          </div>
          <div className="bg-gradient-to-br from-teal-500 to-violet-500 rounded-xl p-4 shadow-md">
            <p className="text-xs text-white/80 uppercase tracking-wide">Dikongsi</p>
            <p className="text-2xl font-bold text-white">{categories.filter(c => c.scope === 'shared').length}</p>
          </div>
          <div className="bg-blue-500 rounded-xl p-4 shadow-md">
            <p className="text-xs text-white/80 uppercase tracking-wide">Koperasi</p>
            <p className="text-2xl font-bold text-white">{categories.filter(c => c.scope === 'koperasi_only').length}</p>
          </div>
          <div className="bg-emerald-500 rounded-xl p-4 shadow-md">
            <p className="text-xs text-white/80 uppercase tracking-wide">PUM</p>
            <p className="text-2xl font-bold text-white">{categories.filter(c => c.scope === 'pum_only').length}</p>
          </div>
          <div className="bg-amber-500 rounded-xl p-4 shadow-md">
            <p className="text-xs text-white/80 uppercase tracking-wide">Komisyen</p>
            <p className="text-2xl font-bold text-white">{categories.filter(c => c.commission_eligible).length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Cari kategori..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                data-testid="search-category-input"
              />
            </div>
            <div className="flex gap-3 flex-wrap">
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                className="px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                data-testid="scope-filter"
              >
                <option value="">Semua Skop</option>
                <option value="shared">Dikongsi</option>
                <option value="koperasi_only">Koperasi Sahaja</option>
                <option value="merchandise_only">Merchandise Sahaja</option>
                <option value="pum_only">PUM Sahaja</option>
              </select>
              <button
                onClick={() => setShowInactive(!showInactive)}
                className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm ${showInactive ? 'bg-slate-100 border-slate-300' : 'border-slate-200 hover:bg-slate-50'}`}
                data-testid="show-inactive-btn"
              >
                {showInactive ? <Eye size={16} /> : <EyeOff size={16} />}
                {showInactive ? 'Semua' : 'Aktif'}
              </button>
            </div>
          </div>
        </div>

        {/* Categories Display */}
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto"></div>
            <p className="mt-4 text-slate-500 text-sm">Memuatkan kategori...</p>
          </div>
        ) : viewMode === 'tree' ? (
          /* Tree View */
          <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <FolderTree size={16} className="text-teal-500" />
              Hierarki Kategori
            </h3>
            <div className="space-y-2">
              {treeCategories.map(cat => (
                <TreeNode
                  key={cat.id}
                  category={cat}
                  level={0}
                  expanded={expandedCategories}
                  onToggle={toggleExpanded}
                  onEdit={(c) => { setSelectedCategory(c); setShowModal(true); }}
                  onDelete={handleDelete}
                  onAddSub={(c) => { setParentCategory(c); setShowSubCategoryModal(true); }}
                  onMove={(c) => { setSelectedCategory(c); setShowMoveModal(true); }}
                />
              ))}
              {treeCategories.length === 0 && (
                <div className="text-center py-8">
                  <FolderTree className="mx-auto text-slate-300" size={40} />
                  <p className="mt-3 text-slate-500 text-sm">Tiada kategori. Klik "Seed Koperasi" untuk mula.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Grid View */
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rootCategories.map(category => (
              <CategoryCard
                key={category.id}
                category={category}
                allCategories={categories}
                onEdit={() => { setSelectedCategory(category); setShowModal(true); }}
                onDelete={() => handleDelete(category.id)}
                onAddSub={() => { setParentCategory(category); setShowSubCategoryModal(true); }}
                onMove={() => { setSelectedCategory(category); setShowMoveModal(true); }}
              />
            ))}
            {rootCategories.length === 0 && (
              <div className="col-span-full text-center py-16">
                <FolderTree className="mx-auto text-slate-300" size={48} />
                <p className="mt-4 text-slate-500">Tiada kategori dijumpai</p>
                <button
                  onClick={handleSeedDefaults}
                  className="mt-4 px-4 py-2 bg-pastel-lavender text-violet-700 rounded-lg hover:bg-pastel-lilac text-sm"
                >
                  Seed Kategori Default
                </button>
              </div>
            )}
          </div>
        )}

        {/* Modals */}
        <CategoryModal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setSelectedCategory(null); }}
          category={selectedCategory}
          onSave={handleSave}
          existingCategories={categories}
          isSubCategory={false}
        />

        <CategoryModal
          isOpen={showSubCategoryModal}
          onClose={() => { setShowSubCategoryModal(false); setParentCategory(null); }}
          category={null}
          onSave={handleSaveSubCategory}
          existingCategories={categories}
          isSubCategory={true}
          parentCategory={parentCategory}
        />

        <MoveModal
          isOpen={showMoveModal}
          onClose={() => { setShowMoveModal(false); setSelectedCategory(null); }}
          category={selectedCategory}
          categories={categories}
          onMove={handleMoveCategory}
        />
      </div>
    </div>
  );
};

// Tree Node Component
const TreeNode = ({ category, level, expanded, onToggle, onEdit, onDelete, onAddSub, onMove }) => {
  const isExpanded = expanded.has(category.id);
  const hasChildren = category.children && category.children.length > 0;
  const IconComponent = ICON_MAP[category.icon] || Tag;
  const colors = COLOR_MAP[category.color] || COLOR_MAP.slate;

  return (
    <div>
      <div 
        className={`flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 group`}
        style={{ marginLeft: `${level * 24}px` }}
      >
        {/* Expand/Collapse Button */}
        <button 
          onClick={() => hasChildren && onToggle(category.id)}
          className={`w-5 h-5 flex items-center justify-center ${hasChildren ? 'text-slate-400 hover:text-slate-600' : 'text-transparent'}`}
        >
          {hasChildren && (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
        </button>

        {/* Icon */}
        <div className={`p-2 rounded-lg ${colors.bg} ${colors.text}`}>
          <IconComponent size={16} />
        </div>

        {/* Name & Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800 truncate">{category.name}</span>
            <span className="text-xs text-slate-400 font-mono">{category.code}</span>
            {category.commission_eligible && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                <DollarSign size={10} />
                Komisyen
              </span>
            )}
          </div>
        </div>

        {/* Scope Badge */}
        <span className={`px-2 py-1 rounded-full text-xs text-white ${SCOPE_STYLES[category.scope]?.bg || 'bg-slate-500'}`}>
          {SCOPE_STYLES[category.scope]?.label || category.scope}
        </span>

        {/* Actions */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onAddSub(category)}
            className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-pastel-mint/50 rounded"
            title="Tambah Sub-kategori"
          >
            <FolderPlus size={14} />
          </button>
          <button
            onClick={() => onMove(category)}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="Pindah Kategori"
          >
            <Move size={14} />
          </button>
          <button
            onClick={() => onEdit(category)}
            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded"
            title="Edit"
          >
            <Edit size={14} />
          </button>
          <button
            onClick={() => onDelete(category.id)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Padam"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="ml-2 border-l border-slate-200">
          {category.children.map(child => (
            <TreeNode
              key={child.id}
              category={child}
              level={level + 1}
              expanded={expanded}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddSub={onAddSub}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Category Card Component
const CategoryCard = ({ category, allCategories, onEdit, onDelete, onAddSub, onMove }) => {
  const IconComponent = ICON_MAP[category.icon] || Tag;
  const colors = COLOR_MAP[category.color] || COLOR_MAP.slate;
  
  // Get children
  const children = allCategories.filter(c => c.parent_id === category.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl border ${category.is_active ? 'border-slate-100' : 'border-red-200 bg-red-50/50'} p-5 hover:shadow-lg transition-all group`}
      data-testid={`category-card-${category.code}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${colors.bg} ${colors.text} ${colors.border} border`}>
            <IconComponent size={22} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{category.name}</h3>
            <p className="text-xs text-slate-400 font-mono">{category.code}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs text-white ${SCOPE_STYLES[category.scope]?.bg || 'bg-slate-500'}`}>
          {SCOPE_STYLES[category.scope]?.label || category.scope}
        </span>
      </div>

      {category.description && (
        <p className="mt-3 text-sm text-slate-500 line-clamp-2">{category.description}</p>
      )}

      {/* Commission Badge */}
      {category.commission_eligible && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-100">
          <DollarSign size={14} className="text-amber-600" />
          <span className="text-xs text-amber-700 font-medium">Komisyen PUM diaktifkan</span>
        </div>
      )}

      {/* Children Preview */}
      {children.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {children.slice(0, 3).map(child => (
            <span key={child.id} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
              {child.name}
            </span>
          ))}
          {children.length > 3 && (
            <span className="px-2 py-1 bg-slate-100 text-slate-400 text-xs rounded-full">
              +{children.length - 3} lagi
            </span>
          )}
        </div>
      )}

      {/* Usage Stats */}
      <div className="mt-4 flex gap-2 flex-wrap">
        {category.koperasi_count > 0 && (
          <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded-full font-medium">
            Koop: {category.koperasi_count}
          </span>
        )}
        {category.merchandise_count > 0 && (
          <span className="px-2 py-1 bg-pink-50 text-pink-600 text-xs rounded-full font-medium">
            Merch: {category.merchandise_count}
          </span>
        )}
        {category.pum_count > 0 && (
          <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-xs rounded-full font-medium">
            PUM: {category.pum_count}
          </span>
        )}
        {category.total_count === 0 && !children.length && (
          <span className="px-2 py-1 bg-slate-50 text-slate-400 text-xs rounded-full">
            Tiada produk
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
        <button
          onClick={onAddSub}
          className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-800 font-medium"
        >
          <FolderPlus size={14} />
          Sub-kategori
        </button>
        <div className="flex gap-1">
          <button
            onClick={onMove}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Pindah"
          >
            <Move size={16} />
          </button>
          <button
            onClick={onEdit}
            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
            data-testid={`edit-category-${category.code}`}
          >
            <Edit size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            disabled={category.total_count > 0 || children.length > 0}
            data-testid={`delete-category-${category.code}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// Category Modal Component
const CategoryModal = ({ isOpen, onClose, category, onSave, existingCategories, isSubCategory, parentCategory }) => {
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    scope: 'shared',
    icon: 'Tag',
    color: 'slate',
    sort_order: 0,
    commission_eligible: false
  });

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        code: category.code,
        description: category.description || '',
        scope: category.scope,
        icon: category.icon || 'Tag',
        color: category.color || 'slate',
        sort_order: category.sort_order || 0,
        commission_eligible: category.commission_eligible || false
      });
    } else if (isSubCategory && parentCategory) {
      setFormData({
        name: '',
        code: '',
        description: '',
        scope: parentCategory.scope,
        icon: parentCategory.icon || 'Tag',
        color: parentCategory.color || 'slate',
        sort_order: 0,
        commission_eligible: parentCategory.commission_eligible || false
      });
    } else {
      setFormData({
        name: '',
        code: '',
        description: '',
        scope: 'shared',
        icon: 'Tag',
        color: 'slate',
        sort_order: existingCategories.length,
        commission_eligible: false
      });
    }
  }, [category, existingCategories.length, isSubCategory, parentCategory]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const generateCode = (name) => {
    return name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');
  };

  const ICONS = ['Tag', 'Shirt', 'Watch', 'Pencil', 'Trophy', 'UtensilsCrossed', 'Package', 'Gift', 'Star', 'Palette', 'Briefcase', 'BookOpen'];
  const COLORS = ['blue', 'purple', 'amber', 'green', 'orange', 'slate', 'pink', 'yellow', 'teal', 'indigo'];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-pastel-lavender to-pastel-rose shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-900 truncate">
                  {category ? 'Edit Kategori' : isSubCategory ? 'Tambah Sub-kategori' : 'Tambah Kategori'}
                </h2>
                {isSubCategory && parentCategory && (
                  <p className="text-sm text-slate-500 mt-1 truncate">
                    Di bawah: <span className="font-medium text-violet-600">{parentCategory.name}</span>
                  </p>
                )}
              </div>
              <button onClick={onClose} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-white rounded-lg transition-colors flex-shrink-0" aria-label="Tutup">
                <X size={20} />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5" data-testid="category-form">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Kategori</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ 
                    ...formData, 
                    name: e.target.value,
                    code: !category ? generateCode(e.target.value) : formData.code
                  });
                }}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                placeholder="cth: Pakaian Seragam"
                required
                data-testid="category-name-input"
              />
            </div>

            {/* Code */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Kod (Unik)</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                placeholder="cth: pakaian_seragam"
                required
                disabled={!!category}
                data-testid="category-code-input"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Penerangan (Pilihan)</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                rows={2}
                placeholder="Penerangan ringkas tentang kategori"
                data-testid="category-description-input"
              />
            </div>

            {/* Scope */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Skop Penggunaan</label>
              <select
                value={formData.scope}
                onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                disabled={isSubCategory}
                data-testid="category-scope-select"
              >
                <option value="shared">Dikongsi (Semua Modul)</option>
                <option value="koperasi_only">Koperasi Sahaja</option>
                <option value="merchandise_only">Merchandise Sahaja</option>
                <option value="pum_only">PUM Sahaja</option>
              </select>
            </div>

            {/* Commission Toggle */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <DollarSign size={18} className="text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-800 text-sm">Komisyen PUM</p>
                  <p className="text-xs text-slate-500">Aktifkan untuk kategori ini</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, commission_eligible: !formData.commission_eligible })}
                className={`relative w-12 h-6 rounded-full transition-colors ${formData.commission_eligible ? 'bg-amber-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${formData.commission_eligible ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            {/* Icon Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ikon</label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(icon => {
                  const IconComp = ICON_MAP[icon] || Tag;
                  return (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon })}
                      className={`p-2.5 rounded-lg border-2 transition-all ${formData.icon === icon ? 'border-teal-500 bg-pastel-mint/50 scale-110' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      <IconComp size={18} className={formData.icon === icon ? 'text-violet-600' : 'text-slate-500'} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Warna</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-9 h-9 rounded-lg border-2 transition-all flex items-center justify-center ${formData.color === color ? 'ring-2 ring-offset-2 ring-teal-500 scale-110' : ''} ${COLOR_MAP[color]?.accent || 'bg-slate-100'}`}
                  >
                    {formData.color === color && <Check size={14} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm font-medium"
              >
                Batal
              </button>
              <button
                type="submit"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-600 to-violet-600 text-white rounded-lg hover:from-teal-700 hover:to-violet-700 text-sm font-medium shadow-md"
                data-testid="save-category-btn"
              >
                <Save size={16} />
                Simpan
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Move Modal Component
const MoveModal = ({ isOpen, onClose, category, categories, onMove }) => {
  const [selectedParent, setSelectedParent] = useState(null);

  if (!isOpen || !category) return null;

  // Filter out self and children
  const getDescendants = (catId) => {
    const children = categories.filter(c => c.parent_id === catId);
    let descendants = children.map(c => c.id);
    children.forEach(child => {
      descendants = [...descendants, ...getDescendants(child.id)];
    });
    return descendants;
  };

  const descendants = getDescendants(category.id);
  const availableParents = categories.filter(c => 
    c.id !== category.id && 
    !descendants.includes(c.id) &&
    c.scope === category.scope // Same scope only
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] min-h-screen"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6 border-b border-slate-100 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                  <Move size={20} className="text-blue-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900">Pindah Kategori</h2>
                  <p className="text-sm text-slate-500 truncate">{category.name}</p>
                </div>
              </div>
              <button onClick={onClose} className="min-w-[44px] min-h-[44px] p-2 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg flex-shrink-0" aria-label="Tutup">
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100">
              <AlertCircle size={16} className="text-amber-600" />
              <p className="text-xs text-amber-700">Hanya kategori dengan skop sama boleh dipilih</p>
            </div>

            {/* Move to Root */}
            <button
              onClick={() => { setSelectedParent(null); onMove(null); }}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left ${selectedParent === null ? 'border-teal-500 bg-pastel-mint/50' : 'border-slate-200 hover:border-teal-300'}`}
            >
              <div className="flex items-center gap-3">
                <FolderTree size={20} className="text-violet-600" />
                <div>
                  <p className="font-medium text-slate-800">Jadikan Kategori Utama</p>
                  <p className="text-xs text-slate-500">Pindah ke tahap teratas</p>
                </div>
              </div>
            </button>

            {/* Available Parents */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {availableParents.map(parent => {
                const IconComponent = ICON_MAP[parent.icon] || Tag;
                const colors = COLOR_MAP[parent.color] || COLOR_MAP.slate;
                return (
                  <button
                    key={parent.id}
                    onClick={() => { setSelectedParent(parent.id); onMove(parent.id); }}
                    className={`w-full p-3 rounded-xl border-2 transition-all text-left ${selectedParent === parent.id ? 'border-teal-500 bg-pastel-mint/50' : 'border-slate-200 hover:border-teal-300'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${colors.bg} ${colors.text}`}>
                        <IconComponent size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{parent.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{parent.code}</p>
                      </div>
                      <ArrowRight size={14} className="text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>

            {availableParents.length === 0 && (
              <div className="text-center py-4">
                <p className="text-slate-500 text-sm">Tiada kategori lain dengan skop sama</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CategoryManagementPage;
