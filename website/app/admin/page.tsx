'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ServerStats {
  uptime: number;
  connections: number;
  messagesRouted: number;
  pendingMessages: number;
  redis: {
    connected: boolean;
    memory: string;
  };
}

interface Report {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: string;
  status: string;
  createdAt: string;
}

interface Ban {
  whisperId: string;
  reason: string;
  bannedAt: string;
  bannedBy: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [bans, setBans] = useState<Ban[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'https://sarjmobile.com:3031';

  const fetchStats = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  };

  const fetchReports = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/admin/reports`, {
        headers: { 'X-Admin-API-Key': apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (e) {
      console.error('Failed to fetch reports:', e);
    }
  };

  const fetchBans = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/admin/bans`, {
        headers: { 'X-Admin-API-Key': apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        setBans(data.bans || []);
      }
    } catch (e) {
      console.error('Failed to fetch bans:', e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Test the API key by fetching reports
      const res = await fetch(`${SERVER_URL}/admin/reports`, {
        headers: { 'X-Admin-API-Key': apiKey }
      });

      if (res.ok) {
        setIsAuthenticated(true);
        localStorage.setItem('adminApiKey', apiKey);
        await Promise.all([fetchStats(), fetchReports(), fetchBans()]);
      } else {
        setError('Invalid API key');
      }
    } catch (e) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedKey = localStorage.getItem('adminApiKey');
    if (savedKey) {
      setApiKey(savedKey);
      setIsAuthenticated(true);
    }

    // Always fetch public stats
    fetchStats();
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAuthenticated && apiKey) {
      fetchReports();
      fetchBans();

      // Refresh stats every 30 seconds
      const interval = setInterval(fetchStats, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, apiKey]);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  const handleLogout = () => {
    localStorage.removeItem('adminApiKey');
    setIsAuthenticated(false);
    setApiKey('');
    setReports([]);
    setBans([]);
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">W</span>
            </div>
            <span className="text-xl font-semibold">Whisper Admin</span>
          </Link>
          {isAuthenticated && (
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-white text-sm"
            >
              Logout
            </button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Login Form */}
        {!isAuthenticated && (
          <div className="max-w-md mx-auto mb-8">
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h2 className="text-xl font-semibold mb-4">Admin Login</h2>
              <form onSubmit={handleLogin}>
                <input
                  type="password"
                  placeholder="Admin API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-4"
                />
                {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || !apiKey}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium disabled:opacity-50"
                >
                  {loading ? 'Connecting...' : 'Login'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="text-gray-400 text-sm mb-1">Server Uptime</div>
            <div className="text-2xl font-semibold">
              {stats ? formatUptime(stats.uptime) : '—'}
            </div>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="text-gray-400 text-sm mb-1">Active Connections</div>
            <div className="text-2xl font-semibold text-green-500">
              {stats?.connections ?? '—'}
            </div>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="text-gray-400 text-sm mb-1">Messages Routed</div>
            <div className="text-2xl font-semibold">
              {stats?.messagesRouted?.toLocaleString() ?? '—'}
            </div>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="text-gray-400 text-sm mb-1">Redis Status</div>
            <div className="text-2xl font-semibold">
              {stats?.redis?.connected ? (
                <span className="text-green-500">Connected</span>
              ) : (
                <span className="text-red-500">Disconnected</span>
              )}
            </div>
          </div>
        </div>

        {/* Admin-only sections */}
        {isAuthenticated && (
          <>
            {/* Reports Section */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 mb-8">
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Recent Reports</h2>
                <span className="text-sm text-gray-400">{reports.length} total</span>
              </div>
              <div className="divide-y divide-gray-800">
                {reports.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">
                    No reports found
                  </div>
                ) : (
                  reports.slice(0, 10).map((report) => (
                    <div key={report.id} className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-gray-400">Reported:</span>{' '}
                          <span className="font-mono text-sm">{report.reportedId}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          report.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                          report.status === 'reviewed' ? 'bg-blue-500/20 text-blue-500' :
                          'bg-green-500/20 text-green-500'
                        }`}>
                          {report.status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        Reason: {report.reason}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bans Section */}
            <div className="bg-gray-900 rounded-xl border border-gray-800">
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Banned Users</h2>
                <span className="text-sm text-gray-400">{bans.length} total</span>
              </div>
              <div className="divide-y divide-gray-800">
                {bans.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">
                    No banned users
                  </div>
                ) : (
                  bans.slice(0, 10).map((ban) => (
                    <div key={ban.whisperId} className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm">{ban.whisperId}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(ban.bannedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        Reason: {ban.reason}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
