import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, OverlayViewF, OverlayView } from '@react-google-maps/api';
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

// Active Google Maps API Key
const GOOGLE_MAPS_JS_KEY = "AIzaSyCD60pY9r9AfuTxeUrrIaK-qZRzZoY4ZSw";

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
export type MapDisplayMode = 'satellite' | 'heatmap' | '3d';
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
  
  // Map Layer Display Modes: Satellite vs Heatmap vs 3D Perspective
  const [mapMode, setMapMode] = useState<MapDisplayMode>('satellite');

  // 3D Orbital Auto-Rotation state
  const [isOrbiting3D, setIsOrbiting3D] = useState<boolean>(false);
  const [orbitHeading, setOrbitHeading] = useState<number>(0);

  // Layout Placement Options
  const [mountType, setMountType] = useState<MountType>('FLUSH');
  const [orientation, setOrientation] = useState<OrientationType>('LANDSCAPE');
  const [rowPitchGapMeters, setRowPitchGapMeters] = useState<number>(0.4);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');

  // System Architecture & Hybrid Storage Options
  const [systemArchitecture, setSystemArchitecture] = useState<ArchitectureType>('HYBRID_BATTERY');
  const [batteryCapacityKwh, setBatteryCapacityKwh] = useState<number>(13.5);
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

  // Construct panel grid layout array matching panel count
  const initializePanelGrid = useCallback((count: number, azimuth: number, tilt: number) => {
    const validCount = Math.max(1, count || 88);
    const cols = orientation === 'LANDSCAPE' 
      ? Math.min(12, Math.ceil(Math.sqrt(validCount * 1.5)))
      : Math.min(10, Math.ceil(Math.sqrt(validCount * 1.1)));
    const rows = Math.ceil(validCount / cols);
    const initialPanels: PanelItem[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = r * cols + c;
        if (id < validCount) {
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

  // Ensure panel grid is populated if empty
  useEffect(() => {
    if (panels.length === 0) {
      initializePanelGrid(maxPanelsCount || 88, azimuthDegrees || 180, pitchDegrees || 20);
    }
  }, [panels.length, maxPanelsCount, azimuthDegrees, pitchDegrees, initializePanelGrid]);

  // 360-Degree Orbital Auto-Rotation Animation Loop for 3D Mode
  useEffect(() => {
    if (mapMode !== '3d' || !isOrbiting3D) return;
    let animId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      setOrbitHeading((prev) => (prev + delta * 25) % 360);
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [mapMode, isOrbiting3D]);

  // 1. Fetch Google Solar Insights & Auto-Calculate when Coordinates Change
  const fetchInsightsAndCalculate = useCallback(async (lat: number, lng: number) => {
    setFetchingInsights(true);
    setInsightsNotice(null);
    try {
      const insights: SolarInsightsResponse = await getSolarInsights(lat, lng);
      const effectiveMaxCount = insights.max_panels_count || 88;
      const effectiveArea = insights.roof_area_sqm || 170.0;
      const effectivePitch = insights.pitch_degrees || 20.0;
      const effectiveAzimuth = insights.azimuth_degrees || 180.0;

      setRoofAreaSqm(effectiveArea);
      setMaxPanelsCount(effectiveMaxCount);
      setPitchDegrees(effectivePitch);
      setAzimuthDegrees(effectiveAzimuth);

      initializePanelGrid(effectiveMaxCount, effectiveAzimuth, effectivePitch);

      if (insights.is_fallback) {
        setInsightsNotice(
          '📍 Google Solar API imagery coverage is limited for this exact building. Default estimated values were applied. You may adjust roof area manually.'
        );
      } else {
        setInsightsNotice(
          `✨ High-resolution Google Solar Building Insights applied! Max Roof Area: ${effectiveArea} m² (${effectiveMaxCount} panels max). Solar panels anchored directly to roof.`
        );
      }

      // Calculate Solar Generation
      const genRes = await estimateGeneration({
        latitude: Number(lat),
        longitude: Number(lng),
        roof_area_sqm: Number(effectiveArea),
        azimuth: Number(effectiveAzimuth),
        tilt: Number(effectivePitch)
      });
      setGenerationResult(genRes);

      const systemCapacityKw = effectiveMaxCount * 0.400;

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
      setInsightsNotice('⚠️ Applied default estimated rooftop panel layout for this address.');
      initializePanelGrid(88, 180, 20);
      try {
        const genRes = await estimateGeneration({
          latitude: Number(lat),
          longitude: Number(lng),
          roof_area_sqm: 170.0,
          azimuth: 180.0,
          tilt: 20.0
        });
        setGenerationResult(genRes);
        const econRes = await estimateEconomics({
          system_capacity_kw: 88 * 0.400,
          annual_energy_kwh: genRes.estimated_annual_kwh,
          annual_consumption_kwh: Number(annualConsumptionKwh),
          tariff_type: 'NEM3',
          system_architecture: systemArchitecture,
          battery_capacity_kwh: systemArchitecture === 'GRID_TIED' ? 0.0 : batteryCapacityKwh,
          ev_charger_enabled: evChargerEnabled
        });
        setEconomicsResult(econRes);
      } catch (innerErr) {
        console.error("Fallback generation error:", innerErr);
      }
    } finally {
      setFetchingInsights(false);
    }
  }, [annualConsumptionKwh, initializePanelGrid, systemArchitecture, batteryCapacityKwh, evChargerEnabled]);

  useEffect(() => {
    fetchInsightsAndCalculate(latitude, longitude);
  }, [latitude, longitude, fetchInsightsAndCalculate]);

  // Recalculate financial yield when active panels change
  const handleRecalculateActivePanels = useCallback(async (activeCount: number) => {
    const validCount = Math.max(1, activeCount);
    const scaledArea = validCount * (orientation === 'LANDSCAPE' ? 1.7 : 1.75);
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

      const systemCapacityKw = validCount * 0.400;
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

  // Handle Click Anywhere on Satellite Map to Select Different Building Roof
  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      const clickedLat = parseFloat(e.latLng.lat().toFixed(5));
      const clickedLng = parseFloat(e.latLng.lng().toFixed(5));
      setLatitude(clickedLat);
      setLongitude(clickedLng);
      setAddressSearch(`Selected Building Roof (${clickedLat}, ${clickedLng})`);
    }
  };

  // Perform Clean Geocoding Search
  const performGeocodeSearch = async (targetAddress: string) => {
    if (!targetAddress.trim()) return;
    setFetchingInsights(true);
    setError(null);
    try {
      const geo = await geocodeAddress(targetAddress.trim());
      setLatitude(geo.latitude);
      setLongitude(geo.longitude);
      setAddressSearch(geo.formatted_address);
    } catch (err: any) {
      setError(`Address Search Notice: Could not resolve location for "${targetAddress}". Please verify street address.`);
      setFetchingInsights(false);
    }
  };

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
    initializePanelGrid(maxPanelsCount || 88, azimuthDegrees, pitchDegrees);
    handleRecalculateActivePanels(maxPanelsCount || 88);
  };

  const handlePanelSliderChange = (count: number) => {
    const validCount = Math.max(1, Math.min(maxPanelsCount || 120, count));
    let updated = panels;
    if (panels.length < validCount) {
      const cols = orientation === 'LANDSCAPE' 
        ? Math.min(12, Math.ceil(Math.sqrt(validCount * 1.5)))
        : Math.min(10, Math.ceil(Math.sqrt(validCount * 1.1)));
      const rows = Math.ceil(validCount / cols);
      const newPanels: PanelItem[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const id = r * cols + c;
          if (id < validCount) {
            newPanels.push({
              id,
              row: r,
              col: c,
              active: true,
              azimuth: azimuthDegrees,
              tilt: pitchDegrees
            });
          }
        }
      }
      updated = newPanels;
    } else {
      updated = panels.map((p, idx) => ({ ...p, active: idx < validCount }));
    }
    setPanels(updated);
    handleRecalculateActivePanels(validCount);
  };

  const handleAddSinglePanel = () => {
    const nextCount = Math.min(maxPanelsCount || 120, (activePanelCount || 1) + 1);
    handlePanelSliderChange(nextCount);
  };

  const handleSubtractSinglePanel = () => {
    const nextCount = Math.max(1, (activePanelCount || 1) - 1);
    handlePanelSliderChange(nextCount);
  };

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

  const handleAddressSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performGeocodeSearch(addressSearch);
  };

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

  const activeCountOrFallback = Math.max(1, activePanelCount || maxPanelsCount || 88);
  const colsCount = orientation === 'LANDSCAPE'
    ? Math.min(12, Math.ceil(Math.sqrt(activeCountOrFallback * 1.5)))
    : Math.min(10, Math.ceil(Math.sqrt(activeCountOrFallback * 1.1)));
  const rowsCount = Math.ceil(activeCountOrFallback / colsCount);

  // SVG Panel Grid Content
  const renderPanelGridSVG = () => (
    <div
      className="transition-transform duration-500 shadow-2xl pointer-events-auto"
      style={{
        transform: mapMode === '3d'
          ? `rotate(${azimuthDegrees - 180 + orbitHeading}deg) rotateX(45deg) scale(1.15)`
          : `rotate(${azimuthDegrees - 180}deg) scale(${1 - pitchDegrees / 180})`,
      }}
    >
      <svg
        width={Math.min(520, colsCount * (orientation === 'LANDSCAPE' ? 40 : 30))}
        height={Math.min(380, rowsCount * (orientation === 'LANDSCAPE' ? 30 : 54))}
        className="overflow-visible drop-shadow-2xl"
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
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
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
  );

  return (
    <div className="max-w-7xl mx-auto p-6 bg-slate-900 text-slate-100 rounded-2xl shadow-2xl border border-slate-800 my-8">
      {/* Top Navigation & App Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <span className="text-4xl">☀️</span>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-amber-400">SolarFlow CAD Pro & Roof Anchored Array Engine</h2>
            <p className="text-slate-400 text-sm">Panels Anchored Directly to Building Roof via High-Res Satellite View</p>
          </div>
        </div>

        {/* 3 MAP DISPLAY LAYER MODES: Satellite vs Solar Flux Heatmap vs 3D Roof Model */}
        <div className="flex items-center space-x-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            onClick={() => setMapMode('satellite')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              mapMode === 'satellite'
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow'
                : 'bg-transparent text-slate-400 border-transparent hover:text-white'
            }`}
          >
            🛰️ High-Res Satellite Map
          </button>

          <button
            onClick={() => setMapMode('heatmap')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              mapMode === 'heatmap'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 border-amber-400 font-bold shadow'
                : 'bg-transparent text-slate-400 border-transparent hover:text-white'
            }`}
          >
            🔥 Solar Flux Heatmap
          </button>

          <button
            onClick={() => setMapMode('3d')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              mapMode === '3d'
                ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white border-indigo-400 font-bold shadow'
                : 'bg-transparent text-slate-400 border-transparent hover:text-white'
            }`}
          >
            🧊 3D Solar Roof Model
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-amber-900/40 border border-amber-500/50 rounded-xl text-amber-200 text-sm">
          <strong>Notice:</strong> {error}
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

          {/* Panel Count Adjustment Controls (+ / - & Slider) */}
          <div className="p-4 bg-slate-800/90 rounded-xl border border-slate-700 space-y-3">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-300">Active Solar Modules</span>
              
              {/* Simple Mode + / - Buttons */}
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={handleSubtractSinglePanel}
                  disabled={activePanelCount <= 1}
                  title="Subtract 1 panel"
                  className="w-6 h-6 flex items-center justify-center bg-slate-900 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded font-bold text-sm disabled:opacity-40"
                >
                  −
                </button>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md font-mono text-xs font-bold">
                  {activePanelCount} / {maxPanelsCount}
                </span>
                <button
                  type="button"
                  onClick={handleAddSinglePanel}
                  disabled={activePanelCount >= maxPanelsCount}
                  title="Add 1 panel"
                  className="w-6 h-6 flex items-center justify-center bg-amber-500 hover:bg-amber-600 text-slate-950 rounded font-bold text-sm disabled:opacity-40"
                >
                  +
                </button>
              </div>
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

        {/* Native Google Maps JavaScript API Satellite / Heatmap / 3D Canvas Container */}
        <div className="lg:col-span-2 relative h-96 lg:h-[500px] rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 flex flex-col justify-between p-2 shadow-2xl">
          {mapMode === 'satellite' ? (
            isLoaded && !loadError ? (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%', borderRadius: '1rem' }}
                center={{ lat: latitude, lng: longitude }}
                zoom={20}
                onClick={handleMapClick}
                options={{
                  mapTypeId: 'satellite',
                  tilt: 45,
                  disableDefaultUI: true,
                  zoomControl: true,
                  rotateControl: true
                }}
              >
                <OverlayViewF
                  position={{ lat: latitude, lng: longitude }}
                  mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                  getPixelPositionOffset={(width, height) => ({
                    x: -(width / 2),
                    y: -(height / 2)
                  })}
                >
                  <div className="relative pointer-events-auto">
                    {renderPanelGridSVG()}
                  </div>
                </OverlayViewF>
              </GoogleMap>
            ) : (
              /* Fallback High-Resolution Satellite Map Tile Container with Anchored SVG Panels */
              <div
                className="absolute inset-0 bg-cover bg-center rounded-2xl overflow-hidden cursor-crosshair flex items-center justify-center"
                style={{
                  backgroundImage: `url('https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=20&size=800x600&maptype=satellite&key=${GOOGLE_MAPS_JS_KEY}')`
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const dx = (e.clientX - rect.left - rect.width / 2) / rect.width;
                  const dy = (e.clientY - rect.top - rect.height / 2) / rect.height;
                  const newLat = parseFloat((latitude - dy * 0.001).toFixed(5));
                  const newLng = parseFloat((longitude + dx * 0.001).toFixed(5));
                  setLatitude(newLat);
                  setLongitude(newLng);
                }}
              >
                <div className="relative pointer-events-auto">
                  {renderPanelGridSVG()}
                </div>
              </div>
            )
          ) : mapMode === 'heatmap' ? (
            /* Solar Flux Irradiance Thermal Heatmap Layer */
            <div className="absolute inset-0 bg-slate-950 overflow-hidden rounded-2xl flex items-center justify-center">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-50"
                style={{
                  backgroundImage: `url('https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=20&size=800x600&maptype=satellite&key=${GOOGLE_MAPS_JS_KEY}')`
                }}
              ></div>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/80 via-red-600/60 to-blue-900/40 pointer-events-none"></div>
              <div className="absolute top-4 left-4 z-30 px-3 py-1.5 bg-slate-900/90 border border-amber-500/50 rounded-lg text-amber-300 text-xs font-mono">
                🔥 Google Solar Flux Heatmap Active (&gt;1400 kWh/m²/yr Irradiance Zone)
              </div>
              <div className="relative z-20 pointer-events-auto">
                {renderPanelGridSVG()}
              </div>
            </div>
          ) : (
            /* 3D Roof Model Perspective View with 360-Degree Orbital Auto-Rotation */
            <div className="absolute inset-0 bg-slate-950 overflow-hidden rounded-2xl flex items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:28px_28px] opacity-25"></div>
              <div className="absolute top-4 left-4 z-30 flex items-center space-x-2">
                <span className="px-3 py-1.5 bg-indigo-950/90 border border-indigo-500/50 rounded-lg text-indigo-300 text-xs font-mono">
                  🧊 3D Solar Roof Mesh & PV Array Perspective View
                </span>
                <button
                  type="button"
                  onClick={() => setIsOrbiting3D((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    isOrbiting3D
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                      : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {isOrbiting3D ? '⏸️ Pause 360° Orbit' : '🔄 Auto-Rotate 360°'}
                </button>
              </div>
              <div className="absolute inset-0 flex items-center justify-center p-4">
                {renderPanelGridSVG()}
              </div>
            </div>
          )}

          {/* Top Info Banner */}
          <div className="relative z-30 flex justify-between items-start pointer-events-none p-2">
            <span className="px-3 py-1 bg-slate-900/95 text-slate-200 text-xs font-mono rounded-lg border border-slate-700 shadow-md">
              🛰️ Roof Center: {latitude.toFixed(4)}°N, {longitude.toFixed(4)}°W
            </span>
            <span className="px-3 py-1 bg-amber-500/90 text-slate-950 text-xs font-bold rounded-lg shadow-md">
              💡 Click map to pick another building roof
            </span>
          </div>

          {/* Bottom Info Banner */}
          <div className="relative z-30 flex justify-between items-end pointer-events-none p-2">
            <span className="px-3 py-1.5 bg-blue-950/95 text-blue-200 text-xs font-semibold rounded-lg border border-blue-600/80 shadow-md">
              ⚡ {activePanelCount} Active PV Modules ({(activePanelCount * 0.400).toFixed(1)} kWp Array) | Layer: {mapMode.toUpperCase()}
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
              <span className="text-xs text-slate-400">30% Federal ITC Tax Credit</span>
              <p className="text-2xl font-bold text-teal-400">${(economicsResult.total_system_cost * 0.30).toLocaleString()}</p>
              <span className="text-[10px] text-teal-300 font-mono block mt-1">Net Cost: ${(economicsResult.total_system_cost * 0.70).toLocaleString()}</span>
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
              <span className="text-xs text-slate-400">25-Year CO2 Offset</span>
              <p className="text-2xl font-bold text-green-400">{economicsResult.co2_saved_tons_25_years ?? 0} <span className="text-xs font-normal">Tons</span></p>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400">Annual O&M Benchmark</span>
              <p className="text-lg font-bold text-slate-300 mt-1">${economicsResult.annual_om_cost_usd ?? 0}/yr <span className="text-[10px] font-normal text-slate-400">($30/kW)</span></p>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400">Year 12 Inverter Replace</span>
              <p className="text-lg font-bold text-slate-300 mt-1">${economicsResult.inverter_replacement_cost_usd ?? 0} <span className="text-[10px] font-normal text-slate-400">($150/kW)</span></p>
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
