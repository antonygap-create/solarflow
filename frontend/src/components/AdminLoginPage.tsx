import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const AdminLoginPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    setTimeout(() => {
      if (password === 'SolarAdmin_2026' || password === 'admin') {
        localStorage.setItem('admin_session', 'active_' + Date.now());
        navigate('/admin');
      } else {
        setError('Incorrect admin password. Access denied.');
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <span className="text-4xl">🔐</span>
          <h2 className="text-2xl font-bold text-amber-400">Operator Login</h2>
          <p className="text-xs text-slate-400">Enter operator password to access calculator settings</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter operator password..."
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-red-300 text-xs">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-sm transition shadow-lg disabled:opacity-50"
          >
            {loading ? 'Authenticating…' : 'Access Admin Panel'}
          </button>
        </form>
      </div>
    </div>
  );
};
