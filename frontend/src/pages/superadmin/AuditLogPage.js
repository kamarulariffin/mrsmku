import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';

// Components
const Spinner = ({ size = 'md' }) => (
  <div className={`spinner ${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'}`}></div>
);

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-xl border border-slate-100 p-6 relative overflow-hidden ${className}`} {...props}>{children}</div>
);

const AuditLogPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/audit-logs', { params: { limit: 100 } });
      setLogs(res.data);
    } catch (err) { toast.error('Gagal memuatkan audit log'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden" data-testid="audit-log-page">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 font-heading">Audit Log</h1>
          <p className="text-slate-600 mt-1">Rekod aktiviti sistem</p>
        </div>
        <button
          type="button"
          onClick={fetchLogs}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Muat semula
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
      ) : (
        <Card>
          {logs.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <p className="font-medium">Tiada rekod aktiviti</p>
              <p className="text-sm mt-1">Log audit akan dipaparkan di sini apabila ada aktiviti sistem.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Masa</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Pengguna</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Role</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Tindakan</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Modul</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Butiran</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100">
                      <td className="py-3 px-4 text-xs text-slate-500">{new Date(log.created_at).toLocaleString('ms-MY')}</td>
                      <td className="py-3 px-4 font-medium">{log.user_name}</td>
                      <td className="py-3 px-4"><span className="px-2 py-0.5 bg-slate-100 rounded text-xs">{log.user_role}</span></td>
                      <td className="py-3 px-4">{log.action}</td>
                      <td className="py-3 px-4">{log.module}</td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export { AuditLogPage };
export default AuditLogPage;
