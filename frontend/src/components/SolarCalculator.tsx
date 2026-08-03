import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
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

const GOOGLE_MAPS_JS_KEY = "AIzaSyBXWuHKI8U1Chf3NA2s-CtjKMjmB3sxESg";

export interface PanelItem {
  id: number;
  row: number;
  col: number;
  active: boolean;
  azimuth: number;
  tilt: number;
}

export type MountType = 'FLUSH' | 'EAST_WEST' | 'SOUTH_TILT';
export type OrientationType = 'LANDSCAPE' | 'PORTRAIT';
export type ArchitectureType = 'GRID_TIED' | 'HYBRID_BATTERY' | 'OFF_GRID';
export type ActiveTool = 'select' | 'add' | 'remove';

export const SolarCalculator: React.FC = () => {
  // Load Native Google Maps JS API Script
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_JS_KEY
  });

  // Address & Location State
  const [addressSearch, setAddressSearch] = useState<string>('1800 Port Margate Pl, Newport Beach, CA 92660');
  const [latitude, setLatitude] = useState<number>(33.62588);
  const [longitude, setLongitude] = useState<number>(-117.85865);

  // Roof & Technical Parameters
  const [roofAreaSqm, setRoofAreaSqm] = useState<number>(172.79);
  const [maxPanelsCount, setMaxPanelsCount] = useState<number>(88);
  const [pitchDegrees, setPitchDegrees] = useState<number>(23.2);
  const [azimuthDegrees, setAzimuthDegrees] = useState<number>(9.5);
  const [annualConsumptionKwh, setAnnualConsumptionKwh] = useState<number>(12000);
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [mapMode, setMapMode] = useState<'satellite' | 'blueprint'>('satellite');

  // Layout Placement Options
  const [mountType, setMountType] = useState<MountType>('FLUSH');
  const [orientation, setOrientation] = useState<OrientationType>('LANDSCAPE');
  const [rowPitchGapMeters, setRowPitchGapMeters] = useState<number>(0.4);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');

  // System Architecture & Hybrid Storage Options
  const [systemArchitecture, setSystemArchitecture] = useState<ArchitectureType>('HYBRID_BATTERY');
  const [batteryCapacityKwh, setBatteryCapacityKwh] = useState<number>(13.5); // Tesla Powerwall 3 default
  const [evChargerEnabled, setEvChargerEnabled] = useState<boolean>(true);

  // Interactive Panels State Array
  const [panels, setPanels] = useState<PanelItem[]>([]);

  // Status & Output State
  const [fetchingInsights, setFetchingInsights] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [insightsNotice, setInsightsNotice] = useState<string | null>(null);

  const [generationResult, setGenerationResult] = useState<SolarGenerationResponse | null>(null);
  const [economicsResult, setEconomicsResult] = useState<EconomicsResponse | null>(null);
  const [savedProposal, setSavedProposal] = useState<ProposalRead | null>(null);

  // Derived Active Panel Count
  const activePanelCount = useMemo(() => {
    return panels.filter((p) => p.active).length;
  }, [panels]);

  // Construct initial panel grid layout array matching maxPanelsCount
  const initializePanelGrid = useCallback((count: number, azimuth: number, tilt: number) => {
    const cols = orientation === 'LANDSCAPE' 
      ? Math.min(12, Math.ceil(Math.sqrt(count * 1.5)))
      : Math.min(10, Math.ceil(Math.sqrt(count * 1.1)));
    const rows = Math.ceil(count / cols);
    const initialPanels: PanelItem[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = r * cols + c;
        if (id < count) {
          initialPanels.push({
            id,
            row: r,
            col: c,
            active: true,
            azimuth,
            tilt
          });
        }
      }
    }
    setPanels(initialPanels);
  }, [orientation]);

  // 1. Fetch Google Solar Insights & Auto-Calculate when Coordinates Change
  const fetchInsightsAndCalculate = useCallback(async (lat: number, lng: number) => {
    setFetchingInsights(true);
    setInsightsNotice(null);
    try {
      const insights: SolarInsightsResponse = await getSolarInsights(lat, lng);
      setRoofAreaSqm(insights.roof_area_sqm);
      setMaxPanelsCount(insights.max_panels_count || 88);
      setPitchDegrees(insights.pitch_degrees);
      setAzimuthDegrees(insights.azimuth_degrees);

      initializePanelGrid(insights.max_panels_count || 88, insights.azimuth_degrees, insights.pitch_degrees);

      if (insights.is_fallback) {
        setInsightsNotice(
          '📍 Google Solar API imagery coverage is limited for this exact building. Default estimated values were applied. You may adjust roof area manually.'
        );
      } else {
        setInsightsNotice(
          `✨ High-resolution Google Solar Building Insights applied! Max Roof Area: ${insights.roof_area_sqm} m² (${insights.max_panels_count} panels max). Use CAD Layout Tools to customize your array.`
        );
      }

      // Calculate Solar Generation
      const genRes = await estimateGeneration({
        latitude: Number(lat),
        longitude: Number(lng),
        roof_area_sqm: Number(insights.roof_area_sqm),
        azimuth: Number(insights.azimuth_degrees),
        tilt: Number(insights.pitch_degrees)
      });
      setGenerationResult(genRes);

      const systemCapacityKw = (insights.max_panels_count || 88) * 0.400;

      // Calculate Financial Economics
      const econRes = await estimateEconomics({
        system_capacity_kw: systemCapacityKw,
        annual_energy_kwh: genRes.estimated_annual_kwh,
        annual_consumption_kwh: Number(annualConsumptionKwh),
        tariff_type: 'NEM3',
        system_architecture: systemArchitecture,
        battery_capacity_kwh: systemArchitecture === 'GRID_TIED' ? 0.0 : batteryCapacityKwh,
        ev_charger_enabled: evChargerEnabled
      });
      setEconomicsResult(econRes);
    } catch (err: any) {
      setInsightsNotice('⚠️ Could not fetch Google Solar Insights. Default values applied.');
    } finally {
      setFetchingInsights(false);
    }
  }, [annualConsumptionKwh, initializePanelGrid, systemArchitecture, batteryCapacityKwh, evChargerEnabled]);

  useEffect(() => {
    fetchInsightsAndCalculate(latitude, longitude);
  }, [latitude, longitude, fetchInsightsAndCalculate]);

  // Recalculate financial yield when parameters change
  const handleRecalculateActivePanels = useCallback(async (activeCount: number) => {
    const scaledArea = activeCount * (orientation === 'LANDSCAPE' ? 1.7 : 1.75);
    setRoofAreaSqm(Number(scaledArea.toFixed(1)));

    try {
      const genRes = await estimateGeneration({
        latitude: Number(latitude),
        longitude: Number(longitude),
        roof_area_sqm: scaledArea,
        azimuth: Number(azimuthDegrees),
        tilt: mountType === 'EAST_WEST' ? 15.0 : Number(pitchDegrees)
      });
      setGenerationResult(genRes);

      const systemCapacityKw = activeCount * 0.400; // 400W per module
      const econRes = await estimateEconomics({
        system_capacity_kw: systemCapacityKw,
        annual_energy_kwh: genRes.estimated_annual_kwh,
        annual_consumption_kwh: Number(annualConsumptionKwh),
        tariff_type: 'NEM3',
        system_architecture: systemArchitecture,
        battery_capacity_kwh: systemArchitecture === 'GRID_TIED' ? 0.0 : batteryCapacityKwh,
        ev_charger_enabled: evChargerEnabled
      });
      setEconomicsResult(econRes);
    } catch (err: any) {
      console.error("Recalculation error:", err);
    }
  }, [latitude, longitude, azimuthDegrees, pitchDegrees, mountType, orientation, annualConsumptionKwh, systemArchitecture, batteryCapacityKwh, evChargerEnabled]);

  // Layout Tool Actions
  const handlePanelClick = (id: number) => {
    if (activeTool === 'select' || activeTool === 'remove') {
      const updated = panels.map((p) => (p.id === id ? { ...p, active: activeTool === 'select' ? !p.active : false } : p));
      setPanels(updated);
      const activeCount = updated.filter((p) => p.active).length;
      handleRecalculateActivePanels(activeCount);
    }
  };

  const handleAddRow = () => {
    const maxRow = panels.reduce((max, p) => Math.max(max, p.row), 0);
    const cols = Math.min(10, Math.ceil(Math.sqrt((maxPanelsCount || 88) * 1.4)));
    const newPanels: PanelItem[] = [];
    const startId = panels.length;
    for (let c = 0; c < cols; c++) {
      newPanels.push({
        id: startId + c,
        row: maxRow + 1,
        col: c,
        active: true,
        azimuth: azimuthDegrees,
        tilt: pitchDegrees
      });
    }
    const updated = [...panels, ...newPanels];
    setPanels(updated);
    handleRecalculateActivePanels(updated.filter((p) => p.active).length);
  };

  const handleClearAllPanels = () => {
    const updated = panels.map((p) => ({ ...p, active: false }));
    setPanels(updated);
    handleRecalculateActivePanels(0);
  };

  const handleResetDefaultLayout = () => {
    initializePanelGrid(maxPanelsCount, azimuthDegrees, pitchDegrees);
    handleRecalculateActivePanels(maxPanelsCount);
  };

  // Handle Panel Count Slider Drag
  const handlePanelSliderChange = (count: number) => {
    const updated = panels.map((p, idx) => ({ ...p, active: idx < count }));
    setPanels(updated);
    handleRecalculateActivePanels(count);
  };

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

      const estimatedCapacityKw = activePanelCount * 0.400;

      const econRes = await estimateEconomics({
        system_capacity_kw: estimatedCapacityKw,
        annual_energy_kwh: genRes.estimated_annual_kwh,
        annual_consumption_kwh: Number(annualConsumptionKwh),
        tariff_type: 'NEM3',
        system_architecture: systemArchitecture,
        battery_capacity_kwh: systemArchitecture === 'GRID_TIED' ? 0.0 : batteryCapacityKwh,
        ev_charger_enabled: evChargerEnabled
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
      const estimatedCapacityKw = activePanelCount * 0.400;

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

  // Panel Grid dimensions for SVG
  const colsCount = orientation === 'LANDSCAPE'
    ? Math.min(12, Math.ceil(Math.sqrt((maxPanelsCount || 88) * 1.5)))
    : Math.min(10, Math.ceil(Math.sqrt((maxPanelsCount || 88) * 1.1)));
  const rowsCount = Math.ceil((maxPanelsCount || 88) / colsCount);

  return (
    <div className="max-w-7xl mx-auto p-6 bg-slate-900 text-slate-100 rounded-2xl shadow-2xl border border-slate-800 my-8">
      {/* Top Navigation & App Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <span className="text-4xl">☀️</span>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-amber-400">SolarFlow CAD Pro & CAD Layout Suite</h2>
            <p className="text-slate-400 text-sm">Professional B2B/B2C Solar Array Layout, Battery Sizing & NEM 3.0 Financial Engine</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setMapMode('satellite')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              mapMode === 'satellite'
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            🛰️ Native Satellite Map
          </button>
          <button
            onClick={() => setMapMode('blueprint')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              mapMode === 'blueprint'
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            📐 CAD Blueprint Mode
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/40 border border-red-500/50 rounded-xl text-red-200 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* CAD Layout Editor Toolbar */}
      <div className="mb-6 p-4 bg-slate-800/90 rounded-2xl border border-slate-700 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        {/* Editing Tool Mode Buttons */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-400 uppercase mr-1">Tools:</span>
          <button
            onClick={() => setActiveTool('select')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              activeTool === 'select'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            👆 Select / Toggle
          </button>
          <button
            onClick={handleAddRow}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold transition"
          >
            ➕ Add Module Row
          </button>
          <button
            onClick={handleClearAllPanels}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-700 text-red-300 border border-red-500/40 rounded-lg text-xs font-semibold transition"
          >
            🧹 Clear All Panels
          </button>
          <button
            onClick={handleResetDefaultLayout}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-700 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-semibold transition"
          >
            🔄 Reset Optimal Layout
          </button>
        </div>

        {/* Panel Orientation & Mount Type Selectors */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div>
            <label className="text-slate-400 font-medium mr-1.5">Mounting Structure:</label>
            <select
              value={mountType}
              onChange={(e) => {
                setMountType(e.target.value as MountType);
                handleRecalculateActivePanels(activePanelCount);
              }}
              className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white font-medium focus:outline-none focus:border-amber-400"
            >
              <option value="FLUSH">📐 Flush Roof Mount (Похилий уздовж даху)</option>
              <option value="EAST_WEST">🌗 East-West Dual Tilt (Схід-Захід 10°/15°)</option>
              <option value="SOUTH_TILT">🧭 South Tilt Stand (Південний стійковий)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 font-medium mr-1.5">Orientation:</label>
            <select
              value={orientation}
              onChange={(e) => {
                setOrientation(e.target.value as OrientationType);
                initializePanelGrid(maxPanelsCount, azimuthDegrees, pitchDegrees);
              }}
              className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white font-medium focus:outline-none focus:border-amber-400"
            >
              <option value="LANDSCAPE">🖼️ Landscape (Горизонтально)</option>
              <option value="PORTRAIT">📱 Portrait (Вертикально)</option>
            </select>
          </div>

          <div className="flex items-center space-x-1.5">
            <label className="text-slate-400 font-medium">Row Gap:</label>
            <input
              type="range"
              min="0.1"
              max="1.2"
              step="0.1"
              value={rowPitchGapMeters}
              onChange={(e) => setRowPitchGapMeters(parseFloat(e.target.value))}
              className="w-16 h-1.5 bg-slate-900 rounded appearance-none cursor-pointer accent-amber-400"
            />
            <span className="font-mono text-slate-300">{rowPitchGapMeters}m</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Location Sidebar & Native Satellite Canvas */}
      <div className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Location & Architecture Settings Sidebar */}
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

          {/* System Architecture & Hybrid Storage Options */}
          <div className="p-4 bg-slate-800/90 rounded-xl border border-slate-700 space-y-3">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">⚡ Station Architecture & Battery Storage</h4>
            
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">System Type:</label>
              <select
                value={systemArchitecture}
                onChange={(e) => {
                  setSystemArchitecture(e.target.value as ArchitectureType);
                  handleRecalculateActivePanels(activePanelCount);
                }}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs font-semibold focus:outline-none focus:border-amber-400"
              >
                <option value="GRID_TIED">⚡ Grid-Tied (Мережева Станція - On-Grid NEM 3.0)</option>
                <option value="HYBRID_BATTERY">🔋 Hybrid + Battery (Гібридна з накопичувачем)</option>
                <option value="OFF_GRID">🔌 Off-Grid (Автономна Станція)</option>
              </select>
            </div>

            {systemArchitecture !== 'GRID_TIED' && (
              <div>
                <div className="flex justify-between items-center text-[11px] font-semibold mb-1">
                  <span className="text-slate-300">Battery Storage Size:</span>
                  <span className="text-emerald-300 font-mono">{batteryCapacityKwh} kWh</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="40"
                  step="2.5"
                  value={batteryCapacityKwh}
                  onChange={(e) => {
                    setBatteryCapacityKwh(parseFloat(e.target.value));
                    handleRecalculateActivePanels(activePanelCount);
                  }}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Est. Battery Cost: ${(batteryCapacityKwh * 700).toLocaleString()} (Tesla Powerwall 3 class)
                </span>
              </div>
            )}

            <div className="flex items-center space-x-2 pt-1 border-t border-slate-700/60">
              <input
                type="checkbox"
                id="evChargerCheck"
                checked={evChargerEnabled}
                onChange={(e) => {
                  setEvChargerEnabled(e.target.checked);
                  handleRecalculateActivePanels(activePanelCount);
                }}
                className="w-4 h-4 accent-amber-400 bg-slate-900 border-slate-700 rounded cursor-pointer"
              />
              <label htmlFor="evChargerCheck" className="text-xs font-medium text-slate-200 cursor-pointer">
                🚗 Level 2 EV Charger Add-on (+11.5 kW)
              </label>
            </div>
          </div>

          {/* Panel Count Slider */}
          <div className="p-4 bg-slate-800/90 rounded-xl border border-slate-700 space-y-3">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-300">Active Solar Modules</span>
              <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md font-mono text-sm">
                {activePanelCount} / {maxPanelsCount} Panels
              </span>
            </div>
            <input
              type="range"
              min="1"
              max={Math.max(120, maxPanelsCount)}
              value={activePanelCount}
              onChange={(e) => handlePanelSliderChange(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>DC Capacity: {(activePanelCount * 0.400).toFixed(1)} kWp</span>
              <span>Roof Area: {(activePanelCount * 1.7).toFixed(1)} m²</span>
            </div>
          </div>

          {insightsNotice && (
            <div className="p-3.5 bg-slate-800/90 border border-amber-500/30 rounded-xl text-amber-200 text-xs leading-relaxed">
              {insightsNotice}
            </div>
          )}
        </div>

        {/* Native Google Maps JavaScript API Satellite Canvas Container */}
        <div className="lg:col-span-2 relative h-96 lg:h-[500px] rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 flex flex-col justify-between p-2 shadow-2xl">
          {mapMode === 'satellite' ? (
            isLoaded ? (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%', borderRadius: '1rem' }}
                center={{ lat: latitude, lng: longitude }}
                zoom={20}
                options={{
                  mapTypeId: 'satellite',
                  tilt: 45,
                  disableDefaultUI: true,
                  zoomControl: true,
                  rotateControl: true
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-amber-400 font-semibold text-sm">
                {loadError ? 'Google Maps JS API failed to initialize' : '🛰️ Loading Native Google Satellite Canvas Engine...'}
              </div>
            )
          ) : (
            <div className="absolute inset-0 bg-slate-950 opacity-95 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px]"></div>
          )}

          {/* Interactive Solar Panel Placement Canvas */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto p-4 z-20">
            <div
              className="transition-transform duration-500 shadow-2xl"
              style={{
                transform: `rotate(${azimuthDegrees - 180}deg) scale(${1 - pitchDegrees / 180})`,
              }}
            >
              <svg
                width={Math.min(520, colsCount * (orientation === 'LANDSCAPE' ? 40 : 30))}
                height={Math.min(380, rowsCount * (orientation === 'LANDSCAPE' ? 30 : 54))}
                className="overflow-visible"
              >
                <defs>
                  <linearGradient id="solarCellGradActive" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1e3a8a" />
                    <stop offset="50%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#1d4ed8" />
                  </linearGradient>

                  <linearGradient id="solarCellGradDisabled" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#334155" />
                    <stop offset="100%" stopColor="#1e293b" />
                  </linearGradient>

                  <linearGradient id="glassShimmer" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
                    <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
                  </linearGradient>
                </defs>

                <g>
                  {panels.map((panel) => {
                    const w = orientation === 'LANDSCAPE' ? 38 : 28;
                    const h = orientation === 'LANDSCAPE' ? 28 : 50;
                    const stepX = w + 3;
                    const stepY = h + Math.round(rowPitchGapMeters * 10);

                    return (
                      <g
                        key={panel.id}
                        transform={`translate(${panel.col * stepX}, ${panel.row * stepY})`}
                        onClick={() => handlePanelClick(panel.id)}
                        className="cursor-pointer group"
                      >
                        <rect
                          x="1"
                          y="1"
                          width={w}
                          height={h}
                          rx="2.5"
                          fill={panel.active ? "url(#solarCellGradActive)" : "url(#solarCellGradDisabled)"}
                          stroke={panel.active ? "#38bdf8" : "#64748b"}
                          strokeWidth={panel.active ? "1.5" : "1"}
                          className="transition-colors duration-200 group-hover:stroke-amber-400"
                        />

                        {panel.active && (
                          <>
                            <line x1="1" y1={Math.round(h / 3)} x2={w} y2={Math.round(h / 3)} stroke="#60a5fa" strokeWidth="0.5" strokeOpacity="0.7" />
                            <line x1="1" y1={Math.round((h * 2) / 3)} x2={w} y2={Math.round((h * 2) / 3)} stroke="#60a5fa" strokeWidth="0.5" strokeOpacity="0.7" />
                            <line x1={Math.round(w / 3)} y1="1" x2={Math.round(w / 3)} y2={h} stroke="#60a5fa" strokeWidth="0.5" strokeOpacity="0.7" />
                            <line x1={Math.round((w * 2) / 3)} y1="1" x2={Math.round((w * 2) / 3)} y2={h} stroke="#60a5fa" strokeWidth="0.5" strokeOpacity="0.7" />
                            <rect x="2" y="2" width={w - 2} height={h - 2} fill="url(#glassShimmer)" pointerEvents="none" />
                          </>
                        )}

                        {!panel.active && (
                          <line x1="3" y1="3" x2={w - 3} y2={h - 3} stroke="#ef4444" strokeWidth="1.5" strokeOpacity="0.8" />
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          </div>

          {/* Top Info Banner */}
          <div className="relative z-30 flex justify-between items-start pointer-events-none p-2">
            <span className="px-3 py-1 bg-slate-900/95 text-slate-200 text-xs font-mono rounded-lg border border-slate-700 shadow-md">
              🛰️ Google Maps Satellite: {latitude.toFixed(4)}°N, {longitude.toFixed(4)}°W
            </span>
            {fetchingInsights && (
              <span className="px-3 py-1 bg-amber-500 text-slate-950 text-xs font-bold rounded-lg animate-pulse shadow-md">
                Analyzing Building & Solar Array...
              </span>
            )}
          </div>

          {/* Bottom Info Banner */}
          <div className="relative z-30 flex justify-between items-end pointer-events-none p-2">
            <span className="px-3 py-1.5 bg-blue-950/95 text-blue-200 text-xs font-semibold rounded-lg border border-blue-600/80 shadow-md">
              ⚡ {activePanelCount} Active PV Modules ({(activePanelCount * 0.400).toFixed(1)} kWp Array) | Mount: {mountType}
            </span>
            <span className="px-3 py-1.5 bg-slate-900/95 text-amber-300 text-xs font-semibold rounded-lg border border-slate-700 shadow-md">
              Area: {roofAreaSqm} m² | Tilt: {pitchDegrees}° | Azimuth: {azimuthDegrees}°
            </span>
          </div>
        </div>
      </div>

      {/* Manual Input Form */}
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400">Annual Solar Yield</span>
              <p className="text-2xl font-bold text-amber-400">{generationResult.estimated_annual_kwh.toLocaleString()} <span className="text-xs font-normal">kWh/yr</span></p>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400">Turnkey System Cost</span>
              <p className="text-2xl font-bold text-emerald-400">${economicsResult.total_system_cost.toLocaleString()}</p>
              {economicsResult.battery_cost_usd ? (
                <span className="text-[10px] text-emerald-300 font-mono block mt-1">Includes ${economicsResult.battery_cost_usd.toLocaleString()} Battery</span>
              ) : null}
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

            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400">System Architecture</span>
              <p className="text-sm font-bold text-amber-300 mt-1">{systemArchitecture}</p>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400">Mount Structure</span>
              <p className="text-sm font-bold text-blue-300 mt-1">{mountType} ({orientation})</p>
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
