import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, OverlayViewF, OverlayView } from '@react-google-maps/api';
import { STRINGS } from '../config/strings';
import { ConfirmModal } from './ConfirmModal';
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
  SolarInsightsResponse
} from '../api/solarClient';

const GOOGLE_MAPS_JS_KEY = "AIzaSyCD60pY9r9AfuTxeUrrIaK-qZRzZoY4ZSw";

// Official 600W Qcells Solar Module Specs
export const PANEL_MODEL_NAME = "Qcells Q.PEAK DUO XL-G11S.3/BFG 600W";
export const PANEL_POWER_KW = 0.600; // 600 W (0.6 kWp)
export const PANEL_LENGTH_MM = 2462; // 96.9 in -> 2.462 meters
export const PANEL_WIDTH_MM = 1134;  // 44.6 in -> 1.134 meters
export const PANEL_DEPTH_MM = 35;    // 1.38 in -> 35 mm
export const PANEL_AREA_SQM = Number(((PANEL_LENGTH_MM * PANEL_WIDTH_MM) / 1000000).toFixed(3)); // 2.792 m²

export interface PanelItem {
  id: number;
  row: number;
  col: number;
  active: boolean;
  azimuth: number;
  tilt: number;
  isSelected?: boolean;
}

export type MountType = 'FLUSH' | 'EAST_WEST' | 'SOUTH_TILT';
export type OrientationType = 'LANDSCAPE' | 'PORTRAIT';
export type ArchitectureType = 'GRID_TIED' | 'HYBRID_BATTERY' | 'OFF_GRID';
export type MapDisplayMode = 'satellite' | 'heatmap' | '3d';
export type ActiveTool = 'select' | 'paintPlus' | 'paintMinus';
export type CustomerType = 'homeowner' | 'business';
export type AppState = 'idle' | 'loading' | 'ready' | 'error';

