import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  estimateGeneration,
  estimateEconomics,
  saveProposal,
  getSolarInsights,
  geocodeAddress
} from '../api/solarClient';
import type {
  SolarGenerationResponse,
  EconomicsResponse,
  ProposalRead,
  SolarInsightsResponse
} from '../api/solarClient';

export const SolarCalculator: React.FC = () => {
  // Address & Location State
  const [addressSearch, setAddressSearch] = useState<string>('1800 Port Margate Pl, Newport Beach, CA 92660');
  const [latitude, setLatitude] = useState<number>(33.62588);
  const [longitude, setLongitude] = useState<number>(-117.85865);

  // Roof & Technical Parameters
  const [roofAreaSqm, setRoofAreaSqm] = useState<number>(172.79);
  const [pitchDegrees, setPitchDegrees] = useState<number>(23.2);
  const [azimuthDegrees, setAzimuthDegrees] = useState<number>(9.5);
  const [annualConsumptionKwh, setAnnualConsumptionKwh] = useState<number>(12000);
  const [customerEmail, setCustomerEmail] = useState<string>('');

  // Status & Output State
  const [fetchingInsights, setFetchingInsights] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [insightsNotice, setInsightsNotice] = useState<string | null>(null);

  const [generationResult, setGenerationResult] = useState<SolarGenerationResponse | null>(null);
  const [economicsResult, setEconomicsResult] = useState<EconomicsResponse | null>(null);
  const [savedProposal, setSavedProposal] = useState<ProposalRead | null>(null);

  // 1. Fetch Google Solar Insights & Auto-Calculate when Coordinates Change
  const fetchInsightsAndCalculate = useCallback(async (lat: number, lng: number) => {
    setFetchingInsights(true);
    setInsightsNotice(null);
    try {
      // Step A: Fetch Google Solar API Building Insights
      const insights: SolarInsightsResponse = await getSolarInsights(lat, lng);
      setRoofAreaSqm(insights.roof_area_sqm);
      setPitchDegrees(insights.pitch_degrees);
      setAzimuthDegrees(insights.azimuth_degrees);

      if (insights.is_fallback) {
        setInsightsNotice(
          '📍 Google Solar API imagery coverage is limited for this exact building. Default estimated values were applied. You may adjust roof area manually.'
        );
      } else {
        setInsightsNotice(
          `✨ High-resolution Google Solar Building Insights applied! Max Roof Area: ${insights.roof_area_sqm} m² (${insights.max_panels_count} panels max).`
        );
      }

      // Step B: Auto-Calculate Solar Generation
      const genRes = await estimateGeneration({
        latitude: Number(lat),
        longitude: Number(lng),
        roof_area_sqm: Number(insights.roof_area_sqm),
        azimuth: Number(insights.azimuth_degrees),
        tilt: Number(insights.pitch_degrees)
      });
      setGenerationResult(genRes);

      // System Capacity (kW) = Roof Area (m²) * 0.20 efficiency ratio
      const estimatedCapacityKw = Number(insights.roof_area_sqm) * 0.20;

      // Step C: Auto-Calculate Financial Economics
      const econRes = await estimateEconomics({
        system_capacity_kw: estimatedCapacityKw,
        annual_energy_kwh: genRes.estimated_annual_kwh,
        annual_consumption_kwh: Number(annualConsumptionKwh),
        tariff_type: 'NEM3'
      });
      setEconomicsResult(econRes);
    } catch (err: any) {
      setInsightsNotice('⚠️ Could not fetch Google Solar Insights. Default values applied.');
    } finally {
      setFetchingInsights(false);
    }
  }, [annualConsumptionKwh]);

  useEffect(() => {
    fetchInsightsAndCalculate(latitude, longitude);
  }, [latitude, longitude, fetchInsightsAndCalculate]);

  // 2. HTML5 Geolocation Button Handler
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setFetchingInsights(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = parseFloat(position.coords.latitude.toFixed(5));
        const lng = parseFloat(position.coords.longitude.toFixed(5));
        setLatitude(lat);
        setLongitude(lng);
        setAddressSearch(`Current Location (${lat}, ${lng})`);
      },
      (geoErr) => {
        setError(`Geolocation failed: ${geoErr.message}`);
        setFetchingInsights(false);
      }
    );
  };

  // 3. Address Search Submit Handler with Real Geocoding API
  const handleAddressSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressSearch.trim()) return;
    setFetchingInsights(true);
    setError(null);
    try {
      const geo = await geocodeAddress(addressSearch);
      setLatitude(geo.latitude);
      setLongitude(geo.longitude);
      setAddressSearch(geo.formatted_address);
    } catch (err: any) {
      setError(err.message || 'Geocoding failed for requested address.');
      setFetchingInsights(false);
    }
  };

  // 4. Manual Calculate Submit Handler
  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSavedProposal(null);

    try {
      const genRes = await estimateGeneration({
        latitude: Number(latitude),
        longitude: Number(longitude),
        roof_area_sqm: Number(roofAreaSqm),
        azimuth: Number(azimuthDegrees),
        tilt: Number(pitchDegrees)
      });
      setGenerationResult(genRes);

      const estimatedCapacityKw = Number(roofAreaSqm) * 0.20;

      const econRes = await estimateEconomics({
        system_capacity_kw: estimatedCapacityKw,
        annual_energy_kwh: genRes.estimated_annual_kwh,
        annual_consumption_kwh: Number(annualConsumptionKwh),
        tariff_type: 'NEM3'
      });
      setEconomicsResult(econRes);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during calculation.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Save Commercial Proposal to PostgreSQL
  const handleSaveProposal = async () => {
    if (!generationResult || !economicsResult) return;
    setSaving(true);
    setError(null);

    try {
      const estimatedCapacityKw = Number(roofAreaSqm) * 0.20;

      const proposalRecord = await saveProposal({
        customer_email: customerEmail || undefined,
        latitude: Number(latitude),
        longitude: Number(longitude),
        system_capacity_kw: estimatedCapacityKw,
        annual_generation_kwh: generationResult.estimated_annual_kwh,
        total_system_cost: economicsResult.total_system_cost,
        estimated_annual_savings: economicsResult.estimated_annual_savings,
        roi_25_years_percent: economicsResult.roi_25_years_percent
      });

      setSavedProposal(proposalRecord);
    } catch (err: any) {
      setError(err.message || 'Failed to save proposal to database.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-slate-900 text-slate-100 rounded-2xl shadow-2xl border border-slate-800 my-8">
      <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <span className="text-4xl">☀️</span>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-amber-400">SolarFlow GIS & Google Solar Calculator</h2>
            <p className="text-slate-400 text-sm">Interactive Satellite Roof Mapping & NEM 3.0 Financial Yield Engine</p>
          </div>
        </div>
        <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-xs font-medium">
          Google Solar API Connected
        </span>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/40 border border-red-500/50 rounded-xl text-red-200 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Address Search & Satellite Map Container */}
      <div className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search & Location Bar */}
        <div className="lg:col-span-1 space-y-4">
          <form onSubmit={handleAddressSearchSubmit}>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              🔍 Address / Location Search
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={addressSearch}
                onChange={(e) => setAddressSearch(e.target.value)}
                placeholder="Enter street address..."
                className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                disabled={fetchingInsights}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-sm transition disabled:opacity-50"
              >
                Search
              </button>
            </div>
          </form>

          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={fetchingInsights}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-sm font-semibold flex items-center justify-center space-x-2 transition"
          >
            <span>📍 Use My Location (GPS)</span>
          </button>

          {insightsNotice && (
            <div className="p-3.5 bg-slate-800/90 border border-amber-500/30 rounded-xl text-amber-200 text-xs leading-relaxed">
              {insightsNotice}
            </div>
          )}
        </div>

        {/* Interactive Satellite View Map Preview */}
        <div className="lg:col-span-2 relative h-64 lg:h-auto rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 flex flex-col justify-between p-2 shadow-inner">
          <iframe
            title="Roof Satellite View Map"
            width="100%"
            height="100%"
            className="absolute inset-0 w-full h-full border-0 rounded-2xl opacity-85 hover:opacity-100 transition duration-300 pointer-events-auto"
            loading="lazy"
            src={`https://maps.google.com/maps?q=${latitude},${longitude}&t=k&z=19&ie=UTF8&iwloc=&output=embed`}
          ></iframe>

          <div className="relative z-10 flex justify-between items-start pointer-events-none p-2">
            <span className="px-3 py-1 bg-slate-900/90 text-slate-200 text-xs font-mono rounded-lg border border-slate-700 shadow-md">
              🛰️ Satellite Roof View: {latitude.toFixed(4)}°N, {longitude.toFixed(4)}°W
            </span>
            {fetchingInsights && (
              <span className="px-3 py-1 bg-amber-500 text-slate-950 text-xs font-bold rounded-lg animate-pulse shadow-md">
                Analyzing Building & Solar Potential...
              </span>
            )}
          </div>

          <div className="relative z-10 text-right pointer-events-none p-2">
            <span className="px-2.5 py-1 bg-slate-900/90 text-amber-300 text-[11px] font-semibold rounded-md border border-slate-700">
              Roof Area: {roofAreaSqm} m² | Tilt: {pitchDegrees}° | Azimuth: {azimuthDegrees}°
            </span>
          </div>
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleCalculate} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Roof Area (m²)
          </label>
          <input
            type="number"
            min="1.6"
            step="any"
            required
            value={roofAreaSqm}
            onChange={(e) => setRoofAreaSqm(parseFloat(e.target.value))}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Roof Tilt Pitch (°)
          </label>
          <input
            type="number"
            min="0"
            max="90"
            step="any"
            required
            value={pitchDegrees}
            onChange={(e) => setPitchDegrees(parseFloat(e.target.value))}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Azimuth (°) [180 = South]
          </label>
          <input
            type="number"
            min="0"
            max="360"
            step="any"
            required
            value={azimuthDegrees}
            onChange={(e) => setAzimuthDegrees(parseFloat(e.target.value))}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Annual Consumption (kWh/yr)
          </label>
          <input
            type="number"
            min="1"
            step="any"
            required
            value={annualConsumptionKwh}
            onChange={(e) => setAnnualConsumptionKwh(parseFloat(e.target.value))}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Customer Email (Optional for Lead Save)
          </label>
          <input
            type="email"
            placeholder="client@solarinstaller.com"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="md:col-span-3">
          <button
            type="submit"
            disabled={loading || fetchingInsights}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl shadow-lg transition duration-200 disabled:opacity-50 text-base"
          >
            {loading ? 'Simulating Solar Yield & Financials...' : '⚡ Recalculate Solar Potential'}
          </button>
        </div>
      </form>

      {/* Results Display */}
      {generationResult && economicsResult && (
        <div className="mt-8 border-t border-slate-800 pt-6">
          <h3 className="text-xl font-bold text-slate-200 mb-4">Calculation Results & Financial Estimates</h3>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400">Annual Solar Yield</span>
              <p className="text-2xl font-bold text-amber-400">{generationResult.estimated_annual_kwh.toLocaleString()} <span className="text-xs font-normal">kWh/yr</span></p>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400">Gross System Cost</span>
              <p className="text-2xl font-bold text-emerald-400">${economicsResult.total_system_cost.toLocaleString()}</p>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400">Annual Utility Savings</span>
              <p className="text-2xl font-bold text-emerald-400">${economicsResult.estimated_annual_savings.toLocaleString()} <span className="text-xs font-normal">/yr</span></p>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400">Simple Payback Period</span>
              <p className="text-2xl font-bold text-cyan-400">{economicsResult.payback_period_years} <span className="text-xs font-normal">years</span></p>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400">25-Year ROI</span>
              <p className="text-2xl font-bold text-indigo-400">{economicsResult.roi_25_years_percent}%</p>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400">Self-Consumption Ratio</span>
              <p className="text-2xl font-bold text-purple-400">{(economicsResult.self_consumption_ratio * 100).toFixed(1)}%</p>
            </div>
          </div>

          {/* Action Button: Save Proposal */}
          <div className="flex flex-col items-center">
            <button
              onClick={handleSaveProposal}
              disabled={saving || !!savedProposal}
              className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl shadow-lg transition duration-200 disabled:opacity-50"
            >
              {saving ? 'Saving to Database...' : savedProposal ? '✓ Calculation Saved to PostgreSQL' : '💾 Зберегти розрахунок'}
            </button>

            {savedProposal && (
              <div className="mt-4 p-4 bg-emerald-950/60 border border-emerald-500/60 rounded-xl text-emerald-200 text-sm text-center flex flex-col items-center space-y-3">
                <div>
                  ✅ <strong>Commercial Proposal Saved to PostgreSQL!</strong>
                  <br />
                  <span className="text-xs text-slate-300 font-mono">Proposal ID: {savedProposal.id}</span>
                </div>
                <Link
                  to={`/report/${savedProposal.id}`}
                  className="px-6 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-lg text-xs tracking-wide shadow transition"
                >
                  📄 Переглянути комерційну пропозицію (PDF Report) →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
