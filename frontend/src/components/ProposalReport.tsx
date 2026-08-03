import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProposalById } from '../api/solarClient';
import type { ProposalRead } from '../api/solarClient';

export const ProposalReport: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [proposal, setProposal] = useState<ProposalRead | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getProposalById(id)
      .then((data) => setProposal(data))
      .catch((err) => setError(err.message || 'Failed to load commercial proposal'))
      .finally(() => setLoading(false));
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400 font-medium">Loading Commercial Solar Proposal...</p>
        </div>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center">
          <span className="text-4xl mb-4 block">⚠️</span>
          <h2 className="text-xl font-bold text-red-400 mb-2">Proposal Not Found</h2>
          <p className="text-slate-400 text-sm mb-6">{error || 'The requested solar proposal ID does not exist.'}</p>
          <Link
            to="/calculator"
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-sm transition"
          >
            ← Back to Calculator
          </Link>
        </div>
      </div>
    );
  }

  // Financial Calculations for Report
  const grossCost = proposal.total_system_cost;
  const federalTaxCredit = grossCost * 0.30; // 30% Federal ITC Tax Credit
  const netSystemCost = grossCost - federalTaxCredit;
  const year1Savings = proposal.estimated_annual_savings;
  const paybackYears = (netSystemCost / (year1Savings || 1)).toFixed(1);

  // 25-Year Projection Table Data
  const projectionYears = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 print:bg-white print:text-slate-900 print:py-0 print:px-0">
      {/* Header Controls (Hidden on Print) */}
      <div className="max-w-4xl mx-auto mb-6 flex justify-between items-center print:hidden">
        <Link
          to="/calculator"
          className="text-sm font-semibold text-slate-400 hover:text-amber-400 flex items-center space-x-2 transition"
        >
          <span>← Back to Calculator</span>
        </Link>

        <button
          onClick={handlePrint}
          className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl shadow-lg transition flex items-center space-x-2"
        >
          <span>🖨️ Print / Save as PDF</span>
        </button>
      </div>

      {/* Printable Report Document Sheet */}
      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl print:shadow-none print:border-none print:bg-white print:p-0">
        {/* Document Header */}
        <div className="flex justify-between items-start border-b border-slate-800 print:border-slate-300 pb-8 mb-8">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="text-3xl">☀️</span>
              <h1 className="text-3xl font-extrabold tracking-tight text-amber-400 print:text-slate-900">
                SolarFlow
              </h1>
            </div>
            <p className="text-xs uppercase tracking-widest font-semibold text-slate-400 print:text-slate-600">
              Commercial Engineering Proposal & Solar Yield Assessment
            </p>
          </div>

          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-xs font-semibold print:bg-slate-100 print:text-slate-800 print:border-slate-300">
              CONFIDENTIAL PROPOSAL
            </span>
            <p className="text-xs text-slate-400 print:text-slate-600 mt-2 font-mono">
              Date: {new Date(proposal.created_at).toLocaleDateString()}
            </p>
            <p className="text-xs text-slate-400 print:text-slate-600 font-mono">
              Proposal ID: {proposal.id.slice(0, 13)}...
            </p>
          </div>
        </div>

        {/* Customer & Location Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 p-6 bg-slate-800/60 rounded-2xl border border-slate-700/60 print:bg-slate-50 print:border-slate-200">
          <div>
            <span className="text-xs font-semibold text-slate-400 print:text-slate-500 uppercase tracking-wider block mb-1">
              Client / Location Details
            </span>
            <p className="text-sm font-bold text-slate-100 print:text-slate-900">
              {proposal.customer_email || 'Commercial Property Owner'}
            </p>
            <p className="text-xs text-slate-400 print:text-slate-600 font-mono mt-1">
              Coordinates: {proposal.latitude}°N, {proposal.longitude}°W
            </p>
          </div>

          <div>
            <span className="text-xs font-semibold text-slate-400 print:text-slate-500 uppercase tracking-wider block mb-1">
              System Specification
            </span>
            <p className="text-sm font-bold text-amber-400 print:text-slate-900">
              {proposal.system_capacity_kw.toFixed(1)} kW DC System Capacity
            </p>
            <p className="text-xs text-slate-400 print:text-slate-600 font-mono mt-1">
              Est. Annual Yield: {proposal.annual_generation_kwh.toLocaleString()} kWh/yr
            </p>
          </div>
        </div>

        {/* Key Financial Metrics Cards */}
        <h2 className="text-lg font-bold text-slate-200 print:text-slate-900 mb-4">Financial Investment Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60 print:bg-slate-100 print:border-slate-300">
            <span className="text-xs text-slate-400 print:text-slate-600 block">Gross System Cost</span>
            <p className="text-xl font-bold text-slate-100 print:text-slate-900 mt-1">${grossCost.toLocaleString()}</p>
          </div>

          <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60 print:bg-slate-100 print:border-slate-300">
            <span className="text-xs text-slate-400 print:text-slate-600 block">30% Federal ITC Tax Credit</span>
            <p className="text-xl font-bold text-emerald-400 print:text-emerald-700 mt-1">-${federalTaxCredit.toLocaleString()}</p>
          </div>

          <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60 print:bg-slate-100 print:border-slate-300">
            <span className="text-xs text-slate-400 print:text-slate-600 block">Net System Cost</span>
            <p className="text-xl font-bold text-amber-400 print:text-slate-900 mt-1">${netSystemCost.toLocaleString()}</p>
          </div>

          <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60 print:bg-slate-100 print:border-slate-300">
            <span className="text-xs text-slate-400 print:text-slate-600 block">Net Payback Period</span>
            <p className="text-xl font-bold text-cyan-400 print:text-slate-900 mt-1">{paybackYears} <span className="text-xs font-normal">years</span></p>
          </div>
        </div>

        {/* 10-Year Cumulative Savings Table */}
        <h2 className="text-lg font-bold text-slate-200 print:text-slate-900 mb-4">10-Year Financial Outlook</h2>
        <div className="overflow-x-auto mb-8 border border-slate-800 print:border-slate-300 rounded-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/90 text-slate-300 print:bg-slate-100 print:text-slate-700 uppercase tracking-wider">
              <tr>
                <th className="p-3">Year</th>
                <th className="p-3">Annual Utility Savings</th>
                <th className="p-3">Cumulative Savings</th>
                <th className="p-3">Net Cash Flow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 print:divide-slate-200 text-slate-300 print:text-slate-800">
              {projectionYears.map((year) => {
                const annualSav = year1Savings * Math.pow(1.03, year - 1); // 3% annual rate inflation
                const cumSavings = year1Savings * ((Math.pow(1.03, year) - 1) / 0.03);
                const netCashFlow = cumSavings - netSystemCost;
                return (
                  <tr key={year} className="hover:bg-slate-800/30 print:hover:bg-transparent">
                    <td className="p-3 font-semibold">Year {year}</td>
                    <td className="p-3">${Math.round(annualSav).toLocaleString()}</td>
                    <td className="p-3 text-emerald-400 print:text-emerald-700 font-semibold">${Math.round(cumSavings).toLocaleString()}</td>
                    <td className={`p-3 font-bold ${netCashFlow >= 0 ? 'text-emerald-400 print:text-emerald-700' : 'text-slate-400 print:text-slate-600'}`}>
                      {netCashFlow >= 0 ? `+$${Math.round(netCashFlow).toLocaleString()}` : `-$${Math.round(Math.abs(netCashFlow)).toLocaleString()}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Guarantee */}
        <div className="border-t border-slate-800 print:border-slate-300 pt-6 text-center text-xs text-slate-400 print:text-slate-600">
          <p className="font-medium text-slate-300 print:text-slate-700 mb-1">SolarFlow SaaS Engineering Guarantee</p>
          <p>This proposal estimate is derived from 8760-hour NEM 3.0 solar irradiation models and Google Solar API geometry.</p>
        </div>
      </div>
    </div>
  );
};