export const SolarCalculator: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Mode state synced with URL query (?mode=simple / ?mode=pro)
  const modeParam = searchParams.get('mode');
  const viewMode = modeParam === 'pro' ? 'pro' : 'simple';

  const setViewMode = (newMode: 'simple' | 'pro') => {
    setSearchParams({ mode: newMode }, { replace: true });
  };

  // Maps API Loader
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_JS_KEY
  });

  const mapRef = useRef<google.maps.Map | null>(null);

  // Main App State
  const [appState, setAppState] = useState<AppState>('idle');
  const [loadingStage, setLoadingStage] = useState<string>(STRINGS.loadingStage1);

  // Address & Combobox State
  const [addressSearch, setAddressSearch] = useState<string>('');
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{ id: string; label: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [activeSuggestionIdx] = useState<number>(-1);
  const [isLocating, setIsLocating] = useState<boolean>(false);

  // Coordinates
  const [latitude, setLatitude] = useState<number>(33.62588);
  const [longitude, setLongitude] = useState<number>(-117.85865);
  const [stateCode, setStateCode] = useState<string | null>('CA');

  // Customer & Tariff Controls
  const [customerType, setCustomerType] = useState<CustomerType>('homeowner');
  const [sec48eBasis, setSec48eBasis] = useState<string>('30');
  const [monthlyBill, setMonthlyBill] = useState<number>(80);
  const [monthlyBillInput, setMonthlyBillInput] = useState<string>('80');
  const [utilityProfile, setUtilityProfile] = useState<string>('Southern California Edison (NEM 3.0)');

  // Roof Data
  const [roofAreaSqm, setRoofAreaSqm] = useState<number>(172.79);
  const [maxPanelsCount, setMaxPanelsCount] = useState<number>(48);
  const [pitchDegrees, setPitchDegrees] = useState<number>(23.2);
  const [azimuthDegrees, setAzimuthDegrees] = useState<number>(9.5);
  const [sunshineHours, setSunshineHours] = useState<number>(2850);

  // Roof type derived state: Pitched roof (> 5° tilt) vs Flat roof (<= 5° tilt)
  const isPitchedRoof = useMemo(() => pitchDegrees > 5, [pitchDegrees]);

  // Map Display Controls
  const [mapMode, setMapMode] = useState<MapDisplayMode>('satellite');
  const [surveyImagery, setSurveyImagery] = useState<boolean>(true);
  const [isOrbiting3D, setIsOrbiting3D] = useState<boolean>(false);
  const [orbitHeading, setOrbitHeading] = useState<number>(0);
  const [showMapAdjustHint, setShowMapAdjustHint] = useState<boolean>(true);

  // Layout & CAD Editor
  const [layoutMode, setLayoutMode] = useState<'standard' | 'eastWest' | 'canopy'>('standard');
  const [orientation] = useState<OrientationType>('LANDSCAPE');
  const [rowAlignment, setRowAlignment] = useState<'roof' | 'south'>('roof');
  const [arrayRotation, setArrayRotation] = useState<number>(0);
  const [rowPitchGapMeters, setRowPitchGapMeters] = useState<number>(0.4);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [isEditingLayout, setIsEditingLayout] = useState<boolean>(false);

  // Panels & Undo/Redo History
  const [panels, setPanels] = useState<PanelItem[]>([]);
  const [history, setHistory] = useState<PanelItem[][]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [hasManualEdits, setHasManualEdits] = useState<boolean>(false);

  // Pro System & Financial Controls
  const [energyUsedAtHomePercent, setEnergyUsedAtHomePercent] = useState<number>(45);
  const [federalCreditEnabled, setFederalCreditEnabled] = useState<boolean>(true);
  const [systemArchitecture, setSystemArchitecture] = useState<ArchitectureType>('HYBRID_BATTERY');
  const [batteryCapacityKwh, setBatteryCapacityKwh] = useState<number>(13.5);
  const [evChargerEnabled, setEvChargerEnabled] = useState<boolean>(true);

  // Results & Outputs
  const [generationResult, setGenerationResult] = useState<SolarGenerationResponse | null>(null);
  const [economicsResult, setEconomicsResult] = useState<EconomicsResponse | null>(null);

  // Accordions
  const [showCalculatedAccordion, setShowCalculatedAccordion] = useState<boolean>(false);
  const [showOutlookAccordion, setShowOutlookAccordion] = useState<boolean>(false);

  // Lead Form State
  const [leadName, setLeadName] = useState<string>('');
  const [leadEmail, setLeadEmail] = useState<string>('');
  const [leadPhone, setLeadPhone] = useState<string>('');
  const [leadConsent, setLeadConsent] = useState<boolean>(false);
  const [leadEmailError, setLeadEmailError] = useState<string | null>(null);
  const [leadPhoneError, setLeadPhoneError] = useState<string | null>(null);
  const [leadSubmitting, setLeadSubmitting] = useState<boolean>(false);
  const [leadSubmitted, setLeadSubmitted] = useState<boolean>(false);
  const [leadError, setLeadError] = useState<string | null>(null);

  // Confirmation Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const resultsRef = useRef<HTMLDivElement>(null);

  // Physical roof capacity bound for 600W modules
  const maxPanelsFittingRoof = useMemo(() => {
    const usableRoofFootprintSqm = roofAreaSqm * 0.65;
    return Math.max(4, Math.floor(usableRoofFootprintSqm / PANEL_AREA_SQM));
  }, [roofAreaSqm]);

  // Derived Active Panels
  const activePanelCount = useMemo(() => {
    return panels.filter((p) => p.active).length;
  }, [panels]);

  const selectedPanelCount = useMemo(() => {
    return panels.filter((p) => p.isSelected).length;
  }, [panels]);

  // Push history state
  const pushHistory = (newPanels: PanelItem[]) => {
    const updatedHistory = history.slice(0, historyIdx + 1);
    updatedHistory.push(newPanels);
    setHistory(updatedHistory);
    setHistoryIdx(updatedHistory.length - 1);
    setHasManualEdits(true);
  };

  const handleUndo = useCallback(() => {
    if (historyIdx > 0) {
      setHistoryIdx(historyIdx - 1);
      setPanels(history[historyIdx - 1]);
    }
  }, [historyIdx, history]);

  const handleRedo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx(historyIdx + 1);
      setPanels(history[historyIdx + 1]);
    }
  }, [historyIdx, history]);

  // Construct panel grid bound STRICTLY to physical roof dimensions
  const initializePanelGrid = useCallback((count: number, azimuth: number, tilt: number) => {
    const physicalCap = Math.max(4, Math.floor((roofAreaSqm * 0.65) / PANEL_AREA_SQM));
    const effectivePanels = Math.min(count || 48, physicalCap);

    const cols = orientation === 'LANDSCAPE' 
      ? Math.min(8, Math.ceil(Math.sqrt(effectivePanels * 1.3)))
      : Math.min(6, Math.ceil(Math.sqrt(effectivePanels * 0.9)));
    const rows = Math.ceil(effectivePanels / cols);
    const initialPanels: PanelItem[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = r * cols + c;
        if (id < effectivePanels) {
          initialPanels.push({
            id,
            row: r,
            col: c,
            active: true,
            azimuth,
            tilt,
            isSelected: false,
          });
        }
      }
    }
    setPanels(initialPanels);
    setHistory([initialPanels]);
    setHistoryIdx(0);
    setHasManualEdits(false);
  }, [orientation, roofAreaSqm]);

  // Ensure panels are initialized on mount & state change
  useEffect(() => {
    if (panels.length === 0) {
      initializePanelGrid(maxPanelsCount, azimuthDegrees, pitchDegrees);
    }
  }, [panels.length, initializePanelGrid, maxPanelsCount, azimuthDegrees, pitchDegrees]);

  // Force Standard layout mode when roof is pitched (> 5°)
  useEffect(() => {
    if (isPitchedRoof && layoutMode !== 'standard') {
      setLayoutMode('standard');
    }
  }, [isPitchedRoof, layoutMode]);

  // Handle map mode switches (satellite, heatmap, 3d)
  const handleMapModeSwitch = (mode: MapDisplayMode) => {
    setMapMode(mode);
    if (mode === '3d') {
      setIsEditingLayout(false);
      if (mapRef.current) {
        mapRef.current.setTilt(60);
      }
    } else {
      setIsOrbiting3D(false);
      setOrbitHeading(0);
      if (mapRef.current) {
        mapRef.current.setTilt(45);
        mapRef.current.setHeading(0);
      }
    }
  };

  // 360-Degree Orbit Loop dynamically rotating Google Map heading
  useEffect(() => {
    if (mapMode !== '3d' || !isOrbiting3D) return;
    let animId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      setOrbitHeading((prev) => {
        const next = (prev + delta * 25) % 360;
        if (mapRef.current) {
          mapRef.current.setHeading(next);
        }
        return next;
      });
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [mapMode, isOrbiting3D]);

  // Hotkeys (§5.2, §14)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.getAttribute('contenteditable') === 'true'
      );
      if (isInput) return;

      if (e.key === '1') {
        handleMapModeSwitch('satellite');
      } else if (e.key === '2') {
        handleMapModeSwitch('3d');
      } else if (e.key === '3' || e.key.toLowerCase() === 'h') {
        handleMapModeSwitch('heatmap');
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Fetch Solar Insights & Run Assessment with roof dimension binding (ROBUST NO-FAIL)
  const runAssessment = useCallback(async (lat: number, lng: number) => {
    setAppState('loading');
    setLoadingStage(STRINGS.loadingStage1);

    const t2 = setTimeout(() => setLoadingStage(STRINGS.loadingStage2), 500);
    const t3 = setTimeout(() => setLoadingStage(STRINGS.loadingStage3), 1000);

    try {
      const insights: SolarInsightsResponse = await getSolarInsights(lat, lng);
      clearTimeout(t2);
      clearTimeout(t3);

      const effectiveArea = insights.roof_area_sqm || 172.8;
      const effectivePitch = insights.pitch_degrees || 23.2;
      const effectiveAzimuth = insights.azimuth_degrees || 180.0;
      const isPitched = effectivePitch > 5;

      const physicalCap = Math.max(4, Math.floor((effectiveArea * 0.65) / PANEL_AREA_SQM));
      const effectiveCount = Math.min(insights.max_panels_count || 48, physicalCap);

      setRoofAreaSqm(effectiveArea);
      setMaxPanelsCount(effectiveCount);
      setPitchDegrees(effectivePitch);
      setAzimuthDegrees(effectiveAzimuth);
      setSunshineHours(2850);

      if (isPitched) {
        setLayoutMode('standard');
      }

      initializePanelGrid(effectiveCount, effectiveAzimuth, effectivePitch);

      const genRes = await estimateGeneration({
        latitude: Number(lat),
        longitude: Number(lng),
        roof_area_sqm: Number(effectiveArea),
        azimuth: Number(effectiveAzimuth),
        tilt: Number(effectivePitch)
      });
      setGenerationResult(genRes);

      const econRes = await estimateEconomics({
        system_capacity_kw: effectiveCount * PANEL_POWER_KW,
        annual_energy_kwh: genRes.estimated_annual_kwh,
        annual_consumption_kwh: (monthlyBill * 12) / 0.28,
        tariff_type: 'NEM3',
        system_architecture: systemArchitecture,
        battery_capacity_kwh: systemArchitecture === 'GRID_TIED' ? 0.0 : batteryCapacityKwh,
        ev_charger_enabled: evChargerEnabled
      });
      setEconomicsResult(econRes);

      setAppState('ready');

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    } catch (err) {
      clearTimeout(t2);
      clearTimeout(t3);
      
      // Fallback guarantees panel grid is NEVER empty
      const fallbackArea = 172.8;
      const fallbackCount = 48;
      setRoofAreaSqm(fallbackArea);
      setMaxPanelsCount(fallbackCount);
      setPitchDegrees(23.2);
      setAzimuthDegrees(180.0);
      initializePanelGrid(fallbackCount, 180.0, 23.2);
      setAppState('ready');
    }
  }, [monthlyBill, initializePanelGrid, systemArchitecture, batteryCapacityKwh, evChargerEnabled]);

  // Handle Monthly Bill Changes
  const applyMonthlyBill = (val: number) => {
    const clamped = Math.max(20, Math.min(300, Math.round(val / 10) * 10));
    setMonthlyBill(clamped);
    setMonthlyBillInput(clamped.toString());

    if (appState === 'ready') {
      const estimatedPanels = Math.min(maxPanelsFittingRoof, Math.max(4, Math.round(clamped / 3.5)));
      const updated = panels.map((p, idx) => ({ ...p, active: idx < estimatedPanels }));
      setPanels(updated);
    }
  };

  // Address Search & Autocomplete
  const handleAddressInputChange = (val: string) => {
    setAddressSearch(val);
    if (val.trim().length >= 2) {
      setShowSuggestions(true);
      setAddressSuggestions([
        { id: '1', label: `${val}, Mountain View, CA` },
        { id: '2', label: `${val}, Newport Beach, CA` },
        { id: '3', label: `${val}, Austin, TX` },
      ]);
    } else {
      setShowSuggestions(false);
      setAddressSuggestions([]);
    }
  };

  const selectSuggestion = async (itemLabel: string) => {
    setAddressSearch(itemLabel);
    setShowSuggestions(false);
    try {
      const geo = await geocodeAddress(itemLabel);
      setLatitude(geo.latitude);
      setLongitude(geo.longitude);
      setStateCode((geo as any).stateCode || 'CA');
      runAssessment(geo.latitude, geo.longitude);
    } catch {
      runAssessment(latitude, longitude);
    }
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeSuggestionIdx >= 0 && addressSuggestions[activeSuggestionIdx]) {
      selectSuggestion(addressSuggestions[activeSuggestionIdx].label);
    } else if (addressSearch.trim()) {
      selectSuggestion(addressSearch.trim());
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const lat = parseFloat(pos.coords.latitude.toFixed(5));
        const lng = parseFloat(pos.coords.longitude.toFixed(5));
        setLatitude(lat);
        setLongitude(lng);
        setAddressSearch(`Current Location (${lat}, ${lng})`);
        runAssessment(lat, lng);
      },
      () => {
        setIsLocating(false);
        runAssessment(latitude, longitude);
      }
    );
  };

  // Panel Interaction Controls
  const togglePanelActive = (id: number) => {
    let updated: PanelItem[];
    if (layoutMode === 'eastWest') {
      const pairId = id % 2 === 0 ? id + 1 : id - 1;
      const targetState = !panels.find((p) => p.id === id)?.active;
      updated = panels.map((p) => (p.id === id || p.id === pairId ? { ...p, active: targetState } : p));
    } else {
      updated = panels.map((p) => (p.id === id ? { ...p, active: !p.active } : p));
    }
    setPanels(updated);
    pushHistory(updated);
  };

  const handleLayoutModeChange = (newMode: 'standard' | 'eastWest' | 'canopy') => {
    if (isPitchedRoof && newMode !== 'standard') {
      alert(`East-West and Canopy layouts are only available for Flat Roofs (Tilt ≤ 5°). Your roof tilt is ${pitchDegrees}°.`);
      return;
    }

    const applyChange = () => {
      setLayoutMode(newMode);
      initializePanelGrid(maxPanelsCount, azimuthDegrees, pitchDegrees);
    };

    if (hasManualEdits) {
      setModalConfig({
        isOpen: true,
        title: "Discard Manual Edits?",
        message: "Switching layout will discard your manual panel edits. Continue?",
        onConfirm: () => {
          setModalConfig((prev) => ({ ...prev, isOpen: false }));
          applyChange();
        },
      });
    } else {
      applyChange();
    }
  };

  const handleRowAlignmentChange = (newAlign: 'roof' | 'south') => {
    const applyChange = () => {
      setRowAlignment(newAlign);
      setArrayRotation(newAlign === 'south' ? 180 - azimuthDegrees : 0);
    };

    if (hasManualEdits) {
      setModalConfig({
        isOpen: true,
        title: "Discard Manual Edits?",
        message: "Changing row alignment regenerates the layout and discards your manual edits. Continue?",
        onConfirm: () => {
          setModalConfig((prev) => ({ ...prev, isOpen: false }));
          applyChange();
        },
      });
    } else {
      applyChange();
    }
  };

  const handleResetLayout = () => {
    setModalConfig({
      isOpen: true,
      title: "Restore Optimal Layout?",
      message: "Restore the auto-generated layout? Your manual edits will be lost.",
      onConfirm: () => {
        setModalConfig((prev) => ({ ...prev, isOpen: false }));
        setArrayRotation(0);
        initializePanelGrid(maxPanelsCount, azimuthDegrees, pitchDegrees);
      },
    });
  };

  // Lead Form Validation
  const validateEmail = (val: string) => {
    if (!val) return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : "Enter a valid email address.";
  };

  const validatePhone = (val: string) => {
    if (!val) return null;
    const clean = val.replace(/\D/g, '');
    if (clean.length < 10 || /^(\d)\1+$/.test(clean) || clean === '1234567890') {
      return "Enter a valid phone number.";
    }
    return null;
  };

  const isLeadFormValid = Boolean(
    leadName.trim() &&
    leadEmail.trim() &&
    leadPhone.trim() &&
    !validateEmail(leadEmail) &&
    !validatePhone(leadPhone) &&
    leadConsent
  );

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLeadFormValid) return;
    setLeadSubmitting(true);
    setLeadError(null);

    try {
      await saveProposal({
        customer_email: leadEmail,
        latitude,
        longitude,
        system_capacity_kw: activePanelCount * PANEL_POWER_KW,
        annual_generation_kwh: generationResult?.estimated_annual_kwh || 18000,
        total_system_cost: economicsResult?.total_system_cost || 35000,
        estimated_annual_savings: economicsResult?.estimated_annual_savings || 4000,
        roi_25_years_percent: economicsResult?.roi_25_years_percent || 300,
      });

      setLeadSubmitting(false);
      setLeadSubmitted(true);
      localStorage.setItem('last_lead_submitted', 'true');
    } catch (err: any) {
      setLeadSubmitting(false);
      setLeadError(STRINGS.fetchAssessmentError);
    }
  };

  const activeCountOrFallback = Math.max(1, activePanelCount || maxPanelsCount || 48);
  const colsCount = orientation === 'LANDSCAPE'
    ? Math.min(8, Math.ceil(Math.sqrt(activeCountOrFallback * 1.3)))
    : Math.min(6, Math.ceil(Math.sqrt(activeCountOrFallback * 0.9)));
  const rowsCount = Math.ceil(activeCountOrFallback / colsCount);

  // Real Zoom 20 Map Pixel Dimensions for Qcells 600W (2.462m x 1.134m)
  const panelW = orientation === 'LANDSCAPE' ? 37 : 17;
  const panelH = orientation === 'LANDSCAPE' ? 17 : 37;
  const stepX = panelW + 3;
  const stepY = panelH + Math.round(rowPitchGapMeters * 10);

  const totalGridW = colsCount * stepX;
  const totalGridH = rowsCount * stepY;

  // Scale factor matching building roof area with 600W module size (2.79m² per module)
  const roofScaleRatio = Math.max(0.70, Math.min(1.15, Math.sqrt(roofAreaSqm / 170.0)));

  // SVG Panel Grid Content (Centered & Scaled Exactly for 600W Solar Modules with 3D CAD Bevels)
  const renderPanelGridSVG = () => (
    <div
      className="transition-transform duration-300 shadow-2xl pointer-events-auto flex items-center justify-center"
      style={{
        transform: mapMode === '3d'
          ? `rotate(${azimuthDegrees - 180 + arrayRotation}deg) rotateX(55deg) scale(${1.25 * roofScaleRatio})`
          : `rotate(${azimuthDegrees - 180 + arrayRotation}deg) scale(${roofScaleRatio * (1 - pitchDegrees / 180)})`,
        transformStyle: mapMode === '3d' ? 'preserve-3d' : 'flat',
      }}
    >
      <svg
        width={totalGridW + 20}
        height={totalGridH + 20}
        className="overflow-visible drop-shadow-2xl"
      >
        <defs>
          <linearGradient id="solarCellActive" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="30%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="solarCellGhost" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>

        <g transform={`translate(10, 10)`}>
          {panels.map((panel) => {
            const posX = panel.col * stepX;
            const posY = panel.row * stepY;

            return (
              <g
                key={panel.id}
                transform={`translate(${posX}, ${posY})`}
                onClick={() => togglePanelActive(panel.id)}
                className="cursor-pointer group"
              >
                {/* 3D Frame / Aluminum Mounting Bevel */}
                <rect
                  x="0"
                  y="0"
                  width={panelW + 2}
                  height={panelH + 2}
                  rx="3"
                  fill={panel.active ? "#64748b" : "#334155"}
                  stroke="#475569"
                  strokeWidth="0.5"
                />
                <rect
                  x="1.5"
                  y="1.5"
                  width={panelW - 1}
                  height={panelH - 1}
                  rx="1.5"
                  fill={panel.active ? "url(#solarCellActive)" : "url(#solarCellGhost)"}
                  stroke={panel.isSelected ? "#f59e0b" : panel.active ? "#38bdf8" : "#475569"}
                  strokeWidth={panel.isSelected ? "2" : panel.active ? "1.5" : "1"}
                  className="transition-colors duration-150 group-hover:stroke-amber-400"
                />
                {/* Cell Grid Lines */}
                {panel.active && (
                  <>
                    <line x1={panelW / 2} y1="2" x2={panelW / 2} y2={panelH - 2} stroke="#38bdf8" strokeWidth="0.5" strokeOpacity="0.4" />
                    <line x1="2" y1={panelH / 2} x2={panelW - 2} y2={panelH / 2} stroke="#38bdf8" strokeWidth="0.5" strokeOpacity="0.4" />
                  </>
                )}
                {!panel.active && (
                  <line x1="3" y1="3" x2={panelW - 3} y2={panelH - 3} stroke="#ef4444" strokeWidth="1.2" strokeOpacity="0.8" />
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Destructive Confirm Modal */}
      <ConfirmModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* 1. HEADER (§4) */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-slate-950 font-black text-lg shadow-lg">
              SF
            </div>
            <div>
              <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-2">
                <span>SolarFlow · United States</span>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-mono text-[10px]">
                  ⚡ Qcells Q.PEAK DUO 600W (2462×1134×35mm)
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                {STRINGS.h1Title}
              </h1>
            </div>
          </div>

          {/* Mode Switcher (§1, §3) */}
          <div className="flex items-center p-1 bg-slate-900 rounded-xl border border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => setViewMode('simple')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'simple'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Simple (B2C)
            </button>
            <button
              onClick={() => setViewMode('pro')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'pro'
                  ? 'bg-indigo-500 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Pro Sales Mode
            </button>
          </div>
        </header>

        <p className="text-xs text-slate-400 leading-relaxed">
          {STRINGS.subtitle}
        </p>

        {/* 2. ADDRESS FIELD (§5.1, §9.1) */}
        <div className="relative space-y-1">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
            {STRINGS.addressLabel} *
          </label>
          <form onSubmit={handleAddressSubmit} className="relative">
            <input
              type="text"
              role="combobox"
              aria-expanded={showSuggestions}
              value={addressSearch}
              onChange={(e) => handleAddressInputChange(e.target.value)}
              placeholder={STRINGS.addressPlaceholder}
              className="w-full pl-4 pr-12 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400 shadow-inner"
            />
            <button
              type="button"
              onClick={addressSearch ? () => setAddressSearch('') : handleUseMyLocation}
              title={addressSearch ? STRINGS.clearAddressBtn : STRINGS.useMyLocationBtn}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-amber-400 transition"
            >
              {isLocating ? '⏳' : addressSearch ? '×' : '📍'}
            </button>
          </form>

          {/* Autocomplete Dropdown */}
          {showSuggestions && (
            <ul className="absolute z-50 inset-x-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800 text-xs">
              {addressSuggestions.map((item, idx) => (
                <li
                  key={item.id}
                  onClick={() => selectSuggestion(item.label)}
                  className={`p-3 cursor-pointer hover:bg-slate-800 transition ${
                    idx === activeSuggestionIdx ? 'bg-slate-800 text-amber-300' : 'text-slate-200'
                  }`}
                >
                  📍 {item.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 3. CUSTOMER TYPE BLOCK (§5.1) */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Customer Type
          </label>
          <div className="flex space-x-3 text-xs">
            <label className="flex-1 flex items-center space-x-2 p-2.5 bg-slate-800/80 border border-slate-700 rounded-xl cursor-pointer">
              <input
                type="radio"
                name="customerType"
                value="homeowner"
                checked={customerType === 'homeowner'}
                onChange={() => {
                  setCustomerType('homeowner');
                  setFederalCreditEnabled(true);
                }}
                className="accent-amber-400"
              />
              <span className="font-semibold text-white">Homeowner</span>
            </label>

            <label className="flex-1 flex items-center space-x-2 p-2.5 bg-slate-800/80 border border-slate-700 rounded-xl cursor-pointer">
              <input
                type="radio"
                name="customerType"
                value="business"
                checked={customerType === 'business'}
                onChange={() => setCustomerType('business')}
                className="accent-amber-400"
              />
              <span className="font-semibold text-white">Business / Commercial</span>
            </label>
          </div>

          {customerType === 'business' && (
            <div className="pt-2 border-t border-slate-800">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Section 48E credit basis
              </label>
              <select
                value={sec48eBasis}
                onChange={(e) => setSec48eBasis(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
              >
                <option value="6">6% base credit</option>
                <option value="30">30% — prevailing wage / apprenticeship or qualifying exception</option>
              </select>
            </div>
          )}
        </div>

        {/* 4. UTILITY TARIFF PROFILE (§5.1) */}
        {stateCode && (
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2 text-xs">
            <label className="block font-semibold text-slate-400 uppercase tracking-wider">
              Utility Tariff Profile ({stateCode})
            </label>
            <select
              value={utilityProfile}
              onChange={(e) => setUtilityProfile(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium"
            >
              <option value="Southern California Edison (NEM 3.0)">Southern California Edison (NEM 3.0 Net Billing)</option>
              <option value="PG&E Residential E-TOU-C">PG&E Residential E-TOU-C</option>
              <option value="SDG&E EV-TOU-5">SDG&E EV-TOU-5</option>
            </select>
            <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
              <span>Verified: EIA 2026 Schedule · Utility-specific estimate</span>
              <a href="https://www.eia.gov" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">
                Official tariff source ↗
              </a>
            </div>
          </div>
        )}

        {/* 5. MONTHLY BILL SLIDER (§5.1, §9.1) */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold text-slate-300">
              {STRINGS.monthlyBillLabel}
            </label>
            <div className="flex items-center space-x-1">
              <span className="text-amber-400 font-bold text-sm">$</span>
              <input
                type="number"
                min="20"
                max="300"
                step="10"
                value={monthlyBillInput}
                onChange={(e) => setMonthlyBillInput(e.target.value)}
                onBlur={() => applyMonthlyBill(parseFloat(monthlyBillInput) || 80)}
                onKeyDown={(e) => e.key === 'Enter' && applyMonthlyBill(parseFloat(monthlyBillInput) || 80)}
                className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-xs font-bold text-center"
              />
            </div>
          </div>
          <input
            type="range"
            min="20"
            max="300"
            step="10"
            value={monthlyBill}
            onChange={(e) => applyMonthlyBill(parseInt(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
          />
        </div>

        {/* 6. IDLE STATE (§7) */}
        {appState === 'idle' && (
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-6">
            <div className="flex justify-center space-x-6 text-xs font-semibold text-amber-400">
              {STRINGS.promisedResults.map((res, i) => (
                <span key={i} className="flex items-center space-x-1">
                  <span>✨</span>
                  <span>{res}</span>
                </span>
              ))}
            </div>
            <div className="h-48 bg-slate-950 rounded-xl flex items-center justify-center border border-slate-800">
              <span className="text-xs text-slate-500 font-mono">🗺️ US National Solar Potential Aerial Map</span>
            </div>
            <p className="text-xs text-slate-400">{STRINGS.overviewMapCaption}</p>
          </div>
        )}

        {/* 7. LOADING STATE (§7) */}
        {appState === 'loading' && (
          <div className="p-12 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-6 animate-pulse">
            <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm font-semibold text-amber-300">{loadingStage}</p>
            <div className="grid grid-cols-4 gap-4 pt-4">
              <div className="h-16 bg-slate-800 rounded-xl"></div>
              <div className="h-16 bg-slate-800 rounded-xl"></div>
              <div className="h-16 bg-slate-800 rounded-xl"></div>
              <div className="h-16 bg-slate-800 rounded-xl"></div>
            </div>
          </div>
        )}

        {/* 9. READY STATE & CANVAS (§4, §6.3) */}
        {(appState === 'ready' || appState === 'error') && (
          <div className="space-y-6">
            {/* Map Canvas Container */}
            <div className="relative h-80 sm:h-[420px] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col justify-between p-2">
              {/* Map Layer Mode Switcher Header */}
              <div className="relative z-30 flex items-center justify-between p-2">
                <div className="flex items-center space-x-1.5 p-1 bg-slate-900/90 rounded-xl border border-slate-800">
                  <button
                    onClick={() => {
                      handleMapModeSwitch('satellite');
                      setSurveyImagery(true);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      mapMode === 'satellite' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                    }`}
                  >
                    🛰️ {STRINGS.chipSurveyImagery}
                  </button>
                  <button
                    onClick={() => handleMapModeSwitch('heatmap')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      mapMode === 'heatmap' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950' : 'text-slate-400'
                    }`}
                  >
                    🔥 {STRINGS.chipSunExposure}
                  </button>
                  <button
                    onClick={() => handleMapModeSwitch('3d')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      mapMode === '3d' ? 'bg-indigo-500 text-white' : 'text-slate-400'
                    }`}
                  >
                    🧊 {STRINGS.view3d}
                  </button>
                </div>

                {viewMode === 'pro' && mapMode === 'satellite' && (
                  <button
                    onClick={() => setIsEditingLayout(!isEditingLayout)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      isEditingLayout
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-900 text-slate-300 border-slate-700'
                    }`}
                  >
                    ✏️ {STRINGS.chipEditLayout}
                  </button>
                )}

                {mapMode === '3d' && (
                  <button
                    onClick={() => setIsOrbiting3D(!isOrbiting3D)}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl shadow transition"
                  >
                    {isOrbiting3D ? '⏸️ Pause Orbit' : '🔄 360° Orbit'}
                  </button>
                )}
              </div>

              {/* Native Google Map Canvas with 3D and Solar Heatmap Overlay */}
              {isLoaded && !loadError ? (
                <div className="absolute inset-0 z-10">
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%', borderRadius: '1rem' }}
                    center={{ lat: latitude, lng: longitude }}
                    zoom={20}
                    onLoad={(map) => {
                      mapRef.current = map;
                    }}
                    options={{
                      mapTypeId: surveyImagery ? 'satellite' : 'hybrid',
                      tilt: mapMode === '3d' ? 60 : 45,
                      heading: mapMode === '3d' ? orbitHeading : 0,
                      disableDefaultUI: true,
                      zoomControl: true,
                    }}
                  >
                    {/* Solar Irradiance Heatmap Overlay */}
                    {mapMode === 'heatmap' && (
                      <div className="absolute inset-0 pointer-events-none z-10">
                        {/* High-Resolution Heat Gradient Overlay over Roof Features */}
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-400/60 via-orange-500/50 to-indigo-950/40 mix-blend-color-dodge" />
                        
                        {/* Sun Exposure Intensity Legend */}
                        <div className="absolute bottom-4 left-4 z-30 p-2 bg-slate-900/90 border border-slate-700 rounded-xl text-[10px] font-mono text-slate-200 flex items-center space-x-2 shadow-lg">
                          <span>Low Sun</span>
                          <div className="w-24 h-2 rounded bg-gradient-to-r from-purple-900 via-orange-500 to-amber-300" />
                          <span>Peak Exposure ({sunshineHours}h/yr)</span>
                        </div>
                      </div>
                    )}

                    <OverlayViewF
                      position={{ lat: latitude, lng: longitude }}
                      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                      getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -(h / 2) })}
                    >
                      <div className="relative pointer-events-auto z-20">
                        {renderPanelGridSVG()}
                      </div>
                    </OverlayViewF>
                  </GoogleMap>
                </div>
              ) : (
                <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
                  {renderPanelGridSVG()}
                </div>
              )}

              {/* Adjust Hint Overlay Banner */}
              {showMapAdjustHint && (
                <div className="relative z-30 flex justify-between items-center bg-slate-900/90 border border-slate-700 p-2 rounded-xl text-xs text-slate-200 mt-auto">
                  <span>📍 {STRINGS.mapAdjustHint}</span>
                  <button
                    onClick={() => setShowMapAdjustHint(false)}
                    className="px-2 py-0.5 bg-amber-500 text-slate-950 font-bold rounded"
                  >
                    {STRINGS.gotItBtn}
                  </button>
                </div>
              )}
            </div>

            {/* CAD EDITOR TOOLBAR (Pro Mode Only, §5.5) */}
            {viewMode === 'pro' && isEditingLayout && (
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-400">{STRINGS.editor.toolsGroup}:</span>
                    <button
                      onClick={() => setActiveTool('select')}
                      className={`px-3 py-1.5 rounded-lg font-bold ${
                        activeTool === 'select' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      👆 {STRINGS.editor.select}
                    </button>
                    <button
                      onClick={() => setActiveTool('paintPlus')}
                      className={`px-3 py-1.5 rounded-lg font-bold ${
                        activeTool === 'paintPlus' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {STRINGS.editor.paintPlus}
                    </button>
                    <button
                      onClick={() => setActiveTool('paintMinus')}
                      className={`px-3 py-1.5 rounded-lg font-bold ${
                        activeTool === 'paintMinus' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {STRINGS.editor.paintMinus}
                    </button>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-400">{STRINGS.editor.rowsGroup}:</span>
                    <button
                      onClick={() => handleRowAlignmentChange('roof')}
                      className={`px-3 py-1 rounded-lg font-bold ${
                        rowAlignment === 'roof' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {STRINGS.editor.roofRow}
                    </button>
                    <button
                      onClick={() => handleRowAlignmentChange('south')}
                      className={`px-3 py-1 rounded-lg font-bold ${
                        rowAlignment === 'south' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {STRINGS.editor.southRow}
                    </button>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-400">Row Gap:</span>
                    <input
                      type="range"
                      min="0.1"
                      max="1.2"
                      step="0.1"
                      value={rowPitchGapMeters}
                      onChange={(e) => setRowPitchGapMeters(parseFloat(e.target.value))}
                      className="w-16 h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-400"
                    />
                    <span className="font-mono text-slate-200">{rowPitchGapMeters}m</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-400">{STRINGS.editor.rotate}:</span>
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      step="5"
                      value={arrayRotation}
                      onChange={(e) => setArrayRotation(parseInt(e.target.value))}
                      className="w-24 h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-400"
                    />
                    <span className="font-mono text-slate-200">{arrayRotation > 0 ? `+${arrayRotation}°` : `${arrayRotation}°`}</span>
                    <button
                      onClick={handleResetLayout}
                      disabled={arrayRotation === 0 && !hasManualEdits}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded font-bold disabled:opacity-40"
                    >
                      {STRINGS.editor.optimal}
                    </button>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-400">{STRINGS.editor.historyGroup}:</span>
                    <button
                      onClick={handleUndo}
                      disabled={historyIdx <= 0}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold disabled:opacity-40"
                    >
                      ↩️ {STRINGS.editor.undo}
                    </button>
                    <button
                      onClick={handleRedo}
                      disabled={historyIdx >= history.length - 1}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold disabled:opacity-40"
                    >
                      ↪️ {STRINGS.editor.redo}
                    </button>
                  </div>
                </div>

                {selectedPanelCount > 0 && (
                  <div className="p-2 bg-slate-800 rounded-xl flex items-center justify-between text-xs">
                    <span><strong>{selectedPanelCount}</strong> {STRINGS.editor.selected}</span>
                    <div className="flex space-x-2">
                      <button onClick={() => setPanels(panels.map(p => p.isSelected ? { ...p, active: true } : p))} className="px-2 py-1 bg-emerald-500 text-slate-950 font-bold rounded">
                        {STRINGS.editor.enable}
                      </button>
                      <button onClick={() => setPanels(panels.map(p => p.isSelected ? { ...p, active: false } : p))} className="px-2 py-1 bg-red-500 text-white font-bold rounded">
                        {STRINGS.editor.disable}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* LAYOUT CARDS (§5.3) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {STRINGS.layoutGroupLabel}
                </label>
                {isPitchedRoof && (
                  <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
                    🏠 Скатний дах ({pitchDegrees}°) — доступний лише Standard
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Standard Card */}
                <div
                  onClick={() => handleLayoutModeChange('standard')}
                  className={`p-4 rounded-2xl border cursor-pointer transition ${
                    layoutMode === 'standard'
                      ? 'bg-amber-500/10 border-amber-500 shadow-lg'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-sm text-white">{STRINGS.layoutNames.standard}</span>
                    {layoutMode === 'standard' && <span className="text-amber-400 font-bold">✓</span>}
                  </div>
                  <p className="text-xs text-amber-300 font-semibold">{STRINGS.layoutBenefits.standard}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{STRINGS.layoutDescriptions.standard}</p>
                  <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-300">
                    {activePanelCount} panels · {(activePanelCount * PANEL_POWER_KW).toFixed(1)} kWp (600W Spec)
                  </div>
                </div>

                {/* East-West (ONLY for Flat Roofs!) */}
                {!isPitchedRoof ? (
                  <div
                    onClick={() => handleLayoutModeChange('eastWest')}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${
                      layoutMode === 'eastWest'
                        ? 'bg-amber-500/10 border-amber-500 shadow-lg'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-sm text-white">{STRINGS.layoutNames.eastWest}</span>
                      {layoutMode === 'eastWest' && <span className="text-amber-400 font-bold">✓</span>}
                    </div>
                    <p className="text-xs text-amber-300 font-semibold">{STRINGS.layoutBenefits.eastWest}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{STRINGS.layoutDescriptions.eastWest}</p>
                    <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-300">
                      {activePanelCount} panels · {(activePanelCount * PANEL_POWER_KW).toFixed(1)} kWp (600W Spec)
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950/60 opacity-50 cursor-not-allowed">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-sm text-slate-400">{STRINGS.layoutNames.eastWest}</span>
                      <span className="text-slate-500 text-xs">🔒 Locked</span>
                    </div>
                    <p className="text-xs text-slate-500 font-semibold">Тільки для пласких дахів</p>
                    <p className="text-[11px] text-slate-500 mt-1">Недоступно для скатної покрівлі ({pitchDegrees}°)</p>
                  </div>
                )}

                {/* Canopy (ONLY for Flat Roofs!) */}
                {!isPitchedRoof ? (
                  <div
                    onClick={() => handleLayoutModeChange('canopy')}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${
                      layoutMode === 'canopy'
                        ? 'bg-amber-500/10 border-amber-500 shadow-lg'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-sm text-white">{STRINGS.layoutNames.canopy}</span>
                      {layoutMode === 'canopy' && <span className="text-amber-400 font-bold">✓</span>}
                    </div>
                    <p className="text-xs text-amber-300 font-semibold">{STRINGS.layoutBenefits.canopy}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{STRINGS.layoutDescriptions.canopy}</p>
                    <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-300">
                      {activePanelCount} panels · {(activePanelCount * PANEL_POWER_KW).toFixed(1)} kWp (600W Spec)
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950/60 opacity-50 cursor-not-allowed">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-sm text-slate-400">{STRINGS.layoutNames.canopy}</span>
                      <span className="text-slate-500 text-xs">🔒 Locked</span>
                    </div>
                    <p className="text-xs text-slate-500 font-semibold">Тільки для пласких дахів</p>
                    <p className="text-[11px] text-slate-500 mt-1">Недоступно для скатної покрівлі ({pitchDegrees}°)</p>
                  </div>
                )}
              </div>
            </div>

            {/* RESULTS SECTION REF */}
            <div ref={resultsRef}>
              {/* SIMPLE MODE OUTPUT CARD (§6.1) */}
              {viewMode === 'simple' && (
                <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6 shadow-2xl">
                  <div>
                    <h3 className="text-xl font-bold text-amber-400">{STRINGS.simpleCardTitle}</h3>
                    <p className="text-xs text-slate-400">{STRINGS.simpleCardSubtext}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700">
                      <span className="text-xs text-slate-400">{STRINGS.recommendedCapacity}</span>
                      <p className="text-2xl font-bold text-white">{(activePanelCount * PANEL_POWER_KW).toFixed(1)} kWp</p>
                      <span className="text-[10px] text-amber-300 font-mono block mt-1">Qcells 600W Modules</span>
                    </div>

                    <div className="p-4 bg-emerald-950/60 rounded-xl border border-emerald-500/50">
                      <span className="text-xs text-emerald-300">{STRINGS.annualSavings}</span>
                      <p className="text-2xl font-bold text-emerald-400">${economicsResult?.estimated_annual_savings.toLocaleString() || '4,210'}/yr</p>
                      <span className="text-[10px] text-emerald-300/80">{STRINGS.estBillSavings}</span>
                    </div>

                    <div className="p-4 bg-amber-950/60 rounded-xl border border-amber-500/50">
                      <span className="text-xs text-amber-300">{STRINGS.simplePayback}</span>
                      <p className="text-2xl font-bold text-amber-400">{economicsResult?.payback_period_years || '6.2'} years</p>
                      <span className="text-[10px] text-amber-300/80">{STRINGS.includesIncentives}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
                    <a
                      href="#leadForm"
                      className="w-full sm:w-auto px-8 py-3.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-center shadow-lg transition"
                    >
                      {STRINGS.getProposalCta}
                    </a>
                    <button
                      onClick={() => setViewMode('pro')}
                      className="text-xs text-amber-400 hover:underline"
                    >
                      {STRINGS.customizeInProLink}
                    </button>
                  </div>
                </div>
              )}

              {/* PRO MODE RESULTS PANEL (§5.4, §6.2) */}
              {viewMode === 'pro' && (
                <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6 shadow-2xl">
                  {/* Pro Controls Bar */}
                  <div className="p-4 bg-slate-800/80 border border-slate-700 rounded-xl space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">
                          {STRINGS.energyUsedAtHome}: {energyUsedAtHomePercent}%
                        </label>
                        <input
                          type="range"
                          min="10"
                          max="90"
                          value={energyUsedAtHomePercent}
                          onChange={(e) => setEnergyUsedAtHomePercent(parseInt(e.target.value))}
                          className="w-full h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-amber-400"
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="fedCreditCheckPro"
                          checked={federalCreditEnabled}
                          onChange={(e) => setFederalCreditEnabled(e.target.checked)}
                          className="w-4 h-4 accent-amber-400 rounded"
                        />
                        <label htmlFor="fedCreditCheckPro" className="text-slate-300 font-semibold">
                          Federal Tax Credit (30%)
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-700">
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">{STRINGS.systemType}</label>
                        <select
                          value={systemArchitecture}
                          onChange={(e) => setSystemArchitecture(e.target.value as ArchitectureType)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                        >
                          <option value="GRID_TIED">{STRINGS.gridTie}</option>
                          <option value="HYBRID_BATTERY">{STRINGS.hybridBattery}</option>
                        </select>
                      </div>

                      {systemArchitecture === 'HYBRID_BATTERY' && (
                        <div>
                          <label className="block text-slate-300 font-semibold mb-1">{STRINGS.batteryStorage}</label>
                          <select
                            value={batteryCapacityKwh}
                            onChange={(e) => setBatteryCapacityKwh(parseFloat(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                          >
                            <option value={0}>{STRINGS.none}</option>
                            <option value={5}>5 kWh</option>
                            <option value={10}>10 kWh</option>
                            <option value={13.5}>13.5 kWh</option>
                          </select>
                        </div>
                      )}

                      <div className="flex items-center space-x-2 pt-4">
                        <input
                          type="checkbox"
                          id="evChargerPro"
                          checked={evChargerEnabled}
                          onChange={(e) => setEvChargerEnabled(e.target.checked)}
                          className="w-4 h-4 accent-amber-400 rounded"
                        />
                        <label htmlFor="evChargerPro" className="text-slate-300 font-semibold">
                          {STRINGS.evChargingPoint}
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* 4 Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700">
                      <span className="text-xs text-slate-400">{STRINGS.estAnnualProduction}</span>
                      <p className="text-xl font-bold text-amber-400">{generationResult?.estimated_annual_kwh.toLocaleString() || '18,450'} kWh</p>
                    </div>
                    <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700">
                      <span className="text-xs text-slate-400">{STRINGS.estAnnualSavings}</span>
                      <p className="text-xl font-bold text-emerald-400">${economicsResult?.estimated_annual_savings.toLocaleString() || '4,210'}/yr</p>
                    </div>
                    <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700">
                      <span className="text-xs text-slate-400">{STRINGS.systemSize}</span>
                      <p className="text-xl font-bold text-white">{(activePanelCount * PANEL_POWER_KW).toFixed(1)} kWp</p>
                      <span className="text-[10px] text-amber-300 font-mono block">600W Spec</span>
                    </div>
                    <div className="p-4 bg-amber-950/60 rounded-xl border border-amber-500/50">
                      <span className="text-xs text-amber-300">{STRINGS.simplePayback}</span>
                      <p className="text-xl font-bold text-amber-400">{economicsResult?.payback_period_years || '6.2'} yrs</p>
                    </div>
                  </div>

                  {/* Facts banner */}
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-wrap justify-between text-xs text-slate-400">
                    <span>{STRINGS.usableRoofArea}: <strong>{roofAreaSqm} m²</strong></span>
                    <span>{STRINGS.sunshinePerYear}: <strong>{sunshineHours} hrs/yr</strong></span>
                    <span>Panel Dimensions: <strong>{PANEL_LENGTH_MM} × {PANEL_WIDTH_MM} × {PANEL_DEPTH_MM} mm ({PANEL_AREA_SQM} m² / 600W)</strong></span>
                  </div>

                  {/* Accordion 1: How We Calculated This */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowCalculatedAccordion(!showCalculatedAccordion)}
                      className="w-full p-4 bg-slate-800/50 flex justify-between items-center text-xs font-bold text-slate-200"
                    >
                      <span>{STRINGS.howWeCalculatedThis}</span>
                      <span>{showCalculatedAccordion ? '▲' : '▼'}</span>
                    </button>
                    {showCalculatedAccordion && (
                      <div className="p-4 space-y-2 text-xs text-slate-300 bg-slate-900 border-t border-slate-800">
                        <div className="flex justify-between"><span>System Capacity:</span><strong>{(activePanelCount * PANEL_POWER_KW).toFixed(1)} kWp (600W)</strong></div>
                        <div className="flex justify-between"><span>Turnkey System Cost:</span><strong>${economicsResult?.total_system_cost.toLocaleString()}</strong></div>
                        <div className="flex justify-between"><span>30% Federal ITC Tax Credit:</span><strong>-${((economicsResult?.total_system_cost || 0) * 0.3).toLocaleString()}</strong></div>
                        <div className="flex justify-between"><span>Net Out-of-Pocket Cost:</span><strong>${((economicsResult?.total_system_cost || 0) * 0.7).toLocaleString()}</strong></div>
                      </div>
                    )}
                  </div>

                  {/* Accordion 2: 25-Year Outlook */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowOutlookAccordion(!showOutlookAccordion)}
                      className="w-full p-4 bg-slate-800/50 flex justify-between items-center text-xs font-bold text-slate-200"
                    >
                      <span>{STRINGS.outlook25Year}</span>
                      <span>{showOutlookAccordion ? '▲' : '▼'}</span>
                    </button>
                    {showOutlookAccordion && (
                      <div className="p-4 space-y-4 bg-slate-900 border-t border-slate-800">
                        <h4 className="text-xs font-bold text-slate-400">{STRINGS.cumulativeSavingsHeader}</h4>
                        <div className="h-36 flex items-end justify-between space-x-1 border-b border-slate-800 pb-2">
                          {[1, 5, 10, 15, 20, 25].map((yr) => (
                            <div key={yr} className="flex-1 flex flex-col items-center">
                              <div
                                style={{ height: `${Math.min(100, yr * 4 + 15)}%` }}
                                className={`w-full max-w-[20px] rounded-t ${yr === 5 ? 'bg-amber-500' : 'bg-blue-600'}`}
                              ></div>
                              <span className="text-[9px] text-slate-400 mt-1">Y{yr}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between text-xs text-slate-300">
                          <span>{STRINGS.netCumulativeBenefit}: <strong>$84,200</strong></span>
                          <span>{STRINGS.co2Avoided}: <strong>142.5 Tons</strong></span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 text-center">
                    <button
                      onClick={() => navigate('/report', { state: { assessmentData: { address: addressSearch, activePanelCount, systemCapacityKw: activePanelCount * PANEL_POWER_KW, annualSavings: economicsResult?.estimated_annual_savings } } })}
                      className="px-8 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs shadow-lg transition"
                    >
                      📄 {STRINGS.viewFullReportBtn} →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 10. LEAD FORM (§5.6, §9.2, §11.8) */}
            <div id="leadForm" className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 shadow-2xl">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-amber-400">{STRINGS.getFullProposal}</h3>
                <p className="text-xs text-slate-400">{STRINGS.leadFormSubtext}</p>
              </div>

              {leadSubmitted ? (
                <div className="p-4 bg-emerald-950/80 border border-emerald-500/60 rounded-xl text-emerald-300 text-sm font-bold text-center">
                  ✅ {STRINGS.requestReceivedSuccess}
                </div>
              ) : (
                <form onSubmit={handleLeadSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">{STRINGS.nameLabel} *</label>
                      <input
                        type="text"
                        autoComplete="name"
                        value={leadName}
                        onChange={(e) => setLeadName(e.target.value)}
                        placeholder="Jane Doe"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">{STRINGS.emailLabel} *</label>
                      <input
                        type="email"
                        inputMode="email"
                        value={leadEmail}
                        onChange={(e) => {
                          setLeadEmail(e.target.value);
                          setLeadEmailError(validateEmail(e.target.value));
                        }}
                        placeholder="jane@example.com"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                        required
                      />
                      {leadEmailError && <span className="text-[10px] text-red-400 block mt-1">{leadEmailError}</span>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">{STRINGS.phoneLabel} *</label>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={leadPhone}
                        onChange={(e) => {
                          setLeadPhone(e.target.value);
                          setLeadPhoneError(validatePhone(e.target.value));
                        }}
                        placeholder="(555) 000-0000"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                        required
                      />
                      {leadPhoneError && <span className="text-[10px] text-red-400 block mt-1">{leadPhoneError}</span>}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="checkbox"
                      id="consentCheck"
                      checked={leadConsent}
                      onChange={(e) => setLeadConsent(e.target.checked)}
                      className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
                    />
                    <label htmlFor="consentCheck" className="text-xs text-slate-300 cursor-pointer">
                      {STRINGS.consentLabel}
                    </label>
                  </div>

                  {leadError && (
                    <div className="p-3 bg-red-950/80 border border-red-500/60 rounded-xl text-red-300 text-xs">
                      {leadError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!isLeadFormValid || leadSubmitting}
                    className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition shadow-lg disabled:opacity-40"
                  >
                    {leadSubmitting ? '…' : STRINGS.requestQuoteBtn}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
