import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users, Heart, Wallet, Target, GraduationCap
} from 'lucide-react';
import api from '../../services/api';
import { Spinner, Button } from '../../components/common';

const DEFAULT_MILESTONES = [50000, 100000, 200000];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeMilestones = (rawMilestones) => {
  const values = Array.isArray(rawMilestones) ? rawMilestones : DEFAULT_MILESTONES;
  const normalized = values
    .map((value) => toNumber(value, 0))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_MILESTONES];
};

const deriveMilestoneMeta = (campaign) => {
  const current = Math.max(toNumber(campaign?.collected_amount ?? campaign?.total_collected, 0), 0);
  const milestones = normalizeMilestones(campaign?.milestones);
  let next = toNumber(campaign?.milestone_next, 0);

  if (next <= 0) {
    const found = milestones.find((value) => current < value);
    if (found) {
      next = found;
    } else {
      const step = milestones.length > 1 ? milestones[milestones.length - 1] - milestones[milestones.length - 2] : milestones[0];
      next = milestones[milestones.length - 1] + Math.max(step, 1);
      while (current >= next) next += Math.max(step, 1);
    }
  }

  const floor = milestones.filter((value) => value < next).slice(-1)[0] || 0;
  const computedPercent = ((current - floor) / Math.max(next - floor, 1)) * 100;
  const percent = Math.min(Math.max(toNumber(campaign?.milestone_segment_progress_percent, computedPercent), 0), 100);
  return { current, next, percent };
};

