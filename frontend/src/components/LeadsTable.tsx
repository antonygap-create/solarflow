import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, ArrowRight, Loader2, Mail, Phone, Calendar, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { LeadSchema } from '../types/solar';

export const LeadsTable: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [leads, setLeads] = useState<LeadSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:8000/api/dashboard/leads', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch leads list.');
      }

      const data: LeadSchema[] = await response.json();
      setLeads(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading leads.');
    } finally {
      setLoading(false);
    }
  };

  const filteredLeads = leads.filter(lead => {
    const fullText = `${lead.first_name} ${lead.last_name} ${lead.email} ${lead.project_address || ''}`.toLowerCase();
    return fullText.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-400" />
            <span>Homeowner Leads Inbox</span>
          </h1>
          <p className="text-sm text-slate-400">
            Manage incoming B2C solar inquiries, view roof estimates, and edit proposal layouts.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads by name, email, or address..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            <span>Loading leads...</span>
          </div>
        ) : error ? (
          <div className="p-6 bg-rose-950/50 border-b border-rose-500/30 text-rose-300 text-sm">
            {error}
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            No leads found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-xs uppercase font-semibold text-slate-400 tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Homeowner Name</th>
                  <th className="py-3.5 px-4">Contact Info</th>
                  <th className="py-3.5 px-4">Property Address</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => lead.project_id && navigate(`/dashboard/projects/${lead.project_id}`)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-4 px-4 font-semibold text-white">
                      {lead.first_name} {lead.last_name}
                    </td>

                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          {lead.email}
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-400">
                          <Phone className="w-3.5 h-3.5 text-slate-500" />
                          {lead.phone}
                        </span>
                      </div>
                    </td>

                    <td className="py-4 px-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate max-w-xs">{lead.project_address || 'N/A'}</span>
                      </span>
                    </td>

                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          lead.status === 'NEW'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : lead.status === 'CONTACTED'
                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {lead.status}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-xs text-slate-500 whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(lead.created_at).toLocaleDateString()}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-right">
                      {lead.project_id ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 group-hover:translate-x-0.5 transition-transform">
                          <span>View Layout</span>
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">No Layout</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
