import React from 'react';
import { Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Sun, Users, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const DashboardLayout: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col justify-between shrink-0">
        <div>
          {/* Brand Header */}
          <div className="flex items-center gap-2 px-2 py-3 mb-6">
            <Sun className="w-7 h-7 text-amber-400" />
            <div>
              <div className="font-extrabold text-lg text-white tracking-tight">SolarFlow</div>
              <div className="text-xs text-amber-400 font-medium">{user?.tenant_name || 'Installer Hub'}</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <Link
              to="/dashboard/leads"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                location.pathname.startsWith('/dashboard/leads')
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>B2C Leads Inbox</span>
            </Link>
          </nav>
        </div>

        {/* User Info & Logout */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div className="px-2">
            <div className="text-xs font-semibold text-white truncate">{user?.full_name}</div>
            <div className="text-[11px] text-slate-400 truncate">{user?.email}</div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-950/40 hover:border-rose-500/30 border border-transparent transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-slate-950">
        <Outlet />
      </main>
    </div>
  );
};
