import React, { useState } from 'react';
import { useSolar } from '../context/SolarContext';
import { RoiChart } from './RoiChart';
import { generateProposalPdf } from '../utils/pdfGenerator';
import {
  Sun,
  Zap,
  FileDown,
  RefreshCw,
  Search,
  Key,
  ShieldCheck,
  TreePine,
  Sliders,
  Sparkles,
  RotateCcw
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const {
    address,
    setAddress,
    lat,
    lng,
    setCoordinates,
    googleApiKey,
    setGoogleApiKey,
    loading,
    error,
    panels,
    activePanelsCount,
    totalCapacityKwp,
    totalAnnualYieldKwh,
    performanceRatio,
    financialConfig,
    setFinancialConfig,
    fetchSolarLayout,
    resetPanels,
    paybackYears,
    net25YearSavings
  } = useSolar();

  const [generatingPdf, setGeneratingPdf] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSolarLayout();
  };

  const handleExportPdf = async () => {
    setGeneratingPdf(true);
    try {
      const netCapex =
        totalCapacityKwp * 1000.0 * financialConfig.costPerWatt * (1.0 - financialConfig.federalTaxCreditItc / 100.0);

      await generateProposalPdf({
        address,
        lat,
        lng,
        totalPanels: activePanelsCount,
        capacityKwp: totalCapacityKwp,
        annualYieldKwh: totalAnnualYieldKwh,
        performanceRatio,
        netCapex: Math.round(netCapex),
        paybackYears,
        net25YearSavings
      });
    } catch (err) {
      console.error('Failed to export proposal PDF:', err);
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Environmental offset metrics
  const co2OffsetTons = (totalAnnualYieldKwh * 0.000707).toFixed(1); // US EPA avg 0.707 kg CO2 / kWh
  const treesPlanted = Math.round(totalAnnualYieldKwh * 0.016);

  return (
    <div className="w-full h-full bg-slate-900 border-l border-slate-800 flex flex-col overflow-y-auto custom-scrollbar">
      {/* Header Branding & Search Bar */}
      <div className="p-5 border-b border-slate-800 bg-slate-950/50 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-gradient-to-tr from-amber-500 to-amber-300 rounded-xl text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Sun className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-100 tracking-tight">SOLARFLOW</h1>
              <p className="text-[11px] font-medium text-amber-400">B2B Automated Engineering</p>
            </div>
          </div>
          <button
            onClick={handleExportPdf}
            disabled={generatingPdf || activePanelsCount === 0}
            className="flex items-center space-x-2 bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs hover:from-amber-400 hover:to-amber-300 transition shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingPdf ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            <span>{generatingPdf ? 'Exporting...' : 'Export Proposal'}</span>
          </button>
        </div>

        {/* Address Search Form */}
        <form onSubmit={handleSearchSubmit} className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter building address or city..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 font-medium">Latitude</label>
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setCoordinates(parseFloat(e.target.value) || 0, lng)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-medium">Longitude</label>
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setCoordinates(lat, parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
              />
            </div>
          </div>

          {/* Optional Google API Key input */}
          <div className="relative">
            <Key className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="password"
              value={googleApiKey}
              onChange={(e) => setGoogleApiKey(e.target.value)}
              placeholder="Google Cloud API Key (Optional override)..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 rounded-xl border border-slate-700 transition"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin text-amber-400" /> : <Sparkles className="w-4 h-4 text-amber-400" />}
            <span>{loading ? 'Orchestrating Layout...' : 'Generate Solar Layout'}</span>
          </button>
        </form>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
            {error}
          </div>
        )}
      </div>

      {/* Main Dashboard Stats Body */}
      <div className="p-5 space-y-5">
        {/* KPI Grid Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Active Panels</span>
              <Sun className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-black text-slate-100">{activePanelsCount}</div>
            <div className="text-[10px] text-slate-400">
              Out of <span className="text-slate-300 font-semibold">{panels.length}</span> total placed
            </div>
          </div>

          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Capacity</span>
              <Zap className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-xl font-black text-slate-100">{totalCapacityKwp} <span className="text-xs text-sky-400">kWp</span></div>
            <div className="text-[10px] text-slate-400">@ 400W DC / module</div>
          </div>

          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Annual Yield</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-black text-slate-100">{totalAnnualYieldKwh.toLocaleString()} <span className="text-xs text-emerald-400">kWh</span></div>
            <div className="text-[10px] text-slate-400">Est. AC generation</div>
          </div>

          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">NREL PR Ratio</span>
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-xl font-black text-slate-100">{(performanceRatio * 100).toFixed(1)}%</div>
            <div className="text-[10px] text-slate-400">PVWatts Performance</div>
          </div>
        </div>

        {/* Panel Controls Action */}
        {panels.length > 0 && (
          <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800/80">
            <span className="text-xs text-slate-300 font-medium">Map Panel Editing:</span>
            <button
              onClick={resetPanels}
              className="flex items-center space-x-1.5 text-xs text-amber-400 hover:text-amber-300 font-semibold transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All Panels</span>
            </button>
          </div>
        )}

        {/* Environmental Offset Card */}
        <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-2">
          <div className="flex items-center space-x-2 text-emerald-400">
            <TreePine className="w-4 h-4" />
            <h4 className="text-xs font-bold uppercase tracking-wider">Environmental Impact</h4>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-slate-400 text-[10px]">CO2 Avoided:</div>
              <div className="text-slate-100 font-bold">{co2OffsetTons} Tons/yr</div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">Equivalent Trees:</div>
              <div className="text-slate-100 font-bold">{treesPlanted} Trees</div>
            </div>
          </div>
        </div>

        {/* Financial Model Configuration Parameters */}
        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-slate-200">
              <Sliders className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Financial Model Parameters</h4>
            </div>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="text-[11px] text-amber-400 hover:underline font-medium"
            >
              {showConfig ? 'Hide' : 'Configure'}
            </button>
          </div>

          {showConfig && (
            <div className="space-y-3 pt-2 text-xs border-t border-slate-800">
              <div>
                <label className="text-slate-400 flex justify-between">
                  <span>System CAPEX ($/W):</span>
                  <span className="text-amber-400 font-bold">${financialConfig.costPerWatt.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min="1.50"
                  max="4.00"
                  step="0.05"
                  value={financialConfig.costPerWatt}
                  onChange={(e) =>
                    setFinancialConfig((c) => ({ ...c, costPerWatt: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-400 flex justify-between">
                  <span>Utility Tariff ($/kWh):</span>
                  <span className="text-amber-400 font-bold">${financialConfig.electricityRate.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min="0.08"
                  max="0.40"
                  step="0.01"
                  value={financialConfig.electricityRate}
                  onChange={(e) =>
                    setFinancialConfig((c) => ({ ...c, electricityRate: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-amber-400"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-400">US Federal Tax Credit (ITC):</span>
                <span className="text-emerald-400 font-bold">30% Federal ITC</span>
              </div>
            </div>
          )}
        </div>

        {/* 25-Year Recharts ROI Payback Component */}
        <RoiChart />
      </div>
    </div>
  );
};
