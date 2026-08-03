import React, { useState } from 'react';
import { Sun, CheckCircle2, ArrowRight, Loader2, DollarSign, Zap, Home, ShieldCheck } from 'lucide-react';
import type { B2CEstimateResponse } from '../types/solar';
import { useAuth } from '../context/AuthContext';

export const LeadCaptureWidget: React.FC = () => {
  const { tenantSlug } = useAuth();
  
  const [formData, setFormData] = useState({
    address: '742 Evergreen Terrace, Springfield, OR',
    latitude: 34.0522,
    longitude: -118.2437,
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimateResult, setEstimateResult] = useState<B2CEstimateResponse | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/api/public/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          ...formData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to generate estimate.' }));
        throw new Error(errorData.detail || 'Failed to submit lead estimate request.');
      }

      const data: B2CEstimateResponse = await response.json();
      setEstimateResult(data);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Dynamic Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-2xl w-full relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-slate-900/80 border border-amber-500/30 text-amber-400 px-4 py-1.5 rounded-full text-sm font-medium shadow-lg backdrop-blur-md mb-4">
            <Sun className="w-4 h-4 text-amber-400 animate-spin-slow" />
            <span>Instant Homeowner Solar Calculation</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
            Calculate Your Solar Potential & Savings
          </h1>
          <p className="text-slate-400 text-sm sm:text-base">
            Get an automated AI roof analysis & 25-year financial estimate in seconds.
          </p>
        </div>

        {/* Form or Success Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
          {error && (
            <div className="mb-6 p-4 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-300 text-sm">
              {error}
            </div>
          )}

          {!estimateResult ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Property Address
                </label>
                <div className="relative">
                  <Home className="absolute left-3.5 top-3 w-5 h-5 text-slate-500" />
                  <input
                    type="text"
                    name="address"
                    required
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Enter your home address..."
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    required
                    value={formData.first_name}
                    onChange={handleChange}
                    placeholder="Jane"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    required
                    value={formData.last_name}
                    onChange={handleChange}
                    placeholder="Smith"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="jane.smith@example.com"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    required
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 000-0000"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 text-base cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Analyzing Roof Geometry...</span>
                  </>
                ) : (
                  <>
                    <span>Generate Instant Solar Report</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Success Badge */}
              <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl text-emerald-400">
                <CheckCircle2 className="w-7 h-7 shrink-0 text-emerald-400" />
                <div>
                  <h3 className="font-semibold text-base">Roof Analysis Complete!</h3>
                  <p className="text-xs text-emerald-300/80">{estimateResult.message}</p>
                </div>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-center">
                  <Zap className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                  <div className="text-2xl font-black text-white">{estimateResult.max_capacity_kwp} kWp</div>
                  <div className="text-xs text-slate-400">System Capacity ({estimateResult.total_panels} panels)</div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-center">
                  <Sun className="w-5 h-5 text-sky-400 mx-auto mb-1" />
                  <div className="text-2xl font-black text-white">
                    {Math.round(estimateResult.estimated_yearly_generation_kwh).toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-400">kWh / Year Yield</div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-center">
                  <DollarSign className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                  <div className="text-2xl font-black text-emerald-400">
                    ${Math.round(estimateResult.estimated_yearly_savings_usd_min)} - ${Math.round(estimateResult.estimated_yearly_savings_usd_max)}
                  </div>
                  <div className="text-xs text-slate-400">Est. Yearly Savings</div>
                </div>
              </div>

              {/* Notice Box */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex items-center gap-3 text-xs text-slate-400">
                <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
                <span>
                  Calculated by <strong>{estimateResult.tenant_name}</strong> using NREL PVWatts & Google Solar API parameters. A representative will contact you with custom mounting options.
                </span>
              </div>

              <button
                onClick={() => setEstimateResult(null)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Calculate Another Address
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