const PublicSedekahPage = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [donationStats, setDonationStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('');

  useEffect(() => {
    fetchData();
  }, [filterCategory]);

  const fetchData = async () => {
    try {
      const [campaignsRes, statsRes] = await Promise.all([
        api.get('/api/tabung/public/campaigns', { params: { limit: 50 } }),
        api.get('/api/tabung/public/stats')
      ]);
      let list = campaignsRes.data;
      if (filterCategory) list = list.filter(c => (c.category || '') === filterCategory);
      setCampaigns(list);
      setDonationStats({
        total_collected: statsRes.data.total_collected,
        total_campaigns: statsRes.data.active_campaigns,
        unique_donors: statsRes.data.unique_donors,
        total_donations: statsRes.data.total_donations
      });
    } catch (err) {
      console.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { value: '', label: 'Semua Kategori', icon: '🎯' },
    { value: 'tabung_pelajar', label: 'Tabung Pelajar', icon: '📚' },
    { value: 'tabung_masjid', label: 'Tabung Surau', icon: '🕌' },
    { value: 'tabung_asrama', label: 'Tabung Asrama', icon: '🏠' },
    { value: 'tabung_kecemasan', label: 'Tabung Kecemasan', icon: '🆘' },
    { value: 'tabung_anak_yatim', label: 'Tabung Anak Yatim', icon: '💝' }
  ];

  const getCategoryLabel = (cat) => {
    const found = categories.find(c => c.value === cat);
    return found ? found.label : cat;
  };

  return (
    <div className="min-h-screen mesh-gradient" data-testid="public-sedekah-page">
      {/* Header */}
      <header className="glass fixed top-0 left-0 right-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/')}>
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-violet-500 rounded-xl flex items-center justify-center shadow-pastel group-hover:shadow-pastel-lg transition-all"><GraduationCap className="text-white" size={24} /></div>
            <span className="text-lg font-bold bg-gradient-to-r from-teal-600 to-violet-600 bg-clip-text text-transparent font-heading">Portal MRSMKU</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/login')} className="hover:bg-pastel-mint/50 hover:text-teal-600" data-testid="login-btn">Log Masuk</Button>
            <button onClick={() => navigate('/register')} className="px-5 py-2.5 bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-400 text-white font-semibold rounded-xl shadow-pastel-sm hover:shadow-pastel transition-all hover:scale-105" data-testid="register-btn">Daftar</button>
          </div>
        </div>
      </header>

      <main className="pt-24 pb-16">
        {/* Hero Banner */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-400"></div>
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-400/20 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-400/20 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl"></div>
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-white">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/20 backdrop-blur rounded-full mb-6 border border-white/30">
                <Heart className="text-pink-300 animate-pulse" size={20} />
                <span className="text-sm font-semibold">Program Sedekah MRSMKU</span>
              </div>
              <h1 className="text-5xl md:text-6xl font-extrabold font-heading mb-6 drop-shadow-lg">
                Hulurkan <span className="text-amber-300">Sumbangan</span> Anda
              </h1>
              <p className="text-white/90 max-w-2xl mx-auto text-lg leading-relaxed">
                Setiap sumbangan membantu pelajar MRSMKU mencapai kecemerlangan. Bersama kita membangun generasi akan datang.
              </p>
            </motion.div>
            
            {/* Stats */}
            {donationStats && (
              <motion.div 
                initial={{ opacity: 0, y: 30 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: 0.2 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 max-w-4xl mx-auto"
              >
                {[
                  { value: `RM ${donationStats.total_collected?.toLocaleString()}`, label: 'Terkumpul', icon: Wallet, color: 'from-amber-400 to-orange-500' },
                  { value: donationStats.total_campaigns, label: 'Kempen', icon: Target, color: 'from-cyan-400 to-blue-500' },
                  { value: donationStats.unique_donors, label: 'Penderma', icon: Users, color: 'from-pink-400 to-rose-500' },
                  { value: donationStats.total_donations, label: 'Sumbangan', icon: Heart, color: 'from-emerald-400 to-teal-500' }
                ].map((stat, i) => (
                  <motion.div 
                    key={i}
                    whileHover={{ scale: 1.05, y: -5 }}
                    className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/20 shadow-xl"
                  >
                    <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg`}>
                      <stat.icon className="text-white" size={24} />
                    </div>
                    <div className="text-2xl md:text-3xl font-extrabold">{stat.value}</div>
                    <p className="text-white/70 text-sm mt-1">{stat.label}</p>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </div>

        {/* Campaigns List */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
          {/* Filter */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-10"
          >
            <div>
              <h2 className="text-3xl font-extrabold bg-gradient-to-r from-teal-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent font-heading">Kempen Sedekah</h2>
              <p className="text-slate-600 mt-1">Pilih kempen dan hulurkan sumbangan anda</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <motion.button
                  key={cat.value}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setFilterCategory(cat.value)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    filterCategory === cat.value 
                      ? 'bg-gradient-to-r from-teal-500 to-violet-500 text-white shadow-pastel' 
                      : 'bg-white text-slate-700 border border-slate-200 hover:border-teal-300 hover:shadow-md'
                  }`}
                  data-testid={`filter-${cat.value || 'all'}`}
                >
                  {cat.label}
                </motion.button>
              ))}
            </div>
          </motion.div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : campaigns.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              className="text-center py-16 bg-white/60 backdrop-blur rounded-3xl border border-slate-200"
            >
              <div className="w-20 h-20 bg-gradient-to-br from-slate-200 to-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                <Heart className="text-slate-400" size={36} />
              </div>
              <p className="text-slate-500 text-lg">Tiada kempen dalam kategori ini</p>
            </motion.div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {campaigns.map((campaign, idx) => (
                <motion.div 
                  key={campaign.id} 
                  initial={{ opacity: 0, y: 30 }} 
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ y: -10, scale: 1.02 }}
                  className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 cursor-pointer group hover:shadow-pastel transition-all duration-300"
                  onClick={() => navigate(`/sedekah/${campaign.id}`)}
                  data-testid={`campaign-card-${campaign.id}`}
                >
                  <div className="relative h-52 overflow-hidden">
                    <img 
                      src={campaign.image_url || 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=400&h=200&fit=crop'} 
                      alt={campaign.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                    <div className="absolute top-4 left-4">
                      <span className="px-4 py-2 bg-white/95 backdrop-blur rounded-full text-xs font-bold text-violet-700 shadow-lg">
                        {getCategoryLabel(campaign.category)}
                      </span>
                    </div>
                    <div className="absolute top-4 right-4">
                      {campaign.is_unlimited ? (
                        <span className="px-4 py-2 rounded-full text-xs font-bold text-white shadow-lg bg-gradient-to-r from-emerald-500 to-teal-500">
                          Milestone
                        </span>
                      ) : (
                      <span className={`px-4 py-2 rounded-full text-xs font-bold text-white shadow-lg ${
                        campaign.progress_percent >= 100 
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500' 
                          : 'bg-gradient-to-r from-amber-500 to-orange-500'
                      }`}>
                        {campaign.progress_percent >= 100 ? '✓ Tercapai' : `${campaign.progress_percent?.toFixed(0) || 0}%`}
                      </span>
                      )}
                    </div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <h3 className="font-bold text-xl text-white drop-shadow-lg line-clamp-2">{campaign.title}</h3>
                    </div>
                  </div>
                  <div className="p-6">
                    <p className="text-slate-600 text-sm mb-5 line-clamp-2">{campaign.description}</p>
                    
                    {/* Progress Bar */}
                    <div className="mb-4">
                      {campaign.is_unlimited ? (
                        (() => {
                          const milestoneMeta = deriveMilestoneMeta(campaign);
                          return (
                            <>
                              <div className="flex justify-between text-sm mb-2">
                                <span className="font-bold text-teal-600 text-lg">RM {milestoneMeta.current.toLocaleString()}</span>
                                <span className="text-slate-500">Milestone RM {milestoneMeta.next.toLocaleString()}</span>
                              </div>
                              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${milestoneMeta.percent}%` }}
                                  transition={{ duration: 1, ease: "easeOut" }}
                                  className="h-full bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-400 rounded-full relative"
                                >
                                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                                </motion.div>
                              </div>
                            </>
                          );
                        })()
                      ) : (
                        <>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="font-bold text-teal-600 text-lg">RM {campaign.collected_amount?.toLocaleString()}</span>
                            <span className="text-slate-500">/ RM {campaign.target_amount?.toLocaleString()}</span>
                          </div>
                          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(campaign.progress_percent || 0, 100)}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className="h-full bg-gradient-to-r from-teal-500 via-violet-500 to-fuchsia-400 rounded-full relative"
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                            </motion.div>
                          </div>
                        </>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <span className="text-slate-500 flex items-center gap-2 text-sm">
                        <Users size={16} /> {campaign.donor_count || 0} penderma
                      </span>
                      <span className="text-pink-600 font-bold flex items-center gap-2 group-hover:text-pink-700">
                        <Heart size={16} className="group-hover:animate-pulse" /> Derma Sekarang
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gradient-to-br from-slate-900 via-teal-950 to-violet-950 text-white py-12 mt-20 relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-violet-500 rounded-xl shadow-pastel flex items-center justify-center shadow-lg"><GraduationCap className="text-white" size={22} /></div>
            <span className="font-bold text-lg">Portal MRSMKU</span>
          </div>
          <p className="text-slate-400 text-sm">© 2026 Portal MRSMKU. Hak Cipta Terpelihara.</p>
          <p className="text-teal-400 text-sm mt-2">Dibina dengan penuh kasih sayang untuk warga MRSMKU</p>
        </div>
      </footer>
    </div>
  );
};

export default PublicSedekahPage;
