import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { Card, Badge, Spinner } from '../../../components/common';
import { FEE_CATEGORIES } from '../../../constants';

export const AdminFeesPage = () => {
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { const fetchFees = async () => { try { const res = await api.get('/api/fees'); setFees(res.data); } catch (err) { toast.error('Gagal memuatkan'); } finally { setLoading(false); } }; fetchFees(); }, []);

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="admin-fees-page">
      <div><h1 className="text-2xl font-bold text-primary-900 font-heading">Pengurusan Yuran</h1><p className="text-slate-600 mt-1">Senarai semua yuran pelajar</p></div>
      {loading ? <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200"><th className="text-left py-3 px-4 font-medium text-slate-600">Pelajar</th><th className="text-left py-3 px-4 font-medium text-slate-600">Kategori</th><th className="text-right py-3 px-4 font-medium text-slate-600">Jumlah</th><th className="text-right py-3 px-4 font-medium text-slate-600">Dibayar</th><th className="text-center py-3 px-4 font-medium text-slate-600">Status</th></tr></thead>
              <tbody>
                {fees.map((fee) => (
                  <tr key={fee.id} className="border-b border-slate-100">
                    <td className="py-3 px-4"><p className="font-medium text-slate-900">{fee.student_name}</p><p className="text-xs text-slate-500">{fee.description}</p></td>
                    <td className="py-3 px-4">{FEE_CATEGORIES[fee.category] || fee.category}</td>
                    <td className="py-3 px-4 text-right">RM {fee.amount.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">RM {fee.paid_amount.toFixed(2)}</td>
                    <td className="py-3 px-4 text-center"><Badge status={fee.status}>{fee.status === 'paid' ? 'Selesai' : fee.status === 'partial' ? 'Separa' : 'Belum Bayar'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AdminFeesPage;
