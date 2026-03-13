import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Target, Users, Wallet, Heart } from 'lucide-react';
import api from '../../../services/api';
import { Card, StatCard, Badge, Spinner, ProgressBar } from '../../../components/common';

export const AdminSedekahPage = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [donations, setDonations] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('campaigns');

  const fetchData = async () => {
    try {
      const [campaignsRes, donationsRes, statsRes] = await Promise.all([
        api.get('/api/tabung/campaigns'),
        api.get('/api/tabung/donations'),
        api.get('/api/tabung/stats')
      ]);
      setCampaigns(campaignsRes.data);
      setDonations(donationsRes.data);
      setStats(statsRes.data);
    } catch (err) {
      toast.error('Gagal memuatkan data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  const c = stats?.campaigns || {};
  const d = stats?.donations || {};
  const totalTarget = campaigns.reduce((sum, c) => sum + (c.target_amount || (c.total_slots || 0) * (c.price_per_slot || 0)), 0);
  const overallProgress = totalTarget > 0 ? ((d.total_amount || 0) / totalTarget * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="admin-sedekah-page">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 font-heading">Pengurusan Tabung & Sumbangan</h1>
        <p className="text-slate-600 mt-1">Urus kempen dan lihat sumbangan berpusat</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Target} label="Kempen Aktif" value={c.active ?? 0} color="primary" />
        <StatCard icon={Users} label="Jumlah Penderma" value={d.unique_donors ?? 0} color="secondary" />
        <StatCard icon={Wallet} label="Sasaran" value={`RM ${totalTarget.toLocaleString()}`} color="warning" />
        <StatCard icon={Heart} label="Terkumpul" value={`RM ${(d.total_amount || 0).toLocaleString()}`} subtext={`${overallProgress}%`} color="success" />
      </div>

      <div className="flex gap-2">
        {['campaigns', 'donations', 'donors'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {tab === 'campaigns' ? 'Kempen' : tab === 'donations' ? 'Sumbangan' : 'Top Penderma'}
          </button>
        ))}
      </div>

      {activeTab === 'campaigns' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Kempen</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-600">Sasaran</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-600">Terkumpul</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-600">Progress</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => {
                  const target = campaign.target_amount ?? (campaign.total_slots || 0) * (campaign.price_per_slot || 0);
                  const collected = campaign.collected_amount ?? campaign.total_collected ?? 0;
                  const progress = target > 0 ? (collected / target * 100) : 0;
                  const isActive = campaign.status === 'active';
                  return (
                    <tr key={campaign.id} className="border-b border-slate-100">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{campaign.title}</p>
                        <p className="text-xs text-slate-500">{campaign.donor_count ?? 0} penderma</p>
                      </td>
                      <td className="py-3 px-4 text-right">RM {target.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-semibold text-primary-700">RM {collected.toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <div className="w-24 mx-auto">
                          <ProgressBar percent={progress} color="primary" />
                          <p className="text-xs text-center mt-1">{progress.toFixed(0)}%</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge status={isActive ? 'active' : 'inactive'}>{isActive ? 'Aktif' : 'Tutup'}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'donations' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Tarikh</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Penderma</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Kempen</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-600">Jumlah</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Resit</th>
                </tr>
              </thead>
              <tbody>
                {donations.slice(0, 50).map((donation) => (
                  <tr key={donation.id} className="border-b border-slate-100">
                    <td className="py-3 px-4 text-xs text-slate-500">{new Date(donation.created_at).toLocaleDateString('ms-MY')}</td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{donation.is_anonymous ? 'Tanpa Nama' : (donation.donor_name || 'Penderma')}</p>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{donation.campaign_title || '-'}</td>
                    <td className="py-3 px-4 text-right font-semibold text-primary-700">RM {(donation.amount || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{donation.receipt_number || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'donors' && (
        <Card>
          <h3 className="font-semibold text-slate-900 mb-4">Top 10 Penderma</h3>
          <div className="space-y-3">
            {(stats?.top_donors || []).map((donor, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-300'}`}>
                    {i + 1}
                  </div>
                  <p className="font-medium text-slate-900">{donor.name || 'Penderma'}</p>
                </div>
                <p className="text-xl font-bold text-primary-700">RM {(donor.total || 0).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default AdminSedekahPage;
